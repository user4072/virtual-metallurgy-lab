/**
 * POST /api/micrograph/save
 * Persist a generated micrograph into the catalog database.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const UPSTREAM = (process.env.MICROGRAPH_URL ?? "http://localhost:8003") + "/micrograph/save";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
