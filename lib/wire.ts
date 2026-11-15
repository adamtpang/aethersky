import type { Aircraft, FeedSource } from "./types";

/**
 * Wire format for the national traffic stream. Thousands of aircraft as
 * keyed objects would be a few megabytes, so each aircraft is one array, and
 * the response is a stream of JSON lines so the page can draw each region
 * as soon as it arrives instead of waiting for the whole country.
 */

/**
 * [icao24, callsign, lat, lon, altFt, groundSpeedKt, headingDeg,
 *  verticalRateFpm, positionUnix]
 *
 * The position is as reported, not projected. `positionUnix` is when it was
 * true, so the page can move every aircraft forward to the same moment.
 */
export type WireRow = [
  string,
  string,
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
];

export type SweepEvent =
  | {
      t: "start";
      source: FeedSource;
      /** Server clock when the sweep began, unix seconds. */
      startedAtUnix: number;
      regionsTotal: number;
    }
  | {
      t: "region";
      /** Regions finished so far, counting this one. */
      done: number;
      ok: boolean;
      /** Airborne aircraft only. Only sightings fresher than ones already sent. */
      rows: WireRow[];
    }
  | {
      t: "end";
      /** Server clock when the sweep finished, unix seconds. */
      finishedAtUnix: number;
      sweepSec: number;
      regionsOk: number;
      regionsTotal: number;
      warning?: string;
      /** Set when too few regions answered. The page then shows no traffic. */
      error?: string;
    };

const round = (value: number | null, digits = 0): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export function encodeSighting(ac: Aircraft, positionUnix: number): WireRow {
  return [
    ac.icao24,
    ac.callsign,
    round(ac.latitude, 4) as number,
    round(ac.longitude, 4) as number,
    round(ac.altitudeFt),
    round(ac.groundSpeedKt),
    round(ac.headingDeg),
    round(ac.verticalRateFpm),
    round(positionUnix, 1) as number,
  ];
}

export function decodeSighting(row: WireRow): Aircraft {
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
    lastContactUnix: Math.round(row[8]),
  };
}
