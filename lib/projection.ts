import { projectAhead } from "./geo";
import type { Aircraft } from "./types";
import { decodeSighting, type WireRow } from "./wire";

/**
 * ASSUMPTION: a reported position is moved forward along its track at
 * constant speed and climb for at most this many seconds. Older than this,
 * the aircraft is dropped instead of guessed at. Teaching default.
 */
export const MAX_POSITION_AGE_SEC = 120;

/**
 * Where a sighting is estimated to be at `nowUnix`. Returns null when the
 * sighting is too old to project honestly.
 */
export function projectRow(row: WireRow, nowUnix: number): Aircraft | null {
  const age = nowUnix - row[8];
  if (age > MAX_POSITION_AGE_SEC) return null;
  const aircraft = decodeSighting(row);
  if (age <= 0) return aircraft;
  const ahead = projectAhead(aircraft, age);
  if (!ahead) return aircraft;
  aircraft.latitude = ahead[0];
  aircraft.longitude = ahead[1];
  if (aircraft.altitudeFt !== null && aircraft.verticalRateFpm !== null) {
    aircraft.altitudeFt += (aircraft.verticalRateFpm * age) / 60;
  }
  return aircraft;
}
