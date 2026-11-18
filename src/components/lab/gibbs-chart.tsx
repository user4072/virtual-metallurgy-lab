"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";
import { ALLOY_SYSTEMS, type AlloySystemId } from "@/lib/metallurgy";
import type { PhaseFractionApi } from "@/lib/lab-api";

interface Props {
  data: PhaseFractionApi;
  alloySystem: AlloySystemId;
  soluteFraction: number;
}

export function GibbsChart({ data, alloySystem, soluteFraction }: Props) {
  const sys = ALLOY_SYSTEMS[alloySystem];
  // Merge liquid + solid into a single dataset keyed by composition x
  const merged = data.gibbs.liquid.map((p, i) => ({
    x: p.x,
    liquid: p.g,
    solid: data.gibbs.solid[i]?.g ?? 0,
  }));

  // Find approximate common-tangent point (min Gibbs difference crossing)
  // For display: the operating composition
  const opIdx = Math.round((soluteFraction / sys.xMax) * (merged.length - 1));
  const opLiquid = merged[opIdx]?.liquid ?? 0;

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={merged}
          margin={{ top: 16, right: 24, bottom: 36, left: 12 }}
        >
          <CartesianGrid
            stroke="oklch(0.35 0.008 60 / 0.25)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, sys.xMax]}
            tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}`}
            stroke="oklch(0.4 0.008 60)"
            label={{
              value: `${sys.solute} (wt%)`,
              position: "insideBottom",
              offset: -16,
              fill: "oklch(0.65 0.01 60)",
              fontSize: 12,
            }}
          />
          <YAxis
            tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            stroke="oklch(0.4 0.008 60)"
            label={{
              value: `G (${data.gibbs.unit})`,
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fill: "oklch(0.65 0.01 60)",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.19 0.008 60)",
              border: "1px solid oklch(0.35 0.008 60)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-geist-mono)",
            }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)} ${data.gibbs.unit}`,
              name,
            ]}
            labelFormatter={(label: number) =>
              `${sys.solute}: ${(label * 100).toFixed(2)} wt%`
            }
          />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-geist-mono)", paddingTop: 8 }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="liquid"
            stroke="oklch(0.66 0.21 16)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            name={`G_liquid (T=${data.gibbs.temperatureC}°C)`}
          />
          <Line
            type="monotone"
            dataKey="solid"
            stroke="oklch(0.72 0.15 160)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            name="G_solid (α)"
          />
          <ReferenceDot
            x={soluteFraction}
            y={opLiquid}
            r={5}
            fill="oklch(0.96 0 0)"
            stroke="oklch(0.78 0.15 55)"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
