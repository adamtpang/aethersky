import { describe, expect, it } from "vitest";
import { fromEnu, toEnu } from "./conflict/enu";
import { DISCLAIMER_TEXT } from "./disclaimer";
import { DEMO_DEFAULT_THRESHOLDS } from "./types";
import {
  METERS_PER_FT,
  METERS_PER_NM,
  MPS_PER_FPM,
  MPS_PER_KT,
  ftToMeters,
  ktToMps,
  metersToFt,
  metersToNm,
  mpsToFpm,
  mpsToKt,
  nmToMeters,
} from "./units";

describe("units", () => {
  it("uses exact SI conversions", () => {
    expect(METERS_PER_NM).toBe(1852);
    expect(METERS_PER_FT).toBe(0.3048);
    expect(MPS_PER_KT).toBe(1852 / 3600);
    expect(MPS_PER_FPM).toBe(0.3048 / 60);
  });

  it("5 NM is 9260 m and 300 kt is the F1 speed", () => {
    expect(5 * 1852).toBe(9260);
    expect(nmToMeters(5)).toBe(9260);
    expect(ktToMps(300)).toBe((300 * 1852) / 3600);
    expect(ktToMps(300) * 60).toBeCloseTo(9260, 9);
  });

  it("round-trips each conversion", () => {
    expect(metersToNm(nmToMeters(7.5))).toBeCloseTo(7.5, 12);
    expect(metersToFt(ftToMeters(10000))).toBeCloseTo(10000, 9);
    expect(mpsToKt(ktToMps(300))).toBeCloseTo(300, 12);
    expect(mpsToFpm(-10.16)).toBeCloseTo(-2000, 9);
  });
});

describe("enu projection", () => {
  const origin = { latitude: 39.86, longitude: -104.67 };

  it("maps the origin to zero", () => {
    const enu = toEnu(origin.latitude, origin.longitude, 0, origin);
    expect(enu.east).toBeCloseTo(0, 9);
    expect(enu.north).toBeCloseTo(0, 9);
  });

  it("inverts cleanly at the documented origin", () => {
    const geo = fromEnu(-9260, 11112, origin);
    const enu = toEnu(geo.latitude, geo.longitude, 0, origin);
    expect(enu.east).toBeCloseTo(-9260, 6);
    expect(enu.north).toBeCloseTo(11112, 6);
  });
});

describe("safety constants", () => {
  it("keeps the exact disclaimer wording", () => {
    expect(DISCLAIMER_TEXT).toBe(
      "Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.",
    );
  });

  it("ships the documented demo defaults", () => {
    expect(DEMO_DEFAULT_THRESHOLDS).toEqual({
      lateralNm: 5,
      verticalFt: 1000,
      lookaheadSec: 120,
    });
  });
});
