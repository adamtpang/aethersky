import { FeedError, REQUEST_TIMEOUT_MS, finiteOrNull as num } from "./feedError";
import { projectAhead } from "./geo";
import { ADSB_FI, mapReadsbAircraft, readsbRows } from "./readsb";
import type { Aircraft } from "./types";
import { encodeAircraft, type NationalSnapshot } from "./wire";

/**
 * Whole-country live traffic. No feed answers a single request for the
 * contiguous United States, so the server sweeps it: 30 overlapping circles
 * of 250 NM from adsb.fi, one request per circle, spaced to respect the
 * feed's limit of 1 request per second. One sweep takes about 35 seconds
 * and is shared by every visitor.
 *
 * Real traffic only. If the sweep fails there is no substitute data.
 */

/** Largest radius the feed accepts, nautical miles. */
const TILE_RADIUS_NM = 250;

/**
 * Circle centers [lat, lon] that cover the contiguous United States. A
 * honeycomb layout with overlap, trimmed to the circles that touch a coarse
 * outline of the country. Alaska and Hawaii are not covered.
 */
export const NATIONAL_TILES: ReadonlyArray<readonly [number, number]> = [
  [48.55, -125.88], [48.55, -116.27], [48.55, -106.65], [48.55, -97.04], [48.55, -87.42], [48.55, -68.19],
  [43.04, -122.44], [43.04, -113.73], [43.04, -105.02], [43.04, -96.31], [43.04, -87.6], [43.04, -78.89], [43.04, -70.18],
  [37.53, -119.45], [37.53, -111.42], [37.53, -103.4], [37.53, -95.37], [37.53, -87.34], [37.53, -79.32], [37.53, -71.29],
  [32.01, -116.73], [32.01, -109.23], [32.01, -101.72], [32.01, -94.21], [32.01, -86.71], [32.01, -79.2],
  [26.5, -99.94], [26.5, -92.82], [26.5, -85.71], [26.5, -78.6],
];

/** adsb.fi allows 1 request per second. Stay a little under it. */
const REQUEST_SPACING_MS = 1_100;
/** A finished sweep is reused for this long before another one starts. */
const SNAPSHOT_TTL_MS = 60_000;
/** Give up on a sweep that runs longer than this. */
const SWEEP_BUDGET_MS = 75_000;
/** Below this share of regions the picture is too patchy to show. */
const MIN_REGION_SHARE = 0.6;
/**
 * ASSUMPTION: positions are projected forward to the end of the sweep at
 * constant velocity, for at most this many seconds. Teaching default.
 */
export const MAX_PROJECTION_SEC = 90;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Sighting {
  aircraft: Aircraft;
  /** When this position was true, unix seconds. */
  positionUnix: number;
}

async function fetchTile(lat: number, lon: number): Promise<Sighting[]> {
  const res = await fetch(ADSB_FI.buildUrl(lat, lon, TILE_RADIUS_NM), {
    headers: { Accept: "application/json" },
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
  if (!res.ok) throw new FeedError(`responded with status ${res.status}`, res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new FeedError("the feed returned an unexpected body");
  }
  const { timeUnix, rows } = readsbRows(body);
  const feedNow = timeUnix ?? Math.floor(Date.now() / 1000);
  const sightings: Sighting[] = [];
  for (const row of rows) {
    const aircraft = mapReadsbAircraft(row, feedNow);
    // The national view shows airborne traffic only.
    if (!aircraft || aircraft.onGround) continue;
    const age = num((row as Record<string, unknown>).seen_pos) ?? 0;
    sightings.push({ aircraft, positionUnix: feedNow - age });
  }
  return sightings;
}

/** Move a sighting forward to `atUnix` at its reported speed, track, and climb. */
export function projectSighting(sighting: Sighting, atUnix: number): Aircraft {
  const { aircraft } = sighting;
  const dt = Math.min(MAX_PROJECTION_SEC, Math.max(0, atUnix - sighting.positionUnix));
  if (dt === 0) return aircraft;
  const ahead = projectAhead(aircraft, dt);
  if (!ahead) return aircraft;
  return {
    ...aircraft,
    latitude: ahead[0],
    longitude: ahead[1],
    altitudeFt:
      aircraft.altitudeFt !== null && aircraft.verticalRateFpm !== null
        ? aircraft.altitudeFt + (aircraft.verticalRateFpm * dt) / 60
        : aircraft.altitudeFt,
  };
}

export type NationalResult =
  | { ok: true; snapshot: NationalSnapshot }
  | { ok: false; error: string };

async function sweep(): Promise<NationalResult> {
  const startedMs = Date.now();
  // Circles overlap, so keep the freshest sighting of each aircraft.
  const freshest = new Map<string, Sighting>();
  let regionsOk = 0;
  let consecutiveFailures = 0;
  let lastReason = "";

  for (let i = 0; i < NATIONAL_TILES.length; i++) {
    if (Date.now() - startedMs > SWEEP_BUDGET_MS) {
      lastReason = "the sweep ran out of time";
      break;
    }
    const requestStartedMs = Date.now();
    const [lat, lon] = NATIONAL_TILES[i];
    try {
      for (const sighting of await fetchTile(lat, lon)) {
        const known = freshest.get(sighting.aircraft.icao24);
        if (!known || sighting.positionUnix > known.positionUnix) {
          freshest.set(sighting.aircraft.icao24, sighting);
        }
      }
      regionsOk++;
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures++;
      lastReason =
        error instanceof FeedError
          ? error.message
          : error instanceof Error && error.name === "TimeoutError"
            ? "did not respond in time"
            : "could not be reached";
      const status = error instanceof FeedError ? error.status : undefined;
      console.warn(
        `[national] region ${i + 1} of ${NATIONAL_TILES.length} failed${status ? ` (status ${status})` : ""}: ${lastReason}`,
      );
      // Three failures in a row means the feed is down or blocking us. Stop.
      if (consecutiveFailures >= 3) break;
      if (error instanceof FeedError && error.status === 429) {
        await sleep(Math.min(5_000, (error.retryAfterSec ?? 2) * 1000));
      }
    }
    const elapsed = Date.now() - requestStartedMs;
    if (i < NATIONAL_TILES.length - 1 && elapsed < REQUEST_SPACING_MS) {
      await sleep(REQUEST_SPACING_MS - elapsed);
    }
  }

  const regionsTotal = NATIONAL_TILES.length;
  if (regionsOk < regionsTotal * MIN_REGION_SHARE) {
    return {
      ok: false,
      error: `The live feed answered for only ${regionsOk} of ${regionsTotal} regions (adsb.fi ${lastReason || "failed"}).`,
    };
  }

  const generatedAtUnix = Math.floor(Date.now() / 1000);
  const rows = [...freshest.values()].map((sighting) =>
    encodeAircraft(projectSighting(sighting, generatedAtUnix)),
  );
  return {
    ok: true,
    snapshot: {
      source: "adsb.fi",
      generatedAtUnix,
      sweepSec: Math.round((Date.now() - startedMs) / 1000),
      regionsOk,
      regionsTotal,
      rows,
      ...(regionsOk < regionsTotal
        ? {
            warning: `${regionsTotal - regionsOk} of ${regionsTotal} regions did not answer, so part of the map is missing traffic.`,
          }
        : {}),
    },
  };
}

// In-memory state for this server instance. No database.
let cached: { expiresAtMs: number; result: NationalResult } | null = null;
let inFlight: Promise<NationalResult> | null = null;

/**
 * The latest national snapshot. A finished sweep is reused for 60 seconds,
 * and callers that arrive during a sweep share it instead of starting
 * another. Never throws.
 */
export async function getNationalSnapshot(): Promise<NationalResult> {
  if (cached && Date.now() < cached.expiresAtMs) return cached.result;
  if (!inFlight) {
    inFlight = sweep()
      .catch((): NationalResult => ({ ok: false, error: "The national sweep failed." }))
      .then((result) => {
        // A failed sweep is retried sooner than a good one is refreshed.
        cached = {
          expiresAtMs: Date.now() + (result.ok ? SNAPSHOT_TTL_MS : 15_000),
          result,
        };
        inFlight = null;
        return result;
      });
  }
  return inFlight;
}
