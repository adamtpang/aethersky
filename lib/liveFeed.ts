import { MAX_BBOX_AREA_SQ_DEG, bboxAreaSqDeg, bboxKey } from "./bbox";
import { FeedError, type LiveStates } from "./feedError";
import { fetchOpenSky } from "./opensky";
import { ADSB_FI, ADSB_LOL, fetchReadsb } from "./readsb";
import type { AircraftFeed, BoundingBox, FeedSource } from "./types";

/**
 * Real traffic only. Each request tries the live feeds in order and returns
 * the first one that answers. There is no mock or simulated fallback: when
 * every feed fails, the caller gets an explicit failure and shows no aircraft.
 */

const CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 50;
/** Wait this long before retrying a feed that just failed. */
const FAILURE_COOLDOWN_MS = 20_000;
const DEFAULT_RETRY_AFTER_SEC = 60;

interface Provider {
  source: FeedSource;
  /** Minimum gap between requests to this feed, per its published limit. */
  minIntervalMs: number;
  fetch: (bbox: BoundingBox) => Promise<LiveStates>;
}

// Order matters. adsb.fi has no daily cap (1 request per second). adsb.lol
// allows 500 requests per day without a key. OpenSky is last because it
// often does not answer cloud hosts.
const PROVIDERS: Provider[] = [
  { source: "adsb.fi", minIntervalMs: 1_100, fetch: (bbox) => fetchReadsb(ADSB_FI, bbox) },
  { source: "adsb.lol", minIntervalMs: 0, fetch: (bbox) => fetchReadsb(ADSB_LOL, bbox) },
  { source: "opensky", minIntervalMs: 0, fetch: (bbox) => fetchOpenSky(bbox) },
];

export interface FeedAttempt {
  source: FeedSource;
  reason: string;
}

export type LiveFeedResult =
  | { ok: true; feed: AircraftFeed }
  | { ok: false; error: string; tried: FeedAttempt[] };

// In-memory state for this server instance. No database.
const cache = new Map<string, { expiresAtMs: number; feed: AircraftFeed }>();
const state = new Map<FeedSource, { blockedUntilMs: number; lastCallMs: number }>();

const stateOf = (source: FeedSource) => {
  let entry = state.get(source);
  if (!entry) {
    entry = { blockedUntilMs: 0, lastCallMs: 0 };
    state.set(source, entry);
  }
  return entry;
};

function describeFailure(error: unknown): string {
  if (error instanceof FeedError) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") {
    return "did not respond in time";
  }
  return "could not be reached";
}

/** Live aircraft for a bounding box, cached for 10 seconds per box. Never throws. */
export async function getLiveFeed(bbox: BoundingBox): Promise<LiveFeedResult> {
  const startMs = Date.now();

  if (bboxAreaSqDeg(bbox) > MAX_BBOX_AREA_SQ_DEG) {
    return {
      ok: false,
      error: "The requested area is too large for the live feed. Zoom in.",
      tried: [],
    };
  }

  const key = bboxKey(bbox);
  const cached = cache.get(key);
  if (cached && startMs < cached.expiresAtMs) {
    return { ok: true, feed: cached.feed };
  }

  const tried: FeedAttempt[] = [];
  for (const provider of PROVIDERS) {
    const entry = stateOf(provider.source);
    const nowMs = Date.now();
    if (nowMs < entry.blockedUntilMs) {
      tried.push({ source: provider.source, reason: "is cooling off after a failure" });
      continue;
    }
    if (nowMs - entry.lastCallMs < provider.minIntervalMs) {
      tried.push({ source: provider.source, reason: "was asked too recently" });
      continue;
    }
    entry.lastCallMs = nowMs;
    try {
      const data = await provider.fetch(bbox);
      const feed: AircraftFeed = {
        source: provider.source,
        fetchedAtUnix: Math.floor(Date.now() / 1000),
        timeUnix: data.timeUnix,
        aircraft: data.aircraft,
        ...(tried.length > 0
          ? {
              warning: `${tried
                .map((t) => `${t.source} ${t.reason}`)
                .join(", ")}. Showing ${provider.source} instead.`,
            }
          : {}),
      };
      if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
      cache.set(key, { expiresAtMs: Date.now() + CACHE_TTL_MS, feed });
      return { ok: true, feed };
    } catch (error) {
      const retryMs =
        error instanceof FeedError && error.status === 429
          ? (error.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC) * 1000
          : FAILURE_COOLDOWN_MS;
      entry.blockedUntilMs = Date.now() + retryMs;
      const reason = describeFailure(error);
      tried.push({ source: provider.source, reason });
      const status = error instanceof FeedError ? error.status : undefined;
      console.warn(
        `[feed] ${provider.source} failed${status ? ` (status ${status})` : ""}: ${reason}`,
      );
    }
  }

  return {
    ok: false,
    error: `No live feed answered (${tried
      .map((t) => `${t.source} ${t.reason}`)
      .join(", ")}).`,
    tried,
  };
}
