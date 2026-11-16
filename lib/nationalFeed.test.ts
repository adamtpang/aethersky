import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_POSITION_AGE_SEC, projectRow } from "./projection";
import { decodeSighting, encodeSighting, type SweepEvent, type WireRow } from "./wire";

// National sweep with a stubbed network and fake timers. No request leaves
// the machine and the 1.1 second spacing does not slow the tests down.

const NOW_MS = 1_700_000_000_000;

interface Row {
  hex: string;
  flight?: string;
  lat: number;
  lon: number;
  alt_baro: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  seen_pos?: number;
}

type Reply = (call: number) => Response;

function stubFeed(reply: Reply) {
  let call = 0;
  const fetchMock = vi.fn(async (input: URL | string) => {
    void input;
    return reply(call++);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ok = (rows: Row[]) =>
  new Response(JSON.stringify({ now: Date.now(), ac: rows }), { status: 200 });

async function load() {
  vi.resetModules();
  return import("./nationalFeed");
}

const regions = (events: SweepEvent[]) =>
  events.filter((e): e is Extract<SweepEvent, { t: "region" }> => e.t === "region");
const end = (events: SweepEvent[]) =>
  events.find((e): e is Extract<SweepEvent, { t: "end" }> => e.t === "end")!;
const allRows = (events: SweepEvent[]): WireRow[] => regions(events).flatMap((r) => r.rows);

describe("national sweep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks once per region, spaced out, and publishes each region as it arrives", async () => {
    const fetchMock = stubFeed((i) =>
      ok([{ hex: `ac${i}`, flight: `FLT${i}`, lat: 40, lon: -100 + i * 0.1, alt_baro: 30000, gs: 400, track: 90 }]),
    );
    const { getNationalSweep, NATIONAL_TILES } = await load();
    const sweep = getNationalSweep();

    // The first region is published long before the sweep is over.
    await vi.advanceTimersByTimeAsync(50);
    expect(sweep.events[0]).toMatchObject({ t: "start", source: "adsb.fi", regionsTotal: 30 });
    expect(regions(sweep.events)).toHaveLength(1);
    expect(sweep.finishedAtMs).toBeNull();

    await vi.runAllTimersAsync();
    await sweep.done;
    expect(fetchMock).toHaveBeenCalledTimes(NATIONAL_TILES.length);
    expect(regions(sweep.events)).toHaveLength(NATIONAL_TILES.length);
    expect(regions(sweep.events).map((r) => r.done)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(allRows(sweep.events)).toHaveLength(NATIONAL_TILES.length);
    const last = end(sweep.events);
    expect(last.regionsOk).toBe(30);
    expect(last.warning).toBeUndefined();
    expect(last.error).toBeUndefined();
    // 29 gaps of 1.1 s between 30 requests.
    expect(last.sweepSec).toBeGreaterThanOrEqual(31);
    expect(String(fetchMock.mock.calls[0][0])).toContain("opendata.adsb.fi/api/v3/lat/");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/dist\/250$/);
  });

  it("visits every region exactly once", async () => {
    const fetchMock = stubFeed(() => ok([]));
    const { getNationalSweep, NATIONAL_TILES } = await load();
    const sweep = getNationalSweep();
    await vi.runAllTimersAsync();
    await sweep.done;
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(new Set(urls).size).toBe(NATIONAL_TILES.length);
  });

  it("only republishes an aircraft when a fresher sighting arrives, and drops ground traffic", async () => {
    stubFeed((i) => {
      if (i === 0) {
        return ok([
          { hex: "dup", flight: "FIRST", lat: 40, lon: -100, alt_baro: 30000, seen_pos: 20 },
          { hex: "gnd", flight: "TAXI", lat: 40, lon: -101, alt_baro: "ground", gs: 10, track: 90 },
        ]);
      }
      // Fresher: published again. Staler than what was sent: skipped.
      if (i === 1) return ok([{ hex: "dup", flight: "FRESH", lat: 41, lon: -100, alt_baro: 31000, seen_pos: 1 }]);
      if (i === 2) return ok([{ hex: "dup", flight: "STALE", lat: 42, lon: -100, alt_baro: 32000, seen_pos: 50 }]);
      return ok([]);
    });
    const { getNationalSweep } = await load();
    const sweep = getNationalSweep();
    await vi.runAllTimersAsync();
    await sweep.done;
    expect(allRows(sweep.events).map((r) => r[1])).toEqual(["FIRST", "FRESH"]);
  });

  it("reuses a finished sweep, shares one in progress, and replays for late callers", async () => {
    const fetchMock = stubFeed(() => ok([]));
    const { getNationalSweep, nationalStream, NATIONAL_TILES } = await load();
    const first = getNationalSweep();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getNationalSweep()).toBe(first);

    // A caller who arrives mid-sweep gets what was already published.
    const seen: SweepEvent[] = [];
    first.subscribe((event) => seen.push(event));
    expect(seen.length).toBeGreaterThan(2);

    await vi.runAllTimersAsync();
    await first.done;
    expect(seen).toEqual(first.events);
    expect(getNationalSweep()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(NATIONAL_TILES.length);

    // The stream is the same events, one JSON object per line.
    const text = await new Response(nationalStream(first)).text();
    const lines = text.trim().split("\n").map((line) => JSON.parse(line) as SweepEvent);
    // The first line is the server clock, so a page can tell how old a
    // cached copy is. The rest are the sweep's events, in order.
    expect(lines[0]).toMatchObject({ t: "clock" });
    expect(lines.slice(1)).toEqual(first.events);

    // After half a minute a new sweep starts.
    vi.setSystemTime(Date.now() + 31_000);
    expect(getNationalSweep()).not.toBe(first);
  });

  it("warns when a few regions fail and still returns the rest", async () => {
    stubFeed((i) => (i % 10 === 4 ? new Response("", { status: 500 }) : ok([])));
    const { getNationalSweep } = await load();
    const sweep = getNationalSweep();
    await vi.runAllTimersAsync();
    await sweep.done;
    const last = end(sweep.events);
    expect(last.regionsOk).toBe(27);
    expect(last.error).toBeUndefined();
    expect(last.warning).toMatch(/3 of 30 regions did not answer/);
    expect(regions(sweep.events).filter((r) => !r.ok)).toHaveLength(3);
  });

  it("stops early and ends with an error when the feed is down", async () => {
    const fetchMock = stubFeed(() => new Response("", { status: 503 }));
    const { getNationalSweep } = await load();
    const sweep = getNationalSweep();
    await vi.runAllTimersAsync();
    await sweep.done;
    const last = end(sweep.events);
    expect(last.error).toMatch(/0 of 30 regions/);
    expect(sweep.failed).toBe(true);
    // Three failures in a row end the sweep. No hammering.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(allRows(sweep.events)).toEqual([]);
    // A failed sweep is retried after 15 seconds, not a minute.
    vi.setSystemTime(Date.now() + 16_000);
    expect(getNationalSweep()).not.toBe(sweep);
  });
});

describe("projection and wire format", () => {
  const row: WireRow = ["abc", "ABC", 40, -100, 10000, 360, 90, 1200, 1_700_000_000];

  it("moves a sighting forward along its track and climb", () => {
    const moved = projectRow(row, 1_700_000_060)!;
    // 360 kt for 60 s is 6 NM east, and 1200 fpm for 60 s is 1200 ft up.
    expect(moved.latitude).toBeCloseTo(40, 3);
    expect((moved.longitude + 100) * 60 * Math.cos((40 * Math.PI) / 180)).toBeCloseTo(6, 1);
    expect(moved.altitudeFt).toBeCloseTo(11200, 6);
    // The stored sighting is not changed.
    expect(row[3]).toBe(-100);
  });

  it("leaves a sighting alone when it is not in the past", () => {
    const same = projectRow(row, 1_699_999_000)!;
    expect(same.latitude).toBe(40);
    expect(same.longitude).toBe(-100);
  });

  it("drops a sighting that is too old to project honestly", () => {
    expect(projectRow(row, 1_700_000_000 + MAX_POSITION_AGE_SEC)).not.toBeNull();
    expect(projectRow(row, 1_700_000_000 + MAX_POSITION_AGE_SEC + 1)).toBeNull();
  });

  it("keeps an aircraft with no track in place", () => {
    const still = projectRow(["x", "X", 40, -100, 5000, null, null, null, 1_700_000_000], 1_700_000_060)!;
    expect(still.latitude).toBe(40);
    expect(still.longitude).toBe(-100);
    expect(still.altitudeFt).toBe(5000);
  });

  it("round-trips an aircraft through the compact wire row", () => {
    const encoded = encodeSighting(
      {
        icao24: "abc123",
        callsign: "TEST1",
        latitude: 39.123456,
        longitude: -104.987654,
        altitudeFt: 10000.4,
        geoAltitudeFt: 10100,
        groundSpeedKt: 299.6,
        headingDeg: 89.5,
        verticalRateFpm: -640.2,
        onGround: false,
        lastContactUnix: 1_700_000_000,
      },
      1_700_000_000.26,
    );
    expect(encoded).toEqual(["abc123", "TEST1", 39.1235, -104.9877, 10000, 300, 90, -640, 1_700_000_000.3]);
    expect(decodeSighting(encoded)).toMatchObject({
      icao24: "abc123",
      altitudeFt: 10000,
      groundSpeedKt: 300,
      onGround: false,
    });
  });
});
