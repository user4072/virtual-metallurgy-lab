"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { usePredictPhase } from "@/components/lab/use-lab-data";
import { PhaseDiagramChart } from "@/components/lab/phase-diagram-chart";
import { GibbsChart } from "@/components/lab/gibbs-chart";
import { TernaryPhaseDiagram } from "@/components/lab/ternary-diagram";
import {
  Atom,
  Droplets,
  FlaskConical,
  Gauge,
  Timer,
  Cpu,
  TrendingUp,
  Layers3,
} from "lucide-react";

export function PhaseDiagramTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const body = {
    alloySystem: s.alloySystem,
    soluteFraction: s.soluteFraction,
    soluteFraction2: s.soluteFraction2,
    temperatureC: s.temperatureC,
    heatTreatmentC: s.heatTreatmentC,
    coolingRateKs: s.coolingRateKs,
  };
  const { data, loading, error } = usePredictPhase(body, [
    s.alloySystem,
    s.soluteFraction,
    s.soluteFraction2,
    s.temperatureC,
    s.heatTreatmentC,
    s.coolingRateKs,
  ]);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<FlaskConical className="h-4 w-4" />}
          label="Dominant Phase"
          value={data ? data.phaseFractions.dominantPhase : "—"}
          tone="primary"
          loading={loading}
        />
        <KpiCard
          icon={<Droplets className="h-4 w-4" />}
          label="Liquid Fraction"
          value={data ? `${(data.phaseFractions.liquid * 100).toFixed(1)}%` : "—"}
          tone="rose"
          loading={loading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Predicted σ_y"
          value={data ? `${data.yieldStrength.yield.toFixed(0)} MPa` : "—"}
          tone="emerald"
          loading={loading}
        />
        <KpiCard
          icon={<Timer className="h-4 w-4" />}
          label="Surrogate Latency"
          value={data ? `${data.surrogateMeta.inferenceMs} ms` : "—"}
          tone="cyan"
          loading={loading}
          sub="vs 4.2 s CALPHAD"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {sys.isTernary ? (
          /* Ternary: show the CALPHAD isothermal section */
          <div className="xl:col-span-3">
            <TernaryPhaseDiagram
              xCr={s.soluteFraction}
              xCo={s.soluteFraction2}
              temperatureC={s.temperatureC}
            />
          </div>
        ) : (
          /* Binary: show the 2D phase diagram */
          <Card className="xl:col-span-3 bg-card/60 backdrop-blur">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Atom className="h-4 w-4 text-primary" />
                  {sys.label} Phase Diagram
                </CardTitle>
                <Legend />
              </div>
            </CardHeader>
            <CardContent className="h-[360px] pb-4">
              {error ? (
                <ErrorState msg={error} />
              ) : !data ? (
                <Skeleton className="h-full w-full rounded-md" />
              ) : (
                <PhaseDiagramChart
                  data={data}
                  alloySystem={s.alloySystem}
                  soluteFraction={s.soluteFraction}
                  temperatureC={s.temperatureC}
                />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="xl:col-span-2 bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers3 className="h-4 w-4 text-emerald-400" />
              Gibbs Free-Energy Curves
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[360px] pb-4">
            {error ? (
              <ErrorState msg={error} />
            ) : !data ? (
              <Skeleton className="h-full w-full rounded-md" />
            ) : (
              <GibbsChart
                data={data}
                alloySystem={s.alloySystem}
                soluteFraction={s.soluteFraction}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: phase fractions + microstructure + surrogate meta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Phase Fractions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data
              ? [0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))
              : data.phaseFractions.phases.map((p) => (
                  <div key={p.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-foreground/90">
                        {p.name}
                      </span>
                      <span
                        className="font-mono font-semibold tabular-nums"
                        style={{ color: p.color }}
                      >
                        {(p.fraction * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${p.fraction * 100}%`,
                          background: p.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Microstructure Metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Metric
              icon={<Gauge className="h-3.5 w-3.5" />}
              label="Grain Size"
              value={data ? `${data.microstructure.grainSizeUm.toFixed(2)}` : "—"}
              unit="µm"
              loading={loading}
            />
            <Metric
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="Hall–Petch σ"
              value={data ? `${data.microstructure.hallPetchMPa.toFixed(0)}` : "—"}
              unit="MPa"
              loading={loading}
            />
            <Metric
              icon={<Atom className="h-3.5 w-3.5" />}
              label="Precip. Density"
              value={
                data
                  ? `${(data.microstructure.precipitateDensity).toFixed(0)}`
                  : "—"
              }
              unit="/µm³"
              loading={loading}
            />
            <Metric
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Orowan Δσ"
              value={
                data ? `${(data.yieldStrength.precip * 0.018).toFixed(1)}` : "—"
              }
              unit="MPa"
              loading={loading}
            />
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Surrogate Model Card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <Row label="Architecture" value={data?.surrogateMeta.model ?? "—"} mono />
            <Row label="Trained on" value={data?.surrogateMeta.trainedOn ?? "—"} />
            <Row
              label="Inference"
              value={data ? `${data.surrogateMeta.inferenceMs} ms` : "—"}
              mono
            />
            <Row
              label="Speedup vs CALPHAD"
              value={data ? `~${(4200 / data.surrogateMeta.inferenceMs).toFixed(0)}×` : "—"}
              mono
              accent
            />
            <div className="pt-1">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Epistemic uncertainty (±)
              </div>
              {data ? (
                <div className="space-y-1.5">
                  {Object.entries(data.surrogateMeta.uncertainty).map(
                    ([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-16 font-mono text-[10px] capitalize text-muted-foreground">
                          {k}
                        </span>
                        <Progress value={v * 100 * 8} className="h-1.5" />
                        <span className="font-mono text-[10px] tabular-nums">
                          ±{(v * 100).toFixed(1)}%
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <Skeleton className="h-10 w-full" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  loading,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "emerald" | "rose" | "cyan";
  loading?: boolean;
  sub?: string;
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
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className={tones[tone]}>{icon}</span>
        </div>
        <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
          {loading ? <Skeleton className="h-6 w-24" /> : value}
        </div>
        {sub && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {loading ? "—" : value}
        </span>
        <span className="text-[10px] text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right text-foreground/90 ${mono ? "font-mono" : ""} ${accent ? "font-semibold text-primary" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Legend() {
  const items = [
    { c: "oklch(0.66 0.21 16)", l: "Liquidus" },
    { c: "oklch(0.78 0.15 55)", l: "Solidus" },
    { c: "oklch(0.72 0.15 160)", l: "Solvus" },
    { c: "oklch(0.96 0 0)", l: "Op. point" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {items.map((i) => (
        <span key={i.l} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-2 w-3 rounded-sm" style={{ background: i.c }} />
          {i.l}
        </span>
      ))}
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-rose-400">
      <Badge variant="destructive" className="mr-2">
        ERROR
      </Badge>
      <span className="font-mono text-xs">{msg}</span>
    </div>
  );
}
