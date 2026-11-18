/**
 * alloy-presets.ts
 * -----------------------------------------------------------------------------
 * Curated library of real engineering alloy tempers. Each preset maps to a
 * full lab recipe (alloy system + composition + heat-treatment T + cooling
 * rate) that approximates the real temper's processing window. Selecting a
 * preset loads all params into the Zustand store in one click.
 *
 * Values are approximate handbook processing parameters chosen so the surrogate
 * produces properties in the realistic range for each temper.
 * -----------------------------------------------------------------------------
 */

import type { AlloySystemId } from "./metallurgy";

export interface AlloyPreset {
  id: string;
  name: string;
  family: string;
  alloySystem: AlloySystemId;
  soluteFraction: number;   // wt fraction
  heatTreatmentC: number;   // °C
  coolingRateKs: number;    // K/s
  temperatureC: number;     // service/inspection temp
  description: string;
  expectedYield: number;    // MPa (handbook reference)
  category: "wrought-al" | "cast-al" | "steel" | "stainless";
}

export const ALLOY_PRESETS: AlloyPreset[] = [
  {
    id: "aa2024-t3",
    name: "AA2024-T3",
    family: "Al-Cu",
    alloySystem: "Al-Cu",
    soluteFraction: 0.045,
    heatTreatmentC: 495,
    coolingRateKs: 30,
    temperatureC: 25,
    description: "Solution-treated + cold-worked + naturally aged. High-strength aerospace skin.",
    expectedYield: 345,
    category: "wrought-al",
  },
  {
    id: "aa2024-t6",
    name: "AA2024-T6",
    family: "Al-Cu",
    alloySystem: "Al-Cu",
    soluteFraction: 0.045,
    heatTreatmentC: 190,
    coolingRateKs: 25,
    temperatureC: 25,
    description: "Solution-treated + artificially aged. Peak strength, lower ductility.",
    expectedYield: 395,
    category: "wrought-al",
  },
  {
    id: "aa7075-t6",
    name: "AA7075-T6 (sim)",
    family: "Al-Cu",
    alloySystem: "Al-Cu",
    soluteFraction: 0.06,
    heatTreatmentC: 120,
    coolingRateKs: 40,
    temperatureC: 25,
    description: "Simulated as Al-Cu surrogate. Real 7075 is Al-Zn-Mg-Cu; yield ~503 MPa.",
    expectedYield: 503,
    category: "wrought-al",
  },
  {
    id: "aa6061-t6",
    name: "AA6061-T6 (sim)",
    family: "Al-Si",
    alloySystem: "Al-Si",
    soluteFraction: 0.008,
    heatTreatmentC: 175,
    coolingRateKs: 15,
    temperatureC: 25,
    description: "Simulated as Al-Si surrogate. Real 6061 is Al-Mg-Si; yield ~276 MPa.",
    expectedYield: 276,
    category: "wrought-al",
  },
  {
    id: "a356-t6",
    name: "A356-T6 (cast)",
    family: "Al-Si",
    alloySystem: "Al-Si",
    soluteFraction: 0.07,
    heatTreatmentC: 155,
    coolingRateKs: 4,
    temperatureC: 25,
    description: "Cast Al-Si-Mg, solution-treated + aged. Common automotive wheel alloy.",
    expectedYield: 220,
    category: "cast-al",
  },
  {
    id: "alsi-eutectic",
    name: "Al-Si eutectic",
    family: "Al-Si",
    alloySystem: "Al-Si",
    soluteFraction: 0.127,
    heatTreatmentC: 200,
    coolingRateKs: 2,
    temperatureC: 25,
    description: "Near-eutectic Al-Si casting. Low-melting, excellent fluidity.",
    expectedYield: 150,
    category: "cast-al",
  },
  {
    id: "aisi4140-qt",
    name: "AISI 4140 Q&T",
    family: "Fe-C",
    alloySystem: "Fe-C",
    soluteFraction: 0.0040,
    heatTreatmentC: 650,
    coolingRateKs: 60,
    temperatureC: 25,
    description: "Quenched + tempered Cr-Mo steel. High toughness, yield ~655 MPa.",
    expectedYield: 655,
    category: "steel",
  },
  {
    id: "aisi4140-annealed",
    name: "AISI 4140 annealed",
    family: "Fe-C",
    alloySystem: "Fe-C",
    soluteFraction: 0.0040,
    heatTreatmentC: 845,
    coolingRateKs: 0.5,
    temperatureC: 25,
    description: "Fully annealed Cr-Mo steel. Soft, machinable, yield ~415 MPa.",
    expectedYield: 415,
    category: "steel",
  },
  {
    id: "aisi304-annealed",
    name: "AISI 304 (sim)",
    family: "Fe-C",
    alloySystem: "Fe-C",
    soluteFraction: 0.0008,
    heatTreatmentC: 1050,
    coolingRateKs: 8,
    temperatureC: 25,
    description: "Simulated as Fe-C surrogate. Real 304 is austenitic Cr-Ni; yield ~215 MPa.",
    expectedYield: 215,
    category: "stainless",
  },
  // ---- Ni-Cr-Co superalloy presets ----
  {
    id: "inconel625-base",
    name: "Inconel 625 (base)",
    family: "Ni-Cr-Co",
    alloySystem: "Ni-Cr-Co",
    soluteFraction: 0.217,
    heatTreatmentC: 650,
    coolingRateKs: 8,
    temperatureC: 25,
    description: "Ni-22Cr-9Mo-3Nb base (simulated as Ni-Cr-Co). Solid-solution strengthened, ~415 MPa yield.",
    expectedYield: 415,
    category: "wrought-al",
  },
  {
    id: "haynes188-base",
    name: "Haynes 188 (base)",
    family: "Ni-Cr-Co",
    alloySystem: "Ni-Cr-Co",
    soluteFraction: 0.22,
    heatTreatmentC: 1175,
    coolingRateKs: 6,
    temperatureC: 25,
    description: "Co-base superalloy Ni-22Cr-14W (simulated as Ni-Cr-Co). High-temp creep, ~460 MPa yield.",
    expectedYield: 460,
    category: "wrought-al",
  },
  {
    id: "nicrco-highcr",
    name: "Ni-Cr-Co High-Cr",
    family: "Ni-Cr-Co",
    alloySystem: "Ni-Cr-Co",
    soluteFraction: 0.45,
    heatTreatmentC: 800,
    coolingRateKs: 15,
    temperatureC: 25,
    description: "High-Cr Ni-Cr-Co for oxidation resistance. Near γ+α two-phase region.",
    expectedYield: 520,
    category: "wrought-al",
  },
];

export const PRESET_CATEGORIES: {
  id: AlloyPreset["category"];
  label: string;
}[] = [
  { id: "wrought-al", label: "Wrought Al" },
  { id: "cast-al", label: "Cast Al" },
  { id: "steel", label: "Steel" },
  { id: "stainless", label: "Stainless" },
];

