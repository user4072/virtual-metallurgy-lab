"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import type { SensitivityApi } from "@/lib/lab-api";
import {
  Grid3x3,
  TrendingUp,
  Thermometer,
  Crosshair,
  Zap,
  Activity,
} from "lucide-react";

export function SensitivityTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const [heatT, setHeatT] = useState(s.heatTreatmentC);
  const [data, setData] = useState<SensitivityApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/sensitivity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alloySystem: s.alloySystem, heatTreatmentC: heatT }),
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
  }, [s.alloySystem, heatT]);

  // heatmap colour scale: copper (low) → amber → emerald (high)
  const colorFor = (v: number, min: number, max: number) => {
    const t = Math.max(0, Math.min(1, (v - min) / Math.max(max - min, 1)));
    // 3-stop gradient: #7c2d12 (low) -> #d97706 (mid) -> #10b981 (high)
    if (t < 0.5) {
      const k = t / 0.5;
      const r = Math.round(124 + (217 - 124) * k);
      const g = Math.round(45 + (119 - 45) * k);
      const b = Math.round(18 + (6 - 18) * k);
      return `rgb(${r},${g},${b})`;
    }
    const k = (t - 0.5) / 0.5;
    const r = Math.round(217 + (16 - 217) * k);
    const g = Math.round(119 + (185 - 119) * k);
    const b = Math.round(6 + (129 - 6) * k);
    return `rgb(${r},${g},${b})`;
  };

  const min = data ? Math.min(...data.yieldMatrix.flat()) : 0;
  const max = data ? Math.max(...data.yieldMatrix.flat()) : 1;

  return (
    <div className="space-y-5">
      {/* Heat-treatment slider + KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lab-card lab-card-hover bg-card/60 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Thermometer className="h-4 w-4 text-primary" />
              Heat-Treatment T
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ageing temp</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
                {heatT.toFixed(0)} °C
              </span>
            </div>
            <Slider
              value={[heatT]}
              min={20}
              max={600}
              step={5}
              onValueChange={(v) => setHeatT(v[0])}
              className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-primary"
            />
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              The sweep recomputes across the full (composition × cooling-rate) grid
              for this ageing temperature.
            </p>
          </CardContent>
        </Card>

        <Kpi icon={<Zap className="h-4 w-4" />} label="Min σ_y in grid" value={data ? min.toFixed(0) : "—"} unit="MPa" tone="rose" loading={loading} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Max σ_y in grid" value={data ? max.toFixed(0) : "—"} unit="MPa" tone="emerald" loading={loading} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Dynamic range" value={data ? (max - min).toFixed(0) : "—"} unit="MPa" tone="primary" loading={loading} />
      </div>

      {/* Heatmap */}
      <Card className="lab-card lab-card-hover bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Grid3x3 className="h-4 w-4 text-primary" />
              Yield-Strength Design Space — {sys.label}
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">low</span>
              <div className="h-2.5 w-24 rounded" style={{ background: "linear-gradient(to right, rgb(124,45,18), rgb(217,119,6), rgb(16,185,129))" }} />
              <span className="text-[10px] text-muted-foreground">high</span>
              <Badge variant="outline" className="ml-2 border-primary/30 text-[9px] text-primary">
                {data ? `${data.yieldMatrix.length}×${data.yieldMatrix[0]?.length}` : "—"} grid
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {loading || !data ? (
            <Skeleton className="h-[340px] w-full" />
          ) : (
            <Heatmap
              data={data}
              colorFor={(v) => colorFor(v, min, max)}
              hover={hover}
              setHover={setHover}
              sys={sys}
            />
          )}
        </CardContent>
      </Card>

      {/* Sweep line charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              σ_y vs Cooling Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <SweepRChart data={data} />}
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Crosshair className="h-4 w-4 text-cyan-400" />
              σ_y vs Composition
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <SweepXChart data={data} sys={sys} />}
          </CardContent>
        </Card>
      </div>

      {/* Hover readout */}
      <Card className="lab-card lab-card-hover bg-card/60">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {hover ? "Cell readout" : "Hover the heatmap for a cell readout"}
            </span>
          </div>
          {hover && data ? (
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
              <Readout label={`${sys.solute}`} value={`${(data.compositionAxis[hover.i] * 100).toFixed(2)} wt%`} />
              <Readout label="Cooling R" value={`${data.coolingRateAxis[hover.j].toFixed(1)} K/s`} />
              <Readout label="σ_y" value={`${data.yieldMatrix[hover.i][hover.j].toFixed(0)} MPa`} accent />
              <Readout label="UTS" value={`${data.utsMatrix[hover.i][hover.j].toFixed(0)} MPa`} />
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">—</span>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Heatmap (custom SVG) --------------------------------------------------

function Heatmap({
  data,
  colorFor,
  hover,
  setHover,
  sys,
}: {
  data: SensitivityApi;
  colorFor: (v: number) => string;
  hover: { i: number; j: number } | null;
  setHover: (h: { i: number; j: number } | null) => void;
  sys: { solute: string };
}) {
  const nC = data.compositionAxis.length;
  const nR = data.coolingRateAxis.length;
  const W = 760;
  const H = 320;
  const padL = 56;
  const padB = 38;
  const padT = 12;
  const padR = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const cw = plotW / nC;
  const ch = plotH / nR;

  // x axis = composition (columns), y axis = cooling rate (rows, log → inverted)
  const xToPx = (i: number) => padL + i * cw;
  const yToPx = (j: number) => padT + (nR - 1 - j) * ch;

  return (
    <div className="w-full overflow-x-auto scroll-thin">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" style={{ maxHeight: 360 }}>
        {/* cells */}
        {data.yieldMatrix.map((row, i) =>
          row.map((v, j) => {
            const isHover = hover?.i === i && hover?.j === j;
            return (
              <rect
                key={`${i}-${j}`}
                x={xToPx(i)}
                y={yToPx(j)}
                width={cw + 0.5}
                height={ch + 0.5}
                fill={colorFor(v)}
                opacity={isHover ? 1 : 0.92}
                stroke={isHover ? "#fff" : "transparent"}
                strokeWidth={isHover ? 1.5 : 0}
                onMouseEnter={() => setHover({ i, j })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "crosshair" }}
              />
            );
          }),
        )}
        {/* x axis labels */}
        <text x={padL} y={H - 8} textAnchor="start" fontSize={10} fontFamily="var(--font-geist-mono)" fill="oklch(0.65 0.01 60)">
          {(data.compositionAxis[0] * 100).toFixed(1)}%
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize={10} fontFamily="var(--font-geist-mono)" fill="oklch(0.65 0.01 60)">
          {(data.compositionAxis[nC - 1] * 100).toFixed(1)}%
        </text>
        <text x={(padL + W - padR) / 2} y={H - 18} textAnchor="middle" fontSize={11} fill="oklch(0.7 0.01 60)">
          {sys.solute} composition (wt%)
        </text>
        {/* y axis labels */}
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={10} fontFamily="var(--font-geist-mono)" fill="oklch(0.65 0.01 60)">
          {data.coolingRateAxis[nR - 1].toFixed(0)}
        </text>
        <text x={padL - 6} y={H - padB} textAnchor="end" fontSize={10} fontFamily="var(--font-geist-mono)" fill="oklch(0.65 0.01 60)">
          {data.coolingRateAxis[0].toFixed(1)}
        </text>
        <text x={14} y={(padT + H - padB) / 2} textAnchor="middle" fontSize={11} fill="oklch(0.7 0.01 60)" transform={`rotate(-90 14 ${(padT + H - padB) / 2})`}>
          Cooling rate (K/s, log)
        </text>
      </svg>
    </div>
  );
}

// ---- Sweep charts ----------------------------------------------------------

function SweepRChart({ data }: { data: SensitivityApi }) {
  const pts = data.sweepR.map((p) => ({ R: p.R, yield: p.yield, grain: p.grain }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          scale="log"
          dataKey="R"
          domain={[0.5, 120]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))}
          label={{ value: "Cooling rate R (K/s, log)", position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "σ_y (MPa)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number, n: string) => [`${v.toFixed(1)} ${n === "yield" ? "MPa" : "µm"}`, n === "yield" ? "σ_y" : "grain"]}
          labelFormatter={(l: number) => `R = ${l.toFixed(1)} K/s`}
        />
        <Line type="monotone" dataKey="yield" stroke="oklch(0.78 0.15 55)" strokeWidth={2.6} dot={false} isAnimationActive={false} name="yield" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SweepXChart({ data, sys }: { data: SensitivityApi; sys: { solute: string } }) {
  const pts = data.sweepX.map((p) => ({ x: p.x * 100, yield: p.yield }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={["dataMin", "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => v.toFixed(1)}
          label={{ value: `${sys.solute} (wt%)`, position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: "σ_y (MPa)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number) => [`${v.toFixed(1)} MPa`, "σ_y"]}
          labelFormatter={(l: number) => `${sys.solute} = ${l.toFixed(2)} wt%`}
        />
        <Line type="monotone" dataKey="yield" stroke="oklch(0.72 0.15 160)" strokeWidth={2.6} dot={false} isAnimationActive={false} name="yield" />
        <ReferenceDot x={data.midpoint.x * 100} y={data.sweepX[Math.floor(data.sweepX.length / 2)]?.yield ?? 0} r={5} fill="#fff" stroke="oklch(0.72 0.15 160)" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- helpers ---------------------------------------------------------------

function Kpi({
  icon, label, value, unit, tone, loading,
}: {
  icon: React.ReactNode; label: string; value: string; unit: string;
  tone: "primary" | "emerald" | "rose" | "cyan"; loading?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 text-primary",
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/30 text-rose-400",
    cyan: "border-cyan-500/30 text-cyan-400",
  };
  return (
    <Card className={`lab-card lab-card-hover ${tones[tone]}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={tones[tone]}>{icon}</span>
        </div>
        <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">
          {loading ? <Skeleton className="h-6 w-16" /> : value}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{unit}</div>
      </CardContent>
    </Card>
  );
}

function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-semibold ${accent ? "val-emphasis text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}
