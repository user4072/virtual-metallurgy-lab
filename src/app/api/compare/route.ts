/**
 * POST /api/compare
 * -----------------------------------------------------------------------------
 * Returns phase-boundary curves + predicted properties for TWO alloys in a
 * single call, so the Comparison tab can overlay them without two round-trips.
 * Mirrors the logic in /api/predict_phase + /api/stress_strain for each alloy.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  phaseBoundaries,
  phaseFractions,
  stressStrainCurve,
  snCurve,
  grainSize,
  type AlloySystemId,
} from "@/lib/metallurgy";
import { predictYieldStrength } from "@/lib/causal";

export const runtime = "nodejs";

interface AlloyReq {
  alloySystem: AlloySystemId;
  soluteFraction: number;
  coolingRateKs: number;
  heatTreatmentC: number;
}

interface CompareBody {
  a: AlloyReq;
  b: AlloyReq;
}

function evalAlloy(req: AlloyReq) {
  const sys = ALLOY_SYSTEMS[req.alloySystem] ?? ALLOY_SYSTEMS["Al-Cu"];
  const x = Math.min(Math.max(req.soluteFraction, 0), sys.xMax);
  const R = Math.max(0.1, req.coolingRateKs);
  const H = Math.min(Math.max(req.heatTreatmentC, 20), 1400);
  const frac = phaseFractions(x, 25, sys);
  const boundaries = phaseBoundaries(sys, 50);
  const grain = grainSize(x, R);
  const yld = predictYieldStrength(x, H, R, 25, frac.primary, sys.id);
  const ss = stressStrainCurve(yld.yield, grain, x);
  return {
    alloySystem: sys.id,
    label: sys.label,
    accent: sys.accent,
    soluteLabel: sys.solute,
    composition: x,
    coolingRateKs: R,
    heatTreatmentC: H,
    phaseFractions: {
      liquid: frac.liquid,
      primary: frac.primary,
      secondary: frac.secondary,
      dominantPhase: frac.dominantPhase,
    },
    boundaries: boundaries.map((b) => ({ x: b.x, t: b.t, kind: b.kind })),
    metrics: {
      grainSizeUm: grain,
      yieldStrength: yld.yield,
      uts: ss.ultimate,
      elongation: ss.uniformElongation * 100 * 2.2,
      endurance: snCurve(ss.ultimate, yld.yield, sys.id === "Fe-C").enduranceLimit,
      density: sys.id === "Fe-C" ? 7.85 : 2.78,
    },
    stressStrain: ss.curve.map((p) => ({
      strain: +p.strain.toFixed(5),
      stress: +p.stress.toFixed(2),
    })),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CompareBody>;
    const a = body.a ?? { alloySystem: "Al-Cu", soluteFraction: 0.04, coolingRateKs: 8, heatTreatmentC: 190 };
    const b = body.b ?? { alloySystem: "Al-Si", soluteFraction: 0.07, coolingRateKs: 8, heatTreatmentC: 190 };
    return NextResponse.json({
      ok: true,
      a: evalAlloy(a as AlloyReq),
      b: evalAlloy(b as AlloyReq),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
