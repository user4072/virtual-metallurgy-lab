"""
thermodynamics.py — CALPHAD equilibrium integration with tie-line fallback.

Calls http://localhost:8000/pycalphad/phase with 5 s timeout.
If pycalphad is unreachable or returns an error, falls back to a simple
Fe-Fe₃C tie-line (lever-rule) model so the rest of the framework keeps working.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Tuple

import httpx

from models import Alloy

PYCALPHAD_URL = "http://localhost:8000/pycalphad/phase"
TIMEOUT_S = 5.0

# In-memory cache: (system, solute_wt_fraction, T_C) -> response dict
_CACHE: Dict[Tuple[str, float, float], Dict[str, Any]] = {}


def _key(alloy: Alloy, T_C: float) -> Tuple[str, float, float]:
    """Build a cache key. Uses the first composition entry as the solute wt%."""
    comp = alloy.composition or {}
    if alloy.system == "Fe-C":
        sol = comp.get("C", 0.4)
    elif alloy.system == "Al-Cu":
        sol = comp.get("Cu", 4.0)
    elif alloy.system == "Al-Si":
        sol = comp.get("Si", 7.0)
    elif alloy.system == "Ni-Cr-Co":
        sol = comp.get("Cr", 20.0)
    else:
        sol = 0.0
    return (alloy.system, round(float(sol), 4), round(float(T_C), 2))


def call_pycalphad(alloy: Alloy, T_C: float) -> Dict[str, Any]:
    """Call the pycalphad-service. Returns its raw JSON or {ok: False}."""
    comp = alloy.composition or {}
    payload: Dict[str, Any] = {
        "alloySystem": alloy.system,
        "temperatureC": float(T_C),
    }
    if alloy.system == "Fe-C":
        payload["soluteFraction"] = max(1e-6, comp.get("C", 0.4) / 100.0)
    elif alloy.system == "Al-Cu":
        payload["soluteFraction"] = max(1e-6, comp.get("Cu", 4.0) / 100.0)
    elif alloy.system == "Al-Si":
        payload["soluteFraction"] = max(1e-6, comp.get("Si", 7.0) / 100.0)
    elif alloy.system == "Ni-Cr-Co":
        payload["soluteFraction"] = max(1e-6, comp.get("Cr", 20.0) / 100.0)
        payload["soluteFraction2"] = max(1e-6, comp.get("Co", 15.0) / 100.0)
    else:
        payload["soluteFraction"] = 0.01

    try:
        resp = httpx.post(PYCALPHAD_URL, json=payload, timeout=TIMEOUT_S)
        if resp.status_code != 200:
            return {"ok": False, "error": f"status {resp.status_code}"}
        return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ----------------------------------------------------------------------
# Tie-line (lever-rule) fallback
# ----------------------------------------------------------------------
# Phase compositions on the Fe-Fe₃C diagram, in wt% C:
#   ferrite ≈ 0.02, austenite up to 2.14, cementite 6.67, eutectoid 0.77.
def tie_line_fallback(alloy: Alloy, T_C: float) -> Dict[str, Any]:
    """
    Simple Fe-Fe₃C tie-line (lever-rule) fallback for equilibrium phases.
    Returns the same shape as the pycalphad-service response.
    """
    comp = alloy.composition or {}
    sys_id = alloy.system

    phases: Dict[str, float] = {}

    if sys_id == "Fe-C":
        C_wt = max(0.0, float(comp.get("C", 0.4)))
        A1 = 727.0  # eutectoid
        if T_C >= 1392.0:
            phases = {"δ-Fe (BCC)": 1.0}
        elif T_C >= A1 + 50.0 and T_C < 1392.0:
            # Fully austenitic above A1 (rough)
            phases = {"γ-Fe (Austenite)": 1.0}
        elif T_C < A1 - 30.0:
            if C_wt <= 2.14:
                # Steels (≤ 2.14 %C): ferrite + cementite lever rule on the
                # α (0.02 %C) ⇌ Fe₃C (6.67 %C) tie-line. Applied on both
                # sides of the eutectoid — for hypereutectoid compositions
                # (> 0.77 %C) the proeutectoid cementite + pearlite mixture
                # is approximated by its overall carbon balance.
                ferrite = (6.67 - C_wt) / (6.67 - 0.02)
                ferrite = min(1.0, max(0.0, ferrite))
                cementite = 1.0 - ferrite
            else:
                # Cast irons (> 2.14 %C): primary cementite from the
                # γ (2.14 %C) ⇌ Fe₃C (6.67 %C) tie-line; the balance
                # (ledeburite eutectic) is folded into the ferrite share.
                cementite = (C_wt - 2.14) / (6.67 - 2.14)
                cementite = min(1.0, max(0.0, cementite))
                ferrite = 1.0 - cementite
            phases = {"α-Fe (BCC)": round(ferrite, 4), "Fe₃C": round(cementite, 4)}
        else:
            # Near A1: mixed ferrite + austenite
            phases = {"α-Fe (BCC)": 0.5, "γ-Fe (Austenite)": 0.5}
    elif sys_id == "Al-Cu":
        Cu = max(0.0, comp.get("Cu", 4.0)) / 100.0
        solvus_Cu = max(0.5, 5.65 - 0.005 * (T_C - 25.0))
        if T_C >= 660.0:
            phases = {"Liquid": 1.0}
        elif Cu <= solvus_Cu / 100.0:
            phases = {"α-Al (FCC)": 1.0}
        else:
            alpha = (solvus_Cu / 100.0) / Cu
            alpha = min(1.0, max(0.0, alpha))
            theta = 1.0 - alpha
            phases = {"α-Al (FCC)": round(alpha, 4), "θ-Al₂Cu": round(theta, 4)}
    elif sys_id == "Al-Si":
        Si = max(0.0, comp.get("Si", 7.0)) / 100.0
        if T_C >= 660.0:
            phases = {"Liquid": 1.0}
        elif Si <= 0.01:
            phases = {"α-Al (FCC)": 1.0}
        else:
            alpha = 0.95
            phases = {"α-Al (FCC)": round(alpha, 4), "β-Si": round(1.0 - alpha, 4)}
    elif sys_id == "Ni-Cr-Co":
        # Single-phase FCC γ for most Ni-rich superalloys at moderate T
        if T_C >= 1455.0:
            phases = {"Liquid": 1.0}
        else:
            phases = {"γ-Ni (FCC)": 1.0}
    else:
        phases = {"Unknown": 1.0}

    dominant = max(phases, key=phases.get) if phases else "Unknown"
    return {
        "ok": True,
        "pycalphad": False,
        "fallback": "tie_line",
        "alloySystem": sys_id,
        "temperatureC": T_C,
        "phases": phases,
        "dominantPhase": dominant,
    }


def equilibrium_phases(alloy: Alloy, T_C: float) -> Dict[str, Any]:
    """
    Public entry: try pycalphad-service, fall back to the tie-line model,
    cache the result.
    """
    key = _key(alloy, T_C)
    if key in _CACHE:
        return _CACHE[key]

    raw = call_pycalphad(alloy, T_C)
    if raw.get("ok"):
        # Normalize the response
        out = {
            "ok": True,
            "pycalphad": True,
            "alloySystem": alloy.system,
            "temperatureC": float(T_C),
            "phases": raw.get("phases", {}),
            "dominantPhase": raw.get("dominantPhase", ""),
        }
    else:
        out = tie_line_fallback(alloy, T_C)
        out["pycalphad_error"] = raw.get("error", "unknown")

    _CACHE[key] = out
    return out


def clear_cache() -> None:
    _CACHE.clear()


def is_pycalphad_reachable() -> bool:
    """Quick connectivity probe (does NOT call /pycalphad/phase)."""
    try:
        r = httpx.get("http://localhost:8000/health", timeout=2.0)
        return r.status_code == 200 and r.json().get("ok") is True
    except Exception:
        return False
