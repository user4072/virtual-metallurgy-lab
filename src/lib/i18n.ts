/**
 * i18n.ts
 * -----------------------------------------------------------------------------
 * Bilingual (English / Persian-Farsi) dictionary for the Virtual Metallurgy Lab.
 * Persian is the official language of Iran (فارسی). When `fa` is active, the
 * document direction switches to RTL (right-to-left).
 *
 * Keys are organised by component so the consumer can do t.header.title etc.
 * -----------------------------------------------------------------------------
 */


export interface Dict {
  dir: "ltr" | "rtl";
  // ---- Header ----
  header: {
    subtitle: string;
    share: string;
    copied: string;
    shareToastTitle: string;
    shareToastDesc: string;
    clock: string; // IRST label
  };
  // ---- Page title strip ----
  page: {
    breadcrumb: { vml: string; session: string; dashboard: string };
    title: string;
    subtitle: string;
    modules: string;
    online: string;
  };
  // ---- Tab labels ----
  tabs: {
    overview: string;
    phase: string;
    micro: string;
    micro3d: string;
    scheil: string;
    mech: string;
    field: string;
    causal: string;
    opt: string;
    radar: string;
    compare: string;
    sens: string;
    fail: string;
    report: string;
    refs: string;
    arch: string;
    ht: string;
  };
  // ---- Heat-treatment framework tab ----
  heat: {
    title: string;
    subtitle: string;
    alloy: string;
    alloySystem: string;
    feCAlloying: string;
    ni: string;
    cr: string;
    mn: string;
    si: string;
    mo: string;
    pipeline: string;
    pipelineHint: string;
    addStep: string;
    step: string;
    stepEditor: string;
    stepName: string;
    selectStep: string;
    process: string;
    targetTemp: string;
    holdingTime: string;
    heatingRate: string;
    coolingMethod: string;
    coolingRate: string;
    atmosphere: string;
    pressure: string;
    cycles: string;
    cyclesShort: string;
    loadPreset: string;
    presetHint: string;
    runSimulation: string;
    running: string;
    reRun: string;
    results: string;
    noResults: string;
    noResultsHint: string;
    phaseFractions: string;
    dominantPhase: string;
    microstructure: string;
    grainSize: string;
    hardness: string;
    mechanical: string;
    yieldStrength: string;
    uts: string;
    elongation: string;
    toughness: string;
    fatigue: string;
    elasticMod: string;
    thermalCond: string;
    elecCond: string;
    density: string;
    cte: string;
    physical: string;
    processingHistory: string;
    history: string;
    tttCct: string;
    showTtt: string;
    showCct: string;
    tttError: string;
    loadingTtt: string;
    tempTimeCurve: string;
    optimization: string;
    objective: string;
    runOptimization: string;
    bestParams: string;
    applyBest: string;
    appliedBest: string;
    paretoFront: string;
    convergence: string;
    iterations: string;
    noOptResult: string;
    method: string;
    uncertainty: string;
    serviceDown: string;
    serviceDownHint: string;
  };
  // ---- Sidebar ----
  sidebar: {
    materialParams: string;
    presets: string;
    // group labels
    groupMaterial: string;
    groupThermal: string;
    groupModels: string;
    // sections
    alloySystem: string;
    solvent: string;
    solute: string;
    meltSolvent: string;
    eutectic: string;
    composition: string;
    inspectionTemp: string;
    heatTreatment: string;
    coolingRate: string;
    airCool: string;
    oilQuench: string;
    water: string;
    magnification: string;
    surrogateModel: string;
    graphGnn: string;
    tabularMlp: string;
    ensemble: string;
    diffusionSampler: string;
    inferenceSteps: string;
    guidanceScale: string;
    session: string;
    live: string;
    // presets
    presetCategories: { all: string; wroughtAl: string; castAl: string; steel: string; stainless: string };
    // history
    history: string;
    historyEmpty: string;
    clear: string;
  };
  // ---- Footer ----
  footer: {
    tagline: string;
    inferenceOnDevice: string;
    docs: string;
    source: string;
  };
}

const en: Dict = {
  dir: "ltr",
  header: {
    subtitle: "AI-Driven Materials Simulation · Surrogate · Diffusion · Causal",
    share: "Share",
    copied: "Copied!",
    shareToastTitle: "Recipe link copied",
    shareToastDesc: "The full alloy recipe is now in your clipboard.",
    clock: "IRST",
  },
  page: {
    breadcrumb: { vml: "VML", session: "Session", dashboard: "Engineering Dashboard" },
    title: "Materials Engineering Dashboard",
    subtitle:
      "Surrogate · Scheil solidification · Mechanical & fatigue · Causal inference · Bayesian optimisation · Phase-field — real-time.",
    modules: "modules",
    online: "all engines online",
  },
  tabs: {
    overview: "Overview",
    phase: "Phase",
    micro: "Microstructure",
    micro3d: "3D Grains",
    scheil: "Solidification",
    mech: "Mechanical",
    field: "Phase-Field",
    causal: "Causal",
    opt: "Optimization",
    radar: "Property Radar",
    compare: "Compare",
    sens: "Sensitivity",
    fail: "Failure",
    report: "Report",
    refs: "References",
    arch: "Architecture",
    ht: "Heat Treatment",
  },
  sidebar: {
    materialParams: "Material Parameters",
    presets: "Alloy Presets",
    groupMaterial: "Material",
    groupThermal: "Thermal Processing",
    groupModels: "AI Models",
    alloySystem: "Alloy System",
    solvent: "Solvent",
    solute: "Solute",
    meltSolvent: "Tₘ (solvent)",
    eutectic: "T_eutectic",
    composition: "Composition",
    inspectionTemp: "Inspection Temp.",
    heatTreatment: "Heat-Treatment T",
    coolingRate: "Cooling Rate",
    airCool: "Air cool",
    oilQuench: "Oil quench",
    water: "Water",
    magnification: "SEM Magnification",
    surrogateModel: "Surrogate Model",
    graphGnn: "Graph GNN (PyG · GAT)",
    tabularMlp: "Tabular MLP",
    ensemble: "Ensemble (5× deep)",
    diffusionSampler: "Diffusion Sampler",
    inferenceSteps: "Inference steps",
    guidanceScale: "Guidance scale (CFG)",
    session: "session",
    live: "live",
    presetCategories: { all: "All", wroughtAl: "Wrought Al", castAl: "Cast Al", steel: "Steel", stainless: "Stainless" },
    history: "Session History",
    historyEmpty: "Adjust parameters to start logging explored alloys.",
    clear: "clear",
  },
  footer: {
    tagline: "AI-Driven Materials Simulation Platform · surrogate + diffusion + causal",
    inferenceOnDevice: "inference on-device",
    docs: "docs",
    source: "source",
  },
  heat: {
    title: 'Heat-Treatment Framework',
    subtitle: 'Multi-step process pipelines · TTT/CCT · property prediction · Bayesian optimization',
    alloy: 'Alloy',
    alloySystem: 'Alloy system',
    feCAlloying: 'Steel alloying (wt%)',
    ni: 'Ni',
    cr: 'Cr',
    mn: 'Mn',
    si: 'Si',
    mo: 'Mo',
    pipeline: 'Process pipeline',
    pipelineHint: 'Chain heating, holding, quenching and tempering steps — the simulator walks the pipeline sequentially.',
    addStep: 'Add step',
    step: 'Step',
    stepEditor: 'Step editor',
    stepName: 'Step name',
    selectStep: 'Select a step to edit its parameters.',
    process: 'Process type',
    targetTemp: 'Target temperature (°C)',
    holdingTime: 'Holding time (min)',
    heatingRate: 'Heating rate (K/min)',
    coolingMethod: 'Cooling method',
    coolingRate: 'Cooling rate (K/s)',
    atmosphere: 'Atmosphere',
    pressure: 'Pressure (bar)',
    cycles: 'Number of cycles',
    cyclesShort: 'cycles',
    loadPreset: 'Load preset',
    presetHint: 'Handbook heat-treatment recipes for common grades.',
    runSimulation: 'Run simulation',
    running: 'Running…',
    reRun: 'Re-run',
    results: 'Results',
    noResults: 'No simulation yet',
    noResultsHint: 'Configure the pipeline and press Run to walk the heat-treatment workflow.',
    phaseFractions: 'Final phase fractions',
    dominantPhase: 'Dominant phase',
    microstructure: 'Microstructure',
    grainSize: 'Grain size (µm)',
    hardness: 'Hardness (HRC)',
    mechanical: 'Mechanical properties',
    yieldStrength: 'Yield strength (MPa)',
    uts: 'UTS (MPa)',
    elongation: 'Elongation (%)',
    toughness: 'Toughness (MPa·m½)',
    fatigue: 'Fatigue strength (MPa)',
    elasticMod: 'E (GPa)',
    thermalCond: 'Thermal conductivity (W/m·K)',
    elecCond: 'Electrical conductivity (%IACS)',
    density: 'Density (g/cm³)',
    cte: 'CTE (10⁻⁶/K)',
    physical: 'Physical properties',
    processingHistory: 'Processing history',
    history: 'History',
    tttCct: 'TTT / CCT',
    showTtt: 'TTT',
    showCct: 'CCT',
    tttError: 'TTT/CCT computation failed',
    loadingTtt: 'Computing diagram…',
    tempTimeCurve: 'Temperature–time profile',
    optimization: 'Optimization',
    objective: 'Objective',
    runOptimization: 'Run optimization',
    bestParams: 'Best parameters',
    applyBest: 'Apply best',
    appliedBest: 'Applied best parameters to the pipeline.',
    paretoFront: 'Pareto front',
    convergence: 'Convergence',
    iterations: 'Iterations',
    noOptResult: 'No optimization result yet — press Run optimization.',
    method: 'Method',
    uncertainty: 'Uncertainty (±1σ)',
    serviceDown: 'Heat-treatment service offline',
    serviceDownHint: 'Start it with: python scripts/start_service.py heat-treatment — a TS fallback serves TTT/CCT in the meantime.',
  },
};

export const DICTS = { en } as const;
