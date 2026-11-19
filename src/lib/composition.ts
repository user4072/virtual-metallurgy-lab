/**
 * composition.ts — per-system alloying-element definitions + store → payload
 * helpers. Extra elements are sent to the pycalphad service as an explicit
 * composition dict (wt%), so equilibrium responds to the full alloy chemistry.
 */

import type { AlloySystemId } from "./metallurgy";

export interface ExtraElementDef {
  el: string; // element symbol (store key + payload key)
  label: string;
  maxWt: number;
}

/** Alloying elements offered per system (beyond the primary/secondary sliders). */
export const EXTRA_ELEMENTS: Partial<Record<AlloySystemId, ExtraElementDef[]>> = {
  "Al-Cu": [
    { el: "Mg", label: "Mg", maxWt: 5 },
    { el: "Si", label: "Si", maxWt: 3 },
    { el: "Fe", label: "Fe", maxWt: 2 },
  ],
  "Al-Si": [
    { el: "Mg", label: "Mg", maxWt: 3 },
    { el: "Cu", label: "Cu", maxWt: 5 },
    { el: "Fe", label: "Fe", maxWt: 2 },
  ],
  "Fe-C": [
    { el: "Mn", label: "Mn", maxWt: 5 },
    { el: "Si", label: "Si", maxWt: 3 },
    { el: "Cr", label: "Cr", maxWt: 5 },
    { el: "Ni", label: "Ni", maxWt: 5 },
    { el: "Mo", label: "Mo", maxWt: 3 },
  ],
  "Ni-Cr-Co": [
    { el: "Al", label: "Al", maxWt: 6 },
    { el: "Ti", label: "Ti", maxWt: 4 },
    { el: "Mo", label: "Mo", maxWt: 4 },
  ],
};

/** Fe-C extras mirror into the heat-treatment store fields. */
export const FEC_ELEMENT_TO_WT_FIELD: Record<string, string> = {
  Mn: "mnWt",
  Si: "siWt",
  Cr: "crWt",
  Ni: "niWt",
  Mo: "moWt",
};

export interface CompPayload {
  /** element symbol (uppercase, VA-free) → wt% */
  [el: string]: number;
}

/**
 * Build the composition payload (wt%) for the active system from the store.
 * Primary/secondary solutes come from their sliders; extras from compExtra.
 */
export function buildComposition(
  sysId: AlloySystemId,
  soluteFraction: number,
  soluteFraction2: number,
  compExtra: Record<string, number>,
): CompPayload {
  const payload: CompPayload = {};
  const extras = EXTRA_ELEMENTS[sysId] ?? [];

  if (sysId === "Fe-C") {
    payload.C = +(soluteFraction * 100).toFixed(3);
    payload.Fe = +(100 - payload.C).toFixed(3);
    for (const d of extras) {
      const v = +(compExtra[d.el] ?? 0).toFixed(3);
      payload[d.el.toUpperCase()] = v;
      payload.Fe = +(payload.Fe - v).toFixed(3);
    }
    payload.Fe = +Math.max(0, payload.Fe).toFixed(3);
    return payload;
  }

  if (sysId === "Al-Cu" || sysId === "Al-Si") {
    const solute = sysId === "Al-Cu" ? "Cu" : "Si";
    payload[solute] = +(soluteFraction * 100).toFixed(3);
    payload.Al = +(100 - payload[solute]).toFixed(3);
    for (const d of extras) {
      const v = +(compExtra[d.el] ?? 0).toFixed(3);
      payload[d.el.toUpperCase()] = v;
      payload.Al = +(payload.Al - v).toFixed(3);
    }
    payload.Al = +Math.max(0, payload.Al).toFixed(3);
    return payload;
  }

  if (sysId === "Ni-Cr-Co") {
    payload.Cr = +(soluteFraction * 100).toFixed(3);
    payload.Co = +(soluteFraction2 * 100).toFixed(3);
    payload.Ni = +(100 - payload.Cr - payload.Co).toFixed(3);
    for (const d of extras) {
      const v = +(compExtra[d.el] ?? 0).toFixed(3);
      payload[d.el.toUpperCase()] = v;
      payload.Ni = +(payload.Ni - v).toFixed(3);
    }
    payload.Ni = +Math.max(0, payload.Ni).toFixed(3);
    return payload;
  }

  // generic: treat soluteFraction as the system solute
  return payload;
}
