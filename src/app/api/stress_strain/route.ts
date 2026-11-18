/**
 * POST /api/stress_strain
 * Hollomon-Ludwik stress-strain curve + Basquin S-N fatigue curve.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  stressStrainCurve,
  snCurve,
  grainSize,
  ALLOY_SYSTEMS,
  type AlloySystemId,
} from "@/lib/metallurgy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alloySystem?: AlloySystemId;
      soluteFraction?: number;
      coolingRateKs?: number;
      yieldStrength?: number;
    };
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const x = Math.min(Math.max(Number(body.soluteFraction ?? 0.04), 0), sys.xMax);
    const R = Math.max(0.1, Number(body.coolingRateKs ?? 8));
    const yld = Number(body.yieldStrength ?? 160);
    const isSteel = sysId === "Fe-C";

    const grain = grainSize(x, R);
    const ss = stressStrainCurve(yld, grain, x, 120, isSteel ? 210000 : 70000);
    const sn = snCurve(ss.ultimate, yld, isSteel);

    return NextResponse.json({
      ok: true,
      stressStrain: {
        ...ss,
        curve: ss.curve.map((p) => ({
          strain: +p.strain.toFixed(5),
          stress: +p.stress.toFixed(2),
          elastic: p.elastic,
        })),
      },
      fatigue: {
        ...sn,
        curve: sn.curve.map((p) => ({
          Nf: p.Nf,
          stressAmp: +p.stressAmp.toFixed(1),
          regime: p.regime,
        })),
      },
      grainSizeUm: +grain.toFixed(3),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
