import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_THRESHOLDS, type Aircraft } from "../types";
import { detectConflicts, pairKey } from "./detect";
import { fromEnu } from "./enu";
import { REGION_SIZE_DEG, detectConflictsRegional, reachNm } from "./regional";
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
    // Region edges fall on multiples of REGION_SIZE_DEG. These two sit 2.4 NM
    // apart on either side of the 40 degree line, flying the same way.
    expect(40 % REGION_SIZE_DEG).toBe(0);
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
    expect(reachNm(wide, field)).toBeGreaterThan(80);
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
});
