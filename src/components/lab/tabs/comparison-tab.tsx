"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { ALLOY_SYSTEMS, type AlloySystemId } from "@/lib/metallurgy";
import type { CompareAlloy } from "@/lib/lab-api";
import {
  GitCompare,
  ArrowRight,
  TrendingUp,
  Scale,
  Trophy,
  Layers,
} from "lucide-react";

interface AlloyConfig {
  alloySystem: AlloySystemId;
  soluteFraction: number;
  coolingRateKs: number;
  heatTreatmentC: number;
}

export function ComparisonTab() {
  // Alloy A defaults to Al-Cu, B to Al-Si for an interesting contrast
  const [a, setA] = useState<AlloyConfig>({
    alloySystem: "Al-Cu",
    soluteFraction: 0.04,
    coolingRateKs: 8,
    heatTreatmentC: 190,
  });
  const [b, setB] = useState<AlloyConfig>({
    alloySystem: "Al-Si",
    soluteFraction: 0.07,
    coolingRateKs: 8,
    heatTreatmentC: 190,
  });

  return (
    <ComparisonInner a={a} b={b} setA={setA} setB={setB} />
  );
}

/** Inner component that owns the fetch effect properly. */
function ComparisonInner({
  a,
  b,
  setA,
  setB,
}: {
  a: AlloyConfig;
  b: AlloyConfig;
  setA: (v: AlloyConfig) => void;
  setB: (v: AlloyConfig) => void;
}) {
  const [data, setData] = useState<{ a: CompareAlloy; b: CompareAlloy } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // debounced fetch
  useDebouncedEffect(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a, b }),
      });
      const json = await res.json();
      if (json.ok) {
        setData({ a: json.a, b: json.b });
        setError(null);
      } else {
        setError(json.error ?? "failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }, [a.alloySystem, a.soluteFraction, a.coolingRateKs, a.heatTreatmentC, b.alloySystem, b.soluteFraction, b.coolingRateKs, b.heatTreatmentC], 250);

  const sysA = ALLOY_SYSTEMS[a.alloySystem];
  const sysB = ALLOY_SYSTEMS[b.alloySystem];

  return (
    <div className="space-y-5">
      {/* Config row: Alloy A vs Alloy B */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AlloyConfigCard
          title="Alloy A"
          accent={sysA.accent}
          config={a}
          onChange={setA}
          excludeSystem={b.alloySystem}
        />
        <AlloyConfigCard
          title="Alloy B"
          accent={sysB.accent}
          config={b}
          onChange={setB}
          excludeSystem={a.alloySystem}
        />
      </div>

      {/* Headline comparison */}
      <Card className="lab-card lab-card-hover relative overflow-hidden bg-card/60">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <GitCompare className="h-4 w-4 text-primary" />
            Head-to-Head — {data ? `${data.a.label} vs ${data.b.label}` : "…"}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          {!data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <CompareStat label="Yield σ_y" a={data.a.metrics.yieldStrength} b={data.b.metrics.yieldStrength} unit="MPa" />
              <CompareStat label="UTS" a={data.a.metrics.uts} b={data.b.metrics.uts} unit="MPa" />
              <CompareStat label="Specific strength" a={data.a.metrics.yieldStrength / data.a.metrics.density} b={data.b.metrics.yieldStrength / data.b.metrics.density} unit="MPa·cm³/g" />
              <CompareStat label="Endurance σ_e" a={data.a.metrics.endurance} b={data.b.metrics.endurance} unit="MPa" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overlaid phase diagram */}
      <Card className="lab-card lab-card-hover bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-primary" />
              Overlaid Phase Boundaries
            </CardTitle>
            {data && (
              <div className="flex gap-3">
                <Legend2 color={data.a.accent} label={data.a.label} />
                <Legend2 color={data.b.accent} label={data.b.label} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-[380px] pb-4">
          {error ? (
            <div className="text-sm text-rose-400">{error}</div>
          ) : !data ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <OverlaidPhaseChart a={data.a} b={data.b} />
          )}
        </CardContent>
      </Card>

      {/* Dual stress-strain + property table */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="lab-card lab-card-hover bg-card/60 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Dual Stress–Strain Curves
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <DualStressStrain a={data.a} b={data.b} />}
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover bg-card/60 xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4 text-cyan-400" />
              Property Delta Table
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!data ? (
              <Skeleton className="m-4 h-40" />
            ) : (
              <DeltaTable a={data.a} b={data.b} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Verdict */}
      {data && <VerdictCard a={data.a} b={data.b} />}
    </div>
  );
}

// ---- sub-components --------------------------------------------------------

function AlloyConfigCard({
  title,
  accent,
  config,
  onChange,
  excludeSystem,
}: {
  title: string;
  accent: string;
  config: AlloyConfig;
  onChange: (v: AlloyConfig) => void;
  excludeSystem: AlloySystemId;
}) {
  const sys = ALLOY_SYSTEMS[config.alloySystem];
  return (
    <Card className="lab-card lab-card-hover bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ background: accent }} />
            {title}
          </CardTitle>
          <Badge variant="outline" className="border-border/50 text-[9px] font-normal text-muted-foreground">
            {sys.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">Alloy system</Label>
          <Select
            value={config.alloySystem}
            onValueChange={(v) => onChange({ ...config, alloySystem: v as AlloySystemId })}
          >
            <SelectTrigger className="w-full bg-card/60"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.values(ALLOY_SYSTEMS).filter((s) => s.id !== excludeSystem).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ConfigSlider label={`${sys.solute} composition`} value={config.soluteFraction * 100} min={0} max={sys.xMax * 100} step={0.1} unit="wt%" onValue={(v) => onChange({ ...config, soluteFraction: v / 100 })} />
        <ConfigSlider label="Cooling rate" value={config.coolingRateKs} min={0.5} max={80} step={0.5} unit="K/s" onValue={(v) => onChange({ ...config, coolingRateKs: v })} />
        <ConfigSlider label="Heat-treatment T" value={config.heatTreatmentC} min={20} max={600} step={5} unit="°C" onValue={(v) => onChange({ ...config, heatTreatmentC: v })} />
      </CardContent>
    </Card>
  );
}

function ConfigSlider({
  label, value, min, max, step, unit, onValue,
}: { label: string; value: number; min: number; max: number; step: number; unit: string; onValue: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
          {value < 10 ? value.toFixed(2) : value.toFixed(1)} {unit}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onValue(v[0])}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-primary" />
    </div>
  );
}

function CompareStat({ label, a, b, unit }: { label: string; a: number; b: number; unit: string }) {
  const aWins = a > b;
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`font-mono text-xl font-semibold tabular-nums ${aWins ? "val-emphasis text-emerald-400" : "text-foreground/80"}`}>
          {a.toFixed(0)}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className={`font-mono text-xl font-semibold tabular-nums ${!aWins ? "val-emphasis text-emerald-400" : "text-foreground/80"}`}>
          {b.toFixed(0)}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{unit}</div>
      <div className="mt-1 text-[10px]">
        <span className={aWins ? "text-emerald-400" : "text-amber-400"}>
          {aWins ? "A wins" : "B wins"} by {Math.abs(a - b).toFixed(0)}
        </span>
      </div>
    </div>
  );
}

function OverlaidPhaseChart({ a, b }: { a: CompareAlloy; b: CompareAlloy }) {
  // merge liquidus boundaries from both alloys into one dataset keyed by x
  // since the two alloys have different x ranges, we plot T vs x% with each as separate series
  const dataA = a.boundaries.filter((p) => p.kind === "liquidus").map((p) => ({ x: p.x * 100, tA: p.t }));
  const dataB = b.boundaries.filter((p) => p.kind === "liquidus").map((p) => ({ x: p.x * 100, tB: p.t }));
  // merge by index (both sampled from 0..x_eutectic)
  const maxLen = Math.max(dataA.length, dataB.length);
  const merged = Array.from({ length: maxLen }, (_, i) => ({
    x: dataA[i]?.x ?? dataB[i]?.x ?? 0,
    tA: dataA[i]?.tA,
    tB: dataB[i]?.tB,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={merged} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis type="number" dataKey="x" domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Solute (wt%)", position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }} />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Liquidus T (°C)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }} />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number, n: string) => v == null ? ["—", n] : [`${v.toFixed(0)} °C`, n === "tA" ? a.label : b.label]}
          labelFormatter={(l: number) => `${l.toFixed(1)} wt%`} />
        <ReferenceLine y={a.boundaries.find((p) => p.kind === "eutectic")?.t} stroke={a.accent} strokeDasharray="4 3" opacity={0.4} />
        <ReferenceLine y={b.boundaries.find((p) => p.kind === "eutectic")?.t} stroke={b.accent} strokeDasharray="4 3" opacity={0.4} />
        <Line type="monotone" dataKey="tA" stroke={a.accent} strokeWidth={2.8} dot={false} isAnimationActive={false} name={a.label} connectNulls />
        <Line type="monotone" dataKey="tB" stroke={b.accent} strokeWidth={2.8} strokeDasharray="6 4" dot={false} isAnimationActive={false} name={b.label} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DualStressStrain({ a, b }: { a: CompareAlloy; b: CompareAlloy }) {
  const maxLen = Math.max(a.stressStrain.length, b.stressStrain.length);
  const merged = Array.from({ length: maxLen }, (_, i) => ({
    strain: (a.stressStrain[i]?.strain ?? b.stressStrain[i]?.strain ?? 0) * 100,
    sA: a.stressStrain[i]?.stress,
    sB: b.stressStrain[i]?.stress,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={merged} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis type="number" dataKey="strain" domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)" tickFormatter={(v) => v.toFixed(1)}
          label={{ value: "Strain ε (%)", position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }} />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "Stress σ (MPa)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }} />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number, n: string) => v == null ? ["—", n] : [`${v.toFixed(1)} MPa`, n === "sA" ? a.label : b.label]}
          labelFormatter={(l: number) => `ε = ${l.toFixed(2)}%`} />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />
        <Line type="monotone" dataKey="sA" stroke={a.accent} strokeWidth={2.6} dot={false} isAnimationActive={false} name={a.label} connectNulls />
        <Line type="monotone" dataKey="sB" stroke={b.accent} strokeWidth={2.6} strokeDasharray="6 4" dot={false} isAnimationActive={false} name={b.label} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DeltaTable({ a, b }: { a: CompareAlloy; b: CompareAlloy }) {
  const rows = [
    { label: "Yield σ_y", a: a.metrics.yieldStrength, b: b.metrics.yieldStrength, unit: "MPa" },
    { label: "UTS", a: a.metrics.uts, b: b.metrics.uts, unit: "MPa" },
    { label: "Elongation", a: a.metrics.elongation, b: b.metrics.elongation, unit: "%" },
    { label: "Endurance σ_e", a: a.metrics.endurance, b: b.metrics.endurance, unit: "MPa" },
    { label: "Grain size", a: a.metrics.grainSizeUm, b: b.metrics.grainSizeUm, unit: "µm" },
    { label: "Density", a: a.metrics.density, b: b.metrics.density, unit: "g/cm³" },
    { label: "Specific strength", a: a.metrics.yieldStrength / a.metrics.density, b: b.metrics.yieldStrength / b.metrics.density, unit: "kPa·m³/kg" },
  ];
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-card/90 backdrop-blur">
        <tr className="border-b border-border/50 text-[9px] uppercase tracking-wider text-muted-foreground">
          <th className="px-3 py-2 font-medium">Property</th>
          <th className="px-2 py-2 text-right font-medium" style={{ color: a.accent }}>A</th>
          <th className="px-2 py-2 text-right font-medium" style={{ color: b.accent }}>B</th>
          <th className="px-3 py-2 text-right font-medium">Δ</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {rows.map((r) => {
          const delta = r.a - r.b;
          return (
            <tr key={r.label} className="border-b border-border/30 hover:bg-background/40">
              <td className="px-3 py-2 font-sans text-foreground/80">{r.label}</td>
              <td className="px-2 py-2 text-right">{r.a.toFixed(r.unit === "g/cm³" ? 2 : 0)}</td>
              <td className="px-2 py-2 text-right">{r.b.toFixed(r.unit === "g/cm³" ? 2 : 0)}</td>
              <td className={`px-3 py-2 text-right ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                {delta > 0 ? "+" : ""}{delta.toFixed(r.unit === "g/cm³" ? 2 : 0)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function VerdictCard({ a, b }: { a: CompareAlloy; b: CompareAlloy }) {
  const aScore = (a.metrics.yieldStrength / a.metrics.density) + a.metrics.endurance * 0.5 + a.metrics.elongation * 2;
  const bScore = (b.metrics.yieldStrength / b.metrics.density) + b.metrics.endurance * 0.5 + b.metrics.elongation * 2;
  const winner = aScore >= bScore ? a : b;
  const winnerName = aScore >= bScore ? "Alloy A" : "Alloy B";
  const margin = Math.abs(aScore - bScore) / Math.max(aScore, bScore) * 100;
  return (
    <Card className="lab-card lab-card-hover bg-card/60">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-amber-400/40 bg-amber-400/10">
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Engineering verdict</div>
            <div className="font-mono text-sm font-semibold text-foreground">
              {winnerName} ({winner.label}) wins by {margin.toFixed(1)}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <ScoreChip label="A score" value={aScore} color={a.accent} />
          <ScoreChip label="B score" value={bScore} color={b.accent} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{value.toFixed(0)}</span>
    </div>
  );
}

function Legend2({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="h-2 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

// ---- helpers ----------------------------------------------------------------

import { Label } from "@/components/ui/label";
import { useEffect, useRef } from "react";

/** Debounced effect that awaits an async callback. */
function useDebouncedEffect(fn: () => void | Promise<void>, deps: unknown[], delay: number) {
  const cbRef = useRef(fn);
  useEffect(() => {
    cbRef.current = fn;
  }, [fn]);
  useEffect(() => {
    const t = setTimeout(() => { void cbRef.current(); }, delay);
    return () => clearTimeout(t);
  }, deps);
}
