/**
 * POST /api/ht/cct
 * CCT diagram. Tries Python backend first; falls back to TTT (shifted right,
 * a standard engineering approximation for continuous cooling).
 */
import { NextRequest, NextResponse } from "next/server";
import { htTttCurves } from "@/lib/ht-ttt-fallback";

export const runtime = "nodejs";
const UPSTREAM = (process.env.HT_SERVICE_URL ?? "http://localhost:8001") + "/cct";

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(UPSTREAM, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    clearTimeout(t);
    if (res.ok) { const j = await res.json(); if (j?.ok) return NextResponse.json(j); }
  } catch { /* fallback */ }

  // Fallback: compute TTT locally and shift the diffusional curves rightward
  const sysId = (body.alloy?.system ?? "Al-Cu") as string;
  const comp = body.alloy?.composition ?? {};
  const ttt = htTttCurves(sysId, comp);

  const shiftedCurves: Record<string, number[][]> = {};
  for (const [key, pts] of Object.entries(ttt.curves)) {
    // martensite is athermal — its lines do not shift with cooling rate
    const factor = key.startsWith("martensite") ? 1 : 2.5;
    shiftedCurves[key] = pts.map(([t, T]) => [t * factor, T]);
  }
  return NextResponse.json({ ...ttt, curves: shiftedCurves });
}
