"""
ml_surrogate.py — Train RF / GBR / MLP surrogates on a physics-labelled dataset.

generate_dataset(n_samples):
    Latin-hypercube sample composition × workflow params, label with the
    physics engine (_evaluate from optimization.py).

train_models(dataset):
    Fit RandomForestRegressor, GradientBoostingRegressor, MLPRegressor from
    sklearn (multi-output). Returns {model_name: (model, R²)}.

predict(alloy, workflow, model_name):
    Run a forward sim + predict mechanical properties with the requested model.
"""
from __future__ import annotations

import math
import random
from typing import Any, Dict, List, Tuple

import numpy as np
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.model_selection import train_test_split

from kinetics import compute_transformation, grain_growth
from models import Alloy, Workflow
from optimization import _evaluate
from properties import mechanical_properties, physical_properties
from workflow import build_temperature_profile, resolve_cooling_rate


# Feature keys we use as inputs
FEATURE_KEYS = [
    "C", "Mn", "Si", "Ni", "Cr", "Mo", "Cu", "Co", "Mg", "Zn",
    "austenitize_T", "temper_T", "cooling_rate", "hold_time",
]
TARGET_KEYS = [
    "yield_strength_MPa", "UTS_MPa", "hardness_HRC", "elongation_pct",
    "toughness_J", "fatigue_MPa", "grain_size_um",
]


def _feature_vector(alloy: Alloy, params: Dict[str, float]) -> np.ndarray:
    """Compose a 14-dim feature vector.

    Cooling rate is log10-transformed because it spans 3 orders of magnitude
    (5 → 6000 K/min); a linear feature would dominate distance-based models
    and cause wildly off predictions for slow-cooling samples held out in the
    test split."""
    comp = alloy.composition or {}
    feats = []
    for k in ["C", "Mn", "Si", "Ni", "Cr", "Mo", "Cu", "Co", "Mg", "Zn"]:
        feats.append(float(comp.get(k, 0.0)))
    feats.append(float(params.get("austenitize_T", 850.0)))
    # Temper temperature must stay inside the training range [150, 700] °C:
    # the old default of 0 ("no temper") sits far outside it and made the
    # surrogate extrapolate. Default to 250 °C and clamp.
    temper_T = float(params.get("temper_T", 250.0))
    feats.append(min(700.0, max(150.0, temper_T)))
    feats.append(float(math.log10(max(1.0, params.get("cooling_rate", 60.0)))))
    feats.append(float(params.get("hold_time", 30.0)))
    return np.array(feats, dtype=float)


def _sample_comp_and_params(rng: random.Random, system: str) -> Tuple[Dict[str, float], Dict[str, float]]:
    """LHS-ish sampling per system."""
    if system == "Fe-C":
        comp = {
            "C": rng.uniform(0.1, 1.0),
            "Mn": rng.uniform(0.0, 1.5),
            "Si": rng.uniform(0.0, 1.0),
            "Ni": rng.uniform(0.0, 3.0),
            "Cr": rng.uniform(0.0, 2.0),
            "Mo": rng.uniform(0.0, 1.0),
        }
    elif system == "Al-Cu":
        comp = {"Cu": rng.uniform(2.0, 6.0), "Mg": rng.uniform(0.0, 1.5), "Si": rng.uniform(0.0, 1.0), "Mn": rng.uniform(0.0, 0.8)}
    elif system == "Al-Si":
        comp = {"Si": rng.uniform(4.0, 12.0), "Mg": rng.uniform(0.0, 0.8), "Cu": rng.uniform(0.0, 1.0)}
    elif system == "Ni-Cr-Co":
        comp = {"Cr": rng.uniform(15.0, 25.0), "Co": rng.uniform(10.0, 20.0), "Mo": rng.uniform(2.0, 6.0), "Al": rng.uniform(0.5, 2.0), "Ti": rng.uniform(0.5, 2.5)}
    else:
        comp = {"C": 0.4}

    params = {
        "austenitize_T": rng.uniform(800.0, 1000.0),
        "temper_T": rng.uniform(150.0, 700.0),
        "cooling_rate": rng.uniform(5.0, 6000.0),
        "hold_time": rng.uniform(15.0, 120.0),
    }
    return comp, params


def generate_dataset(n_samples: int = 300, system: str = "Fe-C") -> Dict[str, Any]:
    """Generate a labelled dataset for one alloy system."""
    rng = random.Random(123)
    X = []
    y = []
    meta = []
    for i in range(n_samples):
        comp, params = _sample_comp_and_params(rng, system)
        alloy = Alloy(system=system, name=f"sample-{i}", composition=comp)
        # Evaluate yield_strength as the canonical objective (also returns full props)
        v, r = _evaluate(alloy, params, "yield_strength_MPa")
        feat = _feature_vector(alloy, params)
        target = np.array([
            r["mechanical_properties"]["yield_strength_MPa"],
            r["mechanical_properties"]["UTS_MPa"],
            r["mechanical_properties"]["hardness_HRC"],
            r["mechanical_properties"]["elongation_pct"],
            r["mechanical_properties"]["toughness_J"],
            r["mechanical_properties"]["fatigue_MPa"],
            r["grain_size_um"],
        ], dtype=float)
        X.append(feat)
        y.append(target)
        meta.append({"composition": comp, "params": params})

    return {
        "X": np.array(X),
        "y": np.array(y),
        "feature_keys": FEATURE_KEYS,
        "target_keys": TARGET_KEYS,
        "meta": meta,
        "system": system,
        "n_samples": n_samples,
    }


# Module-level cache for trained models
_TRAINED: Dict[str, Dict[str, Any]] = {}


def train_models(system: str = "Fe-C", n_samples: int = 300, force_retrain: bool = False) -> Dict[str, Any]:
    """Train RF / GBR / MLP on a fresh dataset; cache by system+n_samples."""
    cache_key = f"{system}:{n_samples}"
    if cache_key in _TRAINED and not force_retrain:
        return _TRAINED[cache_key]

    ds = generate_dataset(n_samples=n_samples, system=system)
    X, y = ds["X"], ds["y"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)

    models = {
        "random_forest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=100, random_state=42),
        "mlp": MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=500, random_state=42),
    }

    results = {}
    for name, model in models.items():
        try:
            # GBR doesn't support multi-output natively; wrap with MultiOutputRegressor
            if name == "gradient_boosting":
                from sklearn.multioutput import MultiOutputRegressor
                model = MultiOutputRegressor(model)
            model.fit(Xtr, ytr)
            train_score = model.score(Xtr, ytr)
            test_score = model.score(Xte, yte)
            results[name] = {
                "model": model,
                "train_r2": round(float(train_score), 4),
                "test_r2": round(float(test_score), 4),
            }
        except Exception as e:
            results[name] = {"model": None, "train_r2": 0.0, "test_r2": 0.0, "error": str(e)}

    out = {
        "models": results,
        "feature_keys": FEATURE_KEYS,
        "target_keys": TARGET_KEYS,
        "n_train": n_samples,
        "system": system,
    }
    _TRAINED[cache_key] = out
    return out


def predict(alloy: Alloy, workflow: Workflow, model_name: str = "random_forest",
            n_train_samples: int = 300) -> Dict[str, Any]:
    """
    Predict mechanical properties for the given alloy + workflow using the
    trained surrogate of choice.
    """
    # Derive params from workflow steps
    steps = workflow.steps or []
    aus_T = next((s.target_temp_c for s in steps if s.process in {"austenitize", "solution_treat"}), 850.0)
    # Default 250 °C (mid-low temper range) when the workflow has no
    # temper/age step — the feature must stay inside the training range.
    temper_T = next((s.target_temp_c for s in steps if s.process in {"temper", "age"}), 250.0)
    cr = 60.0
    for s in steps:
        if s.cooling_method in {"water_quench", "oil_quench", "polymer_quench", "gas_quench"}:
            cr = resolve_cooling_rate(s)
            break
    hold = next((s.holding_time_min for s in steps if s.process in {"austenitize", "solution_treat"}), 30.0)
    params = {"austenitize_T": aus_T, "temper_T": temper_T, "cooling_rate": cr, "hold_time": hold}

    trained = train_models(system=alloy.system, n_samples=n_train_samples)
    entry = trained["models"].get(model_name) or trained["models"].get("random_forest")
    model = entry.get("model")
    if model is None:
        return {"ok": False, "error": entry.get("error", "no model available")}

    feat = _feature_vector(alloy, params).reshape(1, -1)
    y_pred = model.predict(feat)[0]
    pred_dict = {k: round(float(v), 4) for k, v in zip(TARGET_KEYS, y_pred)}

    # Also run physics engine for comparison
    v_phys, r_phys = _evaluate(alloy, params, "yield_strength_MPa")
    physics = {
        k: round(float(v), 4)
        for k, v in r_phys["mechanical_properties"].items()
        if isinstance(v, (int, float))
    }

    return {
        "ok": True,
        "model": model_name,
        "system": alloy.system,
        "n_train_samples": n_train_samples,
        "params": {k: round(float(v), 3) for k, v in params.items()},
        "predictions": pred_dict,
        "physics_engine": physics,
        "training_r2": entry.get("train_r2", 0.0),
        "test_r2": entry.get("test_r2", 0.0),
        "note": "R² is measured on the service's own deterministic physics outputs (self-consistency), not on independent experimental data.",
    }
