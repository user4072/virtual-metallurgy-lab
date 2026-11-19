"use client";

/**
 * Phase-Field Evolution — multi-phase cellular automaton (faithful port of the
 * deployed version).
 * -----------------------------------------------------------------------------
 * 128×128 cells {grainId, phase, ori, lamella} with periodic boundaries:
 *
 *  • Grain structure: Voronoi seeding; initial grain count driven by the
 *    cooling rate (faster solidification → finer cast structure).
 *  • Grain coarsening: curvature-driven — matrix cells with ≤2 same-grain
 *    neighbours of 8 may adopt a different neighbour grain (mobility D is
 *    Arrhenius: D = D₀·exp(−Q/RT)).
 *  • Second phase (θ-Al₂Cu / β-Si / cementite): nucleates preferentially AT
 *    grain boundaries during the hold, grows from interfaces into the matrix
 *    (supersaturation-driven), and DISSOLVES back above the solvus once the
 *    equilibrium fraction is reached. Fe-C pearlite renders as dark lamellar
 *    stripes; boundary carbides form their own dark network.
 *  • Rendering: etched-SEM grayscale — orientation-shaded matrix, bright
 *    boundary ridges (+55), per-phase contrast, detector noise. 3D mode
 *    renders a 24³ voxel isometric view of the same automaton.
 *
 * Physics: equilibrium 2nd-phase fraction B via the lever rule; stage label
 * nucleation → growth → coarsening → equilibrium; slow physical evolution
 * (0.5 sim-seconds per step).
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS, R_GAS } from "@/lib/metallurgy";
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
  Box,
} from "lucide-react";

const N = 128; // 2D grid
const CELLS = N * N;
const N3 = 24; // 3D voxel grid (24³ = 13,824)
const Q_MIG = 140_000; // J/mol boundary-migration activation energy

type Stage = "nucleation" | "growth" | "coarsening" | "equilibrium";

interface Cell2D {
  grainId: number;
  phase: number; // 0 matrix, 1 θ-Al₂Cu, 2 β-Si, 3 martensite-bright, 4 pearlite/ferrite-boundary, 5 bainite
  ori: number; // orientation shade 0..1
  lamella: number; // pearlite lamellar stripe flag
}

interface Cell3D {
  grainId: number;
  phase: number;
  grey: number;
}

interface Grain2D {
  x: number;
  y: number;
  ori: number;
}
interface Grain3D {
  x: number;
  y: number;
  z: number;
  grey: number;
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
  const field3D = useRef<Cell3D[]>([]);
  const grains2D = useRef<Grain2D[]>([]);
  const grains3D = useRef<Grain3D[]>([]);
  const simTime = useRef(0);
  const stepRef = useRef(0);
  const [grainCount, setGrainCount] = useState(0);

  const [mode3D, setMode3D] = useState(false);
  const [running, setRunning] = useState(true);
  const [stage, setStage] = useState<Stage>("nucleation");
  const [frac, setFrac] = useState(0);

  // ---- physics from the sidebar -------------------------------------------
  const physics = useMemo(() => {
    const T_K = s.heatTreatmentC + 273.15;
    const holding = s.holdingTimeHours;
    const isFeC = s.alloySystem === "Fe-C";
    // equilibrium 2nd-phase fraction B (lever rule, alloy-specific)
    const B = isFeC
      ? Math.min(0.2, Math.max(0, (s.soluteFraction - 8e-4) / 0.0069))
      : Math.min(0.55, 0.3 * s.soluteFraction + 0.3 * (s.soluteFraction2 || 0));
    // precipitation applies to binary systems with a 2nd phase
    const F = sys.id !== "Ni-Cr-Co";
    // grain boundary mobility (Arrhenius) — ~1e-20 class at 190 °C
    const mobility = 1e-4 * Math.exp(-Q_MIG / (R_GAS * T_K));
    // dissolution driving force above the solvus (with hold time)
    const z =
      s.heatTreatmentC > 100 && holding > 0
        ? 10 * Math.exp(-20_000 / (8.314 * T_K)) * (1 + 0.3 * holding)
        : 0;
    // initial grain count from cooling rate
    const G = Math.round(10 + 4 * Math.pow(Math.max(s.coolingRateKs, 0.1), 0.7));
    // Fe-C driving force (supersaturation × undercooling vs liquidus)
    const liquidusC =
      sys.tMeltSolventC - (sys.tMeltSolventC - sys.tEutecticC) * (s.soluteFraction / sys.xEutectic);
    const undercooling = Math.max(0, liquidusC - s.temperatureC);
    const driving = isFeC ? Math.max(0, s.soluteFraction * undercooling * 0.001) : 0;
    // ripening rate ∝ M·γ (display units)
    const ripening = mobility * 8.8e18;
    // alloy-specific morphology note
    const morphology =
      sys.id === "Al-Cu"
        ? "Al-Cu: round α-Al grains + dark θ-Al₂Cu particles. Slow R: large θ at boundaries. Fast R: fine θ. Long hold at T > solvus: θ dissolves."
        : sys.id === "Al-Si"
          ? "Al-Si: α-Al grains with eutectic Si platelets at boundaries. Fast cooling refines the eutectic."
          : sys.id === "Fe-C"
            ? "Fe-C: ferrite with pearlite (dark lamellar stripes) at boundaries. High hold + high C → martensite-like contrast; ageing → carbide network."
            : "Solid-solution alloy: grains coarsen with hold time; no strong second phase at this composition.";
    return { T_K, holding, isFeC, B, F, mobility, z, G, driving, ripening, morphology, liquidusC };
  }, [s.heatTreatmentC, s.holdingTimeHours, s.coolingRateKs, s.soluteFraction, s.soluteFraction2, s.temperatureC, sys]);

  const rngRef = useRef(mulberry32(12345));

  // ---- 2D reset: Voronoi seeds + per-alloy reset-time phase seeding --------
  const reset2D = useCallback(() => {
    const rng = rngRef.current;
    const cells: Cell2D[] = new Array(CELLS);
    const grains: Grain2D[] = [];
    const count = Math.min(100, Math.max(8, physics.G));
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
    // hold-time grain elimination (coarsening): smallest grains absorbed
    if (physics.holding > 0 && s.heatTreatmentC > 0.5 * sys.tEutecticC) {
      const target = Math.floor(
        count * Math.min(0.7, 0.05 * physics.holding * Math.exp(-20_000 / (8.314 * physics.T_K)) * 1e5),
      );
      for (let n = 0; n < target; n++) {
        const counts = new Array(grains.length).fill(0);
        for (const c of cells) counts[c.grainId]++;
        const smallest = counts.indexOf(Math.min(...counts));
        if (counts[smallest] < 1) break;
        const into = smallest === 0 ? 1 : 0;
        for (const c of cells) {
          if (c.grainId === smallest) {
            c.grainId = into;
            c.ori = grains[into].ori;
          }
        }
      }
    }
    // reset-time phase seeding per alloy
    const rate = Math.min(3, Math.max(0.5, s.coolingRateKs / 10));
    const lam = Math.min(3, 1 + 0.2 * physics.holding);
    if (s.alloySystem === "Al-Cu") {
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          if (cells[i].phase !== 0) continue;
          const id = cells[i].grainId;
          const boundary =
            cells[y * N + x + 1].grainId !== id ||
            cells[y * N + x - 1].grainId !== id ||
            cells[(y + 1) * N + x].grainId !== id ||
            cells[(y - 1) * N + x].grainId !== id;
          const p =
            stepRef.current < 5
              ? boundary
                ? 0.4 * rate * lam
                : 0
              : stepRef.current < 30
                ? boundary
                  ? 0.2 * rate
                  : 0.08 * rate
                : boundary
                  ? 0
                  : 0.15 * rate;
          if (rng() < p) {
            cells[i].phase = 1;
            cells[i].ori = 0.1;
          }
        }
      }
    } else if (s.alloySystem === "Al-Si") {
      const quench = s.coolingRateKs > 2 && s.temperatureC > 500;
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          if (cells[i].phase !== 0) continue;
          const id = cells[i].grainId;
          const boundary =
            cells[y * N + x + 1].grainId !== id ||
            cells[y * N + x - 1].grainId !== id ||
            cells[(y + 1) * N + x].grainId !== id ||
            cells[(y - 1) * N + x].grainId !== id;
          if (quench) {
            if (rng() < 0.08 * rate) {
              cells[i].phase = 2;
              cells[i].ori = 0.1;
            }
          } else if (stepRef.current < 3) {
            if (boundary && rng() < 0.5 * rate) {
              cells[i].phase = 2;
              cells[i].ori = 0.08;
            }
          } else if (rng() < 0.1 * rate) {
            cells[i].phase = 2;
            cells[i].ori = 0.1;
          }
        }
      }
    } else if (s.alloySystem === "Fe-C") {
      if (physics.holding > 100 && s.soluteFraction > 0.003) {
        for (const c of cells) {
          if (rng() < 0.4 * rate) {
            c.phase = 3;
            c.ori = 0.65;
          }
        }
      } else if (physics.holding > 30) {
        for (const c of cells) {
          if (rng() < 0.2 * rate) {
            c.phase = 5;
            c.ori = 0.15;
          }
        }
      } else {
        for (let y = 1; y < N - 1; y++) {
          for (let x = 1; x < N - 1; x++) {
            const i = y * N + x;
            const id = cells[i].grainId;
            const boundary =
              cells[y * N + x + 1].grainId !== id ||
              cells[y * N + x - 1].grainId !== id ||
              cells[(y + 1) * N + x].grainId !== id ||
              cells[(y - 1) * N + x].grainId !== id;
            if (boundary && rng() < 0.6 * rate) {
              cells[i].phase = 4;
              cells[i].ori = 0.2;
              cells[i].lamella = (x + y) % 4 < 2 ? 1 : 0;
            }
          }
        }
      }
    }
    field2D.current = cells;
    const ids = new Set<number>();
    for (const c of cells) if (c.phase === 0) ids.add(c.grainId);
    setGrainCount(ids.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physics, s.alloySystem, s.heatTreatmentC, s.temperatureC]);

  // ---- 3D reset: 24³ voxels ------------------------------------------------
  const reset3D = useCallback(() => {
    const rng = rngRef.current;
    const cells: Cell3D[] = new Array(N3 * N3 * N3);
    const grains: Grain3D[] = [];
    const count = Math.min(30, Math.max(5, Math.floor(0.3 * physics.G)));
    for (let i = 0; i < count; i++) {
      grains.push({
        x: N3 * rng(),
        y: N3 * rng(),
        z: N3 * rng(),
        grey: Math.round(55 + 110 * rng()),
      });
    }
    grains3D.current = grains;
    const idx = (x: number, y: number, z: number) => N3 * z + N3 * N3 * y + x;
    for (let z = 0; z < N3; z++) {
      for (let y = 0; y < N3; y++) {
        for (let x = 0; x < N3; x++) {
          let best = Infinity;
          let bi = 0;
          for (let e = 0; e < grains.length; e++) {
            const dx = x - grains[e].x;
            const dy = y - grains[e].y;
            const dz = z - grains[e].z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < best) {
              best = d;
              bi = e;
            }
          }
          cells[idx(x, y, z)] = { grainId: bi, phase: 0, grey: grains[bi].grey };
        }
      }
    }
    field3D.current = cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physics]);

  const reset = useCallback(() => {
    simTime.current = 0;
    stepRef.current = 0;
    setStage("nucleation");
    setFrac(0);
    if (mode3D) reset3D();
    else reset2D();
  }, [mode3D, reset2D, reset3D]);

  useEffect(() => {
    reset();
  }, [reset]);

  // ---- 2D step: coarsening + precipitate growth/dissolution ---------------
  const step2D = useCallback(() => {
    const e = field2D.current;
    if (e.length === 0) return;
    const r = e.map((c) => ({ ...c }));
    let precip = 0;
    for (const c of e) if (c.phase >= 1) precip++;
    const i = precip / CELLS;
    simTime.current += 0.5;
    stepRef.current += 1;
    setStage(
      stepRef.current < 100
        ? "nucleation"
        : i < 0.9 * physics.B
          ? "growth"
          : i < 0.95 * physics.B
            ? "coarsening"
            : "equilibrium",
    );
    // curvature-driven grain coarsening (8-neighbour rule)
    const sRate = Math.min(0.4, 50 * physics.mobility * 1e18 * (1 + 0.1 * physics.holding));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        if (r[idx].phase !== 0) continue;
        const id = e[idx].grainId;
        const same: number[] = [];
        const diff: number[] = [];
        const nb = [
          ((y + 1) % N) * N + x,
          ((y - 1 + N) % N) * N + x,
          y * N + ((x + 1) % N),
          y * N + ((x - 1 + N) % N),
          ((y + 1) % N) * N + ((x + 1) % N),
          ((y + 1) % N) * N + ((x - 1 + N) % N),
          ((y - 1 + N) % N) * N + ((x + 1) % N),
          ((y - 1 + N) % N) * N + ((x - 1 + N) % N),
        ];
        for (const n of nb) {
          if (e[n].grainId === id && e[n].phase === 0) same.push(n);
          else if (e[n].phase === 0) diff.push(e[n].grainId);
        }
        if (same.length <= 2 && diff.length > 0 && rngRef.current() < sRate) {
          r[idx].grainId = diff[Math.floor(rngRef.current() * diff.length)];
          r[idx].ori = grains2D.current[r[idx].grainId]?.ori ?? 0.5;
        }
      }
    }
    // precipitate growth from interfaces into the matrix
    if (physics.F && i < physics.B) {
      const p = 0.3 * Math.max(physics.driving, 0.02) * (1 - i / physics.B);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const idx = y * N + x;
          if (r[idx].phase !== 0) continue;
          const nb = [
            ((y + 1) % N) * N + x,
            ((y - 1 + N) % N) * N + x,
            y * N + ((x + 1) % N),
            y * N + ((x - 1 + N) % N),
          ];
          let cnt = 0;
          for (const n of nb) if (e[n].phase >= 1) cnt++;
          if (cnt > 0 && rngRef.current() < cnt * p) {
            const donor = nb.find((n) => e[n].phase >= 1);
            if (donor !== undefined) {
              r[idx].phase = e[donor].phase;
              r[idx].ori = e[donor].ori;
              r[idx].lamella =
                s.alloySystem === "Fe-C" && s.coolingRateKs < 30 ? ((x + y) % 4 < 2 ? 1 : 0) : 0;
            }
          }
        }
      }
    }
    // boundary carbide precipitation (network at boundaries)
    if (physics.driving > 5e-4) {
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const idx = y * N + x;
          if (r[idx].phase !== 0) continue;
          const id = r[idx].grainId;
          const boundary =
            r[y * N + x + 1].grainId !== id ||
            r[y * N + x - 1].grainId !== id ||
            r[(y + 1) * N + x].grainId !== id ||
            r[(y - 1) * N + x].grainId !== id;
          if (boundary && rngRef.current() < 0.2 * physics.driving * (1 - i / physics.B)) {
            const ph = s.alloySystem === "Al-Si" ? 2 : 1;
            r[idx].phase = ph;
            r[idx].ori = 0.1;
          }
        }
      }
    }
    // dissolution above the solvus once near equilibrium
    if (physics.F && physics.z > 1e-4 && i >= 0.7 * physics.B) {
      const dz = 0.2 * physics.z * (1 + 0.1 * physics.holding);
      for (let a = 0; a < CELLS; a++) {
        if (r[a].phase < 1) continue;
        const y = Math.floor(a / N);
        const x = a % N;
        const nb = [
          ((y + 1) % N) * N + x,
          ((y - 1 + N) % N) * N + x,
          y * N + ((x + 1) % N),
          y * N + ((x - 1 + N) % N),
        ];
        let neighbors = 0;
        for (const n of nb) if (r[n].phase >= 1) neighbors++;
        if (neighbors <= 1 && rngRef.current() < dz) {
          r[a].phase = 0;
          r[a].ori = 0.5;
        }
      }
    }
    // non-Fe: gentle random dissolution keeps the field dynamic
    if (!physics.F) {
      for (const c of r) {
        if (c.phase >= 1 && rngRef.current() < 0.08) {
          c.phase = 0;
          c.ori = 0.5;
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
    setFrac(pf / CELLS);
  }, [physics, s.alloySystem, s.coolingRateKs]);

  // ---- 2D render: etched-SEM grayscale -------------------------------------
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
            n = 15 + 10 * Math.random();
            break; // θ-Al₂Cu dark particles
          case 2:
            n = 30 + 15 * Math.random();
            break; // β-Si
          case 3:
            n = 165 + 25 * Math.random();
            break; // martensite-like bright
          case 5:
            n = 45 + 15 * Math.random();
            break; // bainite
          case 4:
            n = o.lamella ? 40 + 10 * Math.random() : 20 + 10 * Math.random();
            break; // pearlite lamellar stripes
          default: {
            n = 55 + 110 * o.ori;
            const id = o.grainId;
            if (
              (y > 0 && a[(y - 1) * N + x].grainId !== id) ||
              (y < N - 1 && a[(y + 1) * N + x].grainId !== id) ||
              (x > 0 && a[y * N + x - 1].grainId !== id) ||
              (x < N - 1 && a[y * N + x + 1].grainId !== id)
            ) {
              n = Math.min(255, n + 55); // bright etched boundary ridge
            }
          }
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

  // ---- 3D step + isometric draw -------------------------------------------
  const step3D = useCallback(() => {
    const e = field3D.current;
    if (e.length === 0) return;
    const t = e.map((c) => ({ ...c }));
    const idx = (x: number, y: number, z: number) => N3 * z + N3 * N3 * y + x;
    let precip = 0;
    for (const c of e) if (c.phase >= 1) precip++;
    const i = precip / (N3 * N3 * N3);
    simTime.current += 0.5;
    const sRate = Math.min(0.3, 30 * physics.mobility * 1e18 * (1 + 0.1 * physics.holding));
    for (let z = 0; z < N3; z++) {
      for (let y = 0; y < N3; y++) {
        for (let x = 0; x < N3; x++) {
          const o = idx(x, y, z);
          if (t[o].phase !== 0) continue;
          const id = e[o].grainId;
          const nb = [
            idx(x < N3 - 1 ? x + 1 : 0, y, z),
            idx(x > 0 ? x - 1 : N3 - 1, y, z),
            idx(x, y < N3 - 1 ? y + 1 : 0, z),
            idx(x, y > 0 ? y - 1 : N3 - 1, z),
            idx(x, y, z < N3 - 1 ? z + 1 : 0),
            idx(x, y, z > 0 ? z - 1 : N3 - 1),
          ];
          let same = 0;
          const diff: number[] = [];
          for (const n of nb) {
            if (e[n].grainId === id && e[n].phase === 0) same++;
            else if (e[n].phase === 0) diff.push(e[n].grainId);
          }
          if (same <= 1 && diff.length > 0 && rngRef.current() < sRate) {
            t[o].grainId = diff[Math.floor(rngRef.current() * diff.length)];
            t[o].grey = grains3D.current[t[o].grainId]?.grey ?? 100;
          }
        }
      }
    }
    field3D.current = t;
    setFrac(i);
  }, [physics]);

  const draw3D = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const a = field3D.current;
    if (a.length === 0) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const size = Math.min(W, H) / (N3 + 4);
    const b = Math.max(2, size * 0.9);
    const cx = W / 2;
    const cy = H / 2 - N3 * size * 0.18;
    const voxels: { x: number; y: number; grey: number; depth: number; phase: number }[] = [];
    for (let z = 0; z < N3; z++) {
      for (let y = 0; y < N3; y++) {
        for (let x = 0; x < N3; x++) {
          const c = a[N3 * z + N3 * N3 * y + x];
          if (c.phase >= 1 || x === 0 || y === N3 - 1 || z === N3 - 1) {
            const sx = cx + (x - y) * size * 0.9;
            const sy = cy + (x + y) * size * 0.45 - (N3 - 1 - z) * size * 0.8;
            voxels.push({
              x: sx,
              y: sy,
              grey: c.phase >= 1 ? (c.phase === 3 ? 170 : c.phase === 1 ? 15 : 45) : c.grey,
              depth: x + y + (N3 - 1 - z),
              phase: c.phase,
            });
          }
        }
      }
    }
    voxels.sort((p, q) => p.depth - q.depth);
    for (const v of voxels) {
      let r = v.grey;
      if (v.phase >= 1) r = Math.round(0.5 * r);
      r = Math.max(0, Math.min(255, r));
      ctx.fillStyle = `rgb(${r},${r},${r})`;
      ctx.fillRect(v.x - b / 2, v.y - b / 2, b, b);
    }
  }, []);

  // ---- animation loop (setTimeout: survives webview RAF throttling) -------
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (mode3D) {
        step3D();
        draw3D();
      } else {
        step2D();
        draw2D();
      }
    };
    tick(); // immediate first frame
    const iv = setInterval(tick, 350); // slow physical evolution (0.5 s/step)
    return () => clearInterval(iv);
  }, [running, mode3D, step2D, draw2D, step3D, draw3D]);

  const eqPct = (physics.B * 100).toFixed(1);
  const grainsPx = Math.round((CELLS / Math.max(grainCount, 1)) * 100) / 100;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:col-span-3">
        <Kpi icon={<Grid3x3 className="h-4 w-4" />} label="Grid" value={mode3D ? "24×24×24" : "128×128"} sub={mode3D ? "13,824 voxels" : "16,384 cells"} tone="primary" />
        <Kpi icon={<Atom className="h-4 w-4" />} label="Grains" value={String(grainCount)} sub={`~${grainsPx} px²`} tone="emerald" />
        <Kpi icon={<Zap className="h-4 w-4" />} label="2nd phase" value={`${(frac * 100).toFixed(1)}%`} sub={`eq: ${eqPct}%`} tone="rose" />
        <Kpi icon={<Thermometer className="h-4 w-4" />} label="HT / hold" value={`${s.heatTreatmentC}°C`} sub={`${s.holdingTimeHours} hr`} tone="cyan" />
        <Kpi icon={<Sparkles className="h-4 w-4" />} label="Phase" value={stage} sub={`step ${stepRef.current}`} tone="amber" />
      </div>

      {/* canvas */}
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
                  <Box className="h-3.5 w-3.5" /> 3D View
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border/60 bg-black grid-bg">
              <canvas ref={canvasRef} width={N} height={N} className="h-full w-full" />
              <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                t = {simTime.current.toFixed(0)} s · {stage}
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-1">
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-emerald-400">
                  ● {sys.primaryPhase}
                </span>
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-rose-400">
                  ● {sys.secondPhase}
                </span>
                <span className="rounded bg-black/70 px-2 py-0.5 font-mono text-[9px] text-white/80">
                  ● boundary
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
                {`evolving: f_β ${(frac * 100).toFixed(1)}% / ${eqPct}% eq`}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* live physics */}
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
            <Row icon={<Droplet className="h-3.5 w-3.5" />} label="Holding time" value={`${s.holdingTimeHours} hr`} />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Cooling rate R" value={`${s.coolingRateKs.toFixed(1)} K/s`} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Composition" value={`${(s.soluteFraction * 100).toFixed(1)}% ${sys.solute}`} />
            <Row icon={<Grid3x3 className="h-3.5 w-3.5" />} label="Mode" value={mode3D ? "3D (24³ = 13,824 voxels)" : "2D (128² = 16,384 cells)"} />
            <Row icon={<Sparkles className="h-3.5 w-3.5" />} label="Grain mobility" value={physics.mobility.toExponential(2)} accent />
            <Row icon={<Zap className="h-3.5 w-3.5" />} label="Ripening rate" value={physics.ripening.toExponential(2)} />
            <Row icon={<Atom className="h-3.5 w-3.5" />} label="Eq. 2nd phase" value={`${eqPct}% (lever rule)`} accent />
            <Row icon={<Thermometer className="h-3.5 w-3.5" />} label="Solvus T" value={`${sys.tEutecticC}°C (${s.heatTreatmentC < sys.tEutecticC ? "precipitates stable" : "dissolves"})`} />
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
            <div className="mt-2 border-t border-border/40 pt-2 text-[10px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-foreground/90">2D simulation:</span>
              <br />↑ HT T: faster grain growth (Arrhenius)
              <br />↑ Hold time: coarser grains, larger precipitates
              <br />↑ Cooling R: more initial grains (finer)
              <br />↑ Composition: more 2nd phase (lever rule)
              <br />↑ T above solvus: precipitates dissolve
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[10.5px] leading-relaxed text-muted-foreground">
            <p>
              <span className="font-mono text-foreground/90">Grain structure</span> — Voronoi
              seeding; curvature-driven coarsening: matrix cells with ≤2 same-grain
              neighbours may adopt a different neighbour grain (Potts-like, Arrhenius
              mobility).
            </p>
            <p>
              <span className="font-mono text-foreground/90">Second phase</span> — nucleates
              at grain boundaries during the hold, grows from interfaces into the matrix
              (supersaturation-driven), dissolves above the solvus near equilibrium.
              Fe-C pearlite renders as dark lamellar stripes.
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
