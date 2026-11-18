"use client";

import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  LabelList,
} from "recharts";
import { ALLOY_SYSTEMS, type AlloySystemId } from "@/lib/metallurgy";
import type { PhaseFractionApi } from "@/lib/lab-api";

interface Props {
  data: PhaseFractionApi;
  alloySystem: AlloySystemId;
  soluteFraction: number;
  temperatureC: number;
}

export function PhaseDiagramChart({
  data,
  alloySystem,
  soluteFraction,
  temperatureC,
}: Props) {
  const sys = ALLOY_SYSTEMS[alloySystem];

  const liquidus = data.boundaries
    .filter((b) => b.kind === "liquidus")
    .map((b) => ({ x: b.x, t: b.t }));
  const solidus = data.boundaries
    .filter((b) => b.kind === "solidus")
    .map((b) => ({ x: b.x, t: b.t }));
  const solvus = data.boundaries
    .filter((b) => b.kind === "solvus")
    .map((b) => ({ x: b.x, t: b.t }));

  const opPoint = [{ x: soluteFraction, t: temperatureC }];

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          margin={{ top: 16, right: 24, bottom: 36, left: 12 }}
        >
          <CartesianGrid
            stroke="oklch(0.35 0.008 60 / 0.25)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, sys.xEutectic]}
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
            type="number"
            dataKey="t"
            domain={[sys.tEutecticC - 60, sys.tMeltSolventC + 40]}
            tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            tickFormatter={(v) => `${v}`}
            stroke="oklch(0.4 0.008 60)"
            label={{
              value: "Temperature (°C)",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              fill: "oklch(0.65 0.01 60)",
              fontSize: 12,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            cursor={{ stroke: "oklch(0.78 0.15 55 / 0.5)", strokeWidth: 1 }}
            contentStyle={{
              background: "oklch(0.19 0.008 60)",
              border: "1px solid oklch(0.35 0.008 60)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-geist-mono)",
            }}
            labelStyle={{ color: "oklch(0.78 0.15 55)" }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)} °C`,
              name,
            ]}
            labelFormatter={(label: number) =>
              `${sys.solute}: ${(label * 100).toFixed(2)} wt%`
            }
          />

          {/* Eutectic isotherm */}
          <ReferenceLine
            y={sys.tEutecticC}
            stroke="oklch(0.66 0.21 16 / 0.6)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `T_eut = ${sys.tEutecticC}°C`,
              position: "right",
              fill: "oklch(0.66 0.21 16)",
              fontSize: 10,
            }}
          />
          {/* Eutectic composition */}
          <ReferenceLine
            x={sys.xEutectic}
            stroke="oklch(0.78 0.15 55 / 0.35)"
            strokeDasharray="4 4"
          />
          <ReferenceDot
            x={sys.xEutectic}
            y={sys.tEutecticC}
            r={5}
            fill="oklch(0.66 0.21 16)"
            stroke="oklch(0.9 0 0)"
            strokeWidth={1.5}
          />

          {/* Boundary curves */}
          <Line
            data={liquidus}
            dataKey="t"
            stroke="oklch(0.66 0.21 16)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            name="Liquidus"
          />
          <Line
            data={solidus}
            dataKey="t"
            stroke="oklch(0.78 0.15 55)"
            strokeWidth={2}
            strokeDasharray="2 2"
            dot={false}
            isAnimationActive={false}
            name="Solidus"
          />
          <Line
            data={solvus}
            dataKey="t"
            stroke="oklch(0.72 0.15 160)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
            name="Solvus"
          />

          {/* Operating point */}
          <Scatter
            data={opPoint}
            dataKey="t"
            fill="oklch(0.96 0 0)"
            stroke="oklch(0.78 0.15 55)"
            strokeWidth={2}
            isAnimationActive={false}
            name="Operating point"
          >
            <LabelList
              dataKey="t"
              position="top"
              offset={12}
              formatter={() => `(${(soluteFraction * 100).toFixed(1)}%, ${temperatureC}°C)`}
              style={{ fill: "oklch(0.9 0 0)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
            />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
