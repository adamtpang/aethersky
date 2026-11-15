import { EARTH_RADIUS_M } from "./conflict/enu";
import type { Aircraft, BoundingBox } from "./types";
import { degToRad, ktToMps, radToDeg } from "./units";

/** Display default for velocity vectors. Distinct from the conflict lookahead. */
export const VECTOR_SECONDS = 60;

/**
 * Largest side of the box the client asks the live feed for, in degrees.
 * 5 by 5 degrees is 25 square degrees, the lowest OpenSky credit tier.
 */
export const MAX_BBOX_SPAN_DEG = 5;

export interface ViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Where an aircraft would be after `seconds` at its current track and speed. */
export function projectAhead(
  ac: Pick<Aircraft, "latitude" | "longitude" | "groundSpeedKt" | "headingDeg">,
  seconds: number,
): [number, number] | null {
  if (ac.groundSpeedKt === null || ac.headingDeg === null) return null;
  const distance = ktToMps(ac.groundSpeedKt) * seconds;
  const psi = degToRad(ac.headingDeg);
  const lat = degToRad(ac.latitude);
  const dLat = (distance * Math.cos(psi)) / EARTH_RADIUS_M;
  const dLon = (distance * Math.sin(psi)) / (EARTH_RADIUS_M * Math.cos(lat));
  return [ac.latitude + radToDeg(dLat), ac.longitude + radToDeg(dLon)];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Turn the current map view into a live-feed bounding box, clamped so a
 * zoomed-out map never turns into a full-world query.
 */
export function clampBbox(
  view: ViewBounds,
  maxSpanDeg: number = MAX_BBOX_SPAN_DEG,
): BoundingBox {
  const half = maxSpanDeg / 2;
  const centerLat = clamp((view.south + view.north) / 2, -90 + half, 90 - half);
  const centerLon = clamp(wrapLon((view.west + view.east) / 2), -180 + half, 180 - half);
  const halfLat = Math.min(half, Math.max(0.05, (view.north - view.south) / 2));
  const halfLon = Math.min(half, Math.max(0.05, (view.east - view.west) / 2));
  return {
    lamin: centerLat - halfLat,
    lomin: centerLon - halfLon,
    lamax: centerLat + halfLat,
    lomax: centerLon + halfLon,
  };
}

/** Where the map opens: the Denver area, a busy patch of sky to start on. */
export const DEFAULT_CENTER = { latitude: 39.86, longitude: -104.67 };

/** First live box and first map view: a few degrees around the start point. */
export const DEFAULT_BBOX: BoundingBox = {
  lamin: DEFAULT_CENTER.latitude - 0.75,
  lomin: DEFAULT_CENTER.longitude - 0.9,
  lamax: DEFAULT_CENTER.latitude + 0.75,
  lomax: DEFAULT_CENTER.longitude + 0.9,
};
