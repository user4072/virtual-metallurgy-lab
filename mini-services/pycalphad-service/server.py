#!/usr/bin/env python3
"""
pycalphad-service — REAL CALPHAD thermodynamics for the Virtual Metallurgy Lab.

All thermodynamic databases are bundled in <repo>/data/databases and described
in registry.json (source, license, citation, SHA-256). The service loads them
from the registry, so paths are portable and provenance is explicit.

Systems and their databases
  Al-Cu, Al-Si          → COST507.tdb  (COST Action 507, distributed with pycalphad)
  Fe-C                  → mc_fe_v2.062.tdb  (TU Wien MatCalc open steel DB, ODbL)
  Fe-C-Mn-Si-Cr-Mo-Ni   → mc_fe_v2.062_clean_fecmnsicrmoni.tdb (ASCII extract)
  Fe-Cr-Ni              → fecrni_ternary.tdb (extract of mc_fe)
  Cantor (CoCrFeMnNi)   → cocrfemnni_quinary.tdb (extract of mc_fe)
  Ni-Cr-Co              → mc_ni_v2.034.tdb (TU Wien MatCalc open Ni DB, ODbL)
  Al-Ni-Ti, Al-Ni-Co    → extracts of mc_ni

Endpoints
  GET  /health                 — service + database status
  POST /pycalphad/phase        — equilibrium phase fractions (+compositions)
  POST /pycalphad/binary_scan  — full T-x phase diagram via pycalphad mapping
  POST /pycalphad/scheil       — Scheil-Gulliver solidification (scheil package)
  POST /pycalphad/ae1ae3       — steel Ae1/Ae3 by equilibrium bisection

Run:  python server.py   (port from PYCALPHAD_PORT, default 8000)
"""
import os
import sys
import time
import json
import hashlib
import numpy as np
from typing import Optional, Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# This service must never import packages leaking from a global PYTHONPATH;
# start scripts clear it, but belt-and-braces here does not hurt.
os.environ.pop("PYTHONPATH", None)

from pycalphad import Database, equilibrium, variables as v
from pycalphad.mapping import BinaryStrategy

# ----------------------------------------------------------------------------
# Repo layout — data/databases lives at the repository root (two levels up)
# ----------------------------------------------------------------------------
SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_DIR, "..", ".."))
DATA_DIR = os.environ.get("VML_DATA_DIR", os.path.join(REPO_ROOT, "data", "databases"))
REGISTRY_PATH = os.path.join(DATA_DIR, "registry.json")

ATOMIC_MASSES = {
    "FE": 55.845, "C": 12.011, "MN": 54.938, "SI": 28.085, "CR": 51.996,
    "MO": 95.95, "NI": 58.693, "CO": 58.933, "AL": 26.982, "CU": 63.546,
    "SI_": 28.085, "TI": 47.867, "VA": 0.0,
    "MG": 24.305, "V": 50.942, "W": 183.84, "NB": 92.906, "ZR": 91.224, "HF": 178.49, "TA": 180.948,
}

# ---- System configurations -------------------------------------------------
# wt% composition dict keys use the element symbol (e.g. {"C": 0.44}).
SYSTEMS: Dict[str, dict] = {
    "Al-Cu": {
        "t_start_C": 780,
        "db_file": "COST507.tdb", "elements": ["AL", "CU", "VA"],
        "phases": ["FCC_A1", "ALCU_THETA", "LIQUID"],
        "display": {"FCC_A1": "α-Al (FCC)", "ALCU_THETA": "θ-Al₂Cu", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "ALCU_THETA"],
        "solute": "CU",
    },
    "Al-Si": {
        "t_start_C": 780,
        "db_file": "COST507.tdb", "elements": ["AL", "SI", "VA"],
        "phases": ["FCC_A1", "DIAMOND_A4", "LIQUID"],
        "display": {"FCC_A1": "α-Al (FCC)", "DIAMOND_A4": "β-Si", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "DIAMOND_A4"],
        "solute": "SI",
    },
    "Fe-C": {
        "t_start_C": 1600,
        "db_file": "mc_fe_v2.062.tdb", "elements": ["FE", "C", "VA"],
        "phases": ["BCC_A2", "FCC_A1", "CEMENTITE", "LIQUID"],
        "display": {"BCC_A2": "α-Fe (Ferrite)", "FCC_A1": "γ-Fe (Austenite)",
                    "CEMENTITE": "Fe₃C (Cementite)", "LIQUID": "Liquid", "GRAPHITE": "Graphite"},
        "liquid": "LIQUID", "solids": ["BCC_A2", "FCC_A1", "CEMENTITE"],
        "solute": "C",
    },
    "Steel-6": {
        "t_start_C": 1600,
        # six-solute steel box for TTT/CCT anchors (C Mn Si Cr Mo Ni in wt%)
        "db_file": "mc_fe_v2.062_clean_fecmnsicrmoni.tdb",
        "elements": ["FE", "C", "MN", "SI", "CR", "MO", "NI", "VA"],
        "phases": ["BCC_A2", "FCC_A1", "CEMENTITE", "LIQUID", "M23C6", "M7C3", "M6C", "LAVES_PHASE", "CHI_A12", "SIGMA", "KSI_CARBIDE"],
        "display": {"BCC_A2": "α-Fe (Ferrite)", "FCC_A1": "γ-Fe (Austenite)",
                    "CEMENTITE": "Fe₃C (Cementite)", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["BCC_A2", "FCC_A1", "CEMENTITE"],
        "solute": "C", "multicomponent": True,
    },
    "Fe-Cr-Ni": {
        "t_start_C": 1600,
        "db_file": "fecrni_ternary.tdb", "elements": ["FE", "CR", "NI", "VA"],
        "phases": ["FCC_A1", "BCC_A2", "SIGMA", "LIQUID"],
        "display": {"FCC_A1": "γ (Austenite)", "BCC_A2": "δ/α (Ferrite)",
                    "SIGMA": "σ (Sigma)", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "BCC_A2", "SIGMA"],
        "solute": "CR", "solute2": "NI",
    },
    "Cantor": {
        "t_start_C": 1500,
        "db_file": "cocrfemnni_quinary.tdb",
        "elements": ["CO", "CR", "FE", "MN", "NI", "VA"],
        "phases": ["FCC_A1", "BCC_A2", "SIGMA", "LIQUID"],
        "display": {"FCC_A1": "FCC (Cantor)", "BCC_A2": "BCC", "SIGMA": "σ (Sigma)", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "BCC_A2", "SIGMA"],
        "solute": "CR", "solute2": "NI", "fixed": {"CO": 20, "CR": 20, "FE": 20, "MN": 20, "NI": 20},
    },
    "Ni-Cr-Co": {
        "t_start_C": 1600,
        "db_file": "mc_ni_v2.034.tdb", "elements": ["NI", "CR", "CO", "VA"],
        "phases": ["FCC_A1", "BCC_A2", "FCC_L12", "GAMMA_PRIME", "SIGMA", "MU_PHASE", "LAVES_PHASE", "LIQUID"],
        "display": {"FCC_A1": "γ-Ni (FCC)", "BCC_A2": "α-Cr (BCC)", "FCC_L12": "γ′ (L1₂)",
                    "GAMMA_PRIME": "γ′-Ni₃(Al,Ti)", "SIGMA": "σ (Sigma)", "MU_PHASE": "μ (Mu)",
                    "LAVES_PHASE": "Laves", "LIQUID": "Liquid"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "BCC_A2", "FCC_L12", "GAMMA_PRIME", "SIGMA", "MU_PHASE", "LAVES_PHASE"],
        "solute": "CR", "solute2": "CO",
    },
    "Al-Ni-Ti": {
        "t_start_C": 1700,
        "db_file": "alniti_ternary.tdb", "elements": ["AL", "NI", "TI", "VA"],
        "phases": ["LIQUID", "FCC_A1", "BCC_A2", "GAMMA_PRIME", "BCC_B2", "ETA"],
        "display": {"LIQUID": "Liquid", "FCC_A1": "(Al)", "BCC_A2": "(Ni)",
                    "GAMMA_PRIME": "γ′-Ni₃(Al,Ti)", "BCC_B2": "β-NiAl", "ETA": "η-Ni₃Ti"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "BCC_A2", "GAMMA_PRIME", "BCC_B2", "ETA"],
        "solute": "NI", "solute2": "TI",
    },
    "Al-Ni-Co": {
        "t_start_C": 1650,
        "db_file": "alnico_ternary.tdb", "elements": ["AL", "NI", "CO", "VA"],
        "phases": ["LIQUID", "FCC_A1", "BCC_A2", "HCP_A3", "GAMMA_PRIME", "BCC_B2"],
        "display": {"LIQUID": "Liquid", "FCC_A1": "(Al)", "BCC_A2": "(Ni)",
                    "HCP_A3": "(Co) HCP", "GAMMA_PRIME": "γ′", "BCC_B2": "β-NiAl"},
        "liquid": "LIQUID", "solids": ["FCC_A1", "BCC_A2", "HCP_A3", "GAMMA_PRIME", "BCC_B2"],
        "solute": "NI", "solute2": "CO",
    },
}

# ---- Registry / database loading --------------------------------------------
REGISTRY: dict = {}
DATABASES: Dict[str, Database] = {}
DB_STATUS: Dict[str, str] = {}


def load_registry() -> dict:
    with open(REGISTRY_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_and_load() -> None:
    global REGISTRY
    try:
        REGISTRY = load_registry()
    except Exception as exc:  # pragma: no cover
        print(f"[registry] FAILED to load {REGISTRY_PATH}: {exc}", file=sys.stderr)
        REGISTRY = {"databases": []}
    reg_by_file = {d["file"]: d for d in REGISTRY.get("databases", [])}
    needed = sorted({cfg["db_file"] for cfg in SYSTEMS.values()})
    for fname in needed:
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            DB_STATUS[fname] = "MISSING"
            continue
        rec = reg_by_file.get(fname)
        if rec:
            actual = sha256(path)
            if actual != rec.get("sha256"):
                DB_STATUS[fname] = f"SHA-MISMATCH (registry {rec.get('sha256','')[:8]}, file {actual[:8]})"
                continue
        try:
            t0 = time.time()
            DATABASES[fname] = Database(path)
            DB_STATUS[fname] = "LOADED" + (f" ({time.time() - t0:.1f}s)" if time.time() - t0 > 1 else "")
        except Exception as exc:
            DB_STATUS[fname] = f"LOAD-ERROR: {exc}"


def wt_to_mol(comp_wt: Dict[str, float]) -> Dict[str, float]:
    """Weight-percent dict (VA-free) → mole fraction dict (uppercase symbols)."""
    moles = {}
    for el, w in comp_wt.items():
        el_u = el.upper()
        m = ATOMIC_MASSES.get(el_u) or ATOMIC_MASSES.get(el)
        if m is None or m <= 0:
            raise ValueError(f"unknown atomic mass for element {el}")
        moles[el_u] = float(w) / m
    total = sum(moles.values())
    return {el: n / total for el, n in moles.items()}


def composition_from_request(cfg: dict, req) -> Dict[str, float]:
    """Build a wt% composition dict for the requested system."""
    if getattr(req, "composition", None):
        return {k.upper(): float(w) for k, w in req.composition.items() if w is not None}
    if cfg.get("fixed"):
        return dict(cfg["fixed"])
    solute = cfg["solute"]
    solute2 = cfg.get("solute2")
    x1 = float(np.clip(req.soluteFraction, 0.0, 1.0)) * 100.0
    comp = {}
    if solute2 and req.soluteFraction2 is not None:
        x2 = float(np.clip(req.soluteFraction2, 0.0, 1.0)) * 100.0
        comp[solute] = x1
        comp[solute2] = x2
        comp[cfg["elements"][0]] = max(0.0, 100.0 - x1 - x2)
    else:
        comp[solute] = x1
        solvent = next(e for e in cfg["elements"] if e != "VA" and e != solute)
        comp[solvent] = 100.0 - x1
    return comp


def equilibrium_conditions(comp_mol: Dict[str, float], T_K: float, elements: List[str]) -> dict:
    """Build equilibrium conditions: T, P, and mole fractions for all but the
    major (solvent) element — pycalphad only allows N−1 independent
    compositions; setting all N over-constrains ('degrees of freedom' error).
    Every component present in the phase list must have a pinned X, including
    absent alloying elements (pinned to a trace amount ~0)."""
    conditions = {v.T: T_K, v.P: 101325}
    solvent = max(comp_mol, key=lambda k: comp_mol[k])
    for el in elements:
        if el == "VA" or el == solvent:
            continue
        xm = comp_mol.get(el, 0.0)
        if xm > 1e-4:
            conditions[v.X(el)] = min(1 - 1e-5, xm)
        else:
            conditions[v.X(el)] = 1e-6
    return conditions


# ---- FastAPI app -------------------------------------------------------------
app = FastAPI(title="pycalphad service — Virtual Metallurgy Lab")
# local-only CORS: the Next.js dev server is the only intended client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PhaseRequest(BaseModel):
    alloySystem: str = "Al-Cu"
    soluteFraction: float = 0.04   # wt fraction of the system's solute
    soluteFraction2: Optional[float] = None  # wt fraction of the 2nd solute
    temperatureC: float = 25.0
    composition: Optional[Dict[str, float]] = None  # optional explicit wt% dict


class ScanRequest(BaseModel):
    alloySystem: str = "Al-Cu"
    soluteFraction2: Optional[float] = None  # fixed 2nd solute (ternary liquidus scan)
    tMinC: float = 200.0
    tMaxC: float = 900.0
    stepT: float = 5.0
    composition: Optional[Dict[str, float]] = None


class ScheilRequest(BaseModel):
    alloySystem: str = "Al-Cu"
    soluteFraction: float = 0.04
    temperatureC: float = 25.0
    composition: Optional[Dict[str, float]] = None
    stepT: float = 2.0


class AeRequest(BaseModel):
    composition: Dict[str, float]  # wt% e.g. {"C": 0.44, "Mn": 0.75, ...}


@app.get("/health")
def health():
    return {
        "ok": True,
        "pycalphad": True,
        "databases": DB_STATUS,
        "systems": list(SYSTEMS.keys()),
        "registry": {
            "path": REGISTRY_PATH,
            "loaded": bool(REGISTRY),
            "entries": len(REGISTRY.get("databases", [])),
        },
    }


@app.post("/pycalphad/phase")
def calc_phase(req: PhaseRequest):
    """Equilibrium phase fractions (+ phase compositions) via pycalphad."""
    t0 = time.time()
    try:
        cfg = SYSTEMS.get(req.alloySystem)
        if cfg is None:
            return {"ok": False, "error": f"unknown system {req.alloySystem}", "pycalphad": True}
        db = DATABASES.get(cfg["db_file"])
        if db is None:
            return {"ok": False, "error": f"database unavailable: {cfg['db_file']} ({DB_STATUS.get(cfg['db_file'])})", "pycalphad": True}

        comp_wt = composition_from_request(cfg, req)
        comp_mol = wt_to_mol(comp_wt)
        conditions = equilibrium_conditions(comp_mol, req.temperatureC + 273.15, cfg["elements"])
        eq = equilibrium(db, cfg["elements"], cfg["phases"], conditions, verbose=False)
        phases_arr = eq.Phase.values.flatten()
        fracs_arr = eq.NP.values.flatten()
        result: Dict[str, float] = {}
        comp_in_phase: Dict[str, float] = {}
        for i, p in enumerate(phases_arr):
            if not isinstance(p, str):
                continue
            frac = float(fracs_arr[i])
            if np.isnan(frac) or frac <= 1e-3:
                continue
            display = cfg["display"].get(p, p)
            result[display] = round(float(frac), 4)

        if not result:
            result = {"No stable phases (check composition/temperature)": 1.0}
        dominant = max(result, key=lambda k: result[k])
        return {
            "ok": True,
            "pycalphad": True,
            "alloySystem": req.alloySystem,
            "temperatureC": req.temperatureC,
            "compositionWt": {k: round(val, 3) for k, val in comp_wt.items()},
            "compositionMol": {k: round(val, 5) for k, val in comp_mol.items()},
            "phases": result,
            "phaseCompositions": comp_in_phase,
            "dominantPhase": dominant,
            "database": cfg["db_file"],
            "inferenceMs": round((time.time() - t0) * 1000),
        }
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "pycalphad": True}


_SCAN_CACHE: Dict[str, dict] = {}


@app.post("/pycalphad/binary_scan")
def binary_scan(req: ScanRequest):
    """Full T-x phase diagram via pycalphad's binary mapping strategy."""
    try:
        cfg = SYSTEMS.get(req.alloySystem)
        if cfg is None:
            return {"ok": False, "error": f"unknown system {req.alloySystem}", "pycalphad": True}
        db = DATABASES.get(cfg["db_file"])
        if db is None:
            return {"ok": False, "error": f"database unavailable: {cfg['db_file']}", "pycalphad": True}
        if cfg.get("multicomponent") or cfg.get("fixed"):
            return {"ok": False, "error": "binary_scan supports binary systems only", "pycalphad": True}

        cache_key = f"{req.alloySystem}|{req.tMinC}|{req.tMaxC}|{req.stepT}"
        if cache_key in _SCAN_CACHE:
            return {**_SCAN_CACHE[cache_key], "cached": True}

        solute = cfg["solute"]
        t0 = time.time()
        strat = BinaryStrategy(
            db, cfg["elements"], cfg["phases"],
            {v.T: (req.tMinC + 273.15, req.tMaxC + 273.15, max(req.stepT, 1.0)),
             v.X(solute): (1e-4, 1 - 1e-4, 0.02)},
        )
        strat.do_map()
        x_var, y_var = v.X(solute), v.T
        boundaries: List[dict] = []
        for rec in strat.get_tieline_data(x_var, y_var):
            phases_in_rec = rec.phases
            has_liquid = cfg["liquid"] in phases_in_rec
            primary_solid = cfg["solids"][0] if cfg["solids"] else None
            for i, phase_name in enumerate(phases_in_rec):
                xs, ys = rec.x[i], rec.y[i]
                if has_liquid:
                    kind = "liquidus" if phase_name == cfg["liquid"] else "solidus"
                else:
                    # solid-solid two-phase field: the primary solid's
                    # boundary is the solvus; the second phase's side is
                    # labeled 'secondary' (intermetallic/carbide boundary)
                    kind = "solvus" if phase_name == primary_solid else "secondary"
                for x, t in zip(xs, ys):
                    boundaries.append({
                        "x": float(x), "t": float(t) - 273.15,
                        "kind": kind, "phase": cfg["display"].get(phase_name, phase_name),
                    })
        invariants: List[dict] = []
        try:
            for inv in strat.get_invariant_data(x_var, y_var):
                phases_in_inv = inv.phases
                xs_all = inv.x
                ys_all = inv.y
                x_mean = float(np.mean([np.mean(a) for a in xs_all]))
                y_mean = float(np.mean([np.mean(a) for a in ys_all]))
                invariants.append({
                    "x": x_mean, "t": y_mean - 273.15,
                    "phases": phases_in_inv,
                    "reaction": " + ".join(cfg["display"].get(p, p) for p in phases_in_inv),
                })
        except Exception:
            pass

        payload = {
            "ok": True,
            "pycalphad": True,
            "alloySystem": req.alloySystem,
            "database": cfg["db_file"],
            "boundaries": boundaries,
            "invariants": invariants,
            "inferenceMs": round((time.time() - t0) * 1000),
        }
        if len(_SCAN_CACHE) > 64:
            _SCAN_CACHE.clear()
        _SCAN_CACHE[cache_key] = payload
        return payload
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "pycalphad": True}


_SCHEIL_CACHE: Dict[str, dict] = {}


def _scheil_own(db, cfg: dict, comp_mol: Dict[str, float], t_start_K: float,
                step_k: float = 2.0, stop: float = 0.001, max_steps: int = 400):
    """Classical Scheil-Gulliver driver using plain pycalphad equilibrium.

    Algorithm ported from the author's `scheil_own.py` (MAR-M247 project):
    at each temperature step, equilibrate the CURRENT LIQUID composition,
    accumulate the solid formed in that step, and adopt the equilibrium
    liquid composition for the next step (no solid diffusion).
    """
    solvent = max(comp_mol, key=lambda k: comp_mol[k])
    solutes = [el for el in comp_mol if el != solvent and el != "VA"]
    elements = cfg["elements"]
    phases = cfg["phases"]
    liq = {el: float(comp_mol[el]) for el in solutes}
    cum: Dict[str, float] = {}
    f_solid = 0.0
    T = t_start_K
    points = []
    liquidus_found = False
    t_liquidus = None
    for step_i in range(max_steps):
        conds = {v.N: 1, v.P: 101325, v.T: T}
        for el in solutes:
            conds[v.X(el)] = max(1e-9, min(1 - 1e-9, liq[el]))
        eq = equilibrium(db, elements, phases, conds, verbose=False)
        ph = eq.Phase.values.ravel()
        npar = eq.NP.values.ravel()
        sets = [(str(p), float(f)) for p, f in zip(ph, npar) if str(p) and not np.isnan(float(f)) and float(f) > 1e-8]
        n_liq = min(1.0, max(0.0, sum(f for p, f in sets if p == cfg["liquid"])))
        if not liquidus_found:
            if n_liq >= 1 - 1e-6:
                T -= step_k
                continue
            liquidus_found = True
            t_liquidus = T
        if n_liq < 1e-8:
            break
        delta = (1 - f_solid) * (1 - n_liq)
        for p, f in sets:
            if p != cfg["liquid"]:
                cum[p] = cum.get(p, 0.0) + (1 - f_solid) * f
        f_solid += delta
        # liquid composition at this temperature: index the LIQUID vertex
        xl = {}
        i_liq = next((k for k, p in enumerate(ph) if p == cfg["liquid"]), None)
        if solutes and i_liq is not None:
            for el in solutes:
                try:
                    xl[el] = float(eq.X.sel(component=el).values.ravel()[i_liq])
                except Exception:
                    xl[el] = liq[el]
        elif solutes:
            xl = dict(liq)
        points.append({
            "T": round(T - 273.15, 2),
            "fs": round(f_solid, 4),
            "fl": round(1 - f_solid, 4),
            "xL": round(xl.get(cfg["solute"], 0.0), 5),
            "phase": "primary" if (1 - f_solid) > 1e-4 else "eutectic",
        })
        if f_solid > 1 - stop:
            break
        s = sum(xl.values())
        if s >= 1.0:
            break
        liq = xl
        T -= step_k
    return points, t_liquidus, cum


@app.post("/pycalphad/scheil")
def scheil(req: ScheilRequest):
    """Scheil-Gulliver non-equilibrium solidification (own pycalphad driver)."""
    try:
        cfg = SYSTEMS.get(req.alloySystem)
        if cfg is None:
            return {"ok": False, "error": f"unknown system {req.alloySystem}", "pycalphad": True}
        db = DATABASES.get(cfg["db_file"])
        if db is None:
            return {"ok": False, "error": f"database unavailable: {cfg['db_file']}", "pycalphad": True}

        comp_wt = composition_from_request(cfg, req)
        comp_mol = wt_to_mol(comp_wt)
        cache_key = f"{req.alloySystem}|{req.soluteFraction}|{req.stepT}|" + ",".join(
            f"{k}:{round(v, 4)}" for k, v in sorted(comp_mol.items()))
        if cache_key in _SCHEIL_CACHE:
            return {**_SCHEIL_CACHE[cache_key], "cached": True}
        t0 = time.time()

        # start well above the liquidus so the first steps are fully liquid
        t_start = float(cfg.get("t_start_C", 900)) + 273.15
        points, t_liquidus, cum = _scheil_own(db, cfg, comp_mol, t_start,
                                              step_k=max(0.5, float(req.stepT)))
        t_solidus = points[-1]["T"] if points else None
        eutectic_fraction = 1 - points[-1]["fs"] if points else 0.0
        # partition coefficient from the first solid/liquid tie (k = xS/xL),
        # segregation ratio = max liquid composition / nominal
        partition_coeff = None
        if points:
            first = points[0]
            if first.get("xL") and first["xL"] > 1e-9:
                partition_coeff = round(comp_mol.get(cfg["solute"], 0) / first["xL"], 4)
        max_xl = max((p.get("xL") or 0) for p in points) if points else 0
        x0 = comp_mol.get(cfg["solute"], 0)
        segregation_ratio = round(max_xl / x0, 3) if x0 > 1e-9 else 1.0
        payload = {
            "ok": True,
            "pycalphad": True,
            "alloySystem": req.alloySystem,
            "database": cfg["db_file"],
            "points": points,
            "tLiquidus": round(t_liquidus - 273.15, 2) if t_liquidus else None,
            "tSolidus": t_solidus,
            "eutecticFraction": round(eutectic_fraction, 4),
            "partitionCoeff": partition_coeff,
            "segregationRatio": segregation_ratio,
            "solidPhases": {k: round(v, 4) for k, v in cum.items()},
            "inferenceMs": round((time.time() - t0) * 1000),
        }
        if len(_SCHEIL_CACHE) > 32:
            _SCHEIL_CACHE.clear()
        _SCHEIL_CACHE[cache_key] = payload
        return payload
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "pycalphad": True}


def _phase_fraction_at(db, cfg, comp_mol: Dict[str, float], T_C: float, target: str) -> float:
    """Stable fraction of one phase at (composition, T) — helper for bisection."""
    conditions = equilibrium_conditions(comp_mol, T_C + 273.15, cfg["elements"])
    eq = equilibrium(db, cfg["elements"], cfg["phases"], conditions, verbose=False)
    phases_arr = eq.Phase.values.flatten()
    fracs_arr = eq.NP.values.flatten()
    for i, p in enumerate(phases_arr):
        if isinstance(p, str) and p == target:
            f = float(fracs_arr[i])
            return 0.0 if np.isnan(f) else f
    return 0.0


_AE_CACHE: Dict[str, dict] = {}


@app.post("/pycalphad/ae1ae3")
def ae1ae3(req: AeRequest):
    """Steel Ae1/Ae3 by equilibrium bisection.

    Approach ported from the author's tttsteel `calphad_bridge.py`
    (descending bisection on the MatCalc steel database): Ae3 is the highest
    temperature where ferrite (BCC_A2) becomes stable; Ae1 is the lowest
    temperature where austenite (FCC_A1) still exists.
    """
    try:
        cfg = SYSTEMS["Steel-6"]
        db = DATABASES.get(cfg["db_file"])
        if db is None:
            return {"ok": False, "error": f"database unavailable: {cfg['db_file']}", "pycalphad": True}
        comp_wt = {k.upper(): float(w) for k, w in req.composition.items()}
        # Fe is the balance of the steel
        others = sum(w for el, w in comp_wt.items() if el != "FE")
        comp_wt["FE"] = max(0.0, 100.0 - others)
        comp_mol = wt_to_mol(comp_wt)
        cache_key = "|".join(f"{k}:{v}" for k, v in sorted(comp_wt.items()))
        if cache_key in _AE_CACHE:
            return {**_AE_CACHE[cache_key], "cached": True}
        t0 = time.time()

        def bisection(lo: float, hi: float, target: str, want_present: bool, iters: int = 14):
            for _ in range(iters):
                mid = 0.5 * (lo + hi)
                f = _phase_fraction_at(db, cfg, comp_mol, mid, target)
                present = f > 1e-4
                if present == want_present:
                    lo = mid
                else:
                    hi = mid
            return 0.5 * (lo + hi)

        c_wt = comp_wt.get("C", 0.0)
        a3_hi = 1100.0 if c_wt < 1.5 else 1200.0
        ae3 = bisection(400.0, a3_hi, "BCC_A2", want_present=True) if c_wt <= 2.11 else None
        # Ae1: lowest T where austenite still exists (FCC disappears below it)
        ae1 = bisection(400.0, a3_hi, "FCC_A1", want_present=False)
        payload = {
            "ok": True,
            "pycalphad": True,
            "compositionWt": comp_wt,
            "Ae1C": round(ae1, 1),
            "Ae3C": round(ae3, 1) if ae3 is not None else None,
            "database": cfg["db_file"],
            "inferenceMs": round((time.time() - t0) * 1000),
        }
        if len(_AE_CACHE) > 64:
            _AE_CACHE.clear()
        _AE_CACHE[cache_key] = payload
        return payload
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "pycalphad": True}


if __name__ == "__main__":
    print("Verifying + loading databases from", DATA_DIR, file=sys.stderr)
    verify_and_load()
    for fname, status in DB_STATUS.items():
        print(f"  {fname}: {status}", file=sys.stderr)
    port = int(os.environ.get("PYCALPHAD_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
