import type { Aircraft, ConflictPair, ConflictThresholds } from "../types";
import { degToRad, ktToMps } from "../units";
import { evaluatePair, type Track } from "./cpa";
import { isEligible, sortConflicts } from "./detect";
import { EARTH_RADIUS_M } from "./enu";

/**
 * Conflict check for traffic spread over a large area, built for speed.
 *
 * The engine works on a flat plane, which is only fair near its origin.
 * Over a whole country one plane would be badly stretched. So:
 *
 * 1. Aircraft are sorted into a grid of cells in latitude and longitude,
 *    sized so that any pair the exact test could flag sits in the same cell
 *    or in touching cells. Each pair is looked at once.
 * 2. Two cheap tests throw out almost every pair: they are too far apart
 *    vertically to close in time, or too far apart on the ground.
 * 3. The few pairs left are measured exactly, each on its own small plane
 *    centered between the two aircraft.
 *
 * The cheap tests only ever discard pairs the exact test would also
 * discard, so nothing the engine would flag is lost.
 */

/**
 * ASSUMPTION: aircraft faster than this are rare (or bad data). They are
 * compared against everything directly, so one of them cannot blow up the
 * cell size for the whole map. No pair is skipped because of this.
 */
export const FAST_AIRCRAFT_KT = 700;

/** Nautical miles per degree of latitude, as used for the search grid. */
const NM_PER_DEG = 60;

/** Farthest apart a flagged pair of ordinary aircraft can start, in nautical miles. */
export function reachNm(thresholds: ConflictThresholds, maxSpeedKt: number): number {
  return thresholds.lateralNm + (2 * maxSpeedKt * thresholds.lookaheadSec) / 3600;
}

export function detectConflictsRegional(
  aircraft: ReadonlyArray<Aircraft>,
  thresholds: ConflictThresholds,
): ConflictPair[] {
  const list = aircraft.filter(isEligible);
  const n = list.length;
  if (n < 2) return [];

  // Flat arrays: the inner loop touches numbers, not objects.
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const alt = new Float64Array(n);
  const absRate = new Float64Array(n);
  const speedKt = new Float64Array(n);
  let maxLat = 0;
  let maxOrdinaryKt = 0;
  const fast: number[] = [];
  for (let i = 0; i < n; i++) {
    const ac = list[i];
    lat[i] = ac.latitude;
    lon[i] = ac.longitude;
    alt[i] = ac.altitudeFt as number;
    absRate[i] = Math.abs(ac.verticalRateFpm ?? 0);
    speedKt[i] = ac.groundSpeedKt as number;
    if (Math.abs(ac.latitude) > maxLat) maxLat = Math.abs(ac.latitude);
    if (speedKt[i] > FAST_AIRCRAFT_KT) fast.push(i);
    else if (speedKt[i] > maxOrdinaryKt) maxOrdinaryKt = speedKt[i];
  }

  const { lateralNm, verticalFt, lookaheadSec } = thresholds;
  const lookaheadMin = lookaheadSec / 60;
  const lookaheadHr = lookaheadSec / 3600;
  const found: ConflictPair[] = [];

  /** Look at one pair: two cheap rejections, then the exact test. */
  const consider = (i: number, j: number) => {
    // Vertical: even closing at their combined rates, do they get within range?
    const gap = Math.abs(alt[i] - alt[j]);
    if (gap - (absRate[i] + absRate[j]) * lookaheadMin >= verticalFt) return;

    // Horizontal: even flying straight at each other, do they get within range?
    const midLat = (lat[i] + lat[j]) / 2;
    const cosMid = Math.cos(degToRad(midLat));
    const northNm = (lat[j] - lat[i]) * NM_PER_DEG;
    const eastNm = (lon[j] - lon[i]) * NM_PER_DEG * cosMid;
    const limit = (lateralNm + (speedKt[i] + speedKt[j]) * lookaheadHr) * 1.02 + 0.5;
    if (northNm * northNm + eastNm * eastNm > limit * limit) return;

    // Exact, on a plane centered between the two aircraft.
    const a = list[i];
    const b = list[j];
    const first = a.icao24 < b.icao24;
    const lo = first ? a : b;
    const hi = first ? b : a;
    if (lo.icao24 === hi.icao24) return;
    const halfEast =
      (EARTH_RADIUS_M * degToRad(hi.longitude - lo.longitude) * cosMid) / 2;
    const halfNorth = (EARTH_RADIUS_M * degToRad(hi.latitude - lo.latitude)) / 2;
    const hit = evaluatePair(
      toLocalTrack(lo, -halfEast, -halfNorth),
      toLocalTrack(hi, halfEast, halfNorth),
      thresholds,
    );
    if (hit) found.push(hit);
  };

  // Fast aircraft are few. Compare each against everything, once.
  const isFast = new Uint8Array(n);
  for (const f of fast) isFast[f] = 1;
  for (const f of fast) {
    for (let j = 0; j < n; j++) {
      if (j === f) continue;
      // A pair of two fast aircraft is taken once, by the lower index.
      if (isFast[j] && j < f) continue;
      consider(f, j);
    }
  }

  // Everything else goes through the grid.
  const reach = reachNm(thresholds, maxOrdinaryKt) * 1.05 + 1;
  const cellLat = reach / NM_PER_DEG;
  // Longitude degrees shrink toward the poles. Size the cell for the worst case.
  const cellLon = cellLat / Math.max(0.05, Math.cos(degToRad(Math.min(maxLat + cellLat, 89))));
  const cells = new Map<number, number[]>();
  const STRIDE = 100_000;
  const cellKey = (cx: number, cy: number) => (cx + 50_000) * STRIDE + (cy + 50_000);
  const cx = new Int32Array(n);
  const cy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (isFast[i]) continue;
    cx[i] = Math.floor(lon[i] / cellLon);
    cy[i] = Math.floor(lat[i] / cellLat);
    const key = cellKey(cx[i], cy[i]);
    const members = cells.get(key);
    if (members) members.push(i);
    else cells.set(key, [i]);
  }

  // Each cell against itself, and against four of its eight neighbors. The
  // other four are covered when those neighbors take their turn.
  const FORWARD: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  for (const members of cells.values()) {
    const count = members.length;
    for (let p = 0; p < count; p++) {
      for (let q = p + 1; q < count; q++) consider(members[p], members[q]);
    }
    const first = members[0];
    for (const [dx, dy] of FORWARD) {
      const others = cells.get(cellKey(cx[first] + dx, cy[first] + dy));
      if (!others) continue;
      for (let p = 0; p < count; p++) {
        const i = members[p];
        for (let q = 0; q < others.length; q++) consider(i, others[q]);
      }
    }
  }

  return sortConflicts(found);
}

function toLocalTrack(ac: Aircraft, east: number, north: number): Track {
  const speed = ktToMps(ac.groundSpeedKt as number);
  const psi = degToRad(ac.headingDeg as number);
  return {
    id: ac.icao24,
    east,
    north,
    vEast: speed * Math.sin(psi),
    vNorth: speed * Math.cos(psi),
    altFt: ac.altitudeFt as number,
    // ASSUMPTION: a missing vertical rate is treated as level flight.
    vRateFpm:
      ac.verticalRateFpm !== null && Number.isFinite(ac.verticalRateFpm)
        ? ac.verticalRateFpm
        : 0,
  };
}
