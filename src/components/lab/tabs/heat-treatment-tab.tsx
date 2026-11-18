"use client";

/**
 * heat-treatment-tab.tsx
 * -----------------------------------------------------------------------------
 * Heat Treatment Simulation & Optimization Framework — the "heat" tab.
 *
 * 3-column layout (`xl:grid-cols-12`):
 *   LEFT  (3/12)  AlloyCard            — alloy system + composition + Fe-C alloying
 *                  StepEditorCard      — full step parameter editor (11 fields)
 *   CENTER (6/12) WorkflowPipelineCard — ordered, color-coded nodes (up/down/delete)
 *                  TemperatureTimeCurveCard — client-computed T(t) curve (Recharts)
 *                  TttCctCard          — auto-loads TTT on mount, toggle CCT
 *   RIGHT (3/12)  ResultsCard         — 4 sub-tabs (Micro/Mech/Phys/History)
 *                  OptimizationCard   — method/objective + Pareto + Apply Best
 *
 * Behaviours:
 *  • On mount: hydrate persisted HT state from localStorage; if no results,
 *    auto-load the alloy-matched preset and run the simulation once.
 *  • TTT is auto-loaded on mount (and reloaded when the alloy system changes).
 *  • All upstream calls go through /api/ht/<endpoint>?XTransformPort=8001
 *    proxy routes — the tab stays interactive even when the backend is down
 *    (toast + empty states, no crash).
 *  • NO indigo/blue — amber/orange heat theme throughout.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import {
  AreaChart,
  Area,
  ComposedChart,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

import {
  Workflow,
  Play,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Settings2,
  Thermometer,
  Flame,
  Clock,
  Wind,
  Gauge,
  Layers,
  Microscope,
  Activity,
  Boxes,
  History,
  Target,
  Trophy,
  TrendingUp,
  Sparkles,
  Check,
  AlertTriangle,
  Cpu,
  Beaker,
  Snowflake,
  Atom,
  Zap,
  Wand2,
  ChevronRight,
  Loader2,
  ChevronsUpDown,
} from "lucide-react";

import { useLabStore, hydrateHtWorkflow } from "@/store/lab-store";
import { useLang } from "@/store/lang-store";
import { useToast } from "@/hooks/use-toast";
import { ALLOY_SYSTEMS, type AlloySystemId } from "@/lib/metallurgy";
import {
  ATMOSPHERE_OPTIONS,
  COOLING_METHOD_OPTIONS,
  COOLING_RATE_BY_METHOD,
  DEFAULT_HT_WORKFLOW,
  PROCESS_COLORS,
  PROCESS_OPTIONS,
  computeTemperatureTimeCurve,
  prettyPhase,
  summarizeStep,
  type HTAlloy,
  type HTAtmosphere,
  type HTCoolingMethod,
  type HTCurve,
  type HTDiagramResult,
  type HTOptimizationResult,
  type HTOptimizationTrial,
  type HTPhaseFraction,
  type HTProcess,
  type HTPreset,
  type HTResults,
  type HTStep,
} from "@/lib/heat-treatment-types";

const PORT = 8001;

/**
 * Convert backend TTT/CCT response (curves as a dict of {phase_start: [[t,T],...]})
 * into the frontend's expected array format (HTCurve[] with {t, T, kind, phase}).
 */
function normalizeDiagramData(d: Record<string, unknown>): HTDiagramResult {
  const rawCurves = d.curves as Record<string, number[][]> | HTCurve[] | undefined;
  let curves: HTCurve[] = [];
  if (Array.isArray(rawCurves)) {
    curves = rawCurves as HTCurve[];
  } else if (rawCurves && typeof rawCurves === "object") {
    for (const [key, pts] of Object.entries(rawCurves)) {
      const [phase, kindRaw] = key.includes("_") ? key.split(/_(.*)/s) : [key, "start"];
      const kind = kindRaw === "finish" ? "finish" : kindRaw === "start" ? "start" : "martensite";
      const phaseLabel = phase.charAt(0).toUpperCase() + phase.slice(1);
      if (Array.isArray(pts)) {
        for (const [t, T] of pts) {
          curves.push({ t, T, kind, phase: phaseLabel });
        }
      }
    }
  }
  return {
    ok: Boolean(d.ok),
    curves,
    Ms_C: (d.Ms_C as number) ?? 0,
    Mf_C: (d.Mf_C as number) ?? 0,
    A1_C: (d.A1_C as number) ?? 0,
    A3_C: (d.A3_C as number) ?? 0,
    error: d.error as string | undefined,
  };
}

/**
 * Convert backend /run response (snake_case) to frontend HTResults (camelCase).
 * The backend returns: final_microstructure, mechanical_properties, physical_properties,
 * processing_history, workflow_summary, uncertainty_estimates, phase_fractions, etc.
 * The frontend expects: finalMicrostructure, mechanicalProperties, etc. with camelCase keys.
 */
function normalizeRunResults(d: Record<string, unknown>): HTResults {
  const fm = (d.final_microstructure ?? d.finalMicrostructure ?? {}) as Record<string, unknown>;
  const mp = (d.mechanical_properties ?? d.mechanicalProperties ?? {}) as Record<string, unknown>;
  const pp = (d.physical_properties ?? d.physicalProperties ?? {}) as Record<string, unknown>;
  const ph = (d.processing_history ?? d.processingHistory ?? []) as Record<string, unknown>[];
  const ws = (d.workflow_summary ?? d.workflowSummary ?? {}) as Record<string, unknown>;
  const pf = (d.phase_fractions ?? d.phaseFractions ?? {}) as Record<string, number>;
  const ue = (d.uncertainty_estimates ?? d.uncertaintyEstimates ?? {}) as Record<string, unknown>;
  const tp = (d.temperature_profile ?? d.temperatureProfile) as { series?: { t: number; T: number }[] } | undefined;

  // Convert phase_fractions dict to HTPhaseFraction[]
  const phaseFractionsList: HTPhaseFraction[] = Object.entries(pf)
    .filter(([k]) => k !== "ok")
    .map(([name, fraction]) => ({ name, fraction: Number(fraction) }));

  // Convert uncertainty estimates to the sigma format
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const sigmaFor = (key: string) => {
    const entry = ue[key] as { std?: number } | undefined;
    return entry?.std;
  };

  return {
    ok: Boolean(d.ok),
    finalMicrostructure: {
      grainSizeUm: num(fm.grain_size_um ?? fm.grainSizeUm),
      phaseFractions: phaseFractionsList,
      dominantPhase: (fm.dominant_phase as string) ?? phaseFractionsList[0]?.name ?? "—",
      precipitateDensity: num(fm.precipitate_density ?? fm.precipitateDensity),
      retainedAustenitePct: num(fm.retained_austenite_pct ?? pf.retained_austenite) * 100,
    },
    phaseFractions: pf,
    mechanicalProperties: {
      yieldStrengthMPa: num(mp.yield_strength_MPa ?? mp.yield_strength_mpa ?? mp.yieldStrengthMPa),
      yieldStrengthSigma: sigmaFor("yield_strength_MPa") ?? sigmaFor("yield_strength_mpa"),
      utsMPa: num(mp.UTS_MPa ?? mp.uts_MPa ?? mp.uts_mpa ?? mp.utsMPa),
      utsSigma: sigmaFor("UTS_MPa") ?? sigmaFor("uts_mpa"),
      hardnessHRC: num(mp.hardness_HRC ?? mp.hardness_hrc ?? mp.hardnessHRC),
      hardnessHV: num(mp.hardness_HV ?? mp.hardness_hv ?? mp.hardnessHV),
      elongationPct: num(mp.elongation_pct ?? mp.elongationPct),
      elongationSigma: sigmaFor("elongation_pct"),
      toughnessJ: num(mp.toughness_J ?? mp.toughness_j ?? mp.toughnessJ),
      fatigueStrengthMPa: num(mp.fatigue_MPa ?? mp.fatigue_Mpa ?? mp.fatigueStrengthMPa),
      youngsModulusGPa: num(pp.elastic_modulus_GPa ?? pp.elasticModulusGPa),
    },
    physicalProperties: {
      densityGCm3: num(pp.density_g_cm3 ?? pp.densityGCm3),
      thermalConductivityWmK: num(pp.thermal_conductivity_W_mK ?? pp.thermalConductivityWmK),
      electricalConductivityPctIACS: num(pp.electrical_conductivity_pctIACS ?? pp.electricalConductivityPctIACS),
      elasticModulusGPa: num(pp.elastic_modulus_GPa ?? pp.elasticModulusGPa),
      ctePpmPerK: num(pp.CTE_ppm_K ?? pp.ctePpmPerK ?? pp.cte_ppm_K),
    },
    processingHistory: ph.map((e) => ({
      tMin: num(e.total_time_min ?? e.t_min ?? e.tMin ?? e.t),
      tempC: num(e.target_temp_c ?? e.temp_c ?? e.tempC ?? e.T ?? e.peak_temp_c),
      stepName: (e.name as string) ?? e.step_name ?? "—",
      process: (e.process as HTProcess) ?? "Custom Process",
      event: (e.process as string) ?? "step",
      phases: e.transformation_phases as Record<string, number> | undefined,
    })),
    workflowSummary: {
      totalSteps: num(ws.n_steps ?? ws.total_steps ?? ws.totalSteps),
      totalTimeMin: num(ws.total_time_min ?? ws.totalTimeMin),
      maxTempC: num(ws.peak_temp_c ?? ws.max_temp_c ?? ws.maxTempC),
      minTempC: 25,
    },
    uncertaintyEstimates: Object.fromEntries(
      Object.entries(ue).map(([k, v]) => [k, (v as { std?: number })?.std ?? 0]),
    ),
    temperatureProfile: tp?.series,
    error: d.error as string | undefined,
  };
}

// =============================================================================
//  Main component
// =============================================================================

export function HeatTreatmentTab() {
  const { dict: t } = useLang();
  const { toast } = useToast();
  const store = useLabStore();
  const [presets, setPresets] = useState<HTPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [serviceOk, setServiceOk] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [ttt, setTtt] = useState<HTDiagramResult | null>(null);
  const [tttLoading, setTttLoading] = useState(false);
  const [tttError, setTttError] = useState<string | null>(null);
  const [showCct, setShowCct] = useState(false);

  const hydratedRef = useRef(false);
  const autoRanRef = useRef(false);

  // ---- 1. hydrate persisted HT state on mount -----------------------------
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    hydrateHtWorkflow();
  }, []);

  // ---- 2. health check + presets load ------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const hRes = await fetch(`/api/ht/health?XTransformPort=${PORT}`, { cache: "no-store" });
        const hJson = await hRes.json().catch(() => ({ ok: false }));
        if (!alive) return;
        setServiceOk(Boolean(hJson?.ok));
      } catch {
        if (alive) setServiceOk(false);
      }
      try {
        const pRes = await fetch(`/api/ht/presets?XTransformPort=${PORT}`, { cache: "no-store" });
        const pJson = await pRes.json().catch(() => ({ ok: false, presets: [] }));
        if (!alive) return;
        if (pJson?.ok && Array.isArray(pJson.presets)) {
          setPresets(pJson.presets);
        } else {
          setPresets(BUILTIN_PRESETS);
        }
      } catch {
        if (alive) setPresets(BUILTIN_PRESETS);
      } finally {
        if (alive) setPresetsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- 3. build the alloy payload from the lab store ---------------------
  const alloy: HTAlloy = useMemo(() => {
    const sys = ALLOY_SYSTEMS[store.alloySystem];
    const comp: Record<string, number> = {};
    if (store.alloySystem === "Fe-C") {
      comp.C = +store.soluteFraction.toFixed(4);
      comp.Fe = +(1 - store.soluteFraction - store.niWt / 100 - store.crWt / 100 - store.mnWt / 100 - store.siWt / 100 - store.moWt / 100).toFixed(4);
      if (store.niWt > 0) comp.Ni = +store.niWt.toFixed(2);
      if (store.crWt > 0) comp.Cr = +store.crWt.toFixed(2);
      if (store.mnWt > 0) comp.Mn = +store.mnWt.toFixed(2);
      if (store.siWt > 0) comp.Si = +store.siWt.toFixed(2);
      if (store.moWt > 0) comp.Mo = +store.moWt.toFixed(2);
    } else if (store.alloySystem === "Al-Cu") {
      comp.Cu = +(store.soluteFraction * 100).toFixed(2);
      comp.Al = +(100 - store.soluteFraction * 100).toFixed(2);
    } else if (store.alloySystem === "Al-Si") {
      comp.Si = +(store.soluteFraction * 100).toFixed(2);
      comp.Al = +(100 - store.soluteFraction * 100).toFixed(2);
    } else if (store.alloySystem === "Ni-Cr-Co") {
      comp.Cr = +(store.soluteFraction * 100).toFixed(2);
      comp.Co = +(store.soluteFraction2 * 100).toFixed(2);
      comp.Ni = +(100 - store.soluteFraction * 100 - store.soluteFraction2 * 100).toFixed(2);
    }
    return {
      system: store.alloySystem,
      name: sys?.label ?? store.alloySystem,
      composition: comp,
    };
  }, [
    store.alloySystem,
    store.soluteFraction,
    store.soluteFraction2,
    store.niWt,
    store.crWt,
    store.mnWt,
    store.siWt,
    store.moWt,
  ]);

  // ---- 4. run simulation --------------------------------------------------
  const runSimulation = useCallback(
    async (workflowOverride?: HTStep[]) => {
      const steps = workflowOverride ?? store.htWorkflow;
      setRunning(true);
      try {
        const res = await fetch(`/api/ht/run?XTransformPort=${PORT}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alloy,
            workflow: { name: "HT Workflow", steps },
            options: {
              compute_ttt: true,
              compute_cct: false,
              uncertainty: true,
              n_uncertainty_samples: 12,
            },
          }),
        });
        const json = (await res.json()) as Record<string, unknown>;
        const results = normalizeRunResults(json);
        if (results?.ok) {
          store.setHtResults(results);
        } else {
          toast({
            title: t.heat.serviceDown,
            description: results?.error ?? json?.error as string ?? t.heat.serviceDownHint,
            variant: "destructive",
          });
        }
      } catch (e) {
        toast({
          title: t.heat.serviceDown,
          description: e instanceof Error ? e.message : t.heat.serviceDownHint,
          variant: "destructive",
        });
      } finally {
        setRunning(false);
      }
    },
    [alloy, store, toast, t.heat.serviceDown, t.heat.serviceDownHint],
  );

  // ---- 5. auto-run on first visit (no persisted results) -----------------
  useEffect(() => {
    if (autoRanRef.current) return;
    if (presetsLoading) return;
    if (store.htResults) {
      autoRanRef.current = true;
      return;
    }
    autoRanRef.current = true;
    // Try to find an alloy-matched preset; otherwise use the current workflow.
    const matched = presets.find((p) => p.alloySystem === store.alloySystem);
    if (matched) {
      store.setHtWorkflow(matched.steps);
      store.selectHtStep(matched.steps[0]?.id ?? null);
      runSimulation(matched.steps);
    } else {
      runSimulation(store.htWorkflow.length ? store.htWorkflow : DEFAULT_HT_WORKFLOW);
    }
  }, [presetsLoading, presets]);

  // ---- 6. auto-load TTT on mount + when alloy system changes -------------
  useEffect(() => {
    let alive = true;
    setTttLoading(true);
    setTttError(null);
    const ctrl = new AbortController();
    fetch(`/api/ht/ttt?XTransformPort=${PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alloy }),
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => {
        if (!alive) return;
        const normalized = normalizeDiagramData(d);
        if (normalized.ok) setTtt(normalized);
        else setTttError(normalized.error ?? t.heat.tttError);
      })
      .catch((e) => {
        if (alive) setTttError(e instanceof Error ? e.message : t.heat.tttError);
      })
      .finally(() => {
        if (alive) setTttLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [store.alloySystem, JSON.stringify(alloy.composition)]);

  // ---- 7. selected step ---------------------------------------------------
  const selectedStep = useMemo(() => {
    return (
      store.htWorkflow.find((s) => s.id === store.htSelectedStepId) ?? store.htWorkflow[0] ?? null
    );
  }, [store.htWorkflow, store.htSelectedStepId]);

  // ===========================================================================
  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* ===== Header strip ===== */}
        <Card className="overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent backdrop-blur">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-400" />
                <h2 className="font-mono text-base font-semibold text-foreground sm:text-lg">
                  {t.heat.title}
                </h2>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t.heat.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ServiceBadge ok={serviceOk} loading={serviceOk === null} />
              <Button
                size="sm"
                disabled={running}
                onClick={() => runSimulation()}
                className="gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400"
              >
                {running ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {running ? t.heat.running : store.htResults ? t.heat.reRun : t.heat.runSimulation}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== 3-column layout ===== */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* ---------- LEFT 3/12 ---------- */}
          <div className="space-y-4 xl:col-span-3">
            <AlloyCard />
            <StepEditorCard step={selectedStep} />
          </div>

          {/* ---------- CENTER 6/12 ---------- */}
          <div className="space-y-4 xl:col-span-6">
            <WorkflowPipelineCard />
            <TemperatureTimeCurveCard />
            <TttCctCard
              ttt={ttt}
              loading={tttLoading}
              error={tttError}
              showCct={showCct}
              onToggleCct={() => setShowCct((v) => !v)}
              alloy={alloy}
            />
          </div>

          {/* ---------- RIGHT 3/12 ---------- */}
          <div className="space-y-4 xl:col-span-3">
            <ResultsCard />
            <OptimizationCard
              alloy={alloy}
              onApplyBest={(steps) => {
                store.setHtWorkflow(steps);
                store.selectHtStep(steps[0]?.id ?? null);
                runSimulation(steps);
              }}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
//  Service badge
// =============================================================================

function ServiceBadge({ ok, loading }: { ok: boolean | null; loading: boolean }) {
  const { dict: t } = useLang();
  if (loading) {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ping…
      </Badge>
    );
  }
  if (ok) {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
        8001 online
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400">
          <AlertTriangle className="mr-1 h-3 w-3" />
          8001 offline
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{t.heat.serviceDownHint}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
//  AlloyCard  (LEFT 3/12)
// =============================================================================

function AlloyCard() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const sys = ALLOY_SYSTEMS[s.alloySystem];

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Beaker className="h-4 w-4 text-amber-400" />
          {t.heat.alloy}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alloy system select */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t.heat.alloySystem}
          </Label>
          <Select value={s.alloySystem} onValueChange={(v) => s.setAlloySystem(v as AlloySystemId)}>
            <SelectTrigger className="w-full bg-card/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ALLOY_SYSTEMS).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Composition slider (solute) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {sys.solute} (wt%)
            </Label>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-amber-400">
              {(s.soluteFraction * 100).toFixed(2)}%
            </span>
          </div>
          <Slider
            value={[s.soluteFraction * 100]}
            min={0}
            max={sys.xMax * 100}
            step={0.05}
            onValueChange={(v) => s.setSoluteFraction(v[0] / 100)}
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>0%</span>
            <span>
              {sys.solvent}: {((1 - s.soluteFraction) * 100).toFixed(1)}%
            </span>
            <span>{(sys.xMax * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* Ternary 2nd solute */}
        {sys.isTernary && sys.solute2 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {sys.solute2} (wt%)
              </Label>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-amber-400">
                {(s.soluteFraction2 * 100).toFixed(1)}%
              </span>
            </div>
            <Slider
              value={[s.soluteFraction2 * 100]}
              min={0}
              max={(sys.xMax2 ?? 0.3) * 100}
              step={0.5}
              onValueChange={(v) => s.setSoluteFraction2(v[0] / 100)}
            />
          </div>
        )}

        <Separator className="bg-border/50" />

        {/* Fe-C alloying sliders (only for Fe-C system) */}
        {s.alloySystem === "Fe-C" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
              <Atom className="h-3 w-3" />
              {t.heat.feCAlloying}
            </div>
            <AlloySlider label={t.heat.ni} value={s.niWt} max={5} step={0.05} onChange={s.setNiWt} accent="amber" />
            <AlloySlider label={t.heat.cr} value={s.crWt} max={20} step={0.1} onChange={s.setCrWt} accent="rose" />
            <AlloySlider label={t.heat.mn} value={s.mnWt} max={3} step={0.05} onChange={s.setMnWt} accent="emerald" />
            <AlloySlider label={t.heat.si} value={s.siWt} max={3} step={0.05} onChange={s.setSiWt} accent="cyan" />
            <AlloySlider label={t.heat.mo} value={s.moWt} max={5} step={0.05} onChange={s.setMoWt} accent="teal" />
          </div>
        ) : (
          <div className="rounded-md border border-border/40 bg-background/40 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
            Switch to the <span className="text-amber-400">Fe-C</span> system to enable the
            Ni / Cr / Mn / Si / Mo alloying-element sliders.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlloySlider({
  label,
  value,
  max,
  step,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent: "amber" | "rose" | "emerald" | "cyan" | "teal";
}) {
  const toneCls: Record<string, string> = {
    amber: "text-amber-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    teal: "text-teal-400",
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-foreground/80">{label}</span>
        <span className={`font-mono text-xs font-semibold tabular-nums ${toneCls[accent]}`}>
          {value.toFixed(2)} wt%
        </span>
      </div>
      <Slider value={[value]} min={0} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

// =============================================================================
//  StepEditorCard  (LEFT 3/12)
// =============================================================================

function StepEditorCard({ step }: { step: HTStep | null }) {
  const s = useLabStore();
  const { dict: t } = useLang();

  if (!step) {
    return (
      <Card className="bg-card/60 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-amber-400" />
            {t.heat.stepEditor}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] text-muted-foreground">
          {t.heat.selectStep}
        </CardContent>
      </Card>
    );
  }

  const update = (patch: Partial<HTStep>) => s.updateHtStep(step.id, patch);

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-amber-400" />
            {t.heat.stepEditor}
          </span>
          <Badge
            variant="outline"
            className={`font-mono text-[10px] ${PROCESS_COLORS[step.process].chip} ${PROCESS_COLORS[step.process].text}`}
          >
            {step.process}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step name + process select */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.heat.stepName}
            </Label>
            <Input
              value={step.name}
              onChange={(e) => update({ name: e.target.value })}
              className="h-8 bg-card/60 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.heat.process}
            </Label>
            <ProcessCombobox
              value={step.process}
              onChange={(v) => update({ process: v })}
            />
          </div>
        </div>

        {/* Target temp */}
        <StepSlider
          icon={<Thermometer className="h-3 w-3" />}
          label={t.heat.targetTemp}
          value={step.targetTempC}
          min={20}
          max={1300}
          step={5}
          unit="°C"
          onChange={(v) => update({ targetTempC: v })}
          tone="rose"
        />
        {/* Heating rate */}
        <StepSlider
          icon={<Flame className="h-3 w-3" />}
          label={t.heat.heatingRate}
          value={step.heatingRate}
          min={1}
          max={500}
          step={1}
          unit="K/min"
          onChange={(v) => update({ heatingRate: v })}
          tone="amber"
        />
        {/* Hold time */}
        <StepSlider
          icon={<Clock className="h-3 w-3" />}
          label={t.heat.holdingTime}
          value={step.holdingTimeMin}
          min={0}
          max={600}
          step={5}
          unit="min"
          onChange={(v) => update({ holdingTimeMin: v })}
          tone="orange"
        />

        {/* Atmosphere + pressure */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <Wind className="mr-1 inline h-3 w-3" />
              {t.heat.atmosphere}
            </Label>
            <Select
              value={step.atmosphere}
              onValueChange={(v) => update({ atmosphere: v as HTAtmosphere })}
            >
              <SelectTrigger className="h-8 bg-card/60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATMOSPHERE_OPTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value} className="text-xs">
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <Gauge className="mr-1 inline h-3 w-3" />
              {t.heat.pressure} (MPa)
            </Label>
            <Input
              type="number"
              value={step.pressureMPa}
              step={0.001}
              min={0}
              onChange={(e) => update({ pressureMPa: Number(e.target.value) })}
              className="h-8 bg-card/60 font-mono text-xs"
            />
          </div>
        </div>

        {/* Cooling method + rate */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <Snowflake className="mr-1 inline h-3 w-3" />
            {t.heat.coolingMethod}
          </Label>
          <Select
            value={step.coolingMethod}
            onValueChange={(v) => {
              const m = v as HTCoolingMethod;
              update({
                coolingMethod: m,
                coolingRate: COOLING_RATE_BY_METHOD[m],
              });
            }}
          >
            <SelectTrigger className="h-8 bg-card/60 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COOLING_METHOD_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label} · {m.rateKPerMin} K/min
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <StepSlider
            label={t.heat.coolingRate}
            value={step.coolingRate}
            min={1}
            max={8000}
            step={1}
            unit="K/min"
            onChange={(v) => update({ coolingRate: v, coolingMethod: "controlled" })}
            tone="cyan"
            log
          />
        </div>

        {/* Cycles */}
        <StepSlider
          icon={<Layers className="h-3 w-3" />}
          label={t.heat.cycles}
          value={step.cycles}
          min={1}
          max={10}
          step={1}
          unit={t.heat.cyclesShort}
          onChange={(v) => update({ cycles: Math.round(v) })}
          tone="emerald"
        />
      </CardContent>
    </Card>
  );
}

function StepSlider({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  tone = "amber",
  log = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  tone?: "amber" | "orange" | "rose" | "cyan" | "emerald";
  log?: boolean;
}) {
  const toneCls: Record<string, string> = {
    amber: "text-amber-400",
    orange: "text-orange-400",
    rose: "text-rose-400",
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
  };
  const display = log
    ? value < 10
      ? value.toFixed(1)
      : value < 100
        ? value.toFixed(0)
        : value.toLocaleString()
    : value.toFixed(step < 1 ? 2 : 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </Label>
        <span className={`rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${toneCls[tone]}`}>
          {display} {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5"
      />
    </div>
  );
}

/** Searchable process combobox (11 options). */
function ProcessCombobox({
  value,
  onChange,
}: {
  value: HTProcess;
  onChange: (v: HTProcess) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = PROCESS_OPTIONS.find((p) => p.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between rounded-md border border-border/60 bg-card/60 px-2.5 text-xs hover:bg-card/80"
          aria-label="Pick process"
        >
          <span className={`flex items-center gap-1.5 ${PROCESS_COLORS[value].text}`}>
            <span className={`h-2 w-2 rounded-full ${PROCESS_COLORS[value].chip}`} />
            {current?.label ?? value}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search process…" className="h-8" />
          <CommandList className="max-h-64">
            <CommandEmpty>No process found.</CommandEmpty>
            <CommandGroup>
              {PROCESS_OPTIONS.map((p) => (
                <CommandItem
                  key={p.value}
                  value={`${p.label} ${p.value} ${p.hint}`}
                  onSelect={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                  className="gap-2 text-xs"
                >
                  <span className={`h-2 w-2 rounded-full ${PROCESS_COLORS[p.value].chip}`} />
                  <div className="min-w-0">
                    <div className="font-medium">{p.label}</div>
                    <div className="line-clamp-1 text-[10px] text-muted-foreground">{p.hint}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
//  WorkflowPipelineCard  (CENTER 6/12)
// =============================================================================

function WorkflowPipelineCard() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const [presets, setPresets] = useState<HTPreset[]>([]);
  const [presetOpen, setPresetOpen] = useState(false);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  // Fetch presets (cache once)
  useEffect(() => {
    let alive = true;
    fetch(`/api/ht/presets?XTransformPort=${PORT}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.ok && Array.isArray(d.presets)) setPresets(d.presets);
        else if (alive) setPresets(BUILTIN_PRESETS);
      })
      .catch(() => alive && setPresets(BUILTIN_PRESETS));
    return () => {
      alive = false;
    };
  }, []);

  const matchedPresets = presets.filter((p) => p.alloySystem === s.alloySystem);

  const applyPreset = (p: HTPreset) => {
    s.setHtWorkflow(p.steps);
    s.selectHtStep(p.steps[0]?.id ?? null);
    setAppliedPreset(p.id);
    setPresetOpen(false);
    setTimeout(() => setAppliedPreset(null), 1500);
  };

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Workflow className="h-4 w-4 text-amber-400" />
            {t.heat.pipeline}
            <Badge variant="outline" className="ml-1 font-mono text-[10px]">
              {s.htWorkflow.length} {t.heat.step}{s.htWorkflow.length === 1 ? "" : "s"}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {/* Preset popover */}
            <Popover open={presetOpen} onOpenChange={setPresetOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-amber-500/30 px-2 text-[11px] text-amber-400 hover:bg-amber-500/10"
                >
                  <Sparkles className="h-3 w-3" />
                  {t.heat.loadPreset}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search presets…" className="h-8" />
                  <CommandList className="max-h-80">
                    <CommandEmpty>No preset found.</CommandEmpty>
                    <CommandGroup heading={t.heat.presetHint}>
                      {(matchedPresets.length ? matchedPresets : presets).map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.alloyName} ${p.description}`}
                          onSelect={() => applyPreset(p)}
                          className="flex flex-col items-start gap-1 py-2"
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="font-mono text-xs font-semibold">{p.name}</span>
                            <Badge variant="outline" className="font-mono text-[9px] text-amber-400">
                              {p.alloySystem}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-[10px] text-muted-foreground">
                            {p.description}
                          </p>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => s.addHtStep()}
            >
              <Plus className="h-3 w-3" />
              {t.heat.addStep}
            </Button>
          </div>
        </div>
        <p className="text-[10.5px] text-muted-foreground">{t.heat.pipelineHint}</p>
      </CardHeader>
      <CardContent>
        {s.htWorkflow.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-[11px] text-muted-foreground">
            No steps — click <span className="mx-1 text-amber-400">{t.heat.addStep}</span> to begin.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {s.htWorkflow.map((step, idx) => (
              <PipelineNode
                key={step.id}
                step={step}
                index={idx}
                total={s.htWorkflow.length}
                isSelected={step.id === s.htSelectedStepId}
                onSelect={() => s.selectHtStep(step.id)}
                onMoveUp={() => s.moveHtStep(step.id, "up")}
                onMoveDown={() => s.moveHtStep(step.id, "down")}
                onDelete={() => s.removeHtStep(step.id)}
                isAppliedPreset={appliedPreset !== null && s.htWorkflow[0]?.id === step.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineNode({
  step,
  index,
  total,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  isAppliedPreset,
}: {
  step: HTStep;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isAppliedPreset: boolean;
}) {
  const color = PROCESS_COLORS[step.process];
  return (
    <div
      className={`group relative flex items-stretch gap-2 rounded-md border bg-background/40 transition ${
        isSelected ? "border-amber-500/50 ring-1 ring-amber-500/30" : "border-border/40 hover:border-border/70"
      }`}
    >
      {/* Step number column */}
      <button
        onClick={onSelect}
        className={`flex w-10 shrink-0 flex-col items-center justify-center rounded-l-md border-r ${color.chip} ${color.text}`}
        aria-label="Select step"
      >
        <span className="font-mono text-[10px] opacity-70">{index + 1}/{total}</span>
        <Layers className="mt-0.5 h-3.5 w-3.5" />
      </button>

      {/* Body */}
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2.5 py-2 text-left"
      >
        <div className="flex w-full items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`truncate font-mono text-xs font-semibold ${color.text}`}>
                {step.name || step.process}
              </span>
            </TooltipTrigger>
            <TooltipContent>{summarizeStep(step)}</TooltipContent>
          </Tooltip>
          {step.cycles > 1 && (
            <Badge variant="outline" className="font-mono text-[9px] text-emerald-400">
              ×{step.cycles}
            </Badge>
          )}
          {isAppliedPreset && <Check className="h-3 w-3 text-emerald-400" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Thermometer className="h-2.5 w-2.5 text-rose-400" />
            {step.targetTempC}°C
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5 text-orange-400" />
            {step.holdingTimeMin}m
          </span>
          <span className="flex items-center gap-0.5">
            <Snowflake className="h-2.5 w-2.5 text-cyan-400" />
            {step.coolingMethod.replace("_", " ")}
          </span>
          <span className="flex items-center gap-0.5">
            <Wind className="h-2.5 w-2.5 text-teal-400" />
            {step.atmosphere}
          </span>
        </div>
      </button>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
        <IconBtn onClick={onMoveUp} disabled={index === 0} label="Move up">
          <ChevronUp className="h-3 w-3" />
        </IconBtn>
        <IconBtn onClick={onMoveDown} disabled={index === total - 1} label="Move down">
          <ChevronDown className="h-3 w-3" />
        </IconBtn>
        <IconBtn onClick={onDelete} disabled={total <= 1} label="Delete step" tone="danger">
          <Trash2 className="h-3 w-3" />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  disabled,
  label,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={`grid h-6 w-6 place-items-center rounded border transition ${
            disabled
              ? "cursor-not-allowed border-border/20 opacity-30"
              : tone === "danger"
                ? "border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                : "border-border/40 text-muted-foreground hover:bg-primary/5 hover:text-foreground"
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
//  TemperatureTimeCurveCard  (CENTER 6/12)
// =============================================================================

function TemperatureTimeCurveCard() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const data = useMemo(() => computeTemperatureTimeCurve(s.htWorkflow), [s.htWorkflow]);
  const maxT = useMemo(() => Math.max(25, ...data.map((d) => d.T)), [data]);
  const maxTime = useMemo(() => Math.max(1, ...data.map((d) => d.t)), [data]);

  // Segment coloring: color each segment by the step's process color
  const segments = useMemo(() => {
    const out: { t: number; T: number; stepIdx: number; process: HTProcess }[] = [];
    let cursor = 0;
    let curT = 25;
    let stepIdx = 0;
    out.push({ t: 0, T: 25, stepIdx: 0, process: s.htWorkflow[0]?.process ?? "preheat" });
    for (let si = 0; si < s.htWorkflow.length; si++) {
      const step = s.htWorkflow[si];
      const cycles = Math.max(1, Math.floor(step.cycles ?? 1));
      const nextTarget = si + 1 < s.htWorkflow.length ? s.htWorkflow[si + 1].targetTempC : 25;
      for (let c = 0; c < cycles; c++) {
        // heat
        const dHeat = step.heatingRate > 0 ? Math.abs(step.targetTempC - curT) / step.heatingRate : 0.5;
        for (let k = 1; k <= 6; k++) {
          const f = k / 6;
          out.push({
            t: +(cursor + dHeat * f).toFixed(2),
            T: +(curT + (step.targetTempC - curT) * f).toFixed(2),
            stepIdx: si,
            process: step.process,
          });
        }
        cursor += dHeat;
        curT = step.targetTempC;
        // hold
        if (step.holdingTimeMin > 0) {
          for (let k = 1; k <= 3; k++) {
            const f = k / 3;
            out.push({
              t: +(cursor + step.holdingTimeMin * f).toFixed(2),
              T: step.targetTempC,
              stepIdx: si,
              process: step.process,
            });
          }
          cursor += step.holdingTimeMin;
        }
        // cool
        const finalT = c === cycles - 1 ? nextTarget : step.targetTempC;
        const dCool = step.coolingRate > 0 ? Math.abs(step.targetTempC - finalT) / step.coolingRate : 0.5;
        for (let k = 1; k <= 6; k++) {
          const f = k / 6;
          out.push({
            t: +(cursor + dCool * f).toFixed(2),
            T: +(step.targetTempC + (finalT - step.targetTempC) * f).toFixed(2),
            stepIdx: si,
            process: step.process,
          });
        }
        cursor += dCool;
        curT = finalT;
      }
      stepIdx = si;
    }
    return out;
  }, [s.htWorkflow]);

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            {t.heat.tempTimeCurve}
          </span>
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span>
              <Clock className="mr-0.5 inline h-3 w-3" />
              {maxTime.toFixed(0)} min
            </span>
            <span>
              <Flame className="mr-0.5 inline h-3 w-3 text-rose-400" />
              {maxT.toFixed(0)} °C
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[280px] pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={segments} margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
            <defs>
              <linearGradient id="htTtGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, maxTime]}
              tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
              stroke="oklch(0.4 0.008 60)"
              label={{
                value: "Time (min)",
                position: "insideBottom",
                offset: -10,
                fill: "oklch(0.65 0.01 60)",
                fontSize: 11,
              }}
              tickFormatter={(v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1))}
            />
            <YAxis
              domain={[0, Math.ceil((maxT + 50) / 100) * 100]}
              tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
              stroke="oklch(0.4 0.008 60)"
              label={{
                value: "Temperature (°C)",
                angle: -90,
                position: "insideLeft",
                offset: 8,
                fill: "oklch(0.65 0.01 60)",
                fontSize: 11,
                style: { textAnchor: "middle" },
              }}
            />
            <RTooltip
              contentStyle={{
                background: "oklch(0.19 0.008 60)",
                border: "1px solid oklch(0.35 0.008 60)",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "var(--font-geist-mono)",
              }}
              formatter={(v: number) => [`${v.toFixed(0)} °C`, "T"]}
              labelFormatter={(l: number) => `t = ${l.toFixed(1)} min`}
            />
            <Area
              type="monotone"
              dataKey="T"
              stroke="#f59e0b"
              strokeWidth={2.2}
              fill="url(#htTtGrad)"
              isAnimationActive={false}
              dot={false}
            />
            {/* Reference lines per step (transition boundaries) */}
            {s.htWorkflow.map((step, i) => {
              // estimate step end time
              let acc = 0;
              let cur = 25;
              for (let k = 0; k <= i; k++) {
                const s2 = s.htWorkflow[k];
                const cyc = Math.max(1, s2.cycles ?? 1);
                for (let c = 0; c < cyc; c++) {
                  const nt = k + 1 < s.htWorkflow.length ? s.htWorkflow[k + 1].targetTempC : 25;
                  acc += Math.max(0.5, Math.abs(s2.targetTempC - cur) / s2.heatingRate);
                  cur = s2.targetTempC;
                  acc += s2.holdingTimeMin;
                  const ft = c === cyc - 1 ? nt : s2.targetTempC;
                  acc += Math.max(0.5, Math.abs(s2.targetTempC - ft) / s2.coolingRate);
                  cur = ft;
                }
              }
              return (
                <ReferenceLine
                  key={step.id}
                  x={+acc.toFixed(1)}
                  stroke={PROCESS_COLORS[step.process].hex}
                  strokeDasharray="3 3"
                  strokeOpacity={0.45}
                  label={{
                    value: `${i + 1}`,
                    fill: PROCESS_COLORS[step.process].hex,
                    fontSize: 9,
                    position: "top",
                  }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// =============================================================================
//  TttCctCard  (CENTER 6/12)
// =============================================================================

function TttCctCard({
  ttt,
  loading,
  error,
  showCct,
  onToggleCct,
  alloy,
}: {
  ttt: HTDiagramResult | null;
  loading: boolean;
  error: string | null;
  showCct: boolean;
  onToggleCct: () => void;
  alloy: HTAlloy;
}) {
  const { dict: t } = useLang();
  const [cct, setCct] = useState<HTDiagramResult | null>(null);
  const [cctLoading, setCctLoading] = useState(false);
  const [cctError, setCctError] = useState<string | null>(null);

  // Lazily load CCT when toggled on
  useEffect(() => {
    if (!showCct || cct) return;
    let alive = true;
    const run = async () => {
      setCctLoading(true);
      setCctError(null);
      const ctrl = new AbortController();
      try {
        const res = await fetch("/api/ht/cct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alloy }),
          signal: ctrl.signal,
          cache: "no-store",
        });
        const d: Record<string, unknown> = await res.json();
        if (!alive) return;
        const normalized = normalizeDiagramData(d);
        if (normalized.ok) setCct(normalized);
        else setCctError(normalized.error ?? t.heat.tttError);
      } catch (e) {
        if (alive) setCctError(e instanceof Error ? e.message : t.heat.tttError);
      } finally {
        if (alive) setCctLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [showCct, alloy, t.heat.tttError]);

  const current = showCct ? cct : ttt;
  const currentLoading = showCct ? cctLoading : loading;
  const currentError = showCct ? cctError : error;

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Atom className="h-4 w-4 text-amber-400" />
            {t.heat.tttCct}
          </CardTitle>
          <Tabs value={showCct ? "cct" : "ttt"} onValueChange={(v) => onToggleCct()}>
            <TabsList className="h-7 bg-card/60 p-0.5">
              <TabsTrigger value="ttt" className="h-6 px-2 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                {t.heat.showTtt}
              </TabsTrigger>
              <TabsTrigger value="cct" className="h-6 px-2 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                {t.heat.showCct}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="h-[320px] pb-3">
        {currentLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            {showCct ? "Loading CCT…" : t.heat.loadingTtt}
          </div>
        ) : currentError || !current ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-[11px] text-rose-400">
            <AlertTriangle className="h-4 w-4" />
            <span>{currentError ?? t.heat.tttError}</span>
          </div>
        ) : (
          <TttCctChart data={current} mode={showCct ? "CCT" : "TTT"} />
        )}
      </CardContent>
    </Card>
  );
}

const TTT_PHASE_COLOR: Record<string, string> = {
  Pearlite: "#f59e0b",
  Bainite: "#10b981",
  Martensite: "#f43f5e",
  Ferrite: "#06b6d4",
  Cementite: "#94a3b8",
  Austenite: "#f97316",
};

function TttCctChart({ data, mode }: { data: HTDiagramResult; mode: "TTT" | "CCT" }) {
  // Group curves by phase + kind
  const starts: Record<string, HTCurve[]> = {};
  const finishes: Record<string, HTCurve[]> = {};
  for (const c of data.curves) {
    if (c.kind === "start") (starts[c.phase] ??= []).push(c);
    if (c.kind === "finish") (finishes[c.phase] ??= []).push(c);
  }
  const phases = Array.from(new Set([...Object.keys(starts), ...Object.keys(finishes)]));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 8, right: 18, bottom: 30, left: 6 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          scale="log"
          dataKey="t"
          domain={[0.1, 1e5]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          tickFormatter={(v) => (v >= 1 ? (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)) : v.toFixed(1))}
          label={{
            value: "Time (s, log)",
            position: "insideBottom",
            offset: -12,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
          }}
        />
        <YAxis
          type="number"
          dataKey="T"
          domain={[100, 950]}
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{
            value: "T (°C)",
            angle: -90,
            position: "insideLeft",
            offset: 4,
            fill: "oklch(0.65 0.01 60)",
            fontSize: 11,
            style: { textAnchor: "middle" },
          }}
        />
        <RTooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 8,
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
          }}
          formatter={(v: number, n: string) =>
            n === "T" ? [`${v.toFixed(0)} °C`, "Temperature"] : [v, n]
          }
          labelFormatter={(l: number) => `t = ${l < 1 ? l.toFixed(2) : l.toFixed(0)} s`}
        />
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "var(--font-geist-mono)" }} />

        {/* Critical temperature lines */}
        <ReferenceLine y={data.A1_C} stroke="#fbbf24" strokeDasharray="6 3" label={{ value: `A₁=${data.A1_C}°C`, fill: "#fbbf24", fontSize: 9, position: "right" }} />
        {data.A3_C && (
          <ReferenceLine y={data.A3_C} stroke="#f97316" strokeDasharray="6 3" label={{ value: `A₃=${data.A3_C}°C`, fill: "#f97316", fontSize: 9, position: "right" }} />
        )}
        <ReferenceLine y={data.Ms_C} stroke="#f43f5e" strokeDasharray="6 3" label={{ value: `M_s=${data.Ms_C}°C`, fill: "#f43f5e", fontSize: 9, position: "right" }} />
        <ReferenceLine y={data.Mf_C} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: `M_f=${data.Mf_C}°C`, fill: "#f43f5e", fontSize: 9, position: "right" }} />

        {/* C-curves per phase */}
        {phases.map((ph) => {
          const color = TTT_PHASE_COLOR[ph] ?? "#94a3b8";
          return (
            <g key={ph}>
              {starts[ph] && (
                <Scatter
                  data={starts[ph]}
                  fill={color}
                  line={{ stroke: color, strokeDasharray: "4 3", strokeWidth: 1.6 }}
                  isAnimationActive={false}
                  name={`${prettyPhase(ph)} start`}
                />
              )}
              {finishes[ph] && (
                <Scatter
                  data={finishes[ph]}
                  fill={color}
                  line={{ stroke: color, strokeWidth: 2.2 }}
                  isAnimationActive={false}
                  name={`${prettyPhase(ph)} finish`}
                />
              )}
            </g>
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
//  ResultsCard  (RIGHT 3/12 — 4 sub-tabs)
// =============================================================================

function ResultsCard() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const r = s.htResults;
  const [tab, setTab] = useState("micro");

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-amber-400" />
            {t.heat.results}
          </span>
          {r?.workflowSummary && (
            <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">
              {r.workflowSummary.totalTimeMin.toFixed(0)} min · {r.workflowSummary.maxTempC.toFixed(0)}°C
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!r ? (
          <EmptyState />
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-2 grid h-auto w-full grid-cols-4 gap-0.5 bg-card/40 p-0.5">
              <TabsTrigger value="micro" className="h-7 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Microscope className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t.heat.microstructure}</span>
              </TabsTrigger>
              <TabsTrigger value="mech" className="h-7 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Activity className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t.heat.mechanical}</span>
              </TabsTrigger>
              <TabsTrigger value="phys" className="h-7 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Zap className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t.heat.physical}</span>
              </TabsTrigger>
              <TabsTrigger value="hist" className="h-7 text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <History className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t.heat.history}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="micro" className="mt-0">
              <MicrostructurePanel r={r} />
            </TabsContent>
            <TabsContent value="mech" className="mt-0">
              <MechanicalPanel r={r} />
            </TabsContent>
            <TabsContent value="phys" className="mt-0">
              <PhysicalPanel r={r} />
            </TabsContent>
            <TabsContent value="hist" className="mt-0">
              <HistoryPanel r={r} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  const { dict: t } = useLang();
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/40 bg-background/30 p-4 text-center">
      <Microscope className="h-6 w-6 text-muted-foreground/40" />
      <p className="font-mono text-xs text-muted-foreground">{t.heat.noResults}</p>
      <p className="max-w-[200px] text-[10.5px] leading-relaxed text-muted-foreground/70">
        {t.heat.noResultsHint}
      </p>
    </div>
  );
}

// ---- Microstructure sub-tab ----------------------------------------------

function MicrostructurePanel({ r }: { r: HTResults }) {
  const { dict: t } = useLang();
  const phases = Object.entries(r.phaseFractions ?? {}).map(([k, v]) => ({
    raw: k,
    label: prettyPhase(k),
    value: v,
  }));
  const dominant = r.finalMicrostructure?.dominantPhase ?? phases.sort((a, b) => b.value - a.value)[0]?.label ?? "—";

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          icon={<Microscope className="h-3 w-3" />}
          label={t.heat.grainSize}
          value={`${(r.finalMicrostructure?.grainSizeUm ?? 0).toFixed(2)} µm`}
          tone="amber"
        />
        <MiniStat
          icon={<Atom className="h-3 w-3" />}
          label={t.heat.dominantPhase}
          value={prettyPhase(dominant)}
          tone="rose"
        />
      </div>

      {/* Phase fraction bar */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t.heat.phaseFractions}
        </Label>
        <PhaseFractionBar phases={phases} />
      </div>

      {/* Phase fraction list */}
      <div className="max-h-44 space-y-1 overflow-y-auto scroll-thin pr-1">
        {phases.map((p) => (
          <div key={p.raw} className="flex items-center gap-2 rounded border border-border/40 bg-background/30 px-2 py-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseColor(p.raw) }} />
            <span className="flex-1 truncate text-[11px] text-foreground/90">{p.label}</span>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-amber-400">
              {(p.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function phaseColor(raw: string): string {
  const k = raw.toLowerCase();
  if (k.includes("martens")) return "#f43f5e";
  if (k.includes("bainite")) return "#10b981";
  if (k.includes("ferrite") || k.includes("alpha_fe") || k.includes("alpha_al")) return "#06b6d4";
  if (k.includes("pearlite")) return "#f59e0b";
  if (k.includes("austenite") || k.includes("gamma")) return "#f97316";
  if (k.includes("cementite") || k.includes("fe3c")) return "#94a3b8";
  if (k.includes("theta")) return "#d946ef";
  if (k.includes("beta")) return "#84cc16";
  if (k.includes("silicon") || k === "si") return "#eab308";
  if (k.includes("liquid")) return "#fb923c";
  return "#a78bfa";
}

function PhaseFractionBar({ phases }: { phases: { raw: string; label: string; value: number }[] }) {
  const total = phases.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/40 bg-background/40">
      {phases.map((p) => (
        <Tooltip key={p.raw}>
          <TooltipTrigger asChild>
            <div
              style={{
                width: `${(Math.max(0, p.value) / total) * 100}%`,
                background: phaseColor(p.raw),
              }}
              className="h-full transition-all hover:brightness-125"
            />
          </TooltipTrigger>
          <TooltipContent>
            {p.label}: {(p.value * 100).toFixed(1)}%
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ---- Mechanical sub-tab --------------------------------------------------

function MechanicalPanel({ r }: { r: HTResults }) {
  const { dict: t } = useLang();
  const m = r.mechanicalProperties;
  const items: { label: string; value: number; unit: string; sigma?: number; tone: string; max: number }[] = [
    { label: t.heat.yieldStrength, value: m.yieldStrengthMPa, unit: "MPa", sigma: m.yieldStrengthSigma, tone: "amber", max: 2500 },
    { label: t.heat.uts, value: m.utsMPa, unit: "MPa", sigma: m.utsSigma, tone: "rose", max: 3000 },
    { label: t.heat.hardness, value: m.hardnessHRC, unit: "HRC", tone: "orange", max: 70 },
    { label: t.heat.elongation, value: m.elongationPct, unit: "%", sigma: m.elongationSigma, tone: "emerald", max: 60 },
    { label: t.heat.toughness, value: m.toughnessJ, unit: "J", tone: "teal", max: 250 },
    { label: t.heat.fatigue, value: m.fatigueStrengthMPa, unit: "MPa", tone: "cyan", max: 1200 },
  ];

  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <PropertyBar key={it.label} {...it} />
      ))}
      {m.youngsModulusGPa && (
        <div className="flex items-center justify-between rounded border border-border/40 bg-background/30 px-2 py-1.5 text-[11px]">
          <span className="text-muted-foreground">{t.heat.elasticMod}</span>
          <span className="font-mono font-semibold tabular-nums text-amber-400">
            {m.youngsModulusGPa.toFixed(0)} GPa
          </span>
        </div>
      )}
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] leading-relaxed text-muted-foreground">
        <Sparkles className="mr-1 inline h-3 w-3 text-amber-400" />
        {t.heat.uncertainty}: ±1σ bands (12-sample Monte Carlo).
      </div>
    </div>
  );
}

function PropertyBar({
  label,
  value,
  unit,
  sigma,
  tone,
  max,
}: {
  label: string;
  value: number;
  unit: string;
  sigma?: number;
  tone: string;
  max: number;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const toneCls: Record<string, string> = {
    amber: "from-amber-500 to-amber-400 text-amber-400",
    rose: "from-rose-500 to-rose-400 text-rose-400",
    orange: "from-orange-500 to-orange-400 text-orange-400",
    emerald: "from-emerald-500 to-emerald-400 text-emerald-400",
    teal: "from-teal-500 to-teal-400 text-teal-400",
    cyan: "from-cyan-500 to-cyan-400 text-cyan-400",
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono font-semibold tabular-nums ${toneCls[tone].split(" ").pop()}`}>
          {value.toFixed(value < 10 ? 1 : 0)} {unit}
          {sigma ? <span className="ml-1 text-[9px] text-muted-foreground/70">±{sigma.toFixed(0)}</span> : null}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-background/60">
        <div
          className={`h-full bg-gradient-to-r ${toneCls[tone].split(" ").slice(0, 2).join(" ")}`}
          style={{ width: `${pct}%` }}
        />
        {sigma && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border border-foreground/40 bg-foreground/10"
                style={{
                  left: `${Math.max(0, ((value - sigma) / max) * 100)}%`,
                  width: `${Math.min(100, (2 * sigma) / max * 100)}%`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              ±1σ: {sigma.toFixed(1)} {unit}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ---- Physical sub-tab ----------------------------------------------------

function PhysicalPanel({ r }: { r: HTResults }) {
  const { dict: t } = useLang();
  const p = r.physicalProperties;
  const items: { label: string; value: string; tone: string }[] = [
    { label: t.heat.density, value: `${p.densityGCm3.toFixed(3)} g/cm³`, tone: "amber" },
    { label: t.heat.thermalCond, value: `${p.thermalConductivityWmK.toFixed(1)} W/m·K`, tone: "rose" },
    { label: t.heat.elecCond, value: `${p.electricalConductivityPctIACS.toFixed(1)} %IACS`, tone: "emerald" },
    { label: t.heat.elasticMod, value: `${p.elasticModulusGPa.toFixed(0)} GPa`, tone: "orange" },
    { label: t.heat.cte, value: `${p.ctePpmPerK.toFixed(2)} ppm/K`, tone: "cyan" },
  ];
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center justify-between rounded border border-border/40 bg-background/30 px-2.5 py-1.5"
        >
          <span className="text-[11px] text-muted-foreground">{it.label}</span>
          <span className={`font-mono text-xs font-semibold tabular-nums text-${it.tone}-400`}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- History sub-tab -----------------------------------------------------

function HistoryPanel({ r }: { r: HTResults }) {
  const { dict: t } = useLang();
  const hist = r.processingHistory ?? [];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{t.heat.processingHistory}</span>
        <span>
          {r.workflowSummary?.totalSteps ?? 0} {t.heat.step}s
        </span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto scroll-thin pr-1">
        {hist.map((ev, i) => (
          <div
            key={i}
            className={`rounded border bg-background/30 px-2 py-1.5 text-[10.5px] ${
              ev.process ? PROCESS_COLORS[ev.process as HTProcess]?.chip ?? "border-border/40" : "border-border/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-foreground/90">
                <ChevronRight className="mr-0.5 inline h-2.5 w-2.5" />
                {ev.stepName ?? ev.process ?? `Step ${i + 1}`}
              </span>
              <span className="font-mono text-[9.5px] text-muted-foreground">
                t={ev.tMin.toFixed(0)}m · T={ev.tempC.toFixed(0)}°C
              </span>
            </div>
            {ev.event && (
              <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-tight text-muted-foreground">
                {ev.event}
              </p>
            )}
            {ev.phases && (
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(ev.phases).slice(0, 4).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="font-mono text-[8.5px] text-amber-400">
                    {prettyPhase(k)}: {(v * 100).toFixed(0)}%
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
        {hist.length === 0 && (
          <p className="py-4 text-center text-[10.5px] italic text-muted-foreground">
            No processing history available.
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Mini stat -----------------------------------------------------------

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "amber" | "rose" | "emerald" | "cyan" | "orange";
}) {
  const toneCls: Record<string, string> = {
    amber: "border-amber-500/30 text-amber-400",
    rose: "border-rose-500/30 text-rose-400",
    emerald: "border-emerald-500/30 text-emerald-400",
    cyan: "border-cyan-500/30 text-cyan-400",
    orange: "border-orange-500/30 text-orange-400",
  };
  return (
    <div className={`rounded-md border bg-background/40 p-2 ${toneCls[tone]}`}>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className={toneCls[tone].split(" ").pop()}>{icon}</span>
      </div>
      <div className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${toneCls[tone].split(" ").pop()}`}>
        {value}
      </div>
    </div>
  );
}

// =============================================================================
//  OptimizationCard  (RIGHT 3/12)
// =============================================================================

const OPT_METHODS = [
  { value: "bayesian", label: "Bayesian (GP + EI)" },
  { value: "ga", label: "Genetic Algorithm" },
  { value: "nsga2", label: "NSGA-II (multi-obj)" },
  { value: "random", label: "Random Search" },
  { value: "grid", label: "Grid Search" },
] as const;

const OPT_OBJECTIVES = [
  { value: "max_yield", label: "Max Yield σ_y" },
  { value: "max_toughness", label: "Max Toughness" },
  { value: "max_uts", label: "Max UTS" },
  { value: "min_grain", label: "Min Grain Size" },
  { value: "balance", label: "Balance σ_y / ε" },
] as const;

function OptimizationCard({
  alloy,
  onApplyBest,
}: {
  alloy: HTAlloy;
  onApplyBest: (steps: HTStep[]) => void;
}) {
  const s = useLabStore();
  const { dict: t } = useLang();
  const { toast } = useToast();
  const [method, setMethod] = useState<string>("bayesian");
  const [objective, setObjective] = useState<string>("max_yield");
  const [iters, setIters] = useState(15);
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);
  const r = s.htOptimizationResult;

  const runOpt = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/ht/optimize?XTransformPort=${PORT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alloy,
          objective,
          method,
          param_space: {
            target_temp_c: [750, 1100],
            holding_time_min: [15, 240],
            cooling_rate: [10, 6000],
          },
          n_iterations: iters,
          constraints: {},
        }),
      });
      const json = (await res.json()) as HTOptimizationResult;
      if (json?.ok) {
        s.setHtOptimizationResult(json);
      } else {
        toast({
          title: t.heat.serviceDown,
          description: json?.error ?? t.heat.serviceDownHint,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: t.heat.serviceDown,
        description: e instanceof Error ? e.message : t.heat.serviceDownHint,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }, [alloy, method, objective, iters, s, toast, t.heat.serviceDown, t.heat.serviceDownHint]);

  const applyBest = () => {
    if (!r?.bestWorkflow?.length) return;
    onApplyBest(r.bestWorkflow);
    setApplied(true);
    setTimeout(() => setApplied(false), 2200);
  };

  return (
    <Card className="bg-card/60 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-amber-400" />
          {t.heat.optimization}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Method + objective + iters */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {t.heat.method}
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-8 bg-card/60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {t.heat.objective}
            </Label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger className="h-8 bg-card/60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPT_OBJECTIVES.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {t.heat.iterations}
            </Label>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-400">
              {iters}
            </span>
          </div>
          <Slider value={[iters]} min={5} max={50} step={1} onValueChange={(v) => setIters(v[0])} />
        </div>

        <Button
          size="sm"
          disabled={running}
          onClick={runOpt}
          className="w-full gap-1.5 bg-amber-500 text-amber-950 hover:bg-amber-400"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cpu className="h-3.5 w-3.5" />}
          {t.heat.runOptimization}
        </Button>

        {running && (
          <Progress value={66} className="h-1 bg-amber-500/20 [&>div]:bg-amber-500" />
        )}

        {/* Result */}
        {!r ? (
          <div className="rounded-md border border-dashed border-border/40 bg-background/30 p-3 text-center text-[10.5px] text-muted-foreground">
            {t.heat.noOptResult}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Best headline */}
            <div className="rounded-md border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Best Objective
                </span>
                <Trophy className="h-3 w-3 text-amber-400" />
              </div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-400">
                {r.bestObjectiveValue.toFixed(1)}
              </div>
              <div className="text-[9.5px] text-muted-foreground">
                via {r.method} · {r.allTrials?.length ?? 0} trials
              </div>
            </div>

            {/* Best params */}
            {r.bestParams && Object.keys(r.bestParams).length > 0 && (
              <div className="rounded border border-border/40 bg-background/30 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t.heat.bestParams}
                </div>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(r.bestParams).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between font-mono text-[10.5px]">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-semibold tabular-nums text-amber-400">
                        {typeof v === "number" ? v.toFixed(2) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Convergence mini-chart */}
            {r.convergence?.length > 0 && (
              <div className="h-[80px]">
                <div className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t.heat.convergence}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={r.convergence} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="htOptConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="iter" hide />
                    <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                    <RTooltip
                      contentStyle={{
                        background: "oklch(0.19 0.008 60)",
                        border: "1px solid oklch(0.35 0.008 60)",
                        borderRadius: 6,
                        fontSize: 10,
                        fontFamily: "var(--font-geist-mono)",
                      }}
                      formatter={(v: number) => [v.toFixed(1), "best"]}
                      labelFormatter={(l: number) => `iter ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="bestY"
                      stroke="#f59e0b"
                      strokeWidth={1.8}
                      fill="url(#htOptConv)"
                      isAnimationActive={false}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Pareto front (if multi-objective) */}
            {r.paretoFront && r.paretoFront.length > 0 && (
              <div>
                <div className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t.heat.paretoFront}
                </div>
                <div className="h-[110px]">
                  <ParetoChart trials={r.allTrials} pareto={r.paretoFront} />
                </div>
              </div>
            )}

            {/* Apply best workflow */}
            <Button
              size="sm"
              disabled={applied || !r.bestWorkflow?.length}
              onClick={applyBest}
              className={`w-full gap-1.5 ${
                applied
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              }`}
              variant="outline"
            >
              {applied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> {t.heat.appliedBest}
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" /> {t.heat.applyBest}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ParetoChart({
  trials,
  pareto,
}: {
  trials: HTOptimizationTrial[];
  pareto: HTOptimizationTrial[];
}) {
  // Pick first two objective keys for the scatter
  const allObj = trials[0]?.objectives ?? {};
  const keys = Object.keys(allObj);
  const xKey = keys[0] ?? "x";
  const yKey = keys[1] ?? keys[0] ?? "y";
  const data = trials.map((tr) => ({
    x: tr.objectives?.[xKey] ?? 0,
    y: tr.objectives?.[yKey] ?? 0,
    pareto: tr.isPareto ?? pareto.some((p) => p === tr),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 4, right: 8, bottom: 18, left: 4 }}>
        <CartesianGrid stroke="oklch(0.35 0.008 60 / 0.22)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: prettyPhase(xKey), position: "insideBottom", offset: -8, fill: "oklch(0.65 0.01 60)", fontSize: 9 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          tick={{ fill: "oklch(0.7 0.01 60)", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
          stroke="oklch(0.4 0.008 60)"
          label={{ value: prettyPhase(yKey), angle: -90, position: "insideLeft", offset: 0, fill: "oklch(0.65 0.01 60)", fontSize: 9, style: { textAnchor: "middle" } }}
        />
        <RTooltip
          contentStyle={{
            background: "oklch(0.19 0.008 60)",
            border: "1px solid oklch(0.35 0.008 60)",
            borderRadius: 6,
            fontSize: 10,
            fontFamily: "var(--font-geist-mono)",
          }}
          formatter={(v: number, n: string) => [v.toFixed(1), n === "x" ? prettyPhase(xKey) : prettyPhase(yKey)]}
        />
        <Scatter data={data.filter((d) => !d.pareto)} fill="#94a3b8" isAnimationActive={false} name="Trials" />
        <Scatter data={data.filter((d) => d.pareto)} fill="#f59e0b" isAnimationActive={false} name="Pareto" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
//  Built-in preset fallback (when the backend is unreachable)
// =============================================================================

const BUILTIN_PRESETS: HTPreset[] = [
  {
    id: "quench-temper-1040",
    name: "Quench & Temper — AISI 1040",
    alloySystem: "Fe-C",
    alloyName: "AISI 1040 (0.4%C)",
    description: "Classic austenitize → water quench → temper cycle for medium-carbon steel.",
    composition: { Fe: 99.6, C: 0.4 },
    steps: [
      {
        id: "p1-aust",
        name: "Austenitize",
        process: "austenitize",
        targetTempC: 850,
        heatingRate: 25,
        holdingTimeMin: 45,
        atmosphere: "argon",
        pressureMPa: 0.101,
        coolingMethod: "water_quench",
        coolingRate: COOLING_RATE_BY_METHOD.water_quench,
        cycles: 1,
      },
      {
        id: "p1-temp",
        name: "Temper",
        process: "temper",
        targetTempC: 550,
        heatingRate: 20,
        holdingTimeMin: 90,
        atmosphere: "argon",
        pressureMPa: 0.101,
        coolingMethod: "air_cool",
        coolingRate: COOLING_RATE_BY_METHOD.air_cool,
        cycles: 1,
      },
    ],
  },
  {
    id: "normalize-1045",
    name: "Normalize — AISI 1045",
    alloySystem: "Fe-C",
    alloyName: "AISI 1045 (0.45%C)",
    description: "Austenitize above A3, still-air cool for refined ferrite+pearlite.",
    composition: { Fe: 99.55, C: 0.45 },
    steps: [
      {
        id: "p2-aust",
        name: "Austenitize",
        process: "austenitize",
        targetTempC: 870,
        heatingRate: 30,
        holdingTimeMin: 30,
        atmosphere: "air",
        pressureMPa: 0.101,
        coolingMethod: "air_cool",
        coolingRate: COOLING_RATE_BY_METHOD.air_cool,
        cycles: 1,
      },
    ],
  },
  {
    id: "age-hardening-alcu-4",
    name: "Age Hardening — Al-Cu 4%",
    alloySystem: "Al-Cu",
    alloyName: "Al-4%Cu",
    description: "Solution treat above solvus, water quench, age at 190°C for θ′ precipitation.",
    composition: { Al: 96, Cu: 4 },
    steps: [
      {
        id: "p3-sol",
        name: "Solution Treat",
        process: "solution_treat",
        targetTempC: 540,
        heatingRate: 100,
        holdingTimeMin: 60,
        atmosphere: "nitrogen",
        pressureMPa: 0.101,
        coolingMethod: "water_quench",
        coolingRate: COOLING_RATE_BY_METHOD.water_quench,
        cycles: 1,
      },
      {
        id: "p3-age",
        name: "Age",
        process: "age_hardening",
        targetTempC: 190,
        heatingRate: 50,
        holdingTimeMin: 480,
        atmosphere: "air",
        pressureMPa: 0.101,
        coolingMethod: "air_cool",
        coolingRate: COOLING_RATE_BY_METHOD.air_cool,
        cycles: 1,
      },
    ],
  },
  {
    id: "stress-relief-1020",
    name: "Stress Relief — AISI 1020",
    alloySystem: "Fe-C",
    alloyName: "AISI 1020 (0.2%C)",
    description: "Sub-critical hold to relax residual stresses, no phase change.",
    composition: { Fe: 99.8, C: 0.2 },
    steps: [
      {
        id: "p4-sr",
        name: "Stress Relief",
        process: "stress_relief",
        targetTempC: 595,
        heatingRate: 15,
        holdingTimeMin: 120,
        atmosphere: "nitrogen",
        pressureMPa: 0.101,
        coolingMethod: "furnace_cool",
        coolingRate: COOLING_RATE_BY_METHOD.furnace_cool,
        cycles: 1,
      },
    ],
  },
  {
    id: "dual-treatment-inconel",
    name: "Dual Age — Ni-Cr-Co",
    alloySystem: "Ni-Cr-Co",
    alloyName: "Ni-20%Cr-15%Co",
    description: "Solution treat + two-stage age for γ′ / γ″ precipitation in nickel superalloy.",
    composition: { Ni: 65, Cr: 20, Co: 15 },
    steps: [
      {
        id: "p5-sol",
        name: "Solution",
        process: "solution_treat",
        targetTempC: 1080,
        heatingRate: 80,
        holdingTimeMin: 240,
        atmosphere: "vacuum",
        pressureMPa: 0.0001,
        coolingMethod: "gas_quench",
        coolingRate: COOLING_RATE_BY_METHOD.gas_quench,
        cycles: 1,
      },
      {
        id: "p5-age1",
        name: "Age 1",
        process: "age_hardening",
        targetTempC: 850,
        heatingRate: 60,
        holdingTimeMin: 240,
        atmosphere: "argon",
        pressureMPa: 0.101,
        coolingMethod: "air_cool",
        coolingRate: COOLING_RATE_BY_METHOD.air_cool,
        cycles: 1,
      },
      {
        id: "p5-age2",
        name: "Age 2",
        process: "age_hardening",
        targetTempC: 760,
        heatingRate: 60,
        holdingTimeMin: 480,
        atmosphere: "argon",
        pressureMPa: 0.101,
        coolingMethod: "air_cool",
        coolingRate: COOLING_RATE_BY_METHOD.air_cool,
        cycles: 1,
      },
    ],
  },
];
