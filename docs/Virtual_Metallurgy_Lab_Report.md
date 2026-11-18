# Virtual Metallurgy Lab — Comprehensive Platform Report

**Created by:** [Sintheuser](https://github.com/sintheuser/)
**Platform:** Next.js 16 + TypeScript + pycalphad + z-ai-web-dev-sdk
**Version:** Latest (16 modules, 13 API routes)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Backend: Real pycalphad CALPHAD Service](#3-backend-real-pycalphad-calphad-service)
4. [Module 1: Overview Dashboard](#4-module-1-overview-dashboard)
5. [Module 2: Phase Diagram](#5-module-2-phase-diagram)
6. [Module 3: Microstructure Synthesis](#6-module-3-microstructure-synthesis)
7. [Module 4: 3D Grain Visualizer](#7-module-4-3d-grain-visualizer)
8. [Module 5: Solidification (Scheil)](#8-module-5-solidification-scheil)
9. [Module 6: Mechanical Properties](#9-module-6-mechanical-properties)
10. [Module 7: Phase-Field Simulation](#10-module-7-phase-field-simulation)
11. [Module 8: Causal Inference](#11-module-8-causal-inference)
12. [Module 9: Bayesian Optimization](#12-module-9-bayesian-optimization)
13. [Module 10: Property Radar](#13-module-10-property-radar)
14. [Module 11: Alloy Comparison](#14-module-11-alloy-comparison)
15. [Module 12: Sensitivity Analysis](#15-module-12-sensitivity-analysis)
16. [Module 13: Failure Analysis](#16-module-13-failure-analysis)
17. [Module 14: Export & Report](#17-module-14-export--report)
18. [Module 15: Literature References](#18-module-15-literature-references)
19. [Module 16: Reference Architecture](#19-module-16-reference-architecture)
20. [Sidebar: Material Parameters](#20-sidebar-material-parameters)
21. [Supported Alloy Systems](#21-supported-alloy-systems)
22. [Multilingual Support](#22-multilingual-support)
23. [Shareable Recipes & URL Sync](#23-shareable-recipes--url-sync)
24. [Alloy Preset Library](#24-alloy-preset-library)
25. [Session History](#25-session-history)
26. [Technical Stack](#26-technical-stack)
27. [How to Run](#27-how-to-run)

---

## 1. Executive Summary

The Virtual Metallurgy Lab (VML) is an AI-driven materials simulation platform that replaces computationally expensive CALPHAD thermodynamic calculations with ultra-fast surrogate models, generative AI for microstructure synthesis, and causal inference for understanding processing–structure–property relationships. The platform runs real pycalphad equilibrium calculations via a Python sidecar service, generates synthetic SEM microstructure images conditioned on processing parameters, simulates phase-field microstructure evolution in real time, and provides 16 integrated analysis modules covering the full materials engineering workflow.

**Key capabilities:**
- Real CALPHAD phase equilibrium calculations via pycalphad (Al-Cu, Al-Si, Fe-C, Ni-Cr-Co)
- AI-generated SEM microstructure images conditioned on composition, cooling rate, and heat-treatment temperature
- Real-time phase-field microstructure evolution simulation with alloy-specific morphology
- Causal inference (DoWhy-style) for quantifying the effect of processing variables on yield strength
- Bayesian optimization for alloy design (GP surrogate + Expected Improvement)
- Paris-law fatigue life prediction and failure-mode classification
- Bilingual (English/Persian) with RTL support
- Shareable recipe URLs and session history

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (port 3000)                    │
│  ┌──────────┐  ┌──────────────────────────────────────┐  │
│  │ Sidebar   │  │  16 Tabs (Overview → Architecture)   │  │
│  │ (Zustand  │  │  Recharts + Custom SVG + Canvas      │  │
│  │  store)   │  │  Framer Motion + shadcn/ui           │  │
│  └──────────┘  └──────────────────────────────────────┘  │
│                       │                                   │
│         ┌─────────────┼─────────────┐                     │
│         ▼             ▼             ▼                     │
│  /api/predict_phase  /api/generate  /api/causal_effect    │
│  /api/overview       /api/failure   /api/optimize         │
│  /api/scheil         /api/ttt       /api/sensitivity      │
│  /api/report         /api/compare   /api/references       │
│  /api/stress_strain                                       │
│         │                                                 │
│         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Python pycalphad Service (port 8000)                │ │
│  │  FastAPI + pycalphad + SGTE TDB databases            │ │
│  │  Real CALPHAD equilibrium: Al-Cu, Al-Si, Fe-C,       │ │
│  │  Ni-Cr-Co                                            │ │
│  └─────────────────────────────────────────────────────┘ │
│         │                                                 │
│         ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  z-ai-web-dev-sdk (Image Generation)                 │ │
│  │  Conditional diffusion → SEM microstructure images   │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Backend: Real pycalphad CALPHAD Service

The platform includes a **real Python pycalphad service** running on port 8000 that performs actual CALPHAD equilibrium calculations. This is not a surrogate — it uses the `pycalphad` library with assessed thermodynamic databases.

### Databases

| Alloy System | Database | Source |
|-------------|----------|--------|
| Al-Cu | COST507.tdb | Shipped with pycalphad |
| Al-Si | COST507.tdb | Shipped with pycalphad |
| Fe-C | Fe-C.tdb (custom) | Gustafsson 1985 CALPHAD assessment with SGTE unary stabilities |
| Ni-Cr-Co | Ni-Cr-Co.tdb (custom) | Gu & Du CALPHAD assessment with SGTE unary stabilities |

### Endpoints

- `GET /health` — service health check
- `POST /pycalphad/phase` — equilibrium phase fractions at (composition, T)
- `POST /pycalphad/ternary` — isothermal grid for ternary diagram

### Weight → Mole Fraction Conversion

The service automatically converts weight fractions (used in the UI) to mole fractions (required by pycalphad) using atomic weights for each element.

### Fallback

If the pycalphad service is not running, the Next.js API routes gracefully fall back to TypeScript surrogate models (regular-solution Gibbs + lever rule) so the platform always works.

---

## 4. Module 1: Overview Dashboard

**Tab:** Overview (default landing page)

A single-screen at-a-glance summary tying all 15 specialized modules together.

**Features:**
- Hero banner with alloy label, recipe summary, and live status indicator
- 12-KPI grid: dominant phase, yield strength, UTS, elongation, endurance, grain size, ASTM number, precipitate density, Scheil eutectic fraction, σ_y range, fatigue life, causal ATE
- 3 sparkline mini-charts: stress-strain, S-N fatigue, Scheil solidification path
- 12 clickable module-navigation cards (jump to any tab)
- Engineering verdict card: safety factors (fracture/yield), critical flaw, K_Ic — each with SAFE/MARGINAL/FAIL badges

**API:** `POST /api/overview` — aggregates all KPIs in a single call (~7ms)

---

## 5. Module 2: Phase Diagram

**Tab:** Phase

Displays the equilibrium phase diagram for the selected alloy system.

**For binary systems (Al-Cu, Al-Si, Fe-C):**
- 2D phase diagram (liquidus, solidus, solvus curves) with operating point
- Gibbs free-energy curves (liquid vs solid) at the current temperature
- Phase fraction bars (liquid, primary, secondary)
- Surrogate model card with uncertainty bars
- Microstructure metrics (grain size, Hall-Petch, precipitate density)

**For ternary system (Ni-Cr-Co):**
- CALPHAD isothermal section: equilateral triangle with Ni/Cr/Co at vertices
- Phase fields colored: γ-Ni (FCC), α-Cr (BCC), Liquid, γ+α two-phase
- Operating point (white dot) showing current composition
- 40×40 barycentric grid computed from real CALPHAD assessment
- Composition readout (Ni%/Cr%/Co%)

**API:** `POST /api/predict_phase` — calls real pycalphad service when available

**Term tooltips:** Hall-Petch, Basquin, ASTM, Scheil, Paris law, ATE — hover for definitions

---

## 6. Module 3: Microstructure Synthesis

**Tab:** Microstructure

Generates synthetic SEM-style microstructure images conditioned on processing parameters.

**Features:**
- Conditioning vector panel: composition, cooling rate, heat-treatment T, magnification, CFG guidance, diffusion steps
- "Synthesize Microstructure" button with reverse-diffusion progress bar
- Generated image with SEM scale bar, magnification overlay, and source attribution
- Ground-Truth Literature References gallery (17 real peer-reviewed micrographs from Nature, Springer, ASM, QATM)
- Side-by-side "Reference vs Generated" fidelity comparison
- Cooling-rate reference guide with SVG morphology icons (coarse/medium/fine grains)

**Image generation:** Uses `z-ai-web-dev-sdk` image generation API. Each synthesis produces a unique image with:
- Temperature-driven morphology (GP zones → peak ageing → over-aged → solution treated)
- Cooling-rate-driven grain structure (coarse equiaxed → moderate dendritic → fine → ultra-fine cellular)
- Random field-of-view variation for uniqueness
- Alloy-system-specific prompt (Al-Cu, Al-Si, Fe-C, Ni-Cr-Co)

**Applications note section** explaining conditioned generation, materials design loop, and training data augmentation.

---

## 7. Module 4: 3D Grain Visualizer

**Tab:** 3D Grains

An interactive CSS-3D polycrystalline aggregate visualization.

**Features:**
- 3×3×3 = 27 grain cells rendered as translucent copper-tinted cubes
- Glowing teal precipitate dots scattered inside the volume
- Full interactivity: drag to orbit, scroll to zoom, play/pause auto-rotate
- Live-driven by surrogate: grain count/size from grainSize(), precipitate density from precipitateDensity()
- Side panel: ASTM grain number, boundary area, precipitate spacing, strengthening contributions (Hall-Petch, Orowan, solid-solution, σ₀) summing to total σ_y

---

## 8. Module 5: Solidification (Scheil)

**Tab:** Solidification

Simulates non-equilibrium solidification via the Scheil-Gulliver equation.

**Features:**
- Scheil solidification path chart (solid fraction vs temperature, dual-axis with liquid composition)
- Scheil vs equilibrium comparison table (solidus T, eutectic fraction, segregation ratio)
- Governing equations cards: Scheil equation, liquid enrichment, microsegregation

**Physics:**
- Scheil equation: f_s = 1 − ((T_m − T_L)/(T_m − T))^(1/k)
- Liquid enrichment: x_L = x_0 · (1 − f_s)^(k−1)
- Partition coefficient k = x_max_solid / x_eutectic

---

## 9. Module 6: Mechanical Properties

**Tab:** Mechanical

Constitutive and fatigue analysis.

**Features:**
- Stress-strain curve (Ludwik-Hollomon: σ = σ_y + K·(ε−ε_y)^n) with Considère necking criterion
- S-N fatigue curve (Basquin + Manson-Coffin) with endurance limit and transition life
- TTT diagram for Fe-C steel (C-slider controlled, pearlite/bainite/martensite C-curves, A1/A3/Ms/Mf)
- Constitutive law cards: Hollomon, Ludwik, Basquin, Coffin-Manson

**Output:** yield strength, UTS, uniform elongation, Young's modulus, strain-hardening exponent, endurance limit, fatigue transition life

---

## 10. Module 7: Phase-Field Simulation

**Tab:** Phase-Field

Real-time microstructure evolution simulation with alloy-specific morphology.

**Features:**
- 128×128 grid SEM-style greyscale rendering
- Two simulation modes: Grain Growth (curvature-driven) and Precipitation + Ripening
- Alloy-specific distinct morphology:
  - **Al-Cu:** θ-Al₂Cu particles (dark) at boundaries (slow) or needles in matrix (fast)
  - **Al-Si:** Eutectic Si patches (dark) at boundaries
  - **Fe-C:** Pearlite (dark lamellar stripes), Bainite (dark laths), Martensite (light needles) depending on cooling rate
  - **Ni-Cr-Co:** γ′ cuboidal precipitates (dark squares inside grains)
- Live animation phases: nucleation → growth → coarsening (Ostwald) → dissolution
- Equilibrium volume fraction cap (lever rule) — growth stops at thermodynamic limit
- Precipitate dissolution above solvus temperature

**Physical constraints enforced:**
- Grain growth: Arrhenius D = D₀·exp(-Q/RT), Q per alloy system (150-280 kJ/mol)
- SDAS ∝ R^(-0.5) (finer grains at higher cooling rates)
- Ostwald ripening: r³ ∝ K·t (driven by heat-treatment temperature)
- Precipitate fraction capped at lever-rule equilibrium
- Scale bar changes with magnification setting

**All parameters synced from sidebar:** heat-treatment T, cooling rate, composition, alloy system

---

## 11. Module 8: Causal Inference

**Tab:** Causal

DoWhy-style causal analysis of processing variables on yield strength.

**Features:**
- Intervention setup: Δ cooling rate slider, sample size slider
- ATE headline card: Average Treatment Effect, std error, 95% CI, per-K-s sensitivity
- Interactive causal DAG: [Composition, Heat-T, Cooling Rate] → [Grain Size, Precipitate Density, α-Fraction] → [Yield Strength]
- Baseline vs treated bar chart with error bars
- DoWhy refuter table: placebo treatment, random common cause, data subsetting — each PASS/WARN
- Path decomposition: Hall-Petch contribution, Orowan contribution, direct effect

**Structural Causal Model:**
- G = β_GR·R + β_GH·H + β_GC·C + N_G (grain size)
- P = β_PC·C + β_PH·H + N_P (precipitate density)
- Y = β_YG·G + β_YP·P + β_YA·A + β_YC·C + N_Y (yield strength)

**Applications note section** explaining beyond-correlation, PSP chain, and robustness/refutation.

---

## 12. Module 9: Bayesian Optimization

**Tab:** Optimization

Active-learning alloy design loop.

**Features:**
- BO campaign setup: iterations slider, random seed
- Best-design headline: σ_y, improvement, best Cu/H/R
- Convergence chart (best σ_y vs iteration)
- Expected Improvement acquisition chart (EI vs cooling rate)
- Design-space scatter (Cu × R, colored by σ_y, size by σ_y)
- Full experiment log table (17+ evaluations)

**Algorithm:**
- Gaussian-process surrogate with squared-exponential (RBF) kernel
- Expected Improvement acquisition: EI(x) = (μ−f*)Φ(z) + σφ(z)
- 5-point Latin-hypercube initial design + iterative BO
- Matrix inversion via Gauss-Jordan elimination
- "Apply optimal recipe" button writes BO-best (C, H, R) back to sidebar

---

## 13. Module 10: Property Radar

**Tab:** Property Radar

Multi-axis benchmarking against real engineering alloys.

**Features:**
- 6-axis radar chart: Yield, UTS, Elongation, Fatigue, Lightness, Cost-value
- Comparison against 6 real alloys: AA2024-T3 (345 MPa), AA7075-T6 (503), AA6061-T6 (276), AISI 4140 Q&T (655), AISI 304 (215), Ti-6Al-4V (880)
- Closest-alloy finder (Euclidean distance in property space)
- Engineering alloy database table
- Trade-off analysis: specific strength, strength-ductility, fatigue ratio

---

## 14. Module 11: Alloy Comparison

**Tab:** Compare

Side-by-side head-to-head comparison of two alloys.

**Features:**
- Two config cards (Alloy A / Alloy B) with independent alloy system, composition, cooling rate, heat-treatment T
- Head-to-head KPI: yield, UTS, specific strength, endurance — with "A wins / B wins by X"
- Overlaid phase-boundary chart (Alloy B dashed)
- Dual stress-strain curves (Alloy B dashed)
- Property delta table (7 properties, signed Δ colored green/amber)
- Engineering verdict: weighted score → "Alloy X wins by Y%"

**API:** `POST /api/compare` — returns both alloys' data in one call

---

## 15. Module 12: Sensitivity Analysis

**Tab:** Sensitivity

Design-space heatmap and sweep curves.

**Features:**
- Custom SVG heatmap: 24×28 grid of (composition × cooling-rate), copper→amber→emerald gradient
- Hover any cell for readout (composition, R, σ_y, UTS)
- Heat-treatment T slider that re-sweeps the grid
- 4 KPI cards: min σ_y, max σ_y, dynamic range
- σ_y vs cooling-rate sweep (log-x)
- σ_y vs composition sweep
- Hover readout bar

**API:** `POST /api/sensitivity` — 24×28 grid + 1-D sweeps

---

## 16. Module 13: Failure Analysis

**Tab:** Failure

Paris-law crack growth and failure-mode prediction.

**Features:**
- Load & Flaw config: Δσ (20-400 MPa), a₀ (0.01-5 mm), stress ratio R (-1 to 0.9)
- 3 KPI cards: fatigue life N_f, critical flaw a_c, safety factor n_fracture
- Failure-mode banner: Brittle/Ductile/Mixed with probability bars
- Paris-law chart: da/dN vs ΔK (log-log)
- Crack-length-vs-cycles chart: a(N) with a_c and N_f reference lines
- Safety factors card: n_yield, n_fracture (SAFE/MARGINAL/FAIL)
- Material state card: grain, σ_y, UTS, K_Ic, Paris C/m
- Failure-mode map: toughness-ratio × stress-ratio plane with zones

**Physics:**
- Paris law: da/dN = C·(ΔK)^m, ΔK = Y·Δσ·√(πa)
- Critical flaw: a_c = (K_Ic / (Y·Δσ·√π))²
- Fatigue life: N_f = ∫ da / [C·(Y·Δσ·√(πa))^m]
- K_Ic: 20-40 MPa√m (Al), 50-150 (steel), 30+ (Ni)

---

## 17. Module 14: Export & Report

**Tab:** Report

Engineering datasheet export.

**Features:**
- JSON download: full nested report object (10 sections)
- CSV download: flattened Section/Property/Value/Unit rows
- Print/PDF (window.print)
- Summary headline: one-line alloy verdict
- 6-section datasheet grid: Phase, Microstructure, Mechanical, Solidification, Failure, Causal
- Sensitivity range + report metadata

**API:** `POST /api/report` — aggregates all 9 analyses in one call

---

## 18. Module 15: Literature References

**Tab:** References

Curated library of 17 real peer-reviewed micrographs.

**Features:**
- Category filters: All / Al-Cu dendritic / Al-Si eutectic / Steel pearlite-bainite / Fractography
- Gallery grid with technique badges (SEM, Optical), magnification, source attribution
- Lightbox modal with full caption, source link, dimensions
- Methodology concepts from web research (CALPHAD, Scheil, Hall-Petch, Orowan, ML surrogates)

**Sources:** Nature, Springer, ASM International, Cambridge University Press, QATM, Nanoscience Instruments, LFF Group, ZHY Casting

---

## 19. Module 16: Reference Architecture

**Tab:** Architecture

Display of the complete Python reference code.

**Features:**
- File-tree selector: surrogate_engine.py, generative_microstructure.py, causal_analyzer.py, main.py (FastAPI), app.py (Streamlit)
- Syntax-highlighted code viewer (Prism oneDark) with line numbers
- Copy button
- Stack overview cards: Domain Logic, Deep Learning, Causal Inference, Serving
- 2,137 total lines of Python reference code

---

## 20. Sidebar: Material Parameters

The sidebar is the control center for all modules.

**Sections:**
1. **Alloy Presets** — 12 one-click real alloy tempers (AA2024-T3, AA7075-T6, AA6061-T6, A356-T6, AISI 4140 Q&T, AISI 304, Inconel 625, Haynes 188, etc.)
2. **Material** — Alloy system selector (Al-Cu, Al-Si, Fe-C, Ni-Cr-Co), composition sliders (Cr + Co for ternary)
3. **Thermal Processing** — Heat-treatment T (20-1600°C), cooling rate (0.1-500 K/s, log scale), SEM magnification (500×-25000×)
4. **AI Models** — Surrogate model toggle (Graph GNN / Tabular MLP / Ensemble), diffusion sampler (steps 10-100, CFG 1-15)
5. **Session History** — Auto-logged recent alloys (localStorage), click to restore

---

## 21. Supported Alloy Systems

| System | Type | Phases | TDB Database | pycalphad |
|--------|------|--------|-------------|-----------|
| Al-Cu | Binary | α-Al (FCC), θ-Al₂Cu, Liquid | COST507.tdb | ✅ Real |
| Al-Si | Binary | α-Al (FCC), β-Si, Liquid | COST507.tdb | ✅ Real |
| Fe-C | Binary | α-Fe (BCC), γ-Fe (FCC), Fe₃C, Liquid | Fe-C.tdb (Gustafsson) | ✅ Real |
| Ni-Cr-Co | Ternary | γ-Ni (FCC), α-Cr (BCC), Liquid | Ni-Cr-Co.tdb (Gu & Du) | ✅ Real |

Each system has:
- Alloy-specific yield-strength model with handbook-calibrated baselines
- Alloy-specific phase-field morphology
- Alloy-specific SEM generation prompts
- Alloy-specific ternary diagram (Ni-Cr-Co) or binary phase diagram
- Alloy-specific presets

---

## 22. Multilingual Support

- **English (EN)** and **Persian/Farsi (فا)** with a compact EN/فا toggle in the header
- ~80 translated strings covering all UI elements
- Automatic RTL (right-to-left) layout when Persian is active
- Language preference persisted to localStorage
- Applied to: header, title strip, all 16 tab labels, sidebar sections, presets, history, footer

---

## 23. Shareable Recipes & URL Sync

- Full alloy recipe encoded in URL query string: `?sys=Al-Cu&x=0.04&x2=0.10&H=190&R=8&mag=2500&model=graph-gnn&steps=50&cfg=7.5`
- Two-way binding: changing sidebar updates URL (debounced 400ms), loading a URL restores the recipe
- "Share" button in header copies the current recipe URL to clipboard
- Recipes can be bookmarked or shared with collaborators

---

## 24. Alloy Preset Library

12 curated real engineering alloy tempers with handbook yield-strength references:

| Preset | System | Composition | HT (°C) | R (K/s) | σ_y (MPa) |
|--------|--------|------------|---------|---------|-----------|
| AA2024-T3 | Al-Cu | 4.5% Cu | 495 | 30 | 345 |
| AA2024-T6 | Al-Cu | 4.5% Cu | 190 | 25 | 395 |
| AA7075-T6 (sim) | Al-Cu | 6.0% Cu | 120 | 40 | 503 |
| AA6061-T6 (sim) | Al-Si | 0.8% Si | 175 | 15 | 276 |
| A356-T6 (cast) | Al-Si | 7.0% Si | 155 | 4 | 220 |
| Al-Si eutectic | Al-Si | 12.7% Si | 200 | 2 | 150 |
| AISI 4140 Q&T | Fe-C | 0.4% C | 650 | 60 | 655 |
| AISI 4140 annealed | Fe-C | 0.4% C | 845 | 0.5 | 415 |
| AISI 304 (sim) | Fe-C | 0.08% C | 1050 | 8 | 215 |
| Inconel 625 (base) | Ni-Cr-Co | 21.7% Cr + 10% Co | 650 | 8 | 415 |
| Haynes 188 (base) | Ni-Cr-Co | 22% Cr + 35% Co | 1175 | 6 | 460 |
| Ni-Cr-Co High-Cr | Ni-Cr-Co | 45% Cr + 10% Co | 800 | 15 | 520 |

Category filters: All / Wrought Al / Cast Al / Steel / Stainless

---

## 25. Session History

- Auto-logs every alloy recipe explored (debounced 900ms after parameter change)
- Each entry: alloy system, composition, heat-T, cooling rate, predicted σ_y, timestamp
- Click any entry to restore that recipe to the sidebar
- Collapsible panel at the bottom of the sidebar
- Persisted to localStorage (max 24 entries, deduplication)

---

## 26. Technical Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| State | Zustand (lab store, history store, language store) |
| Charts | Recharts 2.15 + custom SVG |
| Code highlighting | react-syntax-highlighter (Prism oneDark) |
| Icons | Lucide React |
| AI Image Gen | z-ai-web-dev-sdk (image generation API) |
| CALPHAD | pycalphad 0.11 + FastAPI + uvicorn (Python sidecar) |
| Database | Prisma ORM (SQLite) |
| Animations | Framer Motion + CSS keyframes |
| Language | i18n (en/fa) with RTL support |

---

## 27. How to Run

### Prerequisites
- Node.js 18+ / Bun
- Python 3.10+ with pip (for pycalphad service)

### Start the pycalphad service (port 8000)
```bash
pip install pycalphad fastapi uvicorn
cd mini-services/pycalphad-service
python3 server.py
```

### Start the Next.js app (port 3000)
```bash
bun run dev
```

### Access
Open `http://localhost:3000` in your browser. The app auto-detects the pycalphad service on port 8000. If the service is not running, it falls back to TypeScript surrogate models.

---

*Created by [Sintheuser](https://github.com/sintheuser/)*
