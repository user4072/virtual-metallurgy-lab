/**
 * causal.ts
 * -----------------------------------------------------------------------------
 * A linear Structural Causal Model (SCM) mirroring `causal_analyzer.py`.
 *
 *   Treatment variables (exogenous / manipulable):
 *     C   = Alloy Composition (Cu weight fraction)
 *     H   = Heat-treatment temperature (°C)
 *     R   = Cooling rate (K/s)
 *
 *   Mediator variables (microstructure features):
 *     G   = Grain size (µm)
 *     P   = Precipitate density (1/µm³)
 *     A   = α-phase fraction
 *
 *   Outcome:
 *     Y   = Yield strength (MPa)
 *
 * Structural equations (linear, additive Gaussian noise):
 *   G = β_GR·R + β_GH·H + β_GC·C + N_G
 *   P = β_PC·C + β_PH·H + N_P
 *   A = β_AC·C + N_A
 *   Y = β_YG·G + β_YP·P + β_YA·A + β_YC·C + N_Y
 *
 * The coefficients encode domain knowledge (Hall-Petch, precipitation
 * strengthening, solid-solution strengthening) so the model behaves like a
 * real DoWhy backdoor analysis would on observational metallurgical data.
 * -----------------------------------------------------------------------------
 */

import { yieldStrengthModel, type AlloySystemId } from "./metallurgy";

export interface CausalNode {
  id: string;
  label: string;
  symbol: string;
  kind: "treatment" | "mediator" | "outcome";
  unit: string;
  x: number; // layout position 0..1
  y: number;
  description: string;
}

export interface CausalEdge {
  from: string;
  to: string;
  coefficient: number; // β
  label: string;
  kind: "causal" | "confound";
}

export const CAUSAL_NODES: CausalNode[] = [
  {
    id: "C",
    label: "Alloy Composition",
    symbol: "C",
    kind: "treatment",
    unit: "wt frac Cu",
    x: 0.12,
    y: 0.18,
    description:
      "Solute (Cu) concentration — drives solid-solution & precipitation strengthening.",
  },
  {
    id: "H",
    label: "Heat-Treatment Temp.",
    symbol: "H",
    kind: "treatment",
    unit: "°C",
    x: 0.12,
    y: 0.5,
    description:
      "Solutionising / ageing temperature — controls precipitate nucleation & coarsening.",
  },
  {
    id: "R",
    label: "Cooling Rate",
    symbol: "R",
    kind: "treatment",
    unit: "K/s",
    x: 0.12,
    y: 0.82,
    description:
      "Quench severity — controls grain size via solidification / recrystallisation kinetics.",
  },
  {
    id: "G",
    label: "Grain Size",
    symbol: "G",
    kind: "mediator",
    unit: "µm",
    x: 0.5,
    y: 0.66,
    description: "Mean grain diameter — Hall–Petch σ ∝ d^(-1/2).",
  },
  {
    id: "P",
    label: "Precipitate Density",
    symbol: "P",
    kind: "mediator",
    unit: "1/µm³",
    x: 0.5,
    y: 0.4,
    description: "θ′/θ″ precipitate number density — Orowan strengthening.",
  },
  {
    id: "A",
    label: "α-Phase Fraction",
    symbol: "A",
    kind: "mediator",
    unit: "frac",
    x: 0.5,
    y: 0.15,
    description: "Equilibrium primary-phase fraction from the surrogate.",
  },
  {
    id: "Y",
    label: "Yield Strength",
    symbol: "Y",
    kind: "outcome",
    unit: "MPa",
    x: 0.88,
    y: 0.5,
    description: "0.2% proof stress — the engineering quantity of interest.",
  },
];

// Coefficients (physically sensible signs / magnitudes)
export const CAUSAL_EDGES: CausalEdge[] = [
  { from: "C", to: "G", coefficient: -8, label: "β_GC", kind: "causal" },
  { from: "C", to: "P", coefficient: 1400, label: "β_PC", kind: "causal" },
  { from: "C", to: "A", coefficient: -0.6, label: "β_AC", kind: "causal" },
  { from: "C", to: "Y", coefficient: 180, label: "β_YC (solid-sol.)", kind: "causal" },
  { from: "H", to: "G", coefficient: 0.04, label: "β_GH", kind: "causal" },
  { from: "H", to: "P", coefficient: -1.2, label: "β_PH", kind: "causal" },
  { from: "R", to: "G", coefficient: -1.4, label: "β_GR", kind: "causal" },
  { from: "R", to: "P", coefficient: 4, label: "β_PR", kind: "causal" },
  { from: "G", to: "Y", coefficient: -1.6, label: "β_YG (Hall–Petch)", kind: "causal" },
  { from: "P", to: "Y", coefficient: 0.018, label: "β_YP (Orowan)", kind: "causal" },
  { from: "A", to: "Y", coefficient: 22, label: "β_YA", kind: "causal" },
];

export interface CausalSample {
  C: number;
  H: number;
  R: number;
  G: number;
  P: number;
  A: number;
  Y: number;
}

/** Gaussian noise via Box–Muller (deterministic given seed). */
function gauss(rng: () => number, mean: number, std: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

/** Mulberry32 PRNG for reproducible sampling. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample n observational rows from the SCM.
 * C ~ U(0.01, 0.10), H ~ U(160, 540), R ~ U(0.5, 60).
 */
export function sampleObservational(n: number, seed = 42): CausalSample[] {
  const rng = mulberry32(seed);
  const out: CausalSample[] = [];
  for (let i = 0; i < n; i++) {
    const C = 0.01 + rng() * 0.09;
    const H = 160 + rng() * 380;
    const R = 0.5 + rng() * 59.5;
    const G = clamp(-1.4 * R + 0.04 * H - 8 * C + 130 + gauss(rng, 0, 3), 0.4, 200);
    const P = clamp(1400 * C - 1.2 * H + 4 * R + 300 + gauss(rng, 0, 40), 0, 4000);
    const A = clamp(1 - 0.6 * C + gauss(rng, 0, 0.02), 0, 1);
    const Y =
      -1.6 * G + 0.018 * P + 22 * A + 180 * C + 280 + gauss(rng, 0, 6);
    out.push({ C, H, R, G, P, A, Y: Math.max(60, Y) });
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface Ateresult {
  ate: number; // Average Treatment Effect (MPa per ΔR)
  stdError: number;
  ciLower: number;
  ciUpper: number;
  baselineY: number;
  treatedY: number;
  n: number;
  estimand: string;
  refuters: { name: string; passed: boolean; newEstimate: number }[];
  path: { node: string; contribution: number }[];
}

/**
 * Ordinary least squares via the normal equations (Gaussian elimination).
 * X rows include a leading 1 for the intercept. Returns one coefficient per
 * column of X.
 */
function ols(y: number[], X: number[][]): number[] {
  const p = X[0].length;
  // A = XᵀX, b = Xᵀy
  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const b: number[] = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += X[i][j] * X[i][k];
    }
  }
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < p; r++) {
      const f = A[r][col] / (A[col][col] || 1e-12);
      for (let c = col; c < p; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const beta = new Array(p).fill(0);
  for (let r = p - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < p; c++) s -= A[r][c] * beta[c];
    beta[r] = s / (A[r][r] || 1e-12);
  }
  return beta;
}

/** Design matrix rows [1, R, G, P, A, C] (+ optional extra columns). */
function designRows(rows: CausalSample[], extra: number[] | null = null): number[][] {
  const X = rows.map((d, i) => [1, d.R, d.G, d.P, d.A, d.C, ...(extra ? [extra[i]] : [])]);
  return X;
}

/**
 * Estimate the Average Treatment Effect of increasing cooling rate by
 * `deltaR` (K/s) on yield strength.
 *
 * Estimator: OLS of Y on [R, G, P, A, C] over the observational sample. R is
 * exogenous in the DAG (no backdoor parents), so the R-coefficient is the
 * total causal effect — this is the DoWhy backdoor linear-regression
 * estimator. Uncertainty comes from a bootstrap over the data. Because we
 * also own the SCM, we additionally compute the exact interventional
 * ATE by forward-sampling do(R) — reported via baseline/treated Y.
 */
export function estimateATE(
  deltaR: number,
  sampleSize: number = 2000,
  seed = 42,
): Ateresult {
  const rng = mulberry32(seed);
  const data = sampleObservational(sampleSize, seed);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanR = mean(data.map((d) => d.R));

  // --- Primary estimator: OLS slope of Y on R (backdoor: none needed) ----
  const X = designRows(data);
  const y = data.map((d) => d.Y);
  const beta = ols(y, X);
  const slopeR = beta[1]; // MPa per (K/s) — total causal effect
  const ate = slopeR * deltaR;

  // --- Uncertainty: bootstrap over the observational sample --------------
  const B = 40;
  const boot: number[] = [];
  for (let b = 0; b < B; b++) {
    const idx: CausalSample[] = [];
    for (let i = 0; i < data.length; i++) {
      idx.push(data[Math.floor(rng() * data.length)]);
    }
    const bb = ols(
      idx.map((d) => d.Y),
      designRows(idx),
    );
    boot.push(bb[1] * deltaR);
  }
  boot.sort((a, b2) => a - b2);
  const se = Math.max(
    (boot[Math.floor(0.975 * B)] - boot[Math.floor(0.025 * B)]) / (2 * 1.96),
    1e-6,
  );
  const ciLower = ate - 1.96 * se;
  const ciUpper = ate + 1.96 * se;

  // --- Ground truth for this SCM: forward-sampling do(R) -----------------
  const r0 = meanR;
  const r1 = meanR + deltaR;
  const drawMediators = (R: number, H: number, C: number) => {
    const G = clamp(-1.4 * R + 0.04 * H - 8 * C + 130 + gauss(rng, 0, 3), 0.4, 200);
    const P = clamp(1400 * C - 1.2 * H + 4 * R + 300, 0, 4000);
    const A = clamp(1 - 0.6 * C, 0, 1);
    const Y = Math.max(60, -1.6 * G + 0.018 * P + 22 * A + 180 * C + 280 + gauss(rng, 0, 6));
    return { G, P, A, Y };
  };
  let baseYSum = 0;
  let treatedYSum = 0;
  const m = 400;
  for (let i = 0; i < m; i++) {
    const H = 160 + rng() * 380;
    const C = 0.01 + rng() * 0.09;
    baseYSum += drawMediators(r0, H, C).Y;
    treatedYSum += drawMediators(r1, H, C).Y;
  }
  const baselineY = baseYSum / m;
  const treatedY = treatedYSum / m;
  const interventionalATE = treatedY - baselineY;

  // --- Refuters: REAL DoWhy-style sanity checks ---------------------------
  // 1. Placebo treatment — replace R with a random permutation (breaks the
  //    causal link); the estimated "effect" should collapse toward zero.
  const perm = [...data].sort(() => rng() - 0.5);
  const XPlacebo = designRows(data).map((row, i) => [row[0], perm[i].R, ...row.slice(2)]);
  const placeboSlope = ols(y, XPlacebo)[1] * deltaR;

  // 2. Random common cause — add a noise covariate Z~N(0,1); the R effect
  //    should be robust to its inclusion.
  const zCol = data.map(() => gauss(rng, 0, 1));
  const zSlope = ols(y, designRows(data, zCol))[1] * deltaR;

  // 3. Data subsetting — median over 20 random 80% subsets.
  const subsetEstimates: number[] = [];
  for (let s = 0; s < 20; s++) {
    const subset = data.filter(() => rng() < 0.8);
    if (subset.length > 20) {
      subsetEstimates.push(ols(subset.map((d) => d.Y), designRows(subset))[1] * deltaR);
    }
  }
  subsetEstimates.sort((a, b2) => a - b2);
  const subsetMedian = subsetEstimates[Math.floor(subsetEstimates.length / 2)] ?? ate;

  const tol = Math.max(Math.abs(ate) * 0.15, 1e-6);
  const refuters = [
    {
      name: "Placebo Treatment (permuted R)",
      passed: Math.abs(placeboSlope) < Math.abs(ate) * 0.1,
      newEstimate: placeboSlope,
    },
    {
      name: "Random Common Cause (noise covariate)",
      passed: Math.abs(zSlope - ate) < tol,
      newEstimate: zSlope,
    },
    {
      name: "Data Subsetting (80% subsets)",
      passed: Math.abs(subsetMedian - ate) < tol,
      newEstimate: subsetMedian,
    },
  ];

  // Path decomposition of the mediated effect (R → Y runs through G and P)
  const dG = -1.4 * deltaR; // ΔG from ΔR (Hall–Petch path)
  const dP = 4 * deltaR;     // ΔP from ΔR (Orowan path)
  const path = [
    { node: "R → G → Y  (Hall–Petch)", contribution: -1.6 * dG },
    { node: "R → P → Y  (Orowan)", contribution: 0.018 * dP },
    { node: "Direct R → Y", contribution: 0 },
  ];

  return {
    ate,
    stdError: se,
    ciLower,
    ciUpper,
    baselineY,
    treatedY,
    n: sampleSize,
    estimand: `ATE = E[Y | do(R=r+Δr)] − E[Y | do(R=r)], Δr=${deltaR} K/s (OLS estimate ${slopeR.toFixed(3)} MPa·s/K; interventional ground truth ${interventionalATE.toFixed(2)} MPa)`,
    refuters,
    path,
  };
}

/**
 * Compute the predicted yield strength for an explicit processing setting.
 * Thin wrapper around the unified `yieldStrengthModel` in metallurgy.ts —
 * the single source of truth shared with the Sensitivity / Overview /
 * Failure / Report routes. See there for the per-alloy physics.
 */
export function predictYieldStrength(
  C: number,
  H: number,
  R: number,
  T_C: number,
  sysPrimaryFrac: number,
  alloySystem?: string,
  Co?: number,
): { yield: number; grain: number; precip: number; hallPetch: number } {
  const sys = (alloySystem ?? "Al-Cu") as AlloySystemId;
  const m = yieldStrengthModel(C, H, R, sys, {
    sysPrimaryFrac,
    xCo: Co,
  });
  return { yield: m.yield, grain: m.grain, precip: m.precip, hallPetch: m.hallPetch };
}
