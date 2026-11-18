"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useOptimize } from "@/components/lab/use-lab-data";
import { useLabStore } from "@/store/lab-store";
import {
  BoConvergenceChart,
  BoAcquisitionChart,
  BoDesignSpaceChart,
} from "@/components/lab/bo-charts";
import {
  Target,
  Play,
  Sparkles,
  Cpu,
  TrendingUp,
  Trophy,
  Layers,
  Wand2,
  Check,
} from "lucide-react";

export function OptimizationTab() {
  const [iters, setIters] = useState(12);
  const [seed, setSeed] = useState(7);
  const body = { iterations: iters, seed };
  const { data, loading, error } = useOptimize(body, [iters, seed]);
  const store = useLabStore();
  const [applied, setApplied] = useState(false);

  const applyRecipe = () => {
    if (!data) return;
    store.setSoluteFraction(data.best.C);
    store.setHeatTreatmentC(data.best.H);
    store.setCoolingRateKs(data.best.R);
    setApplied(true);
    setTimeout(() => setApplied(false), 2200);
  };

  return (
    <div className="space-y-5">
      {/* Controls + headline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-primary" />
              BO Campaign Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Iterations</span>
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">{iters}</span>
              </div>
              <Slider value={[iters]} min={4} max={30} step={1} onValueChange={(v) => setIters(v[0])} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Random seed</span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-400">{seed}</span>
              </div>
              <Slider value={[seed]} min={1} max={42} step={1} onValueChange={(v) => setSeed(v[0])} />
            </div>
            <Button
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setSeed((v) => (v % 42) + 1)}
            >
              <Play className="h-4 w-4" /> Re-run campaign
            </Button>
            <div className="rounded-md border border-border/40 bg-background/40 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
              Bayesian optimisation with a Gaussian-process surrogate and
              Expected-Improvement acquisition. Objective = predicted σ_y(C, H, R)
              from the causal model — the same "expensive experiment" an active-
              learning materials campaign would run.
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-card/60 backdrop-blur lg:col-span-2">
          <div className="absolute inset-0 grid-bg opacity-40" />
          <CardHeader className="relative pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-amber-400" />
              Optimal Alloy Design
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {!data ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Best σ_y" value={`${data.best.y.toFixed(1)}`} unit="MPa" accent tone="primary" />
                <Stat label="Improvement" value={`+${data.improvement.toFixed(1)}`} unit="MPa" tone="emerald" />
                <Stat label="Best Cu" value={`${(data.best.C * 100).toFixed(2)}`} unit="wt%" />
                <Stat label="Best R" value={`${data.best.R.toFixed(1)}`} unit="K/s" />
                <div className="col-span-2 grid grid-cols-3 gap-2 rounded-md border border-border/40 bg-background/40 px-3 py-2 sm:col-span-4">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Heat-T</div>
                    <div className="font-mono text-sm tabular-nums text-foreground">{data.best.H.toFixed(0)} °C</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Experiments</div>
                    <div className="font-mono text-sm tabular-nums text-foreground">{data.points.length}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Kernel ℓ</div>
                    <div className="font-mono text-sm tabular-nums text-foreground">{data.model.lengthScale}</div>
                  </div>
                </div>
                <button
                  onClick={applyRecipe}
                  disabled={applied}
                  className={`col-span-2 mt-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition sm:col-span-4 ${
                    applied
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {applied ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Recipe applied to sidebar — switch tabs to see results
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" /> Apply optimal recipe to lab parameters
                    </>
                  )}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              Convergence
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {!data ? <Skeleton className="h-full w-full" /> : <BoConvergenceChart data={data} />}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Acquisition EI(R)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {!data ? <Skeleton className="h-full w-full" /> : <BoAcquisitionChart data={data} />}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-cyan-400" />
              Design Space (Cu × R)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            {!data ? <Skeleton className="h-full w-full" /> : <BoDesignSpaceChart data={data} />}
          </CardContent>
        </Card>
      </div>

      {/* Experiment log */}
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-primary" />
              Experiment Log
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {data ? `${data.points.length} evaluations` : "…"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="max-h-72 overflow-auto scroll-thin p-0">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card/90 backdrop-blur">
              <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Cu (wt%)</th>
                <th className="px-4 py-2 text-right font-medium">H (°C)</th>
                <th className="px-4 py-2 text-right font-medium">R (K/s)</th>
                <th className="px-4 py-2 text-right font-medium">σ_y (MPa)</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {!data
                ? [0, 1, 2, 3, 4].map((i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-4 py-2" colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                : data.points.map((p, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border/30 transition hover:bg-primary/5 ${
                        p.source === "best" ? "bg-amber-400/10" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant="outline"
                          className={
                            p.source === "best"
                              ? "border-amber-400/50 text-amber-400"
                              : p.source === "initial"
                                ? "border-muted-foreground/30 text-muted-foreground"
                                : "border-primary/40 text-primary"
                          }
                        >
                          {p.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">{(p.C * 100).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{p.H.toFixed(0)}</td>
                      <td className="px-4 py-2 text-right">{p.R.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{p.y.toFixed(1)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
  tone?: "primary" | "emerald";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${accent ? toneCls : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{unit}</div>
    </div>
  );
}
