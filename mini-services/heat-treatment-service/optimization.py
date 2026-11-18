"""
optimization.py — Process optimization strategies.

Implements:
  * bayesian_optimize   — Gaussian-process surrogate + Expected Improvement
  * genetic_optimize    — custom GA (tournament, SBX, polynomial mutation)
  * random_optimize
  * grid_optimize
  * nsga2_multiobjective — Pareto front via NSGA-II ranking

Each returns:
  {best_workflow, best_params, best_properties, best_objective_value,
   convergence, all_trials, pareto_front (for multi)}
"""
from __future__ import annotations

import math
import random
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

from kinetics import compute_transformation, fe_c_critical_temperatures, grain_growth
from models import Alloy, HTStep, Workflow
from properties import mechanical_properties, physical_properties
from workflow import expand_cycles, resolve_cooling_rate


# ----------------------------------------------------------------------
# Default parameter space — used when caller doesn't supply one.
# Keys must match what `_evaluate` understands.
# ----------------------------------------------------------------------
DEFAULT_PARAM_SPACE: Dict[str, List[float]] = {
    "austenitize_T": [800.0, 1000.0],
    "temper_T":      [200.0, 700.0],
    "cooling_rate":  [5.0, 6000.0],
    "hold_time":     [15.0, 120.0],
}


def _make_workflow_from_params(alloy: Alloy, params: Dict[str, float]) -> Workflow:
    """Build a 2-step (austenitize + temper) workflow from a params dict."""
    cr = float(params.get("cooling_rate", 60.0))
    method = "controlled"
    aus_T = float(params.get("austenitize_T", 850.0))
    temp_T = float(params.get("temper_T", 550.0))
    hold = float(params.get("hold_time", 30.0))

    steps = [
        HTStep(
            id="opt_aus", name="Austenitize", process="austenitize",
            target_temp_c=aus_T, heating_rate=15.0, holding_time_min=hold,
            atmosphere="argon", cooling_method=method, cooling_rate=cr,
        ),
        HTStep(
            id="opt_temp", name="Temper", process="temper",
            target_temp_c=temp_T, heating_rate=10.0, holding_time_min=60.0,
            atmosphere="argon", cooling_method="air_cool", cooling_rate=60.0,
        ),
    ]
    return Workflow(name="Optimized Q&T", steps=steps)


def _evaluate(
    alloy: Alloy,
    params: Dict[str, float],
    objective: str,
) -> Tuple[float, Dict[str, Any]]:
    """
    Run a forward simulation for the workflow implied by `params` and return
    (objective_value, full_result_dict).
    """
    wf = _make_workflow_from_params(alloy, params)
    aus_T = params.get("austenitize_T", 850.0)
    temper_T = params.get("temper_T", 0.0)
    hold = params.get("hold_time", 30.0)
    cr = params.get("cooling_rate", 60.0)  # K/min

    # Cooling rate conversion K/min → K/s
    cr_Ks = cr / 60.0

    comp = alloy.composition or {"C": 0.4}
    sys_id = alloy.system

    # Equilibrium at austenitization T → used as starting austenite frac
    # (we skip the pycalphad call here for speed; assume fully austenitized for Fe-C)
    if sys_id == "Fe-C":
        # If temper is set, we go austenitize → quench to ~25 °C → temper.
        # Final microstructure is at temper T (reheated). Phase fractions are
        # basically the as-quenched martensite + whatever tempering evolves.
        phases_q = compute_transformation(comp, T_final_C=25.0, cooling_rate_K_per_s=cr_Ks)
        # Tempering: tempered martensite is still martensite (with fine carbides).
        # Use HJP to gauge decomposition progress.
        tempered = 0.0
        if temper_T > 0:
            from kinetics import hollomon_jaffe
            hjp = hollomon_jaffe(temper_T, 60.0)
            tempered = max(0.0, min(0.5, (hjp - 14000.0) / 12000.0))
        m = phases_q.get("martensite", 0.0)
        if tempered > 0 and m > 0:
            delta = m * tempered
            phases_q["martensite"] = round(max(0.0, m - delta), 4)
            phases_q["ferrite"] = round(phases_q.get("ferrite", 0.0) + delta * 0.85, 4)
            phases_q["cementite"] = round(phases_q.get("cementite", 0.0) + delta * 0.15, 4)
        phases = phases_q
        grain = grain_growth(aus_T, hold, sys_id)
        grain_um = grain["grain_size_um"]
        props = mechanical_properties(sys_id, comp, phases, grain_um,
                                       temper_T_C=temper_T, temper_time_min=60.0)
    elif sys_id in ("Al-Cu", "Al-Si"):
        # Solution + age: final microstructure → α + precipitate
        solute = "Cu" if sys_id == "Al-Cu" else "Si"
        f_precip = min(0.4, float(comp.get(solute, 4.0)) / 25.0)
        phases = {"α-Al (FCC)": 1.0 - f_precip}
        if sys_id == "Al-Cu":
            phases["θ-Al₂Cu"] = f_precip
        else:
            phases["β-Si"] = f_precip
        # Translate to keys properties.py expects
        phases_for_props = {("θ-Al₂Cu" if sys_id == "Al-Cu" else "β-Si"): f_precip}
        grain = grain_growth(aus_T, hold, sys_id)
        grain_um = grain["grain_size_um"]
        # Use temper_T as the ageing T here (just for HJP bookkeeping)
        props = mechanical_properties(sys_id, comp, phases_for_props, grain_um,
                                       temper_T_C=temper_T, temper_time_min=240.0)
    elif sys_id == "Ni-Cr-Co":
        phases = {"γ-Ni (FCC)": 1.0}
        grain = grain_growth(aus_T, hold, sys_id)
        grain_um = grain["grain_size_um"]
        props = mechanical_properties(sys_id, comp, {}, grain_um,
                                       temper_T_C=temper_T, temper_time_min=240.0)
    else:
        phases = {"Unknown": 1.0}
        grain_um = 30.0
        props = mechanical_properties(sys_id, comp, {}, grain_um)

    phys = physical_properties(sys_id, comp)

    value = props.get(objective, props.get("yield_strength_MPa", 0.0))

    result = {
        "params": {k: round(float(v), 3) for k, v in params.items()},
        "phase_fractions": phases,
        "mechanical_properties": props,
        "physical_properties": phys,
        "grain_size_um": round(grain_um, 3),
        "objective_value": round(float(value), 4),
        "objective": objective,
    }
    return float(value), result


# ----------------------------------------------------------------------
# Random & grid baselines
# ----------------------------------------------------------------------
def _sample_lhs(space: Dict[str, List[float]], n: int, rng: random.Random) -> List[Dict[str, float]]:
    """Latin-hypercube sampling over a bounded space."""
    keys = list(space.keys())
    samples: List[Dict[str, float]] = []
    # Per-dimension permutation
    perms = {k: list(range(n)) for k in keys}
    for k in keys:
        rng.shuffle(perms[k])
    for i in range(n):
        s = {}
        for k in keys:
            lo, hi = space[k][0], space[k][1]
            # random within cell i
            u = (perms[k][i] + rng.random()) / n
            s[k] = lo + u * (hi - lo)
        samples.append(s)
    return samples


def random_optimize(
    alloy: Alloy,
    objective: str,
    param_space: Dict[str, List[float]],
    n_iterations: int,
) -> Dict[str, Any]:
    rng = random.Random(42)
    samples = _sample_lhs(param_space, n_iterations, rng)
    all_trials = []
    best_val = -math.inf
    best = None
    convergence = []
    for s in samples:
        v, r = _evaluate(alloy, s, objective)
        all_trials.append({**r, "trial": len(all_trials) + 1})
        if v > best_val:
            best_val = v
            best = r
        convergence.append({"iteration": len(convergence) + 1, "best": round(best_val, 4)})
    return {
        "method": "random",
        "best_workflow": _make_workflow_from_params(alloy, best["params"]).model_dump(),
        "best_params": best["params"],
        "best_properties": best["mechanical_properties"],
        "best_objective_value": round(best_val, 4),
        "convergence": convergence,
        "all_trials": all_trials,
    }


def grid_optimize(
    alloy: Alloy,
    objective: str,
    param_space: Dict[str, List[float]],
    n_iterations: int,
) -> Dict[str, Any]:
    """Even grid across the parameter space (capped at n_iterations)."""
    keys = list(param_space.keys())
    n_per_dim = max(2, int(round(n_iterations ** (1.0 / len(keys)))))
    grids = []
    for k in keys:
        lo, hi = param_space[k]
        grids.append(list(np.linspace(lo, hi, n_per_dim)))
    # Cartesian product
    import itertools
    samples = []
    for combo in itertools.product(*grids):
        samples.append({k: float(v) for k, v in zip(keys, combo)})
        if len(samples) >= n_iterations:
            break
    all_trials = []
    best_val = -math.inf
    best = None
    convergence = []
    for s in samples:
        v, r = _evaluate(alloy, s, objective)
        all_trials.append({**r, "trial": len(all_trials) + 1})
        if v > best_val:
            best_val = v
            best = r
        convergence.append({"iteration": len(convergence) + 1, "best": round(best_val, 4)})
    return {
        "method": "grid",
        "best_workflow": _make_workflow_from_params(alloy, best["params"]).model_dump(),
        "best_params": best["params"],
        "best_properties": best["mechanical_properties"],
        "best_objective_value": round(best_val, 4),
        "convergence": convergence,
        "all_trials": all_trials,
    }


# ----------------------------------------------------------------------
# Bayesian optimization (GP + EI)
# ----------------------------------------------------------------------
def _matern52_pairwise(X1: np.ndarray, X2: np.ndarray, length: float, sigma_f: float) -> np.ndarray:
    """Matérn-5/2 kernel between two sets of points (rows)."""
    # Squared Euclidean distance
    sq = (X1[:, None, :] - X2[None, :, :]) ** 2
    d = np.sqrt(np.sum(sq, axis=-1) + 1e-12)
    R = np.sqrt(5.0) * d / max(1e-9, length)
    return sigma_f ** 2 * (1.0 + R + R ** 2 / 3.0) * np.exp(-R)


def _gp_fit_predict(X: np.ndarray, y: np.ndarray, Xstar: np.ndarray,
                     length: float = 0.3, sigma_f: float = 1.0, noise: float = 1e-3):
    """Multi-d GP via Matérn-5/2 kernel on Euclidean distance."""
    n = X.shape[0]
    K = _matern52_pairwise(X, X, length, sigma_f) + noise ** 2 * np.eye(n)
    try:
        L = np.linalg.cholesky(K)
    except np.linalg.LinAlgError:
        K = K + 1e-2 * np.eye(n)
        L = np.linalg.cholesky(K)
    alpha = np.linalg.solve(L.T, np.linalg.solve(L, y))
    Ks = _matern52_pairwise(Xstar, X, length, sigma_f)
    mu = Ks @ alpha
    v = np.linalg.solve(L, Ks.T)
    var = sigma_f ** 2 - np.sum(v ** 2, axis=0)
    var = np.maximum(var, 1e-9)
    return mu, np.sqrt(var)


def bayesian_optimize(
    alloy: Alloy,
    objective: str,
    param_space: Dict[str, List[float]],
    n_iterations: int,
    constraints: Optional[Dict[str, Any]] = None,
    seed: int = 0,
) -> Dict[str, Any]:
    """
    GP (Matérn-5/2) surrogate + Expected Improvement acquisition.

    Candidate points are drawn from a seeded NumPy generator (`seed`, default
    0) so repeated runs with the same inputs are reproducible.
    """
    keys = list(param_space.keys())
    bounds = np.array([[param_space[k][0], param_space[k][1]] for k in keys], dtype=float)
    # Normalize each dim to 0..1
    def normalize(p: Dict[str, float]) -> np.ndarray:
        v = np.array([p[k] for k in keys], dtype=float)
        return (v - bounds[:, 0]) / np.maximum(1e-9, bounds[:, 1] - bounds[:, 0])

    def denormalize(x: np.ndarray) -> Dict[str, float]:
        v = bounds[:, 0] + x * (bounds[:, 1] - bounds[:, 0])
        return {k: float(vi) for k, vi in zip(keys, v)}

    rng = random.Random(7)
    # Seed with 5 LHS samples (or fewer if n_iterations < 5)
    n_seed = min(5, max(2, n_iterations // 3))
    X_list = []
    y_list = []
    all_trials = []
    best_val = -math.inf
    best = None
    convergence = []

    seed_samples = _sample_lhs(param_space, n_seed, rng)
    for s in seed_samples:
        v, r = _evaluate(alloy, s, objective)
        X_list.append(normalize(s))
        y_list.append(v)
        all_trials.append({**r, "trial": len(all_trials) + 1})
        if v > best_val:
            best_val = v; best = r
        convergence.append({"iteration": len(convergence) + 1, "best": round(best_val, 4)})

    X = np.array(X_list)
    y = np.array(y_list)

    remaining = n_iterations - n_seed
    # EI candidates per iteration — seeded generator for reproducible runs
    rng_np = np.random.default_rng(seed)
    n_candidates = 200
    for it in range(remaining):
        # 1. Generate candidate points
        cand = rng_np.random((n_candidates, len(keys)))
        # 2. Predict at candidates
        mu_c, std_c = _gp_fit_predict(X, y, cand, length=0.3, sigma_f=1.0)
        # 3. EI acquisition
        y_best = float(np.max(y))
        z = (mu_c - y_best - 0.01) / np.maximum(1e-9, std_c)
        from scipy.stats import norm
        ei = (mu_c - y_best - 0.01) * norm.cdf(z) + std_c * norm.pdf(z)
        ei = np.nan_to_num(ei, nan=0.0)
        idx = int(np.argmax(ei))
        x_next = cand[idx]
        params_next = denormalize(x_next)
        # 4. Evaluate
        v, r = _evaluate(alloy, params_next, objective)
        X = np.vstack([X, x_next])
        y = np.append(y, v)
        all_trials.append({**r, "trial": len(all_trials) + 1})
        if v > best_val:
            best_val = v; best = r
        convergence.append({"iteration": len(convergence) + 1, "best": round(best_val, 4)})

    return {
        "method": "bayesian",
        "best_workflow": _make_workflow_from_params(alloy, best["params"]).model_dump(),
        "best_params": best["params"],
        "best_properties": best["mechanical_properties"],
        "best_objective_value": round(best_val, 4),
        "convergence": convergence,
        "all_trials": all_trials,
    }


# ----------------------------------------------------------------------
# Genetic algorithm
# ----------------------------------------------------------------------
def genetic_optimize(
    alloy: Alloy,
    objective: str,
    param_space: Dict[str, List[float]],
    n_iterations: int,
    constraints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Custom GA. Population 20; generations are derived honestly from the
    evaluation budget: n_gen = max(1, n_iterations // pop_size), so the total
    number of evaluations ≈ n_gen * pop_size (one full generation minimum,
    so budgets smaller than the population still evolve once)."""
    keys = list(param_space.keys())
    bounds = {k: (param_space[k][0], param_space[k][1]) for k in keys}
    pop_size = 20
    # Honest budget: n_gen * pop_size evaluations ≈ n_iterations
    # (one generation minimum — the old max(2, ...) silently doubled it)
    n_gen = max(1, n_iterations // max(1, pop_size))
    rng = random.Random(11)

    def rand_ind() -> Dict[str, float]:
        return {k: rng.uniform(*bounds[k]) for k in keys}

    def evaluate_pop(pop):
        vals = []
        results = []
        for p in pop:
            v, r = _evaluate(alloy, p, objective)
            vals.append(v)
            results.append(r)
        return vals, results

    pop = [rand_ind() for _ in range(pop_size)]
    all_trials = []
    convergence = []
    best_val = -math.inf
    best = None

    for gen in range(n_gen):
        vals, results = evaluate_pop(pop)
        for i, r in enumerate(results):
            all_trials.append({**r, "trial": len(all_trials) + 1, "generation": gen + 1})
            if vals[i] > best_val:
                best_val = vals[i]; best = r
        convergence.append({"iteration": (gen + 1) * pop_size, "best": round(best_val, 4)})

        # Tournament selection
        def select():
            a, b = rng.randrange(pop_size), rng.randrange(pop_size)
            return pop[a] if vals[a] > vals[b] else pop[b]

        # SBX crossover
        def sbx(p1, p2, eta=15.0):
            c = {}
            for k in keys:
                x1, x2 = p1[k], p2[k]
                if abs(x1 - x2) < 1e-9:
                    c[k] = x1
                    continue
                u = rng.random()
                if u <= 0.5:
                    beta = (2.0 * u) ** (1.0 / (eta + 1.0))
                else:
                    beta = (1.0 / (2.0 * (1 - u))) ** (1.0 / (eta + 1.0))
                c1 = 0.5 * ((1 + beta) * x1 + (1 - beta) * x2)
                c2 = 0.5 * ((1 - beta) * x1 + (1 + beta) * x2)
                lo, hi = bounds[k]
                c1 = min(max(c1, lo), hi)
                c2 = min(max(c2, lo), hi)
                c[k] = c1 if rng.random() < 0.5 else c2
            return c

        # Polynomial mutation
        def mutate(p, eta_m=20.0, prob=0.1):
            for k in keys:
                if rng.random() < prob:
                    x = p[k]
                    lo, hi = bounds[k]
                    delta = (hi - lo) * 0.1
                    x = x + rng.uniform(-delta, delta)
                    p[k] = min(max(x, lo), hi)
            return p

        new_pop = []
        # Elitism: keep best 2
        sorted_idx = sorted(range(pop_size), key=lambda i: -vals[i])
        for i in sorted_idx[:2]:
            new_pop.append(pop[i])
        while len(new_pop) < pop_size:
            p1 = select()
            p2 = select()
            child = sbx(p1, p2)
            child = mutate(child)
            new_pop.append(child)
        pop = new_pop

    return {
        "method": "genetic",
        "best_workflow": _make_workflow_from_params(alloy, best["params"]).model_dump(),
        "best_params": best["params"],
        "best_properties": best["mechanical_properties"],
        "best_objective_value": round(best_val, 4),
        "convergence": convergence,
        "all_trials": all_trials,
    }


# ----------------------------------------------------------------------
# NSGA-II (multi-objective)
# ----------------------------------------------------------------------
def _dominates(a: List[float], b: List[float]) -> bool:
    """Return True if objective vector a dominates b (maximize)."""
    better_or_equal = all(av >= bv for av, bv in zip(a, b))
    strictly_better = any(av > bv for av, bv in zip(a, b))
    return better_or_equal and strictly_better


def _fast_non_dominated_sort(values: List[List[float]]) -> List[List[int]]:
    n = len(values)
    S = [[] for _ in range(n)]
    nd = [0] * n
    rank = [0] * n
    fronts: List[List[int]] = [[]]
    for p in range(n):
        for q in range(n):
            if p == q:
                continue
            if _dominates(values[p], values[q]):
                S[p].append(q)
            elif _dominates(values[q], values[p]):
                nd[p] += 1
        if nd[p] == 0:
            rank[p] = 0
            fronts[0].append(p)
    i = 0
    while fronts[i]:
        next_front: List[int] = []
        for p in fronts[i]:
            for q in S[p]:
                nd[q] -= 1
                if nd[q] == 0:
                    rank[q] = i + 1
                    next_front.append(q)
        i += 1
        fronts.append(next_front)
    if not fronts[-1]:
        fronts.pop()
    return fronts


def _crowding_distance(front: List[int], values: List[List[float]]) -> Dict[int, float]:
    n = len(front)
    if n == 0:
        return {}
    if n == 1:
        return {front[0]: math.inf}
    distances = {i: 0.0 for i in front}
    n_obj = len(values[front[0]])
    for m in range(n_obj):
        sorted_front = sorted(front, key=lambda i: values[i][m])
        distances[sorted_front[0]] = math.inf
        distances[sorted_front[-1]] = math.inf
        vmin = values[sorted_front[0]][m]
        vmax = values[sorted_front[-1]][m]
        denom = (vmax - vmin) if (vmax - vmin) > 1e-9 else 1e-9
        for i in range(1, n - 1):
            distances[sorted_front[i]] += (values[sorted_front[i + 1]][m] - values[sorted_front[i - 1]][m]) / denom
    return distances


def nsga2_multiobjective(
    alloy: Alloy,
    objectives: List[str],
    param_space: Dict[str, List[float]],
    n_iterations: int,
) -> Dict[str, Any]:
    """A compact NSGA-II implementation. Population 20; generations are
    derived honestly from the evaluation budget:
    n_gen = max(1, n_iterations // pop_size) (one generation minimum)."""
    keys = list(param_space.keys())
    bounds = {k: (param_space[k][0], param_space[k][1]) for k in keys}
    pop_size = 20
    # Honest budget: n_gen * pop_size evaluations ≈ n_iterations
    # (one generation minimum — the old max(2, ...) silently inflated it)
    n_gen = max(1, n_iterations // max(1, pop_size))
    rng = random.Random(13)

    def rand_ind() -> Dict[str, float]:
        return {k: rng.uniform(*bounds[k]) for k in keys}

    def evaluate_obj(p):
        vals = []
        for obj in objectives:
            v, _ = _evaluate(alloy, p, obj)
            vals.append(v)
        return vals

    pop = [rand_ind() for _ in range(pop_size)]
    pop_values = [evaluate_obj(p) for p in pop]
    pop_results = []
    for p in pop:
        _, r = _evaluate(alloy, p, objectives[0])
        pop_results.append(r)

    all_trials: List[Dict[str, Any]] = []
    convergence: List[Dict[str, Any]] = []

    for gen in range(n_gen):
        # Record
        fronts = _fast_non_dominated_sort(pop_values)
        for i, r in enumerate(pop_results):
            all_trials.append({
                **r,
                "trial": len(all_trials) + 1,
                "generation": gen + 1,
                "rank": 0,
                "objectives": [round(float(v), 4) for v in pop_values[i]],
            })
        front = fronts[0]
        best_hyp = max(sum(pop_values[i]) for i in front) if front else 0.0
        convergence.append({"iteration": (gen + 1) * pop_size, "best_hypervolume_proxy": round(best_hyp, 4)})

        # Build offspring
        fronts_rank = [0] * len(pop)
        for r_idx, fr in enumerate(fronts):
            for idx in fr:
                fronts_rank[idx] = r_idx
        crowding = {i: 0.0 for i in range(len(pop))}
        for fr in fronts:
            cd = _crowding_distance(fr, pop_values)
            for k, v in cd.items():
                crowding[k] = v

        def select():
            a, b = rng.randrange(len(pop)), rng.randrange(len(pop))
            ra, rb = fronts_rank[a], fronts_rank[b]
            ca, cb = crowding[a], crowding[b]
            if ra < rb: return a
            if rb < ra: return b
            return a if ca > cb else b

        def sbx(p1, p2, eta=15.0):
            c = {}
            for k in keys:
                x1, x2 = p1[k], p2[k]
                if abs(x1 - x2) < 1e-9:
                    c[k] = x1; continue
                u = rng.random()
                beta = (2.0 * u) ** (1.0 / (eta + 1.0)) if u <= 0.5 else (1.0 / (2.0 * (1 - u))) ** (1.0 / (eta + 1.0))
                c1 = 0.5 * ((1 + beta) * x1 + (1 - beta) * x2)
                lo, hi = bounds[k]
                c[k] = min(max(c1, lo), hi)
            return c

        def mutate(p, prob=0.1):
            for k in keys:
                if rng.random() < prob:
                    delta = (bounds[k][1] - bounds[k][0]) * 0.1
                    p[k] = min(max(p[k] + rng.uniform(-delta, delta), bounds[k][0]), bounds[k][1])
            return p

        offspring = []
        while len(offspring) < pop_size:
            p1 = pop[select()]
            p2 = pop[select()]
            c = sbx(p1, p2)
            c = mutate(c)
            offspring.append(c)

        offspring_values = [evaluate_obj(p) for p in offspring]
        offspring_results = []
        for p in offspring:
            _, r = _evaluate(alloy, p, objectives[0])
            offspring_results.append(r)

        # Combine, sort, select top pop_size
        combined_pop = pop + offspring
        combined_values = pop_values + offspring_values
        combined_results = pop_results + offspring_results
        new_fronts = _fast_non_dominated_sort(combined_values)
        new_pop_idx: List[int] = []
        for fr in new_fronts:
            if len(new_pop_idx) + len(fr) <= pop_size:
                new_pop_idx.extend(fr)
            else:
                # Fill by crowding
                cd = _crowding_distance(fr, combined_values)
                sorted_fr = sorted(fr, key=lambda i: -cd[i])
                for i in sorted_fr:
                    if len(new_pop_idx) < pop_size:
                        new_pop_idx.append(i)
                break

        pop = [combined_pop[i] for i in new_pop_idx]
        pop_values = [combined_values[i] for i in new_pop_idx]
        pop_results = [combined_results[i] for i in new_pop_idx]

    # Final Pareto front
    final_fronts = _fast_non_dominated_sort(pop_values)
    pareto_idx = final_fronts[0] if final_fronts else []
    pareto_front = []
    for i in pareto_idx:
        pareto_front.append({
            "params": {k: round(float(v), 3) for k, v in pop[i].items()},
            "objectives": [round(float(v), 4) for v in pop_values[i]],
            "mechanical_properties": pop_results[i]["mechanical_properties"],
        })

    # Pick the "best" as the one with max hypervolume-proxy (sum of objectives)
    best_idx = max(pareto_idx, key=lambda i: sum(pop_values[i])) if pareto_idx else 0
    best = pop_results[best_idx]

    return {
        "method": "nsga2",
        "objectives": objectives,
        "best_workflow": _make_workflow_from_params(alloy, pop[best_idx]).model_dump(),
        "best_params": {k: round(float(v), 3) for k, v in pop[best_idx].items()},
        "best_properties": best["mechanical_properties"],
        "best_objective_value": round(sum(pop_values[best_idx]), 4),
        "convergence": convergence,
        "all_trials": all_trials,
        "pareto_front": pareto_front,
    }
