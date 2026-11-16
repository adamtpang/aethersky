import type { Aircraft, ConflictPair, ConflictThresholds } from "../types";
import { metersToNm } from "../units";
import { evaluatePair, verticalSeparationFt, type Track } from "./cpa";
import { isEligible, toTrack } from "./detect";

/**
 * An illustration of the second half of the idea: once a pair is flagged,
 * what small change would clear it?
 *
 * This tries a short list of single changes to one aircraft, checks the
 * whole lookahead window, and returns the first change that clears the pair
 * without bringing that aircraft too close to anything else nearby. If no
 * single change is enough, it tries splitting the pair vertically: one
 * climbs while the other descends.
 *
 * It is a teaching aid. It is not a resolution advisory, it knows nothing
 * about terrain, weather, airspace, performance, or what a controller has
 * already said, and it must never be shown as an instruction.
 */

export type ManeuverKind = "level" | "turn" | "climb" | "descend" | "slow" | "split";

export interface Maneuver {
  kind: ManeuverKind;
  /** A verb phrase that follows the callsign, for example "levels off". */
  label: string;
  /** The aircraft after the change, or null when the change does not apply. */
  apply: (ac: Aircraft) => Aircraft | null;
}

/** Demo values only. Not performance figures for any real aircraft. */
const CLIMB_FPM = 1_500;

const turn = (deg: number): Maneuver => ({
  kind: "turn",
  label: `turns ${deg > 0 ? "right" : "left"} ${Math.abs(deg)}°`,
  apply: (ac) =>
    ac.headingDeg === null
      ? null
      : { ...ac, headingDeg: (((ac.headingDeg + deg) % 360) + 360) % 360 },
});

/** Tried in this order: the smallest change first. */
export const MANEUVERS: ReadonlyArray<Maneuver> = [
  {
    kind: "level",
    label: "levels off",
    // Only a real change for an aircraft that is climbing or descending.
    apply: (ac) =>
      ac.verticalRateFpm !== null && Math.abs(ac.verticalRateFpm) >= 100
        ? { ...ac, verticalRateFpm: 0 }
        : null,
  },
  turn(20),
  turn(-20),
  {
    kind: "climb",
    label: `climbs at ${CLIMB_FPM.toLocaleString("en-US")} fpm`,
    apply: (ac) => ({ ...ac, verticalRateFpm: CLIMB_FPM }),
  },
  {
    kind: "descend",
    label: `descends at ${CLIMB_FPM.toLocaleString("en-US")} fpm`,
    apply: (ac) => ({ ...ac, verticalRateFpm: -CLIMB_FPM }),
  },
  {
    kind: "slow",
    label: "slows by 10%",
    apply: (ac) =>
      ac.groundSpeedKt === null ? null : { ...ac, groundSpeedKt: ac.groundSpeedKt * 0.9 },
  },
  turn(45),
  turn(-45),
];

export interface Resolution {
  /** The aircraft that would change. */
  aircraftId: string;
  kind: ManeuverKind;
  label: string;
  /**
   * Set when both aircraft change (kind "split"): the other aircraft and
   * what it does.
   */
  partnerId?: string;
  partnerLabel?: string;
  /**
   * For a pair that is still closing: how far apart they would pass, at the
   * closest moment inside the lookahead window, after the change.
   */
  afterHorizontalNm: number;
  afterVerticalFt: number;
  /**
   * For a pair already inside the demo limits: seconds until they would be
   * outside them. Undefined for a pair that is still closing.
   */
  clearsInSec?: number;
}

/** Both aircraft on a small plane centered between them. */
function pairTracks(a: Aircraft, b: Aircraft): [Track, Track] | null {
  const middle = {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
  const ta = toTrack(a, middle);
  const tb = toTrack(b, middle);
  return ta && tb ? [ta, tb] : null;
}

function horizontalNmAt(a: Track, b: Track, tSec: number): number {
  const east = b.east - a.east + (b.vEast - a.vEast) * tSec;
  const north = b.north - a.north + (b.vNorth - a.vNorth) * tSec;
  return metersToNm(Math.hypot(east, north));
}

const insideAt = (a: Track, b: Track, tSec: number, t: ConflictThresholds): boolean =>
  horizontalNmAt(a, b, tSec) < t.lateralNm && verticalSeparationFt(a, b, tSec) < t.verticalFt;

/** Closest horizontal approach inside the window, and the separation then. */
function outlook(a: Track, b: Track, t: ConflictThresholds) {
  const vE = b.vEast - a.vEast;
  const vN = b.vNorth - a.vNorth;
  const v2 = vE * vE + vN * vN;
  const raw = v2 < 1e-9 ? 0 : -((b.east - a.east) * vE + (b.north - a.north) * vN) / v2;
  const tSec = Math.min(t.lookaheadSec, Math.max(0, raw));
  return {
    horizontalNm: horizontalNmAt(a, b, tSec),
    verticalFt: verticalSeparationFt(a, b, tSec),
  };
}

const STEP_SEC = 5;

/**
 * True if the two are inside both limits at any moment in the window. This
 * is stricter than the engine, which looks at vertical separation only at
 * the moment of closest horizontal approach. A suggested change has to pass
 * the stricter test, so that a climb through another aircraft's level is
 * never offered as a way out.
 */
function everInside(a: Track, b: Track, t: ConflictThresholds): boolean {
  for (let s = 0; s <= t.lookaheadSec; s += STEP_SEC) {
    if (insideAt(a, b, s, t)) return true;
  }
  return false;
}

/**
 * For a pair already inside the limits: the first moment after which they
 * are outside the limits and stay outside until the end of the window.
 */
function secondsToClear(a: Track, b: Track, t: ConflictThresholds): number | null {
  let clearFrom: number | null = null;
  for (let s = STEP_SEC; s <= t.lookaheadSec; s += STEP_SEC) {
    if (insideAt(a, b, s, t)) clearFrom = null;
    else if (clearFrom === null) clearFrom = s;
  }
  return clearFrom;
}

const keyOf = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * True if the change would bring the aircraft inside the limits with some
 * other aircraft that it was clear of before.
 */
function flagsSomethingNew(
  original: Aircraft,
  changed: Aircraft,
  partnerId: string,
  others: ReadonlyArray<Aircraft>,
  alreadyFlagged: ReadonlySet<string>,
  thresholds: ConflictThresholds,
): boolean {
  for (const other of others) {
    if (other.icao24 === changed.icao24 || other.icao24 === partnerId) continue;
    // Skip anything too far away to matter, before any real work.
    if (
      Math.abs(other.latitude - changed.latitude) > 2 ||
      Math.abs(other.longitude - changed.longitude) > 3
    ) {
      continue;
    }
    if (alreadyFlagged.has(keyOf(changed.icao24, other.icao24))) continue;
    const after = pairTracks(changed, other);
    if (!after || !everInside(after[0], after[1], thresholds)) continue;
    // Only blame the change for trouble that was not already there.
    const before = pairTracks(original, other);
    if (before && everInside(before[0], before[1], thresholds)) continue;
    return true;
  }
  return false;
}

/**
 * One small change that would clear a flagged pair, or null when nothing on
 * the demo list does.
 *
 * `others` is the traffic the check covers. `alreadyFlagged` holds the keys
 * ("a|b", lower id first) of every pair flagged before the change, so the
 * change is not blamed for conflicts that already existed.
 */
export function suggestResolution(
  pair: Pick<ConflictPair, "a" | "b">,
  a: Aircraft,
  b: Aircraft,
  thresholds: ConflictThresholds,
  others: ReadonlyArray<Aircraft> = [],
  alreadyFlagged: ReadonlySet<string> = new Set(),
): Resolution | null {
  if (!isEligible(a) || !isEligible(b)) return null;
  const before = pairTracks(a, b);
  if (!before) return null;
  const insideNow = insideAt(before[0], before[1], 0, thresholds);

  let best: Resolution | null = null;
  for (const maneuver of MANEUVERS) {
    for (const mover of [a, b]) {
      const changed = maneuver.apply(mover);
      if (!changed) continue;
      const partner = mover === a ? b : a;
      const tracks = pairTracks(changed, partner);
      if (!tracks) continue;

      let clearsInSec: number | undefined;
      if (insideNow) {
        const seconds = secondsToClear(tracks[0], tracks[1], thresholds);
        if (seconds === null) continue;
        clearsInSec = seconds;
      } else if (
        evaluatePair(tracks[0], tracks[1], thresholds) ||
        everInside(tracks[0], tracks[1], thresholds)
      ) {
        continue;
      }
      if (
        flagsSomethingNew(mover, changed, partner.icao24, others, alreadyFlagged, thresholds)
      ) {
        continue;
      }

      const after = outlook(tracks[0], tracks[1], thresholds);
      const candidate: Resolution = {
        aircraftId: mover.icao24,
        kind: maneuver.kind,
        label: maneuver.label,
        afterHorizontalNm: after.horizontalNm,
        afterVerticalFt: after.verticalFt,
        ...(clearsInSec !== undefined ? { clearsInSec } : {}),
      };
      // A closing pair takes the first (smallest) change that works. A pair
      // already inside the limits takes whichever gets them out soonest.
      if (!insideNow) return candidate;
      if (!best || (candidate.clearsInSec as number) < (best.clearsInSec as number)) {
        best = candidate;
      }
    }
  }
  void pair;
  if (best) return best;

  // No single change was enough. The classic answer when time is short is
  // to split the pair vertically: the higher one climbs, the lower descends.
  const [upper, lower] = (a.altitudeFt as number) >= (b.altitudeFt as number) ? [a, b] : [b, a];
  const up: Aircraft = { ...upper, verticalRateFpm: CLIMB_FPM };
  const down: Aircraft = { ...lower, verticalRateFpm: -CLIMB_FPM };
  const tracks = pairTracks(up, down);
  if (!tracks) return null;
  let clearsInSec: number | undefined;
  if (insideNow) {
    const seconds = secondsToClear(tracks[0], tracks[1], thresholds);
    if (seconds === null) return null;
    clearsInSec = seconds;
  } else if (everInside(tracks[0], tracks[1], thresholds)) {
    return null;
  }
  if (
    flagsSomethingNew(upper, up, lower.icao24, others, alreadyFlagged, thresholds) ||
    flagsSomethingNew(lower, down, upper.icao24, others, alreadyFlagged, thresholds)
  ) {
    return null;
  }
  const after = outlook(tracks[0], tracks[1], thresholds);
  const rate = `${CLIMB_FPM.toLocaleString("en-US")} fpm`;
  return {
    aircraftId: upper.icao24,
    kind: "split",
    label: `climbs at ${rate}`,
    partnerId: lower.icao24,
    partnerLabel: `descends at ${rate}`,
    afterHorizontalNm: after.horizontalNm,
    afterVerticalFt: after.verticalFt,
    ...(clearsInSec !== undefined ? { clearsInSec } : {}),
  };
}
