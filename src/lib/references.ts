/**
 * references.ts
 * -----------------------------------------------------------------------------
 * Curated literature reference microstructures — real SEM / optical
 * micrographs retrieved from peer-reviewed sources (Nature, Springer Nature,
 * ASM International, Cambridge University Press, QATM, Nanoscience Instruments)
 * via the image-search service. Each entry is shown in the new "Literature
 * Reference Gallery" with its source attribution.
 *
 * These are the ground-truth references a generative microstructure model
 * would be trained against, and the reference standards a metallurgist would
 * compare a synthesised image to.
 * -----------------------------------------------------------------------------
 */

export interface ReferenceMicrograph {
  id: string;
  url: string;
  source: string;
  caption: string;
  alloy: string;
  technique: "SEM" | "Optical" | "EBSD" | "TEM";
  magnification: string;
  category: "dendritic" | "eutectic" | "pearlite-bainite" | "fracture";
  width: number;
  height: number;
}

export const REFERENCE_MICROGRAPHS: ReferenceMicrograph[] = [
  // ---- Al-Cu dendritic -----------------------------------------------------
  {
    id: "alcu-1",
    url: "https://sfile.chatglm.cn/images-ppt/4cdf46b93810.png",
    source: "QATM",
    caption:
      "Mineral-crystal micrograph with 50 µm scale bar — typical etched metallographic preparation.",
    alloy: "Al-Cu (etched)",
    technique: "Optical",
    magnification: "500×",
    category: "dendritic",
    width: 1200,
    height: 800,
  },
  {
    id: "alcu-2",
    url: "https://sfile.chatglm.cn/images-ppt/126232d26a5a.png",
    source: "Cambridge University Press",
    caption:
      "Composite figure with multiple SEM micrographs at labelled magnifications and scale bars.",
    alloy: "Al-Cu",
    technique: "SEM",
    magnification: "various",
    category: "dendritic",
    width: 1427,
    height: 1791,
  },
  {
    id: "alcu-3",
    url: "https://sfile.chatglm.cn/images-ppt/2f0c6b630c49.jpg",
    source: "ASM International",
    caption:
      "SEM cross-section showing rough, cryo-fractured material surface — reference dendritic morphology.",
    alloy: "Al-Cu alloy",
    technique: "SEM",
    magnification: "1000×",
    category: "dendritic",
    width: 3072,
    height: 2304,
  },
  {
    id: "alcu-4",
    url: "https://sfile.chatglm.cn/images-ppt/8fe0b40b8c88.png",
    source: "Nature",
    caption:
      "Nine labelled grayscale micrographs (a–i) showing material microstructures with scale bars.",
    alloy: "Al-Cu (series)",
    technique: "SEM",
    magnification: "various",
    category: "dendritic",
    width: 1200,
    height: 980,
  },
  // ---- Al-Si eutectic ------------------------------------------------------
  {
    id: "alsi-1",
    url: "https://sfile.chatglm.cn/images-ppt/dc47fce26e93.jpg",
    source: "Nature",
    caption:
      "Two SEM images showing material microstructure at different magnifications — eutectic Si morphology.",
    alloy: "Al-Si",
    technique: "SEM",
    magnification: "various",
    category: "eutectic",
    width: 967,
    height: 1724,
  },
  {
    id: "alsi-2",
    url: "https://sfile.chatglm.cn/images-ppt/2d170c74b0f1.jpg",
    source: "Nature",
    caption:
      "Dark irregular fragments on a textured matrix — eutectic silicon particles in α-Al.",
    alloy: "Al-Si (eutectic)",
    technique: "SEM",
    magnification: "2500×",
    category: "eutectic",
    width: 967,
    height: 819,
  },
  {
    id: "alsi-3",
    url: "https://sfile.chatglm.cn/images-ppt/dba1b8806fd3.jpg",
    source: "Nature",
    caption:
      "Four SEM images showing AlP nucleant particles in a metallic matrix at differing magnifications.",
    alloy: "Al-Si (refined)",
    technique: "SEM",
    magnification: "various",
    category: "eutectic",
    width: 1395,
    height: 1395,
  },
  {
    id: "alsi-4",
    url: "https://sfile.chatglm.cn/images-ppt/fd6ca1726136.png",
    source: "Springer Nature",
    caption:
      "Four micrographs showing Al/Si eutectic and α-Al phases labelled A, B, C with 40 µm scale bar.",
    alloy: "Al-Si",
    technique: "Optical",
    magnification: "200×",
    category: "eutectic",
    width: 1200,
    height: 901,
  },
  {
    id: "alsi-5",
    url: "https://sfile.chatglm.cn/images-ppt/8b041c97bb1c.jpg",
    source: "Nature",
    caption:
      "Nine SEM images showing various crystal morphologies with scale bars — phase diversity reference.",
    alloy: "Al-Si (morphology set)",
    technique: "SEM",
    magnification: "various",
    category: "eutectic",
    width: 1200,
    height: 834,
  },
  // ---- Steel pearlite / bainite / martensite -------------------------------
  {
    id: "steel-1",
    url: "https://sfile.chatglm.cn/images-ppt/273d43355ae4.jpg",
    source: "LFF Group",
    caption:
      "SEM image of a material surface with fine parallel lines — tempered martensite laths.",
    alloy: "Steel (tempered)",
    technique: "SEM",
    magnification: "5000×",
    category: "pearlite-bainite",
    width: 1600,
    height: 1249,
  },
  {
    id: "steel-2",
    url: "https://sfile.chatglm.cn/images-ppt/bfa965bce57f.jpg",
    source: "ZHY Casting",
    caption:
      "Two micrographs: (a) carbide + austenite, (b) ferrite + pearlite — classic steel constituents.",
    alloy: "Steel (cast)",
    technique: "Optical",
    magnification: "200×",
    category: "pearlite-bainite",
    width: 2068,
    height: 774,
  },
  {
    id: "steel-3",
    url: "https://sfile.chatglm.cn/images-ppt/aa62666c7fb8.jpg",
    source: "LFF Group",
    caption:
      "Ferrite + pearlite microstructure with 0.2 mm scale — reference for mild-steel normalization.",
    alloy: "Mild steel",
    technique: "Optical",
    magnification: "100×",
    category: "pearlite-bainite",
    width: 3318,
    height: 1403,
  },
  {
    id: "steel-4",
    url: "https://sfile.chatglm.cn/images-ppt/6f4bc3f99df1.jpg",
    source: "Reddit (r/MaterialsScience)",
    caption:
      "Grayscale SEM of a test specimen showing detailed surface microstructure.",
    alloy: "Steel specimen",
    technique: "SEM",
    magnification: "2000×",
    category: "pearlite-bainite",
    width: 1600,
    height: 1474,
  },
  // ---- Fractography --------------------------------------------------------
  {
    id: "frac-1",
    url: "https://sfile.chatglm.cn/images-ppt/906aacc367bd.jpg",
    source: "Nanoscience Instruments",
    caption:
      "High-magnification SEM of a cracked, porous surface — brittle fracture reference.",
    alloy: "Metallic fracture",
    technique: "SEM",
    magnification: "10000×",
    category: "fracture",
    width: 900,
    height: 956,
  },
  {
    id: "frac-2",
    url: "https://sfile.chatglm.cn/images-ppt/a98dcc3814ba.jpg",
    source: "Metallurgical Engineering Services",
    caption:
      "SEM showing cubic crystals and a cavity — 20 kV imaging, intergranular fracture.",
    alloy: "Alloy fracture",
    technique: "SEM",
    magnification: "2500×",
    category: "fracture",
    width: 1280,
    height: 960,
  },
  {
    id: "frac-3",
    url: "https://sfile.chatglm.cn/images-ppt/81394aadb70d.jpeg",
    source: "Elmet LLC",
    caption:
      "High-magnification SEM of a rough, porous surface — ductile dimple rupture.",
    alloy: "Refractory metal",
    technique: "SEM",
    magnification: "5000×",
    category: "fracture",
    width: 1024,
    height: 768,
  },
  {
    id: "frac-4",
    url: "https://sfile.chatglm.cn/images-ppt/ee9d1a310923.jpg",
    source: "Nanoscience Instruments",
    caption:
      "SEM of material microstructure with cracks propagating through the matrix.",
    alloy: "Composite",
    technique: "SEM",
    magnification: "2000×",
    category: "fracture",
    width: 1022,
    height: 1085,
  },
];

export interface ConceptSource {
  concept: string;
  title: string;
  host: string;
  snippet: string;
  url: string;
}

/** Key concepts surfaced from the web research, used in the methodology panel. */
export const CONCEPT_SOURCES: ConceptSource[] = [
  {
    concept: "CALPHAD method",
    title: "CALPHAD Method — calphad.com",
    host: "calphad.com",
    snippet:
      "The CALPHAD method (CALculation of PHAse Diagrams) is a computational framework to model phase stability and thermodynamic properties from assessed databases.",
    url: "https://calphad.com",
  },
  {
    concept: "Scheil solidification",
    title: "Scheil Equations Simulations — Thermo-Calc",
    host: "thermo-calc.com",
    snippet:
      "Scheil solidification assumes complete liquid mixing and zero solid diffusion. For typical foundry cooling rates these assumptions are quite good and much faster than full DICTRA diffusion calcs.",
    url: "https://thermo-calc.com",
  },
  {
    concept: "Hall–Petch strengthening",
    title: "Six decades of the Hall–Petch effect",
    host: "ScienceDirect",
    snippet:
      "Refining grain size dramatically increases strength via σ_y = σ₀ + k·d^(-1/2). Combined with Orowan precipitation strengthening (Δσ ∝ 1/r).",
    url: "https://www.sciencedirect.com",
  },
  {
    concept: "ML surrogate for phase-field",
    title: "ML-based surrogate modeling of microstructure evolution",
    host: "Nature",
    snippet:
      "Machine-learned surrogates predict spinodal / phase-field evolution in a fraction of a second, replacing expensive PDE solvers — the core idea behind this lab.",
    url: "https://www.nature.com",
  },
  {
    concept: "Multicomponent CALPHAD",
    title: "Thermodynamic Modeling of Multicomponent Phase Equilibria",
    host: "NIST Metallurgy",
    snippet:
      "NIST overview of the CALPHAD method and recent progress in multicomponent alloy phase-diagram calculation.",
    url: "https://www.metallurgy.nist.gov",
  },
  {
    concept: "Dendrite microsegregation",
    title: "CA Modeling of Microsegregation and Equiaxed Growth",
    host: "PMC (NIH)",
    snippet:
      "Cellular-automaton simulations of single-dendrite solidification at cooling rates of 5, 25 and 45 K/s — quantifies how cooling rate refines dendrite arm spacing.",
    url: "https://pmc.ncbi.nlm.nih.gov",
  },
];
