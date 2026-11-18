"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import type { OptimizeApi } from "@/lib/lab-api";

export function BoConvergenceChart({ data }: { data: OptimizeApi }) {
  const pts = data.convergence.map((c) => ({ iter: c.iter, bestY: c.bestY }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pts} margin={{ top: 12, right: 20, bottom: 32, left: 8 }}>
        <defs>
          <linearGradient id="boGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.15 55 / 0.4)" />
            <stop offset="100%" stopColor="oklch(0.78 0.15 55 / 0)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          dataKey="iter"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "BO iteration", position: "insideBottom", offset: -14, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          domain={["dataMin - 5", "dataMax + 5"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Best σ_y (MPa)", angle: -90, position: "insideLeft", offset: 4, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
          }}
          formatter={(v: number) => [`${v.toFixed(1)} MPa`, "best σ_y"]}
        />
        <Area type="monotone" dataKey="bestY" stroke="oklch(0.78 0.15 55)" strokeWidth={2.4} fill="url(#boGrad)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BoAcquisitionChart({ data }: { data: OptimizeApi }) {
  const pts = data.acquisitionEI.map((p) => ({ R: p.x, ei: p.ei }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={pts} margin={{ top: 12, right: 20, bottom: 32, left: 8 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="R"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Cooling rate R (K/s)", position: "insideBottom", offset: -14, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Expected Improvement", angle: -90, position: "insideLeft", offset: 4, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
          }}
          formatter={(v: number) => [v.toFixed(3), "EI(R)"]}
          labelFormatter={(l: number) => `R = ${l.toFixed(1)} K/s`}
        />
        <Bar dataKey="ei" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {pts.map((p, i) => {
            const max = Math.max(...pts.map((q) => q.ei));
            const intensity = p.ei / max;
            return (
              <Cell
                key={i}
                fill={`oklch(${0.5 + intensity * 0.35} 0.15 ${55 + intensity * 20})`}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BoDesignSpaceChart({ data }: { data: OptimizeApi }) {
  // 3-D scatter: C, R, colored by y. H shown in tooltip.
  const pts = data.points.map((p) => ({ C: p.C * 100, R: p.R, y: p.y, H: p.H, source: p.source }));
  const max = Math.max(...pts.map((p) => p.y));
  const min = Math.min(...pts.map((p) => p.y));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 12, right: 20, bottom: 36, left: 8 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="C"
          name="Composition"
          domain={[1, 9]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Cu (wt%)", position: "insideBottom", offset: -14, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="R"
          name="Cooling rate"
          domain={[0, 85]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Cooling R (K/s)", angle: -90, position: "insideLeft", offset: 4, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <ZAxis type="number" dataKey="y" name="σ_y" domain={[min, max]} range={[60, 320]} />
        <Tooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
          }}
          formatter={(v: number, n: string) => {
            if (n === "σ_y") return [`${v.toFixed(1)} MPa`, n];
            if (n === "Composition") return [`${v.toFixed(2)} wt%`, "Cu"];
            if (n === "Cooling rate") return [`${v.toFixed(1)} K/s`, "R"];
            if (n === "H") return [`${v.toFixed(0)} °C`, "Heat-T"];
            return [v, n];
          }}
        />
        <Scatter
          data={pts}
          isAnimationActive={false}
          name="Experiments"
        >
          {pts.map((p, i) => {
            const t = (p.y - min) / Math.max(1e-6, max - min);
            const isBest = p.source === "best";
            return (
              <Cell
                key={i}
                fill={isBest ? "#fbbf24" : `oklch(${0.4 + t * 0.4} 0.18 ${30 + t * 130})`}
                stroke={isBest ? "#fff" : "transparent"}
                strokeWidth={isBest ? 2 : 0}
              />
            );
          })}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
