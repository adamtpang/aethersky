import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_THRESHOLDS, type Aircraft } from "../types";
import { ktToMps, mpsToKt } from "../units";
import { detectConflicts, toTrack } from "./detect";
import { fromEnu, type GeoOrigin } from "./enu";
import { cellIndex, gridCellSizeM, gridSearchRadius } from "./grid";

// Fixtures F1 through F8 from docs/tech-spec.md section 10. Thresholds are
// the demo defaults (5 NM, 1000 ft, 120 s) unless a case says otherwise.
// Do not weaken a fixture to match a buggy implementation.

const ORIGIN: GeoOrigin = { latitude: 39.86, longitude: -104.67 };
const T = DEMO_DEFAULT_THRESHOLDS;
const FIVE_NM_M = 9260;

interface Spec {
  id: string;
  east: number;
  north: number;
  altitudeFt?: number | null;
  headingDeg?: number | null;
  groundSpeedKt?: number | null;
  verticalRateFpm?: number | null;
  onGround?: boolean;
}

function ac(spec: Spec): Aircraft {
  const { latitude, longitude } = fromEnu(spec.east, spec.north, ORIGIN);
  const altitudeFt = spec.altitudeFt === undefined ? 10000 : spec.altitudeFt;
  return {
    icao24: spec.id,
    callsign: spec.id.toUpperCase(),
    latitude,
    longitude,
    altitudeFt,
    geoAltitudeFt: altitudeFt,
    groundSpeedKt: spec.groundSpeedKt === undefined ? 300 : spec.groundSpeedKt,
    headingDeg: spec.headingDeg === undefined ? 90 : spec.headingDeg,
    verticalRateFpm: spec.verticalRateFpm === undefined ? 0 : spec.verticalRateFpm,
    onGround: spec.onGround === true,
    lastContactUnix: 1_700_000_000,
  };
}

const detect = (aircraft: Aircraft[], usePrefilter = true) =>
  detectConflicts(aircraft, T, { origin: ORIGIN, usePrefilter });

const headOn = (b: Partial<Spec> = {}, a: Partial<Spec> = {}) => [
  ac({ id: "a", east: -FIVE_NM_M, north: 0, headingDeg: 90, ...a }),
  ac({ id: "b", east: FIVE_NM_M, north: 0, headingDeg: 270, ...b }),
];

describe("conflict fixtures", () => {
  it("F1: head-on, same altitude, meet in 60 s", () => {
    const result = detect(headOn());
    expect(result).toHaveLength(1);
    const [pair] = result;
    expect(pair.a).toBe("a");
    expect(pair.b).toBe("b");
    expect(Math.abs(pair.tcpaSec - 60)).toBeLessThan(0.05);
    expect(Math.abs(pair.dcpaNm)).toBeLessThan(0.001);
    expect(Math.abs(pair.verticalAtTcpaFt)).toBeLessThan(1);
    expect(pair.currentHorizontalNm).toBeCloseTo(10, 3);
  });

  it("F2: parallel, 6 NM abeam, same velocity is not a conflict", () => {
    const result = detect([
      ac({ id: "a", east: 0, north: 0 }),
      ac({ id: "b", east: 0, north: 6 * 1852 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("F3: parallel, 3 NM abeam, same velocity flags at tcpa 0", () => {
    const result = detect([
      ac({ id: "a", east: 0, north: 0 }),
      ac({ id: "b", east: 0, north: 3 * 1852 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].tcpaSec).toBe(0);
    expect(Math.abs(result[0].dcpaNm - 3)).toBeLessThan(0.001);
  });

  it("F4: head-on with 3000 ft of vertical separation is not a conflict", () => {
    const result = detect(headOn({ altitudeFt: 13000 }));
    expect(result).toHaveLength(0);
  });

  it("F5: head-on, vertical closes to 0 ft at 60 s", () => {
    const result = detect(headOn({ altitudeFt: 12000, verticalRateFpm: -2000 }));
    expect(result).toHaveLength(1);
    expect(Math.abs(result[0].tcpaSec - 60)).toBeLessThan(0.05);
    expect(Math.abs(result[0].verticalAtTcpaFt)).toBeLessThan(5);
    expect(result[0].currentVerticalFt).toBeCloseTo(2000, 6);
  });

  it("F6: an on-ground aircraft is never paired", () => {
    const result = detect([
      ac({ id: "a", east: 0, north: 0 }),
      ac({ id: "b", east: 0, north: 3 * 1852, onGround: true }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("F7: already diverged, currently 6 NM apart, is not a conflict", () => {
    const result = detect([
      ac({ id: "a", east: (-FIVE_NM_M * 6) / 5, north: 0, headingDeg: 270 }),
      ac({ id: "b", east: (FIVE_NM_M * 6) / 5, north: 0, headingDeg: 90 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("F8: the grid prefilter keeps a pair that sits across a cell edge", () => {
    const pair = headOn();
    const cell = gridCellSizeM(T, ktToMps(300));
    const [ta, tb] = pair.map((p) => toTrack(p, ORIGIN));
    expect(ta && tb).toBeTruthy();
    // The F1 aircraft fall in adjacent cells with the spec cell size.
    expect(cellIndex(ta!.east, cell)).toBe(-1);
    expect(cellIndex(tb!.east, cell)).toBe(0);

    const withGrid = detect(pair, true);
    const withoutGrid = detect(pair, false);
    expect(withGrid).toHaveLength(1);
    expect(withGrid).toEqual(withoutGrid);
  });
});

describe("conflict rules beyond the fixtures", () => {
  it("does not flag a pair exactly 5.0 NM apart (strict less than)", () => {
    const result = detect([
      ac({ id: "a", east: 0, north: 0 }),
      ac({ id: "b", east: 0, north: FIVE_NM_M }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("does not flag when vertical separation at CPA equals the threshold", () => {
    expect(detect(headOn({ altitudeFt: 11000 }))).toHaveLength(0);
    expect(detect(headOn({ altitudeFt: 10999 }))).toHaveLength(1);
  });

  it("does not flag a closest approach beyond the lookahead window", () => {
    // Head-on, 30 NM apart at 300 kt each: closest approach at 180 s.
    const result = detect([
      ac({ id: "a", east: -3 * FIVE_NM_M, north: 0, headingDeg: 90 }),
      ac({ id: "b", east: 3 * FIVE_NM_M, north: 0, headingDeg: 270 }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("flags at t = 0 when already inside both thresholds, even if CPA is late", () => {
    // 4 NM apart, closing at 20 kt: closest approach far beyond 120 s.
    const result = detect([
      ac({ id: "a", east: 0, north: 0, headingDeg: 90, groundSpeedKt: 310 }),
      ac({ id: "b", east: 4 * 1852, north: 0, headingDeg: 90, groundSpeedKt: 290 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].tcpaSec).toBe(0);
    expect(result[0].dcpaNm).toBeCloseTo(4, 3);
  });

  it("skips aircraft missing heading, ground speed, or altitude", () => {
    const base = ac({ id: "a", east: 0, north: 0 });
    for (const missing of [
      { headingDeg: null },
      { groundSpeedKt: null },
      { altitudeFt: null },
    ]) {
      const other = ac({ id: "b", east: 0, north: 3 * 1852, ...missing });
      expect(detect([base, other])).toHaveLength(0);
    }
  });

  it("returns every pair that shares an aircraft, sorted by tcpa then dcpa", () => {
    const result = detect([
      ...headOn(),
      // 2 NM abeam of A and 1 km ahead of it, same velocity: tcpa 0 with A,
      // and it passes B a little before A does.
      ac({ id: "c", east: -FIVE_NM_M + 1000, north: 2 * 1852, headingDeg: 90 }),
    ]);
    expect(result.map((p) => `${p.a}-${p.b}`)).toEqual(["a-c", "b-c", "a-b"]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].tcpaSec).toBeGreaterThanOrEqual(result[i - 1].tcpaSec);
    }
  });

  it("the prefilter keeps a fast head-on pair that starts two cells apart", () => {
    // Each at 300 m/s, 70 km apart: closest approach at about 116.7 s. The
    // spec cell size is 45.26 km, so these land in cells 0 and 2.
    const speedKt = mpsToKt(300);
    const pair = [
      ac({ id: "a", east: 40_000, north: 0, headingDeg: 90, groundSpeedKt: speedKt }),
      ac({ id: "b", east: 110_000, north: 0, headingDeg: 270, groundSpeedKt: speedKt }),
    ];
    const cell = gridCellSizeM(T, 300);
    expect(cellIndex(40_000, cell)).toBe(0);
    expect(cellIndex(110_000, cell)).toBe(2);
    expect(gridSearchRadius(T, 300)).toBe(2);

    const withGrid = detect(pair, true);
    expect(withGrid).toHaveLength(1);
    expect(withGrid[0].tcpaSec).toBeCloseTo(70_000 / 600, 3);
    expect(withGrid).toEqual(detect(pair, false));
  });

  it("the prefilter matches the naive loop on a scattered field", () => {
    // Deterministic pseudo-random field, no Math.random.
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const field: Aircraft[] = [];
    for (let i = 0; i < 120; i++) {
      field.push(
        ac({
          id: `f${String(i).padStart(3, "0")}`,
          east: (rand() - 0.5) * 300_000,
          north: (rand() - 0.5) * 300_000,
          altitudeFt: 5000 + Math.floor(rand() * 8) * 1000,
          headingDeg: rand() * 360,
          groundSpeedKt: 120 + rand() * 400,
          verticalRateFpm: Math.round((rand() - 0.5) * 3000),
        }),
      );
    }
    const withGrid = detect(field, true);
    const withoutGrid = detect(field, false);
    expect(withoutGrid.length).toBeGreaterThan(0);
    expect(withGrid).toEqual(withoutGrid);
  });
});

describe("the whole window is checked, not one moment", () => {
  it("flags an aircraft descending through the level of one flying beside it", () => {
    // Side by side, 2 NM apart, same speed and direction. B is 1,500 ft above
    // and descending at 1,500 fpm, so it passes through A's level. At the
    // moment of closest horizontal approach (now) they are 1,500 ft apart,
    // which is why the first version of the check missed this.
    const result = detect([
      ac({ id: "a", east: 0, north: 0, altitudeFt: 10000 }),
      ac({ id: "b", east: 0, north: 2 * 1852, altitudeFt: 11500, verticalRateFpm: -1500 }),
    ]);
    expect(result).toHaveLength(1);
    // They come within 1,000 ft from 20 s to 100 s.
    expect(result[0].tcpaSec).toBeGreaterThan(20);
    expect(result[0].tcpaSec).toBeLessThan(21);
    expect(result[0].verticalAtTcpaFt).toBeLessThan(1000);
    expect(result[0].dcpaNm).toBeCloseTo(2, 2);
    expect(result[0].currentVerticalFt).toBeCloseTo(1500, 6);
  });

  it("flags a head-on pair that is level with each other before they pass", () => {
    // 20 NM apart head-on, so they pass in 120 s. B starts 4,500 ft above and
    // descends at 3,000 fpm. When they pass, B is 1,500 ft below: clear. But
    // from 90 s to 110 s they are within 5 NM and within 1,000 ft together.
    const result = detect([
      ac({ id: "a", east: -2 * FIVE_NM_M, north: 0, headingDeg: 90, altitudeFt: 10000 }),
      ac({
        id: "b",
        east: 2 * FIVE_NM_M,
        north: 0,
        headingDeg: 270,
        altitudeFt: 14500,
        verticalRateFpm: -3000,
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].tcpaSec).toBeGreaterThan(90);
    expect(result[0].tcpaSec).toBeLessThanOrEqual(110);
    expect(result[0].dcpaNm).toBeLessThan(5);
    expect(result[0].verticalAtTcpaFt).toBeLessThan(1000);
  });

  it("does not flag when the two limits are broken at different times", () => {
    // Same head-on pair, but B descends through A's level early, at 40 to
    // 80 s, while they are still more than 5 NM apart. By the time they are
    // close on the ground (90 s on), B is well below.
    const result = detect([
      ac({ id: "a", east: -2 * FIVE_NM_M, north: 0, headingDeg: 90, altitudeFt: 10000 }),
      ac({
        id: "b",
        east: 2 * FIVE_NM_M,
        north: 0,
        headingDeg: 270,
        altitudeFt: 13000,
        verticalRateFpm: -3000,
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("always reports a time inside the window and numbers under the limits", () => {
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const field: Aircraft[] = [];
    for (let i = 0; i < 200; i++) {
      field.push(
        ac({
          id: `w${String(i).padStart(3, "0")}`,
          east: (rand() - 0.5) * 200_000,
          north: (rand() - 0.5) * 200_000,
          altitudeFt: 5000 + Math.floor(rand() * 10) * 500,
          headingDeg: rand() * 360,
          groundSpeedKt: 120 + rand() * 400,
          verticalRateFpm: Math.round((rand() - 0.5) * 6000),
        }),
      );
    }
    const result = detect(field);
    expect(result.length).toBeGreaterThan(10);
    for (const pair of result) {
      expect(pair.tcpaSec).toBeGreaterThanOrEqual(0);
      expect(pair.tcpaSec).toBeLessThanOrEqual(T.lookaheadSec);
      expect(pair.dcpaNm).toBeLessThan(T.lateralNm);
      expect(pair.verticalAtTcpaFt).toBeLessThan(T.verticalFt);
    }
    // And the grid still agrees with the naive loop.
    expect(result).toEqual(detect(field, false));
  });
});
