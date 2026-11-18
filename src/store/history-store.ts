/**
 * history-store.ts
 * -----------------------------------------------------------------------------
 * Session-history store: logs every alloy "recipe" the user has explored, with
 * the predicted yield strength at the time. Persisted to localStorage so the
 * history survives reloads. The sidebar renders the most recent entries as
 * clickable chips that restore that recipe.
 * -----------------------------------------------------------------------------
 */

import { create } from "zustand";

export interface HistoryEntry {
  id: string;
  ts: number;                 // epoch ms
  alloySystem: string;
  soluteFraction: number;
  temperatureC: number;
  heatTreatmentC: number;
  coolingRateKs: number;
  yieldStrength: number;      // MPa (predicted at snapshot time)
  dominantPhase?: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  add: (e: Omit<HistoryEntry, "id" | "ts">) => void;
  clear: () => void;
  hydrate: () => void;
}

const KEY = "vml-history-v1";
const MAX = 24;

function load(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(entries: HistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* quota / private mode */
  }
}

export const useHistory = create<HistoryState>((set, get) => ({
  entries: [],
  add: (e) => {
    const entry: HistoryEntry = {
      ...e,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
    };
    // dedupe: skip if identical to the last entry
    const prev = get().entries[0];
    if (
      prev &&
      prev.alloySystem === entry.alloySystem &&
      Math.abs(prev.soluteFraction - entry.soluteFraction) < 1e-4 &&
      Math.abs(prev.heatTreatmentC - entry.heatTreatmentC) < 1 &&
      Math.abs(prev.coolingRateKs - entry.coolingRateKs) < 0.2
    ) {
      return;
    }
    const next = [entry, ...get().entries].slice(0, MAX);
    set({ entries: next });
    save(next);
  },
  clear: () => {
    set({ entries: [] });
    save([]);
  },
  hydrate: () => {
    if (get().entries.length === 0) set({ entries: load() });
  },
}));
