import type { ConflictThresholds } from "../types";
import { nmToMeters } from "../units";
import type { Track } from "./cpa";

/**
 * ASSUMPTION: speed used to size cells when no ground speed is available.
 * 300 m/s is about 583 knots, a generous value so cells do not drop a fast
 * closer.
 */
export const FALLBACK_MAX_GROUND_SPEED_MPS = 300;

export function maxGroundSpeedMps(tracks: ReadonlyArray<Track>): number {
  if (tracks.length === 0) return FALLBACK_MAX_GROUND_SPEED_MPS;
  let max = 0;
  for (const t of tracks) {
    const speed = Math.hypot(t.vEast, t.vNorth);
    if (speed > max) max = speed;
  }
  return max;
}

/** Cell size in meters: lateralNm * 1852 + maxGroundSpeedMps * lookaheadSec. */
export function gridCellSizeM(
  thresholds: ConflictThresholds,
  maxSpeedMps: number,
): number {
  return nmToMeters(thresholds.lateralNm) + maxSpeedMps * thresholds.lookaheadSec;
}

/**
 * How many cells to search on each side of an aircraft's own cell.
 *
 * Two aircraft can close at up to twice the max ground speed, so a pair that
 * the exact CPA test would flag can start as far apart as
 * lateral + 2 * maxSpeed * lookahead. That is more than one cell when the
 * cell size is lateral + maxSpeed * lookahead, so searching only the eight
 * touching cells could drop a fast head-on pair. Widening the search to this
 * radius keeps the cell size from the spec and guarantees no flagged pair is
 * dropped. The radius is 1 for stationary traffic and 2 otherwise.
 */
export function gridSearchRadius(
  thresholds: ConflictThresholds,
  maxSpeedMps: number,
): number {
  const cell = gridCellSizeM(thresholds, maxSpeedMps);
  if (!(cell > 0)) return 1;
  const reach =
    nmToMeters(thresholds.lateralNm) + 2 * maxSpeedMps * thresholds.lookaheadSec;
  return Math.max(1, Math.ceil(reach / cell));
}

export function cellIndex(value: number, cell: number): number {
  return Math.floor(value / cell);
}

/**
 * Uniform grid prefilter. Yields each candidate pair exactly once, with the
 * lower id first. Pairs outside the search neighborhood are never candidates.
 */
export function candidatePairs(
  tracks: ReadonlyArray<Track>,
  thresholds: ConflictThresholds,
): Array<[Track, Track]> {
  const maxSpeed = maxGroundSpeedMps(tracks);
  const cell = gridCellSizeM(thresholds, maxSpeed);
  if (!(cell > 0) || !Number.isFinite(cell)) return allPairs(tracks);

  const radius = gridSearchRadius(thresholds, maxSpeed);
  const buckets = new Map<string, Track[]>();
  for (const t of tracks) {
    const key = `${cellIndex(t.east, cell)},${cellIndex(t.north, cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  const pairs: Array<[Track, Track]> = [];
  for (const t of tracks) {
    const cx = cellIndex(t.east, cell);
    const cy = cellIndex(t.north, cell);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const bucket = buckets.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.id > t.id) pairs.push([t, other]);
        }
      }
    }
  }
  return pairs;
}

/** Naive O(n^2) pairing, used when the prefilter is disabled. */
export function allPairs(tracks: ReadonlyArray<Track>): Array<[Track, Track]> {
  const pairs: Array<[Track, Track]> = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i];
      const b = tracks[j];
      if (a.id === b.id) continue;
      pairs.push(a.id < b.id ? [a, b] : [b, a]);
    }
  }
  return pairs;
}
