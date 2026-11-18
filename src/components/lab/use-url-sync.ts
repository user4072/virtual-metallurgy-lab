"use client";

/**
 * use-url-sync.ts
 * -----------------------------------------------------------------------------
 * Two-way binding between the Zustand lab store and the URL query string, so
 * the full alloy recipe is bookmarkable / shareable:
 *
 *   ?sys=Al-Cu&x=0.04&T=25&H=190&R=8&mag=2500&model=graph-gnn&steps=50&cfg=7.5
 *
 * On mount: parse the URL and seed the store (if params present).
 * On store change: debounced push of the new params into the URL (replaceState,
 *   so we don't pollute browser history).
 * -----------------------------------------------------------------------------
 */

import { useEffect, useRef } from "react";
import { useLabStore } from "@/store/lab-store";
import type { AlloySystemId } from "@/lib/metallurgy";

const KEYS = {
  sys: "alloySystem",
  x: "soluteFraction",
  x2: "soluteFraction2",
  T: "temperatureC",
  H: "heatTreatmentC",
  R: "coolingRateKs",
  mag: "magnification",
  model: "surrogateModel",
  steps: "diffusionSteps",
  cfg: "guidanceScale",
} as const;

/** Parse the current URL query into a partial lab-state object. */
function parseURL(): Partial<Record<keyof typeof KEYS, string>> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Partial<Record<keyof typeof KEYS, string>> = {};
  for (const k of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
    const v = params.get(k);
    if (v != null) out[k] = v;
  }
  return out;
}

/** Serialise the current lab state into a URL query string. */
function serialize(s: ReturnType<typeof useLabStore.getState>): string {
  const p = new URLSearchParams();
  p.set("sys", s.alloySystem);
  p.set("x", s.soluteFraction.toFixed(4));
  p.set("x2", s.soluteFraction2.toFixed(4));
  p.set("T", String(Math.round(s.temperatureC)));
  p.set("H", String(Math.round(s.heatTreatmentC)));
  p.set("R", s.coolingRateKs.toFixed(2));
  p.set("mag", String(s.magnification));
  p.set("model", s.surrogateModel);
  p.set("steps", String(s.diffusionSteps));
  p.set("cfg", s.guidanceScale.toFixed(1));
  return p.toString();
}

/** Hook that syncs the lab store ↔ URL. Call once at the page level. */
export function useUrlSync() {
  const seeded = useRef(false);

  // 1. Seed store from URL on mount
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const parsed = parseURL();
    if (Object.keys(parsed).length === 0) return; // no URL params → keep defaults

    const s = useLabStore.getState();
    if (parsed.sys) s.setAlloySystem(parsed.sys as AlloySystemId);
    if (parsed.x) s.setSoluteFraction(Math.max(0, parseFloat(parsed.x)));
    if (parsed.x2) s.setSoluteFraction2(Math.max(0, parseFloat(parsed.x2)));
    if (parsed.T) s.setTemperatureC(parseFloat(parsed.T));
    if (parsed.H) s.setHeatTreatmentC(parseFloat(parsed.H));
    if (parsed.R) s.setCoolingRateKs(Math.max(0.1, parseFloat(parsed.R)));
    if (parsed.mag) s.setMagnification(parseFloat(parsed.mag));
    if (parsed.model) s.setSurrogateModel(parsed.model as never);
    if (parsed.steps) s.setDiffusionSteps(parseInt(parsed.steps, 10));
    if (parsed.cfg) s.setGuidanceScale(parseFloat(parsed.cfg));
  }, []);

  // 2. Push store → URL (debounced)
  const s = useLabStore();
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window === "undefined") return;
      const qs = serialize(s);
      const newUrl = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", newUrl);
    }, 400);
    return () => clearTimeout(t);
  }, [
    s.alloySystem,
    s.soluteFraction,
    s.soluteFraction2,
    s.temperatureC,
    s.heatTreatmentC,
    s.coolingRateKs,
    s.magnification,
    s.surrogateModel,
    s.diffusionSteps,
    s.guidanceScale,
    s,
  ]);
}

/** Build the full shareable URL for the current recipe. */
export function buildShareURL(): string {
  if (typeof window === "undefined") return "";
  const s = useLabStore.getState();
  return `${window.location.origin}${window.location.pathname}?${serialize(s)}`;
}
