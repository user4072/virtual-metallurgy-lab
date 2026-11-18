/**
 * POST /api/failure
 * -----------------------------------------------------------------------------
 * Predictive failure analysis for the current alloy under cyclic load:
 *
 *  1. Paris-law crack growth:   da/dN = C · (ΔK)^m
 *     where ΔK = Y · Δσ · √(πa)   (stress-intensity range)
 *  2. Remaining fatigue life:   integrate da/dN from a₀ to a_c
 *     N_f = ∫_{a₀}^{a_c} da / [C · (Y·Δσ·√(πa))^m]
 *  3. Failure-mode map: classify brittle / ductile / fatigue-creep from
 *     (stress ratio, temperature, fracture toughness K_Ic).
 *
 * Inputs: alloy system, composition, cooling rate (→ grain size → K_Ic),
 *         applied stress amplitude Δσ, initial flaw a₀, stress ratio R.
 * -----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  grainSize,
  stressStrainCurve,
  yieldStrengthModel,
  type AlloySystemId,
} from "@/lib/metallurgy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alloySystem?: AlloySystemId;
      soluteFraction?: number;
      coolingRateKs?: number;
      heatTreatmentC?: number;
      stressAmplitude?: number; // Δσ in MPa
      initialFlaw?: number;     // a₀ in mm
      stressRatio?: number;     // R = σ_min/σ_max
    };
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const x = Math.min(Math.max(Number(body.soluteFraction ?? 0.04), 0), sys.xMax);
    const R = Math.max(0.1, Number(body.coolingRateKs ?? 8));
    const H = Math.min(Math.max(Number(body.heatTreatmentC ?? 190), 20), 1400);
    const dSigma = Math.max(10, Number(body.stressAmplitude ?? 120)); // MPa
    const a0 = Math.max(0.01, Number(body.initialFlaw ?? 0.5)); // mm
    const stressR = Math.min(0.9, Math.max(-1, Number(body.stressRatio ?? 0.1)));

    const ym = yieldStrengthModel(x, H, R, sysId);
    const grain = ym.grain;
    const hp = ym.hallPetch;
    const yld = ym.yield;
    const ss = stressStrainCurve(yld, grain, x, 120, sysId === "Fe-C" ? 210000 : 70000);
    const uts = ss.ultimate;

    // Fracture toughness K_Ic — steels ~50-150, Al alloys ~20-40 MPa√m
    // finer grains + lower T → higher K_Ic
    const K_Ic = (sysId === "Fe-C" ? 80 : 30) + grain * 0.15 + (1 - x) * 5;

    // Paris-law constants (typical Al alloys: C≈1.5e-11, m≈3.2 in MPa√m units)
    const C = sysId === "Fe-C" ? 1.2e-11 : 1.5e-11;
    const m = 3.2;
    const Y = 1.12; // geometry factor (edge crack)

    // Critical flaw size: K_Ic = Y·Δσ·√(π·a_c)  →  a_c = (K_Ic / (Y·Δσ·√π))²
    // K_Ic in MPa√m, Δσ in MPa → a_c in METERS. Convert to mm (×1000).
    const a_c_m = Math.pow(K_Ic / (Y * dSigma * Math.sqrt(Math.PI)), 2); // meters
    let a_c = a_c_m * 1000; // mm
    // Ensure a_c is meaningfully larger than a₀ for a valid fatigue life;
    // if the initial flaw already exceeds critical, the part fails on first
    // loading (N_f → 0). Clamp a_c to at least 1.05·a₀ so the integration
    // is well-defined and the UI shows "instant failure".
    const instantFail = a_c <= a0;
    if (instantFail) a_c = a0 * 1.001;

    // Integrate Paris law: N_f = ∫ da / [C·(Y·Δσ·√(πa))^m]
    // ΔK = Y·Δσ·√(π·a) with a in METERS (so ΔK is in MPa√m).
    // Analytical (a in meters): N_f = [a_c^(1-m/2) - a₀^(1-m/2)] / [(1-m/2)·C·(Y·Δσ·√π)^m]
    const a0m = a0 / 1000; // mm → m
    const acm = a_c / 1000;
    const exponent = 1 - m / 2;
    const coef = Math.pow(Y * dSigma * Math.sqrt(Math.PI), m) * C;
    let N_f = (Math.pow(acm, exponent) - Math.pow(a0m, exponent)) / (exponent * coef);
    if (instantFail || !isFinite(N_f) || N_f < 0) N_f = 0;
    N_f = Math.max(0, Math.round(N_f));

    // Generate da/dN vs ΔK curve (a in mm for display, ΔK in MPa√m via a_m)
    const curve: { dK: number; dadN: number; a: number }[] = [];
    let a = a0;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const a_m = a / 1000;
      const dK = Y * dSigma * Math.sqrt(Math.PI * a_m); // MPa√m
      const dadN = C * Math.pow(Math.max(dK, 0.1), m); // m/cycle
      curve.push({ dK: +dK.toFixed(3), dadN: +dadN.toExponential(2), a: +a.toFixed(4) });
      const da = Math.max(0.001, (a_c - a0) / steps);
      a = Math.min(a_c, a + da);
    }

    // Crack-length-vs-N curve (integrated)
    const aVsN: { N: number; a: number }[] = [];
    let cumN = 0;
    let aCur = a0;
    const nPts = 40;
    for (let i = 0; i <= nPts; i++) {
      aVsN.push({ N: Math.round(cumN), a: +aCur.toFixed(4) });
      const aCur_m = aCur / 1000;
      const dK = Y * dSigma * Math.sqrt(Math.PI * aCur_m);
      const dadN = C * Math.pow(Math.max(dK, 0.1), m); // m/cycle
      const dN = N_f > 0 ? (N_f / nPts) * 0.95 : 1;
      cumN += dN;
      aCur = Math.min(a_c, aCur + dadN * 1000 * dN); // m→mm
    }

    // Failure-mode classification
    // Brittle: low T, high R (triaxial), low K_Ic/σ_y ratio
    // Ductile: high K_Ic/σ_y, moderate T
    // Fatigue: cyclic loading (always present here)
    const toughnessRatio = K_Ic / yld;
    let mode: "Brittle" | "Ductile" | "Mixed";
    let modeProb: { Brittle: number; Ductile: number; Fatigue: number };
    if (toughnessRatio < 0.25) {
      mode = "Brittle";
      modeProb = { Brittle: 0.62, Ductile: 0.08, Fatigue: 0.3 };
    } else if (toughnessRatio > 0.6) {
      mode = "Ductile";
      modeProb = { Brittle: 0.1, Ductile: 0.55, Fatigue: 0.35 };
    } else {
      mode = "Mixed";
      modeProb = { Brittle: 0.3, Ductile: 0.35, Fatigue: 0.35 };
    }

    // Safety factor against yield
    const nYield = yld / dSigma;
    // Safety factor against fracture
    const nFracture = K_Ic / (Y * dSigma * Math.sqrt(Math.PI * a0));

    return NextResponse.json({
      ok: true,
      alloySystem: sys.id,
      inputs: { dSigma, a0, stressR, heatTreatmentC: H },
      material: { grainSizeUm: +grain.toFixed(2), yieldStrength: +yld.toFixed(0), uts: +uts.toFixed(0), K_Ic: +K_Ic.toFixed(1) },
      crack: {
        criticalFlaw_mm: +a_c.toFixed(3),
        parisC: C,
        parisM: m,
        geometryFactor: Y,
        fatigueLife: Math.round(N_f),
      },
      curve,
      aVsN,
      failureMode: { mode, probabilities: modeProb, toughnessRatio: +toughnessRatio.toFixed(3) },
      safety: { nYield: +nYield.toFixed(2), nFracture: +nFracture.toFixed(2) },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
