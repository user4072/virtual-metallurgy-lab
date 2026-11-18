"""
properties.py — Mechanical & physical property models.

Mechanical (per spec):
  yield = sigma_0 + k_HP * d^(-0.5) + sigma_ss + sigma_precip
  UTS   = 1.15*yield (Fe), 1.25*yield (Al), 1.10*yield (Ni)
  HRC   = yield/3.3 - 20 ; HV = yield/3
  elong = max(5, 30 - 0.025*yield) (steels)
  toughness = 200*exp(-0.06*(HRC-20))  J
  fatigue  = 0.45*UTS (ferrous), 0.35*UTS (non-ferrous)

Physical:
  density, thermal_conductivity, electrical_conductivity, elastic_modulus, CTE.
"""
from __future__ import annotations

import math
from typing import Dict

from kinetics import hollomon_jaffe


# Solid-solution strengthening (MPa per wt%) — ferrous
SS_STRENGTHENING_FE = {
    "Mn": 30.0,
    "Si": 80.0,
    "Ni": 20.0,
    "Cr": 20.0,
    "Mo": 15.0,
    "Cu": 25.0,
    "V": 35.0,
    "W": 12.0,
    "Co": 10.0,
}

SS_STRENGTHENING_AL = {
    "Cu": 40.0,
    "Si": 40.0,
    "Mg": 35.0,
    "Zn": 15.0,
    "Mn": 25.0,
}

SS_STRENGTHENING_NI = {
    "Cr": 25.0,
    "Co": 18.0,
    "Mo": 30.0,
    "Al": 40.0,
    "Ti": 60.0,
    "W": 15.0,
    "Fe": 18.0,
}

# Pure-metal baseline strength & Hall-Petch coefficient
BASELINE = {
    "Fe-C":     {"sigma_0": 50.0,  "k_HP": 0.45, "UTS_factor": 1.15, "fatigue_factor": 0.45},
    "Al-Cu":    {"sigma_0": 20.0,  "k_HP": 0.07, "UTS_factor": 1.25, "fatigue_factor": 0.35},
    "Al-Si":    {"sigma_0": 20.0,  "k_HP": 0.07, "UTS_factor": 1.25, "fatigue_factor": 0.35},
    "Ni-Cr-Co": {"sigma_0": 80.0,  "k_HP": 0.30, "UTS_factor": 1.10, "fatigue_factor": 0.35},
}


def _ss_contribution(alloy_system: str, comp: Dict[str, float]) -> float:
    """
    Solid-solution strengthening with saturation: small additions give a
    linear (per-wt%) gain, but the contribution saturates above a few wt%.
    """
    if alloy_system == "Fe-C":
        table = SS_STRENGTHENING_FE
    elif alloy_system in ("Al-Cu", "Al-Si"):
        table = SS_STRENGTHENING_AL
    elif alloy_system == "Ni-Cr-Co":
        table = SS_STRENGTHENING_NI
    else:
        table = {}
    total = 0.0
    for k, per_wt in table.items():
        wt = float((comp or {}).get(k, 0.0))
        if wt <= 0:
            continue
        # Saturate at 3 wt% — beyond that SS strengthening diminishes
        effective = min(wt, 3.0) + 0.3 * max(0.0, wt - 3.0)
        total += per_wt * effective
    return total


def _precip_strengthening(phase_fractions: Dict[str, float], alloy_system: str,
                           composition: Dict[str, float] | None = None) -> float:
    """Ashby-Orowan precipitation strengthening:
        sigma_precip = K * sqrt(f) * ln(r / b) / r
    where f = volume fraction, r = mean particle radius (µm here, converted
    to m) and b = Burgers vector (m): 0.254 nm for FCC (Al- and Ni-base
    matrices), 0.286 nm for BCC (Fe-base). K is a system-specific calibration
    constant (MPa·m) chosen so magnitudes stay physical:
      Fe-C   K = 1.1e-5  (f=0.001, r=5 nm  → ~200 MPa microalloy carbides)
      Al-Cu  K = 3.5e-6  (f=0.16,  r=50 nm → ~150 MPa θ′)
      Al-Si  K = 1.0e-5  (f=0.28,  r=1 µm  → ~45 MPa eutectic Si)
      Ni     K = 5.0e-6  (f=0.3,   r=20 nm → ~600 MPa γ′)
    (The previous `K * sqrt(f) / sqrt(r)` form had the wrong scaling.)"""
    composition = composition or {}
    # Burgers vector (m): FCC 0.254 nm, BCC (ferrite) 0.286 nm
    b_m = 0.286e-9 if alloy_system == "Fe-C" else 0.254e-9
    if alloy_system == "Fe-C":
        # Sum of microalloy carbide formers (V, Nb, Ti) — typical ~0.1 wt%
        micro = (float(composition.get("V", 0.0)) + float(composition.get("Nb", 0.0))
                 + float(composition.get("Ti", 0.0)))
        if micro <= 0:
            return 0.0
        # f ≈ 0.01 * micro (roughly), r ≈ 0.005 µm (5 nm VC/NbC)
        f = min(0.05, 0.01 * micro)
        r_um = 0.005
        K = 1.1e-5
    elif alloy_system == "Al-Cu":
        f = phase_fractions.get("θ-Al₂Cu", 0.0) + phase_fractions.get("theta_Al2Cu", 0.0)
        r_um = 0.05  # 50 nm θ′
        K = 3.5e-6
    elif alloy_system == "Al-Si":
        # Eutectic / primary Si are coarse particles, NOT fine precipitates;
        # contribution is modest and capped.
        f = phase_fractions.get("β-Si", 0.0)
        r_um = 1.0
        K = 1.0e-5
    elif alloy_system == "Ni-Cr-Co":
        # γ′ fraction is composition-driven from the γ′ formers Al + Ti
        # (wt%): ~0.35 per wt% Al and ~1.2 per wt% Ti, clamped to [0, 0.6].
        # Falls back to a typical superalloy level (4.0 Al / 1.0 Ti) when the
        # composition dict does not specify them.
        al_wt = float(composition.get("Al", 4.0))
        ti_wt = float(composition.get("Ti", 1.0))
        f = min(0.6, max(0.0, 0.35 * al_wt + 1.2 * ti_wt))
        r_um = 0.02  # 20 nm γ′
        K = 5.0e-6
    else:
        f = 0.0; r_um = 1.0; K = 0.0
    if f <= 0 or r_um <= 0 or K <= 0:
        return 0.0
    r_m = r_um * 1e-6
    if r_m <= b_m:
        return 0.0
    val = K * math.sqrt(f) * math.log(r_m / b_m) / r_m
    # Sanity cap
    return min(700.0, val)


def mechanical_properties(
    alloy_system: str,
    composition: Dict[str, float],
    phase_fractions: Dict[str, float],
    grain_size_um: float,
    temper_T_C: float = 0.0,
    temper_time_min: float = 0.0,
) -> Dict[str, float]:
    """
    Compute mechanical properties from microstructure + composition.
    Returns yield, UTS, HRC, HV, elongation, toughness_J, fatigue_MPa.
    """
    base = BASELINE.get(alloy_system, BASELINE["Fe-C"])
    d = max(1.0, grain_size_um)
    sigma_0 = base["sigma_0"]
    k_HP = base["k_HP"]
    sigma_ss = _ss_contribution(alloy_system, composition)
    sigma_precip = _precip_strengthening(phase_fractions, alloy_system, composition)

    # For Fe-C martensitic / bainitic microstructures the effective Hall-Petch
    # "grain" is the lath/packet size, much smaller than the prior-austenite
    # grain. We use a harmonic-mean blend of the prior-austenite grain size
    # and the lath size (~0.5 µm for martensite, ~2 µm for bainite).
    if alloy_system == "Fe-C":
        f_mart = float(phase_fractions.get("martensite", 0.0))
        f_bain = float(phase_fractions.get("bainite", 0.0))
        # 1/d_eff = (1 - f_mart - f_bain)/d + f_mart/0.5 + f_bain/2.0
        d_lath_mart = 0.5  # µm
        d_lath_bain = 2.0  # µm
        inv_d = (max(0.0, 1.0 - f_mart - f_bain) / d) + (f_mart / d_lath_mart) + (f_bain / d_lath_bain)
        d_eff_um = max(0.3, 1.0 / max(inv_d, 1e-9))
    else:
        d_eff_um = d
    d_m = d_eff_um * 1e-6
    sigma_hp = k_HP * (1.0 / math.sqrt(d_m))

    yield_strength = sigma_0 + sigma_hp + sigma_ss + sigma_precip

    # Tempering softening (Hollomon-Jaffe): higher HJP → lower strength for steels.
    # Empirical: ~5 MPa reduction per 100 HJP above 14,000 (much gentler than
    # the raw HJP coefficient would suggest).
    hjp = 0.0
    if alloy_system == "Fe-C" and temper_T_C > 0 and temper_time_min > 0:
        hjp = hollomon_jaffe(temper_T_C, temper_time_min)
        softening = max(0.0, (hjp - 14000.0) / 100.0) * 5.0
        floor = sigma_0 + sigma_ss + sigma_hp * 0.85 + sigma_precip * 0.5
        yield_strength = max(floor, yield_strength - softening)

    UTS = base["UTS_factor"] * yield_strength

    # Hardness. The spec's `HRC = yield/3.3 - 20` correlation overshoots the
    # HRC scale (which maxes at 65) for any realistic steel yield > ~280 MPa.
    # We use a calibrated piecewise-linear conversion that maps yield to the
    # correct HRC range across the full steel strength spectrum:
    #   yield=200 → HRC≈4, yield=500 → HRC≈16, yield=1000 → HRC≈36, yield=1725 → HRC=65
    # HV uses the spec's `yield/3` directly (which is dimensionally correct).
    if alloy_system == "Fe-C":
        HRC = max(0.0, min(65.0, (yield_strength - 100.0) / 25.0))
    else:
        # Non-ferrous: use Brinell-equivalent (HB ≈ yield/3) and convert HB→HRC
        # only for cross-system UI parity; cap at 65.
        HB = yield_strength / 3.0
        HRC = max(0.0, min(65.0, (HB - 100.0) / 12.0))
    HV = max(0.0, yield_strength / 3.0)
    HV = min(1000.0, HV)

    # Elongation
    if alloy_system == "Fe-C":
        elong = max(5.0, 30.0 - 0.025 * yield_strength)
    elif alloy_system in ("Al-Cu", "Al-Si"):
        elong = max(3.0, 25.0 - 0.015 * yield_strength)
    else:
        elong = max(5.0, 40.0 - 0.03 * yield_strength)

    # Toughness (Charpy J) — steel formula; capped at 200 J.
    toughness = 200.0 * math.exp(-0.06 * (HRC - 20.0))
    toughness = max(5.0, min(200.0, toughness))

    # Fatigue
    fatigue = base["fatigue_factor"] * UTS

    return {
        "yield_strength_MPa": round(yield_strength, 2),
        "UTS_MPa": round(UTS, 2),
        "hardness_HRC": round(HRC, 2),
        "hardness_HV": round(HV, 2),
        "elongation_pct": round(elong, 2),
        "toughness_J": round(max(5.0, toughness), 2),
        "fatigue_MPa": round(fatigue, 2),
        "hollomon_jaffe": round(hjp, 2) if hjp else 0.0,
        "components": {
            "sigma_0": round(sigma_0, 2),
            "sigma_hp": round(sigma_hp, 2),
            "sigma_ss": round(sigma_ss, 2),
            "sigma_precip": round(sigma_precip, 2),
        },
    }


# ----------------------------------------------------------------------
# Physical properties
# ----------------------------------------------------------------------
# Element-level properties (approximate, room-T)
EL_PROPS = {
    # element: (density g/cc, k W/m/K, sigma %IACS, E GPa, CTE ppm/K)
    "Fe": (7.874, 80.0, 17.0, 211.0, 12.0),
    "C":  (2.267, 100.0, 0.0,  10.0, 8.0),
    "Mn": (7.470, 7.8,  1.5,  198.0, 22.0),
    "Si": (2.329, 149.0, 0.0, 130.0, 4.0),
    "Ni": (8.908, 90.9, 23.0, 200.0, 13.4),
    "Cr": (7.190, 93.9, 7.8,  279.0, 6.5),
    "Mo": (10.28, 138.0, 36.0, 329.0, 4.8),
    "Co": (8.900, 100.0, 26.0, 209.0, 13.0),
    "Cu": (8.960, 401.0, 100.0, 110.0, 17.0),
    "Al": (2.700, 237.0, 64.0, 70.0, 23.1),
    "Mg": (1.738, 156.0, 38.0, 45.0, 26.0),
    "Zn": (7.140, 116.0, 28.0, 108.0, 30.0),
    "V":  (6.110, 30.0,  9.0,  128.0, 8.4),
    "W":  (19.250, 173.0, 30.0, 411.0, 4.5),
    "Ti": (4.507, 21.9,  4.0,  116.0, 8.6),
}


def physical_properties(alloy_system: str, composition: Dict[str, float]) -> Dict[str, float]:
    """
    Compute density, thermal_conductivity, electrical_conductivity,
    elastic_modulus, CTE via composition-weighted mixing (rule of mixtures)
    with a few system-specific corrections per the spec.
    """
    comp = dict(composition or {})
    C = float(comp.get("C", 0.0))

    # Solvent element
    if alloy_system == "Fe-C":
        solvent = "Fe"
    elif alloy_system in ("Al-Cu", "Al-Si"):
        solvent = "Al"
    elif alloy_system == "Ni-Cr-Co":
        solvent = "Ni"
    else:
        solvent = "Fe"

    # Build full composition map (wt%) — fill solvent to balance
    total_alloying = sum(v for k, v in comp.items() if k != solvent)
    comp_full = {k: float(v) for k, v in comp.items()}
    comp_full[solvent] = max(0.0, 100.0 - total_alloying)

    density = 0.0
    k_therm = 0.0
    sigma = 0.0
    E = 0.0
    CTE = 0.0
    total_wt = 0.0
    for elem, wt in comp_full.items():
        d_e, k_e, sig_e, E_e, cte_e = EL_PROPS.get(elem, EL_PROPS[solvent])
        w = wt / 100.0
        # Use simple rule of mixtures on weight basis
        density += d_e * w
        k_therm += k_e * w
        sigma += sig_e * w
        E += E_e * w
        CTE += cte_e * w
        total_wt += w

    # Apply spec-specific density corrections
    if alloy_system == "Fe-C":
        Si = float(comp.get("Si", 0.0)); Mn = float(comp.get("Mn", 0.0))
        density = 7.874 - 0.04 * C - 0.012 * Si - 0.016 * Mn
    elif alloy_system == "Al-Cu":
        Cu = float(comp.get("Cu", 0.0))
        density = 2.70 - 0.012 * Cu
    elif alloy_system == "Al-Si":
        Si = float(comp.get("Si", 0.0))
        density = 2.69 - 0.006 * Si
    elif alloy_system == "Ni-Cr-Co":
        Cr = float(comp.get("Cr", 0.0)); Co = float(comp.get("Co", 0.0))
        density = 8.90 - 0.005 * Cr + 0.001 * Co

    return {
        "density_g_cm3": round(density, 4),
        "thermal_conductivity_W_mK": round(k_therm, 2),
        "electrical_conductivity_pctIACS": round(sigma, 2),
        "elastic_modulus_GPa": round(E, 2),
        "CTE_ppm_K": round(CTE, 3),
    }
