import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_THRESHOLDS, type Aircraft } from "../types";
import { detectConflicts, pairKey } from "./detect";
import { fromEnu } from "./enu";
import { FAST_AIRCRAFT_KT, detectConflictsRegional, reachNm } from "./regional";
import { buildSceneAircraft } from "./scene.fixture";

const T = DEMO_DEFAULT_THRESHOLDS;

const ac = (
  id: string,
  latitude: number,
  longitude: number,
  overrides: Partial<Aircraft> = {},
): Aircraft => ({
  icao24: id,
  callsign: id.toUpperCase(),
  latitude,
  longitude,
  altitudeFt: 30000,
  geoAltitudeFt: 30000,
  groundSpeedKt: 420,
  headingDeg: 90,
  verticalRateFpm: 0,
  onGround: false,
  lastContactUnix: 1_700_000_000,
  ...overrides,
});

// Two aircraft on opposite coasts, so the field always spans many regions.
const COASTS = [ac("west", 37.6, -122.4), ac("east", 40.6, -73.8)];

const keys = (pairs: { a: string; b: string }[]) => pairs.map(pairKey).sort();

describe("country-wide conflict check", () => {
  it("does not flag aircraft that are a continent apart", () => {
    expect(detectConflictsRegional(COASTS, T)).toEqual([]);
  });

  it("finds a pair that straddles a region boundary, exactly once", () => {
    // Sweep a close pair across a band of latitudes, so that whatever the
    // cell size is, some copy of the pair straddles a cell edge.
    for (let k = 0; k < 40; k++) {
      const base = 39 + k * 0.05;
      const swept = detectConflictsRegional(
        [...COASTS, ac("n", base + 0.02, -100 - k * 0.07), ac("s", base - 0.02, -100 - k * 0.07)],
        T,
      );
      expect(keys(swept)).toEqual(["n|s"]);
    }
    const result = detectConflictsRegional(
      [...COASTS, ac("n", 40.02, -100), ac("s", 39.98, -100)],
      T,
    );
    expect(keys(result)).toEqual(["n|s"]);
    expect(result[0].tcpaSec).toBe(0);
    expect(result[0].dcpaNm).toBeGreaterThan(2.3);
    expect(result[0].dcpaNm).toBeLessThan(2.5);
  });

  it("finds a pair that straddles a corner where four regions meet", () => {
    const result = detectConflictsRegional(
      [...COASTS, ac("ne", 40.01, -99.99), ac("sw", 39.99, -100.01)],
      T,
    );
    expect(keys(result)).toEqual(["ne|sw"]);
  });

  it("agrees with the single-plane engine on the scripted scene", () => {
    const scene = buildSceneAircraft();
    const local = detectConflicts(scene, T);
    const regional = detectConflictsRegional([...scene, ...COASTS], T);
    expect(keys(regional)).toEqual(keys(local));
    for (const pair of regional) {
      const twin = local.find((p) => pairKey(p) === pairKey(pair))!;
      expect(pair.tcpaSec).toBeCloseTo(twin.tcpaSec, 0);
      expect(Math.abs(pair.dcpaNm - twin.dcpaNm)).toBeLessThan(0.15);
    }
  });

  it("keeps a fast head-on pair that starts far apart with a long lookahead", () => {
    // 500 kt each, 80 NM apart: closest approach at 288 s.
    const origin = { latitude: 41, longitude: -95.99 };
    const half = 40 * 1852;
    const west = fromEnu(-half, 0, origin);
    const east = fromEnu(half, 0, origin);
    const wide = { ...T, lookaheadSec: 300 };
    const field = [
      ...COASTS,
      ac("w", west.latitude, west.longitude, { groundSpeedKt: 500, headingDeg: 90 }),
      ac("e", east.latitude, east.longitude, { groundSpeedKt: 500, headingDeg: 270 }),
    ];
    expect(reachNm(wide, 500)).toBeGreaterThan(80);
    const result = detectConflictsRegional(field, wide);
    expect(keys(result)).toEqual(["e|w"]);
    expect(result[0].tcpaSec).toBeGreaterThan(280);
    expect(result[0].tcpaSec).toBeLessThan(296);
    // The same pair is outside the default 120 s window.
    expect(detectConflictsRegional(field, T)).toEqual([]);
  });

  it("matches the single-plane engine pair for pair on a dense local field", () => {
    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const field: Aircraft[] = [];
    for (let i = 0; i < 150; i++) {
      field.push(
        ac(`d${String(i).padStart(3, "0")}`, 39 + rand() * 1.6, -105 + rand() * 1.6, {
          altitudeFt: 5000 + Math.floor(rand() * 10) * 1000,
          headingDeg: rand() * 360,
          groundSpeedKt: 120 + rand() * 380,
          verticalRateFpm: Math.round((rand() - 0.5) * 3000),
        }),
      );
    }
    const local = detectConflicts(field, T);
    const regional = detectConflictsRegional([...field, ...COASTS], T);
    expect(local.length).toBeGreaterThan(5);
    // The two use different plane origins, so a pair sitting right on a
    // threshold can differ. Allow a small number of edge cases.
    const a = new Set(keys(local));
    const b = new Set(keys(regional));
    const differing = [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length;
    expect(differing).toBeLessThanOrEqual(Math.ceil(local.length * 0.03));
  });

  it("does not lose a pair when one aircraft is implausibly fast", () => {
    // 2000 kt and 60 NM apart head-on with a slow aircraft: closest approach
    // in about 98 s. Handled outside the grid, so it must still be found.
    const origin = { latitude: 36, longitude: -90 };
    const half = 30 * 1852;
    const west = fromEnu(-half, 0, origin);
    const east = fromEnu(half, 0, origin);
    expect(2000).toBeGreaterThan(FAST_AIRCRAFT_KT);
    const field = [
      ...COASTS,
      ac("rocket", west.latitude, west.longitude, { groundSpeedKt: 2000, headingDeg: 90 }),
      ac("slow", east.latitude, east.longitude, { groundSpeedKt: 200, headingDeg: 270 }),
    ];
    const result = detectConflictsRegional(field, T);
    expect(keys(result)).toEqual(["rocket|slow"]);
    expect(result[0].tcpaSec).toBeGreaterThan(95);
    expect(result[0].tcpaSec).toBeLessThan(101);
  });

  it("checks six thousand aircraft quickly", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    // Half spread over the country, half packed around ten busy airports.
    const hubs = Array.from({ length: 10 }, () => [28 + rand() * 18, -120 + rand() * 45]);
    const field: Aircraft[] = [];
    for (let i = 0; i < 6000; i++) {
      const hub = hubs[i % 10];
      const packed = i % 2 === 0;
      field.push(
        ac(
          `p${String(i).padStart(4, "0")}`,
          packed ? hub[0] + (rand() - 0.5) * 1.5 : 25 + rand() * 24,
          packed ? hub[1] + (rand() - 0.5) * 1.5 : -124 + rand() * 57,
          {
            altitudeFt: 1000 + Math.floor(rand() * 39) * 1000,
            headingDeg: rand() * 360,
            groundSpeedKt: 90 + rand() * 430,
            verticalRateFpm: Math.round((rand() - 0.5) * 4000),
          },
        ),
      );
    }
    detectConflictsRegional(field, T);
    const startedAt = performance.now();
    const result = detectConflictsRegional(field, T);
    const ms = performance.now() - startedAt;
    expect(result.length).toBeGreaterThan(0);
    // Generous ceiling so slow machines pass. It runs in a few milliseconds.
    expect(ms).toBeLessThan(250);
    console.info(`regional check: 6000 aircraft, ${result.length} pairs, ${ms.toFixed(1)} ms`);
  });
});
