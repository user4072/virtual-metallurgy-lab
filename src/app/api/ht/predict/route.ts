/**
 * POST /api/ht/predict
 * Proxies the ML-surrogate quick-predict endpoint on port 8001.  Forwards
 * { alloy, workflow, model_name } and returns predicted properties +
 * training R² for the requested model (RandomForest / GradientBoosting / MLP).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM = "http://localhost:8001/predict";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(UPSTREAM, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    clearTimeout(t);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, raw: text };
    }
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "upstream predict failed",
      },
      { status: 502 },
    );
  }
}
