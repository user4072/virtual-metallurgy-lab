/**
 * POST /api/ht/ttt
 * TTT diagram. Tries Python backend first; falls back to TS computation.
 */
import { NextRequest, NextResponse } from "next/server";
import { htTttCurves } from "@/lib/ht-ttt-fallback";

export const runtime = "nodejs";
const UPSTREAM = (process.env.HT_SERVICE_URL ?? "http://localhost:8001") + "/ttt";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Try Python backend
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(UPSTREAM, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    clearTimeout(t);
    if (res.ok) { const j = await res.json(); if (j?.ok) return NextResponse.json(j); }
  } catch { /* fallback */ }

  // TS fallback (Andrews critical temperatures, C-curves below A1)
  const sysId = (body.alloy?.system ?? "Al-Cu") as string;
  const comp = body.alloy?.composition ?? {};
  return NextResponse.json(htTttCurves(sysId, comp));
}
