import type { ConflictPair, ConflictThresholds } from "../types";
import { METERS_PER_NM, metersToNm } from "../units";

/**
 * One aircraft reduced to what the constant-velocity model needs.
 * Horizontal state is in local ENU meters and meters per second. Altitude
 * stays in feet and feet per minute so the vertical filter needs no rounding.
 */
export interface Track {
  id: string;
  east: number;
  north: number;
  vEast: number;
  vNorth: number;
  altFt: number;
  vRateFpm: number;
}

/** Below this squared relative speed (m^2/s^2) tracks count as parallel. */
export const RELATIVE_SPEED_EPSILON = 1e-9;

export interface HorizontalCpa {
  /** Seconds from now. Never negative. May exceed the lookahead window. */
  tcpaSec: number;
  /** Horizontal distance at `tcpaSec`, meters. */
  dcpaM: number;
  /** Horizontal distance right now, meters. */
  currentM: number;
}

/**
 * Horizontal closest point of approach for two constant-velocity tracks.
 * `p` and `v` are B minus A. A closest approach in the past is evaluated at
 * t = 0. This is first-order geometry. It is not TCAS and not certified.
 */
export function horizontalCpa(a: Track, b: Track): HorizontalCpa {
  const pE = b.east - a.east;
  const pN = b.north - a.north;
  const vE = b.vEast - a.vEast;
  const vN = b.vNorth - a.vNorth;
  const currentM = Math.hypot(pE, pN);
  const v2 = vE * vE + vN * vN;

  if (v2 < RELATIVE_SPEED_EPSILON) {
    return { tcpaSec: 0, dcpaM: currentM, currentM };
  }
  const tcpa = -(pE * vE + pN * vN) / v2;
  if (tcpa < 0) {
    return { tcpaSec: 0, dcpaM: currentM, currentM };
  }
  return {
    tcpaSec: tcpa,
    dcpaM: Math.hypot(pE + vE * tcpa, pN + vN * tcpa),
    currentM,
  };
}

/** Absolute vertical separation in feet after `tSec` seconds. */
export function verticalSeparationFt(a: Track, b: Track, tSec: number): number {
  const altA = a.altFt + (a.vRateFpm * tSec) / 60;
  const altB = b.altFt + (b.vRateFpm * tSec) / 60;
  return Math.abs(altB - altA);
}

/** An open interval of time, in seconds. Empty when `from >= to`. */
type Interval = [from: number, to: number];
const NEVER: Interval = [0, 0];
const ALWAYS: Interval = [-Infinity, Infinity];

/** When the two are closer than `limitM` on the ground. */
function horizontalWindow(a: Track, b: Track, limitM: number): Interval {
  const pE = b.east - a.east;
  const pN = b.north - a.north;
  const vE = b.vEast - a.vEast;
  const vN = b.vNorth - a.vNorth;
  const v2 = vE * vE + vN * vN;
  const c = pE * pE + pN * pN - limitM * limitM;
  if (v2 < RELATIVE_SPEED_EPSILON) return c < 0 ? ALWAYS : NEVER;
  // |p + v t|^2 < limit^2 is a quadratic in t. It holds between its roots.
  const half = pE * vE + pN * vN;
  const disc = half * half - v2 * c;
  if (disc <= 0) return NEVER;
  const root = Math.sqrt(disc);
  return [(-half - root) / v2, (-half + root) / v2];
}

/** When the two are closer than `limitFt` vertically. */
function verticalWindow(a: Track, b: Track, limitFt: number): Interval {
  const gap = b.altFt - a.altFt;
  const ratePerSec = (b.vRateFpm - a.vRateFpm) / 60;
  if (ratePerSec === 0) return Math.abs(gap) < limitFt ? ALWAYS : NEVER;
  const t1 = (-limitFt - gap) / ratePerSec;
  const t2 = (limitFt - gap) / ratePerSec;
  return t1 < t2 ? [t1, t2] : [t2, t1];
}

function horizontalMetersAt(a: Track, b: Track, tSec: number): number {
  return Math.hypot(
    b.east - a.east + (b.vEast - a.vEast) * tSec,
    b.north - a.north + (b.vNorth - a.vNorth) * tSec,
  );
}

/**
 * Decide whether a pair is a conflict, and describe it.
 *
 * A pair is a conflict when, at some moment from now to the end of the
 * lookahead window, the two are closer than the lateral threshold on the
 * ground AND closer than the vertical threshold in altitude, both at the
 * same time. Comparisons are strict (`<`).
 *
 * The first version of this check looked at vertical separation only at the
 * moment of closest horizontal approach. That missed an aircraft climbing
 * or descending through another's level a little before or after that
 * moment. This version looks at the whole window. Every pair the first
 * version flagged is still flagged, with the same numbers.
 *
 * The reported time is the moment, inside the stretch where both limits are
 * broken, that is nearest to the closest horizontal approach.
 */
export function evaluatePair(
  a: Track,
  b: Track,
  thresholds: ConflictThresholds,
): ConflictPair | null {
  const [h1, h2] = horizontalWindow(a, b, thresholds.lateralNm * METERS_PER_NM);
  if (h1 >= h2) return null;
  const [z1, z2] = verticalWindow(a, b, thresholds.verticalFt);
  if (z1 >= z2) return null;

  // The stretch of time, inside the window, when both limits are broken.
  const from = Math.max(h1, z1, 0);
  const to = Math.min(h2, z2, thresholds.lookaheadSec);
  // The intervals are open, so touching a limit at one instant is not a conflict.
  if (!(from < to)) return null;

  const cpa = horizontalCpa(a, b);
  const currentHorizontalNm = metersToNm(cpa.currentM);
  const currentVerticalFt = verticalSeparationFt(a, b, 0);
  const insideNow =
    currentHorizontalNm < thresholds.lateralNm &&
    currentVerticalFt < thresholds.verticalFt;

  let tcpaSec: number;
  if (insideNow && cpa.tcpaSec > thresholds.lookaheadSec) {
    // Already inside, with the closest approach beyond the window: report now.
    tcpaSec = 0;
  } else {
    // Stay a hair inside the stretch, so the reported numbers are under the limits.
    const edge = Math.min(0.5, (to - from) / 2);
    const earliest = insideNow && from === 0 ? 0 : from + edge;
    tcpaSec = Math.min(to - edge, Math.max(earliest, cpa.tcpaSec));
  }

  return {
    a: a.id,
    b: b.id,
    tcpaSec,
    dcpaNm: metersToNm(horizontalMetersAt(a, b, tcpaSec)),
    verticalAtTcpaFt: verticalSeparationFt(a, b, tcpaSec),
    currentHorizontalNm,
    currentVerticalFt,
  };
}
