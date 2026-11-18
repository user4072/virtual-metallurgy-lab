/**
 * heat-treatment-types.ts
 * -----------------------------------------------------------------------------
 * Shared types, constants and small client-side helpers for the
 * Heat Treatment Simulation & Optimization Framework (the "heat" tab).
 *
 * Backend service runs on port 8001 (mini-services/heat-treatment-service).
 * API proxy routes live under /api/ht/ and forward to
 *   http://localhost:8001/<path>
 *
 * Heat-theme palette: amber / orange / rose / cyan / emerald / teal /
 * fuchsia / lime / yellow / slate (NO indigo or blue — those are reserved
 * for the diffusion / phase-diagram tabs and would clash here).
 * -----------------------------------------------------------------------------
 */

// ---- Process types ---------------------------------------------------------

/** The 11 heat-treatment process categories a workflow step can represent. */
export type HTProcess =
  | "austenitize"
  | "temper"
  | "solution_treat"
  | "age_hardening"
  | "stress_relief"
  | "anneal"
  | "normalize"
  | "quench"
  | "martemper"
  | "austemper"
  | "preheat";

export interface HTProcessOption {
  value: HTProcess;
  label: string;
  /** Short physics note shown in tooltips. */
  hint: string;
}

/** 11 process types — austenitize / temper / solution / age / stress-relief /
 *  anneal / normalize / quench / martemper / austemper / preheat. */
export const PROCESS_OPTIONS: HTProcessOption[] = [
  { value: "austenitize", label: "Austenitize", hint: "Heat above A3 to form γ-Fe (FCC) — dissolves carbon uniformly." },
  { value: "temper", label: "Temper", hint: "Reheat quenched martensite to relieve stress and trade hardness for toughness." },
  { value: "solution_treat", label: "Solution Treat", hint: "Dissolve solute into solid solution above the solvus, then quench." },
  { value: "age_hardening", label: "Age Hardening", hint: "Hold below the solvus to nucleate coherent GP zones / θ′ / β′ precipitates." },
  { value: "stress_relief", label: "Stress Relief", hint: "Sub-critical anneal to relax residual stresses without phase change." },
  { value: "anneal", label: "Anneal", hint: "Full softening cycle: austenitise + slow furnace cool to coarse pearlite." },
  { value: "normalize", label: "Normalize", hint: "Austenitise + still-air cool for a refined uniform ferrite/pearlite microstructure." },
  { value: "quench", label: "Interrupted Quench", hint: "Rapid cool below Ms to form martensite — fast enough to bypass the C-curve nose." },
  { value: "martemper", label: "Martemper", hint: "Quench to just above Ms in salt, equalise, then cool — minimises distortion & cracking." },
  { value: "austemper", hint: "Hold above Ms in salt bath to form bainite — high toughness, no quench cracks.", label: "Austemper" },
  { value: "preheat", label: "Preheat", hint: "Holding step below austenitising T to minimise thermal shock (tool steels)." },
];

// ---- Cooling methods -------------------------------------------------------

export type HTCoolingMethod =
  | "water_quench"
  | "oil_quench"
  | "polymer_quench"
  | "gas_quench"
  | "air_cool"
  | "furnace_cool"
  | "salt_bath"
  | "controlled";

export interface HTCoolingOption {
  value: HTCoolingMethod;
  label: string;
  /** Default cooling rate K/min — converted to K/s = /60 in physics. */
  rateKPerMin: number;
}

/** 8 cooling methods with default K/min cooling rates from the spec. */
export const COOLING_METHOD_OPTIONS: HTCoolingOption[] = [
  { value: "water_quench", label: "Water Quench", rateKPerMin: 6000 },
  { value: "oil_quench", label: "Oil Quench", rateKPerMin: 1500 },
  { value: "polymer_quench", label: "Polymer Quench", rateKPerMin: 3000 },
  { value: "gas_quench", label: "Gas Quench (N₂/H₂)", rateKPerMin: 600 },
  { value: "air_cool", label: "Still Air Cool", rateKPerMin: 60 },
  { value: "furnace_cool", label: "Furnace Cool", rateKPerMin: 6 },
  { value: "salt_bath", label: "Salt Bath", rateKPerMin: 300 },
  { value: "controlled", label: "Controlled Rate", rateKPerMin: 60 },
];

export const COOLING_RATE_BY_METHOD: Record<HTCoolingMethod, number> = Object.fromEntries(
  COOLING_METHOD_OPTIONS.map((m) => [m.value, m.rateKPerMin]),
) as Record<HTCoolingMethod, number>;

// ---- Atmospheres -----------------------------------------------------------

export type HTAtmosphere =
  | "air"
  | "nitrogen"
  | "argon"
  | "vacuum"
  | "hydrogen"
  | "endothermic"
  | "exothermic"
  | "inert";

export interface HTAtmosphereOption {
  value: HTAtmosphere;
  label: string;
}

/** 8 atmosphere options. */
export const ATMOSPHERE_OPTIONS: HTAtmosphereOption[] = [
  { value: "air", label: "Air (Oxidising)" },
  { value: "nitrogen", label: "Nitrogen (N₂)" },
  { value: "argon", label: "Argon (Ar)" },
  { value: "vacuum", label: "Vacuum" },
  { value: "hydrogen", label: "Hydrogen (H₂)" },
  { value: "endothermic", label: "Endothermic (CAR) — carburising" },
  { value: "exothermic", label: "Exothermic (DX) — protective" },
  { value: "inert", label: "Inert Blend" },
];

// ---- Color map (NO indigo/blue) -------------------------------------------

/** Tailwind utility-class fragments per process type — node fill + ring. */
export interface HTProcessColor {
  /** Tailwind classes for the chip/node background. */
  chip: string;
  /** Tailwind classes for the node border + glow. */
  ring: string;
  /** Hex color used by recharts (curve segments, bars). */
  hex: string;
  /** Foreground text tone for icons. */
  text: string;
}

export const PROCESS_COLORS: Record<HTProcess, HTProcessColor> = {
  austenitize: {
    chip: "bg-amber-500/15 border-amber-500/40",
    ring: "ring-amber-500/30",
    hex: "#f59e0b",
    text: "text-amber-400",
  },
  temper: {
    chip: "bg-orange-500/15 border-orange-500/40",
    ring: "ring-orange-500/30",
    hex: "#f97316",
    text: "text-orange-400",
  },
  solution_treat: {
    chip: "bg-rose-500/15 border-rose-500/40",
    ring: "ring-rose-500/30",
    hex: "#f43f5e",
    text: "text-rose-400",
  },
  age_hardening: {
    chip: "bg-emerald-500/15 border-emerald-500/40",
    ring: "ring-emerald-500/30",
    hex: "#10b981",
    text: "text-emerald-400",
  },
  stress_relief: {
    chip: "bg-teal-500/15 border-teal-500/40",
    ring: "ring-teal-500/30",
    hex: "#14b8a6",
    text: "text-teal-400",
  },
  anneal: {
    chip: "bg-cyan-500/15 border-cyan-500/40",
    ring: "ring-cyan-500/30",
    hex: "#06b6d4",
    text: "text-cyan-400",
  },
  normalize: {
    chip: "bg-fuchsia-500/15 border-fuchsia-500/40",
    ring: "ring-fuchsia-500/30",
    hex: "#d946ef",
    text: "text-fuchsia-400",
  },
  quench: {
    chip: "bg-lime-500/15 border-lime-500/40",
    ring: "ring-lime-500/30",
    hex: "#84cc16",
    text: "text-lime-400",
  },
  martemper: {
    chip: "bg-yellow-500/15 border-yellow-500/40",
    ring: "ring-yellow-500/30",
    hex: "#eab308",
    text: "text-yellow-400",
  },
  austemper: {
    chip: "bg-slate-400/15 border-slate-400/40",
    ring: "ring-slate-400/30",
    hex: "#94a3b8",
    text: "text-slate-300",
  },
  preheat: {
    chip: "bg-amber-700/15 border-amber-700/40",
    ring: "ring-amber-700/30",
    hex: "#b45309",
    text: "text-amber-600",
  },
};

// ---- Workflow step + workflow ---------------------------------------------

export interface HTStep {
  id: string;
  name: string;
  process: HTProcess;
  /** Target / hold temperature, °C. */
  targetTempC: number;
  /** Heating ramp rate, K/min. */
  heatingRate: number;
  /** Hold time at target, minutes. */
  holdingTimeMin: number;
  atmosphere: HTAtmosphere;
  /** Chamber pressure, MPa (vacuum ~ 1e-4, atmospheric ~0.101). */
  pressureMPa: number;
  coolingMethod: HTCoolingMethod;
  /** Cooling rate K/min — when cooling_method = 'controlled' this is the
   *  commanded rate; otherwise it is the default for the chosen method. */
  coolingRate: number;
  /** Cycle count >1 repeats the step (e.g. triple temper). */
  cycles: number;
}

export interface HTWorkflow {
  name: string;
  steps: HTStep[];
}

// ---- Alloy ----------------------------------------------------------------

export interface HTAlloy {
  /** One of the four lab alloy systems, e.g. "Fe-C". */
  system: string;
  /** Human-readable alloy name, e.g. "AISI 4340". */
  name: string;
  /** Composition in wt%, keyed by element symbol (e.g. "C": 0.4, "Ni": 1.8). */
  composition: Record<string, number>;
}

// ---- API response shapes ---------------------------------------------------

export interface HTPhaseFraction {
  name: string;
  fraction: number;
  color?: string;
  /** Optional uncertainty band ±. */
  sigma?: number;
}

export interface HTMicrostructure {
  grainSizeUm: number;
  phaseFractions: HTPhaseFraction[];
  dominantPhase: string;
  precipitateDensity?: number;
  retainedAustenitePct?: number;
}

export interface HTMechanicalProperties {
  yieldStrengthMPa: number;
  yieldStrengthSigma?: number;
  utsMPa: number;
  utsSigma?: number;
  hardnessHRC: number;
  hardnessHV: number;
  elongationPct: number;
  elongationSigma?: number;
  toughnessJ: number;
  fatigueStrengthMPa: number;
  youngsModulusGPa?: number;
}

export interface HTPhysicalProperties {
  densityGCm3: number;
  thermalConductivityWmK: number;
  electricalConductivityPctIACS: number;
  elasticModulusGPa: number;
  ctePpmPerK: number;
}

export interface HTProcessingHistoryEvent {
  /** Elapsed time (min) at end of step. */
  tMin: number;
  /** Temperature (°C) reached. */
  tempC: number;
  stepName: string;
  process: HTProcess;
  event: string;
  /** Phase fraction snapshot at this point (key → 0..1). */
  phases?: Record<string, number>;
}

export interface HTResults {
  ok: boolean;
  finalMicrostructure: HTMicrostructure;
  phaseFractions: Record<string, number>;
  mechanicalProperties: HTMechanicalProperties;
  physicalProperties: HTPhysicalProperties;
  processingHistory: HTProcessingHistoryEvent[];
  workflowSummary: { totalSteps: number; totalTimeMin: number; maxTempC: number; minTempC: number };
  uncertaintyEstimates?: Record<string, number>;
  /** Optional temperature-time profile points (server-computed when available). */
  temperatureProfile?: { t: number; T: number }[];
  error?: string;
}

// ---- Optimization ---------------------------------------------------------

export interface HTOptimizationTrial {
  params: Record<string, number>;
  objectives: Record<string, number>;
  feasible: boolean;
  isPareto?: boolean;
}

export interface HTOptimizationResult {
  ok: boolean;
  method: string;
  bestWorkflow: HTStep[];
  bestParams: Record<string, number>;
  bestProperties?: Partial<HTMechanicalProperties>;
  bestObjectiveValue: number;
  convergence: { iter: number; bestY: number }[];
  allTrials: HTOptimizationTrial[];
  paretoFront?: HTOptimizationTrial[];
  error?: string;
}

// ---- Presets --------------------------------------------------------------

export interface HTPreset {
  id: string;
  name: string;
  alloySystem: string;
  alloyName: string;
  description: string;
  composition: Record<string, number>;
  steps: HTStep[];
}

// ---- TTT / CCT ------------------------------------------------------------

export interface HTCurve {
  /** Temperature, °C. */
  T: number;
  /** Time, seconds. */
  t: number;
  /** "start" | "finish" | "martensite" | "critical" */
  kind: string;
  /** Phase label (e.g. "Pearlite", "Bainite", "Martensite"). */
  phase: string;
}

export interface HTDiagramResult {
  ok: boolean;
  curves: HTCurve[];
  Ms_C: number;
  Mf_C: number;
  A1_C: number;
  A3_C: number;
  error?: string;
}

// ---- Client-side helpers --------------------------------------------------

let _stepCounter = 0;
/** Generate a short unique id for a new workflow step. */
export function newStepId(): string {
  _stepCounter = (_stepCounter + 1) % 1_000_000;
  return `ht-step-${Date.now().toString(36)}-${_stepCounter.toString(36)}`;
}

/** Build a default step. If `prev` is supplied, mirror its target temp as a
 *  sane starting ramp target so successive steps chain nicely. */
export function makeDefaultStep(prev?: HTStep): HTStep {
  const id = newStepId();
  return {
    id,
    name: prev ? `Step ${prev.name ? "(copy)" : ""}`.trim() : "New Step",
    process: "temper",
    targetTempC: prev?.targetTempC ?? 550,
    heatingRate: 20,
    holdingTimeMin: 60,
    atmosphere: "argon",
    pressureMPa: 0.101,
    coolingMethod: "air_cool",
    coolingRate: COOLING_RATE_BY_METHOD.air_cool,
    cycles: 1,
  };
}

/** Default 2-step quench-and-temper workflow used to seed the store. */
export const DEFAULT_HT_WORKFLOW: HTStep[] = [
  {
    id: "ht-default-austenitize",
    name: "Austenitize",
    process: "austenitize",
    targetTempC: 850,
    heatingRate: 25,
    holdingTimeMin: 45,
    atmosphere: "argon",
    pressureMPa: 0.101,
    coolingMethod: "water_quench",
    coolingRate: COOLING_RATE_BY_METHOD.water_quench,
    cycles: 1,
  },
  {
    id: "ht-default-temper",
    name: "Temper",
    process: "temper",
    targetTempC: 550,
    heatingRate: 20,
    holdingTimeMin: 90,
    atmosphere: "argon",
    pressureMPa: 0.101,
    coolingMethod: "air_cool",
    coolingRate: COOLING_RATE_BY_METHOD.air_cool,
    cycles: 1,
  },
];

// ---- Temperature-time curve (client-side surrogate) -----------------------

/**
 * Client-side temperature-time profile surrogate.
 *
 * Each step contributes (per cycle):
 *   - a heating ramp  from the current T to step.targetTempC at step.heatingRate K/min
 *   - a hold at targetTempC for step.holdingTimeMin
 *   - a cooling ramp to either the next step's targetTempC or to room T (25°C)
 *     at step.coolingRate K/min (converted from K/min — units consistent).
 *
 * Returns ordered {t, T} sample points with at least 5 samples per segment.
 * The output is used to draw the TemperatureTimeCurveCard chart so the user
 * gets an instant visual even before the backend /run call returns.
 */
export function computeTemperatureTimeCurve(steps: HTStep[]): { t: number; T: number }[] {
  if (!steps || steps.length === 0) return [{ t: 0, T: 25 }];
  const ROOM_T = 25;
  const out: { t: number; T: number }[] = [];
  let t = 0;
  let currentT = ROOM_T;

  const pushSeg = (fromT: number, toT: number, durationMin: number, n = 8) => {
    if (durationMin <= 1e-6) return;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      out.push({ t: +(t + durationMin * f).toFixed(2), T: +(fromT + (toT - fromT) * f).toFixed(2) });
    }
    t += durationMin;
    currentT = toT;
  };

  out.push({ t: 0, T: ROOM_T });
  currentT = ROOM_T;

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    const cycles = Math.max(1, Math.floor(step.cycles ?? 1));
    const nextTarget = s + 1 < steps.length ? steps[s + 1].targetTempC : ROOM_T;
    for (let c = 0; c < cycles; c++) {
      // Heating ramp
      const dHeat = step.heatingRate > 0 ? Math.abs(step.targetTempC - currentT) / step.heatingRate : 0.5;
      pushSeg(currentT, step.targetTempC, Math.max(0.5, dHeat));
      // Hold
      out.push({ t: +(t + 0.01).toFixed(2), T: step.targetTempC });
      if (step.holdingTimeMin > 0) {
        pushSeg(step.targetTempC, step.targetTempC, step.holdingTimeMin, 4);
      }
      // Cooling to next target (or room at end of cycle for last cycle)
      const finalCoolT = c === cycles - 1 ? nextTarget : step.targetTempC;
      const dCool = step.coolingRate > 0 ? Math.abs(step.targetTempC - finalCoolT) / step.coolingRate : 0.5;
      pushSeg(step.targetTempC, finalCoolT, Math.max(0.5, dCool));
    }
  }
  // Ensure we end at room T
  if (out.length === 0 || Math.abs(out[out.length - 1].T - ROOM_T) > 1) {
    out.push({ t: +(t + 5).toFixed(2), T: ROOM_T });
  }
  return out;
}

// ---- Pretty phase-name mapping --------------------------------------------

const PHASE_PRETTY: Record<string, string> = {
  // Aluminium systems
  alpha_al: "α-Al (FCC)",
  alpha_al_fcc: "α-Al (FCC)",
  theta_al2cu: "θ-Al₂Cu",
  beta_si: "β-Si",
  silicon: "Si (eutectic)",
  gp_zones: "GP zones",
  theta_prime: "θ′ (Al₂Cu)",
  beta_prime: "β′ (Mg₂Si)",
  // Iron / steel
  ferrite: "Ferrite (α-Fe)",
  alpha_fe: "Ferrite (α-Fe)",
  austenite: "Austenite (γ-Fe)",
  gamma_fe: "Austenite (γ-Fe)",
  pearlite: "Pearlite",
  bainite: "Bainite",
  upper_bainite: "Upper Bainite",
  lower_bainite: "Lower Bainite",
  martensite: "Martensite",
  martensite_start: "Martensite (M_s)",
  martensite_finish: "Martensite (M_f)",
  retained_austenite: "Retained Austenite",
  cementite: "Cementite (Fe₃C)",
  fe3c: "Cementite (Fe₃C)",
  // Nickel / Ni-Cr-Co
  gamma_prime: "γ′ (Ni₃Al/Ti)",
  gamma_double_prime: "γ″ (Ni₃Nb)",
  delta: "δ (Ni₃Nb)",
  eta: "η (Ni₃Ti)",
  carbide: "MC Carbide",
  laves: "Laves",
  sigma: "σ (Sigma)",
  // Generic
  liquid: "Liquid",
  solid: "Solid",
};

/**
 * Map raw phase keys coming back from the backend (e.g. "alpha_al",
 * "martensite_start", "fe3c") into nicely formatted labels with proper
 * Greek/subscripts for the UI.  Falls through to a tidied-up version of
 * the raw key when no mapping is found.
 */
export function prettyPhase(raw: string): string {
  if (!raw) return "";
  const key = raw.trim().toLowerCase();
  if (PHASE_PRETTY[key]) return PHASE_PRETTY[key];
  // Try with underscores stripped
  if (PHASE_PRETTY[key.replace(/[\s-]/g, "_")]) return PHASE_PRETTY[key.replace(/[\s-]/g, "_")];
  // Fallback: capitalise each word
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Compact one-line summary of a step (used in node tooltips). */
export function summarizeStep(step: HTStep): string {
  return `${step.process} · ${step.targetTempC}°C · ${step.holdingTimeMin}min · ${step.coolingMethod}`;
}
