/**
 * metallurgy.ts
 * -----------------------------------------------------------------------------
 * Physically-grounded surrogate of the Al-Cu (and Al-Si, Fe-C) binary phase
 * diagram. This is the "fast surrogate" that stands in for an expensive
 * pycalphad / CALPHAD equilibrium calculation. It is NOT a learned neural net
 * on the server (that would require a Python runtime); instead it encodes the
 * regular-solution Gibbs free-energy model + lever rule, which is exactly the
 * ground-truth data a PyTorch surrogate would be trained on. The shapes and
 * semantics of the outputs match what `surrogate_engine.py` produces so the
 * frontend and the Python reference architecture are consistent.
 *
 * Thermodynamic conventions
 *   - Composition x is the mole/weight fraction of the SOLUTE (Cu, Si, C).
 *   - Temperatures in Kelvin internally, Celsius in the UI.
 *   - Phase fractions sum to 1 and are computed via the lever rule in
 *     two-phase regions.
 * -----------------------------------------------------------------------------
 */

export type AlloySystemId = "Al-Cu" | "Al-Si" | "Fe-C" | "Ni-Cr-Co";

export interface AlloySystemDef {
  id: AlloySystemId;
  label: string;
  solvent: string;
  solute: string;
  /** Max solute fraction shown on the diagram (weight fraction). */
  xMax: number;
  /** Eutectic composition (weight fraction solute). */
  xEutectic: number;
  /** Eutectic temperature (°C). */
  tEutecticC: number;
  /** Maximum solid solubility of solute in the primary phase (wt frac). */
  xMaxSolid: number;
  /** Melting point of pure solvent (°C). */
  tMeltSolventC: number;
  /** Melting point of the intermetallic / eutectic second phase (°C). */
  tMeltSecondC: number;
  /** Primary phase label (e.g. α-Al FCC). */
  primaryPhase: string;
  /** Second phase label (e.g. θ-Al2Cu). */
  secondPhase: string;
  /** Liquid phase label. */
  liquidPhase: string;
  /** Regular-solution interaction parameter Ω for the liquid (J/mol). */
  omegaL: number;
  /** Regular-solution interaction parameter Ω for the solid (J/mol). */
  omegaS: number;
  accent: string; // tailwind/hex accent color for charts
  // ---- Ternary extension (Ni-Cr-Co) ----
  isTernary?: boolean;
  /** Second solute element (for ternary systems). */
  solute2?: string;
  /** Max fraction of the second solute. */
  xMax2?: number;
  /** Melting point of second solute (°C). */
  tMeltSolute2C?: number;
  /** CALPHAD binary interaction parameters (J/mol) for ternary. */
  omegaNiCr?: number;
  omegaNiCo?: number;
  omegaCrCo?: number;
}

export const ALLOY_SYSTEMS: Record<AlloySystemId, AlloySystemDef> = {
  "Al-Cu": {
    id: "Al-Cu",
    label: "Aluminium–Copper",
    solvent: "Al",
    solute: "Cu",
    xMax: 0.5,
    xEutectic: 0.33,
    tEutecticC: 548,
    xMaxSolid: 0.0565,
    tMeltSolventC: 660,
    tMeltSecondC: 591,
    primaryPhase: "α-Al (FCC)",
    secondPhase: "θ-Al₂Cu",
    liquidPhase: "Liquid",
    omegaL: -38000,
    omegaS: -52000,
    accent: "#d97706",
  },
  "Al-Si": {
    id: "Al-Si",
    label: "Aluminium–Silicon",
    solvent: "Al",
    solute: "Si",
    xMax: 0.6,
    xEutectic: 0.127,
    tEutecticC: 577,
    xMaxSolid: 0.016,
    tMeltSolventC: 660,
    tMeltSecondC: 1414,
    primaryPhase: "α-Al (FCC)",
    secondPhase: "β-Si",
    liquidPhase: "Liquid",
    omegaL: -18000,
    omegaS: -24000,
    accent: "#0891b2",
  },
  "Fe-C": {
    id: "Fe-C",
    label: "Iron–Carbon",
    solvent: "Fe",
    solute: "C",
    xMax: 0.067,
    xEutectic: 0.043,
    tEutecticC: 1154,
    xMaxSolid: 0.0218,
    tMeltSolventC: 1538,
    tMeltSecondC: 1227,
    primaryPhase: "γ-Fe (Austenite)",
    secondPhase: "Fe₃C (Cementite)",
    liquidPhase: "Liquid",
    omegaL: -62000,
    omegaS: -78000,
    accent: "#b45309",
  },
  // ---- Ni-Cr-Co ternary (superalloy base) ----
  // Real CALPHAD data from:
  //   - Gu & Du, "Thermodynamic assessment of the Ni–Co–Cr system" (J Alloys Compd)
  //   - Tauer, "Co-Cr binary system" (CALPHAD)
  //   - Ni-Cr: eutectic-type γ/α two-phase at ~1345°C, ~50wt% Cr
  //   - Ni-Co: isomorphous (complete FCC solid solubility, Tm 1455→1495°C)
  //   - Cr-Co: peritectic at ~1345°C
  // The ternary has a large γ(FCC) field on the Ni-Co side and α(BCC) on the
  // Cr-rich side, with a γ+α two-phase region in between. No intermetallics.
  "Ni-Cr-Co": {
    id: "Ni-Cr-Co",
    label: "Nickel–Chromium–Cobalt",
    solvent: "Ni",
    solute: "Cr",
    xMax: 0.60,
    xEutectic: 0.50,        // γ/α boundary (not a true eutectic — solid-solution gap)
    tEutecticC: 1345,       // γ+α two-phase onset temperature
    xMaxSolid: 0.47,        // max Cr solubility in γ(FCC) at service T
    tMeltSolventC: 1455,    // Tm of pure Ni
    tMeltSecondC: 1907,     // Tm of pure Cr (BCC)
    primaryPhase: "γ-Ni (FCC)",
    secondPhase: "α-Cr (BCC)",
    liquidPhase: "Liquid",
    omegaL: -25000,         // Ω_NiCr (liquid) — ordering tendency
    omegaS: -35000,         // Ω_NiCr (solid) — stronger ordering
    accent: "#6366f1",      // indigo accent for Ni-superalloys
    isTernary: true,
    solute2: "Co",
    xMax2: 0.50,
    tMeltSolute2C: 1495,    // Tm of pure Co
    // CALPHAD binary interaction parameters (J/mol) from Gu & Du assessment:
    omegaNiCr: -25000,
    omegaNiCo: 4000,        // nearly ideal, slight demixing
    omegaCrCo: -12000,
  },
};

export const R_GAS = 8.314; // J/(mol·K)

/** Phase fraction result returned by the surrogate. */
export interface PhaseFractions {
  liquid: number;
  primary: number; // α / γ
  secondary: number; // θ / β / cementite
  dominantPhase: string;
  phases: { name: string; fraction: number; color: string }[];
}

/**
 * Regular-solution Gibbs free energy of a phase (J/mol).
 *   G = x·G_solute + (1-x)·G_solvent + Ω·x·(1-x) + R·T·(x·ln x + (1-x)·ln(1-x))
 */
export function gibbsFreeEnergy(
  x: number,
  T_K: number,
  gSolvent: number,
  gSolute: number,
  omega: number,
): number {
  const xClamped = Math.min(Math.max(x, 1e-6), 1 - 1e-6);
  const mixing =
    R_GAS *
    T_K *
    (xClamped * Math.log(xClamped) + (1 - xClamped) * Math.log(1 - xClamped));
  const excess = omega * xClamped * (1 - xClamped);
  return xClamped * gSolute + (1 - xClamped) * gSolvent + excess + mixing;
}

/**
 * Linearised liquidus temperature (°C) for composition x (wt frac).
 * Approximates the real liquidus with a piecewise-linear model anchored at the
 * pure-solvent melting point and the eutectic point — sufficient for a
 * surrogate-driven dashboard.
 */
export function liquidusC(x: number, sys: AlloySystemDef): number {
  const xC = Math.min(Math.max(x, 0), sys.xEutectic);
  // slope from pure solvent melt to eutectic
  const slope = (sys.tEutecticC - sys.tMeltSolventC) / sys.xEutectic;
  return sys.tMeltSolventC + slope * xC;
}

/** Solvus temperature (°C): solubility limit of solute in the primary phase. */
export function solvusC(x: number, sys: AlloySystemDef): number {
  // Arrhenius-style solid solubility, anchored at the eutectic point:
  //   x_solv(T) = x_max_solid * exp[-Q/R * (1/T - 1/T_eutectic)]
  // Solubility DECREASES with falling temperature, so for x < x_max the
  // solvus temperature lies BELOW the eutectic temperature (the α-solvus of
  // Al-Cu descends from 5.65 wt% / 548 °C toward pure Al at low T).
  const xC = Math.min(Math.max(x, 1e-5), sys.xMaxSolid);
  if (xC >= sys.xMaxSolid) return sys.tEutecticC;
  const ratio = xC / sys.xMaxSolid;
  const tE = sys.tEutecticC + 273.15;
  const Q = 50000; // J/mol apparent heat of solution
  // Invert: 1/T = 1/T_e - (R/Q) * ln(x/x_max)   [ln(ratio) < 0 → T < T_e]
  const invT = 1 / tE - (R_GAS / Q) * Math.log(ratio);
  const T = 1 / invT;
  return T - 273.15;
}

/**
 * Solidus temperature (°C) of the primary phase: boundary between (α) and
 * (α + Liquid), running from the pure-solvent melt at x=0 down to the
 * maximum solid solubility at the eutectic temperature.
 */
export function tSolidusC(x: number, sys: AlloySystemDef): number {
  const xC = Math.min(Math.max(x, 0), sys.xMaxSolid);
  const frac = xC / sys.xMaxSolid;
  return sys.tMeltSolventC - (sys.tMeltSolventC - sys.tEutecticC) * frac;
}

/**
 * Compute equilibrium phase fractions at (x, T) via the lever rule.
 * This mirrors the output of `surrogate_engine.TabularSurrogate.forward`.
 */
export function phaseFractions(
  x: number,
  T_C: number,
  sys: AlloySystemDef,
): PhaseFractions {
  const tLiq = liquidusC(x, sys);
  const tE = sys.tEutecticC;
  const tSolv = solvusC(x, sys);

  let liquid = 0;
  let primary = 0;
  let secondary = 0;

  if (T_C >= tLiq) {
    // Fully liquid
    liquid = 1;
  } else if (T_C >= tE && T_C < tLiq) {
    // L + primary region (above eutectic, below liquidus)
    // Lever rule between the liquidus and solidus compositions at T
    const xL = (sys.tMeltSolventC - T_C) / (sys.tMeltSolventC - tE) * sys.xEutectic;
    const xLq = Math.min(Math.max(xL, x), sys.xEutectic);
    // Solid composition at the interface: k·x_L (partition-coefficient model)
    const k = partitionCoefficient(sys);
    const xS = Math.min(Math.max(k * xLq, 0), sys.xMaxSolid);
    const denom = Math.max(xLq - xS, 1e-6);
    primary = (xLq - x) / denom;
    liquid = 1 - primary;
  } else {
    // Below eutectic: primary + secondary (θ / cementite / β-Si)
    if (x <= sys.xMaxSolid && T_C > tSolv) {
      // Single primary phase
      primary = 1;
    } else {
      // Two-phase: primary + secondary, lever rule between x_solid and x_intermetallic
      const xSolid = sys.xMaxSolid;
      // Intermetallic effective composition: Al2Cu ~ 0.546 Cu wt, Fe3C ~ 0.0669, Si ~ 1.0
      const xInter = sys.id === "Al-Cu" ? 0.546 : sys.id === "Al-Si" ? 1.0 : 0.0669;
      const denom = Math.max(xInter - xSolid, 1e-6);
      secondary = (x - xSolid) / denom;
      secondary = Math.min(Math.max(secondary, 0), 1);
      primary = 1 - secondary;
    }
  }

  // Clamp & normalise
  const total = liquid + primary + secondary || 1;
  liquid /= total;
  primary /= total;
  secondary /= total;

  const phases = [
    { name: sys.liquidPhase, fraction: liquid, color: "#ef4444" },
    { name: sys.primaryPhase, fraction: primary, color: "#f59e0b" },
    { name: sys.secondPhase, fraction: secondary, color: "#10b981" },
  ];
  const dominant = phases.reduce((a, b) => (b.fraction > a.fraction ? b : a));

  return {
    liquid,
    primary,
    secondary,
    dominantPhase: dominant.name,
    phases,
  };
}

export interface PhaseBoundaryPoint {
  x: number;
  t: number;
  kind: "liquidus" | "solidus" | "solvus" | "eutectic";
}

/** Sample the phase boundary curves for a diagram plot. */
export function phaseBoundaries(
  sys: AlloySystemDef,
  n: number = 80,
): PhaseBoundaryPoint[] {
  const pts: PhaseBoundaryPoint[] = [];
  // Liquidus: pure solvent melt → eutectic point
  for (let i = 0; i <= n; i++) {
    const x = (sys.xEutectic * i) / n;
    pts.push({ x, t: liquidusC(x, sys), kind: "liquidus" });
  }
  // Solidus: pure solvent melt → max solid solubility at the eutectic T
  for (let i = 0; i <= n; i++) {
    const x = (sys.xMaxSolid * i) / n;
    pts.push({ x, t: tSolidusC(x, sys), kind: "solidus" });
  }
  // Solvus: max solid solubility at the eutectic T, descending with falling T
  for (let i = 0; i <= n; i++) {
    const x = (sys.xMaxSolid * i) / n;
    pts.push({ x, t: solvusC(x, sys), kind: "solvus" });
  }
  // Eutectic isotherm
  pts.push({ x: 0, t: sys.tEutecticC, kind: "eutectic" });
  pts.push({ x: sys.xEutectic, t: sys.tEutecticC, kind: "eutectic" });
  return pts;
}

/** Gibbs free-energy curve for a phase across a composition grid at T. */
export function gibbsCurve(
  sys: AlloySystemDef,
  T_C: number,
  phase: "liquid" | "solid",
  n: number = 60,
): { x: number; g: number }[] {
  const T = T_C + 273.15;
  const gAl = phase === "liquid" ? 0 : -5000;
  const gCu = phase === "liquid" ? 0 : -8000;
  const omega = phase === "liquid" ? sys.omegaL : sys.omegaS;
  const out: { x: number; g: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (sys.xMax * i) / n;
    out.push({
      x,
      g: gibbsFreeEnergy(x, T, gAl, gCu, omega) / 1000, // kJ/mol
    });
  }
  return out;
}

/**
 * Hall-Petch yield strength: σ_y = σ0 + k·d^(−1/2)
 *
 * @param d_um mean grain diameter in µm
 * @param sigma0 friction stress in MPa
 * @param kMPaSqrtM Hall-Petch slope in MPa·√m (BCC Fe ≈ 0.55, FCC Al ≈ 0.15-0.45)
 * @returns σ_y in MPa
 */
export function hallPetch(
  d_um: number,
  sigma0 = 40,
  kMPaSqrtM = 0.45,
): number {
  const d_m = Math.max(d_um, 0.05) * 1e-6; // µm → m
  return sigma0 + kMPaSqrtM / Math.sqrt(d_m);
}

/** Predicted grain size (µm) from cooling rate (K/s) and composition. */
export function grainSize(x: number, coolingRateKs: number): number {
  // Faster cooling -> smaller grains. Base 120µm at 1 K/s.
  const base = 120 * Math.exp(-0.18 * x);
  return Math.max(0.4, base / Math.pow(1 + coolingRateKs, 0.45));
}

/** Precipitate density (1/µm^3) from composition + ageing temp. */
export function precipitateDensity(
  x: number,
  ageingTempC: number,
  coolingRateKs: number,
): number {
  const drive = Math.max(0, x - 0.02);
  const tempFactor = Math.exp(-(ageingTempC - 150) / 120);
  return Math.max(0, drive * tempFactor * (1 + 0.05 * coolingRateKs) * 2400);
}

// =============================================================================
// SCHEIL SOLIDIFICATION  (non-equilibrium, lever-rule with no solid diffusion)
// =============================================================================
//
// The Scheil-Gulliver approximation assumes:
//   (1) complete mixing in the liquid,
//   (2) zero diffusion in the solid,
//   (3) local equilibrium at the solid/liquid interface.
//
//   f_s = 1 - ((T_m - T_L)/(T_m - T))^(1/(1-k))          (Scheil equation)
//
// where k is the partition coefficient (k = x_s / x_l). The result is the
// solid-fraction vs temperature path the alloy actually follows during
// casting, ending at the eutectic with a final eutectic fraction that is
// LARGER than equilibrium predicts. This is the core of a "casting
// simulation" tab and is exactly what Thermo-Calc's Scheil module computes.
// -----------------------------------------------------------------------------

export interface ScheilPoint {
  T: number; // °C
  fs: number; // solid fraction [0..1]
  fl: number; // liquid fraction
  xL: number; // liquid composition (wt frac)
  xS: number; // solid composition at interface (wt frac)
  phase: "primary" | "eutectic";
}

export interface ScheilResult {
  points: ScheilPoint[];
  tLiquidus: number;
  tSolidus: number; // Scheil solidus (≈ eutectic)
  eutecticFraction: number;
  partitionCoeff: number;
  segregationRatio: number; // max xL / nominal
}

/** Effective partition coefficient k = x_solid / x_liquid (approx constant). */
export function partitionCoefficient(sys: AlloySystemDef): number {
  // k = x_max_solid / x_eutectic  (simplified from phase-diagram geometry)
  return Math.max(0.05, sys.xMaxSolid / sys.xEutectic);
}

/**
 * Run a Scheil solidification simulation for composition x0 (wt frac solute).
 *
 * Iterates in solid-fraction space using the Scheil-Gulliver mass balance
 *   x_L = x0 · (1 − f_s)^(k−1)
 * with the linearised liquidus to convert the liquid composition to a
 * temperature. This keeps f_s, x_L and T mutually consistent (the previous
 * version applied the exponent 1/k instead of 1/(1−k) and used an
 * independently-inverted x_L, which was inconsistent).
 */
export function scheilSolidification(
  sys: AlloySystemDef,
  x0: number,
  nSteps: number = 80,
): ScheilResult {
  const k = partitionCoefficient(sys);
  const tE = sys.tEutecticC;
  // The linearised liquidus + constant-k model is a hypoeutectic surrogate;
  // at/above the eutectic composition the alloy solidifies eutectically.
  const x0c = Math.min(Math.max(x0, 1e-6), sys.xEutectic);
  const tL = liquidusC(x0c, sys);
  const points: ScheilPoint[] = [];

  if (x0c >= sys.xEutectic - 1e-6) {
    // Pure eutectic: no primary solidification
    return {
      points: [{ T: tE, fs: 0, fl: 1, xL: sys.xEutectic, xS: sys.xEutectic, phase: "eutectic" }],
      tLiquidus: tE,
      tSolidus: tE,
      eutecticFraction: 1,
      partitionCoeff: k,
      segregationRatio: 1,
    };
  }

  // Scheil path in f_s space; the eutectic is reached when x_L hits x_eutectic
  const fsEutectic = 1 - Math.pow(Math.min(x0c / sys.xEutectic, 1), 1 / (k - 1));
  const fsMax = Math.min(fsEutectic, 0.999);

  for (let i = 0; i <= nSteps; i++) {
    const fs = (fsMax * i) / nSteps;
    const xL = Math.min(sys.xEutectic, x0c * Math.pow(Math.max(1 - fs, 1e-9), k - 1));
    const T = liquidusC(xL, sys);
    const xS = Math.min(k * xL, sys.xMaxSolid);
    points.push({ T, fs, fl: 1 - fs, xL, xS, phase: "primary" });
  }

  // Eutectic reaction consumes the remaining liquid at T_eutectic
  const lastPrimary = points[points.length - 1];
  const eutFrac = Math.max(0, 1 - lastPrimary.fs);
  points.push({
    T: tE,
    fs: 1,
    fl: 0,
    xL: sys.xEutectic,
    xS: sys.xEutectic,
    phase: "eutectic",
  });

  const segregationRatio = Math.max(...points.map((p) => p.xL)) / Math.max(x0c, 1e-6);

  return {
    points,
    tLiquidus: tL,
    tSolidus: tE,
    eutecticFraction: eutFrac,
    partitionCoeff: k,
    segregationRatio,
  };
}

// =============================================================================
// TTT / CCT DIAGRAM  (Time-Temperature-Transformation, steel-centric)
// =============================================================================
//
// For Fe-C steels, the TTT diagram maps the onset (and finish) of diffusional
// austenite decomposition as a function of isothermal hold temperature. The
// classic "C-curve" is modelled here with an Arrhenius rate:
//
//   τ(T) = τ_min · exp[ (Q/RT) · ((T - T_nose)/(T_A1 - T_nose))² ]
//
// which captures the C-shape: slow near the eutectoid (maximum driving force
// × diffusion), fast at the nose, slow again at low T (diffusion-limited).
// Martensite forms instantaneously below M_s.
// -----------------------------------------------------------------------------

export interface TttCurve {
  T: number; // °C
  t: number; // seconds (log scale)
  kind: "start" | "finish" | "martensite" | "austenite";
  phase: string;
}

export interface TttResult {
  curves: TttCurve[];
  A1: number; // eutectoid temperature °C
  A3: number;
  Ms: number; // martensite start °C
  Mf: number; // martensite finish °C
  nose: { T: number; t: number };
  phases: { name: string; color: string; range: [number, number] }[];
}

/**
 * Approximate eutectoid (A1), A3/Acm, Ms, Mf for a plain-carbon steel.
 *
 * @param C carbon content in **wt%** (0.44 = 0.44 %C), NOT a fraction.
 *
 * - A3 (hypoeutectoid, C ≤ 0.77 wt%): Andrews (1965) line 910 − 203·C,
 *   blended to meet A1 = 727 °C at the eutectoid composition.
 * - Acm (hypereutectoid): rises from A1 toward the austenite/cementite
 *   eutectic.
 * - Ms: Andrews 539 − 423·C.
 */
export function steelCriticalTemps(Cwt: number): {
  A1: number;
  A3: number;
  Ms: number;
  Mf: number;
} {
  const A1 = 727; // eutectoid temperature (°C)
  const C = Math.max(0, Cwt);
  let A3: number;
  if (C <= 0.55) {
    A3 = 910 - 203 * C; // Andrews line (upper range, C-poor side)
  } else if (C <= 0.77) {
    // blend Andrews line into the eutectoid point for continuity
    const slope = (A1 - (910 - 203 * 0.55)) / (0.77 - 0.55);
    A3 = 910 - 203 * 0.55 + slope * (C - 0.55);
  } else {
    // Acm: austenite + cementite boundary above the eutectoid
    A3 = A1 + 165 * (C - 0.77);
  }
  const Ms = 539 - 423 * C; // Andrews (plain-carbon)
  const Mf = Ms - 215;
  return {
    A1,
    A3: Math.max(A3, A1),
    Ms: Math.max(Ms, -150),
    Mf: Math.max(Mf, -200),
  };
}

/**
 * Build TTT diagram curves for an Fe-C steel.
 *
 * @param Cwt carbon content in **wt%** (0.8 = eutectoid).
 *
 * The C-curve uses a Gaussian-nosed kinetic model: transformation is fastest
 * at T_nose (≈150 °C below A1, where driving force × diffusion is maximal)
 * and slows exponentially on both sides — near A1 the driving force vanishes,
 * below the nose diffusion becomes the bottleneck. Nose times and the
 * start→finish band are calibrated so a eutectoid steel starts transforming
 * in ~1 s at the nose and finishes within 10²–10³ s, matching published
 * plain-carbon TTT diagrams within a factor of ~2.
 */
export function tttDiagram(Cwt: number): TttResult {
  const { A1, A3, Ms, Mf } = steelCriticalTemps(Cwt);
  const curves: TttCurve[] = [];
  const Tnose = A1 - 150; // nose ~150 °C below A1
  const tauNose = Math.min(12, Math.max(0.8, 0.8 + 15 * Math.pow(0.8 - Cwt, 2)));
  const tLow = Ms + 10;
  const span = A1 - tLow;

  // start & finish C-curves (pearlite + bainite combined band)
  for (let i = 0; i <= 60; i++) {
    const T = A1 - (i / 60) * span;
    if (T <= tLow) break;
    // normalized distance from the nose on either side
    const d = Math.abs(T - Tnose) / (span / 2);
    const tau = tauNose * Math.exp(12 * d * d);
    // 5% start / 95% finish via JMAK (n ≈ 1.5 → factor ln20/n vs ln0.0513/n)
    const jmakStart = Math.pow(-Math.log(0.95), 1 / 1.5);
    const jmakFinish = Math.pow(-Math.log(0.05), 1 / 1.5);
    const tStart = tau * jmakStart;
    const tFinish = tau * jmakFinish * 4; // empirical broadening of the band
    const phase = T > 550 ? "Pearlite" : T > Ms ? "Bainite" : "Martensite";
    curves.push({ T, t: tStart, kind: "start", phase });
    curves.push({ T, t: tFinish, kind: "finish", phase });
  }

  // Martensite isotherms (Ms, Mf)
  curves.push({ T: Ms, t: 0.01, kind: "martensite", phase: "Martensite" });
  curves.push({ T: Ms, t: 1e5, kind: "martensite", phase: "Martensite" });
  curves.push({ T: Mf, t: 0.01, kind: "martensite", phase: "Martensite" });
  curves.push({ T: Mf, t: 1e5, kind: "martensite", phase: "Martensite" });

  // Austenite stable region marker
  curves.push({ T: A1, t: 1, kind: "austenite", phase: "Austenite" });
  curves.push({ T: A3, t: 1, kind: "austenite", phase: "Austenite" });

  const phases = [
    { name: "Pearlite", color: "#a78bfa", range: [550, A1] as [number, number] },
    { name: "Bainite", color: "#34d399", range: [Ms + 30, 550] as [number, number] },
    { name: "Martensite", color: "#f87171", range: [Mf, Ms] as [number, number] },
    { name: "Austenite", color: "#fbbf24", range: [A1, A3] as [number, number] },
  ];

  return { curves, A1, A3, Ms, Mf, nose: { T: Tnose, t: tauNose }, phases };
}

// =============================================================================
// MECHANICAL PROPERTIES  (stress-strain, work hardening, fatigue S-N)
// =============================================================================
//
// Hollomon equation:        σ = K · ε^n          (uniform plastic region)
// Ludwik equation:          σ = σ_y + K · ε^n    (with yield offset)
// Manson-Coffin (fatigue):  Δε_p/2 = ε'_f · (2N_f)^c
// Basquin (HCF):            σ_a = σ'_f · (2N_f)^b
//
// These are the standard constitutive & fatigue laws used in a mechanical
// properties lab module. They give a real stress-strain curve and a real
// S-N (Wöhler) curve for any (composition, heat-treatment, grain size).
// -----------------------------------------------------------------------------

export interface StressStrainPoint {
  strain: number; // total strain (dimensionless)
  stress: number; // MPa
  elastic: boolean;
}

export interface StressStrainResult {
  curve: StressStrainPoint[];
  yieldStrength: number;
  ultimate: number;
  uniformElongation: number;
  youngsModulus: number;
  strainHardeningExp: number;
  kStrength: number;
}

/**
 * Build a true-stress / engineering-strain curve using the Ludwik-Hollomon
 * constitutive law + elastic loading, with necking at the Considère criterion
 * (dσ/dε = σ). Modulus & hardening depend on composition and grain size.
 */
export function stressStrainCurve(
  yieldStrength: number,
  grainSizeUm: number,
  C: number,
  nSteps: number = 120,
  youngsModulusMPa: number = 70000,
): StressStrainResult {
  const E = youngsModulusMPa; // Al alloys ≈ 70 GPa, steels ≈ 210 GPa
  // Strain-hardening exponent: more solute/interstitial C → less hardening
  const n = Math.max(0.06, 0.24 - 0.5 * C);
  // K chosen so the curve passes through (ε_y, σ_y): σ_y = K · ε_y^n
  const epsY = yieldStrength / E;
  const K = yieldStrength / Math.pow(Math.max(epsY, 1e-5), n);

  const curve: StressStrainPoint[] = [];
  // Elastic region up to yield
  for (let i = 0; i <= 12; i++) {
    const e = (epsY * i) / 12;
    curve.push({ strain: e, stress: E * e, elastic: true });
  }
  // Plastic region (Ludwik: σ = σ_y + K·(ε-ε_y)^n) until necking (Considère)
  // Necking when dσ/dε = σ  →  for Hollomon σ=K·ε^n this is ε = n.
  const epsNeck = n + epsY;
  let ultimate = yieldStrength;
  for (let i = 1; i <= nSteps; i++) {
    const e = epsY + (epsNeck - epsY) * (i / nSteps);
    const stress = yieldStrength + K * Math.pow(e - epsY, n);
    curve.push({ strain: e, stress, elastic: false });
    ultimate = Math.max(ultimate, stress);
  }
  return {
    curve,
    yieldStrength,
    ultimate,
    uniformElongation: epsNeck,
    youngsModulus: E,
    strainHardeningExp: n,
    kStrength: K,
  };
}

export interface SnPoint {
  Nf: number; // cycles to failure
  stressAmp: number; // MPa
  regime: "LCF" | "HCF" | "Endurance";
}

export interface FatigueResult {
  curve: SnPoint[];
  enduranceLimit: number;
  fatigueStrengthCoeff: number;
  fatigueStrengthExp: number;
  transitionLife: number;
}

/**
 * Basquin + Manson-Coffin S-N curve. endurance ~ 0.4·UTS for steels,
 * no true endurance limit for Al-alloys (use 5e8 cycles).
 */
export function snCurve(
  UTS: number,
  _yieldStrength: number,
  isSteel: boolean = false,
): FatigueResult {
  const sf = 1.15 * UTS; // fatigue strength coefficient σ'_f
  const b = -0.09; // Basquin exponent (elastic)
  const ef = 0.6; // fatigue ductility coefficient ε'_f
  const c = -0.6; // Coffin-Manson exponent (plastic)
  // Transition life N_t where elastic == plastic strain amplitude:
  //   σ'_f · (2N_t)^b  ==  E · ε'_f · (2N_t)^c
  //   →  2N_t = (E·ε'_f / σ'_f)^(1/(b−c))
  const E_mpa = isSteel ? 210000 : 70000;
  const twoNt = Math.pow((E_mpa * ef) / sf, 1 / (b - c));
  const transitionLife = Math.max(10, Math.round(twoNt / 2));
  const endurance = isSteel ? 0.4 * UTS : UTS * 0.3;

  const curve: SnPoint[] = [];
  const Ns = [1e1, 1e2, 1e3, 1e4, 5e4, 1e5, 1e6, 1e7, 5e7, 1e8, 5e8];
  for (const Nf of Ns) {
    // Basquin stress amplitude (elastic-dominant regime)
    let stressAmp = sf * Math.pow(Nf, b);
    if (isSteel && Nf > 1e6) stressAmp = Math.max(endurance, stressAmp);
    if (!isSteel && Nf >= 5e8) stressAmp = endurance;
    curve.push({
      Nf,
      stressAmp,
      regime: Nf < transitionLife ? "LCF" : Nf < 1e6 ? "HCF" : "Endurance",
    });
  }
  return {
    curve,
    enduranceLimit: endurance,
    fatigueStrengthCoeff: sf,
    fatigueStrengthExp: b,
    transitionLife,
  };
}

// =============================================================================
// TERNARY PHASE CALCULATIONS (Ni-Cr-Co)
// =============================================================================
//
// The Ni-Cr-Co system is a solid-solution superalloy base with:
//   • γ (FCC, Ni-rich) — the primary phase, stabilized by Co
//   • α (BCC, Cr-rich) — the secondary phase at high Cr content
//   • No intermetallic phases (unlike Al-Cu with θ-Al₂Cu)
//
// The ternary liquidus surface (from CALPHAD assessment by Gu & Du):
//   T_liq ≈ Tm_Ni - a₁·Cr + a₂·Co   (linear approx, wt%)
//   a₁ ≈ 2.2 °C/wt% Cr (liquidus drops toward the γ+α two-phase region)
//   a₂ ≈ 0.8 °C/wt% Co (Co raises the liquidus since Tm_Co > Tm_Ni)
//
// The γ/(γ+α) phase boundary shifts to higher Cr when Co is added (Co is an
// FCC stabiliser). We model this as:
//   Cr_boundary = 47 + 0.25·Co_wt%   (at service temperature)
//
// The (γ+α)/α boundary is ~90 wt% Cr (nearly pure Cr BCC).
// -----------------------------------------------------------------------------

/**
 * Ternary liquidus temperature (°C) for Ni-Cr-Co.
 * Linear approximation from the CALPHAD liquidus surface.
 */
export function ternaryLiquidusC(xCr: number, xCo: number): number {
  const crWt = xCr * 100;
  const coWt = xCo * 100;
  return 1455 - 2.2 * crWt + 0.8 * coWt;
}

/**
 * Ternary phase fractions for Ni-Cr-Co at (xCr, xCo, T).
 * Returns γ(FCC), α(BCC), and liquid fractions.
 */
export function ternaryPhaseFractions(
  xCr: number,
  xCo: number,
  T_C: number,
): PhaseFractions {
  const tLiq = ternaryLiquidusC(xCr, xCo);
  const crWt = xCr * 100;
  const coWt = xCo * 100;

  let liquid = 0;
  let primary = 0;   // γ (FCC)
  let secondary = 0; // α (BCC)

  // γ/(γ+α) boundary — Co stabilises γ (FCC), pushing boundary to higher Cr
  const crGammaBoundary = 47 + 0.25 * coWt;
  // (γ+α)/α boundary — nearly pure Cr
  const crAlphaBoundary = 90;

  if (T_C >= tLiq) {
    // Fully liquid
    liquid = 1;
  } else {
    // Solid: determine γ vs α vs γ+α
    if (crWt <= crGammaBoundary) {
      // Single γ (FCC) phase
      primary = 1;
    } else if (crWt >= crAlphaBoundary) {
      // Single α (BCC) phase
      secondary = 1;
    } else {
      // γ + α two-phase region — lever rule
      const denom = Math.max(crAlphaBoundary - crGammaBoundary, 1e-6);
      secondary = (crWt - crGammaBoundary) / denom;
      secondary = Math.min(Math.max(secondary, 0), 1);
      primary = 1 - secondary;
    }
  }

  const phases = [
    { name: "Liquid", fraction: liquid, color: "#ef4444" },
    { name: "γ-Ni (FCC)", fraction: primary, color: "#6366f1" },
    { name: "α-Cr (BCC)", fraction: secondary, color: "#10b981" },
  ];
  const dominant = phases.reduce((a, b) => (b.fraction > a.fraction ? b : a));

  return {
    liquid,
    primary,
    secondary,
    dominantPhase: dominant.name,
    phases,
  };
}

/**
 * Ternary Gibbs free energy for Ni-Cr-Co (regular solution, kJ/mol).
 * Uses the three binary interaction parameters from the CALPHAD assessment.
 *   G = Σ xi·Gi + Σ Ωij·xi·xj + RT·Σ xi·ln(xi)
 */
export function ternaryGibbsFreeEnergy(
  xCr: number,
  xCo: number,
  T_K: number,
  omegaNiCr: number,
  omegaNiCo: number,
  omegaCrCo: number,
): number {
  const xNi = Math.max(1 - xCr - xCo, 1e-6);
  const xC = Math.min(Math.max(xCr, 1e-6), 1 - 1e-6);
  const xO = Math.min(Math.max(xCo, 1e-6), 1 - 1e-6);
  const xN = Math.max(1 - xC - xO, 1e-6);

  // ideal mixing
  const mixing =
    R_GAS * T_K * (xN * Math.log(xN) + xC * Math.log(xC) + xO * Math.log(xO));
  // excess (pairwise binary interactions)
  const excess =
    omegaNiCr * xN * xC + omegaNiCo * xN * xO + omegaCrCo * xC * xO;
  // reference (pure element lattice stabilities, simplified)
  const ref = -5000 * xN - 8000 * xC - 6000 * xO;

  return (ref + excess + mixing) / 1000; // kJ/mol
}

/**
 * Grain size for Ni-Cr-Co (µm) — Ni-superalloys have finer grains than Al.
 * Base 80µm, Cr refines slightly, Co has minimal effect.
 */
export function ternaryGrainSize(xCr: number, xCo: number, coolingRateKs: number): number {
  const base = 80 * Math.exp(-3 * xCr);
  return Math.max(0.5, base / Math.pow(1 + coolingRateKs, 0.4));
}

/**
 * Precipitate density for Ni-Cr-Co — γ' (Ni₃(Al,Ti)) precipitates don't form
 * without Al/Ti, but Cr forms carbides and σ-phase at high Cr. Model as
 * Cr-driven for high-Cr alloys.
 */
export function ternaryPrecipitateDensity(
  xCr: number,
  xCo: number,
  ageingTempC: number,
  coolingRateKs: number,
): number {
  const drive = Math.max(0, xCr - 0.30);
  const tempFactor = Math.exp(-(ageingTempC - 700) / 150);
  return Math.max(0, drive * tempFactor * (1 + 0.04 * coolingRateKs) * 1800);
}

// =============================================================================
// UNIFIED YIELD-STRENGTH MODEL
// =============================================================================
// Single source of truth used by the Causal, Sensitivity, Overview, Failure
// and Report modules. Previously three slightly different formulas lived in
// causal.ts + the sensitivity/overview routes and disagreed for the same
// alloy. Physics: baseline (lattice) + solid-solution + precipitation
// (Orowan) + Hall-Petch + phase term, calibrated per alloy family.
// -----------------------------------------------------------------------------

export interface YieldBreakdown {
  yield: number; // MPa
  grain: number; // µm
  precip: number; // 1/µm³
  hallPetch: number; // MPa (full σ_y from Hall-Petch incl. σ0)
  baseline: number;
  solidSolution: number;
  orowan: number;
  phaseTerm: number;
}

/**
 * Unified yield-strength surrogate for the current alloy system.
 *
 * @param x solute fraction (wt frac of the system's solute)
 * @param H heat-treatment/ageing temperature (°C)
 * @param R cooling rate (K/s)
 * @param sysId alloy system
 * @param opts.sysPrimaryFrac equilibrium primary-phase fraction (Al-Cu term)
 * @param opts.xCo second solute fraction (Ni-Cr-Co ternary: Co)
 */
export function yieldStrengthModel(
  x: number,
  H: number,
  R: number,
  sysId: AlloySystemId,
  opts?: { sysPrimaryFrac?: number; xCo?: number },
): YieldBreakdown {
  const sysPrimaryFrac = opts?.sysPrimaryFrac ?? 1;
  const xCo = opts?.xCo ?? 0;

  if (sysId === "Ni-Cr-Co") {
    const grain = ternaryGrainSize(x, xCo, R);
    const precip = ternaryPrecipitateDensity(x, xCo, H, R);
    const hp = hallPetch(grain, 300, 0.45); // FCC Ni-base, k ≈ 0.45 MPa·√m
    const solidSolution = 250 * x + 200 * xCo;
    const orowan = 0.025 * precip;
    const phaseTerm = Math.exp(-Math.pow((H - 720) / 200, 2)) * 80; // γ′ ageing peak
    const yld = Math.max(
      200,
      300 + solidSolution + orowan + phaseTerm + (hp - 300) * 0.5,
    );
    return { yield: yld, grain, precip, hallPetch: hp, baseline: 300, solidSolution, orowan, phaseTerm };
  }

  const grain = grainSize(x, R);
  const precip = precipitateDensity(x, H, R);

  if (sysId === "Al-Si") {
    const hp = hallPetch(grain, 40, 0.15);
    const solidSolution = 120 * x;
    const phaseTerm = x > 0.05 ? 30 * (x - 0.05) * 100 : 0; // eutectic Si network
    const yld = Math.max(40, 80 + solidSolution + phaseTerm + (hp - 40));
    return { yield: yld, grain, precip, hallPetch: hp, baseline: 80, solidSolution, orowan: 0, phaseTerm };
  }

  if (sysId === "Fe-C") {
    const hp = hallPetch(grain, 150, 0.55); // BCC ferrite, k ≈ 0.55 MPa·√m
    const solidSolution = 500 * x; // interstitial C solid solution
    const phaseTerm = x > 0.02 ? 40 * (x - 0.02) * 100 : 0; // pearlite fraction
    const yld = Math.max(150, 150 + solidSolution + phaseTerm + (hp - 150));
    return { yield: yld, grain, precip, hallPetch: hp, baseline: 150, solidSolution, orowan: 0, phaseTerm };
  }

  // Default: Al-Cu
  const hp = hallPetch(grain, 40, 0.45);
  const solidSolution = 180 * x;
  const orowan = 0.018 * precip;
  const phaseTerm = 22 * sysPrimaryFrac;
  const yld = Math.max(40, 120 + solidSolution + orowan + phaseTerm + (hp - 40) - 1.6 * grain);
  return {
    yield: yld,
    grain,
    precip,
    hallPetch: hp,
    baseline: 120,
    solidSolution,
    orowan,
    phaseTerm,
  };
}
