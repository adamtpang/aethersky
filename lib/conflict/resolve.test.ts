import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_THRESHOLDS, type Aircraft } from "../types";
import { detectConflicts } from "./detect";
import { fromEnu, type GeoOrigin } from "./enu";
import { MANEUVERS, suggestResolution } from "./resolve";

const ORIGIN: GeoOrigin = { latitude: 39.86, longitude: -104.67 };
const T = DEMO_DEFAULT_THRESHOLDS;
const NM = 1852;

const ac = (
  id: string,
  eastNm: number,
  northNm: number,
  overrides: Partial<Aircraft> = {},
): Aircraft => {
  const { latitude, longitude } = fromEnu(eastNm * NM, northNm * NM, ORIGIN);
  return {
    icao24: id,
    callsign: id.toUpperCase(),
    latitude,
    longitude,
    altitudeFt: 30000,
    geoAltitudeFt: 30000,
    groundSpeedKt: 300,
    headingDeg: 90,
    verticalRateFpm: 0,
    onGround: false,
    lastContactUnix: 1_700_000_000,
    ...overrides,
  };
};

/** Apply a resolution to the pair and check it with the real engine. */
function stillFlaggedPair(
  a: Aircraft,
  b: Aircraft,
  moverId: string,
  label: string,
  thresholds = T,
): boolean {
  const maneuver = MANEUVERS.find((m) => m.label === label)!;
  const next = [a, b].map((x) => (x.icao24 === moverId ? maneuver.apply(x)! : x));
  return detectConflicts(next, thresholds).length > 0;
}

describe("resolution illustration", () => {
  it("levels off the aircraft whose climb causes the conflict", () => {
    // Head-on, 10 NM apart, 2,000 ft apart, and B descends onto A's level.
    const a = ac("a", -5, 0, { headingDeg: 90, altitudeFt: 30000 });
    const b = ac("b", 5, 0, { headingDeg: 270, altitudeFt: 32000, verticalRateFpm: -2000 });
    expect(detectConflicts([a, b], T)).toHaveLength(1);

    const fix = suggestResolution({ a: "a", b: "b" }, a, b, T);
    expect(fix).not.toBeNull();
    expect(fix!.aircraftId).toBe("b");
    expect(fix!.label).toBe("levels off");
    expect(fix!.afterVerticalFt).toBeCloseTo(2000, 0);
    expect(fix!.clearsInSec).toBeUndefined();
    expect(stillFlaggedPair(a, b, fix!.aircraftId, fix!.label)).toBe(false);
  });

  it("splits a fast head-on pair vertically when no single change is enough", () => {
    // 10 NM apart, closing at 600 kt: 60 seconds to go. One aircraft making
    // one small change cannot open the gap in time. Both moving can.
    const a = ac("a", -5, 0, { headingDeg: 90 });
    const b = ac("b", 5, 0, { headingDeg: 270, altitudeFt: 30000 });
    expect(detectConflicts([a, b], T)).toHaveLength(1);

    const fix = suggestResolution({ a: "a", b: "b" }, a, b, T);
    expect(fix).not.toBeNull();
    expect(fix!.kind).toBe("split");
    expect(fix!.partnerId).toBeDefined();
    expect(new Set([fix!.aircraftId, fix!.partnerId])).toEqual(new Set(["a", "b"]));
    expect(fix!.label).toMatch(/^climbs/);
    expect(fix!.partnerLabel).toMatch(/^descends/);
    // At the moment they pass, they are well over 1,000 ft apart.
    expect(fix!.afterVerticalFt).toBeGreaterThanOrEqual(T.verticalFt);
  });

  it("with more warning, a single small change is enough", () => {
    // The same head-on pair, but 40 NM apart with a 5 minute window.
    const wide = { ...T, lookaheadSec: 300 };
    const a = ac("a", -20, 0, { headingDeg: 90 });
    const b = ac("b", 20, 0, { headingDeg: 270 });
    expect(detectConflicts([a, b], wide)).toHaveLength(1);
    const fix = suggestResolution({ a: "a", b: "b" }, a, b, wide);
    expect(fix).not.toBeNull();
    expect(fix!.kind).not.toBe("split");
    expect(stillFlaggedPair(a, b, fix!.aircraftId, fix!.label, wide)).toBe(false);
  });

  it("does not pick a change that brings the aircraft too close to a third one", () => {
    // B is descending onto A's level. Alone, the answer is "B levels off".
    const a = ac("a", -5, 0, { headingDeg: 90, altitudeFt: 30000 });
    const b = ac("b", 5, 0, { headingDeg: 270, altitudeFt: 32000, verticalRateFpm: -2000 });
    const alone = suggestResolution({ a: "a", b: "b" }, a, b, T)!;
    expect(`${alone.aircraftId} ${alone.label}`).toBe("b levels off");

    // C flies beside B, 2 NM away and 1,500 ft above, descending more slowly
    // than B. Today the gap between B and C only grows. If B levels off, C
    // comes down through B's level.
    const c: Aircraft = {
      ...b,
      icao24: "c",
      callsign: "C",
      latitude: b.latitude + 2 / 60,
      altitudeFt: 33500,
      verticalRateFpm: -1500,
    };
    const before = detectConflicts([a, b, c], T);
    expect(before.map((p) => `${p.a}|${p.b}`)).toEqual(["a|b"]);
    const flagged = new Set(before.map((p) => `${p.a}|${p.b}`));

    const withC = suggestResolution({ a: "a", b: "b" }, a, b, T, [a, b, c], flagged);
    expect(withC).not.toBeNull();
    expect(`${withC!.aircraftId} ${withC!.label}`).not.toBe("b levels off");
  });

  it("for a pair already inside the limits, reports how soon they would be out", () => {
    // Side by side, 3 NM apart, same speed and level: inside the limits now.
    const a = ac("a", 0, 0);
    const b = ac("b", 0, 3);
    const [conflict] = detectConflicts([a, b], T);
    expect(conflict.tcpaSec).toBe(0);

    const fix = suggestResolution({ a: "a", b: "b" }, a, b, T);
    expect(fix).not.toBeNull();
    expect(fix!.clearsInSec).toBeGreaterThan(0);
    // Climbing 1,000 ft at 1,500 fpm takes 40 s, so the best option is no slower.
    expect(fix!.clearsInSec).toBeLessThanOrEqual(40);
  });

  it("returns null when an aircraft is missing what the check needs", () => {
    const a = ac("a", -5, 0);
    const b = ac("b", 5, 0, { headingDeg: null });
    expect(suggestResolution({ a: "a", b: "b" }, a, b, T)).toBeNull();
  });

  it("returns null when nothing on the list clears the pair", () => {
    // Stacked 100 ft apart at the same spot and speed, with a 10 second
    // window: no small change can open 5 NM or 1,000 ft that fast.
    const tight = { lateralNm: 5, verticalFt: 1000, lookaheadSec: 10 };
    const a = ac("a", 0, 0);
    const b = ac("b", 0, 0.1, { altitudeFt: 30100 });
    expect(suggestResolution({ a: "a", b: "b" }, a, b, tight)).toBeNull();
  });
});
