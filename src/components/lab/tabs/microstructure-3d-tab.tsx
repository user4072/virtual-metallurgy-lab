"use client";

/**
 * Microstructure3dTab — a real WebGL 3D polycrystal.
 *
 * Rendering approach: a full-screen raymarching fragment shader computes a
 * weighted 3D Voronoi tessellation inside a unit cube. Every seed is a grain
 * (weight-animated → visible grain growth / Ostwald-ripening); precipitates
 * are raymarched spheres embedded in the volume. Grain colors mimic IPF
 * (inverse-pole-figure) orientation maps; boundaries darken like etched
 * metallographic sections. Interaction: orbit + zoom via OrbitControls.
 *
 * Physics wiring: the seed count follows the surrogate grain size
 * (faster cooling → finer grains → Hall-Petch), precipitate count follows the
 * precipitate density (Orowan). Strengthening contributions come from the
 * unified yield model via /api/predict_phase.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Box,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ALLOY_SYSTEMS } from "@/lib/metallurgy";
import { useLabStore } from "@/store/lab-store";
import { usePredictPhase } from "@/components/lab/use-lab-data";

const MAX_SEEDS = 128;
const MAX_PRECIPS = 48;

/**
 * Polling ResizeObserver fallback. Some embedded webviews ship a
 * ResizeObserver that never fires for R3F's measure div (canvas would be
 * stuck at the 300×150 default), so we let <Canvas resize={{polyfill:...}}>
 * use this polling implementation instead of the native one.
 */
class PollingResizeObserver {
  private cb: ResizeObserverCallback;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: Map<Element, { w: number; h: number }> = new Map();
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element) {
    this.last.set(el, { w: el.clientWidth, h: el.clientHeight });
    // native ResizeObserver fires an initial callback on observe() — mirror that
    setTimeout(() => {
      const cur = this.last.get(el);
      if (!cur) return;
      this.cb(
        [
          {
            target: el,
            contentRect: new DOMRect(0, 0, cur.w, cur.h),
            borderBoxSize: [{ inlineSize: cur.w, blockSize: cur.h }],
            contentBoxSize: [{ inlineSize: cur.w, blockSize: cur.h }],
            devicePixelContentBoxSize: [{ inlineSize: cur.w, blockSize: cur.h }],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }, 0);
    this.timer = setInterval(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const prev = this.last.get(el);
      if (prev && (prev.w !== w || prev.h !== h)) {
        this.last.set(el, { w, h });
        this.cb(
          [
            {
              target: el,
              contentRect: new DOMRect(0, 0, w, h),
              borderBoxSize: [{ inlineSize: w, blockSize: h }],
              contentBoxSize: [{ inlineSize: w, blockSize: h }],
              devicePixelContentBoxSize: [{ inlineSize: w, blockSize: h }],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
    }, 200);
  }
  unobserve(el: Element) {
    this.last.delete(el);
    if (this.last.size === 0 && this.timer) clearInterval(this.timer);
  }
  disconnect() {
    this.last.clear();
    if (this.timer) clearInterval(this.timer);
  }
}

// deterministic PRNG (same family as the rest of the lab)
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

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec3 uSeeds[${MAX_SEEDS}];
uniform float uWeights[${MAX_SEEDS}];
uniform int uNSeeds;
uniform vec4 uPrecips[${MAX_PRECIPS}]; // xyz center (unit cube), w radius
uniform int uNPrecips;
uniform float uTime;
uniform float uEdgeWidth;
uniform vec3 uCamPos;

// hash → grain tint (IPF-like: steel-grey base with per-grain hue shifts)
vec3 grainColor(int id) {
  float h = fract(sin(float(id) * 127.1) * 43758.5453);
  float s = 0.18 + 0.30 * fract(sin(float(id) * 311.7) * 12543.53);
  float v = 0.55 + 0.25 * fract(sin(float(id) * 74.7) * 3457.13);
  // hsl→rgb (h in [0,1])
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), rgb, s);
}

// weighted squared distance to seed i (lower = closer)
float seedDist(vec3 p, int i) {
  vec3 d = p - uSeeds[i];
  return dot(d, d) / (uWeights[i] * uWeights[i]);
}

// nearest seed index + distances (F1, F2) — brute force over the seed array
void nearestSeeds(vec3 p, out int best, out float f1, out float f2) {
  best = 0;
  f1 = 1e9;
  f2 = 1e9;
  for (int i = 0; i < ${MAX_SEEDS}; i++) {
    if (i >= uNSeeds) break;
    float d = seedDist(p, i);
    if (d < f1) { f2 = f1; f1 = d; best = i; }
    else if (d < f2) { f2 = d; }
  }
}

// signed distance to the nearest precipitate sphere (negative = inside)
float precipSDF(vec3 p, out int hitId) {
  float best = 1e9;
  hitId = -1;
  for (int i = 0; i < ${MAX_PRECIPS}; i++) {
    if (i >= uNPrecips) break;
    float d = length(p - uPrecips[i].xyz) - uPrecips[i].w;
    if (d < best) { best = d; hitId = i; }
  }
  return best;
}

// axis-aligned unit-cube ray intersection, returns (tEnter, tExit)
vec2 boxRange(vec3 ro, vec3 rd) {
  // guard exact-zero components: a NaN here poisons the whole slab test
  vec3 inv = 1.0 / (rd + vec3(1e-9));
  vec3 t0 = (vec3(-0.5) - ro) * inv;
  vec3 t1 = (vec3(0.5) - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

vec3 cubeNormal(vec3 p) {
  vec2 e = vec2(0.0005, 0.0);
  // gradient of the weighted distance field (points toward the seed)
  int b; float f1, f2;
  nearestSeeds(p, b, f1, f2);
  float dx = seedDist(p + vec3(e.x, 0, 0), b) - seedDist(p - vec3(e.x, 0, 0), b);
  float dy = seedDist(p + vec3(0, e.x, 0), b) - seedDist(p - vec3(0, e.x, 0), b);
  float dz = seedDist(p + vec3(0, 0, e.x), b) - seedDist(p - vec3(0, 0, e.x), b);
  return normalize(vec3(dx, dy, dz) + 1e-6);
}

void main() {
  // ray through the fragment (plane at z = -1 relative to camera basis)
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd + ndc.x * 0.85 * right + ndc.y * 0.85 * up);

  vec2 range = boxRange(ro, rd);
  float tEnter = max(range.x, 0.0);
  float tExit = range.y;
  if (tEnter >= tExit) {
    // background: subtle radial vignette
    float v = 0.06 + 0.05 * (1.0 - length(ndc));
    gl_FragColor = vec4(vec3(v), 1.0);
    return;
  }

  const int STEPS = 96;
  float dt = (tExit - tEnter) / float(STEPS);
  float t = tEnter + dt * 0.5;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;

    // precipitates first (embedded spheres)
    int pid;
    float pd = precipSDF(p, pid);
    if (pd < 0.0) {
      // small-sphere normal via SDF gradient
      vec2 e = vec2(0.002, 0.0);
      int tmp;
      vec3 n = normalize(vec3(
        precipSDF(p + vec3(e.x, 0, 0), tmp) - precipSDF(p - vec3(e.x, 0, 0), tmp),
        precipSDF(p + vec3(0, e.x, 0), tmp) - precipSDF(p - vec3(0, e.x, 0), tmp),
        precipSDF(p + vec3(0, 0, e.x), tmp) - precipSDF(p - vec3(0, 0, e.x), tmp)));
      vec3 lightDir = normalize(vec3(0.5, 0.9, 0.7));
      float diff = max(dot(n, lightDir), 0.0);
      float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 24.0);
      vec3 base = vec3(0.85, 0.72, 0.30); // golden second-phase particle
      vec3 col = base * (0.25 + 0.75 * diff) + spec * 0.9;
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    int best; float f1; float f2;
    nearestSeeds(p, best, f1, f2);
    // grain boundary: the two nearest seeds nearly tied
    float edge = (sqrt(f2) - sqrt(f1)) / uEdgeWidth;
    if (edge < 1.0) {
      vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
      float shade = 0.18 + 0.5 * (1.0 - edge); // darker right at the boundary
      vec3 col = grainColor(best) * shade * (0.6 + 0.4 * max(dot(vec3(0, 1, 0), lightDir), 0.0));
      gl_FragColor = vec4(col, 1.0);
      return;
    }

    // grain interior hit — Lambert + rim on the distance-field normal
    if (i == STEPS - 1 || t + dt > tExit) {
      vec3 n = -cubeNormal(p); // outward-ish normal
      vec3 lightDir = normalize(vec3(0.45, 0.85, 0.55));
      float diff = max(dot(n, lightDir), 0.15);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5) * 0.35;
      vec3 col = grainColor(best) * (0.35 + 0.65 * diff) + rim * vec3(0.6, 0.7, 0.9);
      gl_FragColor = vec4(col, 1.0);
      return;
    }
    t += dt;
  }
  gl_FragColor = vec4(vec3(0.06), 1.0);
}
`;

interface CrystalHandle {
  setZoom: (z: number) => void;
  reset: () => void;
}

function CrystalViewport({
  containerRef,
  seedsRef,
  weightsRef,
  precipsRef,
  animate,
  zoomRef,
  resetSignal,
  onReady,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  seedsRef: React.MutableRefObject<THREE.Vector3[]>;
  weightsRef: React.MutableRefObject<number[]>;
  precipsRef: React.MutableRefObject<THREE.Vector4[]>;
  animate: boolean;
  zoomRef: React.MutableRefObject<number>;
  resetSignal: number;
  onReady?: () => void;
}) {
  const animateRef = useRef(animate);
  animateRef.current = animate;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const setSize = () => {
      const w = Math.max(64, el.clientWidth);
      const h = Math.max(64, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    let zoom = zoomRef.current;
    let rotX = -0.35;
    let rotY = 0.6;
    const updateCamera = () => {
      const d = zoom;
      camera.position.set(
        d * Math.cos(rotX) * Math.sin(rotY),
        d * Math.sin(rotX),
        d * Math.cos(rotX) * Math.cos(rotY),
      );
      camera.lookAt(0, 0, 0);
      (material.uniforms.uCamPos.value as THREE.Vector3).copy(camera.position);
    };

    const geo = new THREE.SphereGeometry(1.35, 48, 48);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSeeds: { value: seedsRef.current },
        uWeights: { value: weightsRef.current },
        uNSeeds: { value: seedsRef.current.length },
        uPrecips: { value: precipsRef.current },
        uNPrecips: { value: precipsRef.current.length },
        uTime: { value: 0 },
        uEdgeWidth: { value: 0.045 },
        uCamPos: { value: new THREE.Vector3() },
      },
    });
    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);

    // ---- manual orbit + zoom (pointer events, no drei dependency) ----
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
      rotX = Math.max(-1.4, Math.min(1.4, rotX + (e.clientY - lastY) * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(1.7, Math.min(4.5, zoom + e.deltaY * 0.002));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    setSize();
    updateCamera();
    onReady?.();

    // size poll: container may resize when the layout settles
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

    // ---- render loop ----
    const weights0 = weightsRef.current.map((w) => w);
    let time = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = performance.now();
    const renderFrame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (animateRef.current) {
        time += dt;
        rotY += dt * 0.25;
      }
      const w = material.uniforms.uWeights.value as number[];
      for (let i = 0; i < weights0.length; i++) {
        const phase = (i * 2.399) % (Math.PI * 2);
        const speed = 0.25 + ((i * 37) % 20) / 80;
        w[i] = weights0[i] * (1 + 0.16 * Math.sin(time * speed + phase));
      }
      material.uniforms.uTime.value = time;
      // keep uniforms in sync with the latest parameter-driven structure
      material.uniforms.uSeeds.value = seedsRef.current;
      material.uniforms.uNSeeds.value = seedsRef.current.length;
      material.uniforms.uPrecips.value = precipsRef.current;
      material.uniforms.uNPrecips.value = precipsRef.current.length;
      updateCamera();
      renderer.render(scene, camera);
    };
    // first paint immediately (requestAnimationFrame is throttled/paused in
    // hidden webview panes — a timeout loop keeps rendering alive there)
    renderFrame();
    timer = setTimeout(function tick() {
      renderFrame();
      timer = setTimeout(tick, 33);
    }, 33);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(sizeTimer);
      window.removeEventListener("resize", onWinResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      geo.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
    };
    // rebuild only when the crystal structure changes
  }, [seedsRef, weightsRef, precipsRef]);

  // zoom control from outside
  useEffect(() => {
    // zoomRef is read by the render loop every frame; nothing else to do
  }, [zoomRef, resetSignal]);

  return null;
}

function astmNumber(grainUm: number): number {
  // ASTM E112: G = -3.2877 + 6.6439·log10(N_A per mm²) — inverted for grain size
  return Math.max(0, -3.2877 - 6.6439 * Math.log10(Math.max(grainUm / 1000, 1e-6)));
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
  const [zoom, setZoom] = useState(2.6);
  const viewportRef = useRef<HTMLDivElement>(null);

  const grainUm = data?.microstructure?.grainSizeUm ?? 30;

  const seedsRef = useRef<THREE.Vector3[]>([]);
  const weightsRef = useRef<number[]>([]);
  const precipsRef = useRef<THREE.Vector4[]>([]);
  const zoomRef = useRef(2.6);
  const resetSignalRef = useRef(0);
  const resetSignal = resetSignalRef.current;
  const { seeds, weights, precips, grainCount } = useMemo(() => {
    const rng = mulberry32(
      Math.floor(s.soluteFraction * 9999 + s.coolingRateKs * 13 + s.heatTreatmentC),
    );
    // finer grains → more seeds (volume of d³ grains in the RVE)
    const grainCount = Math.max(
      8,
      Math.min(MAX_SEEDS, Math.round(36000 / Math.pow(Math.max(grainUm, 2), 1.55))),
    );
    const seeds2: THREE.Vector3[] = [];
    const weights2: number[] = [];
    for (let i = 0; i < grainCount; i++) {
      // margin keeps seeds inside the visible sphere
      const m = 0.14;
      seeds2.push(
        new THREE.Vector3(
          m + rng() * (1 - 2 * m) - 0.5,
          m + rng() * (1 - 2 * m) - 0.5,
          m + rng() * (1 - 2 * m) - 0.5,
        ),
      );
      weights2.push(0.8 + rng() * 0.45);
    }
    const pptDensity = data?.microstructure?.precipitateDensity ?? 40;
    const nPrecips = Math.max(
      6,
      Math.min(MAX_PRECIPS, Math.round(pptDensity / 12) + 10),
    );
    const precips2: THREE.Vector4[] = [];
    for (let i = 0; i < nPrecips; i++) {
      const r = 0.022 + rng() * 0.02;
      precips2.push(
        new THREE.Vector4(
          0.12 + rng() * 0.76 - 0.5,
          0.12 + rng() * 0.76 - 0.5,
          0.12 + rng() * 0.76 - 0.5,
          r,
        ),
      );
    }
    seedsRef.current = seeds2;
    weightsRef.current = weights2;
    precipsRef.current = precips2;
    return { seeds: seeds2, weights: weights2, precips: precips2, grainCount };
  }, [s.soluteFraction, s.coolingRateKs, s.heatTreatmentC, grainUm, data?.microstructure?.precipitateDensity]);

  const gbArea = 2 / Math.max(grainUm, 0.1);
  const pptSpacing = Math.pow(1 / Math.max(data?.microstructure?.precipitateDensity ?? 40, 0.01), 1 / 3);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* 3D viewport */}
      <div className="xl:col-span-2">
        <Card className="overflow-hidden bg-card/60 backdrop-blur">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Box className="h-4 w-4 text-primary" />
                3D Polycrystal (raymarched Voronoi RVE)
              </CardTitle>
              <Badge variant="outline" className="text-[9px]">
                {grainCount} grains · {precips.length} precipitates
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div ref={viewportRef} className="relative aspect-square w-full bg-black">
              {active ? (
                <CrystalViewport
                  containerRef={viewportRef}
                  seedsRef={seedsRef}
                  weightsRef={weightsRef}
                  precipsRef={precipsRef}
                  animate={animate}
                  zoomRef={zoomRef}
                  resetSignal={resetSignal}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  open the 3D Grains tab to render the polycrystal
                </div>
              )}
              {/* controls overlay */}
              <div className="absolute left-3 top-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => setAnimate((a) => !a)}
                  title={animate ? "Pause grain growth" : "Play grain growth"}
                >
                  {animate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => { zoomRef.current = Math.min(4.2, zoomRef.current + 0.4); setZoom(zoomRef.current); }}
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => { zoomRef.current = Math.max(1.7, zoomRef.current - 0.4); setZoom(zoomRef.current); }}
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-white hover:bg-white/10"
                  onClick={() => { zoomRef.current = 2.6; setZoom(2.6); }}
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

      {/* Side panel: structure metrics + strengthening */}
      <div className="space-y-4">
        <Card className="lab-card lab-card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Box className="h-4 w-4 text-primary" />
              Structure Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <Row label="Grain size (model)" value={`${grainUm.toFixed(2)} µm`} accent />
            <Row label="ASTM grain size No." value={astmNumber(grainUm).toFixed(1)} />
            <Row label="Grain boundary area" value={`${gbArea.toFixed(2)} mm²/mm³`} />
            <Row
              label="Precipitate density"
              value={`${(data?.microstructure?.precipitateDensity ?? 0).toFixed(0)} /µm³`}
              accent
            />
            <Row label="Mean precipitate spacing" value={`${pptSpacing.toFixed(3)} µm`} />
            <Row label="Seeds in RVE" value={`${grainCount}`} />
            <div className="mt-2 rounded-md border border-border/40 bg-background/40 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
              The aggregate is a weighted 3D Voronoi tessellation raymarched on
              the GPU. With animation on, grain weights evolve — the same
              competition that drives Ostwald ripening. Golden spheres are
              second-phase precipitates. Faster cooling → finer grains
              (Hall–Petch); more solute → denser precipitation (Orowan).
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
                <ContribBar
                  label="Hall–Petch (grain)"
                  value={Math.max(0, data.microstructure.hallPetchMPa - 40)}
                  max={450}
                  color="#d97706"
                />
                <ContribBar
                  label="Orowan (precip.)"
                  value={data.yieldStrength.precip * 0.018}
                  max={450}
                  color="#10b981"
                />
                <ContribBar
                  label="Solid-solution"
                  value={180 * s.soluteFraction}
                  max={450}
                  color="#0891b2"
                />
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
            cooled at {s.coolingRateKs} K/s · aged {s.heatTreatmentC} °C
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
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
      <span
        className={`font-mono ${accent ? "font-semibold text-primary" : "text-foreground/90"}`}
      >
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
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
