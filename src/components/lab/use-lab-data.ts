"use client";

import { useEffect, useRef, useState } from "react";
import {
  predictPhase,
  generateMicrograph,
  saveMicrograph,
  causalEffect,
  type PhaseFractionApi,
  type MicrographApi,
  type CausalEffectApi,
} from "@/lib/lab-api";

/** Debounced POST fetcher that refires whenever `deps` change. */
function useDebouncedFetch<T>(
  url: string,
  body: Record<string, unknown>,
  deps: unknown[],
  delay = 250,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as T;
        if (id === reqId.current) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) {
          setError(e instanceof Error ? e.message : "fetch failed");
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, deps);

  return { data, error, loading };
}

export function usePredictPhase(body: Record<string, unknown>, deps: unknown[]) {
  return useDebouncedFetch<PhaseFractionApi>(
    "/api/predict_phase",
    body,
    deps,
    200,
  );
}

/**
 * Manual-trigger fetcher for micrograph generation. Progress is honest:
 * an indeterminate timer for the diffusion backend (tens of seconds) and an
 * instant fill for the procedural backend.
 */
export function useMicrographGenerator() {
  const [data, setData] = useState<MicrographApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);

  const generate = async (body: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    setSaved(false);
    const expectSlow = Number(body.diffusionSteps ?? 0) > 0;
    setProgress(expectSlow ? 4 : 60);
    const iv = setInterval(() => {
      setProgress((p) => (p < 90 ? p + (expectSlow ? 1.2 : 8) : p));
    }, 300);
    try {
      const res = await generateMicrograph(body);
      setData(res);
      if (!res.ok) setError(res.error ?? "generation failed");
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
    } finally {
      clearInterval(iv);
      setLoading(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const save = async (body: Record<string, unknown>) => {
    try {
      const res = await saveMicrograph(body);
      setSaved(res.ok);
      return res;
    } catch {
      setSaved(false);
      return null;
    }
  };

  return { data, error, loading, progress, saved, generate, save };
}

export function useCausalEffect(body: Record<string, unknown>, deps: unknown[]) {
  return useDebouncedFetch<CausalEffectApi>(
    "/api/causal_effect",
    body,
    deps,
    200,
  );
}

export { predictPhase, causalEffect };

// ---- new-tab fetchers ------------------------------------------------------

export function useScheil(body: Record<string, unknown>, deps: unknown[]) {
  return useDebouncedFetch<import("@/lib/lab-api").ScheilApi>(
    "/api/scheil",
    body,
    deps,
    200,
  );
}

export function useStressStrain(body: Record<string, unknown>, deps: unknown[]) {
  return useDebouncedFetch<import("@/lib/lab-api").StressStrainApi>(
    "/api/stress_strain",
    body,
    deps,
    200,
  );
}

export function useOptimize(body: Record<string, unknown>, deps: unknown[]) {
  return useDebouncedFetch<import("@/lib/lab-api").OptimizeApi>(
    "/api/optimize",
    body,
    deps,
    150,
  );
}

export function useReferences() {
  const [data, setData] = useState<import("@/lib/lab-api").ReferencesApi | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/references")
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return data;
}
