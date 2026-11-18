# Heat Treatment Framework — Rebuild Spec

**Goal**: Rebuild the complete Heat Treatment Simulation & Optimization Framework that was lost. This is a full-stack feature: Python backend service (port 8001) + Next.js frontend tab + API routes.

**Backend service**: `mini-services/heat-treatment-service/` on **port 8001**
**Frontend**: new `heat` tab in the Virtual Metallurgy Lab
**Thermodynamic backend**: calls existing `pycalphad-service` on port 8000.

---

## 1. Backend: heat-treatment-service (port 8001)

Create `mini-services/heat-treatment-service/` with these files:

### `start.sh` (executable)
```bash
#!/bin/bash
cd "$(dirname "$0")"
source /home/z/.venv/bin/activate
exec python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

### `package.json`
```json
{ "name": "heat-treatment-service", "version": "1.0.0", "type": "module",
  "scripts": { "dev": "bash start.sh" } }
```

### `requirements.txt`
```
fastapi
uvicorn
pydantic
numpy
scipy
scikit-learn
pandas
httpx
```

### Python modules (11 files):

**`models.py`** — Pydantic models:
- `Alloy`: system (str), name (str), composition (Dict[str, float] — wt%)
- `HTStep`: id, name, process, target_temp_c, heating_rate, holding_time_min, atmosphere, pressure_mpa, cooling_method, cooling_rate, cycles
- `Workflow`: name, steps (List[HTStep])
- `RunRequest`: alloy, workflow, options (compute_ttt, compute_cct, uncertainty, n_uncertainty_samples)
- Response models for results

**`workflow.py`** — WorkflowEngine:
- `expand_cycles(steps)`: expand steps with cycles>1
- `build_temperature_profile(steps)`: return list of [time_min, temp_C] points
- `validate_workflow(steps)`: check connectivity

**`thermodynamics.py`** — CALPHAD integration:
- `equilibrium_phases(alloy, T_C)`: call http://localhost:8000/pycalphad/phase with 5s timeout
- `regular_solution_fallback(alloy, T_C)`: Gibbs fallback if pycalphad unreachable
- Cache results

**`kinetics.py`** — Phase transformation kinetics:
- `fe_c_critical_temperatures(comp)`: A1, A3, Ms (Andrews), Mf
  - A1 = 727, A3 = 910 - 200*C - 30*Mn - 11*Cr - 20*Ni - 50*Mo - 60*Si
  - Ms = 539 - 423*C - 30.4*Mn - 17.7*Ni - 12.1*Cr - 7.5*Mo + 10*Co - 7.5*Si
  - Mf = Ms - 215
- `compute_transformation(comp, T_C, cooling_rate_K_per_s)`: return phase fractions (martensite, bainite, ferrite, pearlite, retained_austenite, cementite)
  - If cooling_rate > critical_full_martensite: martensite fraction = 1 - exp(-0.011*(Ms - T_final))
  - Else JMAK: X = 1 - exp(-(k*t)^n), k = k0*exp(-Q/RT)
- `grain_growth(T_C, t_min, alloy_system)`: parabolic Arrhenius d² = d0² + K0*exp(-Q/RT)*t
  - Fe: Q=280kJ/mol, K0=8e-3; Al: Q=140kJ/mol, K0=2e-4; Ni: Q=320kJ/mol, K0=1e-3
- `generate_ttt(alloy)`: return curves for ferrite_start/finish, pearlite_start/finish, bainite_start/finish, martensite_start (Ms, Mf as horizontal lines)
- `generate_cct(alloy)`: same as TTT but shifted rightward by cooling rate

**`properties.py`** — Property prediction:
- `mechanical_properties(alloy, microstructure)`: 
  - yield = sigma_0 + k_HP*d^(-0.5) + sigma_ss + sigma_precip
    - sigma_0: Fe=50, Al=20, Ni=80 MPa
    - k_HP: Fe=0.45, Al=0.07, Ni=0.3 MPa·m^0.5
    - sigma_ss per wt%: Fe→Mn 30, Si 80, Ni 20, Cr 20, Mo 15; Al→Cu 40, Si 40
    - sigma_precip = 1000*f^0.5*r^(-0.5)
  - UTS = 1.15*yield (Fe), 1.25*yield (Al), 1.10*yield (Ni)
  - HRC = yield/3.3 - 20; HV = yield/3
  - elongation = 30 - 0.025*yield (steels), floor 5%
  - toughness = 200*exp(-0.06*(HRC-20)) J
  - fatigue = 0.45*UTS (ferrous), 0.35*UTS (non-ferrous)
- `physical_properties(alloy)`:
  - density: Fe-C 7.874-0.04*C-0.012*Si-0.016*Mn; Al-Cu 2.70-0.012*Cu; Al-Si 2.69-0.006*Si; Ni-Cr-Co 8.90-0.005*Cr+0.001*Co
  - thermal_conductivity, electrical_conductivity, elastic_modulus, CTE (composition-weighted)

**`optimization.py`** — Process optimization:
- `bayesian_optimize(alloy, objective, param_space, n_iterations, constraints)`: GP surrogate + EI
- `genetic_optimize(...)`: custom GA (pop 20, 10 gen, tournament, SBX, polynomial mutation)
- `random_optimize(...)`, `grid_optimize(...)`
- `nsga2_multiobjective(alloy, objectives, param_space, n_iterations)`: Pareto front
- Each returns: best_workflow, best_params, best_properties, best_objective_value, convergence, all_trials, pareto_front (for multi)

**`ml_surrogate.py`** — ML models:
- `generate_dataset(n_samples=300)`: Latin-hypercube sampling of composition × workflow params, labeled by physics engine
- `train_models()`: RandomForest, GradientBoosting, MLP (sklearn)
- `predict(alloy, workflow, model_name)`: return predictions + training R²

**`presets.py`** — 8 preset workflows:
1. quench-temper-1040 (Fe-C, 0.4%C): austenitize 850°C → water quench → temper 550°C
2. normalize-1045 (Fe-C, 0.45%C): austenitize 870°C → air cool
3. austemper-4340 (Fe-C, 0.4%C+Ni/Cr/Mo): austenitize 845°C → salt bath 330°C
4. age-hardening-alcu-4 (Al-Cu, 4%Cu): solution 540°C → water quench → age 190°C
5. solution-treat-al-si (Al-Si, 7%Si): solution 540°C → age 165°C
6. stress-relief-1020 (Fe-C, 0.2%C): 595°C → furnace cool
7. martemper-d6 (Fe-C, 2%C+12%Cr): preheat → austenitize → equalize → temper ×2
8. dual-treatment-inconel (Ni-Cr-Co, 20%Cr+15%Co): solution 1080°C → age 850°C → age 760°C

**`viz.py`** — formatting helpers for T-profile and phase-evolution charts

**`main.py`** — FastAPI app with endpoints:
- `GET /health` → {ok, service, version, pycalphad_reachable, engines, databases}
- `GET /presets` → {ok, presets: [...]}
- `GET /databases` → {ok, databases: [...]}
- `POST /run` → full simulation (final_microstructure, phase_fractions, mechanical_properties, physical_properties, processing_history, workflow_summary, uncertainty_estimates)
- `POST /ttt` → {ok, curves, Ms_C, Mf_C, A1_C, A3_C}
- `POST /cct` → same shape as TTT
- `POST /optimize` → {ok, method, best_workflow, best_params, best_properties, best_objective_value, convergence, all_trials, pareto_front?}
- `POST /predict` → {ok, model, predictions, training_r2}

CORS: allow all. Every endpoint wraps in try/except → {ok: false, error: str(e)}.

### Cooling rates by method (K/min):
water_quench=6000, oil_quench=1500, polymer_quench=3000, gas_quench=600, air_cool=60, furnace_cool=6, salt_bath=300, controlled=user

---

## 2. Also fix: pycalphad-service (port 8000)

The existing `mini-services/pycalphad-service/server.py` works but has NO start script. Create `mini-services/pycalphad-service/start-pycalphad.sh`:
```bash
#!/bin/bash
cd "$(dirname "$0")"
source /home/z/.venv/bin/activate
exec python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
Make it executable. Start the service in background.

---

## 3. Frontend: heat-treatment-types.ts

Create `src/lib/heat-treatment-types.ts` with:
- Types: `HTProcess`, `HTCoolingMethod`, `HTAtmosphere`, `HTStep`, `HTResults`, `HTOptimizationResult`, `HTPreset`, `HTCurve`, `HTAlloy`
- Constants: `PROCESS_OPTIONS` (11 types), `COOLING_METHOD_OPTIONS` (8), `ATMOSPHERE_OPTIONS` (8)
- `PROCESS_COLORS` map (11 process types → tailwind classes, NO indigo/blue — use amber/orange/cyan/rose/emerald/teal/fuchsia/lime/yellow/slate)
- `COOLING_RATE_BY_METHOD` (K/min defaults)
- `DEFAULT_HT_WORKFLOW` (2-step quench-and-temper)
- `makeDefaultStep(prev?)`, `newStepId()`
- `computeTemperatureTimeCurve(steps)` → [{t, T}] client-side

---

## 4. Frontend: lab-store.ts additions

Add to existing Zustand store:
```ts
// Fe-C alloying elements (weight fractions)
niWt: number; crWt: number; mnWt: number; siWt: number; moWt: number;
setNiWt, setCrWt, setMnWt, setSiWt, setMoWt: (v: number) => void;

// HT state (persisted to localStorage)
htWorkflow: HTStep[];          // key: vml-ht-v1
htSelectedStepId: string | null;
htResults: HTResults | null;   // key: vml-ht-results-v1
htOptimizationResult: any;     // key: vml-ht-opt-v1
setHtWorkflow, addHtStep, updateHtStep, removeHtStep, moveHtStep, selectHtStep, setHtResults, setHtOptimizationResult
```
Persist htWorkflow, htResults, htOptimizationResult to localStorage. Export `hydrateHtWorkflow()` for client-side hydration.

---

## 5. Frontend: i18n.ts additions

Add `"heat"` to the `tabs` object in BOTH en and fa dictionaries:
- en: `"heat": "Heat Treatment"`
- fa: `"heat": "عملیات حرارتی"`

---

## 6. Frontend: API proxy routes (8 files)

Create `src/app/api/ht/` with 8 routes, each proxies to `http://localhost:8001/<path>`:
- `health/route.ts` (GET)
- `presets/route.ts` (GET)
- `databases/route.ts` (GET)
- `run/route.ts` (POST)
- `optimize/route.ts` (POST)
- `ttt/route.ts` (POST)
- `cct/route.ts` (POST)
- `predict/route.ts` (POST)

Each: 10s AbortController timeout, forward JSON, return upstream JSON. On failure: {ok: false, error} with 502.

---

## 7. Frontend: heat-treatment-tab.tsx (~2000 lines)

3-column layout (`xl:grid-cols-12`):
- **LEFT (3/12)**: AlloyCard (system selector + composition sliders, reuses lab store) + StepEditorCard (all step params)
- **CENTER (6/12)**: WorkflowPipelineCard (color-coded nodes with up/down/delete) + TemperatureTimeCurveCard (Recharts, client-computed) + TttCctCard (auto-loads TTT on mount, Show TTT/CCT toggle)
- **RIGHT (3/12)**: ResultsCard (4 sub-tabs: Microstructure/Mechanical/Physical/History) + OptimizationCard

Key behaviors:
- **Auto-run on first visit**: if no persisted results, load alloy-matched preset + run simulation automatically
- **Auto-load TTT** on mount
- **Pretty phase names**: `prettyPhase()` maps raw keys (alpha_al, martensite_start) → proper labels (α-Al, Martensite)
- **Uncertainty bars** on mechanical property cards
- **Pareto front** scatter for multi-objective optimization
- **Apply Best Workflow** button
- Use shadcn/ui components, Recharts, lucide-react icons
- NO indigo/blue — amber/orange heat theme

---

## 8. page.tsx wiring

- Import HeatTreatmentTab
- Add `<TabTrigger value="heat" icon={<Workflow />}>` 
- Add `<TabsContent value="heat"><ErrorBoundary><HeatTreatmentTab /></ErrorBoundary></TabsContent>`
- Remove Architecture tab (import, TabTrigger, TabsContent, FileCode2 icon)
- TOTAL_TABS = 16 (was 16 with arch, now 16 without arch + with heat)

---

## 9. Reports

After everything works, write:
- `MODULES_REPORT.md` — detailed doc of Heat Treatment + Sensitivity + Failure modules
- `PROJECT_REPORT.md` — full project overview

---

## 10. Verification

1. `bun run lint` → 0 errors
2. Start pycalphad-service (port 8000) + heat-treatment-service (port 8001)
3. `curl http://localhost:8001/health` → ok=true
4. `curl http://localhost:8001/presets` → 8 presets
5. agent-browser: open HT tab → results auto-populate → TTT auto-loads → CCT toggle works → optimization runs
