/**
 * POST /api/report
 * -----------------------------------------------------------------------------
 * Aggregates EVERY analysis for the current alloy recipe into a single report
 * object — the "engineering datasheet" a researcher would export. Gathers:
 *   - phase fractions + boundaries (from metallurgy.ts)
 *   - Scheil solidification summary
 *   - mechanical properties (stress-strain + fatigue)
 *   - sensitivity sweep extrema
 *   - failure analysis (Paris law + safety)
 *   - causal ATE
 * Returns a structured JSON object the client can download or print.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  phaseFractions,
  phaseBoundaries,
  scheilSolidification,
  stressStrainCurve,
  snCurve,
  grainSize,
  hallPetch,
  precipitateDensity,
  liquidusC,
  yieldStrengthModel,
  type AlloySystemId,
} from "@/lib/metallurgy";
import { predictYieldStrength, estimateATE } from "@/lib/causal";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alloySystem?: AlloySystemId;
      soluteFraction?: number;
      temperatureC?: number;
      heatTreatmentC?: number;
      coolingRateKs?: number;
    };
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const x = Math.min(Math.max(Number(body.soluteFraction ?? 0.04), 0), sys.xMax);
    const T = Number(body.temperatureC ?? 25);
    const H = Number(body.heatTreatmentC ?? 190);
    const R = Math.max(0.1, Number(body.coolingRateKs ?? 8));

    // --- Phase ---
    const frac = phaseFractions(x, T, sys);
    const tLiq = liquidusC(x, sys);
    const grain = grainSize(x, R);
    const ppt = precipitateDensity(x, H, R);
    const hp = hallPetch(grain);
    const yld = predictYieldStrength(x, H, R, T, frac.primary, sysId);

    // --- Scheil ---
    const scheil = scheilSolidification(sys, x, 60);

    // --- Mechanical ---
    const ss = stressStrainCurve(yld.yield, grain, x, 120, sysId === "Fe-C" ? 210000 : 70000);
    const sn = snCurve(ss.ultimate, yld.yield, sysId === "Fe-C");

    // --- Sensitivity extrema (quick 12×12 sweep) — unified model ---
    const xs = Array.from({ length: 12 }, (_, i) => 0.005 + (sys.xMax - 0.005) * (i / 11));
    const rs = Array.from({ length: 12 }, (_, j) => Math.pow(10, Math.log10(0.5) + (Math.log10(120) - Math.log10(0.5)) * (j / 11)));
    let sMin = Infinity, sMax = -Infinity;
    for (const xi of xs) for (const ri of rs) {
      const y = yieldStrengthModel(xi, H, ri, sysId, { sysPrimaryFrac: frac.primary }).yield;
      sMin = Math.min(sMin, y); sMax = Math.max(sMax, y);
    }

    // --- Failure (Paris law) ---
    const K_Ic = (sysId === "Fe-C" ? 80 : 30) + grain * 0.15 + (1 - x) * 5;
    const dSigma = 120, a0 = 0.5, Yg = 1.12, C = 1.5e-11, m = 3.2;
    const a_c_m = Math.pow(K_Ic / (Yg * dSigma * Math.sqrt(Math.PI)), 2);
    const a_c = a_c_m * 1000;
    const a0m = a0 / 1000, acm = a_c / 1000;
    const exp_ = 1 - m / 2;
    const coef = Math.pow(Yg * dSigma * Math.sqrt(Math.PI), m) * C;
    const N_f = Math.max(0, Math.round((Math.pow(acm, exp_) - Math.pow(a0m, exp_)) / (exp_ * coef)));

    // --- Causal ATE ---
    const ate = estimateATE(10, 1000, 42);

    const report = {
      meta: {
        generatedAt: new Date().toISOString(),
        labVersion: "VML v2.4",
        alloySystem: sys.id,
        alloyLabel: sys.label,
        solvent: sys.solvent,
        solute: sys.solute,
      },
      recipe: {
        soluteFraction: +x.toFixed(4),
        soluteWtPercent: +(x * 100).toFixed(2),
        temperatureC: T,
        heatTreatmentC: H,
        coolingRateKs: +R.toFixed(2),
      },
      phase: {
        dominantPhase: frac.dominantPhase,
        liquidFraction: +frac.liquid.toFixed(4),
        primaryFraction: +frac.primary.toFixed(4),
        secondaryFraction: +frac.secondary.toFixed(4),
        liquidusC: +tLiq.toFixed(1),
        eutecticC: sys.tEutecticC,
        phases: frac.phases.map((p) => ({ name: p.name, fraction: +p.fraction.toFixed(4) })),
      },
      microstructure: {
        grainSizeUm: +grain.toFixed(3),
        hallPetchMPa: +hp.toFixed(1),
        precipitateDensity: +ppt.toFixed(0),
        astmGrainNumber: +(-3.2877 - 6.6439 * Math.log10(Math.max(grain / 1000, 1e-6))).toFixed(1),
      },
      mechanical: {
        yieldStrengthMPa: +yld.yield.toFixed(1),
        utsMPa: +ss.ultimate.toFixed(1),
        uniformElongationPct: +(ss.uniformElongation * 100).toFixed(1),
        youngsModulusGPa: +(ss.youngsModulus / 1000).toFixed(1),
        strainHardeningExp: +ss.strainHardeningExp.toFixed(3),
        enduranceLimitMPa: +sn.enduranceLimit.toFixed(1),
        fatigueTransitionLife: sn.transitionLife,
      },
      solidification: {
        liquidusC: +scheil.tLiquidus.toFixed(1),
        solidusC: +scheil.tSolidus.toFixed(1),
        eutecticFraction: +scheil.eutecticFraction.toFixed(4),
        partitionCoeff: +scheil.partitionCoeff.toFixed(3),
        segregationRatio: +scheil.segregationRatio.toFixed(2),
      },
      sensitivity: {
        minYieldMPa: +sMin.toFixed(1),
        maxYieldMPa: +sMax.toFixed(1),
        dynamicRangeMPa: +(sMax - sMin).toFixed(1),
        gridSize: "12×12",
      },
      failure: {
        fractureToughnessKIc: +K_Ic.toFixed(1),
        criticalFlawMm: +a_c.toFixed(3),
        fatigueLifeCycles: N_f,
        parisC: C,
        parisM: m,
        safetyFactorFracture: +(K_Ic / (Yg * dSigma * Math.sqrt(Math.PI * a0m))).toFixed(2),
        safetyFactorYield: +(yld.yield / dSigma).toFixed(2),
      },
      causal: {
        ateCoolingRate: +ate.ate.toFixed(2),
        baselineYieldMPa: +ate.baselineY.toFixed(1),
        treatedYieldMPa: +ate.treatedY.toFixed(1),
        ci95: [+ate.ciLower.toFixed(1), +ate.ciUpper.toFixed(1)],
        refuters: ate.refuters.map((r) => ({ name: r.name, passed: r.passed })),
      },
      summary: {
        headline: `${sys.label} @ ${(x * 100).toFixed(1)}wt% ${sys.solute}, ${H}°C HT, ${R.toFixed(1)} K/s → σ_y ${yld.yield.toFixed(0)} MPa, UTS ${ss.ultimate.toFixed(0)} MPa, N_f ${N_f > 0 ? N_f.toLocaleString() : "instant"} cycles`,
      },
    };

    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
