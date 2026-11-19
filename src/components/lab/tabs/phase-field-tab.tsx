"use client";

/**
 * Phase-Field Evolution — multi-phase cellular automaton with a REAL cooling
 * path (metallurgically correct deposition order).
 * -----------------------------------------------------------------------------
 * 128×128 cells {grainId, phase, ori, lamella} on a periodic grid. The
 * simulation COOLS the austenitized specimen at the sidebar rate: as T crosses
 * A3 → A1 → Ms the correct phase deposits in the correct place:
 *
 *   Fe-C, slow cooling (pearlitic regime):
 *     • hypoeutectoid: FERRITE nucleates in the boundaries and thickens into
 *       bright bands (fraction from the lever rule vs C%)
 *     • hypereutectoid: a white CEMENTITE network forms in the boundaries
 *     • at A1: PEARLITE colonies (dark lamellar stripes) grow from the
 *       transformed boundaries into the remaining austenite
 *   Fe-C, fast quench (martensitic regime):
 *     • MARTENSITE needles slice across the untransformed grains below Ms
 *   Al-Cu / Al-Si (ageing):
 *     • θ-Al₂Cu / β-Si nucleates AT boundaries during the hold, grows into
 *       the matrix, and DISSOLVES when T exceeds the solvus
 *
 * Physics shared with the 3D module via src/lib/ca-physics.ts.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { depositionPlan, type DepositionPlan } from "@/lib/ca-physics";
import {
  Grid3x3,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Thermometer,
  Zap,
  Droplet,
  Atom,
} from "lucide-react";

const N = 128;
const CELLS = N * N;

type Stage =
  | "austenite"
  | "boundary-deposition"
  | "eutectoid"
  | "martensitic"
  | "ageing"
  | "growth"
  | "equilibrium";

interface Cell2D {
  grainId: number;
  phase: number; // 0 austenite, 1 ferrite(bright), 2 pearlite(dark lamellar),
  // 3 cementite(white network), 4 martensite needles, 5 precipitates
  ori: number;
  lamella: number;
}

interface Grain2D {
  x: number;
  y: number;
  ori: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function PhaseFieldTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const field2D = useRef<Cell2D[]>([]);
  const grains2D = useRef<Grain2D[]>([]);
  const simTime = useRef(0);
  const tempNow = useRef(s.heatTreatmentC);
  const stepRef = useRef(0);
  const [grainCount, setGrainCount] = useState(0);
  const [mode3D, setMode3D] = useState(false);
  const [running, setRunning] = useState(true);
  const [stage, setStage] = useState<Stage>("austenite");
  const [fracLabel, setFracLabel] = useState("");

  // ---- composition (sidebar) → wt% for the physics ------------------------
  const comp = useMemo(() => {
    const c = s.soluteFraction * 100;
    return {
      C: c,
      Mn: s.compExtra["Mn"] ?? 0.75,
      Si: s.compExtra["Si"] ?? 0.25,
      Cr: s.compExtra["Cr"] ?? 0,
      Ni: s.compExtra["Ni"] ?? 0,
      Mo: s.compExtra["Mo"] ?? 0,
    };
  }, [s.soluteFraction, s.compExtra]);

  // ---- cooling path + deposition plan -------------------------------------
  const plan: DepositionPlan = useMemo(
    () =>
      depositionPlan(
        s.alloySystem,
        comp,
        s.coolingRateKs,
        s.holdingTimeHours,
        s.heatTreatmentC,
        sys.tEutecticC,
      ),
    [s.alloySystem, comp, s.coolingRateKs, s.holdingTimeHours, s.heatTreatmentC, sys.tEutecticC],
  );

  const rngRef = useRef(mulberry32(12345));

  // ---- reset: austenite grains (Voronoi) -----------------------------------
  const reset2D = useCallback(() => {
    const rng = rngRef.current;
    const cells: Cell2D[] = new Array(CELLS);
    const grains: Grain2D[] = [];
    const count = Math.min(
      100,
      Math.max(8, Math.round(10 + 4 * Math.pow(Math.max(s.coolingRateKs, 0.1), 0.7))),
    );
    for (let i = 0; i < count; i++) {
      grains.push({ x: N * rng(), y: N * rng(), ori: 0.35 + 0.45 * rng() });
    }
    grains2D.current = grains;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let best = Infinity;
        let bi = 0;
        for (let e = 0; e < grains.length; e++) {
          const dx = x - grains[e].x;
          const dy = y - grains[e].y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bi = e;
          }
        }
        cells[y * N + x] = { grainId: bi, phase: 0, ori: grains[bi].ori, lamella: 0 };
      }
    }
    field2D.current = cells;
    simTime.current = 0;
    tempNow.current = Math.max(s.heatTreatmentC, plan.A3 + 40);
    stepRef.current = 0;
    setStage("austenite");
    const ids = new Set<number>();
    for (const c of cells) ids.add(c.grainId);
    setGrainCount(ids.size);
  }, [plan, s.coolingRateKs, s.heatTreatmentC]);

  const reset = useCallback(() => {
    reset2D();
  }, [reset2D]);

  useEffect(() => {
    reset();
  }, [reset]);

  const isBoundary = (e: Cell2D[], i: number) => {
    const y = Math.floor(i / N);
    const x = i % N;
    const id = e[i].grainId;
    return (
      e[y * N + ((x + 1) % N)].grainId !== id ||
      e[y * N + ((x - 1 + N) % N)].grainId !== id ||
      e[((y + 1) % N) * N + x].grainId !== id ||
      e[((y - 1 + N) % N) * N + x].grainId !== id
    );
  };

  // ---- one cooling step: deposit the correct phase in the correct place ----
  const step2D = useCallback(() => {
    const e = field2D.current;
    if (e.length === 0) return;
    const r = e.map((c) => ({ ...c }));
    const rng = rngRef.current;
    const plan: DepositionPlan = depositionPlan(
      s.alloySystem,
      comp,
      s.coolingRateKs,
      s.holdingTimeHours,
      s.heatTreatmentC,
      sys.tEutecticC,
    );

    const FeC = plan.system === "Fe-C";
    const dtS = 0.5;
    simTime.current += dtS;
    tempNow.current = Math.max(s.temperatureC, tempNow.current - s.coolingRateKs * dtS);
    const T = tempNow.current;
    stepRef.current += 1;

    const boundaryIds = new Set<number>();
    for (let i = 0; i < CELLS; i++) if (isBoundary(e, i)) boundaryIds.add(i);

    // ---- stage label --------------------------------------------------------
    if (FeC && plan.regime === "martensitic" && T < plan.Ms) setStage("martensitic");
    else if (FeC && T > plan.A1) setStage("austenite");
    else if (FeC && plan.boundaryPhase !== "none" && T > plan.A1) setStage("boundary-deposition");
    else if (FeC && T <= plan.A1) setStage("eutectoid");
    else if (plan.precip && !plan.dissolved) setStage(stepRef.current < 100 ? "ageing" : "growth");
    else setStage("equilibrium");

    // ---- Fe-C: boundary deposition below A3/Acm -----------------------------
    if (FeC && plan.boundaryPhase !== "none" && T < plan.A3 - 5) {
      const pNuc = 0.3 * plan.boundaryBand * plan.boundaryBand;
      const pGrow = 0.22 * plan.boundaryBand;
      for (let i = 0; i < CELLS; i++) {
        if (e[i].phase !== 0) continue;
        if (!boundaryIds.has(i)) continue;
        if (rng() < pNuc) {
          r[i].phase = plan.boundaryPhase === "ferrite" ? 1 : 3;
          r[i].ori = plan.boundaryPhase === "ferrite" ? 0.85 : 0.9;
          continue;
        }
        const y = Math.floor(i / N);
        const x = i % N;
        const nb = [
          ((y + 1) % N) * N + x,
          ((y - 1 + N) % N) * N + x,
          y * N + ((x + 1) % N),
          y * N + ((x - 1 + N) % N),
        ];
        let deposited = 0;
        for (const n of nb) {
          if (plan.boundaryPhase === "ferrite" ? e[n].phase === 1 : e[n].phase === 3) deposited++;
        }
        if (deposited > 0 && rng() < pGrow * deposited) {
          r[i].phase = plan.boundaryPhase === "ferrite" ? 1 : 3;
          r[i].ori = plan.boundaryPhase === "ferrite" ? 0.85 : 0.9;
        }
      }
    }

    // ---- Fe-C: eutectoid pearlite below A1 ----------------------------------
    if (FeC && T <= plan.A1 && plan.regime !== "martensitic") {
      const pNuc = 0.25 * plan.pearliteFrac * plan.pearliteFrac;
      const pGrow = 0.3 * plan.pearliteFrac;
      for (let i = 0; i < CELLS; i++) {
        if (e[i].phase !== 0) continue;
        const y = Math.floor(i / N);
        const x = i % N;
        const nb = [
          ((y + 1) % N) * N + x,
          ((y - 1 + N) % N) * N + x,
          y * N + ((x + 1) % N),
          y * N + ((x - 1 + N) % N),
        ];
        let pearliteNb = 0;
        for (const n of nb) if (e[n].phase === 2) pearliteNb++;
        if (pearliteNb > 0) {
          if (rng() < pGrow) {
            r[i].phase = 2;
            r[i].lamella = (x + y) % 4 < 2 ? 1 : 0;
          }
          continue;
        }
        const boundary = boundaryIds.has(i);
        const ferriteNb = nb.filter((n) => e[n].phase === 1).length;
        if ((boundary || ferriteNb > 0) && rng() < pNuc) {
          r[i].phase = 2;
          r[i].lamella = (x + y) % 4 < 2 ? 1 : 0;
        }
      }
    }

    // ---- Fe-C: martensite needles below Ms (fast quench) --------------------
    if (FeC && (T < plan.Ms || plan.regime === "martensitic") && plan.needles) {
      for (let k = 0; k < 6; k++) {
        const i0 = Math.floor(rng() * CELLS);
        if (e[i0].phase !== 0) continue;
        const len = 8 + Math.floor(rng() * 22);
        const ang = rng() * Math.PI;
        const dxs = Math.cos(ang);
        const dys = Math.sin(ang);
        let cx = i0 % N;
        let cy = Math.floor(i0 / N);
        const id = e[i0].grainId;
        for (let l = 0; l < len; l++) {
          cx = (Math.round(cx + dxs) + N) % N;
          cy = (Math.round(cy + dys) + N) % N;
          const i = cy * N + cx;
          if (e[i].grainId !== id || e[i].phase !== 0) break;
          r[i].phase = 4;
          r[i].ori = 0.55 + rng() * 0.1;
        }
      }
    }

    // ---- ageing systems (Al-Cu / Al-Si): boundary→matrix precipitation ------
    if (!FeC && plan.precip) {
      const { atBoundary, inGrain, grow } = plan.precip;
      const ph = 5;
      for (let i = 0; i < CELLS; i++) {
        if (e[i].phase !== 0) continue;
        const boundary = boundaryIds.has(i);
        const p = boundary ? atBoundary : inGrain;
        if (rng() < p) {
          r[i].phase = ph;
          r[i].ori = 0.12;
        }
        if (r[i].phase === 0) {
          const y = Math.floor(i / N);
          const x = i % N;
          const nb = [
            ((y + 1) % N) * N + x,
            ((y - 1 + N) % N) * N + x,
            y * N + ((x + 1) % N),
            y * N + ((x - 1 + N) % N),
          ];
          let pn = 0;
          for (const n of nb) if (e[n].phase === ph) pn++;
          if (pn > 0 && rng() < grow * pn) {
            r[i].phase = ph;
            r[i].ori = 0.12;
          }
        }
      }
      if (plan.dissolved) {
        for (const c of r) {
          if (c.phase === ph && rng() < 0.3) {
            c.phase = 0;
            c.ori = 0.5;
          }
        }
      }
    }

    field2D.current = r;
    const ids = new Set<number>();
    let pf = 0;
    for (const c of r) {
      if (c.phase >= 1) pf++;
      else ids.add(c.grainId);
    }
    setGrainCount(ids.size);
    setFracLabel(
      FeC ? `${(frac2d(r) * 100).toFixed(0)}% transformed` : `${(frac2d(r) * 100).toFixed(1)}% precipitate`,
    );
  }, [s.alloySystem, comp, s.compExtra, s.coolingRateKs, s.holdingTimeHours, s.heatTreatmentC, s.temperatureC, sys.tEutecticC]);

  const frac2d = (r: Cell2D[]) => {
    let pf = 0;
    for (const c of r) if (c.phase >= 1) pf++;
    return pf / CELLS;
  };

  // ---- 2D render: etched-SEM grayscale, phase-correct ----------------------
  const draw2D = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const a = field2D.current;
    if (a.length === 0) return;
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const r = y * N + x;
        const o = a[r];
        let n: number;
        switch (o.phase) {
          case 1:
            n = 195 + 25 * Math.random();
            break; // ferrite — bright
          case 2:
            n = o.lamella ? 95 + 20 * Math.random() : 55 + 18 * Math.random();
            break; // pearlite — dark lamellar
          case 3:
            n = 215 + 20 * Math.random();
            break; // cementite — white network
          case 4:
            n = 110 + 30 * Math.random();
            break; // martensite needles
          case 5:
            n = 20 + 12 * Math.random();
            break; // precipitates dark
          default:
            n = 120 + 45 * o.ori; // austenite/matrix
        }
        n += (Math.random() - 0.5) * 10;
        n = Math.max(0, Math.min(255, n));
        const l = 4 * r;
        img.data[l] = n;
        img.data[l + 1] = n;
        img.data[l + 2] = n;
        img.data[l + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  // ---- 3D isometric draw of the same automaton ----------------------------
  const draw3D = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const a = field2D.current;
    if (a.length === 0) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const nx = 64;
    const ny = 64;
    const size = Math.min(W, H) / (nx + 2);
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        const sx = W / 2 + (gx - nx / 2) * size * 0.9;
        const sy = H / 2 + (gy - ny / 2) * size * 0.55;
        const src = a[Math.floor((gy / ny) * N) * N + Math.floor((gx / nx) * N)];
        let n: number;
        switch (src.phase) {
          case 1:
            n = 200;
            break;
          case 2:
            n = src.lamella ? 100 : 60;
            break;
          case 3:
            n = 220;
            break;
          case 4:
            n = 120;
            break;
          case 5:
            n = 25;
            break;
          default:
            n = 120 + 45 * src.ori;
        }
        ctx.fillStyle = `rgb(${n},${n},${n})`;
        ctx.fillRect(sx - size / 2, sy - size / 2, size * 0.92, size * 0.62);
      }
    }
  }, []);

  // ---- animation loop -----------------------------------------------------
  const stepRef2 = useRef<() => void>(() => {});
  const drawRef2 = useRef<() => void>(() => {});

  useEffect(() => {
    stepRef2.current = () => step2D();
    drawRef2.current = () => (mode3D ? draw3D() : draw2D());
  }, [mode3D, step2D, draw2D, draw3D]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      stepRef2.current();
      drawRef2.current();
    };
    tick();
    const iv = setInterval(tick, 350);
    return () => clearInterval(iv);
  }, [running, step2D, draw2D, draw3D, mode3D]);

  const eqPct =
    plan.boundaryPhase === "ferrite"
      ? `${(plan.boundaryBand * 100).toFixed(0)}% boundary ferrite`
      : plan.boundaryPhase === "cementite"
        ? `${(plan.boundaryBand * 100).toFixed(0)}% cementite network`
        : "single-phase matrix";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:col-span-3">
        <Kpi icon={<Grid3x3 className="h-4 w-4" />} label="Grid" value={mode3D ? "64×64 iso" : "128×128"} sub="16,384 cells" tone="primary" />
        <Kpi icon={<Atom className="h-4 w-4" />} label="Grains" value={String(grainCount)} tone="emerald" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="Regime" value={plan.regime} sub={plan.needles ? "needles form" : "diffusional"} tone="rose" />
        <Kpi icon={<Thermometer className="h-4 w-4" />} label="Cooling T" value={`${tempNow.current.toFixed(0)}°C`} sub={`R = ${s.coolingRateKs.toFixed(1)} K/s`} tone="cyan" />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Stage" value={stage} sub={`step ${stepRef.current}`} tone="amber" />
      </div>

      <div className="xl:col-span-2">
        <Card className="overflow-hidden bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" />
                SEM Microstructure — {sys.label}
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[9px] border-primary/30 text-primary">
                  {sys.primaryPhase}
                </Badge>
                <Badge variant="outline" className="text-[9px] border-rose-500/30 text-rose-400">
                  {sys.secondPhase}
                </Badge>
                <Badge variant="outline" className="text-[9px]">
                  {s.magnification.toLocaleString()}×
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-7 text-xs ${mode3D ? "text-primary" : "text-muted-foreground"}`}
                  onClick={() => setMode3D((v) => !v)}
                >
                  3D View
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-black grid-bg">
              <canvas ref={canvasRef} width={N} height={N} className="h-full w-full" />
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                t = {simTime.current.toFixed(0)} s · T = {tempNow.current.toFixed(0)}°C · {stage}
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-1">
                {plan.boundaryPhase === "ferrite" && (
                  <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-white/90">
                    ● ferrite (bright boundaries)
                  </span>
                )}
                {plan.boundaryPhase === "cementite" && (
                  <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-white">
                    ● cementite (white network)
                  </span>
                )}
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-amber-300">
                  ● pearlite (dark lamellar)
                </span>
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-slate-300">
                  ● martensite needles
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-2">
                <div className="h-1.5 w-14 bg-white/90 shadow" />
                <span className="font-mono text-[10px] text-white drop-shadow">
                  {((36000 / s.magnification) / 2).toPrecision(3)} µm
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => setRunning((r) => !r)}>
                {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {running ? "Pause" : "Run"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
                {fracLabel || "cooling…"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-primary" />
              Cooling Path (from sidebar)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="C %" value={`${comp.C.toFixed(2)} wt%`} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="A₃ / A₁" value={`${plan.A3.toFixed(0)}°C / ${plan.A1}°C`} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Mₛ" value={`${plan.Ms.toFixed(0)}°C`} />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Critical rate" value={`${plan.rcrit.toFixed(1)} K/s`} />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Your rate" value={`${s.coolingRateKs.toFixed(1)} K/s`} accent />
            <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Regime" value={plan.regime} accent />
            <Row icon={<Layers className="h-3.5 w-3.5" />} label="Boundary phase" value={plan.boundaryPhase} />
            <Row icon={<Thermometer className="h-3.5 w-3.5" />} label="Equilibrium" value={eqPct} />
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Deposition order (correct metallurgy)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[10.5px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-mono text-foreground/90">1 · Below A₃/Acm</span> — proeutectoid
              phase deposits IN the boundaries: bright ferrite bands (hypoeutectoid) or a
              white cementite network (hypereutectoid), thickening with hold time.
            </p>
            <p>
              <span className="font-mono text-foreground/90">2 · Below A₁</span> — the remaining
              austenite transforms to dark lamellar PEARLITE colonies growing from the
              transformed boundaries inward.
            </p>
            <p>
              <span className="font-mono text-foreground/90">Fast quench</span> — when your rate
              exceeds the critical rate the diffusion phases are skipped: martensite
              needles slice across the grains below Mₛ.
            </p>
            <p>
              <span className="font-mono text-foreground/90">Al alloys</span> — precipitates
              nucleate at boundaries then in the matrix during ageing, and dissolve
              above the solvus.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`font-mono ${accent ? "font-semibold text-primary" : "text-foreground/90"}`}>
        {value}
      </span>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "emerald" | "rose" | "cyan" | "amber";
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 text-primary",
    emerald: "border-emerald-500/30 text-emerald-400",
    rose: "border-rose-500/30 text-rose-400",
    cyan: "border-cyan-500/30 text-cyan-400",
    amber: "border-amber-500/30 text-amber-400",
  };
  return (
    <Card className={`bg-card/60 backdrop-blur ${tones[tone]}`}>
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className={tones[tone]}>{icon}</span>
        </div>
        <div className="mt-1.5 font-mono text-lg font-semibold text-foreground">{value}</div>
        {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
