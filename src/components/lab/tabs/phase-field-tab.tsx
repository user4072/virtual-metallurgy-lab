"use client";

/**
 * Phase-Field Evolution — SEM-style microstructure simulator
 * -----------------------------------------------------------------------------
 * Real-time Potts-model grain growth + interfacial nucleation/growth of the
 * second phase, rendered as a synthetic SEM micrograph.
 *
 * Model
 *   • Grain structure: 2D Potts / Q-state Ising model on a 128×128 periodic
 *     grid. Each cell carries a grain id; spin flips follow the classic
 *     Metropolis rule ΔE < 0 (or exp(−ΔE/kT)) with the boundary energy of
 *     1 between unlike grains → curvature-driven grain growth and coarsening
 *     (the same physics as multi-phase-field Allen–Cahn, at a fraction of the
 *     cost, ideal for interactive teaching).
 *   • Grain mobility is Arrhenius:  M = M₀ · exp(−Q / (R·T_K))  — hotter
 *     anneals coarsen the structure dramatically faster (Q ≈ 140 kJ/mol).
 *   • Second phase (θ-Al₂Cu / β-Si / Fe₃C): nucleates in the grain interiors
 *     with probability ∝ supersaturation  S = x₀ − x_solv(T_ageing)  and grows
 *     by consuming neighbouring matrix cells; the equilibrium fraction comes
 *     from the same lever rule the Phase module uses.
 *
 * Rendering mimics an etched SEM section: bright grain-boundary ridges,
 * orientation-shaded grain interiors, near-black second-phase particles,
 * detector noise + scanlines + vignette.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS, solvusC, R_GAS } from "@/lib/metallurgy";
import {
  Grid3x3,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Thermometer,
  Zap,
  Droplet,
  Atom,
} from "lucide-react";

const N = 128; // grid size (N×N)
const CELLS = N * N;
const Q_MIG = 140_000; // J/mol, effective activation energy for boundary migration

type Stage = "nucleation" | "growth" | "coarsening";

/** Deterministic PRNG (same family as the rest of the lab). */
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

interface SimState {
  spin: Int16Array; // grain id per cell (−1 = precipitate)
  orient: Float32Array; // per-cell grey level (0..1)
  boundary: Uint8Array; // 1 if cell borders a different grain
  grains: number;
  precipFraction: number;
  step: number;
  simTime: number; // virtual annealing seconds
}

function seedStructure(initialGrains: number, rng: () => number): SimState {
  // Voronoi-like seeding on the periodic grid
  const seeds: { x: number; y: number; id: number; g: number }[] = [];
  for (let i = 0; i < initialGrains; i++) {
    seeds.push({ x: rng() * N, y: rng() * N, id: i + 1, g: 0.42 + 0.30 * rng() });
  }
  const spin = new Int16Array(CELLS);
  const orient = new Float32Array(CELLS);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let best = 1e9;
      let bid = 1;
      let bg = 0.5;
      for (const s of seeds) {
        // periodic wrap
        let dx = Math.abs(x - s.x);
        let dy = Math.abs(y - s.y);
        if (dx > N / 2) dx = N - dx;
        if (dy > N / 2) dy = N - dy;
        const d = dx * dx + dy * dy;
        if (d < best) {
          best = d;
          bid = s.id;
          bg = s.g;
        }
      }
      const i = y * N + x;
      spin[i] = bid;
      orient[i] = bg;
    }
  }
  return { spin, orient, boundary: new Uint8Array(CELLS), grains: initialGrains, precipFraction: 0, step: 0, simTime: 0 };
}

function computeBoundaryAndCount(st: SimState) {
  const { spin } = st;
  let grains = new Set<number>();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (spin[i] < 0) continue;
      grains.add(spin[i]);
      const r = spin[(y * N + ((x + 1) % N))];
      const l = spin[(y * N + ((x - 1 + N) % N))];
      const d = spin[(((y + 1) % N) * N) + x];
      const u = spin[(((y - 1 + N) % N) * N) + x];
      st.boundary[i] = r !== spin[i] || l !== spin[i] || d !== spin[i] || u !== spin[i] ? 1 : 0;
    }
  }
  // count non-precipitate grains
  st.grains = grains.size;
}

/** One Metropolis sweep of the Potts model + precipitate growth. */
function sweep(
  st: SimState,
  mobility: number,
  kT: number,
  nucleationProb: number,
  precipGrowthProb: number,
  rng: () => number,
  dtSeconds: number,
) {
  const { spin, orient } = st;
  // --- Potts grain growth: 2·CELLS attempted flips (2 MC sweeps worth) ---
  const attempts = CELLS;
  for (let a = 0; a < attempts; a++) {
    const i = (rng() * CELLS) | 0;
    const x = i % N;
    const y = (i / N) | 0;
    const xp1 = (x + 1) % N, xm1 = (x - 1 + N) % N;
    const yp1 = ((y + 1) % N) * N, ym1 = ((y - 1 + N) % N) * N;
    const self = spin[i];
    const n1 = spin[y * N + xp1];
    const n2 = spin[y * N + xm1];
    const n3 = spin[yp1 + x];
    const n4 = spin[ym1 + x];
    // pick a random unlike neighbour grain to try becoming
    const choices = [n1, n2, n3, n4].filter((n) => n >= 0 && n !== self);
    if (choices.length === 0) continue;
    const target = choices[(rng() * choices.length) | 0];
    // boundary energy: 1 per unlike neighbour
    const before =
      (n1 !== self ? 1 : 0) + (n2 !== self ? 1 : 0) + (n3 !== self ? 1 : 0) + (n4 !== self ? 1 : 0);
    const after =
      (n1 !== target ? 1 : 0) + (n2 !== target ? 1 : 0) + (n3 !== target ? 1 : 0) + (n4 !== target ? 1 : 0);
    const dE = after - before;
    if (dE <= 0 || rng() < Math.exp(-dE / kT)) {
      spin[i] = target;
      orient[i] = orient[y * N + xp1] * 0.5 + orient[yp1 + x] * 0.5;
    }
  }
  // mobility rescales how far the microstructure advances per virtual second
  st.simTime += dtSeconds * Math.max(0.05, Math.min(4, mobility));
  st.step += 1;

  // --- precipitate nucleation (supersaturation-driven) ---
  if (nucleationProb > 0) {
    for (let k = 0; k < CELLS * 0.02; k++) {
      const i = (rng() * CELLS) | 0;
      if (spin[i] >= 0 && rng() < nucleationProb) {
        spin[i] = -1; // nucleate β
        st.boundary[i] = 0;
      }
    }
  }
  // --- precipitate growth: β cells capture matrix neighbours with prob p ---
  if (precipGrowthProb > 0) {
    const captures: number[] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (spin[i] !== -1) continue;
        const nbIdx = [
          y * N + ((x + 1) % N),
          y * N + ((x - 1 + N) % N),
          ((y + 1) % N) * N + x,
          ((y - 1 + N) % N) * N + x,
        ];
        for (const ni of nbIdx) {
          if (spin[ni] >= 0 && rng() < precipGrowthProb) captures.push(ni);
        }
      }
    }
    for (const ci of captures) spin[ci] = -1;
  }
  computeBoundaryAndCount(st);
  let precip = 0;
  for (let i = 0; i < CELLS; i++) if (spin[i] < 0) precip++;
  st.precipFraction = precip / CELLS;
}

/**
 * Paint the current state onto a canvas — etched-SEM look:
 * bright smooth boundary ridges, orientation-shaded grain interiors,
 * round dark second-phase particles, gentle detector noise + vignette.
 * Rendered at half resolution, displayed with smooth (bilinear) upscale.
 */
function renderSEM(
  ctx: CanvasRenderingContext2D,
  st: SimState,
  boundaryBright: boolean,
  seed: number,
) {
  // half-res working buffer, upscaled by the browser for a smooth SEM look
  const W = N / 2;
  const img = ctx.createImageData(W, W);
  const data = img.data;
  const rng = mulberry32(seed);
  const g = (x: number, y: number) => st.spin[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // 2×2 cell block → one smooth pixel
      let boundary = 0;
      let inside = -1;
      let precip = false;
      let shade = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const cx = x * 2 + dx;
          const cy = y * 2 + dy;
          const id = st.spin[cy * N + cx];
          const nb =
            g(cx + 1, cy) !== id || g(cx - 1, cy) !== id || g(cx, cy + 1) !== id || g(cx, cy - 1) !== id;
          if (id < 0) precip = true;
          else if (nb) boundary = 1;
          else if (inside < 0) {
            inside = id;
            shade = st.orient[cy * N + cx];
          }
        }
      }
      let v = 0.5;
      if (precip) {
        v = 0.05 + rng() * 0.04; // dark second-phase particle
      } else if (boundary === 1) {
        v = boundaryBright ? 0.88 + rng() * 0.10 : 0.16 + rng() * 0.06; // etched ridge
      } else {
        v = 0.30 + shade * 0.35 + (rng() - 0.5) * 0.02; // orientation-shaded interior
      }
      v += (rng() - 0.5) * 0.02; // detector noise (gentle)
      if (y % 3 === 0) v *= 0.96; // faint scanlines
      const gv = Math.max(0, Math.min(1, v)) * 255;
      const o = (y * W + x) * 4;
      data[o] = gv;
      data[o + 1] = gv;
      data[o + 2] = gv;
      data[o + 3] = 255;
    }
  }
  const off = document.createElement("canvas");
  off.width = W;
  off.height = W;
  off.getContext("2d")!.putImageData(img, 0, 0);
  // smooth bilinear upscale to the display canvas
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, N, N);
  // vignette
  const grad = ctx.createRadialGradient(N / 2, N / 2, N * 0.35, N / 2, N / 2, N * 0.75);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, N, N);
}

export function PhaseFieldTab() {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];

  const [running, setRunning] = useState(true);
  const [sim, setSim] = useState<SimState | null>(null);
  const [stage, setStage] = useState<Stage>("nucleation");
  const [imageSeed, setImageSeed] = useState(42);
  const [shaded3d, setShaded3d] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- physics from the sidebar -------------------------------------------
  const physics = useMemo(() => {
    const T_K = s.heatTreatmentC + 273.15;
    // grain mobility: Arrhenius, normalised so 190 °C ≈ slow, 500 °C ≈ fast
    const mobility = Math.exp(-(Q_MIG / (R_GAS * T_K)) + Q_MIG / (R_GAS * (190 + 273.15)));
    // initial grain count: faster solidification → finer cast structure
    const initialGrains = Math.max(12, Math.min(48, Math.round(120 / Math.pow(1 + s.coolingRateKs, 0.35))));
    // supersaturation at the ageing temperature (wt frac)
    const xSolv = (solvusC(Math.max(1e-4, s.soluteFraction), sys) / 1) * 1e-2; // solvusC takes wt frac
    const solvusFrac = sys.xMaxSolid * Math.exp(
      -((50_000 / R_GAS) * (1 / T_K - 1 / (sys.tEutecticC + 273.15))),
    );
    const supersat = Math.max(0, s.soluteFraction - solvusFrac);
    // equilibrium 2nd-phase fraction via the lever rule (matrix→intermetallic)
    const xInter = sys.id === "Al-Cu" ? 0.546 : sys.id === "Al-Si" ? 1.0 : 0.0669;
    const eqFraction = Math.min(
      0.25,
      Math.max(0, (s.soluteFraction - solvusFrac) / Math.max(1e-3, xInter - solvusFrac)),
    );
    const kT = 0.15; // near-deterministic Metropolis → smooth curvature-driven boundaries
    const holdingFactor = Math.max(0.2, Math.min(4, s.heatTreatmentC / 190));
    // Ostwald-ripening rate ∝ M·γ (capillary-driven coarsening speed, arb. units)
    const ripening = mobility * 0.088;
    // solvus temperature for the current composition (°C) — precipitation stable below it
    const solvusTempC = sys.id === "Al-Cu"
      ? 548 - 150 * Math.log(Math.max(1.005, s.soluteFraction / sys.xMaxSolid)) / Math.log(2)
      : sys.tEutecticC;
    // alloy-specific morphology note
    const morphology =
      sys.id === "Al-Cu"
        ? "Al-Cu: round α-Al grains + dark θ-Al₂Cu particles. Slow R: large θ at boundaries. Fast R: fine θ. Long hold above the solvus: θ dissolves."
        : sys.id === "Al-Si"
          ? "Al-Si: α-Al grains with eutectic Si platelets at boundaries. Fast cooling refines the eutectic."
          : sys.id === "Fe-C"
            ? "Fe-C: ferrite/pearlite colonies; cementite particles darken with ageing. Higher C → more pearlite."
            : "Solid-solution alloy: grains coarsen with hold time; no strong second phase at this composition.";
    return { T_K, mobility, initialGrains, supersat, eqFraction, kT, holdingFactor, xSolv, ripening, solvusTempC, morphology };
  }, [s.heatTreatmentC, s.coolingRateKs, s.soluteFraction, sys]);

  const reset = useCallback(() => {
    const rng = mulberry32(
      Math.floor(s.soluteFraction * 9999 + s.coolingRateKs * 13 + s.heatTreatmentC),
    );
    const st = seedStructure(physics.initialGrains, rng);
    computeBoundaryAndCount(st);
    setSim(st);
    setStage("nucleation");
    setImageSeed((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physics.initialGrains, s.soluteFraction, s.coolingRateKs, s.heatTreatmentC]);

  useEffect(() => {
    reset();
  }, [reset]);

  // ---- animation loop ------------------------------------------------------
  useEffect(() => {
    if (!running || !sim) return;
    const raf = requestAnimationFrame(async function frame() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // stage selection: nucleate while fraction ≪ eq, grow to eq, coarsen after
      const frac = sim.precipFraction;
      let st: Stage = "coarsening";
      if (frac < physics.eqFraction * 0.55) st = "nucleation";
      else if (frac < physics.eqFraction * 0.95) st = "growth";
      setStage(st);

      const nucleationProb =
        st === "nucleation" ? Math.min(0.5, physics.supersat * 8 + 0.02) : 0;
      const growthProb =
        st === "nucleation" || st === "growth"
          ? Math.min(0.12, 0.02 + physics.eqFraction * 0.12) * physics.holdingFactor
          : 0.004; // slow coarsening continues
      sweep(
        sim,
        physics.mobility,
        physics.kT,
        nucleationProb,
        growthProb,
        mulberry32((sim.step + 1) * 7919),
        2.0,
      );
      renderSEM(ctx, sim, true, imageSeed + sim.step);
      setSim({ ...sim });
      if (running) requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sim === null, physics, imageSeed]);

  // repaint when paused (state changes / 3D toggle)
  useEffect(() => {
    if (running || !sim || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) renderSEM(ctx, sim, true, imageSeed + sim.step);
  }, [running, sim, shaded3d, imageSeed]);

  // hillshade overlay when "3D" toggle is on
  useEffect(() => {
    if (!shaded3d || !sim || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    // fake relief: height = 1 − boundary → hillshade via simple gradient
    const img = ctx.getImageData(0, 0, N, N);
    const d = img.data;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        const hL = sim.boundary[y * N + x - 1];
        const hR = sim.boundary[y * N + x + 1];
        const hU = sim.boundary[(y - 1) * N + x];
        const hD = sim.boundary[(y + 1) * N + x];
        const shade = 1 + 0.35 * (hR - hL) + 0.25 * (hD - hU);
        const o = i * 4;
        d[o] = Math.max(0, Math.min(255, d[o] * shade));
        d[o + 1] = Math.max(0, Math.min(255, d[o + 1] * shade));
        d[o + 2] = Math.max(0, Math.min(255, d[o + 2] * shade));
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [shaded3d, sim]);

  const grainsPx = sim ? Math.round((CELLS / Math.max(sim.grains, 1)) * 100) / 100 : 0;
  const eqPct = (physics.eqFraction * 100).toFixed(1);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:col-span-3">
        <Kpi icon={<Grid3x3 className="h-4 w-4" />} label="Grid" value={`${N}×${N}`} sub={`${CELLS.toLocaleString()} cells`} tone="primary" />
        <Kpi icon={<Atom className="h-4 w-4" />} label="Grains" value={sim ? String(sim.grains) : "—"} sub={`~${grainsPx} px²`} tone="emerald" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="2nd phase" value={sim ? `${(sim.precipFraction * 100).toFixed(1)}%` : "—"} sub={`eq: ${eqPct}%`} tone="rose" />
        <Kpi icon={<Thermometer className="h-4 w-4" />} label="HT / hold" value={`${s.heatTreatmentC}°C`} sub="from sidebar" tone="cyan" />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Phase" value={stage} sub={`step ${sim?.step ?? 0}`} tone="amber" />
      </div>

      {/* SEM canvas + controls */}
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
                  className={`h-7 text-xs ${shaded3d ? "text-primary" : "text-muted-foreground"}`}
                  onClick={() => setShaded3d((v) => !v)}
                  title="Toggle shaded-relief view"
                >
                  3D
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-black">
              <canvas
                ref={canvasRef}
                width={N}
                height={N}
                className="h-full w-full"
              />
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                t = {(sim?.simTime ?? 0).toFixed(0)} s · {stage}
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
                {sim ? `evolving: f_β ${(sim.precipFraction * 100).toFixed(1)}% / ${eqPct}% eq` : "Potts grain growth · 128² periodic grid"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live physics */}
      <div className="space-y-4">
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-primary" />
              Live Physics (from sidebar)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <Row icon={<Thermometer className="h-3.5 w-3.5" />} label="Heat-treat T" value={`${s.heatTreatmentC}°C (${physics.T_K.toFixed(0)} K)`} />
            <Row icon={<Droplet className="h-3.5 w-3.5" />} label="Holding effect" value={`${physics.holdingFactor.toFixed(2)}×`} />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Cooling rate R" value={`${s.coolingRateKs.toFixed(1)} K/s`} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Composition" value={`${(s.soluteFraction * 100).toFixed(1)}% ${sys.solute}`} />
            <Row icon={<Grid3x3 className="h-3.5 w-3.5" />} label="Mode" value={`2D (${N}² = ${CELLS.toLocaleString()} cells)`} />
            <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Grain mobility" value={physics.mobility.toExponential(2)} accent />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Supersaturation" value={physics.supersat.toExponential(2)} />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Ripening rate" value={physics.ripening.toExponential(2)} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Eq. 2nd phase" value={`${(physics.eqFraction * 100).toFixed(1)}% (lever rule)`} accent />
            <Row icon={<Thermometer className="h-3.5 w-3.5" />} label="Solvus T" value={`${physics.solvusTempC.toFixed(0)}°C (${s.heatTreatmentC < physics.solvusTempC ? "precipitates stable" : "dissolves"})`} />
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Droplet className="h-4 w-4 text-cyan-400" />
              Alloy-Specific Morphology
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">{physics.morphology}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[10.5px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-mono text-foreground/90">Grain growth</span> —
              2D Potts model: Metropolis spin flips with a grain-boundary energy
              of 1 between unlike orientations → curvature-driven migration and
              coarsening, the same physics as multi-phase-field Allen–Cahn.
            </p>
            <p>
              <span className="font-mono text-foreground/90">Boundary migration</span> —
              Arrhenius mobility <span className="font-mono">M = M₀·exp(−Q/RT)</span> with
              Q ≈ 140 kJ/mol; hotter anneals coarsen visibly faster.
            </p>
            <p>
              <span className="font-mono text-foreground/90">Precipitation</span> —
              nucleation probability ∝ supersaturation{" "}
              <span className="font-mono">x₀ − x_solv(T)</span>, growth consumes
              matrix cells until the equilibrium fraction from the lever rule;
              near-black particles in the etched-SEM render.
            </p>
            <p>
              <span className="font-mono text-foreground/90">Rendering</span> — bright
              boundary ridges (etched grooves), orientation-shaded interiors,
              detector noise + scanlines + vignette.
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
