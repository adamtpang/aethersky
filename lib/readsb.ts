import { bboxToPoint, inBbox } from "./bbox";
import {
  FeedError,
  REQUEST_TIMEOUT_MS,
  finiteOrNull as num,
  type LiveStates,
} from "./feedError";
import type { Aircraft, BoundingBox, FeedSource } from "./types";

/**
 * Server-only client for community ADS-B aggregators that speak the readsb
 * JSON format (adsb.fi and adsb.lol). These feeds already report feet,
 * knots, and feet per minute, so no unit conversion is needed.
 *
 * Terms checked November 15, 2026. See docs/data-sources.md.
 */

/**
 * ASSUMPTION: a position older than this is too stale to project forward at
 * constant velocity, so the aircraft is dropped. Teaching default.
 */
export const MAX_POSITION_AGE_SEC = 60;

export interface ReadsbProvider {
  source: Extract<FeedSource, "adsb.fi" | "adsb.lol">;
  buildUrl: (latitude: number, longitude: number, radiusNm: number) => string;
  /** Optional request headers, for example an API key from the environment. */
  headers?: () => Record<string, string> | undefined;
}

export const ADSB_FI: ReadsbProvider = {
  source: "adsb.fi",
  buildUrl: (lat, lon, dist) =>
    `https://opendata.adsb.fi/api/v3/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${dist}`,
};

export const ADSB_LOL: ReadsbProvider = {
  source: "adsb.lol",
  buildUrl: (lat, lon, dist) =>
    `https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${dist}`,
  headers: () => {
    const key = process.env.ADSBLOL_API_KEY?.trim();
    return key ? { "x-api-key": key } : undefined;
  },
};

/**
 * Convert one readsb aircraft object. Returns null when it has no usable id
 * or position, or when the position is stale.
 */
export function mapReadsbAircraft(row: unknown, nowUnix: number | null): Aircraft | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const icao24 = typeof r.hex === "string" ? r.hex.trim().toLowerCase() : "";
  const latitude = num(r.lat);
  const longitude = num(r.lon);
  if (!icao24 || latitude === null || longitude === null) return null;

  const positionAge = num(r.seen_pos);
  if (positionAge !== null && positionAge > MAX_POSITION_AGE_SEC) return null;

  const onGround = r.alt_baro === "ground";
  const baroFt = num(r.alt_baro);
  const geoFt = num(r.alt_geom);
  const callsign = typeof r.flight === "string" ? r.flight.trim() : "";
  const registration = typeof r.r === "string" ? r.r.trim() : "";
  const seen = num(r.seen);

  return {
    icao24,
    callsign: callsign || registration || icao24.toUpperCase(),
    latitude,
    longitude,
    // Prefer barometric altitude, then geometric, else null.
    altitudeFt: baroFt ?? geoFt,
    geoAltitudeFt: geoFt,
    groundSpeedKt: num(r.gs),
    // Track over the ground when reported, else the aircraft's true heading.
    headingDeg: num(r.track) ?? num(r.true_heading),
    verticalRateFpm: num(r.baro_rate) ?? num(r.geom_rate),
    onGround,
    lastContactUnix:
      nowUnix === null ? null : Math.round(nowUnix - (seen ?? 0)),
  };
}

/** Map a readsb response body. Throws on a body that is not the documented shape. */
export function mapReadsbResponse(body: unknown): LiveStates {
  if (typeof body !== "object" || body === null) {
    throw new FeedError("the feed returned an unexpected body");
  }
  const b = body as Record<string, unknown>;
  const list = b.ac ?? b.aircraft;
  if (!Array.isArray(list)) {
    throw new FeedError("the feed returned an unexpected body");
  }
  // `now` is in milliseconds on these feeds.
  const nowMs = num(b.now);
  const timeUnix = nowMs === null ? null : Math.floor(nowMs > 1e11 ? nowMs / 1000 : nowMs);
  const aircraft: Aircraft[] = [];
  for (const row of list) {
    const mapped = mapReadsbAircraft(row, timeUnix);
    if (mapped) aircraft.push(mapped);
  }
  return { timeUnix, aircraft };
}

/** Fetch every aircraft inside a bounding box from one readsb-format feed. */
export async function fetchReadsb(
  provider: ReadsbProvider,
  bbox: BoundingBox,
): Promise<LiveStates> {
  const { latitude, longitude, radiusNm } = bboxToPoint(bbox);
  const res = await fetch(provider.buildUrl(latitude, longitude, radiusNm), {
    headers: { Accept: "application/json", ...(provider.headers?.() ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 429) {
    const header = Number(res.headers.get("Retry-After"));
    throw new FeedError(
      "rate limit reached",
      429,
      Number.isFinite(header) && header > 0 ? header : undefined,
    );
  }
  if (!res.ok) {
    throw new FeedError(`responded with status ${res.status}`, res.status);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new FeedError("the feed returned an unexpected body");
  }
  const states = mapReadsbResponse(body);
  // The feed answers with a circle. Keep only what is inside the box.
  return {
    timeUnix: states.timeUnix,
    aircraft: states.aircraft.filter((ac) => inBbox(bbox, ac.latitude, ac.longitude)),
  };
}
