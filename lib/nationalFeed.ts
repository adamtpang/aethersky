import { FeedError, REQUEST_TIMEOUT_MS, finiteOrNull as num } from "./feedError";
import { ADSB_FI, mapReadsbAircraft, readsbRows } from "./readsb";
import { encodeSighting, type SweepEvent, type WireRow } from "./wire";

/**
 * Whole-country live traffic. No feed answers a single request for the
 * contiguous United States, so the server sweeps it: 30 overlapping circles
 * of 250 NM from adsb.fi, one request per circle, spaced to respect the
 * feed's limit of 1 request per second. One sweep takes about 35 seconds
 * and is shared by every visitor. Each region is published as soon as it
 * arrives, so a page can draw it without waiting for the rest.
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

/**
 * The order regions are fetched in: the busiest airspace first, so the
 * first aircraft a visitor sees are where most of the traffic is.
 */
const SWEEP_ORDER: ReadonlyArray<number> = [
  19, 12, 18, 25, 11, 17, 24, 13, 20, 10, 16, 23, 29, 28, 4, 9, 15, 22, 27, 14,
  21, 6, 7, 8, 3, 26, 1, 2, 0, 5,
];

/** adsb.fi allows 1 request per second. Stay a little under it. */
const REQUEST_SPACING_MS = 1_100;
/**
 * A finished sweep is reused for this long before another one starts. Kept
 * short so that positions are never much older than the page can project.
 */
const SWEEP_TTL_MS = 30_000;
/** A failed sweep is retried sooner than a good one is refreshed. */
const FAILED_TTL_MS = 15_000;
/** Give up on a sweep that runs longer than this. */
const SWEEP_BUDGET_MS = 75_000;
/** Below this share of regions the picture is too patchy to show. */
const MIN_REGION_SHARE = 0.6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Sighting {
  row: WireRow;
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
  for (const raw of rows) {
    const aircraft = mapReadsbAircraft(raw, feedNow);
    // The national view shows airborne traffic only.
    if (!aircraft || aircraft.onGround) continue;
    const age = num((raw as Record<string, unknown>).seen_pos) ?? 0;
    const positionUnix = feedNow - age;
    sightings.push({ row: encodeSighting(aircraft, positionUnix), positionUnix });
  }
  return sightings;
}

/**
 * One sweep in progress or finished. Events are kept so that a caller who
 * arrives late gets everything published so far, then follows along.
 */
export class Sweep {
  readonly events: SweepEvent[] = [];
  readonly startedAtMs = Date.now();
  finishedAtMs: number | null = null;
  failed = false;
  private listeners = new Set<(event: SweepEvent) => void>();
  readonly done: Promise<void>;

  constructor() {
    this.done = this.run().catch(() => {
      this.publish({
        t: "end",
        finishedAtUnix: Math.floor(Date.now() / 1000),
        sweepSec: Math.round((Date.now() - this.startedAtMs) / 1000),
        regionsOk: 0,
        regionsTotal: NATIONAL_TILES.length,
        error: "The national sweep failed.",
      });
    });
  }

  /** Replays everything so far, then calls back for each new event. */
  subscribe(listener: (event: SweepEvent) => void): () => void {
    for (const event of this.events) listener(event);
    if (this.finishedAtMs !== null) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(event: SweepEvent) {
    this.events.push(event);
    if (event.t === "end") {
      this.finishedAtMs = Date.now();
      this.failed = event.error !== undefined;
    }
    for (const listener of this.listeners) listener(event);
    if (event.t === "end") this.listeners.clear();
  }

  private async run() {
    const regionsTotal = NATIONAL_TILES.length;
    this.publish({
      t: "start",
      source: "adsb.fi",
      startedAtUnix: Math.floor(this.startedAtMs / 1000),
      regionsTotal,
    });

    // Circles overlap, so only publish a sighting fresher than the last one sent.
    const sent = new Map<string, number>();
    let regionsOk = 0;
    let done = 0;
    let consecutiveFailures = 0;
    let lastReason = "";

    for (let step = 0; step < SWEEP_ORDER.length; step++) {
      if (Date.now() - this.startedAtMs > SWEEP_BUDGET_MS) {
        lastReason = "the sweep ran out of time";
        break;
      }
      const requestStartedMs = Date.now();
      const [lat, lon] = NATIONAL_TILES[SWEEP_ORDER[step]];
      try {
        const rows: WireRow[] = [];
        for (const sighting of await fetchTile(lat, lon)) {
          const id = sighting.row[0];
          const known = sent.get(id);
          if (known === undefined || sighting.positionUnix > known + 0.5) {
            sent.set(id, sighting.positionUnix);
            rows.push(sighting.row);
          }
        }
        regionsOk++;
        consecutiveFailures = 0;
        this.publish({ t: "region", done: ++done, ok: true, rows });
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
          `[national] region ${step + 1} of ${regionsTotal} failed${status ? ` (status ${status})` : ""}: ${lastReason}`,
        );
        this.publish({ t: "region", done: ++done, ok: false, rows: [] });
        // Three failures in a row means the feed is down or blocking us. Stop.
        if (consecutiveFailures >= 3) break;
        if (error instanceof FeedError && error.status === 429) {
          await sleep(Math.min(5_000, (error.retryAfterSec ?? 2) * 1000));
        }
      }
      const elapsed = Date.now() - requestStartedMs;
      if (step < SWEEP_ORDER.length - 1 && elapsed < REQUEST_SPACING_MS) {
        await sleep(REQUEST_SPACING_MS - elapsed);
      }
    }

    const tooFew = regionsOk < regionsTotal * MIN_REGION_SHARE;
    this.publish({
      t: "end",
      finishedAtUnix: Math.floor(Date.now() / 1000),
      sweepSec: Math.round((Date.now() - this.startedAtMs) / 1000),
      regionsOk,
      regionsTotal,
      ...(tooFew
        ? {
            error: `The live feed answered for only ${regionsOk} of ${regionsTotal} regions (adsb.fi ${lastReason || "failed"}).`,
          }
        : regionsOk < regionsTotal
          ? {
              warning: `${regionsTotal - regionsOk} of ${regionsTotal} regions did not answer, so part of the map is missing traffic.`,
            }
          : {}),
    });
  }
}

// In-memory state for this server instance. No database.
let current: Sweep | null = null;

/**
 * The sweep to read from: the one in progress, or a recent finished one, or
 * a new one. Callers that arrive during a sweep share it.
 */
export function getNationalSweep(): Sweep {
  if (current) {
    if (current.finishedAtMs === null) return current;
    const ttl = current.failed ? FAILED_TTL_MS : SWEEP_TTL_MS;
    if (Date.now() - current.finishedAtMs < ttl) return current;
  }
  current = new Sweep();
  return current;
}

/** The sweep as a stream of JSON lines, one event per line. */
export function nationalStream(sweep: Sweep = getNationalSweep()): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const clock: SweepEvent = { t: "clock", nowUnix: Date.now() / 1000 };
      controller.enqueue(encoder.encode(`${JSON.stringify(clock)}\n`));
      unsubscribe = sweep.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          if (event.t === "end") controller.close();
        } catch {
          // The reader went away. Nothing to do.
        }
      });
    },
    cancel() {
      unsubscribe();
    },
  });
}
