/**
 * GET /api/ht/databases
 * Proxies http://localhost:8001/databases — returns the list of available
 * thermodynamic databases (TDB files) the heat-treatment service can call.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPSTREAM = "http://localhost:8001/databases";

export async function GET() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(UPSTREAM, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
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
        error: e instanceof Error ? e.message : "upstream databases fetch failed",
      },
      { status: 502 },
    );
  }
}
