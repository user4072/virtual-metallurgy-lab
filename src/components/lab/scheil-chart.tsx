"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import type { ScheilApi } from "@/lib/lab-api";

export function ScheilChart({ data }: { data: ScheilApi }) {
  const pts = data.points.map((p) => ({
    T: p.T,
    fs: p.fs * 100,
    fl: p.fl * 100,
    xL: p.xL * 100,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={pts} margin={{ top: 12, right: 20, bottom: 32, left: 8 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          dataKey="T"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Temperature (°C)",
            position: "insideBottom",
            offset: -14,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
          }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Fraction (%)",
            angle: -90,
            position: "insideLeft",
            offset: 4,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
            style: { textAnchor: "middle" },
          }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Liquid comp. (wt%)",
            angle: 90,
            position: "insideRight",
            offset: 4,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
            style: { textAnchor: "middle" },
          }}
        />
        <Tooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />
        <ReferenceLine
          yAxisId="left"
          x={data.tSolidus}
          stroke="oklch(0.66 0.21 16 / 0.6)"
          strokeDasharray="5 4"
          label={{ value: "T_eut", fill: "oklch(0.66 0.21 16)", fontSize: 9, position: "top" }}
        />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="fs"
          stroke="oklch(0.78 0.15 55)"
          fill="oklch(0.78 0.15 55 / 0.18)"
          strokeWidth={2}
          name="Solid fs (%)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="fl"
          stroke="oklch(0.66 0.21 16)"
          strokeWidth={2}
          dot={false}
          name="Liquid fl (%)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="xL"
          stroke="oklch(0.72 0.15 160)"
          strokeWidth={2}
          strokeDasharray="4 2"
          dot={false}
          name="x_L (wt%)"
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
