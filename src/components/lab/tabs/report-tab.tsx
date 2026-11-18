"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import {
  FileText,
  Download,
  Printer,
  CheckCircle2,
  Atom,
  Microscope,
  Activity,
  Waves,
  AlertTriangle,
  GitBranch,
  FlaskConical,
} from "lucide-react";

interface Report {
  meta: { generatedAt: string; labVersion: string; alloySystem: string; alloyLabel: string; solvent: string; solute: string };
  recipe: { soluteFraction: number; soluteWtPercent: number; temperatureC: number; heatTreatmentC: number; coolingRateKs: number };
  phase: { dominantPhase: string; liquidFraction: number; primaryFraction: number; secondaryFraction: number; liquidusC: number; eutecticC: number; phases: { name: string; fraction: number }[] };
  microstructure: { grainSizeUm: number; hallPetchMPa: number; precipitateDensity: number; astmGrainNumber: number };
  mechanical: { yieldStrengthMPa: number; utsMPa: number; uniformElongationPct: number; youngsModulusGPa: number; strainHardeningExp: number; enduranceLimitMPa: number; fatigueTransitionLife: number };
  solidification: { liquidusC: number; solidusC: number; eutecticFraction: number; partitionCoeff: number; segregationRatio: number };
  sensitivity: { minYieldMPa: number; maxYieldMPa: number; dynamicRangeMPa: number; gridSize: string };
  failure: { fractureToughnessKIc: number; criticalFlawMm: number; fatigueLifeCycles: number; parisC: number; parisM: number; safetyFactorFracture: number; safetyFactorYield: number };
  causal: { ateCoolingRate: number; baselineYieldMPa: number; treatedYieldMPa: number; ci95: number[]; refuters: { name: string; passed: boolean }[] };
  summary: { headline: string };
}

export function ReportTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/report", {
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
          setReport(d.report);
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

  const downloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vml-report-${report.meta.alloySystem}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!report) return;
    const rows: string[] = [];
    rows.push("Section,Property,Value,Unit");
    rows.push(`Meta,Alloy System,${report.meta.alloyLabel},`);
    rows.push(`Meta,Generated,${report.meta.generatedAt},`);
    rows.push(`Recipe,Solute,${report.recipe.soluteWtPercent},wt%`);
    rows.push(`Recipe,Temperature,${report.recipe.temperatureC},°C`);
    rows.push(`Recipe,Heat-Treatment,${report.recipe.heatTreatmentC},°C`);
    rows.push(`Recipe,Cooling Rate,${report.recipe.coolingRateKs},K/s`);
    rows.push(`Phase,Dominant,${report.phase.dominantPhase},`);
    rows.push(`Phase,Liquid Fraction,${report.phase.liquidFraction},frac`);
    rows.push(`Phase,Primary Fraction,${report.phase.primaryFraction},frac`);
    rows.push(`Phase,Liquidus,${report.phase.liquidusC},°C`);
    rows.push(`Microstructure,Grain Size,${report.microstructure.grainSizeUm},µm`);
    rows.push(`Microstructure,ASTM No.,${report.microstructure.astmGrainNumber},`);
    rows.push(`Microstructure,Precipitate Density,${report.microstructure.precipitateDensity},/µm³`);
    rows.push(`Mechanical,Yield σ_y,${report.mechanical.yieldStrengthMPa},MPa`);
    rows.push(`Mechanical,UTS,${report.mechanical.utsMPa},MPa`);
    rows.push(`Mechanical,Elongation,${report.mechanical.uniformElongationPct},%`);
    rows.push(`Mechanical,Young's Modulus,${report.mechanical.youngsModulusGPa},GPa`);
    rows.push(`Mechanical,Endurance σ_e,${report.mechanical.enduranceLimitMPa},MPa`);
    rows.push(`Solidification,Solidus (Scheil),${report.solidification.solidusC},°C`);
    rows.push(`Solidification,Eutectic Fraction,${report.solidification.eutecticFraction},frac`);
    rows.push(`Solidification,Partition k,${report.solidification.partitionCoeff},`);
    rows.push(`Sensitivity,Min σ_y,${report.sensitivity.minYieldMPa},MPa`);
    rows.push(`Sensitivity,Max σ_y,${report.sensitivity.maxYieldMPa},MPa`);
    rows.push(`Failure,K_Ic,${report.failure.fractureToughnessKIc},MPa√m`);
    rows.push(`Failure,Fatigue Life N_f,${report.failure.fatigueLifeCycles},cycles`);
    rows.push(`Failure,Safety (fracture),${report.failure.safetyFactorFracture},×`);
    rows.push(`Causal,ATE (cooling),${report.causal.ateCoolingRate},MPa`);
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vml-report-${report.meta.alloySystem}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <Card className="lab-card lab-card-hover bg-card/60">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-primary/40 bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Engineering Datasheet</div>
              <div className="font-mono text-sm font-semibold text-foreground">
                {sys.label} · {(s.soluteFraction * 100).toFixed(2)}wt% · {s.coolingRateKs.toFixed(1)} K/s
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={downloadJSON} disabled={!report} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
              <Download className="h-3.5 w-3.5" /> JSON
            </Button>
            <Button size="sm" variant="outline" onClick={downloadCSV} disabled={!report} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Headline summary */}
      <Card className="lab-card bg-card/60">
        <CardContent className="p-5">
          {loading || !report ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Summary</div>
                <p className="mt-1 font-mono text-sm leading-relaxed text-foreground">{report.summary.headline}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Datasheet grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading || !report ? (
          [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-48" />)
        ) : (
          <>
            <Section icon={<Atom className="h-4 w-4 text-primary" />} title="Phase Equilibrium">
              <Field label="Dominant phase" value={report.phase.dominantPhase} />
              <Field label="Liquid fraction" value={`${(report.phase.liquidFraction * 100).toFixed(2)}%`} />
              <Field label="Primary (α) fraction" value={`${(report.phase.primaryFraction * 100).toFixed(2)}%`} />
              <Field label="Secondary (θ) fraction" value={`${(report.phase.secondaryFraction * 100).toFixed(2)}%`} />
              <Field label="Liquidus T" value={`${report.phase.liquidusC.toFixed(1)} °C`} />
              <Field label="Eutectic T" value={`${report.phase.eutecticC} °C`} />
            </Section>

            <Section icon={<Microscope className="h-4 w-4 text-emerald-400" />} title="Microstructure">
              <Field label="Grain size" value={`${report.microstructure.grainSizeUm.toFixed(2)} µm`} />
              <Field label="ASTM grain No." value={report.microstructure.astmGrainNumber.toFixed(1)} />
              <Field label="Hall-Petch σ" value={`${report.microstructure.hallPetchMPa.toFixed(1)} MPa`} />
              <Field label="Precipitate density" value={`${report.microstructure.precipitateDensity.toFixed(0)} /µm³`} />
            </Section>

            <Section icon={<Activity className="h-4 w-4 text-rose-400" />} title="Mechanical">
              <Field label="Yield σ_y" value={`${report.mechanical.yieldStrengthMPa.toFixed(1)} MPa`} accent />
              <Field label="UTS" value={`${report.mechanical.utsMPa.toFixed(1)} MPa`} />
              <Field label="Uniform elongation" value={`${report.mechanical.uniformElongationPct.toFixed(1)} %`} />
              <Field label="Young's modulus" value={`${report.mechanical.youngsModulusGPa.toFixed(1)} GPa`} />
              <Field label="Strain-hardening n" value={report.mechanical.strainHardeningExp.toFixed(3)} />
              <Field label="Endurance σ_e" value={`${report.mechanical.enduranceLimitMPa.toFixed(1)} MPa`} />
            </Section>

            <Section icon={<Waves className="h-4 w-4 text-cyan-400" />} title="Solidification (Scheil)">
              <Field label="Liquidus T" value={`${report.solidification.liquidusC.toFixed(1)} °C`} />
              <Field label="Solidus T" value={`${report.solidification.solidusC.toFixed(1)} °C`} />
              <Field label="Eutectic fraction" value={`${(report.solidification.eutecticFraction * 100).toFixed(1)} %`} />
              <Field label="Partition coeff. k" value={report.solidification.partitionCoeff.toFixed(3)} />
              <Field label="Segregation ratio" value={`${report.solidification.segregationRatio.toFixed(2)}×`} />
            </Section>

            <Section icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} title="Failure Analysis">
              <Field label="Fracture toughness K_Ic" value={`${report.failure.fractureToughnessKIc.toFixed(1)} MPa√m`} />
              <Field label="Critical flaw a_c" value={`${report.failure.criticalFlawMm.toFixed(3)} mm`} />
              <Field label="Fatigue life N_f" value={report.failure.fatigueLifeCycles > 0 ? report.failure.fatigueLifeCycles.toLocaleString() : "instant"} unit="cycles" />
              <Field label="Paris C" value={report.failure.parisC.toExponential(1)} />
              <Field label="Paris m" value={report.failure.parisM.toString()} />
              <Field label="Safety n (fracture)" value={`${report.failure.safetyFactorFracture.toFixed(2)} ×`} />
              <Field label="Safety n (yield)" value={`${report.failure.safetyFactorYield.toFixed(2)} ×`} />
            </Section>

            <Section icon={<GitBranch className="h-4 w-4 text-violet-400" />} title="Causal Inference">
              <Field label="ATE (cooling +10 K/s)" value={`${report.causal.ateCoolingRate.toFixed(2)} MPa`} accent />
              <Field label="Baseline σ_y" value={`${report.causal.baselineYieldMPa.toFixed(1)} MPa`} />
              <Field label="Treated σ_y" value={`${report.causal.treatedYieldMPa.toFixed(1)} MPa`} />
              <Field label="95% CI" value={`[${report.causal.ci95[0].toFixed(1)}, ${report.causal.ci95[1].toFixed(1)}]`} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {report.causal.refuters.map((r) => (
                  <Badge key={r.name} variant="outline" className={`text-[9px] ${r.passed ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}`}>
                    {r.passed ? "✓" : "⚠"} {r.name}
                  </Badge>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Sensitivity range + meta */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-primary" />
              Sensitivity Range
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {report && (
              <>
                <Field label="Min σ_y in design space" value={`${report.sensitivity.minYieldMPa.toFixed(1)} MPa`} />
                <Field label="Max σ_y in design space" value={`${report.sensitivity.maxYieldMPa.toFixed(1)} MPa`} />
                <Field label="Dynamic range" value={`${report.sensitivity.dynamicRangeMPa.toFixed(1)} MPa`} />
                <Field label="Grid" value={report.sensitivity.gridSize} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-emerald-400" />
              Report Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {report && (
              <>
                <Field label="Generated" value={new Date(report.meta.generatedAt).toLocaleString()} />
                <Field label="Lab version" value={report.meta.labVersion} />
                <Field label="Alloy system" value={report.meta.alloyLabel} />
                <Field label="Solvent / Solute" value={`${report.meta.solvent} / ${report.meta.solute}`} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="lab-card lab-card-hover bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 pb-1 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${accent ? "font-semibold text-primary" : "text-foreground/90"}`}>
        {value}{unit && <span className="ml-1 text-[9px] text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}
