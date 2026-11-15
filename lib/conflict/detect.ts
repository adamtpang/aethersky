import type { Aircraft, ConflictPair, ConflictThresholds } from "../types";
import { degToRad, ktToMps } from "../units";
import { evaluatePair, type Track } from "./cpa";
import { centroidOrigin, toEnu, type GeoOrigin } from "./enu";
import { allPairs, candidatePairs } from "./grid";

export interface DetectOptions {
  /** Local tangent plane origin. Defaults to the average aircraft position. */
  origin?: GeoOrigin;
  /** Run the uniform grid prefilter. Defaults to true. */
  usePrefilter?: boolean;
}

/**
 * True when an aircraft has everything the pairing model needs: airborne,
 * with a position, a heading, a ground speed, and a usable altitude.
 */
export function isEligible(ac: Aircraft): boolean {
  return (
    ac.onGround !== true &&
    Number.isFinite(ac.latitude) &&
    Number.isFinite(ac.longitude) &&
    ac.headingDeg !== null &&
    Number.isFinite(ac.headingDeg) &&
    ac.groundSpeedKt !== null &&
    Number.isFinite(ac.groundSpeedKt) &&
    ac.altitudeFt !== null &&
    Number.isFinite(ac.altitudeFt)
  );
}

/** Reduce an eligible aircraft to a constant-velocity track in local ENU. */
export function toTrack(ac: Aircraft, origin: GeoOrigin): Track | null {
  if (!isEligible(ac)) return null;
  const enu = toEnu(ac.latitude, ac.longitude, 0, origin);
  const speed = ktToMps(ac.groundSpeedKt as number);
  const psi = degToRad(ac.headingDeg as number);
  return {
    id: ac.icao24,
    east: enu.east,
    north: enu.north,
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

export function sortConflicts(pairs: ConflictPair[]): ConflictPair[] {
  return pairs.sort(
    (x, y) =>
      x.tcpaSec - y.tcpaSec ||
      x.dcpaNm - y.dcpaNm ||
      x.a.localeCompare(y.a) ||
      x.b.localeCompare(y.b),
  );
}

/**
 * Pair-wise geometric conflict check. Returns every flagged pair, sorted by
 * time to closest approach, then by closest-approach distance.
 *
 * Advisory only. Constant velocity, flat-earth tangent plane. Not TCAS, not
 * a resolution advisory, and not a certified CPA implementation.
 */
export function detectConflicts(
  aircraft: ReadonlyArray<Aircraft>,
  thresholds: ConflictThresholds,
  options: DetectOptions = {},
): ConflictPair[] {
  const eligible = aircraft.filter(isEligible);
  if (eligible.length < 2) return [];

  const origin = options.origin ?? centroidOrigin(eligible);
  const tracks: Track[] = [];
  for (const ac of eligible) {
    const track = toTrack(ac, origin);
    if (track) tracks.push(track);
  }

  const pairs =
    options.usePrefilter === false
      ? allPairs(tracks)
      : candidatePairs(tracks, thresholds);

  const conflicts: ConflictPair[] = [];
  for (const [a, b] of pairs) {
    const hit = evaluatePair(a, b, thresholds);
    if (hit) conflicts.push(hit);
  }
  return sortConflicts(conflicts);
}

export function pairKey(pair: Pick<ConflictPair, "a" | "b">): string {
  return `${pair.a}|${pair.b}`;
}
