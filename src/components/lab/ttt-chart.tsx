"use client";

import {
  ScatterChart,
  Scatter,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import type { TttApi } from "@/lib/lab-api";

const PHASE_COLOR: Record<string, string> = {
  Pearlite: "#a78bfa",
  Bainite: "#34d399",
  Martensite: "#f87171",
  Austenite: "#fbbf24",
};

export function TttChart({ data }: { data: TttApi }) {
  const start = data.curves.filter((c) => c.kind === "start");
  const finish = data.curves.filter((c) => c.kind === "finish");
  const martensite = data.curves.filter((c) => c.kind === "martensite");

  // Build C-curve lines by phase
  const phaseNames = ["Pearlite", "Bainite"];
  const startByPhase: Record<string, { t: number; T: number; phase: string }[]> = {};
  const finishByPhase: Record<string, { t: number; T: number; phase: string }[]> = {};
  for (const c of start) {
    (startByPhase[c.phase] ??= []).push({ t: c.t, T: c.T, phase: c.phase });
  }
  for (const c of finish) {
    (finishByPhase[c.phase] ??= []).push({ t: c.t, T: c.T, phase: c.phase });
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          scale="log"
          dataKey="t"
          domain={[0.1, 1e5]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => (v >= 1 ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)) : v.toFixed(1))}
          label={{
            value: "Time (s, log)",
            position: "insideBottom",
            offset: -16,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
          }}
        />
        <YAxis
          type="number"
          dataKey="T"
          domain={[100, 950]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Temperature (°C)",
            angle: -90,
            position: "insideLeft",
            offset: 8,
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
          formatter={(value: number, name: string) => {
            if (name === "T") return [`${value.toFixed(0)} °C`, "Temperature"];
            return [value, name];
          }}
          labelFormatter={(label: number) => `t = ${label < 1 ? label.toFixed(2) : label.toFixed(0)} s`}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />

        {/* Critical temperature lines */}
        <ReferenceLine y={data.A1} stroke="#fbbf24" strokeDasharray="6 3" label={{ value: `A₁=${data.A1}°C`, fill: "#fbbf24", fontSize: 9, position: "right" }} />
        <ReferenceLine y={data.Ms} stroke="#f87171" strokeDasharray="6 3" label={{ value: `M_s=${data.Ms}°C`, fill: "#f87171", fontSize: 9, position: "right" }} />
        <ReferenceLine y={data.Mf} stroke="#f87171" strokeDasharray="3 3" label={{ value: `M_f=${data.Mf}°C`, fill: "#f87171", fontSize: 9, position: "right" }} />

        {/* C-curves: start (dashed) and finish (solid) per phase */}
        {phaseNames.map((ph) =>
          startByPhase[ph] ? (
            <Scatter
              key={`s-${ph}`}
              data={startByPhase[ph]}
              fill={PHASE_COLOR[ph]}
              line={{ stroke: PHASE_COLOR[ph], strokeDasharray: "4 3", strokeWidth: 1.8 }}
              isAnimationActive={false}
              name={`${ph} start`}
            />
          ) : null,
        )}
        {phaseNames.map((ph) =>
          finishByPhase[ph] ? (
            <Scatter
              key={`f-${ph}`}
              data={finishByPhase[ph]}
              fill={PHASE_COLOR[ph]}
              line={{ stroke: PHASE_COLOR[ph], strokeWidth: 2.4 }}
              isAnimationActive={false}
              name={`${ph} finish`}
            />
          ) : null,
        )}

        {/* Martensite isotherms as horizontal reference bands */}
        {martensite.length > 0 && (
          <Scatter
            data={[{ t: 0.5, T: data.Ms }, { t: 5e4, T: data.Ms }]}
            fill="#f87171"
            line={{ stroke: "#f87171", strokeWidth: 1.2 }}
            isAnimationActive={false}
            name="Martensite (instant)"
            legendType="none"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
