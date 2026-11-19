/**
 * lab-store.ts
 * -----------------------------------------------------------------------------
 * Zustand store holding the global "lab session" state: selected alloy system,
 * composition, temperature, heat-treatment & cooling-rate parameters, and the
 * diffusion sampling settings. Components subscribe to slices of this store so
 * the sidebar and every tab stay in sync.
 * -----------------------------------------------------------------------------
 */

import { create } from "zustand";
import type { AlloySystemId } from "@/lib/metallurgy";
import { DEFAULT_HT_WORKFLOW, type HTOptimizationResult, type HTResults, type HTStep } from "@/lib/heat-treatment-types";

export interface LabState {
  // --- Material & composition ---------------------------------------------
  alloySystem: AlloySystemId;
  /** Solute weight fraction (e.g. Cu in Al-Cu, Cr in Ni-Cr-Co). Solvent = 1 - soluteFraction - soluteFraction2. */
  soluteFraction: number;
  /** Second solute weight fraction (e.g. Co in Ni-Cr-Co). Only used for ternary systems. */
  soluteFraction2: number;
  temperatureC: number; // service / inspection temperature
  heatTreatmentC: number; // ageing / solutionising temperature
  coolingRateKs: number; // K/s
  holdingTimeHours: number; // annealing hold time (hr) — phase-field module
  magnification: number; // SEM magnification x

  // --- Surrogate model selection ------------------------------------------
  surrogateModel: "tabular-mlp" | "graph-gnn" | "ensemble";

  // --- Diffusion sampler ---------------------------------------------------
  diffusionSteps: number;
  guidanceScale: number;

  // --- Heat-treatment framework -------------------------------------------
  /** Steel alloying additions in wt% (Fe-C multicomponent systems). */
  niWt: number;
  crWt: number;
  mnWt: number;
  siWt: number;
  moWt: number;
  /** Multi-step heat-treatment workflow (the HT tab edits this). */
  htWorkflow: HTStep[];
  /** Last heat-treatment run results (null until first run). */
  htResults: HTResults | null;
  /** Currently selected workflow step id in the HT editor. */
  htSelectedStepId: string | null;

  // setters
  setAlloySystem: (s: AlloySystemId) => void;
  setSoluteFraction: (v: number) => void;
  setSoluteFraction2: (v: number) => void;
  setTemperatureC: (v: number) => void;
  setHeatTreatmentC: (v: number) => void;
  setCoolingRateKs: (v: number) => void;
  setHoldingTimeHours: (v: number) => void;
  setMagnification: (v: number) => void;
  setSurrogateModel: (m: LabState["surrogateModel"]) => void;
  setDiffusionSteps: (v: number) => void;
  setGuidanceScale: (v: number) => void;

  // HT setters
  setNiWt: (v: number) => void;
  setCrWt: (v: number) => void;
  setMnWt: (v: number) => void;
  setSiWt: (v: number) => void;
  setMoWt: (v: number) => void;
  setHtWorkflow: (steps: HTStep[]) => void;
  setHtResults: (r: HTResults | null) => void;
  selectHtStep: (id: string | null) => void;
  updateHtStep: (id: string, patch: Partial<HTStep>) => void;
  addHtStep: (step?: HTStep) => void;
  moveHtStep: (id: string, dir: "up" | "down") => void;
  removeHtStep: (id: string) => void;
  htOptimizationResult: HTOptimizationResult | null;
  setHtOptimizationResult: (r: HTOptimizationResult | null) => void;
}

/**
 * Ensure the store holds a workflow — hydrate the default pipeline when empty.
 * Called by the HT tab on mount.
 */
export function hydrateHtWorkflow(): void {
  const st = useLabStore.getState();
  if (!st.htWorkflow || st.htWorkflow.length === 0) {
    useLabStore.setState({ htWorkflow: DEFAULT_HT_WORKFLOW.map((s) => ({ ...s })) });
  }
}

export const useLabStore = create<LabState>((set) => ({
  alloySystem: "Al-Cu",
  soluteFraction: 0.04,
  soluteFraction2: 0.10, // default Co fraction for Ni-Cr-Co
  temperatureC: 25,
  heatTreatmentC: 190,
  coolingRateKs: 8,
  holdingTimeHours: 2,
  magnification: 2500,
  surrogateModel: "graph-gnn",
  diffusionSteps: 50,
  guidanceScale: 7.5,

  niWt: 0,
  crWt: 0,
  mnWt: 0,
  siWt: 0,
  moWt: 0,
  htWorkflow: DEFAULT_HT_WORKFLOW.map((s) => ({ ...s })),
  htResults: null,
  htSelectedStepId: null,

  setAlloySystem: (s) => set({ alloySystem: s }),
  setSoluteFraction: (v) => set({ soluteFraction: v }),
  setSoluteFraction2: (v) => set({ soluteFraction2: v }),
  setTemperatureC: (v) => set({ temperatureC: v }),
  setHeatTreatmentC: (v) => set({ heatTreatmentC: v }),
  setCoolingRateKs: (v) => set({ coolingRateKs: v }),
  setHoldingTimeHours: (v) => set({ holdingTimeHours: v }),
  setMagnification: (v) => set({ magnification: v }),
  setSurrogateModel: (m) => set({ surrogateModel: m }),
  setDiffusionSteps: (v) => set({ diffusionSteps: v }),
  setGuidanceScale: (v) => set({ guidanceScale: v }),

  setNiWt: (v) => set({ niWt: v }),
  setCrWt: (v) => set({ crWt: v }),
  setMnWt: (v) => set({ mnWt: v }),
  setSiWt: (v) => set({ siWt: v }),
  setMoWt: (v) => set({ moWt: v }),
  setHtWorkflow: (steps) => set({ htWorkflow: steps }),
  setHtResults: (r) => set({ htResults: r }),
  selectHtStep: (id) => set({ htSelectedStepId: id }),
  updateHtStep: (id, patch) =>
    set((st) => ({
      htWorkflow: st.htWorkflow.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  addHtStep: (step) =>
    set((st) => {
      const next = { ...DEFAULT_HT_WORKFLOW[0], ...step } as HTStep;
      next.id = "step-" + Date.now().toString(36);
      return { htWorkflow: [...st.htWorkflow, next], htSelectedStepId: next.id };
    }),
  moveHtStep: (id, dir) =>
    set((st) => {
      const idx = st.htWorkflow.findIndex((w) => w.id === id);
      const j = dir === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || j < 0 || j >= st.htWorkflow.length) return {};
      const wf = [...st.htWorkflow];
      [wf[idx], wf[j]] = [wf[j], wf[idx]];
      return { htWorkflow: wf };
    }),
  removeHtStep: (id) =>
    set((st) => ({ htWorkflow: st.htWorkflow.filter((w) => w.id !== id) })),
  htOptimizationResult: null,
  setHtOptimizationResult: (r) => set({ htOptimizationResult: r }),
}));
