"""
viz.py — formatting helpers for T-profile & phase-evolution chart payloads.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from workflow import build_temperature_profile, expand_cycles, resolve_cooling_rate


def format_temperature_profile(profile: List[Tuple[float, float]]) -> Dict[str, Any]:
    """
    Convert a (time_min, temp_C) list into a Recharts-friendly payload.
    """
    series = [{"t": round(t, 3), "T": round(T, 2)} for t, T in profile]
    return {
        "series": series,
        "x_key": "t",
        "y_key": "T",
        "x_label": "Time (min)",
        "y_label": "Temperature (°C)",
        "x_domain": [0, max((t for t, _ in profile), default=0)],
        "y_domain": [0, max((T for _, T in profile), default=1000)],
        "n_points": len(series),
    }


def format_phase_evolution(step_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    step_records is a list of dicts with at least:
      {step_id, name, time_min, T_C, phases: {martensite, bainite, ferrite, pearlite, retained_austenite, cementite}}
    Returns series arrays per phase, suitable for Recharts stacked-area.
    """
    phases = ["martensite", "bainite", "ferrite", "pearlite", "retained_austenite", "cementite"]
    series = []
    for r in step_records:
        row: Dict[str, Any] = {
            "t": round(r.get("time_min", 0.0), 3),
            "T": round(r.get("T_C", 0.0), 2),
            "step": r.get("name", ""),
        }
        for p in phases:
            row[p] = round(float(r.get("phases", {}).get(p, 0.0)), 4)
        series.append(row)
    return {
        "series": series,
        "x_key": "t",
        "phase_keys": phases,
        "n_points": len(series),
    }


def format_processing_history(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Clean up a list of per-step processing records for frontend display.
    """
    out = []
    for i, s in enumerate(steps):
        out.append({
            "index": i,
            "id": s.get("id", f"step-{i}"),
            "name": s.get("name", ""),
            "process": s.get("process", ""),
            "target_temp_c": round(s.get("target_temp_c", 0.0), 2),
            "heating_rate": round(s.get("heating_rate", 0.0), 3),
            "holding_time_min": round(s.get("holding_time_min", 0.0), 3),
            "atmosphere": s.get("atmosphere", ""),
            "pressure_mpa": round(s.get("pressure_mpa", 0.1), 3),
            "cooling_method": s.get("cooling_method", ""),
            "cooling_rate_K_per_min": round(resolve_cooling_rate(_ProxyStep(s)), 2),
            "cycles": s.get("cycles", 1),
            "equilibrium_phases": s.get("equilibrium_phases", {}),
            "transformation_phases": s.get("transformation_phases", {}),
            "grain_size_um": round(s.get("grain_size_um", 0.0), 3),
        })
    return out


class _ProxyStep:
    """Tiny shim so resolve_cooling_rate (which expects an HTStep-like) works
    on a plain dict."""
    def __init__(self, d: Dict[str, Any]):
        self.cooling_method = d.get("cooling_method", "air_cool")
        self.cooling_rate = d.get("cooling_rate", 60.0)
