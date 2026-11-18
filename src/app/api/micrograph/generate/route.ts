/**
 * POST /api/micrograph/generate
 * Proxy to the micrograph service (hybrid diffusion/procedural generator).
 * The heavy image bytes never touch the Next server beyond this relay.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const UPSTREAM = (process.env.MICROGRAPH_URL ?? "http://localhost:8003") + "/micrograph/generate";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });
    const json = await res.json();
    if (json.ok && json.imageB64) {
      json.imageUrl = `data:image/png;base64,${json.imageB64}`;
      delete json.imageB64;
    }
    return NextResponse.json(json, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "micrograph service unreachable — start it with: python scripts/start_service.py micrograph (" +
          (e instanceof Error ? e.message : "unknown") +
          ")",
      },
      { status: 502 },
    );
  }
}
