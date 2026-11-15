import type { BoundingBox } from "./types";
import { degToRad } from "./units";

/**
 * Largest bounding box the feed route will forward, in square degrees.
 * The client clamps to 25 (5 by 5 degrees).
 */
export const MAX_BBOX_AREA_SQ_DEG = 100;

export function isValidBbox(bbox: BoundingBox): boolean {
  const { lamin, lomin, lamax, lomax } = bbox;
  return (
    [lamin, lomin, lamax, lomax].every(Number.isFinite) &&
    lamin >= -90 &&
    lamax <= 90 &&
    lomin >= -180 &&
    lomax <= 180 &&
    lamin < lamax &&
    lomin < lomax
  );
}

export const bboxAreaSqDeg = (bbox: BoundingBox): number =>
  (bbox.lamax - bbox.lamin) * (bbox.lomax - bbox.lomin);

export const bboxKey = (bbox: BoundingBox): string =>
  [bbox.lamin, bbox.lomin, bbox.lamax, bbox.lomax].map((v) => v.toFixed(2)).join(",");

export const inBbox = (
  bbox: BoundingBox,
  latitude: number,
  longitude: number,
): boolean =>
  latitude >= bbox.lamin &&
  latitude <= bbox.lamax &&
  longitude >= bbox.lomin &&
  longitude <= bbox.lomax;

/** Largest radius the point-and-radius feeds accept, nautical miles. */
export const MAX_POINT_RADIUS_NM = 250;

/**
 * Center and radius (nautical miles) of the circle that covers a bounding
 * box, for feeds that take a point and a distance instead of a box. One
 * degree of latitude is taken as 60 NM, which is close enough for a query.
 */
export function bboxToPoint(bbox: BoundingBox): {
  latitude: number;
  longitude: number;
  radiusNm: number;
} {
  const latitude = (bbox.lamin + bbox.lamax) / 2;
  const longitude = (bbox.lomin + bbox.lomax) / 2;
  const halfNorthNm = ((bbox.lamax - bbox.lamin) / 2) * 60;
  const halfEastNm =
    ((bbox.lomax - bbox.lomin) / 2) * 60 * Math.cos(degToRad(latitude));
  const radiusNm = Math.min(
    MAX_POINT_RADIUS_NM,
    Math.max(1, Math.ceil(Math.hypot(halfNorthNm, halfEastNm))),
  );
  return { latitude, longitude, radiusNm };
}
