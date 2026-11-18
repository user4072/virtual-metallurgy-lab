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
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import type { FailureApi } from "@/lib/lab-api";
import {
  AlertTriangle,
  Activity,
  Shield,
  Crosshair,
  Zap,
  TrendingDown,
  Gauge,
  Split,
} from "lucide-react";
import { TermTooltip } from "@/components/lab/term-tooltip";

export function FailureTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const [dSigma, setDSigma] = useState(120);
  const [a0, setA0] = useState(0.5);
  const [stressR, setStressR] = useState(0.1);
  const [data, setData] = useState<FailureApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/failure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alloySystem: s.alloySystem,
            soluteFraction: s.soluteFraction,
            coolingRateKs: s.coolingRateKs,
            heatTreatmentC: s.heatTreatmentC,
            stressAmplitude: dSigma,
            initialFlaw: a0,
            stressRatio: stressR,
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
  }, [s.alloySystem, s.soluteFraction, s.coolingRateKs, s.heatTreatmentC, dSigma, a0, stressR]);

  const modeColor =
    data?.failureMode.mode === "Brittle"
      ? "#f87171"
      : data?.failureMode.mode === "Ductile"
        ? "#34d399"
        : "#fbbf24";

  return (
    <div className="space-y-5">
      {/* Inputs + KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Crosshair className="h-4 w-4 text-primary" />
              Load & Flaw
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SliderRow label="Stress amp. Δσ" value={dSigma} min={20} max={400} step={5} unit="MPa" onValue={setDSigma} />
            <SliderRow label="Initial flaw a₀" value={a0} min={0.01} max={5} step={0.01} unit="mm" onValue={setA0} />
            <SliderRow label="Stress ratio R" value={stressR} min={-1} max={0.9} step={0.05} unit="" onValue={setStressR} />
          </CardContent>
        </Card>

        <Kpi icon={<Activity className="h-4 w-4" />} label="Fatigue life N_f" value={data ? fmtLife(data.crack.fatigueLife) : "—"} unit="cycles" tone="primary" loading={loading} />
        <Kpi icon={<Split className="h-4 w-4" />} label="Critical flaw a_c" value={data ? data.crack.criticalFlaw_mm.toFixed(2) : "—"} unit="mm" tone="rose" loading={loading} />
        <Kpi icon={<Shield className="h-4 w-4" />} label="Safety n (fracture)" value={data ? data.safety.nFracture.toFixed(2) : "—"} unit="×" tone={data && data.safety.nFracture < 1.5 ? "rose" : "emerald"} loading={loading} />
      </div>

      {/* Failure-mode banner */}
      <Card className="lab-card bg-card/60" style={{ borderColor: `${modeColor}55` }}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg" style={{ background: `${modeColor}1a`, border: `1px solid ${modeColor}55` }}>
              <AlertTriangle className="h-6 w-6" style={{ color: modeColor }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Predicted failure mode</div>
              <div className="font-mono text-lg font-bold" style={{ color: modeColor }}>
                {data ? data.failureMode.mode : "—"} fracture
              </div>
            </div>
          </div>
          {data && (
            <div className="flex items-center gap-4">
              <ProbBar label="Brittle" value={data.failureMode.probabilities.Brittle} color="#f87171" />
              <ProbBar label="Ductile" value={data.failureMode.probabilities.Ductile} color="#34d399" />
              <ProbBar label="Fatigue" value={data.failureMode.probabilities.Fatigue} color="#fbbf24" />
            </div>
          )}
          {data && (
            <div className="flex items-center gap-3 text-xs">
              <div className="text-center">
                <div className="text-[9px] uppercase text-muted-foreground">K_Ic</div>
                <div className="font-mono font-semibold tabular-nums text-foreground">{data.material.K_Ic.toFixed(1)}</div>
                <div className="text-[9px] text-muted-foreground">MPa√m</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] uppercase text-muted-foreground">K_Ic/σ_y</div>
                <div className="font-mono font-semibold tabular-nums" style={{ color: modeColor }}>{data.failureMode.toughnessRatio.toFixed(2)}</div>
                <div className="text-[9px] text-muted-foreground">toughness</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Paris-law curve */}
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown className="h-4 w-4 text-primary" />
                Paris-law Crack Growth
              </CardTitle>
              <Badge variant="outline" className="border-primary/30 text-[9px] text-primary">
                da/dN = C·ΔK^m
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[280px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <ParisChart data={data} />}
          </CardContent>
        </Card>

        {/* Crack length vs N */}
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Split className="h-4 w-4 text-rose-400" />
                Crack Length vs Cycles
              </CardTitle>
              {data && (
                <Badge variant="outline" className="border-rose-500/30 text-[9px] text-rose-400">
                  a_c = {data.crack.criticalFlaw_mm.toFixed(2)} mm
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[280px] pb-4">
            {!data ? <Skeleton className="h-full w-full" /> : <CrackGrowthChart data={data} />}
          </CardContent>
        </Card>
      </div>

      {/* Safety + material card */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-emerald-400" />
              Safety Factors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data ? (
              [0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : (
              <>
                <SafetyRow label="vs Yield (σ_y)" value={data.safety.nYield} limit={1.5} />
                <SafetyRow label="vs Fracture (K_Ic)" value={data.safety.nFracture} limit={1.5} />
                <div className="rounded-md border border-border/40 bg-background/40 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  n &gt; 1.5 = safe · 1.0–1.5 = marginal · &lt; 1.0 = failure expected. The fracture safety factor uses the initial flaw size a₀.
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-cyan-400" />
              Material State
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {!data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <Row label="Alloy" value={sys.label} />
                <Row label="Grain size" value={`${data.material.grainSizeUm.toFixed(2)} µm`} />
                <Row label="Yield σ_y" value={`${data.material.yieldStrength.toFixed(0)} MPa`} />
                <Row label="UTS" value={`${data.material.uts.toFixed(0)} MPa`} />
                <Row label={<TermTooltip term="K_Ic">Fracture toughness K_Ic</TermTooltip>} value={`${data.material.K_Ic.toFixed(1)} MPa√m`} accent />
                <Row label={<TermTooltip term="Paris law">Paris C</TermTooltip>} value={data.crack.parisC.toExponential(1)} />
                <Row label={<TermTooltip term="Paris law">Paris m</TermTooltip>} value={data.crack.parisM.toString()} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-amber-400" />
              Failure-Mode Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <FailureModeMap data={data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- charts ----------------------------------------------------------------

function ParisChart({ data }: { data: FailureApi }) {
  const pts = data.curve.map((p) => ({ dK: p.dK, dadN: parseFloat(p.dadN) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="dK"
          domain={["dataMin", "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => v.toFixed(1)}
          label={{ value: "ΔK (MPa√m)", position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          type="number"
          scale="log"
          domain={[1e-13, 1e-6]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => v.toExponential(0)}
          label={{ value: "da/dN (mm/cycle, log)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number) => [v.toExponential(2), "da/dN"]}
          labelFormatter={(l: number) => `ΔK = ${l.toFixed(2)} MPa√m`}
        />
        <Line type="monotone" dataKey="dadN" stroke="oklch(0.78 0.15 55)" strokeWidth={2.6} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CrackGrowthChart({ data }: { data: FailureApi }) {
  const pts = data.aVsN.map((p) => ({
    N: p.N,
    a: p.a,
    aNorm: p.a / data.crack.criticalFlaw_mm,
  }));
  const Nf = data.crack.fatigueLife;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={pts} margin={{ top: 12, right: 24, bottom: 36, left: 12 }}>
        <defs>
          <linearGradient id="crackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.66 0.21 16 / 0.4)" />
            <stop offset="100%" stopColor="oklch(0.66 0.21 16 / 0)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="N"
          domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0))}
          label={{ value: "Cycles N", position: "insideBottom", offset: -16, fill: "oklch(0.65 0.01 60)", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="a"
          domain={[0, "dataMax"]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => v.toFixed(2)}
          label={{ value: "Crack length a (mm)", angle: -90, position: "insideLeft", offset: 8, fill: "oklch(0.65 0.01 60)", fontSize: 11, style: { textAnchor: "middle" } }}
        />
        <Tooltip
          contentStyle={{ background: "oklch(0.19 0.008 60)", border: "1px solid oklch(0.35 0.008 60)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          formatter={(v: number) => [`${v.toFixed(3)} mm`, "crack a"]}
          labelFormatter={(l: number) => `N = ${l.toLocaleString()} cycles`}
        />
        <ReferenceLine y={data.crack.criticalFlaw_mm} stroke="#f87171" strokeDasharray="6 3" label={{ value: `a_c`, fill: "#f87171", fontSize: 9, position: "right" }} />
        <ReferenceLine x={Nf} stroke="#fbbf24" strokeDasharray="4 3" label={{ value: `N_f`, fill: "#fbbf24", fontSize: 9, position: "top" }} />
        <Area type="monotone" dataKey="a" stroke="oklch(0.66 0.21 16)" strokeWidth={2.4} fill="url(#crackGrad)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function FailureModeMap({ data }: { data: FailureApi }) {
  // Map: toughness-ratio (x) vs stress-ratio R (y) → colour zones
  const W = 280, H = 180;
  const padL = 40, padB = 30, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const tr = data.failureMode.toughnessRatio;
  // current point
  const px = padL + Math.min(1, tr / 1.0) * plotW;
  const py = padT + (1 - (data.inputs.stressR + 1) / 2) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {/* brittle zone (left) */}
      <rect x={padL} y={padT} width={plotW * 0.25} height={plotH} fill="oklch(0.66 0.21 16 / 0.12)" />
      {/* ductile zone (right) */}
      <rect x={padL + plotW * 0.55} y={padT} width={plotW * 0.45} height={plotH} fill="oklch(0.72 0.15 160 / 0.12)" />
      {/* mixed zone (middle) */}
      <rect x={padL + plotW * 0.25} y={padT} width={plotW * 0.3} height={plotH} fill="oklch(0.78 0.15 55 / 0.1)" />
      {/* axes */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="oklch(0.4 0.008 60)" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="oklch(0.4 0.008 60)" />
      {/* labels */}
      <text x={padL + plotW * 0.12} y={H - 6} textAnchor="middle" fontSize={8} fill="#f87171">Brittle</text>
      <text x={padL + plotW * 0.4} y={H - 6} textAnchor="middle" fontSize={8} fill="#fbbf24">Mixed</text>
      <text x={padL + plotW * 0.78} y={H - 6} textAnchor="middle" fontSize={8} fill="#34d399">Ductile</text>
      <text x={(padL + W) / 2} y={H - 18} textAnchor="middle" fontSize={9} fill="oklch(0.65 0.01 60)">K_Ic / σ_y  (toughness ratio)</text>
      <text x={12} y={(padT + H - padB) / 2} textAnchor="middle" fontSize={9} fill="oklch(0.65 0.01 60)" transform={`rotate(-90 12 ${(padT + H - padB) / 2})`}>Stress ratio R</text>
      {/* current point */}
      <circle cx={px} cy={py} r={6} fill={data.failureMode.mode === "Brittle" ? "#f87171" : data.failureMode.mode === "Ductile" ? "#34d399" : "#fbbf24"} stroke="#fff" strokeWidth={2} />
      <circle cx={px} cy={py} r={12} fill="none" stroke="#fff" strokeWidth={0.8} opacity={0.5} />
    </svg>
  );
}

// ---- helpers ---------------------------------------------------------------

function fmtLife(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

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
          {loading ? <Skeleton className="h-6 w-20" /> : value}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{unit}</div>
      </CardContent>
    </Card>
  );
}

function SliderRow({
  label, value, min, max, step, unit, onValue,
}: { label: string; value: number; min: number; max: number; step: number; unit: string; onValue: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary">
          {value < 1 ? value.toFixed(2) : value.toFixed(value < 10 ? 1 : 0)} {unit}
        </span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onValue(v[0])}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-primary" />
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-3 overflow-hidden rounded-full bg-muted">
        <div className="absolute bottom-0 w-full rounded-full transition-all duration-500" style={{ height: `${value * 100}%`, background: color }} />
      </div>
      <span className="text-[9px] font-medium" style={{ color }}>{(value * 100).toFixed(0)}%</span>
      <span className="text-[8px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SafetyRow({ label, value, limit }: { label: string; value: number; limit: number }) {
  const tone = value < 1 ? "rose" : value < limit ? "amber" : "emerald";
  const colors: Record<string, string> = {
    rose: "border-rose-500/40 text-rose-400",
    amber: "border-amber-500/40 text-amber-400",
    emerald: "border-emerald-500/40 text-emerald-400",
  };
  return (
    <div className={`flex items-center justify-between rounded-md border bg-background/40 px-3 py-2 ${colors[tone]}`}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-bold tabular-nums">{value.toFixed(2)}×</span>
        <Badge variant="outline" className={`text-[9px] ${colors[tone]}`}>
          {value < 1 ? "FAIL" : value < limit ? "MARGINAL" : "SAFE"}
        </Badge>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: React.ReactNode; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${accent ? "font-semibold text-primary" : "text-foreground/90"}`}>{value}</span>
    </div>
  );
}
