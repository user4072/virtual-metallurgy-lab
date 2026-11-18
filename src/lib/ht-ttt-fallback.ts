/**
 * ht-ttt-fallback.ts
 * -----------------------------------------------------------------------------
 * TypeScript fallback for the heat-treatment service TTT/CCT endpoints,
 * used when the Python service (port 8001) is not running. Shared by the
 * /api/ht/ttt and /api/ht/cct routes so both return the same curve shape:
 *   curves: Record<string, [t_seconds, T_°C][]>
 *
 * Physics: Andrews (1965) critical temperatures with C/Mn/Si/Cr/Ni/Mo in
 * wt%; diffusional C-curves are confined strictly BELOW A1 (austenite is
 * stable above it), with a Gaussian-nosed kinetic model calibrated to
 * published plain-carbon TTT diagrams.
 */

export interface HtAlloyComposition {
  [element: string]: number;
}

export interface HtTttResult {
  curves: Record<string, number[][]>;
  Ms_C: number;
  Mf_C: number;
  A1_C: number;
  A3_C: number;
}

/** Andrews Ms: 539 − 423C − 30.4Mn − 17.7Ni − 12.1Cr − 7.5Mo (all wt%). */
export function andrewsMs(comp: HtAlloyComposition): number {
  const C = comp["C"] ?? 0;
  const Mn = comp["Mn"] ?? 0;
  const Ni = comp["Ni"] ?? 0;
  const Cr = comp["Cr"] ?? 0;
  const Mo = comp["Mo"] ?? 0;
  return Math.max(-150, 539 - 423 * C - 30.4 * Mn - 17.7 * Ni - 12.1 * Cr - 7.5 * Mo);
}

/** Andrews A3: 910 − 203C − 30Mn − 11Cr − 15.2Ni − 20Mo (all wt%), clamped ≥ A1. */
export function andrewsA3(comp: HtAlloyComposition): number {
  const C = comp["C"] ?? 0;
  const Mn = comp["Mn"] ?? 0;
  const Ni = comp["Ni"] ?? 0;
  const Cr = comp["Cr"] ?? 0;
  const Mo = comp["Mo"] ?? 0;
  return Math.max(727, 910 - 203 * C - 30 * Mn - 11 * Cr - 15.2 * Ni - 20 * Mo);
}

/** Gaussian-nosed C-curve between Tlo and Thi, strictly below A1. */
function cCurve(Tlo: number, Thi: number, tNose: number, tWidth: number, n = 20): number[][] {
  const pts: number[][] = [];
  const Tnose = (Tlo + Thi) / 2;
  for (let i = 0; i <= n; i++) {
    const T = Tlo + ((Thi - Tlo) * i) / n;
    const dt = Math.abs(T - Tnose) / Math.max(1, (Thi - Tlo) / 2);
    const t = tNose * Math.exp(dt * dt * Math.log(tWidth / tNose + 1));
    pts.push([Math.round(t * 100) / 100, Math.round(T)]);
  }
  return pts;
}

/**
 * Build the HT-service-shaped TTT curves for an alloy composition (wt%).
 * Diffusional windows sit strictly below A1; martensite lines at Ms/Mf.
 */
export function htTttCurves(
  sysId: string,
  comp: HtAlloyComposition,
): HtTttResult {
  if (sysId === "Fe-C") {
    const Ms = andrewsMs(comp);
    const Mf = Ms - 215;
    const A1 = 727;
    const A3 = andrewsA3(comp);
    const curves: Record<string, number[][]> = {
      // ferrite/pearlite formation only below A1
      pearlite_start: cCurve(Math.max(Ms + 60, A1 - 200), A1 - 5, 5, 1e4),
      pearlite_finish: cCurve(Math.max(Ms + 60, A1 - 200), A1 - 5, 25, 1e5),
      bainite_start: cCurve(Math.max(250, Ms + 10), A1 - 60, 20, 1e5),
      bainite_finish: cCurve(Math.max(250, Ms + 10), A1 - 60, 80, 1e6),
      martensite_start: [[0.01, Math.round(Ms)], [1e5, Math.round(Ms)]],
      martensite_finish: [[0.01, Math.round(Mf)], [1e5, Math.round(Mf)]],
    };
    return { curves, Ms_C: Math.round(Ms), Mf_C: Math.round(Mf), A1_C: A1, A3_C: Math.round(A3) };
  }

  // Al alloys — precipitation C-curves below the solvus
  const solvus = sysId === "Al-Cu" ? 548 : sysId === "Al-Si" ? 577 : 1100;
  const curves: Record<string, number[][]> = {
    precipitate_start: cCurve(100, solvus - 20, 60, 1e5),
    precipitate_finish: cCurve(100, solvus - 20, 300, 1e6),
  };
  return { curves, Ms_C: -999, Mf_C: -999, A1_C: Math.round(solvus), A3_C: Math.round(solvus) };
}
