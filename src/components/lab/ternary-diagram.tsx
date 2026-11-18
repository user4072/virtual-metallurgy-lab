"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ALLOY_SYSTEMS, ternaryLiquidusC, ternaryPhaseFractions } from "@/lib/metallurgy";

/**
 * TernaryPhaseDiagram
 * -----------------------------------------------------------------------------
 * A real CALPHAD-style isothermal section for the Ni-Cr-Co system, rendered as
 * an equilateral triangle with Ni (top), Cr (bottom-left), Co (bottom-right)
 * at the vertices. Each point inside the triangle is coloured by its stable
 * phase at the current temperature:
 *
 *   • Liquid  (red)    — above the liquidus surface
 *   • γ (FCC) (indigo) — Ni-rich solid solution
 *   • α (BCC) (emerald)— Cr-rich solid solution
 *   • γ+α    (amber)   — two-phase region
 *
 * The composition axes are drawn as a ternary grid, and the operating point
 * (current Cr/Co composition) is plotted as a white dot.
 *
 * Barycentric coordinates: a point with fractions (xNi, xCr, xCo) maps to
 *   px = xCr * vCr_x + xCo * vCo_x + xNi * vNi_x
 *   py = xCr * vCr_y + xCo * vCo_y + xNi * vNi_y
 * where vNi, vCr, vCo are the vertex pixel positions.
 * -----------------------------------------------------------------------------
 */

const COLORS: Record<string, string> = {
  Liquid: "#ef4444",
  "γ-Ni (FCC)": "#6366f1",
  "α-Cr (BCC)": "#10b981",
  "γ+α": "#fbbf24",
};

const GRID = 40; // resolution: 40×40 grid on the triangle

export function TernaryPhaseDiagram({
  xCr,
  xCo,
  temperatureC,
}: {
  xCr: number;
  xCo: number;
  temperatureC: number;
}) {
  const sys = ALLOY_SYSTEMS["Ni-Cr-Co"];

  // Triangle geometry
  const W = 480;
  const H = 440;
  const pad = 60;
  const triH = H - pad * 2;
  const triW = triH * 2 / Math.sqrt(3); // equilateral
  const cx = W / 2;
  const vNi = { x: cx, y: pad };                    // top
  const vCr = { x: cx - triW / 2, y: pad + triH };  // bottom-left
  const vCo = { x: cx + triW / 2, y: pad + triH };  // bottom-right

  // Barycentric → pixel
  const toPx = (xNi: number, xCr: number, xCo: number) => ({
    px: xCr * vCr.x + xCo * vCo.x + xNi * vNi.x,
    py: xCr * vCr.y + xCo * vCo.y + xNi * vNi.y,
  });

  // Generate the phase-field grid
  const cells = useMemo(() => {
    const out: { px: number; py: number; phase: string; key: string }[] = [];
    const step = 1 / GRID;
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID - i; j++) {
        const xC = i * step;       // Cr fraction
        const xO = j * step;       // Co fraction
        const xN = 1 - xC - xO;    // Ni fraction
        if (xN < 0) continue;
        const frac = ternaryPhaseFractions(xC, xO, temperatureC);
        const tLiq = ternaryLiquidusC(xC, xO);
        let phase: string;
        if (temperatureC >= tLiq) {
          phase = "Liquid";
        } else if (frac.secondary < 0.01) {
          phase = "γ-Ni (FCC)";
        } else if (frac.primary < 0.01) {
          phase = "α-Cr (BCC)";
        } else {
          phase = "γ+α";
        }
        const { px, py } = toPx(xN, xC, xO);
        out.push({ px, py, phase, key: `${i}-${j}` });
      }
    }
    return out;
  }, [temperatureC]);

  // Operating point
  const xNi = Math.max(0, 1 - xCr - xCo);
  const opPt = toPx(xNi, xCr, xCo);

  // Grid lines (10% increments)
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
    for (let k = 1; k < 10; k++) {
      const f = k / 10;
      // Cr = const lines (parallel to Ni-Co edge)
      const p1 = toPx(1 - f, f, 0);
      const p2 = toPx(0, f, 1 - f);
      lines.push({ x1: p1.px, y1: p1.py, x2: p2.px, y2: p2.py, key: `cr-${k}` });
      // Co = const lines (parallel to Ni-Cr edge)
      const p3 = toPx(1 - f, 0, f);
      const p4 = toPx(0, 1 - f, f);
      lines.push({ x1: p3.px, y1: p3.py, x2: p4.px, y2: p4.py, key: `co-${k}` });
      // Ni = const lines (parallel to Cr-Co edge)
      const p5 = toPx(f, 1 - f, 0);
      const p6 = toPx(f, 0, 1 - f);
      lines.push({ x1: p5.px, y1: p5.py, x2: p6.px, y2: p6.py, key: `ni-${k}` });
    }
    return lines;
  }, []);

  return (
    <Card className="lab-card lab-card-hover bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="text-primary">▲</span>
            Ni–Cr–Co Ternary Isotherm — {temperatureC}°C
          </CardTitle>
          <div className="flex gap-1.5">
            {Object.entries(COLORS).map(([name, color]) => (
              <span key={name} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                {name}
              </span>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="flex justify-center">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[480px]">
            {/* Phase-field cells */}
            {cells.map((c) => (
              <circle
                key={c.key}
                cx={c.px}
                cy={c.py}
                r={5}
                fill={COLORS[c.phase] ?? "#333"}
                opacity={0.85}
              />
            ))}

            {/* Grid lines */}
            {gridLines.map((l) => (
              <line
                key={l.key}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="oklch(0.3 0.008 60 / 0.25)"
                strokeWidth={0.5}
              />
            ))}

            {/* Triangle outline */}
            <polygon
              points={`${vNi.x},${vNi.y} ${vCr.x},${vCr.y} ${vCo.x},${vCo.y}`}
              fill="none"
              stroke="oklch(0.5 0.01 60)"
              strokeWidth={1.5}
            />

            {/* Vertex labels */}
            <text x={vNi.x} y={vNi.y - 10} textAnchor="middle" fontSize={14} fontWeight={700} fill="oklch(0.9 0 0)">Ni</text>
            <text x={vCr.x - 15} y={vCr.y + 16} textAnchor="middle" fontSize={14} fontWeight={700} fill="oklch(0.9 0 0)">Cr</text>
            <text x={vCo.x + 15} y={vCo.y + 16} textAnchor="middle" fontSize={14} fontWeight={700} fill="oklch(0.9 0 0)">Co</text>

            {/* Axis tick labels */}
            <text x={vCr.x + triW * 0.25} y={vCr.y + 16} textAnchor="middle" fontSize={8} fill="oklch(0.5 0.01 60)">25%</text>
            <text x={vCr.x + triW * 0.5} y={vCr.y + 16} textAnchor="middle" fontSize={8} fill="oklch(0.5 0.01 60)">50%</text>
            <text x={vCr.x + triW * 0.75} y={vCr.y + 16} textAnchor="middle" fontSize={8} fill="oklch(0.5 0.01 60)">75%</text>

            {/* Operating point */}
            <circle cx={opPt.px} cy={opPt.py} r={7} fill="#fff" stroke="oklch(0.78 0.15 55)" strokeWidth={2.5} />
            <circle cx={opPt.px} cy={opPt.py} r={2} fill="oklch(0.78 0.15 55)" />
            <text
              x={opPt.px + 12}
              y={opPt.py - 8}
              fontSize={9}
              fontFamily="var(--font-geist-mono)"
              fill="#fff"
              style={{ filter: "drop-shadow(0 0 3px #000)" }}
            >
              {xCr > 0 || xCo > 0 ? `${(xCr * 100).toFixed(0)}Cr/${(xCo * 100).toFixed(0)}Co` : "pure Ni"}
            </text>
          </svg>
        </div>

        {/* Composition readout */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
            <div className="text-[9px] uppercase text-muted-foreground">Ni</div>
            <div className="font-mono text-sm font-bold text-primary">{(xNi * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-md border border-border/40 bg-card/40 p-2">
            <div className="text-[9px] uppercase text-muted-foreground">Cr</div>
            <div className="font-mono text-sm font-bold text-foreground">{(xCr * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-md border border-border/40 bg-card/40 p-2">
            <div className="text-[9px] uppercase text-muted-foreground">Co</div>
            <div className="font-mono text-sm font-bold text-foreground">{(xCo * 100).toFixed(1)}%</div>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          CALPHAD isothermal section at {temperatureC}°C computed from the Gu &amp; Du
          thermodynamic assessment. The γ(FCC) field covers the Ni–Co edge; α(BCC)
          dominates at high Cr. The white dot marks the current alloy composition.
        </p>
      </CardContent>
    </Card>
  );
}
