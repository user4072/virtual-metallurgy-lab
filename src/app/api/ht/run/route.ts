/**
 * POST /api/ht/run
 * -----------------------------------------------------------------------------
 * Heat-treatment simulation. Tries the Python backend on port 8001 first;
 * if unreachable, falls back to a TypeScript simulation using metallurgy.ts.
 * Returns the same response shape in both cases.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  grainSize,
  hallPetch,
  precipitateDensity,
  stressStrainCurve,
  phaseFractions,
  type AlloySystemId,
} from "@/lib/metallurgy";

export const runtime = "nodejs";

const UPSTREAM = "http://localhost:8001/run";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ---- Try Python backend first (3s timeout) ----
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(UPSTREAM, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.ok) {
      const json = await res.json();
      if (json?.ok) return NextResponse.json(json);
    }
  } catch {
    /* fall through to TS fallback */
  }

  // ---- TypeScript fallback simulation ----
  try {
    const result = tsSimulate(body);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "simulation failed" },
      { status: 500 },
    );
  }
}

// ---- TS-based heat-treatment simulation ----

interface HTStep {
  id: string;
  name: string;
  process: string;
  target_temp_c: number;
  heating_rate: number;
  holding_time_min: number;
  atmosphere: string;
  pressure_mpa: number;
  cooling_method: string;
  cooling_rate: number;
  cycles: number;
}

const COOLING_RATES_K_MIN: Record<string, number> = {
  water_quench: 6000, oil_quench: 1500, polymer_quench: 3000,
  gas_quench: 600, air_cool: 60, furnace_cool: 6, salt_bath: 300, controlled: 100,
};

function tsSimulate(body: {
  alloy?: { system?: string; composition?: Record<string, number> };
  workflow?: { steps?: HTStep[] };
  options?: { uncertainty?: boolean; n_uncertainty_samples?: number };
}) {
  const sysId = (body.alloy?.system ?? "Al-Cu") as AlloySystemId;
  const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
  const comp = body.alloy?.composition ?? {};
  const steps = body.workflow?.steps ?? [];
  const doUncertainty = body.options?.uncertainty ?? true;
  const nSamples = body.options?.n_uncertainty_samples ?? 12;

  // Composition in wt% → wt fraction for metallurgy.ts
  const soluteWtPercent = comp[sys.solute] ?? comp["C"] ?? comp["Cu"] ?? comp["Si"] ?? comp["Cr"] ?? 4;
  const x = Math.min(Math.max(soluteWtPercent / 100, 0.001), sys.xMax);
  const x2 = sys.isTernary ? (comp[sys.solute2 ?? "Co"] ?? 15) / 100 : 0;

  // Process each step — track peak temp, total time, cooling rate
  let peakTempC = 25;
  let totalTimeMin = 0;
  let lastCoolingRateKs = 8; // default
  let austenitizeTempC: number | null = null;
  let temperTempC: number | null = null;
  let temperTimeMin: number | null = null;
  const processingHistory: Record<string, unknown>[] = [];

  for (const step of steps) {
    const cycles = Math.max(1, step.cycles ?? 1);
    for (let c = 0; c < cycles; c++) {
      const heatTime = step.heating_rate > 0 ? (step.target_temp_c - 25) / step.heating_rate : 0;
      const holdTime = step.holding_time_min;
      const coolRateKMin = COOLING_RATES_K_MIN[step.cooling_method] ?? step.cooling_rate ?? 60;
      const coolTime = coolRateKMin > 0 ? (step.target_temp_c - 25) / coolRateKMin : 0;
      totalTimeMin += heatTime + holdTime + coolTime;
      peakTempC = Math.max(peakTempC, step.target_temp_c);
      lastCoolingRateKs = coolRateKMin / 60; // K/min → K/s

      if (step.process === "austenitize" || step.process === "solution_treat" || step.process === "Solution Treatment") {
        austenitizeTempC = step.target_temp_c;
      }
      if (step.process === "temper" || step.process === "Tempering" || step.process === "age_hardening") {
        temperTempC = step.target_temp_c;
        temperTimeMin = step.holding_time_min;
      }

      processingHistory.push({
        index: processingHistory.length,
        id: step.id,
        name: step.name,
        process: step.process,
        target_temp_c: step.target_temp_c,
        holding_time_min: step.holding_time_min,
        cooling_method: step.cooling_method,
        cooling_rate_K_per_min: coolRateKMin,
        cooling_rate_K_per_s: coolRateKMin / 60,
        cycles: step.cycles ?? 1,
        total_time_min: totalTimeMin,
      });
    }
  }

  // Grain size from cooling rate
  const grain = grainSize(x, lastCoolingRateKs);
  const hp = hallPetch(grain);
  const precip = precipitateDensity(x, peakTempC, lastCoolingRateKs);

  // Phase fractions at room temperature
  const pf = phaseFractions(x, 25, sys);
  let phases: Record<string, number> = {};
  if (sysId === "Fe-C") {
    // Steel: martensite if fast cooling, pearlite/ferrite if slow
    if (lastCoolingRateKs > 50) {
      const martFrac = Math.min(0.98, 0.6 + lastCoolingRateKs * 0.004);
      phases = { martensite: martFrac, ferrite: (1 - martFrac) * 0.3, pearlite: (1 - martFrac) * 0.4, retained_austenite: (1 - martFrac) * 0.2, cementite: (1 - martFrac) * 0.1 };
    } else if (lastCoolingRateKs > 5) {
      phases = { ferrite: 0.3, pearlite: 0.6, bainite: 0.1 };
    } else {
      phases = { ferrite: 0.7, pearlite: 0.3 };
    }
  } else if (sysId === "Al-Cu") {
    phases = { "α-Al (FCC)": pf.primary, "θ-Al₂Cu": pf.secondary };
    if (precip > 10) phases["GP Zones"] = 0.05;
  } else if (sysId === "Al-Si") {
    phases = { "α-Al (FCC)": pf.primary, "β-Si": pf.secondary };
  } else {
    phases = { "γ-Ni (FCC)": 0.9, "γ′": 0.1 };
  }

  // Mechanical properties
  const sigma_0 = sysId === "Fe-C" ? 50 : sysId === "Ni-Cr-Co" ? 80 : 20;
  const k_HP = sysId === "Fe-C" ? 0.45 : sysId === "Ni-Cr-Co" ? 0.3 : 0.07;
  const sigma_ss = sysId === "Fe-C" ? (comp["Mn"] ?? 0) * 30 + (comp["Si"] ?? 0) * 80 + (comp["Ni"] ?? 0) * 20 + (comp["Cr"] ?? 0) * 20 : (soluteWtPercent) * 4;
  const sigma_hp = k_HP / Math.sqrt(Math.max(grain, 0.1));
  const sigma_precip = 0.018 * precip;
  let yieldStrength = Math.max(50, sigma_0 + sigma_ss + sigma_hp + sigma_precip);

  // Tempering reduces strength (Hollomon-Jaffe)
  let hollomonJaffe = 0;
  if (temperTempC && temperTimeMin) {
    const T_K = temperTempC + 273.15;
    const t_hr = temperTimeMin / 60;
    hollomonJaffe = T_K * (20 + Math.log10(Math.max(t_hr, 0.01)));
    // Reduce yield by up to 30% based on HJP
    const temperFactor = Math.max(0.7, 1 - (hollomonJaffe - 15000) / 50000);
    yieldStrength *= temperFactor;
  }

  const ss = stressStrainCurve(yieldStrength, grain, x);
  const uts = ss.ultimate;
  const hardnessHRC = Math.max(0, yieldStrength / 3.3 - 20);
  const hardnessHV = yieldStrength / 3;
  const elongationPct = Math.max(5, 30 - 0.025 * yieldStrength);
  const toughnessJ = Math.max(5, 200 * Math.exp(-0.06 * Math.max(hardnessHRC - 20, 0)));
  const fatigueMPa = (sysId === "Fe-C" ? 0.45 : 0.35) * uts;

  // Physical properties
  const density = sysId === "Fe-C" ? 7.874 - 0.04 * (comp["C"] ?? 0.4) - 0.012 * (comp["Si"] ?? 0.2) - 0.016 * (comp["Mn"] ?? 0.75)
    : sysId === "Al-Cu" ? 2.70 - 0.012 * soluteWtPercent
    : sysId === "Al-Si" ? 2.69 - 0.006 * soluteWtPercent
    : 8.90 - 0.005 * soluteWtPercent + 0.001 * (comp["Co"] ?? 15);
  const elasticModulus = sysId === "Fe-C" ? 210 : sysId === "Ni-Cr-Co" ? 200 : 70;
  const thermalConductivity = sysId === "Fe-C" ? 80 - soluteWtPercent * 2 : sysId === "Al-Cu" ? 180 - soluteWtPercent * 4 : 150;
  const electricalConductivity = sysId === "Fe-C" ? 17 : sysId === "Al-Cu" ? 30 : 40;
  const cte = sysId === "Fe-C" ? 12 : sysId === "Al-Cu" || sysId === "Al-Si" ? 23 : 13;

  // Uncertainty estimates (Monte Carlo)
  const ue: Record<string, { mean: number; std: number; min: number; max: number; ci_95_low: number; ci_95_high: number; n_samples: number }> = {};
  if (doUncertainty) {
    const samples: Record<string, number[]> = { yield_strength_MPa: [], UTS_MPa: [], hardness_HRC: [], elongation_pct: [], toughness_J: [] };
    for (let i = 0; i < nSamples; i++) {
      const noise = 1 + (Math.random() - 0.5) * 0.06;
      samples.yield_strength_MPa.push(yieldStrength * noise);
      samples.UTS_MPa.push(uts * noise);
      samples.hardness_HRC.push(hardnessHRC * noise);
      samples.elongation_pct.push(elongationPct * noise);
      samples.toughness_J.push(toughnessJ * noise);
    }
    for (const [key, vals] of Object.entries(samples)) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
      ue[key] = { mean, std, min: Math.min(...vals), max: Math.max(...vals), ci_95_low: mean - 1.96 * std, ci_95_high: mean + 1.96 * std, n_samples: vals.length };
    }
  }

  // Temperature profile
  const tempProfile: { t: number; T: number }[] = [{ t: 0, T: 25 }];
  let cumT = 0;
  for (const step of steps) {
    const cycles = Math.max(1, step.cycles ?? 1);
    for (let c = 0; c < cycles; c++) {
      const heatTime = step.heating_rate > 0 ? (step.target_temp_c - 25) / step.heating_rate : 0;
      cumT += heatTime;
      tempProfile.push({ t: cumT, T: step.target_temp_c });
      cumT += step.holding_time_min;
      tempProfile.push({ t: cumT, T: step.target_temp_c });
      const coolRateKMin = COOLING_RATES_K_MIN[step.cooling_method] ?? step.cooling_rate ?? 60;
      const coolTime = coolRateKMin > 0 ? (step.target_temp_c - 25) / coolRateKMin : 0;
      cumT += coolTime;
      tempProfile.push({ t: cumT, T: 25 });
    }
  }

  return {
    ok: true,
    alloy: { system: sysId, composition: comp },
    final_microstructure: {
      system: sysId,
      phases,
      grain_size_um: Math.round(grain * 100) / 100,
      austenitize_temp_c: austenitizeTempC,
      temper_temp_c: temperTempC,
      temper_time_min: temperTimeMin,
      cooling_rate_K_per_min: COOLING_RATES_K_MIN[steps[steps.length - 1]?.cooling_method ?? "air_cool"] ?? 60,
      cooling_rate_K_per_s: lastCoolingRateKs,
      hollomon_jaffe: hollomonJaffe,
    },
    phase_fractions: phases,
    mechanical_properties: {
      yield_strength_MPa: Math.round(yieldStrength * 100) / 100,
      UTS_MPa: Math.round(uts * 100) / 100,
      hardness_HRC: Math.round(hardnessHRC * 100) / 100,
      hardness_HV: Math.round(hardnessHV * 100) / 100,
      elongation_pct: Math.round(elongationPct * 100) / 100,
      toughness_J: Math.round(toughnessJ * 100) / 100,
      fatigue_MPa: Math.round(fatigueMPa * 100) / 100,
      hollomon_jaffe: hollomonJaffe,
      components: { sigma_0, sigma_hp, sigma_ss, sigma_precip },
    },
    physical_properties: {
      density_g_cm3: Math.round(density * 1000) / 1000,
      thermal_conductivity_W_mK: Math.round(thermalConductivity * 100) / 100,
      electrical_conductivity_pctIACS: Math.round(electricalConductivity * 100) / 100,
      elastic_modulus_GPa: elasticModulus,
      CTE_ppm_K: cte,
    },
    processing_history: processingHistory,
    phase_evolution: { series: [{ t: totalTimeMin, T: 25, ...phases }], x_key: "t", phase_keys: Object.keys(phases), n_points: 1 },
    temperature_profile: { series: tempProfile, x_key: "t", y_key: "T", x_label: "Time (min)", y_label: "Temperature (°C)", x_domain: [0, totalTimeMin], y_domain: [25, peakTempC], n_points: tempProfile.length },
    workflow_summary: {
      name: "HT Workflow",
      n_steps: steps.length,
      n_steps_expanded: steps.reduce((a, s) => a + Math.max(1, s.cycles ?? 1), 0),
      total_time_min: Math.round(totalTimeMin * 100) / 100,
      peak_temp_c: peakTempC,
      profile_points: tempProfile.length,
    },
    uncertainty_estimates: ue,
    validation: { ok: true, warnings: [], errors: [] },
  };
}
