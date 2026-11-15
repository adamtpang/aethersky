import type { Aircraft, ConflictPair, ConflictThresholds } from "../types";
import { degToRad, mpsToKt } from "../units";
import { evaluatePair, type Track } from "./cpa";
import { detectConflicts, isEligible, sortConflicts, toTrack } from "./detect";
import { FALLBACK_MAX_GROUND_SPEED_MPS, candidatePairs } from "./grid";

/**
 * Conflict check for traffic spread over a large area.
 *
 * The engine projects onto one flat plane, which is only fair near its
 * origin. Over a whole country that plane would be badly stretched. So the
 * traffic is cut into regions a few degrees across, with a margin wide
 * enough that no flagged pair can fall between two regions. A region only
 * proposes candidate pairs. Each candidate is then measured on its own small
 * plane centered between the two aircraft, and is counted once.
 */

/** Region size in degrees. Small enough that the flat plane stays honest. */
export const REGION_SIZE_DEG = 2;

/** Farthest apart a flagged pair can start, in nautical miles. */
export function reachNm(
  thresholds: ConflictThresholds,
  aircraft: ReadonlyArray<Aircraft>,
): number {
  let maxKt = 0;
  for (const ac of aircraft) {
    if (ac.groundSpeedKt !== null && ac.groundSpeedKt > maxKt) maxKt = ac.groundSpeedKt;
  }
  if (maxKt === 0) maxKt = mpsToKt(FALLBACK_MAX_GROUND_SPEED_MPS);
  return thresholds.lateralNm + (2 * maxKt * thresholds.lookaheadSec) / 3600;
}

export function detectConflictsRegional(
  aircraft: ReadonlyArray<Aircraft>,
  thresholds: ConflictThresholds,
): ConflictPair[] {
  const eligible = aircraft.filter(isEligible);
  if (eligible.length < 2) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const ac of eligible) {
    if (ac.latitude < minLat) minLat = ac.latitude;
    if (ac.latitude > maxLat) maxLat = ac.latitude;
    if (ac.longitude < minLon) minLon = ac.longitude;
    if (ac.longitude > maxLon) maxLon = ac.longitude;
  }
  // Small enough to sit on one plane: use the engine directly.
  if (maxLat - minLat <= REGION_SIZE_DEG && maxLon - minLon <= REGION_SIZE_DEG) {
    return detectConflicts(eligible, thresholds);
  }

  const reach = reachNm(thresholds, eligible);
  // One degree of latitude is taken as 60 NM. 10 percent is added for safety.
  const marginLat = (reach * 1.1) / 60;

  const cellOf = (value: number) => Math.floor(value / REGION_SIZE_DEG);
  const buckets = new Map<string, Aircraft[]>();
  const add = (key: string, ac: Aircraft) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(ac);
    else buckets.set(key, [ac]);
  };

  // Each aircraft joins every region whose margin it falls inside.
  for (const ac of eligible) {
    const cosLat = Math.max(0.2, Math.cos(degToRad(ac.latitude)));
    const marginLon = marginLat / cosLat;
    const y0 = cellOf(ac.latitude - marginLat);
    const y1 = cellOf(ac.latitude + marginLat);
    const x0 = cellOf(ac.longitude - marginLon);
    const x1 = cellOf(ac.longitude + marginLon);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) add(`${x},${y}`, ac);
    }
  }

  const byId = new Map(eligible.map((ac) => [ac.icao24, ac]));
  // Regions only propose candidates, on a slightly loosened plane so that
  // the stretch near a region's edge cannot hide a pair.
  const loose: ConflictThresholds = {
    lateralNm: thresholds.lateralNm * 1.05 + 0.5,
    verticalFt: thresholds.verticalFt,
    lookaheadSec: thresholds.lookaheadSec * 1.05,
  };
  const seen = new Set<string>();
  const found: ConflictPair[] = [];
  for (const [key, members] of buckets) {
    if (members.length < 2) continue;
    const [x, y] = key.split(",").map(Number);
    const origin = {
      latitude: (y + 0.5) * REGION_SIZE_DEG,
      longitude: (x + 0.5) * REGION_SIZE_DEG,
    };
    const tracks: Track[] = [];
    for (const member of members) {
      const track = toTrack(member, origin);
      if (track) tracks.push(track);
    }
    for (const [ta, tb] of candidatePairs(tracks, loose)) {
      const id = `${ta.id}|${tb.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const a = byId.get(ta.id);
      const b = byId.get(tb.id);
      if (!a || !b) continue;
      // Each candidate is then measured on its own plane, centered between
      // the two aircraft, where the flat-earth error is smallest.
      const middle = {
        latitude: (a.latitude + b.latitude) / 2,
        longitude: (a.longitude + b.longitude) / 2,
      };
      const trackA = toTrack(a, middle);
      const trackB = toTrack(b, middle);
      if (!trackA || !trackB) continue;
      const hit = evaluatePair(trackA, trackB, thresholds);
      if (hit) found.push(hit);
    }
  }
  return sortConflicts(found);
}
