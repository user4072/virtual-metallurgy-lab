/**
 * GET /api/ht/presets
 * Tries Python backend; falls back to built-in presets.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const UPSTREAM = "http://localhost:8001/presets";

const BUILTIN_PRESETS = [
  {
    id: "quench-temper-1040", name: "Quench & Temper (AISI 1040)", description: "Austenitize → water quench → temper",
    alloy_system: "Fe-C", composition: { C: 0.40, Mn: 0.75, Si: 0.20 },
    steps: [
      { id: "s1", name: "Austenitize", process: "austenitize", target_temp_c: 850, heating_rate: 10, holding_time_min: 60, atmosphere: "argon", pressure_mpa: 0.1, cooling_method: "water_quench", cooling_rate: 6000, cycles: 1 },
      { id: "s2", name: "Temper", process: "temper", target_temp_c: 550, heating_rate: 5, holding_time_min: 120, atmosphere: "air", pressure_mpa: 0.1, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
    ],
  },
  {
    id: "age-hardening-alcu-4", name: "Age Hardening (Al-4Cu)", description: "Solution treat → quench → age",
    alloy_system: "Al-Cu", composition: { Cu: 4.0 },
    steps: [
      { id: "s1", name: "Solution Treat", process: "solution_treat", target_temp_c: 540, heating_rate: 10, holding_time_min: 90, atmosphere: "argon", pressure_mpa: 0.1, cooling_method: "water_quench", cooling_rate: 6000, cycles: 1 },
      { id: "s2", name: "Age", process: "age_hardening", target_temp_c: 190, heating_rate: 5, holding_time_min: 480, atmosphere: "air", pressure_mpa: 0.1, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
    ],
  },
  {
    id: "solution-treat-al-si", name: "Solution Treat (Al-7Si)", description: "Solution treat → age",
    alloy_system: "Al-Si", composition: { Si: 7.0 },
    steps: [
      { id: "s1", name: "Solution Treat", process: "solution_treat", target_temp_c: 540, heating_rate: 8, holding_time_min: 240, atmosphere: "argon", pressure_mpa: 0.1, cooling_method: "water_quench", cooling_rate: 6000, cycles: 1 },
      { id: "s2", name: "Age", process: "age_hardening", target_temp_c: 165, heating_rate: 5, holding_time_min: 360, atmosphere: "air", pressure_mpa: 0.1, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
    ],
  },
  {
    id: "stress-relief-1020", name: "Stress Relief (AISI 1020)", description: "Sub-critical anneal",
    alloy_system: "Fe-C", composition: { C: 0.20, Mn: 0.45, Si: 0.20 },
    steps: [
      { id: "s1", name: "Stress Relief", process: "stress_relief", target_temp_c: 595, heating_rate: 8, holding_time_min: 60, atmosphere: "air", pressure_mpa: 0.1, cooling_method: "furnace_cool", cooling_rate: 6, cycles: 1 },
    ],
  },
  {
    id: "normalize-1045", name: "Normalize (AISI 1045)", description: "Austenitize → air cool",
    alloy_system: "Fe-C", composition: { C: 0.45, Mn: 0.75, Si: 0.20 },
    steps: [
      { id: "s1", name: "Normalize", process: "austenitize", target_temp_c: 870, heating_rate: 12, holding_time_min: 45, atmosphere: "air", pressure_mpa: 0.1, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
    ],
  },
  {
    id: "dual-treatment-inconel", name: "Dual Treatment (Ni-Cr-Co)", description: "Solution treat + age",
    alloy_system: "Ni-Cr-Co", composition: { Cr: 20.0, Co: 15.0 },
    steps: [
      { id: "s1", name: "Solution Treat", process: "solution_treat", target_temp_c: 1080, heating_rate: 12, holding_time_min: 240, atmosphere: "vacuum", pressure_mpa: 0.001, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
      { id: "s2", name: "Age", process: "age_hardening", target_temp_c: 850, heating_rate: 8, holding_time_min: 480, atmosphere: "vacuum", pressure_mpa: 0.001, cooling_method: "air_cool", cooling_rate: 60, cycles: 1 },
    ],
  },
];

export async function GET() {
  // Try Python backend
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(UPSTREAM, { signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    clearTimeout(t);
    if (res.ok) { const j = await res.json(); if (j?.ok && j?.presets?.length) return NextResponse.json(j); }
  } catch { /* fallback */ }

  return NextResponse.json({ ok: true, presets: BUILTIN_PRESETS });
}
