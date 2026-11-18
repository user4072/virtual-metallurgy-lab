/**
 * POST /api/overview
 * -----------------------------------------------------------------------------
 * Returns the headline KPI from every analysis module in a single call, so the
 * Dashboard Overview tab can render a full at-a-glance grid without 12 separate
 * fetches. Gathers: phase, microstructure, mechanical, solidification,
 * sensitivity extrema, failure, causal ATE — plus the alloy recipe.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  phaseFractions,
  liquidusC,
  grainSize,
  hallPetch,
  precipitateDensity,
  stressStrainCurve,
  snCurve,
  scheilSolidification,
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

    const frac = phaseFractions(x, T, sys);
    const grain = grainSize(x, R);
    const ppt = precipitateDensity(x, H, R);
    const hp = hallPetch(grain);
    const yld = predictYieldStrength(x, H, R, T, frac.primary, sysId);
    const E = sysId === "Fe-C" ? 210000 : 70000;
    const ss = stressStrainCurve(yld.yield, grain, x, 120, E);
    const sn = snCurve(ss.ultimate, yld.yield, sysId === "Fe-C");
    const scheil = scheilSolidification(sys, x, 40);
    const ate = estimateATE(10, 800, 42);

    // quick sensitivity extrema (8×8) — same unified model as the Sensitivity tab
    let sMin = Infinity, sMax = -Infinity;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const xi = 0.005 + (sys.xMax - 0.005) * (i / 7);
      const ri = Math.pow(10, Math.log10(0.5) + (Math.log10(120) - Math.log10(0.5)) * (j / 7));
      const y = yieldStrengthModel(xi, H, ri, sysId, { sysPrimaryFrac: frac.primary }).yield;
      sMin = Math.min(sMin, y); sMax = Math.max(sMax, y);
    }

    // failure (Paris law)
    const K_Ic = (sysId === "Fe-C" ? 80 : 30) + grain * 0.15 + (1 - x) * 5;
    const dSigma = 120, a0 = 0.5, Yg = 1.12, C = 1.5e-11, m = 3.2;
    const a_c_m = Math.pow(K_Ic / (Yg * dSigma * Math.sqrt(Math.PI)), 2);
    const a_c = a_c_m * 1000;
    const a0m = a0 / 1000, acm = a_c / 1000;
    const exp_ = 1 - m / 2;
    const coef = Math.pow(Yg * dSigma * Math.sqrt(Math.PI), m) * C;
    const N_f = Math.max(0, Math.round((Math.pow(acm, exp_) - Math.pow(a0m, exp_)) / (exp_ * coef)));
    const nFrac = +(K_Ic / (Yg * dSigma * Math.sqrt(Math.PI * a0m))).toFixed(2);

    return NextResponse.json({
      ok: true,
      recipe: {
        alloyLabel: sys.label,
        alloySystem: sys.id,
        soluteWtPct: +(x * 100).toFixed(2),
        solute: sys.solute,
        temperatureC: T,
        heatTreatmentC: H,
        coolingRateKs: +R.toFixed(1),
      },
      kpis: {
        dominantPhase: frac.dominantPhase,
        liquidPct: +(frac.liquid * 100).toFixed(1),
        primaryPct: +(frac.primary * 100).toFixed(1),
        liquidusC: +liquidusC(x, sys).toFixed(0),
        yieldMPa: +yld.yield.toFixed(0),
        utsMPa: +ss.ultimate.toFixed(0),
        elongPct: +(ss.uniformElongation * 100 * 2.2).toFixed(1),
        enduranceMPa: +sn.enduranceLimit.toFixed(0),
        grainUm: +grain.toFixed(2),
        astmN: +(-3.2877 - 6.6439 * Math.log10(Math.max(grain / 1000, 1e-6))).toFixed(1),
        pptDensity: +ppt.toFixed(0),
        hallPetchMPa: +hp.toFixed(0),
        scheilEutPct: +(scheil.eutecticFraction * 100).toFixed(1),
        scheilSegRatio: +scheil.segregationRatio.toFixed(2),
        sensMinMPa: +sMin.toFixed(0),
        sensMaxMPa: +sMax.toFixed(0),
        fatigueLife: N_f,
        criticalFlawMm: +a_c.toFixed(2),
        safetyFracture: nFrac,
        K_Ic: +K_Ic.toFixed(1),
        ateMPa: +ate.ate.toFixed(1),
        ateCI: [+ate.ciLower.toFixed(1), +ate.ciUpper.toFixed(1)],
      },
      sparklines: {
        ssCurve: ss.curve.filter((_, i) => i % 6 === 0).slice(0, 20).map((p) => ({ s: +p.strain.toFixed(4), sig: +p.stress.toFixed(1) })),
        snCurve: sn.curve.map((p) => ({ N: p.Nf, sa: +p.stressAmp.toFixed(0) })),
        scheilPath: scheil.points.filter((_, i) => i % 4 === 0).slice(0, 12).map((p) => ({ T: +p.T.toFixed(0), fs: +p.fs.toFixed(3) })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
