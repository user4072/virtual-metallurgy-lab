"use client";

import {
  LineChart,
  Line,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Legend,
} from "recharts";
import type { StressStrainApi } from "@/lib/lab-api";

export function StressStrainChart({ data }: { data: StressStrainApi }) {
  const ss = data.stressStrain;
  const pts = ss.curve.map((p) => ({ strain: p.strain * 100, stress: p.stress }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <defs>
          <linearGradient id="ssGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.15 55 / 0.35)" />
            <stop offset="100%" stopColor="oklch(0.78 0.15 55 / 0)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          dataKey="strain"
          type="number"
          domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => v.toFixed(1)}
          label={{
            value: "Strain ε (%)",
            position: "insideBottom",
            offset: -16,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
          }}
        />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Stress σ (MPa)",
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
          formatter={(v: number, n: string) => [`${v.toFixed(1)} MPa`, n]}
          labelFormatter={(l: number) => `ε = ${l.toFixed(2)}%`}
        />
        <ReferenceLine
          y={ss.yieldStrength}
          stroke="#34d399"
          strokeDasharray="5 3"
          label={{ value: `σ_y=${ss.yieldStrength.toFixed(0)}`, fill: "#34d399", fontSize: 9, position: "right" }}
        />
        <ReferenceLine
          y={ss.ultimate}
          stroke="#f87171"
          strokeDasharray="5 3"
          label={{ value: `UTS=${ss.ultimate.toFixed(0)}`, fill: "#f87171", fontSize: 9, position: "right" }}
        />
        <Area
          type="monotone"
          dataKey="stress"
          stroke="oklch(0.78 0.15 55)"
          strokeWidth={2.4}
          fill="url(#ssGrad)"
          isAnimationActive={false}
          name="σ(ε)"
        />
        <ReferenceDot
          x={ss.uniformElongation * 100}
          y={ss.ultimate}
          r={5}
          fill="#f87171"
          stroke="oklch(0.96 0 0)"
          strokeWidth={1.5}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SnFatigueChart({ data }: { data: StressStrainApi }) {
  const sn = data.fatigue;
  const pts = sn.curve.map((p) => ({
    Nf: p.Nf,
    stressAmp: p.stressAmp,
    regime: p.regime,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          dataKey="Nf"
          type="number"
          scale="log"
          domain={[1e1, 1e9]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : v.toFixed(0))}
          label={{
            value: "Cycles to failure N_f (log)",
            position: "insideBottom",
            offset: -16,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
          }}
        />
        <YAxis
          type="number"
          domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "Stress amp. σ_a (MPa)",
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
          formatter={(v: number) => [`${v.toFixed(1)} MPa`, "σ_a"]}
          labelFormatter={(l: number) => `N_f = ${l.toExponential(1)}`}
        />
        <ReferenceLine
          y={sn.enduranceLimit}
          stroke="#34d399"
          strokeDasharray="6 3"
          label={{ value: `σ_e=${sn.enduranceLimit.toFixed(0)}`, fill: "#34d399", fontSize: 9, position: "right" }}
        />
        <Line
          type="monotone"
          dataKey="stressAmp"
          stroke="oklch(0.7 0.13 200)"
          strokeWidth={2.4}
          dot={{ r: 3, fill: "oklch(0.7 0.13 200)" }}
          isAnimationActive={false}
          name="S-N (Wöhler)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
