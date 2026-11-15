import type { Aircraft } from "../types";
import { nmToMeters } from "../units";
import { fromEnu, type GeoOrigin } from "./enu";

/**
 * Scripted test scene for the conflict engine. Invented geometry, used by
 * tests only. The app never shows it: the app shows real traffic or nothing.
 */

/** Fixed scenario time. Positions never depend on the wall clock. */
export const SCENE_T0_UNIX = 1_700_000_000;

/** Origin used to place the scene. A teaching locale, not a claim about that airspace. */
export const SCENE_ORIGIN: GeoOrigin = { latitude: 39.86, longitude: -104.67 };

interface SceneSpec {
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

const SCENE: ReadonlyArray<SceneSpec> = [
  // Head-on, same altitude, 10 NM apart, 300 kt each: meet in 60 s (F1).
  { icao24: "test01", callsign: "HORIZON", eastNm: -5, northNm: 0, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "test02", callsign: "MERIDIAN", eastNm: 5, northNm: 0, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 270, verticalRateFpm: 0 },

  // Same direction, 6 NM abeam, same speed and altitude: no conflict (F2).
  { icao24: "test03", callsign: "PARALLEL-WIDE", eastNm: -20, northNm: 30, altitudeFt: 14000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "test04", callsign: "PARALLEL-WIDE-B", eastNm: -20, northNm: 36, altitudeFt: 14000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },

  // Same direction, 3 NM abeam: conflict at tcpa 0 (F3).
  { icao24: "test05", callsign: "PARALLEL-CLOSE", eastNm: -10, northNm: -30, altitudeFt: 6000, groundSpeedKt: 250, headingDeg: 90, verticalRateFpm: 0 },
  { icao24: "test06", callsign: "PARALLEL-CLOSE-B", eastNm: -10, northNm: -27, altitudeFt: 6000, groundSpeedKt: 250, headingDeg: 90, verticalRateFpm: 0 },

  // On the ground 2.5 NM abeam of PARALLEL-CLOSE and 600 ft below it. It would
  // flag if it were airborne, so it proves grounded aircraft are skipped (F6).
  { icao24: "test07", callsign: "TAXI", eastNm: -10, northNm: -32.5, altitudeFt: 5400, groundSpeedKt: 12, headingDeg: 90, verticalRateFpm: 0, onGround: true },

  // Head-on north and south, 2000 ft apart now, closing vertically to 0 ft
  // at 60 s (F5 style).
  { icao24: "test08", callsign: "LEVEL", eastNm: 25, northNm: 20, altitudeFt: 12000, groundSpeedKt: 300, headingDeg: 180, verticalRateFpm: 0 },
  { icao24: "test09", callsign: "CLIMBER", eastNm: 25, northNm: 10, altitudeFt: 10000, groundSpeedKt: 300, headingDeg: 0, verticalRateFpm: 2000 },

  // Head-on with 3000 ft between them and level: no conflict (F4).
  { icao24: "test10", callsign: "LOWER", eastNm: -20, northNm: -12, altitudeFt: 13000, groundSpeedKt: 300, headingDeg: 270, verticalRateFpm: 0 },
  { icao24: "test11", callsign: "UPPER", eastNm: -30, northNm: -12, altitudeFt: 16000, groundSpeedKt: 300, headingDeg: 90, verticalRateFpm: 0 },

  // Position only. Excluded from pairing.
  { icao24: "test12", callsign: "SILENT", eastNm: 10, northNm: -15, altitudeFt: 9000, groundSpeedKt: null, headingDeg: null, verticalRateFpm: null },
];

export function buildSceneAircraft(): Aircraft[] {
  return SCENE.map((spec) => {
    const { latitude, longitude } = fromEnu(
      nmToMeters(spec.eastNm),
      nmToMeters(spec.northNm),
      SCENE_ORIGIN,
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
      lastContactUnix: SCENE_T0_UNIX,
    };
  });
}
