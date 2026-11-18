/**
 * lab-api.ts — typed fetch helpers for the three lab endpoints.
 */
"use client";

export interface PhaseFractionApi {
  ok: boolean;
  alloySystem: string;
  composition: { solute: number; solvent: number; soluteLabel: string };
  temperatureC: number;
  phaseFractions: {
    liquid: number;
    primary: number;
    secondary: number;
    dominantPhase: string;
    phases: { name: string; fraction: number; color: string }[];
  };
  boundaries: { x: number; t: number; kind: string }[];
  gibbs: {
    temperatureC: number;
    liquid: { x: number; g: number }[];
    solid: { x: number; g: number }[];
    unit: string;
  };
  microstructure: {
    grainSizeUm: number;
    precipitateDensity: number;
    hallPetchMPa: number;
  };
  yieldStrength: { yield: number; grain: number; precip: number; hallPetch: number };
  surrogateMeta: {
    model: string;
    inferenceMs: number;
    trainedOn: string;
    uncertainty: Record<string, number>;
  };
}

export interface MicrographApi {
  ok: boolean;
  error?: string;
  backend: string;
  model: string;
  seed: number;
  steps: number;
  guidanceScale: number;
  imageUrl: string;        // data URI built from imageB64 by the proxy
  inferenceMs: number;
  capabilities?: Record<string, unknown>;
}

export interface MicrographCatalogEntry {
  id: string;
  file: string;
  source: string;
  sourcePage?: string;
  author?: string;
  license?: string;
  caption?: string;
  alloy?: string;
  system?: string;
  technique?: string;
  magnification?: string;
  category?: string;
  origin?: string;
  width?: number;
  height?: number;
  year?: string;
}

export interface MicrographCatalogApi {
  ok: boolean;
  version?: number;
  entries: MicrographCatalogEntry[];
}

export interface MicrographSaveApi {
  ok: boolean;
  error?: string;
  entry?: MicrographCatalogEntry;
  total?: number;
}

export interface CausalEffectApi {
  ok: boolean;
  treatment: string;
  outcome: string;
  deltaR: number;
  ate: number;
  stdError: number;
  ciLower: number;
  ciUpper: number;
  baselineY: number;
  treatedY: number;
  n: number;
  estimand: string;
  refuters: { name: string; passed: boolean; newEstimate: number }[];
  path: { node: string; contribution: number }[];
  graph: {
    nodes: {
      id: string;
      label: string;
      symbol: string;
      kind: string;
      unit: string;
      x: number;
      y: number;
      description: string;
    }[];
    edges: { from: string; to: string; coefficient: number; label: string }[];
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export const predictPhase = (body: Record<string, unknown>) =>
  postJson<PhaseFractionApi>("/api/predict_phase", body);

export const generateMicrograph = (body: Record<string, unknown>) =>
  postJson<MicrographApi>("/api/micrograph/generate", body);

export const fetchMicrographCatalog = async (): Promise<MicrographCatalogApi> => {
  const res = await fetch("/api/micrograph/catalog");
  return res.json() as Promise<MicrographCatalogApi>;
};

export const saveMicrograph = (body: Record<string, unknown>) =>
  postJson<MicrographSaveApi>("/api/micrograph/save", body);

export const causalEffect = (body: Record<string, unknown>) =>
  postJson<CausalEffectApi>("/api/causal_effect", body);

// ---- new endpoint types ----------------------------------------------------

export interface ScheilApi {
  ok: boolean;
  alloySystem: string;
  composition: number;
  points: { T: number; fs: number; fl: number; xL: number; xS: number; phase: string }[];
  tLiquidus: number;
  tSolidus: number;
  eutecticFraction: number;
  partitionCoeff: number;
  segregationRatio: number;
}

export interface TttApi {
  ok: boolean;
  carbon: number;
  curves: { T: number; t: number; kind: string; phase: string }[];
  A1: number;
  A3: number;
  Ms: number;
  Mf: number;
  nose: { T: number; t: number };
  phases: { name: string; color: string; range: [number, number] }[];
}

export interface StressStrainApi {
  ok: boolean;
  stressStrain: {
    curve: { strain: number; stress: number; elastic: boolean }[];
    yieldStrength: number;
    ultimate: number;
    uniformElongation: number;
    youngsModulus: number;
    strainHardeningExp: number;
    kStrength: number;
  };
  fatigue: {
    curve: { Nf: number; stressAmp: number; regime: string }[];
    enduranceLimit: number;
    fatigueStrengthCoeff: number;
    fatigueStrengthExp: number;
    transitionLife: number;
  };
  grainSizeUm: number;
}

export interface OptimizeApi {
  ok: boolean;
  points: { C: number; H: number; R: number; y: number; source: string }[];
  best: { C: number; H: number; R: number; y: number; source: string };
  iterations: number;
  acquisitionEI: { x: number; ei: number }[];
  improvement: number;
  convergence: { iter: number; bestY: number }[];
  bounds: { C: [number, number]; H: [number, number]; R: [number, number] };
  model: { kernel: string; lengthScale: number; noiseVariance: number };
}

export interface ReferencesApi {
  ok: boolean;
  micrographs: import("./references").ReferenceMicrograph[];
  concepts: import("./references").ConceptSource[];
}

export const fetchScheil = (b: Record<string, unknown>) =>
  postJson<ScheilApi>("/api/scheil", b);
export const fetchTtt = (b: Record<string, unknown>) =>
  postJson<TttApi>("/api/ttt", b);
export const fetchStressStrain = (b: Record<string, unknown>) =>
  postJson<StressStrainApi>("/api/stress_strain", b);
export const fetchOptimize = (b: Record<string, unknown>) =>
  postJson<OptimizeApi>("/api/optimize", b);
export const fetchReferences = () =>
  postJson<ReferencesApi>("/api/references", {});

// ---- compare endpoint types -------------------------------------------------

export interface CompareAlloy {
  alloySystem: string;
  label: string;
  accent: string;
  soluteLabel: string;
  composition: number;
  coolingRateKs: number;
  heatTreatmentC: number;
  phaseFractions: { liquid: number; primary: number; secondary: number; dominantPhase: string };
  boundaries: { x: number; t: number; kind: string }[];
  metrics: {
    grainSizeUm: number;
    yieldStrength: number;
    uts: number;
    elongation: number;
    endurance: number;
    density: number;
  };
  stressStrain: { strain: number; stress: number }[];
}

export interface CompareApi {
  ok: boolean;
  a: CompareAlloy;
  b: CompareAlloy;
}

export const fetchCompare = (b: Record<string, unknown>) =>
  postJson<CompareApi>("/api/compare", b);

// ---- sensitivity endpoint types -------------------------------------------

export interface SensitivityApi {
  ok: boolean;
  alloySystem: string;
  heatTreatmentC: number;
  compositionAxis: number[];
  coolingRateAxis: number[];
  yieldMatrix: number[][];
  utsMatrix: number[][];
  sweepR: { R: number; yield: number; grain: number; ppt: number }[];
  sweepX: { x: number; yield: number; ppt: number }[];
  midpoint: { x: number; R: number };
  ranges: { xMin: number; xMax: number; rMin: number; rMax: number };
}

// ---- failure endpoint types ------------------------------------------------

export interface FailureApi {
  ok: boolean;
  alloySystem: string;
  inputs: { dSigma: number; a0: number; stressR: number; heatTreatmentC: number };
  material: { grainSizeUm: number; yieldStrength: number; uts: number; K_Ic: number };
  crack: {
    criticalFlaw_mm: number;
    parisC: number;
    parisM: number;
    geometryFactor: number;
    fatigueLife: number;
  };
  curve: { dK: number; dadN: string; a: number }[];
  aVsN: { N: number; a: number }[];
  failureMode: {
    mode: "Brittle" | "Ductile" | "Mixed";
    probabilities: { Brittle: number; Ductile: number; Fatigue: number };
    toughnessRatio: number;
  };
  safety: { nYield: number; nFracture: number };
}
