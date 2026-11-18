/**
 * POST /api/predict_phase
 * -----------------------------------------------------------------------------
 * Surrogate inference endpoint. Takes an alloy system + composition + T and
 * returns phase fractions, the dominant phase, Gibbs free-energy samples, and
 * a grain-size / yield-strength prediction. Mirrors `main.py /predict_phase`.
 *
 * Supports both binary (Al-Cu, Al-Si, Fe-C) and ternary (Ni-Cr-Co) systems.
 * For ternary, uses ternaryPhaseFractions / ternaryLiquidusC / ternaryGibbs.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ALLOY_SYSTEMS,
  phaseFractions,
  phaseBoundaries,
  gibbsCurve,
  grainSize,
  precipitateDensity,
  hallPetch,
  ternaryPhaseFractions,
  ternaryLiquidusC,
  ternaryGibbsFreeEnergy,
  ternaryGrainSize,
  ternaryPrecipitateDensity,
  type AlloySystemId,
} from "@/lib/metallurgy";
import { predictYieldStrength } from "@/lib/causal";

export const runtime = "nodejs";

interface PredictBody {
  alloySystem: AlloySystemId;
  soluteFraction: number;
  soluteFraction2?: number;
  temperatureC: number;
  heatTreatmentC: number;
  coolingRateKs: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<PredictBody>;
    const sysId = (body.alloySystem ?? "Al-Cu") as AlloySystemId;
    const sys = ALLOY_SYSTEMS[sysId] ?? ALLOY_SYSTEMS["Al-Cu"];
    const x = clamp(Number(body.soluteFraction ?? 0.04), 0, sys.xMax);
    const x2 = sys.isTernary ? clamp(Number(body.soluteFraction2 ?? 0.10), 0, sys.xMax2 ?? 0.5) : 0;
    const T = clamp(Number(body.temperatureC ?? 25), -50, 2000);
    const H = clamp(Number(body.heatTreatmentC ?? 190), 20, 1400);
    const R = clamp(Number(body.coolingRateKs ?? 8), 0.1, 500);

    // ---- Try REAL pycalphad for ALL alloy systems (port from env) ----
    const PYCALPHAD_URL = process.env.PYCALPHAD_URL ?? "http://localhost:8000";
    let pycalphadResult: { phases: Record<string, number>; dominantPhase: string; database?: string; inferenceMs?: number } | null = null;
    const pyT0 = Date.now();
    try {
      const pyRes = await fetch(`${PYCALPHAD_URL}/pycalphad/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alloySystem: sysId,
          soluteFraction: x,
          soluteFraction2: x2,
          temperatureC: T,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (pyRes.ok) {
        const pyData = await pyRes.json();
        if (pyData.ok && pyData.pycalphad) {
          pycalphadResult = {
            phases: pyData.phases,
            dominantPhase: pyData.dominantPhase,
            database: pyData.database,
            inferenceMs: pyData.inferenceMs ?? Date.now() - pyT0,
          };
        }
      }
    } catch {
      // pycalphad service not running — use TS surrogate
    }

    if (pycalphadResult) {
      // ---- REAL pycalphad result (all alloy systems) ----
      const phases = Object.entries(pycalphadResult.phases).map(([name, fraction]) => ({
        name,
        fraction,
        color: name === "Liquid" ? "#ef4444"
          : name.includes("FCC") || name.includes("α-Al") || name.includes("γ") ? "#f59e0b"
          : name.includes("BCC") || name.includes("α-Fe") || name.includes("α-Cr") ? "#10b981"
          : "#a78bfa",
      }));
      const frac = {
        liquid: pycalphadResult.phases["Liquid"] ?? 0,
        primary: phases.find((p) => p.name !== "Liquid" && p.fraction > 0)?.fraction ?? 0,
        secondary: phases.filter((p) => p.name !== "Liquid" && p.name !== phases.find((q) => q.name !== "Liquid")?.name).find((p) => p.fraction > 0)?.fraction ?? 0,
        dominantPhase: pycalphadResult.dominantPhase,
        phases,
      };

      // Use surrogate for grain/yield (pycalphad doesn't compute mechanical properties)
      const grain = sys.isTernary
        ? ternaryGrainSize(x, x2, R)
        : grainSize(x, R);
      const precip = sys.isTernary
        ? ternaryPrecipitateDensity(x, x2, H, R)
        : precipitateDensity(x, H, R);
      const hp = hallPetch(grain);
      const yld = predictYieldStrength(x, H, R, T, frac.primary, sys.id, x2);

      // Gibbs curves (surrogate — pycalphad doesn't output these directly)
      const gibbsLiquid = sys.isTernary
        ? Array.from({ length: 40 }, (_, i) => ({ x: (sys.xMax * i) / 39, g: ternaryGibbsFreeEnergy((sys.xMax * i) / 39, x2, T + 273.15, sys.omegaNiCr ?? -25000, sys.omegaNiCo ?? 4000, sys.omegaCrCo ?? -12000) }))
        : gibbsCurve(sys, T, "liquid", 40);
      const gibbsSolid = sys.isTernary
        ? Array.from({ length: 40 }, (_, i) => ({ x: (sys.xMax * i) / 39, g: ternaryGibbsFreeEnergy((sys.xMax * i) / 39, x2, T + 273.15, (sys.omegaNiCr ?? -25000) * 1.4, (sys.omegaNiCo ?? 4000) * 1.2, (sys.omegaCrCo ?? -12000) * 1.3) }))
        : gibbsCurve(sys, T, "solid", 40);

      const boundaries = sys.isTernary
        ? Array.from({ length: 60 }, (_, i) => ({ x: (sys.xMax * i) / 59, t: ternaryLiquidusC((sys.xMax * i) / 59, x2), kind: "liquidus" }))
        : phaseBoundaries(sys, 60).map((b) => ({ x: b.x, t: b.t, kind: b.kind }));

      return NextResponse.json({
        ok: true,
        alloySystem: sys.id,
        composition: sys.isTernary
          ? { solute: x, solute2: x2, solvent: Math.max(0, 1 - x - x2), soluteLabel: sys.solute, solute2Label: sys.solute2 }
          : { solute: x, solvent: 1 - x, soluteLabel: sys.solute },
        temperatureC: T,
        phaseFractions: frac,
        boundaries,
        gibbs: { temperatureC: T, liquid: gibbsLiquid, solid: gibbsSolid, unit: "kJ/mol" },
        microstructure: { grainSizeUm: grain, precipitateDensity: precip, hallPetchMPa: hp },
        yieldStrength: yld,
        surrogateMeta: {
          model: "pycalphad equilibrium (real CALPHAD)",
          inferenceMs: +(pycalphadResult.inferenceMs ?? 0).toFixed(0),
          trainedOn: pycalphadResult.database
            ? `thermodynamic database: ${pycalphadResult.database}`
            : "real CALPHAD equilibrium",
          uncertainty: { liquid: 0.005, primary: 0.01, secondary: 0.01 },
          pycalphad: true,
        },
      });
    }

    // ---- TS surrogate fallback (pycalphad service not running) ----
    const surrogateT0 = Date.now();
    if (sys.isTernary) {
      const frac = ternaryPhaseFractions(x, x2, T);
      const tLiq = ternaryLiquidusC(x, x2);

      // ternary Gibbs curves (sweep Cr at fixed Co)
      const gibbsLiquid = Array.from({ length: 40 }, (_, i) => {
        const xc = (sys.xMax * i) / 39;
        return {
          x: xc,
          g: ternaryGibbsFreeEnergy(xc, x2, T + 273.15, sys.omegaNiCr ?? -25000, sys.omegaNiCo ?? 4000, sys.omegaCrCo ?? -12000),
        };
      });
      const gibbsSolid = Array.from({ length: 40 }, (_, i) => {
        const xc = (sys.xMax * i) / 39;
        return {
          x: xc,
          g: ternaryGibbsFreeEnergy(xc, x2, T + 273.15, (sys.omegaNiCr ?? -25000) * 1.4, (sys.omegaNiCo ?? 4000) * 1.2, (sys.omegaCrCo ?? -12000) * 1.3),
        };
      });

      const grain = ternaryGrainSize(x, x2, R);
      const precip = ternaryPrecipitateDensity(x, x2, H, R);
      const hp = hallPetch(grain);
      const yld = predictYieldStrength(x, H, R, T, frac.primary, sys.id, x2);

      // ternary boundaries (liquidus + γ/α solvus as a function of Cr at fixed Co)
      const boundaries = Array.from({ length: 60 }, (_, i) => {
        const xc = (sys.xMax * i) / 59;
        const tl = ternaryLiquidusC(xc, x2);
        return { x: xc, t: tl, kind: i === 0 ? "liquidus" : "liquidus" };
      });

      const surrogateMs = Date.now() - surrogateT0;

      return NextResponse.json({
        ok: true,
        alloySystem: sys.id,
        composition: {
          solute: x,
          solute2: x2,
          solvent: Math.max(0, 1 - x - x2),
          soluteLabel: sys.solute,
          solute2Label: sys.solute2,
        },
        temperatureC: T,
        phaseFractions: frac,
        boundaries: boundaries.map((b) => ({ x: b.x, t: b.t, kind: b.kind })),
        gibbs: {
          temperatureC: T,
          liquid: gibbsLiquid,
          solid: gibbsSolid,
          unit: "kJ/mol",
        },
        microstructure: {
          grainSizeUm: grain,
          precipitateDensity: precip,
          hallPetchMPa: hp,
        },
        yieldStrength: yld,
        surrogateMeta: {
          model: "Regular-solution surrogate (ternary Ni-Cr-Co)",
          inferenceMs: +surrogateMs.toFixed(0),
          trainedOn: "analytical regular-solution + lever-rule surrogate — NOT CALPHAD",
          uncertainty: { liquid: 0.02, primary: 0.03, secondary: 0.02 },
          pycalphad: false,
        },
      });
    }

    // ---- Binary path (Al-Cu, Al-Si, Fe-C) ----
    const frac = phaseFractions(x, T, sys);
    const boundaries = phaseBoundaries(sys, 60);
    const gibbsLiquid = gibbsCurve(sys, T, "liquid", 40);
    const gibbsSolid = gibbsCurve(sys, T, "solid", 40);

    const grain = grainSize(x, R);
    const precip = precipitateDensity(x, H, R);
    const hp = hallPetch(grain);
    const yld = predictYieldStrength(x, H, R, T, frac.primary, sys.id);

    const surrogateMs = Date.now() - surrogateT0;

    return NextResponse.json({
      ok: true,
      alloySystem: sys.id,
      composition: { solute: x, solvent: 1 - x, soluteLabel: sys.solute },
      temperatureC: T,
      phaseFractions: frac,
      boundaries: boundaries.map((b) => ({ x: b.x, t: b.t, kind: b.kind })),
      gibbs: {
        temperatureC: T,
        liquid: gibbsLiquid,
        solid: gibbsSolid,
        unit: "kJ/mol",
      },
      microstructure: {
        grainSizeUm: grain,
        precipitateDensity: precip,
        hallPetchMPa: hp,
      },
      yieldStrength: yld,
      surrogateMeta: {
        model: "Regular-solution surrogate (binary)",
        inferenceMs: +surrogateMs.toFixed(0),
        trainedOn: "analytical regular-solution + lever-rule surrogate — NOT CALPHAD",
        uncertainty: { liquid: 0.02, primary: 0.03, secondary: 0.02 },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
