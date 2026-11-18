"use client";

import { useState, useId } from "react";
import { Info } from "lucide-react";

/**
 * Glossary of technical terms used across the lab. Each entry has a short
 * definition shown in the tooltip. Keeps domain jargon accessible to
 * non-expert users (per VLM round-10 feedback).
 */
export const GLOSSARY: Record<string, { title: string; def: string }> = {
  CALPHAD: {
    title: "CALPHAD",
    def: "CALculation of PHAse Diagrams — a computational thermodynamics method that models phase stability and phase equilibria from assessed databases. The ground-truth our surrogate replaces.",
  },
  "GAT": {
    title: "GAT (Graph Attention)",
    def: "Graph Attention Network — a PyTorch Geometric model that uses attention over graph-structured alloy nodes. Our GraphAlloySurrogate backbone.",
  },
  "Paris law": {
    title: "Paris law",
    def: "da/dN = C·(ΔK)^m — the empirical power-law relating crack-growth rate per cycle to the stress-intensity range. Used in the Failure tab.",
  },
  "Hall-Petch": {
    title: "Hall–Petch",
    def: "σ_y = σ₀ + k·d^(-1/2) — yield strength increases as grain size d decreases. The classic grain-boundary strengthening law.",
  },
  "Orowan": {
    title: "Orowan strengthening",
    def: "Δσ ∝ 1/r — strength increases when precipitates are fine and closely spaced, because dislocations must bow around them.",
  },
  "Scheil": {
    title: "Scheil-Gulliver",
    def: "Non-equilibrium solidification model assuming complete liquid mixing and zero solid diffusion. Predicts microsegregation and the real eutectic fraction in castings.",
  },
  "ATE": {
    title: "ATE",
    def: "Average Treatment Effect — E[Y | do(R+Δr)] − E[Y | do(R)]. The causal effect of increasing the cooling rate by Δr on yield strength.",
  },
  "Backdoor": {
    title: "Backdoor criterion",
    def: "DoWhy's identification strategy: adjust for confounders that block all non-causal paths from treatment to outcome. Here, cooling rate has no backdoor parents.",
  },
  "EI": {
    title: "Expected Improvement",
    def: "EI(x) = (μ−f*)Φ(z) + σφ(z) — the Bayesian-optimisation acquisition function balancing exploitation (high μ) vs exploration (high σ).",
  },
  "Basquin": {
    title: "Basquin equation",
    def: "σ_a = σ'_f·(2N_f)^b — the high-cycle fatigue law relating stress amplitude to cycles-to-failure. b ≈ −0.09.",
  },
  "Coffin-Manson": {
    title: "Coffin-Manson",
    def: "Δε_p/2 = ε'_f·(2N_f)^c — the low-cycle fatigue law in terms of plastic strain amplitude. c ≈ −0.6.",
  },
  "K_Ic": {
    title: "K_Ic (fracture toughness)",
    def: "The stress-intensity factor at which a crack propagates catastrophically. Steels ~50–150, Al alloys ~20–40 MPa√m.",
  },
  "Ludwik-Hollomon": {
    title: "Ludwik-Hollomon",
    def: "σ = σ_y + K·(ε−ε_y)^n — the elastic-plastic constitutive law. n is the strain-hardening exponent (0 < n < 1).",
  },
  "Cahn-Hilliard": {
    title: "Cahn-Hilliard",
    def: "∂c/∂t = M∇²[ f′(c) − κ∇²c ] — the phase-field equation for spinodal decomposition. Models conserved-order-parameter phase separation.",
  },
  "ASTM": {
    title: "ASTM grain No.",
    def: "G = −3.29 − 6.64·log₁₀(L/mm) — the ASTM E112 grain-size number. Higher G = finer grains. Typical structural alloys: G5–G10.",
  },
  "CFG": {
    title: "CFG (classifier-free guidance)",
    def: "A conditioning technique for diffusion models that interpolates between conditional and unconditional predictions to control fidelity vs diversity.",
  },
  "DDPM": {
    title: "DDPM",
    def: "Denoising Diffusion Probabilistic Model — the generative backbone that learns to reverse a gradual noising process. Used in the Microstructure tab.",
  },
  "Specific strength": {
    title: "Specific strength",
    def: "σ_y / ρ — strength per unit density. The key aerospace efficiency metric (kPa·m³/kg). Al alloys ~100–180, Ti ~200, steel ~85.",
  },
};

interface TermTooltipProps {
  term: keyof typeof GLOSSARY | string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline tooltip that shows a glossary definition on hover. Renders the term
 * text (or children) with a small info icon; hovering/focusing shows the
 * definition in a positioned popover.
 */
export function TermTooltip({ term, children, className }: TermTooltipProps) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!entry) {
    return <span className={className}>{children ?? term}</span>;
  }

  return (
    <span
      className={`relative inline-flex items-center gap-0.5 ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        className="cursor-help border-b border-dotted border-current/40 underline-offset-2"
      >
        {children ?? entry.title}
      </span>
      <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-primary/40 bg-popover p-3 text-[11px] leading-relaxed text-popover-foreground shadow-xl"
          style={{ backdropFilter: "blur(8px)" }}
        >
          <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
            {entry.title}
          </span>
          {entry.def}
        </span>
      )}
    </span>
  );
}
