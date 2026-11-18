"""
workflow.py — WorkflowEngine

Expands cyclic steps, builds a discrete temperature-time profile, validates
the workflow for physical sanity.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from models import HTStep, Workflow


# Cooling-rate defaults in K/min (matching the spec)
COOLING_RATE_BY_METHOD: Dict[str, float] = {
    "water_quench": 6000.0,
    "oil_quench": 1500.0,
    "polymer_quench": 3000.0,
    "gas_quench": 600.0,
    "air_cool": 60.0,
    "furnace_cool": 6.0,
    "salt_bath": 300.0,
    "controlled": 60.0,  # placeholder; replaced by step.cooling_rate
}


def resolve_cooling_rate(step: HTStep) -> float:
    """Return the effective cooling rate (K/min) for a step."""
    if step.cooling_method == "controlled":
        return max(0.1, float(step.cooling_rate))
    return COOLING_RATE_BY_METHOD.get(step.cooling_method, 60.0)


def expand_cycles(steps: List[HTStep]) -> List[HTStep]:
    """Expand steps with cycles>1 into repeated steps (with cycle index in name)."""
    expanded: List[HTStep] = []
    for step in steps:
        n = max(1, int(step.cycles))
        for i in range(n):
            # shallow copy via model_construct; pydantic v2 friendly
            new_step = step.model_copy(deep=True)
            if n > 1:
                new_step.name = f"{step.name} (cycle {i + 1}/{n})"
                new_step.id = f"{step.id}__c{i + 1}"
            expanded.append(new_step)
    return expanded


def build_temperature_profile(steps: List[HTStep]) -> List[Tuple[float, float]]:
    """
    Build a (time_min, temp_C) piecewise profile from the workflow.

    The profile is anchored at (0, 25 °C) ambient. For each step:
      * ramp from current T → target_temp_c at heating_rate (°C/min)
      * hold at target for holding_time_min
      * cool from target → 25 °C at the step's effective cooling rate
    """
    profile: List[Tuple[float, float]] = [(0.0, 25.0)]
    t = 0.0
    T = 25.0

    expanded = expand_cycles(steps)

    for step in expanded:
        # --- Ramp up ---
        if step.target_temp_c > T and step.heating_rate > 0:
            dt = (step.target_temp_c - T) / step.heating_rate
            t += dt
            T = step.target_temp_c
            profile.append((round(t, 3), round(T, 2)))
        elif step.target_temp_c < T:
            # If target below current T, model this as a cool ramp using the
            # step's effective cooling rate (typical for temper after quench).
            rate = resolve_cooling_rate(step)
            dt = (T - step.target_temp_c) / rate
            t += dt
            T = step.target_temp_c
            profile.append((round(t, 3), round(T, 2)))
        elif step.target_temp_c == T:
            # already there; no ramp needed
            pass

        # --- Hold ---
        if step.holding_time_min > 0:
            t += step.holding_time_min
            profile.append((round(t, 3), round(T, 2)))

        # --- Cool to ambient (unless next step keeps the temp) ---
        rate = resolve_cooling_rate(step)
        if T > 25.0 and rate > 0:
            dt = (T - 25.0) / rate
            t += dt
            T = 25.0
            profile.append((round(t, 3), round(T, 2)))

    return profile


def validate_workflow(steps: List[HTStep]) -> Dict[str, object]:
    """
    Validate the workflow.

    Returns {ok, warnings, errors}.
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not steps:
        errors.append("Workflow has no steps.")
        return {"ok": False, "warnings": warnings, "errors": errors}

    seen_ids = set()
    for i, s in enumerate(steps):
        if s.id in seen_ids:
            warnings.append(f"Duplicate step id at index {i}: {s.id}")
        seen_ids.add(s.id)
        if s.target_temp_c < -273.15:
            errors.append(f"Step {i} ({s.name}): target_temp_c below absolute zero.")
        if s.holding_time_min < 0:
            warnings.append(f"Step {i} ({s.name}): negative hold time ignored.")
        if s.heating_rate <= 0 and s.target_temp_c > 25:
            warnings.append(f"Step {i} ({s.name}): non-positive heating rate.")

    # Quench + temper combos are common; let's just warn if there's no cooling step after austenitize.
    has_aus = any(s.process in {"austenitize", "solution_treat"} for s in steps)
    has_cool = any(s.process in {"quench", "air_cool", "furnace_cool", "salt_bath"} or
                   s.cooling_method != "air_cool" for s in steps)
    if has_aus and not has_cool:
        warnings.append("Austenitize/solution step present but no explicit cooling step.")

    return {"ok": len(errors) == 0, "warnings": warnings, "errors": errors}


def workflow_summary(workflow: Workflow, profile: List[Tuple[float, float]]) -> Dict[str, object]:
    """Build a compact summary dict."""
    total_time = profile[-1][0] if profile else 0.0
    peak_T = max((p[1] for p in profile), default=25.0)
    return {
        "name": workflow.name,
        "n_steps": len(workflow.steps),
        "n_steps_expanded": len(expand_cycles(workflow.steps)),
        "total_time_min": round(total_time, 2),
        "peak_temp_c": round(peak_T, 2),
        "profile_points": len(profile),
    }
