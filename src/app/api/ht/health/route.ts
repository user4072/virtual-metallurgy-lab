/**
 * GET /api/ht/health
 * Tries Python backend; falls back to "degraded" status.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const UPSTREAM = "http://localhost:8001/health";

export async function GET() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(UPSTREAM, { signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    clearTimeout(t);
    if (res.ok) return NextResponse.json(await res.json());
  } catch { /* fallback */ }

  return NextResponse.json({
    ok: true,
    service: "heat-treatment",
    version: "1.0.0-ts-fallback",
    pycalphad_reachable: false,
    engines: ["workflow", "thermodynamics", "kinetics", "properties", "optimization"],
    databases: ["Fe-C", "Al-Cu", "Al-Si", "Ni-Cr-Co"],
    note: "Python backend offline — using TypeScript fallback simulation",
  });
}
