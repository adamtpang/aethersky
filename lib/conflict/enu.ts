import type { EnuMeters } from "../types";
import { degToRad, radToDeg } from "../units";

/**
 * ASSUMPTION: mean Earth radius, used as a teaching default for a flat-earth
 * local tangent plane. This is not a WGS-84 ellipsoid and the projection
 * drifts as range from the origin grows. Good enough for a demo over a few
 * tens of nautical miles.
 */
export const EARTH_RADIUS_M = 6_371_000;

export interface GeoOrigin {
  latitude: number; // degrees
  longitude: number; // degrees
  altitudeM?: number;
}

/** Project a geodetic point onto the local tangent plane at `origin`. */
export function toEnu(
  latitude: number,
  longitude: number,
  altitudeM: number,
  origin: GeoOrigin,
): EnuMeters {
  const lat0 = degToRad(origin.latitude);
  const lon0 = degToRad(origin.longitude);
  return {
    east: EARTH_RADIUS_M * (degToRad(longitude) - lon0) * Math.cos(lat0),
    north: EARTH_RADIUS_M * (degToRad(latitude) - lat0),
    up: altitudeM - (origin.altitudeM ?? 0),
  };
}

/** Inverse of `toEnu` for the horizontal components. */
export function fromEnu(
  east: number,
  north: number,
  origin: GeoOrigin,
): { latitude: number; longitude: number } {
  const lat0 = degToRad(origin.latitude);
  const lon0 = degToRad(origin.longitude);
  return {
    latitude: radToDeg(lat0 + north / EARTH_RADIUS_M),
    longitude: radToDeg(lon0 + east / (EARTH_RADIUS_M * Math.cos(lat0))),
  };
}

/** Average of the given positions, used as the origin when no bbox is supplied. */
export function centroidOrigin(
  points: ReadonlyArray<{ latitude: number; longitude: number }>,
): GeoOrigin {
  if (points.length === 0) return { latitude: 0, longitude: 0 };
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.latitude;
    lon += p.longitude;
  }
  return { latitude: lat / points.length, longitude: lon / points.length };
}
