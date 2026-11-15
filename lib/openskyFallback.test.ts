import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoundingBox } from "./types";

// Live feed behavior with a stubbed network. No request leaves the machine.
// Each test loads a fresh copy of the module so its in-memory cache, token,
// and rate-limit state start clean.

const BBOX: BoundingBox = { lamin: 39, lomin: -105.5, lamax: 40.5, lomax: -104 };

const STATE_ROW = [
  "abc123", "TEST12", "Testland", 1, 2, -104.67, 39.86, 3048, false,
  154.3, 90, 0, null, 3048, null, false, 0,
];

const okResponse = () =>
  new Response(JSON.stringify({ time: 1_700_000_000, states: [STATE_ROW] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

async function loadModule() {
  vi.resetModules();
  return import("./opensky");
}

describe("live feed fallback", () => {
  beforeEach(() => {
    vi.stubEnv("OPENSKY_CLIENT_ID", "");
    vi.stubEnv("OPENSKY_CLIENT_SECRET", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns live aircraft and caches them per bounding box", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();

    const first = await getLiveFeed(BBOX);
    expect(first.source).toBe("opensky");
    expect(first.warning).toBeUndefined();
    expect(first.aircraft).toHaveLength(1);
    expect(first.timeUnix).toBe(1_700_000_000);

    const second = await getLiveFeed(BBOX);
    expect(second.source).toBe("opensky");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Anonymous by default: no Authorization header, no token request.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain("https://opensky-network.org/api/states/all");
    expect(String(url)).toContain("lamin=39");
    expect(init.headers).toBeUndefined();
  });

  it("falls back to mock on 429 and does not retry in a tight loop", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("", {
          status: 429,
          headers: { "X-Rate-Limit-Retry-After-Seconds": "120" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();

    const first = await getLiveFeed(BBOX);
    expect(first.source).toBe("mock");
    expect(first.warning).toMatch(/rate limit/i);
    expect(first.warning).toContain("120");
    expect(first.aircraft.length).toBeGreaterThan(0);

    // A second call inside the retry window must not hit the network again.
    const second = await getLiveFeed({ ...BBOX, lamax: 40.6 });
    expect(second.source).toBe("mock");
    expect(second.warning).toMatch(/rate limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 500, 503])("falls back to mock on status %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status })));
    const { getLiveFeed } = await loadModule();
    const feed = await getLiveFeed(BBOX);
    expect(feed.source).toBe("mock");
    expect(feed.warning).toContain(String(status));
  });

  it("falls back to mock on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const { getLiveFeed } = await loadModule();
    const feed = await getLiveFeed(BBOX);
    expect(feed.source).toBe("mock");
    expect(feed.warning).toMatch(/could not reach opensky/i);
  });

  it("falls back to mock on an unexpected body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const { getLiveFeed } = await loadModule();
    const feed = await getLiveFeed(BBOX);
    expect(feed.source).toBe("mock");
    expect(feed.warning).toMatch(/unexpected body/i);
  });

  it("refuses an oversized box without calling OpenSky", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();
    const feed = await getLiveFeed({ lamin: -60, lomin: -170, lamax: 60, lomax: 170 });
    expect(feed.source).toBe("mock");
    expect(feed.warning).toMatch(/too large/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a bearer token when both credentials are set, and never leaks them", async () => {
    vi.stubEnv("OPENSKY_CLIENT_ID", "test-client");
    vi.stubEnv("OPENSKY_CLIENT_SECRET", "test-secret-value");
    const fetchMock = vi.fn(async (input: URL | string) => {
      if (String(input).includes("openid-connect/token")) {
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 1800 }),
          { status: 200 },
        );
      }
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();

    const feed = await getLiveFeed(BBOX);
    expect(feed.source).toBe("opensky");
    expect(JSON.stringify(feed)).not.toContain("test-secret-value");
    expect(JSON.stringify(feed)).not.toContain("test-token");

    const statesCall = fetchMock.mock.calls.find(
      ([input]) => !String(input).includes("openid-connect/token"),
    ) as unknown as [URL, RequestInit];
    expect(statesCall[1].headers).toEqual({ Authorization: "Bearer test-token" });

    // The token is reused for a different box inside its lifetime.
    await getLiveFeed({ ...BBOX, lamax: 40.6 });
    const tokenCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("openid-connect/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("treats a single credential as anonymous and warns without the value", async () => {
    vi.stubEnv("OPENSKY_CLIENT_ID", "only-the-id");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getLiveFeed } = await loadModule();

    const feed = await getLiveFeed(BBOX);
    expect(feed.source).toBe("opensky");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("only-the-id");
  });
});
