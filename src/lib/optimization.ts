/**
 * optimization.ts
 * -----------------------------------------------------------------------------
 * A tiny Bayesian-optimization engine for alloy design. The objective is the
 * predicted yield strength from the causal model (which depends on composition,
 * heat-treatment T, and cooling rate). We use a Gaussian-process surrogate with
 * an expected-improvement acquisition function — the same loop a real materials-
 * informatics "active learning" campaign would run.
 *
 *   x = [C, H, R]            (composition, heat-treat T, cooling rate)
 *   f(x) = predicted σ_y(x)  (black-box, expensive "experiment")
 *   GP prior:  f ~ N(0, k(x,x'))
 *   kernel:    squared-exponential  k(x,x') = σ_f² exp(-||x-x'||²/(2ℓ²))
 *   acquisition: EI(x) = (μ - f*) Φ(z) + σ φ(z),   z = (μ - f*)/σ
 * -----------------------------------------------------------------------------
 */

import { predictYieldStrength } from "./causal";
import { ALLOY_SYSTEMS } from "./metallurgy";

export interface DesignPoint {
  C: number; // composition (wt frac solute)
  H: number; // heat-treat °C
  R: number; // cooling rate K/s
  y: number; // observed yield strength MPa
  source: "initial" | "bo" | "best";
}

export interface OptResult {
  points: DesignPoint[];
  best: DesignPoint;
  iterations: number;
  acquisitionEI: { x: number; ei: number }[]; // EI over a 1-D slice
  improvement: number; // best - initialBest
  convergence: { iter: number; bestY: number }[];
  bounds: { C: [number, number]; H: [number, number]; R: [number, number] };
  model: { kernel: string; lengthScale: number; noiseVariance: number };
}

const BOUNDS = {
  C: [0.01, 0.09] as [number, number],
  H: [160, 540] as [number, number],
  R: [1, 80] as [number, number],
};

/** Squared-exponential kernel. */
function seKernel(
  a: number[],
  b: number[],
  lengthScale: number,
  sigmaF: number,
): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return sigmaF * sigmaF * Math.exp(-s / (2 * lengthScale * lengthScale));
}

/** Standard-normal PDF & CDF (Abramowitz-Stegun approximation). */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

/** Normalise a [C,H,R] point to [0,1]^3 for the GP. */
function norm(x: [number, number, number]): number[] {
  return [
    (x[0] - BOUNDS.C[0]) / (BOUNDS.C[1] - BOUNDS.C[0]),
    (x[1] - BOUNDS.H[0]) / (BOUNDS.H[1] - BOUNDS.H[0]),
    (x[2] - BOUNDS.R[0]) / (BOUNDS.R[1] - BOUNDS.R[0]),
  ];
}

/** Objective: predicted yield strength for (C, H, R). */
function objective(C: number, H: number, R: number): number {
  const sys = ALLOY_SYSTEMS["Al-Cu"];
  // primary fraction approximation for the objective
  const frac = 1 - 0.6 * C;
  return predictYieldStrength(C, H, R, 25, frac, "Al-Cu").yield;
}

/**
 * Run a Bayesian-optimization loop. Seeds with a Latin-hypercube-style initial
 * design, then iterates: fit GP → maximise EI → evaluate objective → append.
 */
export function runBayesianOptimization(
  iterations: number = 12,
  seed: number = 7,
): OptResult {
  const rng = mulberry32(seed);
  const points: DesignPoint[] = [];

  // 5 initial points (quasi-LHS via stratified random)
  const nInit = 5;
  for (let i = 0; i < nInit; i++) {
    const C = BOUNDS.C[0] + ((i + 0.5 + (rng() - 0.5) * 0.4) / nInit) * (BOUNDS.C[1] - BOUNDS.C[0]);
    const H = BOUNDS.H[0] + ((i + 0.5 + (rng() - 0.5) * 0.4) / nInit) * (BOUNDS.H[1] - BOUNDS.H[0]);
    const R = BOUNDS.R[0] + ((i + 0.5 + (rng() - 0.5) * 0.4) / nInit) * (BOUNDS.R[1] - BOUNDS.R[0]);
    points.push({ C, H, R, y: objective(C, H, R), source: "initial" });
  }

  const initialBest = Math.max(...points.map((p) => p.y));
  const convergence: { iter: number; bestY: number }[] = [
    { iter: 0, bestY: initialBest },
  ];

  const lengthScale = 0.28;
  const sigmaF = 60;
  const noiseVar = 4;

  // GP fitting: pre-compute K (n×n) and its Cholesky-free inverse via solve.
  const buildGP = (pts: DesignPoint[]) => {
    const n = pts.length;
    const X = pts.map((p) => norm([p.C, p.H, p.R]));
    const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        K[i][j] =
          seKernel(X[i], X[j], lengthScale, sigmaF) + (i === j ? noiseVar : 0);
    // invert K via Gaussian elimination
    const Kinv = invert(K);
    const y = pts.map((p) => p.y);
    // alpha = Kinv · y
    const alpha = Kinv.map((row) => row.reduce((a, v, j) => a + v * y[j], 0));
    return { X, Kinv, alpha };
  };

  // GP posterior mean & variance at a candidate x*
  const predict = (gp: ReturnType<typeof buildGP>, xStar: number[]) => {
    const { X, Kinv, alpha } = gp;
    const n = X.length;
    const kStar = X.map((xi) => seKernel(xi, xStar, lengthScale, sigmaF));
    const mean = kStar.reduce((a, k, i) => a + k * alpha[i], 0);
    // variance = k(x*,x*) - kStarᵀ Kinv kStar
    let vReduce = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += Kinv[i][j] * kStar[j];
      vReduce += kStar[i] * s;
    }
    const variance = Math.max(1e-6, seKernel(xStar, xStar, lengthScale, sigmaF) - vReduce);
    return { mean, variance };
  };

  // Expected improvement
  const fBest = initialBest;
  const ei = (mean: number, variance: number) => {
    const sigma = Math.sqrt(variance);
    if (sigma < 1e-6) return 0;
    const z = (mean - fBest) / sigma;
    return (mean - fBest) * normCdf(z) + sigma * normPdf(z);
  };

  // Iterate
  for (let it = 0; it < iterations; it++) {
    const gp = buildGP(points);
    // maximise EI over a random grid
    let bestX: [number, number, number] | null = null;
    let bestEI = -Infinity;
    const gridN = 400;
    for (let g = 0; g < gridN; g++) {
      const C = BOUNDS.C[0] + rng() * (BOUNDS.C[1] - BOUNDS.C[0]);
      const H = BOUNDS.H[0] + rng() * (BOUNDS.H[1] - BOUNDS.H[0]);
      const R = BOUNDS.R[0] + rng() * (BOUNDS.R[1] - BOUNDS.R[0]);
      const xStar = norm([C, H, R]);
      const { mean, variance } = predict(gp, xStar);
      const e = ei(mean, variance);
      if (e > bestEI) {
        bestEI = e;
        bestX = [C, H, R];
      }
    }
    if (!bestX) break;
    const y = objective(bestX[0], bestX[1], bestX[2]);
    points.push({ C: bestX[0], H: bestX[1], R: bestX[2], y, source: "bo" });
    const curBest = Math.max(...points.map((p) => p.y));
    convergence.push({ iter: it + 1, bestY: curBest });
  }

  // Mark best
  const bestIdx = points.reduce(
    (bi, p, i, arr) => (p.y > arr[bi].y ? i : bi),
    0,
  );
  points[bestIdx] = { ...points[bestIdx], source: "best" };

  // EI slice over R (holding C, H at best)
  const gp = buildGP(points);
  const best = points[bestIdx];
  const acquisitionEI: { x: number; ei: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const R = BOUNDS.R[0] + (i / 60) * (BOUNDS.R[1] - BOUNDS.R[0]);
    const xStar = norm([best.C, best.H, R]);
    const { mean, variance } = predict(gp, xStar);
    acquisitionEI.push({ x: R, ei: ei(mean, variance) });
  }

  return {
    points,
    best,
    iterations,
    acquisitionEI,
    improvement: best.y - initialBest,
    convergence,
    bounds: BOUNDS,
    model: {
      kernel: "Squared-Exponential (RBF)",
      lengthScale,
      noiseVariance: noiseVar,
    },
  };
}

/** Matrix invert via Gauss-Jordan elimination (small matrices). */
function invert(m: number[][]): number[][] {
  const n = m.length;
  const aug: number[][] = m.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
    [aug[col], aug[piv]] = [aug[piv], aug[col]];
    const d = aug[col][col] || 1e-9;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

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
