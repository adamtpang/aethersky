import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAircraft, encodeAircraft } from "./wire";

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

type Reply = (tileIndex: number) => Response;

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

async function run<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

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

  it("asks once per region, spaced out, and merges the answers", async () => {
    const fetchMock = stubFeed((i) =>
      ok([{ hex: `ac${i}`, flight: `FLT${i}`, lat: 40, lon: -100 + i * 0.1, alt_baro: 30000, gs: 400, track: 90 }]),
    );
    const { getNationalSnapshot, NATIONAL_TILES } = await load();
    const result = await run(getNationalSnapshot());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchMock).toHaveBeenCalledTimes(NATIONAL_TILES.length);
    expect(result.snapshot.source).toBe("adsb.fi");
    expect(result.snapshot.regionsOk).toBe(NATIONAL_TILES.length);
    expect(result.snapshot.regionsTotal).toBe(NATIONAL_TILES.length);
    expect(result.snapshot.warning).toBeUndefined();
    expect(result.snapshot.rows).toHaveLength(NATIONAL_TILES.length);
    // 29 gaps of 1.1 s between 30 requests.
    expect(result.snapshot.sweepSec).toBeGreaterThanOrEqual(31);
    expect(String(fetchMock.mock.calls[0][0])).toContain("opendata.adsb.fi/api/v3/lat/");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/dist\/250$/);
  });

  it("keeps the freshest sighting of an aircraft seen in two regions and drops ground traffic", async () => {
    stubFeed((i) => {
      if (i === 0) {
        return ok([
          { hex: "dup", flight: "OLD", lat: 40, lon: -100, alt_baro: 30000, seen_pos: 20 },
          { hex: "gnd", flight: "TAXI", lat: 40, lon: -101, alt_baro: "ground", gs: 10, track: 90 },
        ]);
      }
      if (i === 1) return ok([{ hex: "dup", flight: "NEW", lat: 41, lon: -100, alt_baro: 31000, seen_pos: 1 }]);
      return ok([]);
    });
    const { getNationalSnapshot } = await load();
    const result = await run(getNationalSnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const aircraft = result.snapshot.rows.map(decodeAircraft);
    expect(aircraft.map((a) => a.icao24)).toEqual(["dup"]);
    expect(aircraft[0].callsign).toBe("NEW");
    expect(aircraft[0].altitudeFt).toBe(31000);
  });

  it("reuses a finished sweep and shares one sweep between simultaneous callers", async () => {
    const fetchMock = stubFeed(() => ok([]));
    const { getNationalSnapshot, NATIONAL_TILES } = await load();
    const first = getNationalSnapshot();
    const second = getNationalSnapshot();
    await vi.runAllTimersAsync();
    expect((await first).ok).toBe(true);
    expect(await second).toBe(await first);
    await getNationalSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(NATIONAL_TILES.length);
  });

  it("warns when a few regions fail and still returns the rest", async () => {
    stubFeed((i) => (i % 10 === 4 ? new Response("", { status: 500 }) : ok([])));
    const { getNationalSnapshot, NATIONAL_TILES } = await load();
    const result = await run(getNationalSnapshot());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.regionsOk).toBe(NATIONAL_TILES.length - 3);
    expect(result.snapshot.warning).toMatch(/3 of 30 regions did not answer/);
  });

  it("stops early and returns a failure when the feed is down", async () => {
    const fetchMock = stubFeed(() => new Response("", { status: 503 }));
    const { getNationalSnapshot } = await load();
    const result = await run(getNationalSnapshot());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/0 of 30 regions/);
    // Three failures in a row end the sweep. No hammering.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(/rows|mock/i);
  });
});

describe("projection and wire format", () => {
  it("moves a sighting forward along its track and climb, with a cap", async () => {
    const { projectSighting, MAX_PROJECTION_SEC } = await load();
    const aircraft = decodeAircraft(["abc", "ABC", 40, -100, 10000, 360, 90, 1200, 1_700_000_000]);
    const moved = projectSighting({ aircraft, positionUnix: 1_700_000_000 }, 1_700_000_060);
    // 360 kt for 60 s is 6 NM east, and 1200 fpm for 60 s is 1200 ft up.
    expect(moved.latitude).toBeCloseTo(40, 3);
    expect((moved.longitude + 100) * 60 * Math.cos((40 * Math.PI) / 180)).toBeCloseTo(6, 1);
    expect(moved.altitudeFt).toBeCloseTo(11200, 6);

    const capped = projectSighting({ aircraft, positionUnix: 1_700_000_000 }, 1_700_009_999);
    const atCap = projectSighting(
      { aircraft, positionUnix: 1_700_000_000 },
      1_700_000_000 + MAX_PROJECTION_SEC,
    );
    expect(capped.longitude).toBeCloseTo(atCap.longitude, 9);

    const still = projectSighting({ aircraft, positionUnix: 1_700_000_000 }, 1_699_999_000);
    expect(still).toBe(aircraft);
  });

  it("round-trips an aircraft through the compact wire row", () => {
    const row = encodeAircraft({
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
    });
    expect(row).toEqual(["abc123", "TEST1", 39.1235, -104.9877, 10000, 300, 90, -640, 1_700_000_000]);
    expect(decodeAircraft(row)).toMatchObject({
      icao24: "abc123",
      altitudeFt: 10000,
      groundSpeedKt: 300,
      onGround: false,
    });
  });
});
