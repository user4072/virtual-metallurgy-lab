"""
main.py — FastAPI app for the heat-treatment-service (port 8001).

All endpoints:
  GET  /health
  GET  /presets
  GET  /databases
  POST /run
  POST /ttt
  POST /cct
  POST /optimize
  POST /predict

Every endpoint wraps its body in try/except and returns {ok: bool, ...}.
CORS allows all origins.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from kinetics import (
    compute_transformation,
    fe_c_critical_temperatures,
    generate_cct,
    generate_ttt,
    grain_growth,
    hollomon_jaffe,
)
from ml_surrogate import predict as ml_predict
from models import (
    Alloy,
    CctRequest,
    OptimizeRequest,
    PredictRequest,
    RunRequest,
    TttRequest,
)
from optimization import (
    DEFAULT_PARAM_SPACE,
    bayesian_optimize,
    genetic_optimize,
    grid_optimize,
    nsga2_multiobjective,
    random_optimize,
)
from presets import PRESETS, preset_list
from properties import mechanical_properties, physical_properties
from thermodynamics import equilibrium_phases, is_pycalphad_reachable
from viz import (
    format_phase_evolution,
    format_processing_history,
    format_temperature_profile,
)
from workflow import (
    build_temperature_profile,
    expand_cycles,
    resolve_cooling_rate,
    validate_workflow,
    workflow_summary,
)

VERSION = "1.0.0"
SERVICE = "heat-treatment-service"

app = FastAPI(title="Heat Treatment Service", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _safe_run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _run_simulation(alloy: Alloy, workflow, options) -> Dict[str, Any]:
    """Core forward simulation."""
    steps = workflow.steps or []
    validation = validate_workflow(steps)
    expanded = expand_cycles(steps)
    profile = build_temperature_profile(steps)

    sys_id = alloy.system
    comp = alloy.composition or {"C": 0.4}

    # Pick the "final" temperature (last cool segment drops to ~25 °C, but for
    # microstructure we use the LAST non-cooling step's target temperature —
    # typically the temper / ageing temperature.)
    temper_T = 0.0
    temper_time = 0.0
    for s in reversed(expanded):
        if s.process in {"temper", "age"}:
            temper_T = s.target_temp_c
            temper_time = s.holding_time_min
            break

    # Effective cooling rate from the first quench-like step
    cr_K_per_min = 60.0
    cr_step_name = "default"
    for s in expanded:
        if s.cooling_method in {"water_quench", "oil_quench", "polymer_quench", "gas_quench"}:
            cr_K_per_min = resolve_cooling_rate(s)
            cr_step_name = s.cooling_method
            break
        if s.cooling_method == "controlled":
            cr_K_per_min = resolve_cooling_rate(s)
            cr_step_name = s.cooling_method
            break
    cr_K_per_s = cr_K_per_min / 60.0

    # Austenitization T (highest austenitize/solution step)
    aus_T = 25.0
    hold_time = 30.0
    for s in expanded:
        if s.process in {"austenitize", "solution_treat"}:
            aus_T = max(aus_T, s.target_temp_c)
            hold_time = s.holding_time_min
            break

    # Phase fractions at end of quench (T=25)
    if sys_id == "Fe-C":
        phases = compute_transformation(comp, T_final_C=25.0, cooling_rate_K_per_s=cr_K_per_s)
        # Tempering: tempered martensite is still martensite (with fine
        # carbides). Only a small fraction decomposes to ferrite+cementite at
        # high temper T / long time. Use HJP to gauge decomposition progress.
        if temper_T > 0:
            m = phases.get("martensite", 0.0)
            hjp = hollomon_jaffe(temper_T, temper_time)
            # Decomposition fraction: ~0% at HJP<14000, ~30% at HJP=17000, ~50% at HJP=20000
            decomp = max(0.0, min(0.5, (hjp - 14000.0) / 12000.0))
            delta = m * decomp
            phases["martensite"] = round(max(0.0, m - delta), 4)
            phases["ferrite"] = round(phases.get("ferrite", 0.0) + delta * 0.85, 4)
            phases["cementite"] = round(phases.get("cementite", 0.0) + delta * 0.15, 4)
            # Renormalize
            tot = sum(phases.values())
            if tot > 0:
                phases = {k: round(v / tot, 4) for k, v in phases.items()}
    elif sys_id in ("Al-Cu", "Al-Si"):
        solute = "Cu" if sys_id == "Al-Cu" else "Si"
        f_precip = min(0.4, float(comp.get(solute, 4.0)) / 25.0)
        phases = {"α-Al (FCC)": round(1.0 - f_precip, 4)}
        if sys_id == "Al-Cu":
            phases["θ-Al₂Cu"] = round(f_precip, 4)
        else:
            phases["β-Si"] = round(f_precip, 4)
    elif sys_id == "Ni-Cr-Co":
        phases = {"γ-Ni (FCC)": 1.0}
    else:
        phases = {"Unknown": 1.0}

    # Grain growth at austenitization T for hold_time
    grain = grain_growth(aus_T, hold_time, sys_id)
    grain_um = grain["grain_size_um"]

    # Equilibrium at austenitization T
    eq_phases_resp = equilibrium_phases(alloy, aus_T)

    # Mechanical & physical properties
    mech = mechanical_properties(
        sys_id, comp, phases, grain_um,
        temper_T_C=temper_T, temper_time_min=temper_time,
    )
    phys = physical_properties(sys_id, comp)

    # Build processing history (per-step records)
    history_records: List[Dict[str, Any]] = []
    cumulative_time = 0.0
    phase_records: List[Dict[str, Any]] = []
    for s in expanded:
        cumulative_time += (s.target_temp_c - 25.0) / max(1.0, s.heating_rate) if s.heating_rate > 0 else 0.0
        cumulative_time += s.holding_time_min
        # Compute a (rough) phase state at this step's target T
        if sys_id == "Fe-C":
            step_phases = compute_transformation(comp, T_final_C=max(25.0, s.target_temp_c),
                                                  cooling_rate_K_per_s=cr_K_per_s,
                                                  t_at_T_s=s.holding_time_min * 60.0)
        else:
            step_phases = phases
        step_record = {
            "id": s.id,
            "name": s.name,
            "process": s.process,
            "target_temp_c": s.target_temp_c,
            "heating_rate": s.heating_rate,
            "holding_time_min": s.holding_time_min,
            "atmosphere": s.atmosphere,
            "pressure_mpa": s.pressure_mpa,
            "cooling_method": s.cooling_method,
            "cooling_rate": s.cooling_rate,
            "cycles": s.cycles,
            "equilibrium_phases": equilibrium_phases(alloy, s.target_temp_c).get("phases", {}),
            "transformation_phases": step_phases,
            "grain_size_um": grain_growth(s.target_temp_c, s.holding_time_min, sys_id)["grain_size_um"],
            "time_min": round(cumulative_time, 3),
        }
        history_records.append(step_record)
        phase_records.append({
            "step_id": s.id,
            "name": s.name,
            "time_min": round(cumulative_time, 3),
            "T_C": s.target_temp_c,
            "phases": step_phases,
        })

    # Uncertainty: seeded Monte-Carlo over the property model, run for ALL
    # systems. Every sample gets its own draws from random.Random(42): the
    # composition is perturbed ±2 % relative per element and the temperature
    # ±10 °C (steels additionally ±10 % cooling rate), then the property
    # model is re-evaluated. (Earlier versions appended the identical
    # baseline n times for non-Fe systems, which gave std = 0.)
    uncertainty = {}
    if options and options.uncertainty:
        n = max(3, min(50, int(options.n_uncertainty_samples or 25)))
        rng = random.Random(42)
        yield_samples = []
        uts_samples = []
        hard_samples = []
        for _ in range(n):
            comp_pert = {k: max(0.0, v * (1.0 + rng.uniform(-0.02, 0.02))) for k, v in comp.items()}
            T_pert = rng.uniform(-10.0, 10.0)
            if sys_id == "Fe-C":
                cr_pert = max(0.5, cr_K_per_s * (1.0 + rng.uniform(-0.1, 0.1)))
                temper_T_pert = max(0.0, temper_T + T_pert) if temper_T > 0 else 0.0
                ph = compute_transformation(comp_pert, T_final_C=25.0, cooling_rate_K_per_s=cr_pert)
                if temper_T_pert > 0:
                    m = ph.get("martensite", 0.0)
                    hjp2 = hollomon_jaffe(temper_T_pert, temper_time)
                    decomp = max(0.0, min(0.5, (hjp2 - 14000.0) / 12000.0))
                    delta = m * decomp
                    ph["martensite"] = max(0.0, m - delta)
                    ph["ferrite"] = ph.get("ferrite", 0.0) + delta * 0.85
                    ph["cementite"] = ph.get("cementite", 0.0) + delta * 0.15
                g = grain_growth(aus_T + T_pert, hold_time, sys_id)["grain_size_um"]
                m_props = mechanical_properties(sys_id, comp_pert, ph, g,
                                                 temper_T_C=temper_T_pert, temper_time_min=temper_time)
            else:
                # Non-Fe: rebuild the microstructure from the perturbed
                # inputs, then re-evaluate the property model.
                if sys_id in ("Al-Cu", "Al-Si"):
                    solute = "Cu" if sys_id == "Al-Cu" else "Si"
                    f_precip = min(0.4, float(comp_pert.get(solute, 4.0)) / 25.0)
                    ph = {"α-Al (FCC)": round(1.0 - f_precip, 4)}
                    ph["θ-Al₂Cu" if sys_id == "Al-Cu" else "β-Si"] = round(f_precip, 4)
                elif sys_id == "Ni-Cr-Co":
                    ph = {"γ-Ni (FCC)": 1.0}
                else:
                    ph = {"Unknown": 1.0}
                g = grain_growth(aus_T + T_pert, hold_time, sys_id)["grain_size_um"]
                m_props = mechanical_properties(sys_id, comp_pert, ph, g,
                                                 temper_T_C=temper_T, temper_time_min=temper_time)
            yield_samples.append(m_props["yield_strength_MPa"])
            uts_samples.append(m_props["UTS_MPa"])
            hard_samples.append(m_props["hardness_HRC"])

        def stats(vals):
            arr = sorted(vals)
            n_ = len(arr)
            mean = sum(arr) / n_
            var = sum((v - mean) ** 2 for v in arr) / max(1, n_ - 1)
            std = math.sqrt(var)

            def pct(p):
                idx = min(n_ - 1, max(0, int(round(p * (n_ - 1)))))
                return arr[idx]

            lo = arr[int(0.025 * n_)] if n_ > 4 else min(arr)
            hi = arr[int(0.975 * n_)] if n_ > 4 else max(arr)
            return {
                "mean": round(mean, 3),
                "std": round(std, 3),
                "min": round(min(arr), 3),
                "max": round(max(arr), 3),
                "p05": round(pct(0.05), 3),
                "p50": round(pct(0.50), 3),
                "p95": round(pct(0.95), 3),
                "ci_95_low": round(lo, 3),
                "ci_95_high": round(hi, 3),
                "n_samples": n_,
            }
        uncertainty = {
            "yield_strength_MPa": stats(yield_samples),
            "UTS_MPa": stats(uts_samples),
            "hardness_HRC": stats(hard_samples),
        }

    # Final microstructure summary
    final_micro = {
        "system": sys_id,
        "phases": phases,
        "grain_size_um": round(grain_um, 3),
        "austenitize_temp_c": round(aus_T, 2),
        "temper_temp_c": round(temper_T, 2) if temper_T else None,
        "temper_time_min": round(temper_time, 2) if temper_T else None,
        "cooling_rate_K_per_min": round(cr_K_per_min, 2),
        "cooling_rate_K_per_s": round(cr_K_per_s, 4),
        "cooling_step": cr_step_name,
        "hollomon_jaffe": mech.get("hollomon_jaffe", 0.0),
    }

    # Optional TTT/CCT
    extra = {}
    if options and options.compute_ttt:
        extra["ttt"] = generate_ttt(alloy)
    if options and options.compute_cct:
        extra["cct"] = generate_cct(alloy, [0.5, 1.0, 5.0, 25.0, 100.0])

    summary = workflow_summary(workflow, profile)

    return {
        "ok": True,
        "alloy": alloy.model_dump(),
        "workflow": workflow.model_dump(),
        "final_microstructure": final_micro,
        "phase_fractions": phases,
        "mechanical_properties": mech,
        "physical_properties": phys,
        "processing_history": format_processing_history(history_records),
        "phase_evolution": format_phase_evolution(phase_records),
        "temperature_profile": format_temperature_profile(profile),
        "workflow_summary": summary,
        "equilibrium_at_austenitize": eq_phases_resp,
        "uncertainty_estimates": uncertainty,
        "validation": validation,
        **extra,
    }


# ----------------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------------
@app.get("/health")
def health():
    """Health probe — also reports pycalphad reachability and the engines."""
    try:
        pycal_reachable = is_pycalphad_reachable()
        return {
            "ok": True,
            "service": SERVICE,
            "version": VERSION,
            "pycalphad_reachable": pycal_reachable,
            "engines": [
                "workflow",
                "thermodynamics",
                "kinetics",
                "properties",
                "optimization",
                "ml_surrogate",
            ],
            "databases": ["Fe-C", "Al-Cu", "Al-Si", "Ni-Cr-Co"],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/presets")
def presets():
    try:
        return {"ok": True, "presets": preset_list()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/databases")
def databases():
    try:
        dbs = [
            {"id": "Fe-C",     "name": "Fe-C (steel)",                "system": "Fe-C",     "elements": ["Fe", "C"],          "phases": ["α-Fe (BCC)", "γ-Fe (Austenite)", "Fe₃C", "Liquid"]},
            {"id": "Al-Cu",    "name": "Al-Cu (2xxx series)",         "system": "Al-Cu",    "elements": ["Al", "Cu"],         "phases": ["α-Al (FCC)", "θ-Al₂Cu", "Liquid"]},
            {"id": "Al-Si",    "name": "Al-Si (3xx/A356)",            "system": "Al-Si",    "elements": ["Al", "Si"],         "phases": ["α-Al (FCC)", "β-Si", "Liquid"]},
            {"id": "Ni-Cr-Co", "name": "Ni-Cr-Co (superalloy)",      "system": "Ni-Cr-Co", "elements": ["Ni", "Cr", "Co"],   "phases": ["γ-Ni (FCC)", "α-Cr (BCC)", "Liquid"]},
        ]
        return {"ok": True, "databases": dbs}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/run")
def run(req: RunRequest):
    """Full simulation."""
    try:
        return _run_simulation(req.alloy, req.workflow, req.options)
    except Exception as e:
        import traceback
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()}


@app.post("/ttt")
def ttt(req: TttRequest):
    try:
        out = generate_ttt(req.alloy)
        return {"ok": True, **out}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/cct")
def cct(req: CctRequest):
    try:
        rates = req.cooling_rates_k_per_s or [0.5, 1.0, 5.0, 25.0, 100.0]
        out = generate_cct(req.alloy, rates)
        return {"ok": True, **out}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/optimize")
def optimize(req: OptimizeRequest):
    try:
        space = req.param_space or DEFAULT_PARAM_SPACE
        method = (req.method or "bayesian").lower()
        if method == "nsga2":
            objs = req.objectives or [req.objective or "yield_strength_MPa", "toughness_J"]
            result = nsga2_multiobjective(req.alloy, objs, space, req.n_iterations)
        elif method == "genetic":
            result = genetic_optimize(req.alloy, req.objective, space, req.n_iterations, req.constraints)
        elif method == "random":
            result = random_optimize(req.alloy, req.objective, space, req.n_iterations)
        elif method == "grid":
            result = grid_optimize(req.alloy, req.objective, space, req.n_iterations)
        else:
            result = bayesian_optimize(req.alloy, req.objective, space, req.n_iterations, req.constraints)
        return {"ok": True, **result}
    except Exception as e:
        import traceback
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()}


@app.post("/predict")
def predict(req: PredictRequest):
    try:
        out = ml_predict(req.alloy, req.workflow, req.model_name, req.n_train_samples)
        return out
    except Exception as e:
        import traceback
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()}


# ----------------------------------------------------------------------
# Dev entry
# ----------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
