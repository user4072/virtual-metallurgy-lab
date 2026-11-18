"""
presets.py — 8 preset heat-treatment workflows.

Each preset is a (alloy, workflow) pair ready to be sent to /run.
"""
from __future__ import annotations

from typing import Any, Dict

from models import Alloy, HTStep, Workflow


def _step(**kwargs: Any) -> HTStep:
    """Helper with sensible defaults."""
    defaults = dict(
        id="",
        name="Step",
        process="soak",
        target_temp_c=600.0,
        heating_rate=10.0,
        holding_time_min=30.0,
        atmosphere="argon",
        pressure_mpa=0.1,
        cooling_method="air_cool",
        cooling_rate=60.0,
        cycles=1,
    )
    defaults.update(kwargs)
    return HTStep(**defaults)


PRESETS: Dict[str, Dict[str, Any]] = {
    # 1. Quench-and-temper AISI 1040
    "quench-temper-1040": {
        "alloy": Alloy(system="Fe-C", name="AISI 1040", composition={"C": 0.4, "Mn": 0.75, "Si": 0.2}),
        "workflow": Workflow(name="Quench & Temper 1040", steps=[
            _step(id="q1", name="Austenitize", process="austenitize",
                  target_temp_c=850.0, heating_rate=15.0, holding_time_min=30.0,
                  atmosphere="argon", cooling_method="water_quench", cooling_rate=6000.0),
            _step(id="q2", name="Temper", process="temper",
                  target_temp_c=550.0, heating_rate=10.0, holding_time_min=60.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
    # 2. Normalize 1045
    "normalize-1045": {
        "alloy": Alloy(system="Fe-C", name="AISI 1045", composition={"C": 0.45, "Mn": 0.75, "Si": 0.2}),
        "workflow": Workflow(name="Normalize 1045", steps=[
            _step(id="n1", name="Austenitize", process="austenitize",
                  target_temp_c=870.0, heating_rate=15.0, holding_time_min=45.0,
                  atmosphere="air", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
    # 3. Austemper 4340
    "austemper-4340": {
        "alloy": Alloy(system="Fe-C", name="AISI 4340",
                       composition={"C": 0.4, "Mn": 0.7, "Si": 0.25, "Ni": 1.8, "Cr": 0.8, "Mo": 0.25}),
        "workflow": Workflow(name="Austemper 4340", steps=[
            _step(id="a1", name="Austenitize", process="austenitize",
                  target_temp_c=845.0, heating_rate=15.0, holding_time_min=30.0,
                  atmosphere="argon", cooling_method="salt_bath", cooling_rate=300.0),
            _step(id="a2", name="Salt Bath Hold", process="salt_bath",
                  target_temp_c=330.0, heating_rate=0.0, holding_time_min=60.0,
                  atmosphere="salt", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
    # 4. Age-hardening Al-Cu (AA2014-ish, 4% Cu)
    "age-hardening-alcu-4": {
        "alloy": Alloy(system="Al-Cu", name="AA2014-like (Al-4Cu)",
                       composition={"Cu": 4.0, "Mn": 0.7, "Mg": 0.5, "Si": 0.8}),
        "workflow": Workflow(name="Age Hardening Al-4Cu", steps=[
            _step(id="ah1", name="Solution Treat", process="solution_treat",
                  target_temp_c=540.0, heating_rate=10.0, holding_time_min=60.0,
                  atmosphere="argon", cooling_method="water_quench", cooling_rate=6000.0),
            _step(id="ah2", name="Age", process="age",
                  target_temp_c=190.0, heating_rate=5.0, holding_time_min=480.0,
                  atmosphere="air", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
    # 5. Solution-treat + age Al-Si (A356-like)
    "solution-treat-al-si": {
        "alloy": Alloy(system="Al-Si", name="A356-like (Al-7Si)",
                       composition={"Si": 7.0, "Mg": 0.35}),
        "workflow": Workflow(name="Solution + Age Al-7Si", steps=[
            _step(id="st1", name="Solution Treat", process="solution_treat",
                  target_temp_c=540.0, heating_rate=10.0, holding_time_min=300.0,
                  atmosphere="argon", cooling_method="water_quench", cooling_rate=6000.0),
            _step(id="st2", name="Age", process="age",
                  target_temp_c=165.0, heating_rate=5.0, holding_time_min=360.0,
                  atmosphere="air", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
    # 6. Stress-relief 1020
    "stress-relief-1020": {
        "alloy": Alloy(system="Fe-C", name="AISI 1020", composition={"C": 0.2, "Mn": 0.45, "Si": 0.2}),
        "workflow": Workflow(name="Stress Relief 1020", steps=[
            _step(id="sr1", name="Stress Relief", process="stress_relief",
                  target_temp_c=595.0, heating_rate=8.0, holding_time_min=60.0,
                  atmosphere="air", cooling_method="furnace_cool", cooling_rate=6.0),
        ]),
    },
    # 7. Martemper D6 tool steel (high C + Cr)
    "martemper-d6": {
        "alloy": Alloy(system="Fe-C", name="D6 Tool Steel",
                       composition={"C": 2.0, "Cr": 12.0, "Mn": 0.7, "Si": 0.4, "W": 1.0}),
        "workflow": Workflow(name="Martemper D6", steps=[
            _step(id="m1", name="Preheat", process="preheat",
                  target_temp_c=650.0, heating_rate=10.0, holding_time_min=30.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0),
            _step(id="m2", name="Austenitize", process="austenitize",
                  target_temp_c=980.0, heating_rate=15.0, holding_time_min=30.0,
                  atmosphere="argon", cooling_method="salt_bath", cooling_rate=300.0),
            _step(id="m3", name="Equalize", process="equalize",
                  target_temp_c=250.0, heating_rate=0.0, holding_time_min=20.0,
                  atmosphere="salt", cooling_method="air_cool", cooling_rate=60.0),
            _step(id="m4", name="Temper 1", process="temper",
                  target_temp_c=550.0, heating_rate=10.0, holding_time_min=120.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0, cycles=2),
        ]),
    },
    # 8. Dual-treatment Inconel
    "dual-treatment-inconel": {
        "alloy": Alloy(system="Ni-Cr-Co", name="Inconel-like (Ni-20Cr-15Co)",
                       composition={"Cr": 20.0, "Co": 15.0, "Mo": 4.0, "Al": 1.0, "Ti": 1.5}),
        "workflow": Workflow(name="Dual Treatment Ni-Cr-Co", steps=[
            _step(id="d1", name="Solution Treat", process="solution_treat",
                  target_temp_c=1080.0, heating_rate=15.0, holding_time_min=120.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0),
            _step(id="d2", name="Primary Age", process="age",
                  target_temp_c=850.0, heating_rate=10.0, holding_time_min=240.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0),
            _step(id="d3", name="Secondary Age", process="age",
                  target_temp_c=760.0, heating_rate=10.0, holding_time_min=480.0,
                  atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0),
        ]),
    },
}


def preset_list() -> list:
    out = []
    for key, p in PRESETS.items():
        out.append({
            "id": key,
            "name": p["workflow"].name,
            "alloy_system": p["alloy"].system,
            "alloy_name": p["alloy"].name,
            "composition": p["alloy"].composition,
            "n_steps": len(p["workflow"].steps),
            "step_names": [s.name for s in p["workflow"].steps],
            "alloy": p["alloy"].model_dump(),
            "workflow": p["workflow"].model_dump(),
        })
    return out


def get_preset(key: str):
    return PRESETS.get(key)
