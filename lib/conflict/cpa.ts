import type { ConflictPair, ConflictThresholds } from "../types";
import { metersToNm } from "../units";

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

/**
 * Apply the conflict rules in docs/tech-spec.md section 6 to one pair.
 * Returns null when the pair does not flag. Comparisons against the lateral
 * and vertical thresholds are strict (`<`).
 */
export function evaluatePair(
  a: Track,
  b: Track,
  thresholds: ConflictThresholds,
): ConflictPair | null {
  const cpa = horizontalCpa(a, b);
  const currentHorizontalNm = metersToNm(cpa.currentM);
  const currentVerticalFt = verticalSeparationFt(a, b, 0);

  let tcpaSec = cpa.tcpaSec;
  let dcpaNm = metersToNm(cpa.dcpaM);

  if (tcpaSec > thresholds.lookaheadSec) {
    // Closest approach is beyond the window. Do not clamp and flag, unless
    // the pair is already inside both thresholds right now (then use t = 0).
    const insideNow =
      currentHorizontalNm < thresholds.lateralNm &&
      currentVerticalFt < thresholds.verticalFt;
    if (!insideNow) return null;
    tcpaSec = 0;
    dcpaNm = currentHorizontalNm;
  }

  const verticalAtTcpaFt = verticalSeparationFt(a, b, tcpaSec);
  if (!(dcpaNm < thresholds.lateralNm)) return null;
  if (!(verticalAtTcpaFt < thresholds.verticalFt)) return null;

  return {
    a: a.id,
    b: b.id,
    tcpaSec,
    dcpaNm,
    verticalAtTcpaFt,
    currentHorizontalNm,
    currentVerticalFt,
  };
}
