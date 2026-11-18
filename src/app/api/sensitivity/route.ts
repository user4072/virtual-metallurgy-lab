/**
 * POST /api/sensitivity
 * -----------------------------------------------------------------------------
 * Sweeps the predicted yield strength (and UTS, elongation) across a grid of
 * (composition × cooling-rate) for the current alloy system, returning the
 * full matrix for heatmap + line-chart visualisation. This is the
 * "design-space map" a metallurgist uses to pick a processing window.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  yieldStrengthModel,
  stressStrainCurve,
  type AlloySystemId,
} from "@/lib/metallurgy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alloySystem?: AlloySystemId;
      heatTreatmentC?: number;
    };
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const H = Math.min(Math.max(Number(body.heatTreatmentC ?? 190), 20), 1400);

    const nC = 24; // composition steps
    const nR = 28; // cooling-rate steps (log)
    const xMin = 0.005;
    const xMax = sys.xMax;
    const rMin = 0.5;
    const rMax = 120;

    const xs: number[] = [];
    for (let i = 0; i < nC; i++) xs.push(xMin + ((xMax - xMin) * i) / (nC - 1));
    const rs: number[] = [];
    const lMin = Math.log10(rMin);
    const lMax = Math.log10(rMax);
    for (let j = 0; j < nR; j++) rs.push(Math.pow(10, lMin + ((lMax - lMin) * j) / (nR - 1)));

    // build matrix
    const matrix: number[][] = []; // [iC][iR] = yield
    const utsMatrix: number[][] = [];
    for (let i = 0; i < nC; i++) {
      const row: number[] = [];
      const utsRow: number[] = [];
      for (let j = 0; j < nR; j++) {
        const x = xs[i];
        const R = rs[j];
        const m = yieldStrengthModel(x, H, R, sysId);
        const yld = m.yield;
        const ss = stressStrainCurve(yld, m.grain, x, 120, sysId === "Fe-C" ? 210000 : 70000);
        row.push(+yld.toFixed(1));
        utsRow.push(+ss.ultimate.toFixed(1));
      }
      matrix.push(row);
      utsMatrix.push(utsRow);
    }

    // 1-D sweep vs R at the current composition (use midpoint x for the line chart)
    const midX = xs[Math.floor(nC / 2)];
    const sweepR = rs.map((R) => {
      const m = yieldStrengthModel(midX, H, R, sysId);
      return { R: +R.toFixed(2), yield: +m.yield.toFixed(1), grain: +m.grain.toFixed(2), ppt: +m.precip.toFixed(0) };
    });

    // 1-D sweep vs X at the midpoint R
    const midR = rs[Math.floor(nR / 2)];
    const sweepX = xs.map((x) => {
      const m = yieldStrengthModel(x, H, midR, sysId);
      return { x: +x.toFixed(4), yield: +m.yield.toFixed(1), ppt: +m.precip.toFixed(0) };
    });

    return NextResponse.json({
      ok: true,
      alloySystem: sys.id,
      heatTreatmentC: H,
      compositionAxis: xs.map((x) => +x.toFixed(4)),
      coolingRateAxis: rs.map((r) => +r.toFixed(2)),
      yieldMatrix: matrix,
      utsMatrix,
      sweepR,
      sweepX,
      midpoint: { x: midX, R: midR },
      ranges: { xMin, xMax, rMin, rMax },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
