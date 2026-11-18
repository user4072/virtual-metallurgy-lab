/**
 * GET /api/micrograph/catalog
 * Proxy to the micrograph service catalog (real + generated micrographs).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const UPSTREAM = (process.env.MICROGRAPH_URL ?? "http://localhost:8003") + "/micrograph/catalog";

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(UPSTREAM, { cache: "no-store" });
    const json = await res.json();
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        entries: [],
        error: "micrograph service unreachable — " + (e instanceof Error ? e.message : "unknown"),
      },
      { status: 502 },
    );
  }
}
