"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { buildComposition } from "@/lib/composition";
import { useScheil } from "@/components/lab/use-lab-data";
import { ScheilChart } from "@/components/lab/scheil-chart";
import { Flame, Snowflake, Sigma, TrendingUp, Droplet, Waves } from "lucide-react";

export function SolidificationTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  // local carbon slider for the TTT/steel mini-card (only meaningful for Fe-C)
  const body = {
    alloySystem: s.alloySystem,
    soluteFraction: s.soluteFraction,
    composition: buildComposition(s.alloySystem, s.soluteFraction, s.soluteFraction2, s.compExtra),
  };
  const { data, loading, error } = useScheil(body, [
    s.alloySystem,
    s.soluteFraction,
    JSON.stringify(s.compExtra),
    s.soluteFraction2,
  ]);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Flame className="h-4 w-4" />}
          label="Liquidus T"
          value={data?.tLiquidus != null ? `${data.tLiquidus.toFixed(0)} °C` : "—"}
          tone="rose"
          loading={loading}
        />
        <Kpi
          icon={<Snowflake className="h-4 w-4" />}
          label="Solidus (Scheil)"
          value={data?.tSolidus != null ? `${data.tSolidus.toFixed(0)} °C` : "—"}
          tone="cyan"
          loading={loading}
        />
        <Kpi
          icon={<Droplet className="h-4 w-4" />}
          label="Eutectic frac."
          value={data?.eutecticFraction != null ? `${(data.eutecticFraction * 100).toFixed(1)}%` : "—"}
          tone="primary"
          loading={loading}
        />
        <Kpi
          icon={<Sigma className="h-4 w-4" />}
          label="Partition k"
          value={data?.partitionCoeff != null ? data.partitionCoeff.toFixed(3) : "—"}
          tone="emerald"
          loading={loading}
        />
      </div>

      {/* Main chart */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="bg-card/60 backdrop-blur xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Waves className="h-4 w-4 text-primary" />
              Scheil Solidification Path — {sys.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[380px] pb-4">
            {error ? (
              <div className="text-sm text-rose-400">{error}</div>
            ) : !data ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ScheilChart data={data} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scheil vs Equilibrium</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : (
              <>
                <ComparisonRow
                  label="Solidus T (equilibrium)"
                  eq={data?.tLiquidus != null ? `${(data.tLiquidus - 35).toFixed(0)} °C` : "—"}
                  scheil={data?.tSolidus != null ? `${data.tSolidus.toFixed(0)} °C` : "—"}
                  delta={data?.tSolidus != null && data?.tLiquidus != null ? `${(data.tSolidus - (data.tLiquidus - 35)).toFixed(0)} °C` : "—"}
                />
                <ComparisonRow
                  label="Eutectic fraction"
                  eq={`${(Math.max(0, (s.soluteFraction - sys.xMaxSolid) / (sys.xEutectic - sys.xMaxSolid)) * 100).toFixed(1)}%`}
                  scheil={data?.eutecticFraction != null ? `${(data.eutecticFraction * 100).toFixed(1)}%` : "—"}
                  delta={data?.eutecticFraction != null ? `+${((data.eutecticFraction - Math.max(0, (s.soluteFraction - sys.xMaxSolid) / (sys.xEutectic - sys.xMaxSolid))) * 100).toFixed(1)}%` : "—"}
                  deltaTone="up"
                />
                <ComparisonRow
                  label="Segregation ratio"
                  eq="1.00×"
                  scheil={data?.segregationRatio != null ? `${data.segregationRatio.toFixed(2)}×` : "—"}
                  delta={data?.segregationRatio != null ? `+${(data.segregationRatio - 1).toFixed(2)}×` : "—"}
                  deltaTone="up"
                />
              </>
            )}
            <div className="rounded-md border border-border/40 bg-background/40 p-3 text-[10.5px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-foreground/90">Scheil-Gulliver</span>{" "}
              assumes <span className="text-foreground/90">zero solid diffusion</span> —
              solute is rejected into the liquid, enriching it toward the eutectic
              composition. This is why real castings show a much larger eutectic
              fraction (and microsegregation) than equilibrium predicts.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheil equation explainer */}
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Governing Equations
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <EquationCard
            title="Scheil equation"
            eq="f_s = 1 − ((T_m − T_L)/(T_m − T))^(1/k)"
            note="Solid fraction vs temperature; k = partition coefficient."
          />
          <EquationCard
            title="Liquid enrichment"
            eq="x_L = x_0 · (1 − f_s)^(k−1)"
            note="Solute rejected from the solid enriches the remaining liquid."
          />
          <EquationCard
            title="Microsegregation"
            eq="x_s(x=0) / x_s(x=1) = k · (x_L,max / x_0)"
            note="Drives coring & eutectic at grain boundaries in castings."
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

function ComparisonRow({
  label,
  eq,
  scheil,
  delta,
  deltaTone,
}: {
  label: string;
  eq: string;
  scheil: string;
  delta: string;
  deltaTone?: "up" | "down";
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[9px] text-muted-foreground">Equilibrium</div>
          <div className="font-mono text-xs tabular-nums text-foreground/80">{eq}</div>
        </div>
        <div>
          <div className="text-[9px] text-primary">Scheil</div>
          <div className="font-mono text-xs font-semibold tabular-nums text-primary">{scheil}</div>
        </div>
        <div>
          <div className="text-[9px] text-muted-foreground">Δ</div>
          <div
            className={`font-mono text-xs tabular-nums ${
              deltaTone === "up" ? "text-amber-400" : "text-foreground/80"
            }`}
          >
            {delta}
          </div>
        </div>
      </div>
    </div>
  );
}

function EquationCard({ title, eq, note }: { title: string; eq: string; note: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1.5 rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] text-primary">{eq}</div>
      <div className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{note}</div>
    </div>
  );
}
