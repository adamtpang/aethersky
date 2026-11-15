import type { Aircraft, FeedSource } from "./types";

/**
 * Compact wire format for the national snapshot. Thousands of aircraft as
 * keyed objects would be a few megabytes, so each aircraft is one array.
 */

/** [icao24, callsign, lat, lon, altFt, groundSpeedKt, headingDeg, verticalRateFpm, lastContactUnix] */
export type WireRow = [
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export interface NationalSnapshot {
  source: FeedSource;
  /** When the sweep finished. Every position is projected to this time. */
  generatedAtUnix: number;
  /** How long the sweep took, seconds. */
  sweepSec: number;
  regionsOk: number;
  regionsTotal: number;
  /** Airborne aircraft only. Aircraft on the ground are left out. */
  rows: WireRow[];
  warning?: string;
}

const round = (value: number | null, digits = 0): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export function encodeAircraft(ac: Aircraft): WireRow {
  return [
    ac.icao24,
    ac.callsign,
    round(ac.latitude, 4) as number,
    round(ac.longitude, 4) as number,
    round(ac.altitudeFt),
    round(ac.groundSpeedKt),
    round(ac.headingDeg),
    round(ac.verticalRateFpm),
    ac.lastContactUnix,
  ];
}

export function decodeAircraft(row: WireRow): Aircraft {
  return {
    icao24: row[0],
    callsign: row[1],
    latitude: row[2],
    longitude: row[3],
    altitudeFt: row[4],
    geoAltitudeFt: null,
    groundSpeedKt: row[5],
    headingDeg: row[6],
    verticalRateFpm: row[7],
    onGround: false,
    lastContactUnix: row[8],
  };
}
