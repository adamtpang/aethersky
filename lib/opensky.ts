import {
  FeedError,
  REQUEST_TIMEOUT_MS,
  finiteOrNull as num,
  type LiveStates,
} from "./feedError";
import type { Aircraft, BoundingBox } from "./types";
import { metersToFt, mpsToFpm, mpsToKt } from "./units";

/**
 * Server-only OpenSky Network client. Reads optional credentials from the
 * environment and never returns or logs them. The free OpenSky API is for
 * non-profit research and education. See docs/data-sources.md.
 */

const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

const TOKEN_MARGIN_MS = 30_000;

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
    throw new FeedError("the feed returned an unexpected body");
  }
  const { time, states } = body as { time?: unknown; states?: unknown };
  // `states` is null when no aircraft are inside the bounding box.
  if (states !== null && !Array.isArray(states)) {
    throw new FeedError("the feed returned an unexpected body");
  }
  const aircraft: Aircraft[] = [];
  for (const row of states ?? []) {
    const mapped = mapStateVector(row);
    if (mapped) aircraft.push(mapped);
  }
  return { timeUnix: num(time), aircraft };
}

// In-memory state for this server instance. No database.
let token: { value: string; expiresAtMs: number } | null = null;
let warnedPartialCredentials = false;

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
    throw new FeedError("the token request failed", res.status);
  }
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new FeedError("the token response had no access token");
  }
  const expiresInSec = num(body.expires_in) ?? 1800;
  token = {
    value: body.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  return token.value;
}

/** Fetch every aircraft inside a bounding box from OpenSky `/states/all`. */
export async function fetchOpenSky(
  bbox: BoundingBox,
  allowRetry = true,
): Promise<LiveStates> {
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
    throw new FeedError(
      "rate limit reached",
      429,
      Number.isFinite(header) && header > 0 ? header : undefined,
    );
  }
  if (res.status === 401 && bearer && allowRetry) {
    // The token may have expired early. Refresh once, never in a loop.
    token = null;
    return fetchOpenSky(bbox, false);
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
  return mapStatesResponse(body);
}
