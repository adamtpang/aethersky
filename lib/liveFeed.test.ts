import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "./types";

// Live feed chain with a stubbed network. No request leaves the machine.
// Each test loads a fresh copy of the module so its in-memory cache and
// cool-off state start clean.

const BBOX: BoundingBox = { lamin: 39, lomin: -105.5, lamax: 40.5, lomax: -104 };

const READSB_BODY = {
  now: 1_700_000_000_000,
  ac: [
    {
      hex: "ABC123", flight: "TEST12  ", lat: 39.86, lon: -104.67,
      alt_baro: 10000, alt_geom: 10250, gs: 300, track: 90, baro_rate: -640,
      seen: 1.2, seen_pos: 0.4,
    },
    // Outside the box: the feed answers with a circle, the box filters it.
    { hex: "ffffff", flight: "FAR1", lat: 45, lon: -100, alt_baro: 30000, gs: 400, track: 10, seen_pos: 1 },
  ],
};

const OPENSKY_ROW = [
  "def456", "SKY99", "Testland", 1, 2, -104.67, 39.86, 3048, false,
  154.3, 90, 0, null, 3048, null, false, 0,
];

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

type Handler = () => Response | Promise<Response>;

/** Route each stubbed request by host. Unlisted hosts fail like a dead network. */
function stubNetwork(handlers: { fi?: Handler; lol?: Handler; opensky?: Handler }) {
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    void init;
    const url = String(input);
    const handler = url.includes("opendata.adsb.fi")
      ? handlers.fi
      : url.includes("api.adsb.lol")
        ? handlers.lol
        : url.includes("opensky-network.org/api")
          ? handlers.opensky
          : undefined;
    if (!handler) throw new TypeError("fetch failed");
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof stubNetwork>, host: string) =>
  fetchMock.mock.calls.filter(([input]) => String(input).includes(host));

async function loadModule() {
  vi.resetModules();
  return import("./liveFeed");
}

describe("live feed chain", () => {
  beforeEach(() => {
    vi.stubEnv("OPENSKY_CLIENT_ID", "");
    vi.stubEnv("OPENSKY_CLIENT_SECRET", "");
    vi.stubEnv("ADSBLOL_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses adsb.fi first, filters to the box, and caches per box", async () => {
    const fetchMock = stubNetwork({ fi: () => jsonResponse(READSB_BODY) });
    const { getLiveFeed } = await loadModule();

    const first = await getLiveFeed(BBOX);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.feed.source).toBe("adsb.fi");
    expect(first.feed.warning).toBeUndefined();
    expect(first.feed.timeUnix).toBe(1_700_000_000);
    expect(first.feed.aircraft.map((a) => a.icao24)).toEqual(["abc123"]);

    const second = await getLiveFeed(BBOX);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/^https:\/\/opendata\.adsb\.fi\/api\/v3\/lat\/39\.7500\/lon\/-104\.7500\/dist\/\d+$/);
  });

  it("falls through to adsb.lol when adsb.fi fails, and says so", async () => {
    const fetchMock = stubNetwork({
      fi: () => new Response("", { status: 503 }),
      lol: () => jsonResponse(READSB_BODY),
    });
    const { getLiveFeed } = await loadModule();

    const result = await getLiveFeed(BBOX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.source).toBe("adsb.lol");
    expect(result.feed.warning).toContain("adsb.fi");
    expect(result.feed.warning).toContain("503");
    expect(result.feed.aircraft).toHaveLength(1);
    expect(callsTo(fetchMock, "api.adsb.lol")).toHaveLength(1);
  });

  it("falls through to OpenSky when both community feeds fail", async () => {
    stubNetwork({
      opensky: () => jsonResponse({ time: 1_700_000_000, states: [OPENSKY_ROW] }),
    });
    const { getLiveFeed } = await loadModule();

    const result = await getLiveFeed(BBOX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.source).toBe("opensky");
    expect(result.feed.aircraft.map((a) => a.icao24)).toEqual(["def456"]);
  });

  it("returns a failure and no aircraft when every feed fails", async () => {
    stubNetwork({
      fi: () => new Response("", { status: 500 }),
      lol: () => new Response("not json", { status: 200 }),
    });
    const { getLiveFeed } = await loadModule();

    const result = await getLiveFeed(BBOX);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.tried.map((t) => t.source)).toEqual(["adsb.fi", "adsb.lol", "opensky"]);
    expect(result.error).toMatch(/no live feed answered/i);
    // Real only: a failure never carries substitute aircraft.
    expect(JSON.stringify(result)).not.toMatch(/aircraft"|mock/i);
  });

  it("does not hammer a feed that just failed", async () => {
    const fetchMock = stubNetwork({
      fi: () => new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      lol: () => jsonResponse(READSB_BODY),
    });
    const { getLiveFeed } = await loadModule();

    await getLiveFeed(BBOX);
    const again = await getLiveFeed({ ...BBOX, lamax: 40.6 });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.feed.source).toBe("adsb.lol");
    expect(again.feed.warning).toMatch(/cooling off/);
    expect(callsTo(fetchMock, "opendata.adsb.fi")).toHaveLength(1);
    expect(callsTo(fetchMock, "api.adsb.lol")).toHaveLength(2);
  });

  it("respects the adsb.fi limit of one request per second", async () => {
    const fetchMock = stubNetwork({
      fi: () => jsonResponse(READSB_BODY),
      lol: () => jsonResponse(READSB_BODY),
    });
    const { getLiveFeed } = await loadModule();

    await getLiveFeed(BBOX);
    // A different box right away is not in the cache, and adsb.fi was just asked.
    const next = await getLiveFeed({ ...BBOX, lamax: 40.6 });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.feed.source).toBe("adsb.lol");
    expect(callsTo(fetchMock, "opendata.adsb.fi")).toHaveLength(1);
  });

  it("refuses an oversized box without calling any feed", async () => {
    const fetchMock = stubNetwork({ fi: () => jsonResponse(READSB_BODY) });
    const { getLiveFeed } = await loadModule();
    const result = await getLiveFeed({ lamin: -60, lomin: -170, lamax: 60, lomax: 170 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the adsb.lol key only as a header and never returns it", async () => {
    vi.stubEnv("ADSBLOL_API_KEY", "test-lol-key");
    const fetchMock = stubNetwork({
      fi: () => new Response("", { status: 500 }),
      lol: () => jsonResponse(READSB_BODY),
    });
    const { getLiveFeed } = await loadModule();

    const result = await getLiveFeed(BBOX);
    expect(JSON.stringify(result)).not.toContain("test-lol-key");
    const [url, init] = callsTo(fetchMock, "api.adsb.lol")[0] as unknown as [string, RequestInit];
    expect(String(url)).not.toContain("test-lol-key");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-lol-key");
  });

  it("uses an OpenSky bearer token when both credentials are set, and never leaks them", async () => {
    vi.stubEnv("OPENSKY_CLIENT_ID", "test-client");
    vi.stubEnv("OPENSKY_CLIENT_SECRET", "test-secret-value");
    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("openid-connect/token")) {
        return jsonResponse({ access_token: "test-token", expires_in: 1800 });
      }
      if (url.includes("opensky-network.org/api")) {
        return jsonResponse({ time: 1_700_000_000, states: [OPENSKY_ROW] });
      }
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();

    const result = await getLiveFeed(BBOX);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("test-secret-value");
    expect(JSON.stringify(result)).not.toContain("test-token");

    const statesCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("opensky-network.org/api"),
    ) as unknown as [URL, RequestInit];
    expect(statesCall[1].headers).toEqual({ Authorization: "Bearer test-token" });
  });
});
