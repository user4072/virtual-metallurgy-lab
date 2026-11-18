"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { ALLOY_SYSTEMS, type AlloySystemId } from "@/lib/metallurgy";
import { useLabStore } from "@/store/lab-store";
import { useHistory } from "@/store/history-store";
import { useLang } from "@/store/lang-store";
import { ALLOY_PRESETS, PRESET_CATEGORIES, type AlloyPreset } from "@/lib/alloy-presets";
import {
  FlaskConical,
  Thermometer,
  Snowflake,
  Waves,
  Microscope,
  Network,
  Sparkles,
  Layers,
  History,
  Library,
  Check,
} from "lucide-react";

function fmt(v: number, d = 2): string {
  return v.toFixed(d);
}

export function SidebarContent() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const { dict: t } = useLang();

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3.5">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
          {t.sidebar.materialParams}
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1 scroll-thin">
        <div className="space-y-6 px-5 py-5">
          {/* ===== PRESETS: real alloy tempers ===== */}
          <PresetsPanel />

          {/* ===== GROUP: Material ===== */}
          <GroupLabel label={t.sidebar.groupMaterial} />
          <Section icon={<Layers className="h-3.5 w-3.5" />} title={t.sidebar.alloySystem}>
            <Select
              value={s.alloySystem}
              onValueChange={(v) => s.setAlloySystem(v as AlloySystemId)}
            >
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
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
              <Meta label={t.sidebar.solvent} value={sys.solvent} />
              <Meta label={t.sidebar.solute} value={sys.solute} />
              <Meta label={t.sidebar.meltSolvent} value={`${sys.tMeltSolventC}°C`} />
              <Meta label={t.sidebar.eutectic} value={`${sys.tEutecticC}°C`} />
            </div>
          </Section>

          <Section
            icon={<Sparkles className="h-3.5 w-3.5" />}
            title={`${t.sidebar.composition} — ${sys.solute}`}
          >
            <SliderRow
              value={s.soluteFraction * 100}
              min={0}
              max={sys.xMax * 100}
              step={0.1}
              unit="wt%"
              display={`${fmt(s.soluteFraction * 100, 2)} wt%`}
              onValue={(v) => s.setSoluteFraction(v / 100)}
            />
            {/* Second solute slider for ternary systems (e.g. Co in Ni-Cr-Co) */}
            {sys.isTernary && sys.solute2 && sys.xMax2 && (
              <>
                <div className="pt-1">
                  <SliderRow
                    value={s.soluteFraction2 * 100}
                    min={0}
                    max={sys.xMax2 * 100}
                    step={0.5}
                    unit="wt%"
                    display={`${fmt(s.soluteFraction2 * 100, 1)} wt%`}
                    onValue={(v) => s.setSoluteFraction2(v / 100)}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
                  <span>{sys.solvent}: {fmt(Math.max(0, (1 - s.soluteFraction - s.soluteFraction2) * 100), 1)}%</span>
                  <span>{sys.solute}: {fmt(s.soluteFraction * 100, 1)}%</span>
                  <span>{sys.solute2}: {fmt(s.soluteFraction2 * 100, 1)}%</span>
                </div>
              </>
            )}
            {!sys.isTernary && (
              <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
                <span>{sys.solvent}: {fmt((1 - s.soluteFraction) * 100, 2)}%</span>
                <span>{sys.solute}: {fmt(s.soluteFraction * 100, 2)}%</span>
              </div>
            )}
          </Section>

          {/* ===== GROUP: Thermal Processing ===== */}
          <GroupLabel label={t.sidebar.groupThermal} />
          {/* Temperature */}
          <Section icon={<Thermometer className="h-3.5 w-3.5" />} title={t.sidebar.inspectionTemp}>
            <SliderRow
              value={s.temperatureC}
              min={-50}
              max={800}
              step={5}
              unit="°C"
              display={`${fmt(s.temperatureC, 0)} °C`}
              onValue={(v) => s.setTemperatureC(v)}
            />
          </Section>

          {/* Heat treatment */}
          <Section icon={<Waves className="h-3.5 w-3.5" />} title={t.sidebar.heatTreatment}>
            <SliderRow
              value={s.heatTreatmentC}
              min={20}
              max={600}
              step={5}
              unit="°C"
              display={`${fmt(s.heatTreatmentC, 0)} °C`}
              onValue={(v) => s.setHeatTreatmentC(v)}
            />
          </Section>

          {/* Cooling rate (log) */}
          <Section icon={<Snowflake className="h-3.5 w-3.5" />} title={t.sidebar.coolingRate}>
            <LogSlider
              value={s.coolingRateKs}
              min={0.1}
              max={500}
              onValue={(v) => s.setCoolingRateKs(v)}
            />
            <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
              <span>{t.sidebar.airCool}</span>
              <span>{t.sidebar.oilQuench}</span>
              <span>{t.sidebar.water}</span>
            </div>
          </Section>

          {/* Magnification */}
          <Section icon={<Microscope className="h-3.5 w-3.5" />} title={t.sidebar.magnification}>
            <Select
              value={String(s.magnification)}
              onValueChange={(v) => s.setMagnification(Number(v))}
            >
              <SelectTrigger className="w-full bg-card/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[500, 1000, 2500, 5000, 10000, 25000].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m.toLocaleString()}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          <Separator className="bg-border/50" />

          {/* ===== GROUP: AI Models ===== */}
          <GroupLabel label={t.sidebar.groupModels} />
          {/* Surrogate model */}
          <Section icon={<Network className="h-3.5 w-3.5" />} title={t.sidebar.surrogateModel}>
            <ToggleGroup
              type="single"
              value={s.surrogateModel}
              onValueChange={(v) => v && s.setSurrogateModel(v as never)}
              className="grid w-full grid-cols-1 gap-1.5"
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem
                value="graph-gnn"
                className="justify-start gap-2 data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10"
              >
                <Network className="h-3.5 w-3.5" /> {t.sidebar.graphGnn}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="tabular-mlp"
                className="justify-start gap-2 data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10"
              >
                <Layers className="h-3.5 w-3.5" /> {t.sidebar.tabularMlp}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ensemble"
                className="justify-start gap-2 data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10"
              >
                <Sparkles className="h-3.5 w-3.5" /> {t.sidebar.ensemble}
              </ToggleGroupItem>
            </ToggleGroup>
          </Section>

          {/* Diffusion sampler */}
          <Section icon={<Sparkles className="h-3.5 w-3.5" />} title={t.sidebar.diffusionSampler}>
            <Label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.sidebar.inferenceSteps}
            </Label>
            <SliderRow
              value={s.diffusionSteps}
              min={10}
              max={100}
              step={5}
              unit=""
              display={`${s.diffusionSteps} steps`}
              onValue={(v) => s.setDiffusionSteps(v)}
            />
            <Label className="mb-1.5 mt-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.sidebar.guidanceScale}
            </Label>
            <SliderRow
              value={s.guidanceScale}
              min={1}
              max={15}
              step={0.5}
              unit=""
              display={fmt(s.guidanceScale, 1)}
              onValue={(v) => s.setGuidanceScale(v)}
            />
          </Section>
        </div>

        {/* History panel inside the scroll area so nothing gets clipped */}
        <HistoryPanel />
      </ScrollArea>
    </div>
  );
}

/** Presets panel — curated real alloy tempers, one-click loading. */
function PresetsPanel() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const [activeCat, setActiveCat] = useState<AlloyPreset["category"] | "all">("all");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const filtered =
    activeCat === "all"
      ? ALLOY_PRESETS
      : ALLOY_PRESETS.filter((p) => p.category === activeCat);

  const apply = (p: AlloyPreset) => {
    s.setAlloySystem(p.alloySystem);
    s.setSoluteFraction(p.soluteFraction);
    s.setHeatTreatmentC(p.heatTreatmentC);
    s.setCoolingRateKs(p.coolingRateKs);
    s.setTemperatureC(p.temperatureC);
    setAppliedId(p.id);
    setTimeout(() => setAppliedId(null), 1800);
  };

  // detect if current recipe matches a preset
  const currentMatch = ALLOY_PRESETS.find(
    (p) =>
      p.alloySystem === s.alloySystem &&
      Math.abs(p.soluteFraction - s.soluteFraction) < 1e-3 &&
      Math.abs(p.heatTreatmentC - s.heatTreatmentC) < 2,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Library className="h-3.5 w-3.5" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]">
          {t.sidebar.presets}
        </h3>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
          {ALLOY_PRESETS.length}
        </span>
      </div>

      {/* category filter */}
      <div className="flex flex-wrap gap-1">
        <CatChip label={t.sidebar.presetCategories.all} active={activeCat === "all"} onClick={() => setActiveCat("all")} />
        {PRESET_CATEGORIES.map((c) => (
          <CatChip
            key={c.id}
            label={t.sidebar.presetCategories[c.id]}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
          />
        ))}
      </div>

      {/* preset list */}
      <div className="max-h-56 space-y-1.5 overflow-y-auto scroll-thin pr-1">
        {filtered.map((p) => {
          const isApplied = appliedId === p.id;
          const isCurrent = currentMatch?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => apply(p)}
              className={`group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                isApplied
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/40 bg-background/40 hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate font-mono text-[11px] font-semibold text-foreground/90">
                    {p.name}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums text-primary">
                    {p.expectedYield} MPa
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-muted-foreground">
                  {p.description}
                </p>
              </div>
              {isApplied && <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CatChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 text-[9px] font-medium transition ${
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/** Recent-recipes panel with localStorage-persisted history. */
function HistoryPanel() {
  const s = useLabStore();
  const { dict: t } = useLang();
  const { entries, clear, hydrate } = useHistory();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // snapshot the current recipe whenever these change (debounced via effect)
  useEffect(() => {
    const timer = setTimeout(() => {
      // we need a yield-strength estimate; fetch from the phase API cheaply
      fetch("/api/predict_phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alloySystem: s.alloySystem,
          soluteFraction: s.soluteFraction,
          temperatureC: s.temperatureC,
          heatTreatmentC: s.heatTreatmentC,
          coolingRateKs: s.coolingRateKs,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.ok) {
            useHistory.getState().add({
              alloySystem: s.alloySystem,
              soluteFraction: s.soluteFraction,
              temperatureC: s.temperatureC,
              heatTreatmentC: s.heatTreatmentC,
              coolingRateKs: s.coolingRateKs,
              yieldStrength: d.yieldStrength?.yield ?? 0,
              dominantPhase: d.phaseFractions?.dominantPhase,
            });
          }
        })
        .catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [
    s.alloySystem,
    s.soluteFraction,
    s.temperatureC,
    s.heatTreatmentC,
    s.coolingRateKs,
  ]);

  return (
    <div className="mt-2 border-t border-border/60 px-4 pt-3 pb-6">
      <div className="flex items-center justify-between pb-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
          {t.sidebar.history}
          <span className="rounded bg-muted px-1 font-mono text-[9px] text-foreground/70">
            {entries.length}
          </span>
        </button>
        {entries.length > 0 && (
          <button
            onClick={clear}
            className="text-[9px] text-muted-foreground hover:text-rose-400"
          >
            {t.sidebar.clear}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-1">
          {entries.length === 0 ? (
            <p className="text-[10px] italic text-muted-foreground/60">
              {t.sidebar.historyEmpty}
            </p>
          ) : (
            <div className="space-y-1">
              {entries.slice(0, 8).map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    s.setAlloySystem(e.alloySystem as never);
                    s.setSoluteFraction(e.soluteFraction);
                    s.setTemperatureC(e.temperatureC);
                    s.setHeatTreatmentC(e.heatTreatmentC);
                    s.setCoolingRateKs(e.coolingRateKs);
                  }}
                  className="group flex w-full items-center gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        e.alloySystem === "Al-Cu"
                          ? "#d97706"
                          : e.alloySystem === "Al-Si"
                            ? "#0891b2"
                            : "#b45309",
                    }}
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-foreground/90">
                        {e.alloySystem} · {(e.soluteFraction * 100).toFixed(1)}%
                      </span>
                      <span className="font-mono text-[10px] font-bold tabular-nums text-primary">
                        {e.yieldStrength.toFixed(0)} MPa
                      </span>
                    </div>
                    <div className="font-mono text-[8.5px] text-muted-foreground">
                      {e.heatTreatmentC.toFixed(0)}°C · {e.coolingRateKs.toFixed(1)}K/s · {timeAgo(e.ts)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

/** A small uppercase group divider that gives the sidebar visual structure. */
function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-primary/70">
        {label}
      </span>
      <span className="h-px flex-[3] bg-gradient-to-r from-transparent via-border/60 to-transparent" />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-border/40 bg-card/40 px-2 py-1.5">
      <span className="text-[10px] opacity-70">{label}</span>
      <span className="font-mono text-[10px] text-foreground/90">{value}</span>
    </div>
  );
}

function SliderRow({
  value,
  min,
  max,
  step,
  unit,
  display,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  display: string;
  onValue: (v: number) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {min}{unit}
        </span>
        <span className="rounded bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-primary">
          {display}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {max}{unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onValue(v[0])}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-primary"
      />
    </div>
  );
}

/** Logarithmic slider for cooling rate 0.1–500 K/s. */
function LogSlider({
  value,
  min,
  max,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  onValue: (v: number) => void;
}) {
  const lMin = Math.log10(min);
  const lMax = Math.log10(max);
  const lVal = Math.log10(value);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">{min}</span>
        <span className="rounded bg-primary/10 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-primary">
          {value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : value.toFixed(0)} K/s
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">{max}</span>
      </div>
      <Slider
        value={[((lVal - lMin) / (lMax - lMin)) * 100]}
        min={0}
        max={100}
        step={0.5}
        onValueChange={(v) => {
          const lv = lMin + (v[0] / 100) * (lMax - lMin);
          onValue(Math.pow(10, lv));
        }}
        className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-primary/40 [&_[role=slider]]:bg-primary"
      />
    </div>
  );
}

export function ParamSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-[320px] shrink-0 border-r border-border/60 bg-sidebar/40 lg:block">
        <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="w-[300px] p-0 sm:w-[320px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Material Parameters</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
