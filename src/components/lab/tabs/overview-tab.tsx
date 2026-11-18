"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLabStore } from "@/store/lab-store";
import { TermTooltip } from "@/components/lab/term-tooltip";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Atom,
  Microscope,
  Activity,
  Waves,
  Grid3x3,
  AlertTriangle,
  GitBranch,
  Box,
  TrendingUp,
  Gauge,
  Shield,
  Zap,
  Layers,
  Sparkles,
} from "lucide-react";

interface OverviewData {
  ok: boolean;
  recipe: { alloyLabel: string; alloySystem: string; soluteWtPct: number; solute: string; temperatureC: number; heatTreatmentC: number; coolingRateKs: number };
  kpis: {
    dominantPhase: string; liquidPct: number; primaryPct: number; liquidusC: number;
    yieldMPa: number; utsMPa: number; elongPct: number; enduranceMPa: number;
    grainUm: number; astmN: number; pptDensity: number; hallPetchMPa: number;
    scheilEutPct: number; scheilSegRatio: number;
    sensMinMPa: number; sensMaxMPa: number;
    fatigueLife: number; criticalFlawMm: number; safetyFracture: number; K_Ic: number;
    ateMPa: number; ateCI: number[];
  };
  sparklines: {
    ssCurve: { s: number; sig: number }[];
    snCurve: { N: number; sa: number }[];
    scheilPath: { T: number; fs: number }[];
  };
}

export function OverviewTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const s = useLabStore();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/overview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alloySystem: s.alloySystem,
            soluteFraction: s.soluteFraction,
            temperatureC: s.temperatureC,
            heatTreatmentC: s.heatTreatmentC,
            coolingRateKs: s.coolingRateKs,
          }),
          signal: ctrl.signal,
        });
        const d = await res.json();
        if (alive && d.ok) {
          setData(d);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [s.alloySystem, s.soluteFraction, s.temperatureC, s.heatTreatmentC, s.coolingRateKs]);

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const r = data.recipe;

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <Card className="lab-card relative overflow-hidden bg-card/60">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <CardContent className="relative flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-primary/40 bg-primary/10 copper-glow">
              <Atom className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>Virtual Metallurgy Lab</span>
                <span className="text-border">·</span>
                <span className="text-primary">live overview</span>
              </div>
              <h2 className="mt-0.5 font-mono text-xl font-bold text-foreground sm:text-2xl">
                {r.alloyLabel}
              </h2>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {r.soluteWtPct.toFixed(2)}wt% {r.solute} · {r.heatTreatmentC}°C HT · {r.coolingRateKs} K/s · σ_y {k.yieldMPa} MPa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
              <span className="font-mono text-[11px] text-emerald-400">12 modules synced</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI grid — one headline per module */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi icon={<Atom className="h-4 w-4" />} label="Dominant phase" value={k.dominantPhase} tone="primary" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label={<TermTooltip term="Hall-Petch">Yield σ_y</TermTooltip>} value={`${k.yieldMPa}`} unit="MPa" tone="primary" accent />
        <Kpi icon={<Activity className="h-4 w-4" />} label="UTS" value={`${k.utsMPa}`} unit="MPa" tone="rose" />
        <Kpi icon={<Gauge className="h-4 w-4" />} label="Elongation" value={`${k.elongPct}`} unit="%" tone="emerald" />
        <Kpi icon={<Shield className="h-4 w-4" />} label={<TermTooltip term="Basquin">Endurance σ_e</TermTooltip>} value={`${k.enduranceMPa}`} unit="MPa" tone="cyan" />
        <Kpi icon={<Microscope className="h-4 w-4" />} label="Grain size" value={`${k.grainUm}`} unit="µm" tone="primary" />
        <Kpi icon={<Layers className="h-4 w-4" />} label={<TermTooltip term="ASTM">ASTM grain No.</TermTooltip>} value={`${k.astmN}`} tone="emerald" />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Precip. density" value={`${k.pptDensity}`} unit="/µm³" tone="cyan" />
        <Kpi icon={<Waves className="h-4 w-4" />} label={<TermTooltip term="Scheil">Scheil eutectic</TermTooltip>} value={`${k.scheilEutPct}`} unit="%" tone="rose" />
        <Kpi icon={<Grid3x3 className="h-4 w-4" />} label="σ_y range" value={`${k.sensMinMPa}–${k.sensMaxMPa}`} unit="MPa" tone="primary" />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label={<TermTooltip term="Paris law">Fatigue N_f</TermTooltip>} value={k.fatigueLife > 0 ? formatLife(k.fatigueLife) : "instant"} unit="cyc" tone={k.safetyFracture < 1 ? "rose" : "amber"} />
        <Kpi icon={<GitBranch className="h-4 w-4" />} label={<TermTooltip term="ATE">ATE (cooling)</TermTooltip>} value={`+${k.ateMPa}`} unit="MPa" tone="emerald" />
      </div>

      {/* Sparkline row — 3 mini-charts */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SparkCard title="Stress–Strain" icon={<Activity className="h-4 w-4 text-rose-400" />} data={data.sparklines.ssCurve} xKey="s" yKey="sig" color="#f87171" xLabel="ε" yLabel="σ" />
        <SparkCard title="S-N Fatigue" icon={<TrendingUp className="h-4 w-4 text-cyan-400" />} data={data.sparklines.snCurve} xKey="N" yKey="sa" color="#06b6d4" xLabel="N" yLabel="σ_a" logX />
        <SparkCard title="Scheil Path" icon={<Waves className="h-4 w-4 text-amber-400" />} data={data.sparklines.scheilPath} xKey="T" yKey="fs" color="#d97706" xLabel="T(°C)" yLabel="fs" />
      </div>

      {/* Module navigation cards — clickable to jump to that tab */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <ModuleLink icon={<Atom className="h-4 w-4" />} label="Phase Diagram" value={`${k.primaryPct}% α`} tone="primary" onClick={onNavigate ? () => onNavigate("phase") : undefined} />
        <ModuleLink icon={<Microscope className="h-4 w-4" />} label="Microstructure" value="Synth + refs" tone="emerald" onClick={onNavigate ? () => onNavigate("micro") : undefined} />
        <ModuleLink icon={<Box className="h-4 w-4" />} label="3D Grains" value={`${k.grainUm}µm`} tone="rose" onClick={onNavigate ? () => onNavigate("micro3d") : undefined} />
        <ModuleLink icon={<Waves className="h-4 w-4" />} label="Solidification" value={`k=${(k.scheilSegRatio / 8).toFixed(2)}`} tone="amber" onClick={onNavigate ? () => onNavigate("scheil") : undefined} />
        <ModuleLink icon={<Activity className="h-4 w-4" />} label="Mechanical" value={`n=${(0.22 - 0.6 * r.soluteWtPct / 100).toFixed(2)}`} tone="cyan" onClick={onNavigate ? () => onNavigate("mech") : undefined} />
        <ModuleLink icon={<Sparkles className="h-4 w-4" />} label="Phase-Field" value="Cahn-Hilliard" tone="primary" onClick={onNavigate ? () => onNavigate("field") : undefined} />
        <ModuleLink icon={<GitBranch className="h-4 w-4" />} label="Causal" value={`ATE ${k.ateMPa}`} tone="emerald" onClick={onNavigate ? () => onNavigate("causal") : undefined} />
        <ModuleLink icon={<Zap className="h-4 w-4" />} label="Optimization" value="Bayesian GP" tone="rose" onClick={onNavigate ? () => onNavigate("opt") : undefined} />
        <ModuleLink icon={<Gauge className="h-4 w-4" />} label="Property Radar" value="6 alloys" tone="amber" onClick={onNavigate ? () => onNavigate("radar") : undefined} />
        <ModuleLink icon={<TrendingUp className="h-4 w-4" />} label="Compare" value="A vs B" tone="cyan" onClick={onNavigate ? () => onNavigate("compare") : undefined} />
        <ModuleLink icon={<Grid3x3 className="h-4 w-4" />} label="Sensitivity" value="24×28 grid" tone="primary" onClick={onNavigate ? () => onNavigate("sens") : undefined} />
        <ModuleLink icon={<AlertTriangle className="h-4 w-4" />} label="Failure" value={`K_Ic ${k.K_Ic}`} tone="rose" onClick={onNavigate ? () => onNavigate("fail") : undefined} />
      </div>

      {/* Safety + failure summary */}
      <Card className="lab-card lab-card-hover bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-emerald-400" />
            Engineering Verdict
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <VerdictItem label="Safety n (fracture)" value={k.safetyFracture} ok={k.safetyFracture >= 1.5} warn={k.safetyFracture >= 1 && k.safetyFracture < 1.5} />
            <VerdictItem label="Safety n (yield)" value={+(k.yieldMPa / 120).toFixed(2)} ok={k.yieldMPa / 120 >= 1.5} warn={k.yieldMPa / 120 >= 1 && k.yieldMPa / 120 < 1.5} />
            <VerdictItem label="Critical flaw a_c" value={k.criticalFlawMm} unit="mm" ok={k.criticalFlawMm > 5} warn={k.criticalFlawMm > 1 && k.criticalFlawMm <= 5} />
            <VerdictItem label="K_Ic" value={k.K_Ic} unit="MPa√m" ok={k.K_Ic > 40} warn={k.K_Ic > 25 && k.K_Ic <= 40} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- sub-components --------------------------------------------------------

function Kpi({
  icon, label, value, unit, tone, accent,
}: {
  icon: React.ReactNode; label: React.ReactNode; value: string; unit?: string;
  tone: "primary" | "emerald" | "rose" | "cyan" | "amber"; accent?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 text-primary",
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/30 text-rose-400",
    cyan: "border-cyan-500/30 text-cyan-400",
    amber: "border-amber-500/30 text-amber-400",
  };
  return (
    <Card className={`lab-card lab-card-hover ${tones[tone]}`}>
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={tones[tone]}>{icon}</span>
        </div>
        <div className={`mt-1.5 font-mono text-lg font-semibold tabular-nums text-foreground ${accent ? "val-emphasis" : ""}`}>
          {value}
        </div>
        {unit && <div className="text-[9px] text-muted-foreground">{unit}</div>}
      </CardContent>
    </Card>
  );
}

function SparkCard({
  title, icon, data, xKey, yKey, color, xLabel, yLabel, logX,
}: {
  title: string; icon: React.ReactNode; data: Record<string, number>[];
  xKey: string; yKey: string; color: string; xLabel: string; yLabel: string; logX?: boolean;
}) {
  return (
    <Card className="lab-card lab-card-hover bg-card/60">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-xs">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[120px] pb-2">
        <ResponsiveContainer width="100%" height="100%">
          {title === "Scheil Path" ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 6, fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
                formatter={(v: number) => v.toFixed(2)}
              />
              <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={1.8} fill={`url(#spark-${title})`} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
              <Tooltip
                contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 6, fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
                formatter={(v: number) => v.toFixed(1)}
              />
              <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
        <div className="mt-1 flex justify-between font-mono text-[8px] text-muted-foreground">
          <span>{xLabel}</span>
          <span>{yLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleLink({
  icon, label, value, tone, onClick,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "primary" | "emerald" | "rose" | "cyan" | "amber";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    primary: "text-primary",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    cyan: "text-cyan-400",
    amber: "text-amber-400",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`lab-card group flex w-full flex-col items-start rounded-xl border border-border/40 bg-card/40 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`flex items-center gap-1.5 transition group-hover:scale-110 ${tones[tone]}`}>{icon}</div>
      <div className="mt-1.5 text-[10px] font-medium text-foreground/90">{label}</div>
      <div className="font-mono text-[9px] text-muted-foreground">{value}</div>
      {onClick && <div className="mt-1 text-[8px] text-primary/0 transition group-hover:text-primary/70">open →</div>}
    </Comp>
  );
}

function VerdictItem({
  label, value, unit, ok, warn,
}: {
  label: string; value: number; unit?: string; ok: boolean; warn: boolean;
}) {
  const tone = ok ? "emerald" : warn ? "amber" : "rose";
  const colors: Record<string, string> = {
    emerald: "border-emerald-500/40 text-emerald-400",
    amber: "border-amber-500/40 text-amber-400",
    rose: "border-rose-500/40 text-rose-400",
  };
  return (
    <div className={`flex items-center gap-3 rounded-md border bg-background/40 px-3 py-2 ${colors[tone]}`}>
      <div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-mono text-sm font-bold tabular-nums text-foreground">
          {value.toFixed(2)}{unit && <span className="ml-1 text-[9px] text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <Badge variant="outline" className={`text-[9px] ${colors[tone]}`}>
        {ok ? "SAFE" : warn ? "MARGINAL" : "FAIL"}
      </Badge>
    </div>
  );
}

function formatLife(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toFixed(0);
}
