"use client";

/**
 * MicrostructureTab — hybrid micrograph generation + micrograph database.
 *
 * Generation is served by the Python micrograph service (port 8003):
 *   • diffusion backend (Stable Diffusion) when a torch+CUDA interpreter is
 *     configured — real steps/guidance/seed;
 *   • procedural backend (physics-parameterized Voronoi/dendrite/eutectic/
 *     precipitate synthesis) otherwise — instant and deterministic.
 * The tab always states which backend produced the image. A catalog of real
 * (Wikimedia, license-attributed) and generated micrographs is browsable and
 * generated images can be saved into it.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Cpu,
  Download,
  ImageIcon,
  Loader2,
  Save,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  Database,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { useLabStore } from "@/store/lab-store";
import { useMicrographGenerator } from "@/components/lab/use-lab-data";
import {
  fetchMicrographCatalog,
  type MicrographCatalogEntry,
} from "@/lib/lab-api";

function CondRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/90">{value}</span>
    </div>
  );
}

export function MicrostructureTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const { data, error, loading, progress, saved, generate, save } =
    useMicrographGenerator();

  const [catalog, setCatalog] = useState<MicrographCatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MicrographCatalogEntry | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMicrographCatalog()
      .then((d) => {
        if (!alive) return;
        setCatalog(d.entries ?? []);
        setCatalogError(d.ok ? null : "catalog unavailable");
      })
      .catch(() => alive && setCatalogError("catalog unavailable"));
    return () => {
      alive = false;
    };
  }, [saved]);

  const catalogForSystem = useMemo(
    () =>
      catalog.filter(
        (e) => !e.system || e.system === s.alloySystem || e.system === "misc",
      ),
    [catalog, s.alloySystem],
  );

  const handleGenerate = () => {
    setShowGenerated(true);
    setSelected(null);
    generate({
      alloySystem: s.alloySystem,
      soluteWtPct: +(s.soluteFraction * 100).toFixed(2),
      solute2WtPct: +(s.soluteFraction2 * 100).toFixed(2),
      coolingRateKs: s.coolingRateKs,
      heatTreatmentC: s.heatTreatmentC,
      magnification: s.magnification,
      guidanceScale: s.guidanceScale,
      diffusionSteps: s.diffusionSteps,
      size: 512,
    });
  };

  const handleSaveToDatabase = async () => {
    if (!data?.imageUrl) return;
    const filename = `gen_${data.seed}.png`;
    // the service already persisted the render under this name during generation
    await save({
      filename,
      alloySystem: s.alloySystem,
      soluteWtPct: +(s.soluteFraction * 100).toFixed(2),
      coolingRateKs: s.coolingRateKs,
      heatTreatmentC: s.heatTreatmentC,
      magnification: s.magnification,
      technique: data.backend === "diffusion" ? "Diffusion-SEM" : "Procedural-SEM",
      caption: `Generated ${sys.label} at ${(s.soluteFraction * 100).toFixed(1)} wt% ${sys.solute}, ${s.coolingRateKs} K/s, aged ${s.heatTreatmentC} °C (${data.backend})`,
    });
  };

  const displayEntry = !showGenerated ? (selected ?? catalogForSystem[0] ?? null) : null;
  const showImage = showGenerated && data?.imageUrl ? data.imageUrl : displayEntry?.file ?? "";
  const isGenerated = showGenerated && !!data?.imageUrl;
  const isBusy = showGenerated && loading;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Left: conditioning + generate + backend info */}
      <div className="space-y-4">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Conditioning parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <CondRow label="Alloy system" value={sys.label} />
            <CondRow
              label="Composition"
              value={`${(s.soluteFraction * 100).toFixed(2)} wt% ${sys.solute}`}
            />
            <CondRow label="Cooling rate" value={`${s.coolingRateKs.toFixed(1)} K/s`} />
            <CondRow label="Heat-treat T" value={`${s.heatTreatmentC.toFixed(0)} °C`} />
            <CondRow label="Magnification" value={`${s.magnification.toLocaleString()}×`} />
            <CondRow label="Guidance (CFG)" value={s.guidanceScale.toFixed(1)} />
            <CondRow label="Diffusion steps" value={`${s.diffusionSteps}`} />
            <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
              Parameters feed both backends: the physics synthesis maps them to
              grain size, dendrite spacing, eutectic fraction and precipitate
              density; the diffusion backend conditions the prompt on them.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardContent className="p-4">
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {loading ? "Generating…" : "Synthesize Microstructure"}
            </Button>
            {loading && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">
                    {s.diffusionSteps > 0 ? "sampling…" : "synthesizing…"}
                  </span>
                  <span className="font-mono tabular-nums">{progress.toFixed(0)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}
            {error && (
              <div className="mt-2 text-[11px] text-rose-400">
                <Badge variant="destructive" className="mr-1.5 text-[9px]">
                  ERR
                </Badge>
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-emerald-400" />
              Generator backend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {data ? (
              <>
                <CondRow label="Backend" value={data.backend} />
                <CondRow label="Model" value={data.model} />
                <CondRow label="Seed" value={String(data.seed)} />
                <CondRow
                  label="Steps / guidance"
                  value={
                    data.backend === "diffusion"
                      ? `${data.steps} / ${data.guidanceScale}`
                      : "n/a (analytical)"
                  }
                />
                <CondRow label="Inference" value={`${data.inferenceMs} ms`} />
              </>
            ) : (
              <p className="leading-relaxed text-muted-foreground">
                Two backends are available:
                <br />
                <span className="text-foreground/90">procedural</span> — always on:
                physics-parameterized synthesis (Voronoi grains, dendrites,
                eutectic lamellae, precipitates), deterministic per seed.
                <br />
                <span className="text-foreground/90">diffusion</span> — Stable
                Diffusion on a torch+CUDA interpreter when one is configured
                (MICROGRAPH_PYTHON env var); real steps/guidance/seed.
              </p>
            )}
            {isGenerated && data && (
              <Button
                onClick={handleSaveToDatabase}
                size="sm"
                variant="outline"
                className="mt-2 w-full gap-1.5 text-xs"
              >
                {saved ? <Save className="h-3 w-3 text-emerald-400" /> : <Database className="h-3 w-3" />}
                {saved ? "Saved to catalog" : "Save to catalog"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: viewer + catalog gallery */}
      <div className="space-y-4 xl:col-span-2">
        <Card className="overflow-hidden bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ImageIcon className="h-4 w-4 text-primary" />
                {isGenerated ? "Generated SEM Microstructure" : "Micrograph Database"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`gap-1 ${
                    isGenerated
                      ? "border-primary/30 text-primary"
                      : "border-amber-400/40 text-amber-400"
                  }`}
                >
                  {isGenerated ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      {data?.backend === "diffusion" ? "Diffusion" : "Procedural"}
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-3 w-3" /> Catalog reference
                    </>
                  )}
                </Badge>
                {isGenerated && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" asChild>
                    <a href={data!.imageUrl} download="microstructure.png">
                      <Download className="h-3 w-3" /> Save
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-black grid-bg">
              {isBusy ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="absolute inset-0 animate-sweep" />
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    generating microstructure…
                  </span>
                </div>
              ) : showImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={showImage}
                  alt={
                    isGenerated
                      ? `Generated micrograph of ${sys.label}`
                      : displayEntry?.caption ?? "catalog micrograph"
                  }
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {catalogError ?? "No image — generate one or pick from the catalog"}
                </div>
              )}
              {/* overlays */}
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                {isGenerated
                  ? `${s.magnification.toLocaleString()}× SEI · seed ${data?.seed}`
                  : `${displayEntry?.technique ?? ""} · ${displayEntry?.magnification ?? ""}`}
              </div>
              {!isGenerated && displayEntry?.license && (
                <div className="pointer-events-none absolute bottom-3 right-3 max-w-[70%] rounded bg-black/70 px-2 py-0.5 text-right font-mono text-[9px] text-amber-400 backdrop-blur">
                  {displayEntry.license}
                  {displayEntry.author ? ` · ${displayEntry.author}` : ""}
                </div>
              )}
            </div>
            {!isGenerated && displayEntry && (
              <div className="mt-2.5 rounded-md border border-amber-400/30 bg-amber-400/5 p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-amber-400">
                    <BookOpen className="h-3 w-3" />
                    {displayEntry.origin === "generated"
                      ? "Generated entry"
                      : "Literature reference"}
                  </span>
                  {displayEntry.sourcePage && (
                    <a
                      href={displayEntry.sourcePage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[9px] text-muted-foreground hover:text-amber-400"
                    >
                      {displayEntry.source} ↗
                    </a>
                  )}
                </div>
                <p className="text-[10.5px] leading-relaxed text-foreground/80">
                  {displayEntry.caption}
                </p>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {displayEntry.alloy} · {displayEntry.technique} ·{" "}
                  {displayEntry.magnification}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Micrograph database
                <Badge variant="outline" className="text-[9px]">
                  {catalogForSystem.length} entries
                </Badge>
              </span>
              {showGenerated && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowGenerated(false)}
                >
                  ← back to catalog
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {catalogForSystem.slice(0, 16).map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelected(e);
                    setShowGenerated(false);
                  }}
                  className={`group relative aspect-square overflow-hidden rounded border ${
                    displayEntry?.id === e.id && !showGenerated
                      ? "border-primary"
                      : "border-border/60"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.file}
                    alt={e.caption ?? e.id}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 px-1 py-0.5 text-left text-[8px] text-white/80">
                    {e.category} · {e.technique}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
