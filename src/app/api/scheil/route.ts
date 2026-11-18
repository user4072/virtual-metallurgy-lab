/**
 * POST /api/scheil
 * Scheil-Gulliver non-equilibrium solidification.
 * Tries the real pycalphad service first (Scheil-Gulliver via equilibrium
 * stepping); falls back to the analytical Scheil surrogate in TS.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  scheilSolidification,
  type AlloySystemId,
} from "@/lib/metallurgy";

export const runtime = "nodejs";
const PYCALPHAD_URL = process.env.PYCALPHAD_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      alloySystem?: AlloySystemId;
      soluteFraction?: number;
    };
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const x = Math.min(Math.max(Number(body.soluteFraction ?? 0.04), 0), sys.xMax);

    // ---- real pycalphad (Scheil via equilibrium stepping) ----
    try {
      const pyRes = await fetch(`${PYCALPHAD_URL}/pycalphad/scheil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alloySystem: sysId, soluteFraction: x }),
        signal: AbortSignal.timeout(120_000),
      });
      if (pyRes.ok) {
        const py = await pyRes.json();
        if (py.ok && Array.isArray(py.points) && py.points.length > 0) {
          return NextResponse.json({
            ok: true,
            alloySystem: sysId,
            composition: x,
            backend: { model: "pycalphad Scheil-Gulliver (real CALPHAD)", database: py.database, inferenceMs: py.inferenceMs, pycalphad: true },
            points: py.points.map((p: { T: number; fs: number; fl: number; xL: number | null; phase: string }) => ({
              T: +p.T.toFixed(2),
              fs: +p.fs.toFixed(4),
              fl: +p.fl.toFixed(4),
              xL: +(p.xL ?? 0).toFixed(4),
              xS: +(p.xL && py.partitionCoeff ? p.xL * py.partitionCoeff : 0).toFixed(4),
              phase: p.phase,
            })),
            tLiquidus: py.tLiquidus,
            tSolidus: py.tSolidus,
            eutecticFraction: py.eutecticFraction,
            partitionCoeff: py.partitionCoeff,
            segregationRatio: py.segregationRatio,
            solidPhases: py.solidPhases,
          });
        }
      }
    } catch {
      // pycalphad service not running — TS surrogate fallback
    }

    // ---- analytical TS fallback (fixed Scheil exponent 1/(1-k)) ----
    const res = scheilSolidification(sys, x, 80);
    return NextResponse.json({
      ok: true,
      alloySystem: sys.id,
      composition: x,
      backend: { model: "analytical Scheil surrogate (constant k, linear liquidus)", pycalphad: false },
      ...res,
      points: res.points.map((p) => ({
        T: +p.T.toFixed(2),
        fs: +p.fs.toFixed(4),
        fl: +p.fl.toFixed(4),
        xL: +p.xL.toFixed(4),
        xS: +p.xS.toFixed(4),
        phase: p.phase,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
