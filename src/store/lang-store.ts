/**
 * lang-store.ts — UI language hook (English).
 *
 * Kept as a store-shaped hook so components can keep their `useLang()`
 * call sites unchanged; the dictionary is English-only.
 */
import { create } from "zustand";
import { DICTS, type Dict } from "@/lib/i18n";

interface LangState {
  dict: Dict;
  hydrate: () => void;
}

export const useLang = create<LangState>(() => ({
  dict: DICTS.en,
  hydrate: () => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
    }
  },
}));
