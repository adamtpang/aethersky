import { buildMockFeed } from "./mockTraffic";
import type { Aircraft, AircraftFeed, BoundingBox } from "./types";
import { metersToFt, mpsToFpm, mpsToKt } from "./units";

/**
 * Server-only OpenSky Network client. Reads optional credentials from the
 * environment and never returns or logs them. The free OpenSky API is for
 * non-profit research and education. See docs/data-sources.md.
 */

const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

const CACHE_TTL_MS = 10_000;
const TOKEN_MARGIN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_AFTER_SEC = 60;
const MAX_CACHE_ENTRIES = 50;

/**
 * Largest bounding box the proxy will forward, in square degrees. Keeps the
 * OpenSky credit cost at 2 or less per request. The client clamps to 25.
 */
export const MAX_BBOX_AREA_SQ_DEG = 100;

export class OpenSkyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "OpenSkyError";
  }
}

interface LiveStates {
  timeUnix: number | null;
  aircraft: Aircraft[];
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Convert one OpenSky state vector to an Aircraft. Units are converted from
 * SI exactly once, here at the API boundary. Returns null when the vector
 * has no usable id or position.
 */
export function mapStateVector(row: unknown): Aircraft | null {
  if (!Array.isArray(row)) return null;
  const icao24 = typeof row[0] === "string" ? row[0].trim().toLowerCase() : "";
  const longitude = num(row[5]);
  const latitude = num(row[6]);
  if (!icao24 || longitude === null || latitude === null) return null;

  const baroM = num(row[7]);
  const geoM = num(row[13]);
  const velocity = num(row[9]);
  const track = num(row[10]);
  const verticalRate = num(row[11]);
  const callsign = typeof row[1] === "string" ? row[1].trim() : "";

  // Prefer barometric altitude, then geometric, else null.
  const altitudeM = baroM ?? geoM;
  return {
    icao24,
    callsign: callsign || icao24.toUpperCase(),
    longitude,
    latitude,
    altitudeFt: altitudeM === null ? null : metersToFt(altitudeM),
    geoAltitudeFt: geoM === null ? null : metersToFt(geoM),
    groundSpeedKt: velocity === null ? null : mpsToKt(velocity),
    headingDeg: track,
    verticalRateFpm: verticalRate === null ? null : mpsToFpm(verticalRate),
    onGround: row[8] === true,
    lastContactUnix: num(row[4]),
  };
}

/** Map a `/states/all` body. Throws on a body that is not the documented shape. */
export function mapStatesResponse(body: unknown): LiveStates {
  if (typeof body !== "object" || body === null || !("states" in body)) {
    throw new OpenSkyError("OpenSky returned an unexpected body");
  }
  const { time, states } = body as { time?: unknown; states?: unknown };
  // `states` is null when no aircraft are inside the bounding box.
  if (states !== null && !Array.isArray(states)) {
    throw new OpenSkyError("OpenSky returned an unexpected body");
  }
  const aircraft: Aircraft[] = [];
  for (const row of states ?? []) {
    const mapped = mapStateVector(row);
    if (mapped) aircraft.push(mapped);
  }
  return { timeUnix: num(time), aircraft };
}

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

// In-memory state for this server instance. No database.
let token: { value: string; expiresAtMs: number } | null = null;
let warnedPartialCredentials = false;
let rateLimitedUntilMs = 0;
const cache = new Map<string, { expiresAtMs: number; data: LiveStates }>();

function readCredentials(): { id: string; secret: string } | null {
  const id = process.env.OPENSKY_CLIENT_ID?.trim();
  const secret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (id && secret) return { id, secret };
  if ((id || secret) && !warnedPartialCredentials) {
    warnedPartialCredentials = true;
    console.warn(
      "[opensky] Only one of OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET is set. Using anonymous access.",
    );
  }
  return null;
}

async function getToken(): Promise<string | null> {
  const credentials = readCredentials();
  if (!credentials) return null;
  if (token && Date.now() < token.expiresAtMs - TOKEN_MARGIN_MS) {
    return token.value;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.id,
      client_secret: credentials.secret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new OpenSkyError("OpenSky token request failed", res.status);
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new OpenSkyError("OpenSky token response had no access token");
  }
  const expiresInSec = num(body.expires_in) ?? 1800;
  token = {
    value: body.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  return token.value;
}

async function requestStates(bbox: BoundingBox, allowRetry: boolean): Promise<LiveStates> {
  const bearer = await getToken();
  const url = new URL(STATES_URL);
  url.searchParams.set("lamin", String(bbox.lamin));
  url.searchParams.set("lomin", String(bbox.lomin));
  url.searchParams.set("lamax", String(bbox.lamax));
  url.searchParams.set("lomax", String(bbox.lomax));

  const res = await fetch(url, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 429) {
    const header = Number(res.headers.get("X-Rate-Limit-Retry-After-Seconds"));
    const retryAfterSec =
      Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_SEC;
    throw new OpenSkyError("OpenSky rate limit reached", 429, retryAfterSec);
  }
  if (res.status === 401 && bearer && allowRetry) {
    // The token may have expired early. Refresh once, never in a loop.
    token = null;
    return requestStates(bbox, false);
  }
  if (!res.ok) {
    throw new OpenSkyError(`OpenSky responded with status ${res.status}`, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new OpenSkyError("OpenSky returned an unexpected body");
  }
  return mapStatesResponse(body);
}

const bboxKey = (bbox: BoundingBox): string =>
  [bbox.lamin, bbox.lomin, bbox.lamax, bbox.lomax].map((v) => v.toFixed(2)).join(",");

function describeFailure(error: unknown): string {
  if (error instanceof OpenSkyError) {
    if (error.status === 429) {
      return `OpenSky rate limit reached. Retrying live data in about ${Math.ceil(
        error.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC,
      )} s.`;
    }
    return `${error.message}.`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "OpenSky did not respond in time.";
  }
  return "Could not reach OpenSky.";
}

/**
 * Live feed for a bounding box, with a 10 second cache per box. Any failure
 * (rate limit, auth, network, unexpected body) falls back to the mock feed
 * with `warning` set. Never throws.
 */
export async function getLiveFeed(bbox: BoundingBox): Promise<AircraftFeed> {
  const nowMs = Date.now();
  const fetchedAtUnix = Math.floor(nowMs / 1000);

  if (bboxAreaSqDeg(bbox) > MAX_BBOX_AREA_SQ_DEG) {
    return buildMockFeed(
      "The requested area is too large for the live feed. Zoom in. Showing mock traffic.",
    );
  }

  const key = bboxKey(bbox);
  const cached = cache.get(key);
  if (cached && nowMs < cached.expiresAtMs) {
    return { source: "opensky", fetchedAtUnix, ...cached.data };
  }

  if (nowMs < rateLimitedUntilMs) {
    const waitSec = Math.ceil((rateLimitedUntilMs - nowMs) / 1000);
    return buildMockFeed(
      `OpenSky rate limit reached. Retrying live data in about ${waitSec} s. Showing mock traffic.`,
    );
  }

  try {
    const data = await requestStates(bbox, true);
    if (cache.size >= MAX_CACHE_ENTRIES) {
      for (const [k, entry] of cache) {
        if (entry.expiresAtMs <= nowMs) cache.delete(k);
      }
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
    }
    cache.set(key, { expiresAtMs: Date.now() + CACHE_TTL_MS, data });
    return { source: "opensky", fetchedAtUnix, ...data };
  } catch (error) {
    if (error instanceof OpenSkyError && error.status === 429) {
      rateLimitedUntilMs =
        Date.now() + (error.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC) * 1000;
    }
    const status = error instanceof OpenSkyError ? error.status : undefined;
    console.warn(
      `[opensky] live request failed${status ? ` (status ${status})` : ""}, serving mock traffic`,
    );
    return buildMockFeed(`${describeFailure(error)} Showing mock traffic.`);
  }
}
