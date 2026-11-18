/**
 * POST /api/optimize
 * Bayesian-optimization active-learning loop for alloy design.
 */
import { NextRequest, NextResponse } from "next/server";
import { runBayesianOptimization } from "@/lib/optimization";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { iterations?: number; seed?: number };
    const iters = Math.min(Math.max(Number(body.iterations ?? 12), 4), 30);
    const seed = Number(body.seed ?? 7);
    const res = runBayesianOptimization(iters, seed);
    return NextResponse.json({
      ok: true,
      ...res,
      points: res.points.map((p) => ({
        C: +p.C.toFixed(4),
        H: +p.H.toFixed(1),
        R: +p.R.toFixed(2),
        y: +p.y.toFixed(2),
        source: p.source,
      })),
      best: {
        C: +res.best.C.toFixed(4),
        H: +res.best.H.toFixed(1),
        R: +res.best.R.toFixed(2),
        y: +res.best.y.toFixed(2),
        source: res.best.source,
      },
      acquisitionEI: res.acquisitionEI.map((p) => ({
        x: +p.x.toFixed(2),
        ei: +p.ei.toFixed(4),
      })),
      convergence: res.convergence.map((c) => ({
        iter: c.iter,
        bestY: +c.bestY.toFixed(2),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
