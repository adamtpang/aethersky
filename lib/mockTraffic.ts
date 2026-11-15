import { fromEnu, type GeoOrigin } from "./conflict/enu";
import type { Aircraft, AircraftFeed } from "./types";
import { nmToMeters } from "./units";

/**
 * Deterministic mock traffic. Invented geometry that exercises the conflict
 * engine. It is not a recording of real flights and makes no claim about the
 * airspace it is drawn over.
 */

/** Fixed scenario time. Positions never depend on the wall clock. */
export const MOCK_T0_UNIX = 1_700_000_000;

/**
 * Teaching locale: a generic area east of the Denver region. Chosen only so
 * the map has something to draw under the scripted traffic.
 */
export const MOCK_ORIGIN: GeoOrigin = { latitude: 39.86, longitude: -104.67 };

interface MockSpec {
  icao24: string;
  callsign: string;
  eastNm: number;
  northNm: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  headingDeg: number | null;
  verticalRateFpm: number | null;
  onGround?: boolean;
}

const SCENE: ReadonlyArray<MockSpec> = [
  // Head-on, same altitude, 10 NM apart, 300 kt each: meet in 60 s (F1).
  { icao24: "mock01", callsign: "HORIZON", eastNm: -5, northNm: 0, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "mock02", callsign: "MERIDIAN", eastNm: 5, northNm: 0, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 270, verticalRateFpm: 0 },

  // Same direction, 6 NM abeam, same speed and altitude: no conflict (F2).
  { icao24: "mock03", callsign: "PARALLEL-WIDE", eastNm: -20, northNm: 30, altitudeFt: 14000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "mock04", callsign: "PARALLEL-WIDE-B", eastNm: -20, northNm: 36, altitudeFt: 14000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },

  // Same direction, 3 NM abeam: conflict at tcpa 0 (F3).
  { icao24: "mock05", callsign: "PARALLEL-CLOSE", eastNm: -10, northNm: -30, altitudeFt: 6000, groundSpeedKt: 250, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "mock06", callsign: "PARALLEL-CLOSE-B", eastNm: -10, northNm: -27, altitudeFt: 6000, groundSpeedKt: 250, headingDeg: 90, verticalRateFpm: 0 },

  // On the ground 2.5 NM abeam of PARALLEL-CLOSE and 600 ft below it. It would
  // flag if it were airborne, so it proves grounded aircraft are skipped (F6).
  { icao24: "mock07", callsign: "TAXI", eastNm: -10, northNm: -32.5, altitudeFt: 5400, groundSpeedKt: 12, headingDeg: 90, verticalRateFpm: 0, onGround: true },

  // Head-on north and south, 2000 ft apart now, closing vertically to 0 ft
  // at 60 s (F5 style).
  { icao24: "mock08", callsign: "LEVEL", eastNm: 25, northNm: 20, altitudeFt: 12000, groundSpeedKt: 300, headingDeg: 180, verticalRateFpm: 0 },
  { icao24: "mock09", callsign: "CLIMBER", eastNm: 25, northNm: 10, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 0, verticalRateFpm: 2000 },

  // Head-on with 3000 ft between them and level: no conflict (F4).
  { icao24: "mock10", callsign: "LOWER", eastNm: -20, northNm: -12, altitudeFt: 13000, groundSpeedKt: 300, headingDeg: 270, verticalRateFpm: 0 },
  { icao24: "mock11", callsign: "UPPER", eastNm: -30, northNm: -12, altitudeFt: 16000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },

  // Position only. Drawn on the map but excluded from pairing.
  { icao24: "mock12", callsign: "SILENT", eastNm: 10, northNm: -15, altitudeFt: 9000, groundSpeedKt: null, headingDeg: null, verticalRateFpm: null },
];

export function buildMockAircraft(): Aircraft[] {
  return SCENE.map((spec) => {
    const { latitude, longitude } = fromEnu(
      nmToMeters(spec.eastNm),
      nmToMeters(spec.northNm),
      MOCK_ORIGIN,
    );
    return {
      icao24: spec.icao24,
      callsign: spec.callsign,
      latitude,
      longitude,
      altitudeFt: spec.altitudeFt,
      geoAltitudeFt: spec.altitudeFt,
      groundSpeedKt: spec.groundSpeedKt,
      headingDeg: spec.headingDeg,
      verticalRateFpm: spec.verticalRateFpm,
      onGround: spec.onGround === true,
      lastContactUnix: MOCK_T0_UNIX,
    };
  });
}

/** The mock feed. Only `fetchedAtUnix` uses the wall clock. */
export function buildMockFeed(warning?: string): AircraftFeed {
  return {
    source: "mock",
    fetchedAtUnix: Math.floor(Date.now() / 1000),
    timeUnix: MOCK_T0_UNIX,
    aircraft: buildMockAircraft(),
    ...(warning ? { warning } : {}),
  };
}
