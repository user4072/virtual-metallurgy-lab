"""
kinetics.py — Phase-transformation kinetics.

Implements:
  * fe_c_critical_temperatures(comp) — A1, A3, Ms (Andrews), Mf
  * compute_transformation(comp, T_final_C, cooling_rate_K_per_s) — phase fractions
  * grain_growth(T_C, t_min, alloy_system)
  * generate_ttt / generate_cct (C-curves)
"""
from __future__ import annotations

import math
from typing import Dict, List, Tuple

R_GAS = 8.314  # J/(mol·K)


def _C(comp: Dict[str, float]) -> float:
    return float(comp.get("C", 0.0))


def _Mn(comp: Dict[str, float]) -> float:
    return float(comp.get("Mn", 0.0))


def _Ni(comp: Dict[str, float]) -> float:
    return float(comp.get("Ni", 0.0))


def _Cr(comp: Dict[str, float]) -> float:
    return float(comp.get("Cr", 0.0))


def _Mo(comp: Dict[str, float]) -> float:
    return float(comp.get("Mo", 0.0))


def _Si(comp: Dict[str, float]) -> float:
    return float(comp.get("Si", 0.0))


def _Co(comp: Dict[str, float]) -> float:
    return float(comp.get("Co", 0.0))


# ----------------------------------------------------------------------
# Critical temperatures (Fe-C)
# ----------------------------------------------------------------------
def fe_c_critical_temperatures(comp: Dict[str, float]) -> Dict[str, float]:
    """
    Empirical critical temperatures for Fe-C steels (Andrews, 1965):

    A1 = 727 °C (eutectoid, fixed for Fe-C)
    A3 = 910 - 203*C - 30*Mn - 11*Cr - 15.2*Ni - 20*Mo
         clamped to A3 >= A1 + 5 (austenite must be stable above A1)
    Ms = 539 - 423*C - 30.4*Mn - 17.7*Ni - 12.1*Cr - 7.5*Mo
         clamped to Ms >= -150 °C
       (the earlier unsourced +10*Co / -7.5*Si terms and the wrong A3
        coefficients were removed)
    Mf = Ms - 215
    """
    C = _C(comp); Mn = _Mn(comp); Ni = _Ni(comp); Cr = _Cr(comp); Mo = _Mo(comp)
    A1 = 727.0
    A3 = 910.0 - 203.0 * C - 30.0 * Mn - 11.0 * Cr - 15.2 * Ni - 20.0 * Mo
    A3 = max(A1 + 5.0, A3)
    Ms = 539.0 - 423.0 * C - 30.4 * Mn - 17.7 * Ni - 12.1 * Cr - 7.5 * Mo
    Ms = max(-150.0, Ms)
    Mf = Ms - 215.0
    return {
        "A1_C": round(A1, 2),
        "A3_C": round(A3, 2),
        "Ms_C": round(Ms, 2),
        "Mf_C": round(Mf, 2),
    }


# ----------------------------------------------------------------------
# Phase transformation
# ----------------------------------------------------------------------
def _jmak(t_s: float, k0: float, Q: float, T_K: float, n: float) -> float:
    """JMAK fraction X = 1 - exp(-(k*t)^n), k = k0*exp(-Q/RT)."""
    k = k0 * math.exp(-Q / (R_GAS * T_K))
    return 1.0 - math.exp(-((k * max(0.0, t_s)) ** n))


def compute_transformation(
    comp: Dict[str, float],
    T_final_C: float,
    cooling_rate_K_per_s: float,
    t_at_T_s: float = 0.0,
) -> Dict[str, float]:
    """
    Compute the final phase fractions after cooling from austenite to T_final_C
    at cooling_rate_K_per_s.

    Model:
      * Diffusional transformation (ferrite / pearlite / bainite) via JMAK;
        the cooling rate sets the time available for diffusion (transit time
        through each transformation's temperature window), or an explicit
        isothermal hold via t_at_T_s.
      * Martensite via Koistinen–Marburger on the austenite left when Ms is
        crossed — KM is athermal, so it applies whenever T_final_C < Ms,
        regardless of the cooling rate.

    Returns dict with martensite, bainite, ferrite, pearlite,
    retained_austenite, cementite (all in 0..1, sum to 1).
    """
    sys_default = {"C": 0.4}
    comp = {**sys_default, **(comp or {})}
    crit = fe_c_critical_temperatures(comp)
    Ms = crit["Ms_C"]
    A1 = crit["A1_C"]
    A3 = crit["A3_C"]

    # Initialize all phases to 0
    out = {
        "martensite": 0.0,
        "bainite": 0.0,
        "ferrite": 0.0,
        "pearlite": 0.0,
        "retained_austenite": 0.0,
        "cementite": 0.0,
    }

    C = _C(comp)

    # Cooling rate is in K/min elsewhere; here it's K/s. The caller passes K/s.
    cr_Ks = float(cooling_rate_K_per_s)

    if T_final_C >= A3:
        # Still austenite
        out["retained_austenite"] = 1.0
        return _round_phases(out)

    # ------------------------------------------------------------------
    # Diffusional transformation (rate-controlled)
    # ------------------------------------------------------------------
    # The cooling rate only controls how much time is available for
    # diffusion before the austenite reaches Ms: a continuous cool spends
    # t ≈ ΔT_window / cr inside each transformation's temperature window
    # (windows are cut off at Ms — diffusion stops there), plus any explicit
    # isothermal hold at T_final. cr ≈ 0 → effectively infinite time.
    cr_eff = cr_Ks if cr_Ks > 0.0 else 1.0e-6

    def _diffusion_time(T_top: float, T_bottom: float) -> Tuple[float, float]:
        """Return (available time s, evaluation T °C) for window [T_bottom, T_top]."""
        if T_final_C > T_top:
            # Still above the window — this transformation has not started
            return 0.0, T_final_C
        lo = max(T_bottom, Ms)
        transit = max(0.0, T_top - max(lo, T_final_C)) / cr_eff
        if T_bottom <= T_final_C <= T_top:
            # Isothermal hold at T_final drives the transformation there
            return transit + max(0.0, t_at_T_s), T_final_C
        # Below the window: only the cooling transit through it counts
        return transit, 0.5 * (T_top + T_bottom)

    # Pearlite: strictly below A1 (austenite is stable above A1) down to
    # A1 - 60 — n=2, Q=120 kJ/mol
    pearlite_t, pearlite_T = _diffusion_time(A1 - 2.0, A1 - 60.0)
    pearlite_frac = _jmak(pearlite_t, k0=1.0e6, Q=120_000.0, T_K=pearlite_T + 273.15, n=2.0)
    # Bainite: 250–550 °C — n=2.5, Q=90 kJ/mol
    bainite_t, bainite_T = _diffusion_time(550.0, 250.0)
    bainite_frac = _jmak(bainite_t, k0=1.0e5, Q=90_000.0, T_K=bainite_T + 273.15, n=2.5)
    # Ferrite: hypoeutectoid, A1–A3 — n=2
    ferrite_t, ferrite_T = _diffusion_time(A3, A1)
    ferrite_frac = (
        _jmak(ferrite_t, k0=5.0e4, Q=140_000.0, T_K=ferrite_T + 273.15, n=2.0)
        if C < 0.77
        else 0.0
    )

    # Normalize diffusional so overlapping windows don't exceed the full share
    diff_total = pearlite_frac + bainite_frac + ferrite_frac
    if diff_total > 1.0:
        scale = 1.0 / diff_total
        pearlite_frac *= scale
        bainite_frac *= scale
        ferrite_frac *= scale
        diff_total = 1.0

    # Austenite left untransformed when the cooling path crosses Ms
    remaining = 1.0 - diff_total

    # ------------------------------------------------------------------
    # Martensite (Koistinen–Marburger, athermal)
    # ------------------------------------------------------------------
    # Applies whenever T_final < Ms — independent of the cooling rate; the
    # rate only influenced how much austenite was consumed diffusinally.
    martensite_frac = 0.0
    if T_final_C < Ms:
        martensite_frac = remaining * (1.0 - math.exp(-0.011 * (Ms - T_final_C)))

    # Cementite from carbon partitioning
    cementite_frac = 0.0
    if C > 0.022 and T_final_C < A1:
        # Rough: a few % of the diffusional product becomes cementite
        cementite_frac = min(0.15, 0.04 + (C - 0.022) * 1.5) * diff_total

    # Keep the diffusional share (incl. cementite) within diff_total
    diff_all = pearlite_frac + bainite_frac + ferrite_frac + cementite_frac
    if diff_all > diff_total and diff_all > 0:
        norm = diff_total / diff_all
        pearlite_frac *= norm
        bainite_frac *= norm
        ferrite_frac *= norm
        cementite_frac *= norm

    out["martensite"] = max(0.0, martensite_frac)
    out["pearlite"] = max(0.0, pearlite_frac)
    out["bainite"] = max(0.0, bainite_frac)
    out["ferrite"] = max(0.0, ferrite_frac)
    out["cementite"] = max(0.0, cementite_frac)

    # Retained austenite: austenite that neither transformed diffusinally
    # nor martensitically (below Ms this is the untransformed KM remainder;
    # above Ms nothing martensitic forms by construction).
    out["retained_austenite"] = max(0.0, 1.0 - sum(out.values()))

    return _round_phases(out)


def _round_phases(d: Dict[str, float]) -> Dict[str, float]:
    return {k: round(max(0.0, v), 4) for k, v in d.items()}


# ----------------------------------------------------------------------
# Grain growth
# ----------------------------------------------------------------------
# (Q in J/mol, K0 in m²/s, baseline d0 in µm)
GRAIN_PARAMS = {
    "Fe-C":     {"Q": 280_000.0, "K0": 8.0e-3,  "d0_um": 20.0},
    "Al-Cu":    {"Q": 140_000.0, "K0": 2.0e-4,  "d0_um": 50.0},
    "Al-Si":    {"Q": 140_000.0, "K0": 2.0e-4,  "d0_um": 50.0},
    "Ni-Cr-Co": {"Q": 320_000.0, "K0": 1.0e-3,  "d0_um": 30.0},
}


def grain_growth(T_C: float, t_min: float, alloy_system: str) -> Dict[str, float]:
    """
    Parabolic Arrhenius grain growth:
        d² = d0² + K0 * exp(-Q/RT) * t

    Returns {grain_size_um, growth_factor}.
    """
    params = GRAIN_PARAMS.get(alloy_system, GRAIN_PARAMS["Fe-C"])
    d0 = params["d0_um"]
    K0 = params["K0"]
    Q = params["Q"]
    T_K = max(300.0, T_C + 273.15)
    t_s = max(0.0, t_min) * 60.0
    d_squared = (d0 ** 2) + K0 * math.exp(-Q / (R_GAS * T_K)) * t_s * 1e12  # µm²
    d = math.sqrt(max(d0 ** 2, d_squared))
    growth = d / d0 if d0 > 0 else 1.0
    return {"grain_size_um": round(d, 3), "growth_factor": round(growth, 3)}


# ----------------------------------------------------------------------
# TTT / CCT
# ----------------------------------------------------------------------
def _t_transform_isothermal(
    T_C: float,
    x: float,
    n_avrami: float,
    Q: float,
    k0: float,
    T_nose_C: float,
    delta_T_C: float,
) -> float:
    """
    Isothermal time (s) to reach fraction x at temperature T_C, from the
    JMAK model X = 1 - exp(-(k*t)^n) inverted:

        t_x = ((-ln(1 - x))^(1/n)) / k_eff(T)

    where k_eff(T) = k(T) * exp(-a * ((T - T_nose)/ΔT)²) with a = 12,
    k(T) = k0 * exp(-Q/RT). The Gaussian suppression term bends the pure
    Arrhenius branch into the C-shape: slow near the high-T limit (little
    driving force just below A1) and slow near Ms (diffusion freezes out).
    """
    T_K = max(1.0, T_C + 273.15)
    k = k0 * math.exp(-Q / (R_GAS * T_K))
    k_eff = k * math.exp(-12.0 * ((T_C - T_nose_C) / delta_T_C) ** 2)
    if k_eff <= 0.0 or x >= 1.0:
        return float("inf")
    return ((-math.log(1.0 - x)) ** (1.0 / n_avrami)) / k_eff


def _c_curve(
    T_top_C: float,
    T_bottom_C: float,
    x_target: float,
    n: int = 20,
    n_avrami: float = 2.0,
    Q: float = 120_000.0,
    k0: float = 1.0e6,
    T_nose_C: float | None = None,
    delta_T_C: float | None = None,
) -> List[Dict[str, float]]:
    """
    Build a C-curve for a single transformation by sweeping n isothermal
    temperatures from T_top_C down to T_bottom_C; at each T the time to reach
    the target fraction follows the JMAK inversion in
    _t_transform_isothermal. Every point carries its OWN temperature —
    earlier versions held T fixed at the band mid-point, which drew a
    horizontal line instead of a C-curve.

    'fraction' in each row is the target fraction the reported time reaches:
    start curves use x_target = 0.05, finish curves x_target = 0.95.

    T_nose_C / delta_T_C locate the nose. Fe-C diffusional curves pass
    T_nose = A1 - 150 °C and ΔT = A1 - Ms; when omitted they default to the
    mid-point and width of the swept band. Times are capped at 1e12 s to
    keep the JSON response finite.
    """
    T_hi = max(T_top_C, T_bottom_C)
    T_lo = min(T_top_C, T_bottom_C)
    if T_nose_C is None:
        T_nose_C = 0.5 * (T_hi + T_lo)
    if delta_T_C is None or delta_T_C <= 0.0:
        delta_T_C = max(1e-6, T_hi - T_lo)
    out: List[Dict[str, float]] = []
    for i in range(max(1, n)):
        T_C = T_hi - (T_hi - T_lo) * i / max(1, n - 1)
        t_s = min(1.0e12, _t_transform_isothermal(T_C, x_target, n_avrami, Q, k0, T_nose_C, delta_T_C))
        out.append({
            "T_C": round(T_C, 2),
            "t_s": round(t_s, 4),
            "t_log10": round(math.log10(max(1e-3, t_s)), 4),
            "fraction": round(x_target, 4),
        })
    return out


def generate_ttt(alloy: "Alloy") -> Dict[str, object]:
    """
    Generate TTT diagram curves.

    Each curve is a true C-curve: every point is an isothermal temperature
    inside the transformation band, with the JMAK time to reach the target
    fraction (start rows carry fraction = 0.05, finish rows fraction = 0.95).

    Returns curves keyed by transformation name:
      ferrite_start, ferrite_finish,
      pearlite_start, pearlite_finish,
      bainite_start, bainite_finish,
      martensite_start (Ms), martensite_finish (Mf).
    """
    from models import Alloy as _Alloy  # local import to avoid cycle
    if not isinstance(alloy, _Alloy):
        alloy = _Alloy(**alloy) if isinstance(alloy, dict) else alloy

    sys_id = alloy.system
    comp = alloy.composition or {"C": 0.4}

    if sys_id == "Fe-C":
        crit = fe_c_critical_temperatures(comp)
        A1 = crit["A1_C"]; A3 = crit["A3_C"]; Ms = crit["Ms_C"]; Mf = crit["Mf_C"]

        # Shared nose parameters for the Fe-C diffusional C-curves: the nose
        # sits ~150 °C below A1, ΔT = A1 - Ms is the diffusion band width and
        # the Gaussian suppression a = 12 (see _t_transform_isothermal) gives
        # the C-shape (slow near A1, slow near Ms).
        T_nose = A1 - 150.0
        dT_band = max(1.0, A1 - Ms)

        ferrite_start = _c_curve(A3 - 20.0, A1 + 20.0, 0.05, n=20, n_avrami=2.0,
                                 Q=140_000.0, k0=5e4, T_nose_C=T_nose, delta_T_C=dT_band)
        ferrite_finish = _c_curve(A3 - 20.0, A1 + 20.0, 0.95, n=20, n_avrami=2.0,
                                  Q=140_000.0, k0=5e4, T_nose_C=T_nose, delta_T_C=dT_band)
        pearlite_start = _c_curve(A1 - 10.0, Ms + 10.0, 0.05, n=20, n_avrami=2.0,
                                  Q=120_000.0, k0=1e6, T_nose_C=T_nose, delta_T_C=dT_band)
        pearlite_finish = _c_curve(A1 - 10.0, Ms + 10.0, 0.95, n=20, n_avrami=2.0,
                                   Q=120_000.0, k0=1e6, T_nose_C=T_nose, delta_T_C=dT_band)
        bainite_start = _c_curve(A1 - 30.0, max(250.0, Ms + 10.0), 0.05, n=20, n_avrami=2.5,
                                 Q=90_000.0, k0=1e5, T_nose_C=T_nose, delta_T_C=dT_band)
        bainite_finish = _c_curve(A1 - 30.0, max(250.0, Ms + 10.0), 0.95, n=20, n_avrami=2.5,
                                  Q=90_000.0, k0=1e5, T_nose_C=T_nose, delta_T_C=dT_band)

        curves = {
            "ferrite_start": ferrite_start,
            "ferrite_finish": ferrite_finish,
            "pearlite_start": pearlite_start,
            "pearlite_finish": pearlite_finish,
            "bainite_start": bainite_start,
            "bainite_finish": bainite_finish,
            "martensite_start": [{"T_C": Ms, "t_s": 0.0, "t_log10": 0.0, "fraction": 0.0}],
            "martensite_finish": [{"T_C": Mf, "t_s": 0.0, "t_log10": 0.0, "fraction": 1.0}],
        }
        return {
            "curves": curves,
            "Ms_C": Ms,
            "Mf_C": Mf,
            "A1_C": A1,
            "A3_C": A3,
        }

    # Non-Fe systems: simplified TTT (one curve for the main precipitate).
    # Nose defaults to the mid-point/width of each curve's own band.
    if sys_id == "Al-Cu":
        solvus = 540.0
        gp_zone = _c_curve(180.0, 20.0, 0.05, n=18, n_avrami=1.5, Q=80_000.0, k0=1e3)
        theta_prime = _c_curve(300.0, 150.0, 0.05, n=18, n_avrami=2.0, Q=110_000.0, k0=5e3)
        theta_stable = _c_curve(solvus, 300.0, 0.05, n=18, n_avrami=2.0, Q=140_000.0, k0=1e4)
        curves = {
            "gp_zones_start": gp_zone,
            "theta_prime_start": theta_prime,
            "theta_stable_start": theta_stable,
            "solvus_C": [{"T_C": solvus, "t_s": 0.0, "t_log10": 0.0, "fraction": 0.0}],
        }
        return {"curves": curves, "Ms_C": None, "Mf_C": None, "A1_C": None, "A3_C": None}

    if sys_id == "Al-Si":
        eutectic = 577.0
        si_precip = _c_curve(400.0, 200.0, 0.05, n=18, n_avrami=2.0, Q=120_000.0, k0=1e4)
        curves = {
            "si_precipitate_start": si_precip,
            "eutectic_C": [{"T_C": eutectic, "t_s": 0.0, "t_log10": 0.0, "fraction": 0.0}],
        }
        return {"curves": curves, "Ms_C": None, "Mf_C": None, "A1_C": None, "A3_C": None}

    if sys_id == "Ni-Cr-Co":
        gamma_prime_solvus = 850.0
        gp = _c_curve(900.0, 600.0, 0.05, n=18, n_avrami=2.5, Q=250_000.0, k0=1e5)
        carbide = _c_curve(1000.0, 700.0, 0.05, n=18, n_avrami=2.0, Q=200_000.0, k0=5e4)
        curves = {
            "gamma_prime_start": gp,
            "carbide_start": carbide,
            "gamma_prime_solvus_C": [{"T_C": gamma_prime_solvus, "t_s": 0.0, "t_log10": 0.0, "fraction": 0.0}],
        }
        return {"curves": curves, "Ms_C": None, "Mf_C": None, "A1_C": None, "A3_C": None}

    return {"curves": {}, "Ms_C": None, "Mf_C": None, "A1_C": None, "A3_C": None}


def generate_cct(alloy: "Alloy", cooling_rates_K_per_s: List[float]) -> Dict[str, object]:
    """
    Generate CCT diagram from the TTT curves via the additivity (Scheil)
    rule instead of an arbitrary shift factor. For a constant cooling rate
    cr, cooling is walked in ΔT steps (dt = ΔT/cr) from A3 down to Ms for
    Fe-C (or across each transformation band for the non-Fe systems); the
    incubation fraction Σ dt/t_start(T) accumulates along the path and the
    transformation start is recorded when the sum first reaches 1. The
    finish follows the same way from Σ dt/t_finish(T). The isothermal
    start/finish times t(T) are read from the TTT rows, i.e. from the same
    JMAK C-curve model as the TTT diagram, so the result varies smoothly
    with cr: faster cooling shifts transformations to lower temperatures
    and, relative to the TTT curve, to longer times (phases whose
    incubation never completes are bypassed — for Fe-C that means
    martensite instead).

    Returns curves: {cooling_rate_K_per_s: [{T_C, t_s, t_log10, fraction,
    phase, cooling_rate_K_per_s}, ...]}
    """
    ttt = generate_ttt(alloy)
    base_curves = ttt["curves"]
    A3 = ttt.get("A3_C")

    # Group the TTT start/finish rows per phase family for interpolation
    families: Dict[str, Dict[str, List[Tuple[float, float]]]] = {}
    for phase, pts in base_curves.items():
        if phase.endswith("_start"):
            fam = families.setdefault(phase[: -len("_start")], {})
            fam["start"] = sorted(
                (float(p["T_C"]), float(p["t_s"])) for p in pts if p.get("t_s", 0.0) > 0
            )
        elif phase.endswith("_finish"):
            fam = families.setdefault(phase[: -len("_finish")], {})
            fam["finish"] = sorted(
                (float(p["T_C"]), float(p["t_s"])) for p in pts if p.get("t_s", 0.0) > 0
            )

    def _t_at(rows: List[Tuple[float, float]], T: float) -> float | None:
        """Linear interpolation of t_s(T); None outside the curve's band."""
        if not rows or T > rows[-1][0] or T < rows[0][0]:
            return None
        for (T1, t1), (T2, t2) in zip(rows, rows[1:]):
            if T1 <= T <= T2:
                if T2 - T1 < 1e-9:
                    return t1
                w = (T - T1) / (T2 - T1)
                return t1 + w * (t2 - t1)
        return rows[-1][1]

    cct: Dict[str, List[Dict[str, object]]] = {}
    for cr in cooling_rates_K_per_s:
        cr_f = max(1e-6, float(cr))
        rows: List[Dict[str, object]] = []
        for fam_name in sorted(families):
            fam = families[fam_name]
            start_rows = fam.get("start") or []
            finish_rows = fam.get("finish") or []
            if not start_rows:
                continue
            T_top = start_rows[-1][0]
            T_bottom = start_rows[0][0]
            if finish_rows:
                T_top = max(T_top, finish_rows[-1][0])
                T_bottom = min(T_bottom, finish_rows[0][0])
            # Additivity walk across the band. Elapsed time counts from A3
            # for Fe-C (cooling starts there), else from the band top.
            dT = max(0.5, (T_top - T_bottom) / 40.0)
            T_ref = A3 if A3 is not None else T_top
            s_start = 0.0
            s_finish = 0.0
            rec_start = None
            rec_finish = None
            T = T_top
            while T >= T_bottom - 1e-9:
                dt = dT / cr_f
                t_st = _t_at(start_rows, T)
                if t_st is not None and t_st > 0:
                    s_start += dt / t_st
                    if rec_start is None and s_start >= 1.0:
                        t_el = max(0.0, T_ref - T) / cr_f
                        rec_start = {
                            "T_C": round(T, 2),
                            "t_s": round(t_el, 3),
                            "t_log10": round(math.log10(max(1e-3, t_el)), 4),
                            "fraction": 0.05,
                            "phase": f"{fam_name}_start",
                            "cooling_rate_K_per_s": cr_f,
                        }
                if finish_rows:
                    t_fi = _t_at(finish_rows, T)
                    if t_fi is not None and t_fi > 0:
                        s_finish += dt / t_fi
                        if rec_finish is None and rec_start is not None and s_finish >= 1.0:
                            t_el = max(0.0, T_ref - T) / cr_f
                            rec_finish = {
                                "T_C": round(T, 2),
                                "t_s": round(t_el, 3),
                                "t_log10": round(math.log10(max(1e-3, t_el)), 4),
                                "fraction": 0.95,
                                "phase": f"{fam_name}_finish",
                                "cooling_rate_K_per_s": cr_f,
                            }
                T -= dT
            if rec_start is not None:
                rows.append(rec_start)
            if rec_finish is not None:
                rows.append(rec_finish)
        cct[str(round(cr_f, 3))] = rows
    return {
        "curves": cct,
        "Ms_C": ttt.get("Ms_C"),
        "Mf_C": ttt.get("Mf_C"),
        "A1_C": ttt.get("A1_C"),
        "A3_C": ttt.get("A3_C"),
        "cooling_rates_K_per_s": cooling_rates_K_per_s,
    }


# ----------------------------------------------------------------------
# Hollomon-Jaffe tempering parameter
# ----------------------------------------------------------------------
def hollomon_jaffe(T_C: float, t_h: float, C_const: float = 20.0) -> float:
    """
    Hollomon-Jaffe parameter:
        HJP = T(K) * (C + log10(t_h))   [t in hours]
    """
    T_K = T_C + 273.15
    t_h_hours = max(1e-4, t_h) / 60.0
    return round(T_K * (C_const + math.log10(t_h_hours)), 2)
