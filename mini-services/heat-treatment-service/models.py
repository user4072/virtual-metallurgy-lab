"""
models.py — Pydantic data models for the heat-treatment-service.

All compositions are in wt%. Timestep / rate units are explicit in field names.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------- Alloy ----------
class Alloy(BaseModel):
    system: str = Field("Fe-C", description="Alloy system: Fe-C | Al-Cu | Al-Si | Ni-Cr-Co")
    name: str = Field("Custom alloy", description="Human-readable alloy name")
    composition: Dict[str, float] = Field(
        default_factory=lambda: {"C": 0.4},
        description="Element → wt% (e.g. {C:0.4, Mn:0.7})",
    )


# ---------- Workflow ----------
class HTStep(BaseModel):
    id: str = Field(..., description="Stable unique id (frontend-assigned)")
    name: str = Field("Austenitize", description="Human-readable step name")
    process: str = Field(
        "austenitize",
        description=(
            "Process type: preheat | austenitize | soak | quench | temper | "
            "age | solution_treat | stress_relief | furnace_cool | air_cool | "
            "salt_bath | equalize"
        ),
    )
    target_temp_c: float = Field(850.0, description="Target temperature (°C)")
    heating_rate: float = Field(10.0, description="Heating rate (°C/min)")
    holding_time_min: float = Field(30.0, description="Hold time at target (min)")
    atmosphere: str = Field("argon", description="Atmosphere: argon | nitrogen | air | vacuum | endothermic | exothermic | hydrogen | salt")
    pressure_mpa: float = Field(0.1, description="Pressure (MPa)")
    cooling_method: str = Field(
        "air_cool",
        description=(
            "Cooling method: water_quench | oil_quench | polymer_quench | "
            "gas_quench | air_cool | furnace_cool | salt_bath | controlled"
        ),
    )
    cooling_rate: float = Field(
        60.0,
        description="Cooling rate (°C/min). Used directly when method=controlled, else from method defaults.",
    )
    cycles: int = Field(1, description="Number of times this step is repeated (≥1)")


class Workflow(BaseModel):
    name: str = Field("Custom workflow")
    steps: List[HTStep] = Field(default_factory=list)


# ---------- Run ----------
class RunOptions(BaseModel):
    compute_ttt: bool = False
    compute_cct: bool = False
    uncertainty: bool = True
    n_uncertainty_samples: int = 25


class RunRequest(BaseModel):
    alloy: Alloy
    workflow: Workflow
    options: Optional[RunOptions] = Field(default_factory=RunOptions)


# ---------- Smaller request payloads ----------
class TttRequest(BaseModel):
    alloy: Alloy


class CctRequest(BaseModel):
    alloy: Alloy
    cooling_rates_k_per_s: Optional[List[float]] = Field(
        default_factory=lambda: [0.5, 1.0, 5.0, 25.0, 100.0],
        description="Cooling rates (K/s) for which CCT curves are derived",
    )


class OptimizeRequest(BaseModel):
    alloy: Alloy
    method: str = Field(
        "bayesian",
        description="bayesian | genetic | random | grid | nsga2",
    )
    objective: str = Field(
        "yield_strength",
        description="Single-objective metric: yield_strength | UTS | hardness_HRC | toughness_J | elongation_pct | fatigue_MPa",
    )
    objectives: Optional[List[str]] = Field(
        None, description="For NSGA-II multi-objective: list of 2+ metrics"
    )
    n_iterations: int = Field(10, ge=2, le=200)
    constraints: Optional[Dict[str, Any]] = Field(default_factory=dict)
    param_space: Optional[Dict[str, List[float]]] = Field(
        None,
        description=(
            "Search space. Default = austenitize_T (800–1000), temper_T (200–700), "
            "cooling_rate (5–6000 K/min)."
        ),
    )


class PredictRequest(BaseModel):
    alloy: Alloy
    workflow: Workflow
    model_name: str = Field("random_forest", description="random_forest | gradient_boosting | mlp")
    n_train_samples: int = Field(300, ge=20, le=2000)
