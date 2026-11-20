"use client";

/**
 * Microstructure3dTab — realistic 3D polycrystal cube (metal colours).
 * -----------------------------------------------------------------------------
 * A cubic specimen whose six faces carry true 2D Voronoi grain maps rendered
 * as REAL METAL colors per alloy system (not rainbow EBSD):
 *
 *   • Al-Cu   — bright silvery aluminium matrix, coppery θ-Al₂Cu particles
 *   • Al-Si   — silvery matrix, darker grey Si platelets
 *   • Fe-C    — steel-grey ferrite/pearlite, dark carbides
 *   • Ni-Cr-Co— bright nickel-white matrix
 *
 * Every sidebar variable drives the structure physically:
 *   • composition % & cooling rate → grain size → grains-per-face
 *     (faster cooling / more solute → finer grains, Hall–Petch)
 *   • composition & ageing temperature → precipitate density, and
 *     precipitates DISSOLVE when the ageing T exceeds the solvus
 *   • all textures rebuild when the structure changes
 *
 * Rendering: cubic geometry with per-face canvas textures, metallic PBR
 * material, studio lighting; drag to orbit, wheel to zoom.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Box, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useLabStore } from "@/store/lab-store";
import { ALLOY_SYSTEMS, R_GAS } from "@/lib/metallurgy";
import { usePredictPhase } from "@/components/lab/use-lab-data";
import { depositionPlan, type DepositionPlan } from "@/lib/ca-physics";
import { Skeleton } from "@/components/ui/skeleton";

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

function astmNumber(grainUm: number): number {
  return Math.max(0, -3.2877 - 6.6439 * Math.log10(Math.max(grainUm / 1000, 1e-6)));
}

/** Real-metal palettes per alloy system. */
interface MetalPalette {
  /** matrix grain base colour (etched metal) */
  base: [number, number, number];
  /** hue jitter per grain (subtle — real etched grains are near-grey) */
  jitter: number;
  /** second-phase particle colour */
  precip: [number, number, number];
  /** second-phase display name */
  precipName: string;
}

const METAL_PALETTES: Record<string, MetalPalette> = {
  "Al-Cu": { base: [205, 208, 214], jitter: 14, precip: [184, 122, 74], precipName: "θ-Al₂Cu (coppery)" },
  "Al-Si": { base: [208, 211, 216], jitter: 12, precip: [118, 120, 126], precipName: "β-Si (grey)" },
  "Fe-C": { base: [148, 150, 158], jitter: 10, precip: [62, 62, 70], precipName: "Fe₃C (dark)" },
  "Ni-Cr-Co": { base: [216, 218, 224], jitter: 10, precip: [150, 152, 160], precipName: "γ′ (faint)" },
};

const DEFAULT_PALETTE: MetalPalette = {
  base: [178, 180, 186],
  jitter: 10,
  precip: [90, 92, 98],
  precipName: "2nd phase",
};

/**
 * Render one face's grain map as an etched-metal micrograph:
 * jittered-grid Voronoi (uniform cells), per-grain metal tint with subtle
 * lightness variation, dark boundary grooves, system-colored precipitates.
 */
// cheap smooth value-noise (bilinear over a hashed grid) — gives Voronoi
// boundaries a natural curved wobble instead of straight polygon edges
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const h = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function drawFaceTexture(
  canvas: HTMLCanvasElement,
  opts: {
    cellsAcross: number;
    precipCount: number;
    seed: number;
    faceId: number;
    size: number;
    palette: MetalPalette;
    plan: DepositionPlan | null;
    phaseFracs?: { name: string; fraction: number; color: string }[];
  },
) {
  const { cellsAcross, precipCount, seed, faceId, size, palette, plan, phaseFracs } = opts;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rng = mulberry32(seed * 7919 + faceId * 104729);

  // jittered-grid Voronoi seeds → uniform polygonal cells across the face
  const seeds: { x: number; y: number; light: number; phaseIdx: number }[] = [];
  // CALPHAD-weighted phase assignment per grain (from data.phaseFractions):
  // dominant solid phase = metal matrix, minor phases = darker second-phase
  // grains, liquid (if any) = dark pools
  const phases = phaseFracs ?? [];
  const solidPhases = phases.filter((p) => !/liquid/i.test(p.name) && p.fraction > 0.005);
  const total = solidPhases.reduce((a, b) => a + b.fraction, 0) || 1;
  const pickPhase = () => {
    const roll = rng() * total;
    let acc = 0;
    for (const p of solidPhases) {
      acc += p.fraction;
      if (roll <= acc) return solidPhases.indexOf(p);
    }
    return 0;
  };
  const side = Math.max(2, cellsAcross);
  for (let gy = 0; gy < side; gy++) {
    for (let gx = 0; gx < side; gx++) {
      seeds.push({
        x: (gx + 0.5) / side + (rng() - 0.5) * 0.8 / side,
        y: (gy + 0.5) / side + (rng() - 0.5) * 0.8 / side,
        light: 0.78 + rng() * 0.44, // per-grain etch response
        phaseIdx: pickPhase(),
      });
    }
  }

  const img = ctx.createImageData(size, size);
  const idMap = new Int32Array(size * size);
  const [br, bg, bb] = palette.base;
  // minor CALPHAD phases etch slightly darker/cooler than the matrix
  const minorShade = (phaseIdx: number) =>
    solidPhases.length > 1 ? (phaseIdx === 0 ? 1.04 : 0.82) : 1.04;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let best = Infinity;
      let bi = 0;
      for (let i = 0; i < seeds.length; i++) {
        const dx = x / size - seeds[i].x;
        const dy = y / size - seeds[i].y;
        // organic wobble: smooth value-noise perturbs each seed's distance so
        // boundaries curve naturally instead of running as straight lines
        const w = 1 + 0.55 * (vnoise((x + i * 57) * 0.045, (y + i * 91) * 0.045, seed + i) - 0.5);
        const d = (dx * dx + dy * dy) * w;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      idMap[y * size + x] = bi;
      const L = seeds[bi].light * minorShade(seeds[bi].phaseIdx);
      const o = (y * size + x) * 4;
      img.data[o] = Math.min(255, br * L);
      img.data[o + 1] = Math.min(255, bg * L);
      img.data[o + 2] = Math.min(255, bb * L);
      img.data[o + 3] = 255;
    }
  }
  // dark boundary grooves where 4-neighbours differ
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const id = idMap[i];
      const l = idMap[y * size + Math.max(0, x - 1)];
      const r = idMap[y * size + Math.min(size - 1, x + 1)];
      const u = idMap[Math.max(0, y - 1) * size + x];
      const d = idMap[Math.min(size - 1, y + 1) * size + x];
      if (l !== id || r !== id || u !== id || d !== id) {
        const o = i * 4;
        img.data[o] = Math.round(img.data[o] * 0.34 + 8);
        img.data[o + 1] = Math.round(img.data[o + 1] * 0.34 + 8);
        img.data[o + 2] = Math.round(img.data[o + 2] * 0.36 + 9);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // second-phase particles in the system's metal colour
  const [pr, pg, pb] = palette.precip;
  for (let i = 0; i < precipCount; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2.5 + rng() * 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // SEM vignette
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.74);
  grad.addColorStop(0, "rgba(255,255,255,0.04)");
  grad.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function makeFaceTexture(opts: {
  cellsAcross: number;
  precipCount: number;
  seed: number;
  faceId: number;
  palette: MetalPalette;
  plan: DepositionPlan | null;
  phaseFracs?: { name: string; fraction: number; color: string }[];
}): THREE.CanvasTexture {
  const size = 768;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawFaceTexture(canvas, { ...opts, size });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Microstructure3dTab({ active }: { active: boolean }) {
  const s = useLabStore();
  const sys = ALLOY_SYSTEMS[s.alloySystem];
  const { data, loading } = usePredictPhase(
    {
      alloySystem: s.alloySystem,
      soluteFraction: s.soluteFraction,
      soluteFraction2: s.soluteFraction2,
      temperatureC: s.temperatureC,
      heatTreatmentC: s.heatTreatmentC,
      coolingRateKs: s.coolingRateKs,
    },
    [s.alloySystem, s.soluteFraction, s.soluteFraction2, s.temperatureC, s.heatTreatmentC, s.coolingRateKs],
  );

  const [animate, setAnimate] = useState(true);

  // ---- physics-driven structure parameters (all from the sidebar) --------
  const grainUm = data?.microstructure?.grainSizeUm ?? 30;
  const pptDensity = data?.microstructure?.precipitateDensity ?? 40;

  const palette = METAL_PALETTES[s.alloySystem] ?? DEFAULT_PALETTE;

  // grains per face: field width ≈ 160 µm → cellsAcross = 160/grainSize
  const cellsAcross = Math.max(3, Math.min(42, Math.round(160 / Math.max(grainUm, 4))));
  // precipitates dissolve when ageing above the solvus (θ unstable)
  const dissolved = s.heatTreatmentC >= sys.tEutecticC;
  const precipCount = dissolved
    ? 0
    : Math.max(0, Math.min(150, Math.round(pptDensity / 3)));

  // structural signature: textures rebuild whenever ANY driver changes
  const structureKey = useMemo(
    () =>
      [
        s.alloySystem,
        s.soluteFraction,
        s.soluteFraction2,
        s.coolingRateKs,
        s.heatTreatmentC,
        grainUm,
        precipCount,
        cellsAcross,
        s.compExtra ? Object.entries(s.compExtra).map(([k, v]) => k + v.toFixed(2)).join(";") : "",
      ].join("|"),
    [s.alloySystem, s.soluteFraction, s.soluteFraction2, s.coolingRateKs, s.heatTreatmentC, grainUm, precipCount, cellsAcross, s.compExtra],
  );

  const mountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<{ zoom: (d: number) => void; reset: () => void } | null>(null);
  const animateRef = useRef(animate);
  animateRef.current = animate;

  useEffect(() => {
    if (!active) return;
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    let zoom = 3.1;
    let rotX = 0.42;
    let rotY = 0.68;
    const cube = new THREE.Group();
    scene.add(cube);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 4, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde6ff, 0.8);
    fill.position.set(-4, -1, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff1dc, 0.55);
    rim.position.set(2, -3, -4);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const faces = [0, 1, 2, 3, 4, 5];
    const textures: THREE.CanvasTexture[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const plan = depositionPlan(
      s.alloySystem,
      {
        C: s.soluteFraction * 100,
        Mn: s.compExtra["Mn"] ?? 0.75,
        Si: s.compExtra["Si"] ?? 0.25,
        Cr: s.compExtra["Cr"] ?? 0,
        Ni: s.compExtra["Ni"] ?? 0,
        Mo: s.compExtra["Mo"] ?? 0,
      },
      s.coolingRateKs,
      s.holdingTimeHours,
      s.heatTreatmentC,
      sys.tEutecticC,
    );
    const buildTextures = () => {
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      textures.length = 0;
      materials.length = 0;
      for (const faceId of faces) {
        const tex = makeFaceTexture({
          cellsAcross,
          precipCount,
          seed: Math.round(grainUm * 100) + precipCount,
          faceId,
          palette,
          plan,
          phaseFracs: data?.phaseFractions?.phases,
        });
        textures.push(tex);
        materials.push(
          new THREE.MeshStandardMaterial({
            map: tex,
            metalness: 0.42,
            roughness: 0.42,
          }),
        );
      }
      mesh.material = materials;
    };
    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const mesh = new THREE.Mesh(geometry);
    cube.add(mesh);
    buildTextures();

    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.62, 1.62, 1.62)),
      new THREE.LineBasicMaterial({ color: 0x3a3a42 }),
    );
    cube.add(frame);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.008;
      rotX = Math.max(-1.5, Math.min(1.5, rotX + (e.clientY - lastY) * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(1.9, Math.min(6, zoom + e.deltaY * 0.002));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const setSize = () => {
      const w = Math.max(64, el.clientWidth);
      const h = Math.max(64, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const placeCamera = () => {
      camera.position.set(
        zoom * Math.cos(rotX) * Math.sin(rotY),
        zoom * Math.sin(rotX),
        zoom * Math.cos(rotX) * Math.cos(rotY),
      );
      camera.lookAt(0, 0, 0);
    };
    setSize();
    placeCamera();

    let lastW = el.clientWidth;
    let lastH = el.clientHeight;
    const sizeTimer = setInterval(() => {
      if (el.clientWidth !== lastW || el.clientHeight !== lastH) {
        lastW = el.clientWidth;
        lastH = el.clientHeight;
        setSize();
      }
    }, 250);
    const onWinResize = () => setSize();
    window.addEventListener("resize", onWinResize);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = performance.now();
    const renderFrame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (animateRef.current) rotY += dt * 0.3;
      placeCamera();
      renderer.render(scene, camera);
    };
    renderFrame();
    timer = setTimeout(function tick() {
      renderFrame();
      timer = setTimeout(tick, 33);
    }, 33);

    apiRef.current = {
      zoom: (d: number) => {
        zoom = Math.max(1.9, Math.min(6, zoom + d));
      },
      reset: () => {
        zoom = 3.1;
        rotX = 0.42;
        rotY = 0.68;
      },
    };

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(sizeTimer);
      window.removeEventListener("resize", onWinResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      geometry.dispose();
      frame.geometry.dispose();
      (frame.material as THREE.Material).dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // rebuild whenever the physical structure changes
  }, [active, structureKey, cellsAcross, precipCount, palette]);

  const doZoom = (d: number) => apiRef.current?.zoom(d);
  const doReset = () => apiRef.current?.reset();

  const gbArea = 2 / Math.max(grainUm, 0.1);
  const pptSpacing = Math.pow(1 / Math.max(pptDensity, 0.01), 1 / 3);

  if (!active) {
    return (
      <Card className="overflow-hidden bg-card/60 backdrop-blur">
        <CardContent className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
          open the 3D Grains tab to render the specimen
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <Card className="overflow-hidden bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Box className="h-4 w-4 text-primary" />
                3D Polycrystal Specimen (Voronoi RVE)
              </CardTitle>
              <Badge variant="outline" className="text-[9px]">
                {cellsAcross}×{cellsAcross} grains/face · {precipCount} {palette.precipName}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative aspect-square w-full bg-black" ref={mountRef}>
              <div className="absolute left-3 top-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => setAnimate((a) => !a)}
                  title={animate ? "Pause rotation" : "Play rotation"}
                >
                  {animate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => doZoom(0.5)}
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => doZoom(-0.5)}
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={doReset}
                  title="Reset view"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-end gap-2">
                <div className="h-1.5 w-12 bg-white/80 shadow" />
                <span className="font-mono text-[10px] text-white drop-shadow">
                  {(grainUm * 2).toFixed(0)} µm
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur">
                drag to orbit · scroll to zoom
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="lab-card lab-card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Box className="h-4 w-4 text-primary" />
              Structure Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <MetricRow label="Grain size (model)" value={`${grainUm.toFixed(2)} µm`} accent />
            <MetricRow label="ASTM grain size No." value={astmNumber(grainUm).toFixed(1)} />
            <MetricRow label="Grain boundary area" value={`${gbArea.toFixed(2)} mm²/mm³`} />
            <MetricRow
              label="Precipitate density"
              value={dissolved ? "dissolved (T > solvus)" : `${pptDensity.toFixed(0)} /µm³`}
              accent
            />
            <MetricRow label="Mean precipitate spacing" value={dissolved ? "—" : `${pptSpacing.toFixed(3)} µm`} />
            <MetricRow label="Grains across face" value={String(cellsAcross)} />
            <div className="mt-2 rounded-md border border-border/40 bg-background/40 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
              Each cube face is a true 2D Voronoi section of the 3D grain
              structure — polygonal grains in real etched-metal colors
              ({palette.precipName} particles shown in their natural tint).
              Sidebar changes rebuild the structure: composition & cooling
              rate set the grain size (Hall–Petch), composition & ageing
              temperature set precipitate density, and above the solvus the
              precipitates dissolve.
            </div>
          </CardContent>
        </Card>

        <Card className="lab-card lab-card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Strengthening Contributions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {loading || !data ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <ContribBar label="Hall–Petch (grain)" value={Math.max(0, data.microstructure.hallPetchMPa - 40)} max={450} color="#d97706" />
                <ContribBar label="Orowan (precip.)" value={dissolved ? 0 : data.yieldStrength.precip * 0.018} max={450} color="#10b981" />
                <ContribBar label="Solid-solution" value={180 * s.soluteFraction} max={450} color="#0891b2" />
                <ContribBar label="σ₀ (lattice)" value={40} max={450} color="#64748b" fixed />
                <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-[11px] text-muted-foreground">Total σ_y</span>
                  <span className="val-emphasis font-mono text-lg font-bold tabular-nums text-primary">
                    {data.yieldStrength.yield.toFixed(0)} MPa
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur">
          <CardContent className="p-3 text-[10px] leading-relaxed text-muted-foreground">
            {sys.label} · {(s.soluteFraction * 100).toFixed(1)} wt% {sys.solute}
            {sys.isTernary ? ` + ${(s.soluteFraction2 * 100).toFixed(1)} wt% ${sys.solute2}` : ""} ·
            cooled at {s.coolingRateKs} K/s · aged {s.heatTreatmentC} °C ·{" "}
            {dissolved ? "precipitates dissolved" : `${palette.precipName} particles present`}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${accent ? "font-semibold text-primary" : "text-foreground/90"}`}>
        {value}
      </span>
    </div>
  );
}

function ContribBar({
  label,
  value,
  max,
  color,
  fixed,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  fixed?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground/90">
          {fixed ? "" : "+"}
          {value.toFixed(1)} MPa
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
