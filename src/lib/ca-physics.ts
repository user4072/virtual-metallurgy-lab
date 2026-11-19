/**
 * ca-physics.ts — shared cooling-path deposition physics for the SEM-style
 * microstructure modules (2D phase-field + 3D grain faces).
 * -----------------------------------------------------------------------------
 * Given the alloy composition, cooling rate, hold time and ageing temperature,
 * this decides WHICH phase appears WHERE — the metallurgically correct order:
 *
 *   • hypoeutectoid steel (C < 0.77): proeutectoid FERRITE nucleates in the
 *     austenite grain boundaries and thickens into bands (bright etching)
 *   • hypereutectoid (C > 0.77): a CEMENTITE network forms in the boundaries
 *     first (white network)
 *   • at A1 the remaining austenite transforms to PEARLITE — dark lamellar
 *     colonies growing from the boundaries inward
 *   • fast quench (R ≥ critical rate, Cohen-style) skips diffusion entirely:
 *     MARTENSITE needles slice across the untransformed grains
 *   • ageing alloys (Al-Cu, Al-Si): second-phase particles nucleate at
 *     boundaries then in the matrix when T < solvus; they DISSOLVE when
 *     T > solvus
 * -----------------------------------------------------------------------------
 */

export interface AlloyComp {
  C: number; // wt%
  Mn: number;
  Si: number;
  Cr: number;
  Ni: number;
  Mo: number;
  /** extra elements that only affect hardenability slightly */
  [el: string]: number;
}

export type Regime = "pearlitic" | "bainitic" | "martensitic";
export type BoundaryPhase = "ferrite" | "cementite" | "none";

export interface DepositionPlan {
  system: string;
  C: number; // effective C wt% (clamped to the model range)
  castIron: boolean;
  A1: number;
  A3: number; // for hypoeutectoid; Acm above eutectoid
  Ms: number;
  rcrit: number; // critical cooling rate for full martensite (K/s)
  regime: Regime;
  boundaryPhase: BoundaryPhase;
  /** target fraction of boundary-adjacent cells covered by the boundary phase */
  boundaryBand: number; // 0..1 (band thickness as fraction of cell size scale)
  /** target fraction of the face converted to pearlite colonies */
  pearliteFrac: number;
  needles: boolean; // draw martensite needles
  precip: {
    /** nucleation probability at boundaries */
    atBoundary: number;
    /** nucleation probability inside grains */
    inGrain: number;
    /** growth probability per step */
    grow: number;
  } | null;
  dissolved: boolean;
}

const A1 = 727;

/** Andrews A3 with Mn/Si/Cr/Ni/Mo (wt%). */
export function andrewsA3(comp: AlloyComp): number {
  return Math.max(
    A1,
    910 - 203 * comp.C - 30 * comp.Mn - 11 * comp.Cr - 15.2 * comp.Ni - 20 * comp.Mo,
  );
}

/** Andrews Ms. */
export function andrewsMs(comp: AlloyComp): number {
  return Math.max(
    -150,
    539 - 423 * comp.C - 30.4 * comp.Mn - 17.7 * comp.Ni - 12.1 * comp.Cr - 7.5 * comp.Mo,
  );
}

/**
 * Full deposition plan for a cooling path.
 *
 * @param system  alloy system id (Fe-C gets the full steel model)
 * @param comp    composition in wt%
 * @param R       cooling rate K/s
 * @param hold    hold time at the austenitizing/ageing temperature (hours)
 * @param T_age   ageing / heat-treatment temperature (°C)
 * @param T_solvus solvus temperature of the second phase (°C)
 */
export function depositionPlan(
  system: string,
  comp: AlloyComp,
  R: number,
  hold: number,
  T_age: number,
  T_solvus: number,
): DepositionPlan {
  // ---- effective C clamped to the model range (cast irons cap at ledeburite)
  const castIron = comp.C > 2.14;
  const C = Math.min(comp.C, 4.3);

  // hardenability: CE raises hardenability → lowers the critical rate
  const CE =
    comp.C + comp.Mn / 6 + comp.Cr / 5 + comp.Mo / 4 + comp.Ni / 15 + comp.Si / 24;
  const rcrit = Math.max(0.5, 60 * Math.exp(-3.2 * Math.max(0, CE)));

  let regime: Regime;
  if (R >= rcrit) regime = "martensitic";
  else if (R >= rcrit * 0.3) regime = "bainitic";
  else regime = "pearlitic";

  // diffusion time factor: slow cooling lets boundary phases develop fully
  const dfac = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(R, 0.05)) / 2.6));

  const plan: DepositionPlan = {
    system,
    C,
    castIron,
    A1,
    A3: andrewsA3(comp),
    Ms: andrewsMs(comp),
    rcrit,
    regime,
    boundaryPhase: "none",
    boundaryBand: 0,
    pearliteFrac: 0,
    needles: regime === "martensitic" || (regime === "bainitic" && C > 0.3),
    precip: null,
    dissolved: T_age > T_solvus,
  };

  if (system === "Fe-C" || system === "Steel-6") {
    if (regime === "pearlitic" || regime === "bainitic") {
      // which proeutectoid phase forms in the boundaries
      if (C < 0.77) {
        plan.boundaryPhase = "ferrite";
        plan.boundaryBand = Math.min(1, ((0.77 - C) / 0.75) * dfac);
      } else {
        plan.boundaryPhase = "cementite";
        plan.boundaryBand = Math.min(0.6, ((C - 0.77) / 5.9) * dfac);
      }
      // pearlite fills the rest (bainitic regime → darker, feathery colonies)
      plan.pearliteFrac = Math.min(1, (1 - plan.boundaryBand * 0.55) * dfac);
    }
    // ageing precipitates (carbides) only below the solvus and slow enough
    if (T_age < T_solvus && regime === "pearlitic") {
      plan.precip = {
        atBoundary: Math.min(0.5, 0.1 * hold * dfac + 0.05),
        inGrain: Math.min(0.3, 0.04 * hold * dfac),
        grow: Math.min(0.3, 0.1 * hold * dfac),
      };
    }
    return plan;
  }

  // ---- ageing systems (Al-Cu, Al-Si, Ni-Cr-Co): θ / β-Si / γ′ -------------
  if (!plan.dissolved) {
    const supersat = Math.max(0, Math.min(1, 0.3 + comp.C * 6));
    const holdFac = Math.min(1, 0.15 * hold + 0.05);
    const quenchFine = R > 50; // fast quench → fine dispersed precipitates
    plan.precip = quenchFine
      ? { atBoundary: 0.02 * holdFac, inGrain: 0.2 * supersat * holdFac, grow: 0.02 }
      : {
          atBoundary: Math.min(0.5, 0.35 * supersat * holdFac),
          inGrain: Math.min(0.25, 0.08 * supersat * holdFac),
          grow: Math.min(0.25, 0.15 * supersat * holdFac),
        };
  }
  return plan;
}
