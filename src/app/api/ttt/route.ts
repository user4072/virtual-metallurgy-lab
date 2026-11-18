/**
 * POST /api/ttt
 * Time-Temperature-Transformation diagram for an Fe-C steel.
 */
import { NextRequest, NextResponse } from "next/server";
import { tttDiagram } from "@/lib/metallurgy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { carbon?: number };
    const C = Math.min(Math.max(Number(body.carbon ?? 0.4), 0.05), 1.2);
    const res = tttDiagram(C);
    return NextResponse.json({
      ok: true,
      carbon: C,
      ...res,
      curves: res.curves.map((c) => ({
        T: +c.T.toFixed(2),
        t: c.t,
        kind: c.kind,
        phase: c.phase,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
