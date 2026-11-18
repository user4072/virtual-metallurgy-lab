"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useLabStore } from "@/store/lab-store";
import { useStressStrain } from "@/components/lab/use-lab-data";
import { StressStrainChart, SnFatigueChart } from "@/components/lab/mechanical-charts";
import { TttChart } from "@/components/lab/ttt-chart";
import { usePredictPhase } from "@/components/lab/use-lab-data";
import { Activity, Gauge, Sigma, Waves, Cpu, TrendingDown } from "lucide-react";
import type { TttApi } from "@/lib/lab-api";

export function MechanicalTab() {
  const s = useLabStore();
  // get yield strength from the phase surrogate (so mechanical tab is consistent with phase tab)
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
  const { data, loading, error } = useStressStrain(ssBody, [
    s.alloySystem,
    s.soluteFraction,
    s.coolingRateKs,
    yld,
  ]);

  // TTT carbon slider (independent, steel-focused mini-module)
  const [carbon, setCarbon] = useState(0.4);
  const [ttt, setTtt] = useState<TttApi | null>(null);
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    fetch("/api/ttt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carbon }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setTtt(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [carbon]);
  const tttLoading = !ttt;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Sigma className="h-4 w-4" />} label="Yield σ_y" value={data ? `${data.stressStrain.yieldStrength.toFixed(0)} MPa` : "—"} tone="primary" loading={loading} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="UTS" value={data ? `${data.stressStrain.ultimate.toFixed(0)} MPa` : "—"} tone="rose" loading={loading} />
        <Kpi icon={<Gauge className="h-4 w-4" />} label="Uniform ε" value={data ? `${(data.stressStrain.uniformElongation * 100).toFixed(1)}%` : "—"} tone="emerald" loading={loading} />
        <Kpi icon={<TrendingDown className="h-4 w-4" />} label="Endurance σ_e" value={data ? `${data.fatigue.enduranceLimit.toFixed(0)} MPa` : "—"} tone="cyan" loading={loading} />
      </div>

      {/* Stress-strain + S-N */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Stress–Strain (Ludwik-Hollomon)
              </CardTitle>
              {data && (
                <div className="flex gap-1.5">
                  <Badge variant="outline" className="border-primary/30 text-[9px] text-primary">
                    n={data.stressStrain.strainHardeningExp.toFixed(3)}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
                    E={data.stressStrain.youngsModulus / 1000} GPa
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[340px] pb-4">
            {error ? (
              <div className="text-sm text-rose-400">{error}</div>
            ) : !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <StressStrainChart data={data} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Waves className="h-4 w-4 text-cyan-400" />
                Fatigue S–N (Basquin + Manson-Coffin)
              </CardTitle>
              {data && (
                <Badge variant="outline" className="border-cyan-500/30 text-[9px] text-cyan-400">
                  N_t={data.fatigue.transitionLife.toExponential(0)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[340px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <SnFatigueChart data={data} />}
          </CardContent>
        </Card>
      </div>

      {/* TTT mini-module (steel) */}
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-amber-400" />
              TTT Diagram — Fe-C Steel (C = {(carbon * 100).toFixed(2)} wt%)
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbon</span>
              <Slider
                value={[carbon * 100]}
                min={5}
                max={120}
                step={1}
                onValueChange={(v) => setCarbon(v[0] / 100)}
                className="w-40 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:bg-amber-400"
              />
              <span className="w-14 rounded bg-amber-400/10 px-2 py-0.5 text-center font-mono text-xs font-semibold tabular-nums text-amber-400">
                {(carbon * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[360px] pb-4">
          {tttLoading || !ttt ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <TttChart data={ttt} />
          )}
        </CardContent>
      </Card>

      {/* Constitutive laws */}
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Constitutive & Fatigue Laws</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <LawCard title="Hollomon" eq="σ = K · ε^n" note="Uniform plastic region. n = strain-hardening exponent." />
          <LawCard title="Ludwik" eq="σ = σ_y + K · (ε − ε_y)^n" note="Elastic-plastic with yield offset." />
          <LawCard title="Basquin (HCF)" eq="σ_a = σ'_f · (2N_f)^b" note="High-cycle fatigue, b ≈ −0.09." />
          <LawCard title="Coffin-Manson (LCF)" eq="Δε_p/2 = ε'_f · (2N_f)^c" note="Low-cycle plastic fatigue, c ≈ −0.6." />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "emerald" | "rose" | "cyan";
  loading?: boolean;
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
        <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
          {loading ? <Skeleton className="h-6 w-20" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}

function LawCard({ title, eq, note }: { title: string; eq: string; note: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1.5 rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-primary">{eq}</div>
      <div className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{note}</div>
    </div>
  );
}
