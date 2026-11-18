"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { usePredictPhase, useStressStrain } from "@/components/lab/use-lab-data";
import { Radar as RadarIcon, Trophy, Scale, Gauge, TrendingUp, Layers } from "lucide-react";

/**
 * Real engineering alloy benchmark data (representative handbook values).
 * Used to normalise the radar axes and to draw comparison overlays.
 */
interface BenchmarkAlloy {
  id: string;
  name: string;
  family: string;
  yield: number; // MPa
  uts: number; // MPa
  elongation: number; // %
  fatigue: number; // MPa endurance
  density: number; // g/cm³
  cost: number; // relative (1=cheap, 10=expensive)
  color: string;
}

const BENCHMARKS: BenchmarkAlloy[] = [
  { id: "aa2024", name: "AA2024-T3", family: "Al-Cu", yield: 345, uts: 483, elongation: 18, fatigue: 140, density: 2.78, cost: 4, color: "#d97706" },
  { id: "aa7075", name: "AA7075-T6", family: "Al-Zn", yield: 503, uts: 572, elongation: 11, fatigue: 160, density: 2.81, cost: 6, color: "#0891b2" },
  { id: "aa6061", name: "AA6061-T6", family: "Al-Mg-Si", yield: 276, uts: 310, elongation: 17, fatigue: 95, density: 2.70, cost: 2, color: "#16a34a" },
  { id: "aisi4140", name: "AISI 4140 Q&T", family: "Fe-Cr-Mo", yield: 655, uts: 745, elongation: 12, fatigue: 320, density: 7.85, cost: 3, color: "#b45309" },
  { id: "aisi304", name: "AISI 304", family: "Fe-Cr-Ni", yield: 215, uts: 505, elongation: 40, fatigue: 240, density: 8.00, cost: 5, color: "#a78bfa" },
  { id: "ti6al4v", name: "Ti-6Al-4V", family: "Ti-Al-V", yield: 880, uts: 950, elongation: 14, fatigue: 510, density: 4.43, cost: 10, color: "#ec4899" },
];

/** Normalise a property value to 0..1 against the benchmark range. */
function norm(v: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

export function PropertyRadarTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];

  // pull the live predicted properties for the current alloy
  const phaseBody = {
    alloySystem: s.alloySystem,
    soluteFraction: s.soluteFraction,
    temperatureC: s.temperatureC,
    heatTreatmentC: s.heatTreatmentC,
    coolingRateKs: s.coolingRateKs,
  };
  const phase = usePredictPhase(phaseBody, [
    s.alloySystem,
    s.soluteFraction,
    s.temperatureC,
    s.heatTreatmentC,
    s.coolingRateKs,
  ]);
  const yld = phase.data?.yieldStrength.yield ?? 160;

  const ssBody = {
    alloySystem: s.alloySystem,
    soluteFraction: s.soluteFraction,
    coolingRateKs: s.coolingRateKs,
    yieldStrength: yld,
  };
  const { data, loading } = useStressStrain(ssBody, [
    s.alloySystem,
    s.soluteFraction,
    s.coolingRateKs,
    yld,
  ]);

  // build the radar dataset: 6 axes, normalised 0..1
  const axes = [
    { key: "yield", label: "Yield σ_y", min: 100, max: 900, unit: "MPa" },
    { key: "uts", label: "UTS", min: 200, max: 1000, unit: "MPa" },
    { key: "elong", label: "Elongation", min: 2, max: 45, unit: "%" },
    { key: "fatigue", label: "Fatigue σ_e", min: 50, max: 550, unit: "MPa" },
    { key: "lightness", label: "Lightness", min: 2.5, max: 8.2, unit: "g/cm³" },
    { key: "value", label: "Cost-value", min: 1, max: 10, unit: "idx" },
  ];

  // current alloy live values
  const uts = data?.stressStrain.ultimate ?? 0;
  const elong = data ? data.stressStrain.uniformElongation * 100 * 2.2 : 0;
  const fatigue = data?.fatigue.enduranceLimit ?? 0;
  const density = s.alloySystem === "Fe-C" ? 7.85 : 2.78;
  const cost = s.alloySystem === "Fe-C" ? 3 : 4;

  const radarData = axes.map((ax) => {
    const row: Record<string, number | string> = { axis: ax.label };
    // current alloy (higher lightness = lower density → invert; higher value = lower cost → invert)
    const cur =
      ax.key === "yield"
        ? yld
        : ax.key === "uts"
          ? uts
          : ax.key === "elong"
            ? elong
            : ax.key === "fatigue"
              ? fatigue
              : ax.key === "lightness"
                ? ax.max + ax.min - density // invert
                : ax.max + ax.min - cost; // invert cost
    row["Your alloy"] = +norm(cur, ax.min, ax.max).toFixed(3);
    // 3 comparison overlays
    for (const b of BENCHMARKS.slice(0, 3)) {
      const v =
        ax.key === "yield"
          ? b.yield
          : ax.key === "uts"
            ? b.uts
            : ax.key === "elong"
              ? b.elongation
              : ax.key === "fatigue"
                ? b.fatigue
                : ax.key === "lightness"
                  ? ax.max + ax.min - b.density
                  : ax.max + ax.min - b.cost;
      row[b.name] = +norm(v, ax.min, ax.max).toFixed(3);
    }
    return row;
  });

  // find closest benchmark
  const closest = !data
    ? null
    : BENCHMARKS.reduce((best, b) => {
        const d =
          (b.yield - yld) ** 2 + (b.uts - uts) ** 2 + (b.fatigue - fatigue) ** 2;
        return d < best.d ? { b, d } : best;
      }, { b: BENCHMARKS[0], d: Infinity }).b;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Gauge className="h-4 w-4" />} label="Your σ_y" value={`${yld.toFixed(0)}`} unit="MPa" tone="primary" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Your UTS" value={data ? `${uts.toFixed(0)}` : "—"} unit="MPa" tone="rose" />
        <Kpi icon={<Scale className="h-4 w-4" />} label="Specific strength" value={data ? `${(yld / density).toFixed(0)}` : "—"} unit="MPa·cm³/g" tone="emerald" />
        <Kpi icon={<Trophy className="h-4 w-4" />} label="Closest alloy" value={closest?.name ?? "—"} unit="" tone="cyan" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Radar chart */}
        <Card className="bg-card/60 backdrop-blur xl:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <RadarIcon className="h-4 w-4 text-primary" />
                Property Comparison Radar
              </CardTitle>
              <Badge variant="outline" className="border-primary/30 text-[9px] text-primary">
                normalised 0–1
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[420px] pb-4">
            {loading || !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
                  <PolarGrid stroke="oklch(0.35 0.008 60 / 0.3)" />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fill: "oklch(0.75 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
                  />
                  <PolarRadiusAxis
                    domain={[0, 1]}
                    tickCount={5}
                    tick={{ fill: "oklch(0.5 0.01 60)", fontSize: 8 }}
                    stroke="oklch(0.3 0.008 60)"
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.19 0.008 60)",
                      border: "1px solid oklch(0.35 0.008 60)",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-geist-mono)",
                    }}
                    formatter={(v: number) => v.toFixed(2)}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />
                  <Radar
                    name="Your alloy"
                    dataKey="Your alloy"
                    stroke="oklch(0.78 0.15 55)"
                    fill="oklch(0.78 0.15 55)"
                    fillOpacity={0.35}
                    strokeWidth={2.4}
                    isAnimationActive={false}
                  />
                  {BENCHMARKS.slice(0, 3).map((b) => (
                    <Radar
                      key={b.id}
                      name={b.name}
                      dataKey={b.name}
                      stroke={b.color}
                      fill={b.color}
                      fillOpacity={0.06}
                      strokeWidth={1.6}
                      isAnimationActive={false}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Benchmark table */}
        <Card className="bg-card/60 backdrop-blur xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-emerald-400" />
              Engineering Alloy Database
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[420px] overflow-auto scroll-thin p-0">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card/90 backdrop-blur">
                <tr className="border-b border-border/50 text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Alloy</th>
                  <th className="px-2 py-2 text-right font-medium">σ_y</th>
                  <th className="px-2 py-2 text-right font-medium">UTS</th>
                  <th className="px-2 py-2 text-right font-medium">ε</th>
                  <th className="px-2 py-2 text-right font-medium">σ_e</th>
                  <th className="px-2 py-2 text-right font-medium">ρ</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <tr className="border-b border-primary/30 bg-primary/10 text-primary">
                  <td className="px-3 py-2 font-sans font-semibold">Your alloy</td>
                  <td className="px-2 py-2 text-right">{yld.toFixed(0)}</td>
                  <td className="px-2 py-2 text-right">{data ? uts.toFixed(0) : "—"}</td>
                  <td className="px-2 py-2 text-right">{data ? elong.toFixed(1) : "—"}</td>
                  <td className="px-2 py-2 text-right">{data ? fatigue.toFixed(0) : "—"}</td>
                  <td className="px-2 py-2 text-right">{density.toFixed(2)}</td>
                </tr>
                {BENCHMARKS.map((b) => (
                  <tr key={b.id} className="border-b border-border/30 hover:bg-background/40">
                    <td className="px-3 py-2 font-sans">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                        {b.name}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">{b.yield}</td>
                    <td className="px-2 py-2 text-right">{b.uts}</td>
                    <td className="px-2 py-2 text-right">{b.elongation}</td>
                    <td className="px-2 py-2 text-right">{b.fatigue}</td>
                    <td className="px-2 py-2 text-right">{b.density.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Trade-off analysis */}
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Scale className="h-4 w-4 text-cyan-400" />
            Trade-off Analysis — {sys.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <TradeCard
            title="Specific strength"
            value={data ? `${(yld / density).toFixed(0)}` : "—"}
            unit="kPa·m³/kg"
            note="Yield strength per unit density — the aerospace efficiency metric."
            benchmark={closest ? `${(closest.yield / closest.density).toFixed(0)} (${closest.name})` : "—"}
            good={data ? yld / density > closest!.yield / closest!.density : false}
          />
          <TradeCard
            title="Strength–ductility"
            value={data ? `${((yld * elong) / 1000).toFixed(1)}` : "—"}
            unit="GPa·%"
            note="σ_y × ε — the classic toughness index (higher = better balance)."
            benchmark={closest ? `${((closest.yield * closest.elongation) / 1000).toFixed(1)} (${closest.name})` : "—"}
            good={data && closest ? (yld * elong) / 1000 > (closest.yield * closest.elongation) / 1000 : false}
          />
          <TradeCard
            title="Fatigue ratio"
            value={data && uts > 0 ? `${((fatigue / uts) * 100).toFixed(0)}%` : "—"}
            unit="σ_e/UTS"
            note="Endurance limit as % of UTS — typical 0.3–0.5 for Al, 0.4–0.6 for steel."
            benchmark={closest ? `${((closest.fatigue / closest.uts) * 100).toFixed(0)}% (${closest.name})` : "—"}
            good={data && uts > 0 ? fatigue / uts > closest!.fatigue / closest!.uts : false}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "emerald" | "rose" | "cyan";
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 text-primary",
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/30 text-rose-400",
    cyan: "border-cyan-500/30 text-cyan-400",
  };
  return (
    <Card className={`bg-card/60 backdrop-blur ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={tones[tone]}>{icon}</span>
        </div>
        <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{unit}</div>
      </CardContent>
    </Card>
  );
}

function TradeCard({
  title,
  value,
  unit,
  note,
  benchmark,
  good,
}: {
  title: string;
  value: string;
  unit: string;
  note: string;
  benchmark: string;
  good: boolean;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
        <Badge
          variant="outline"
          className={
            good
              ? "border-emerald-500/40 text-[9px] text-emerald-400"
              : "border-amber-500/40 text-[9px] text-amber-400"
          }
        >
          {good ? "above benchmark" : "below benchmark"}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{note}</p>
      <div className="mt-1.5 border-t border-border/30 pt-1.5 text-[10px] text-muted-foreground">
        Benchmark: <span className="font-mono text-foreground/80">{benchmark}</span>
      </div>
    </div>
  );
}
