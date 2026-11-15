import { describe, expect, it } from "vitest";
import { bboxAreaSqDeg, bboxToPoint, inBbox, isValidBbox } from "./bbox";
import {
  ADSB_FI,
  ADSB_LOL,
  MAX_POSITION_AGE_SEC,
  mapReadsbAircraft,
  mapReadsbResponse,
} from "./readsb";

const NOW = 1_700_000_000;

const row = (overrides: Record<string, unknown> = {}) => ({
  hex: "A7AC83",
  flight: "CAP594  ",
  r: "N594CP",
  lat: 39.9,
  lon: -104.7,
  alt_baro: 9700,
  alt_geom: 9975,
  gs: 101.7,
  track: 329.91,
  true_heading: 331,
  baro_rate: 640,
  geom_rate: 384,
  seen: 2,
  seen_pos: 0.5,
  ...overrides,
});

describe("readsb mapping", () => {
  it("maps fields that are already in feet, knots, and feet per minute", () => {
    const ac = mapReadsbAircraft(row(), NOW);
    expect(ac).toEqual({
      icao24: "a7ac83",
      callsign: "CAP594",
      latitude: 39.9,
      longitude: -104.7,
      altitudeFt: 9700,
      geoAltitudeFt: 9975,
      groundSpeedKt: 101.7,
      headingDeg: 329.91,
      verticalRateFpm: 640,
      onGround: false,
      lastContactUnix: NOW - 2,
    });
  });

  it("treats alt_baro of ground as on the ground", () => {
    const ac = mapReadsbAircraft(row({ alt_baro: "ground", alt_geom: undefined, track: undefined }), NOW);
    expect(ac!.onGround).toBe(true);
    expect(ac!.altitudeFt).toBeNull();
    // No track on the ground: fall back to the reported true heading.
    expect(ac!.headingDeg).toBe(331);
  });

  it("prefers barometric values and falls back to geometric ones", () => {
    const ac = mapReadsbAircraft(row({ alt_baro: undefined, baro_rate: undefined }), NOW);
    expect(ac!.altitudeFt).toBe(9975);
    expect(ac!.verticalRateFpm).toBe(384);
  });

  it("falls back from callsign to registration to the hex id", () => {
    expect(mapReadsbAircraft(row({ flight: "   " }), NOW)!.callsign).toBe("N594CP");
    expect(mapReadsbAircraft(row({ flight: undefined, r: undefined }), NOW)!.callsign).toBe("A7AC83");
  });

  it("drops aircraft with no position or a stale position", () => {
    expect(mapReadsbAircraft(row({ lat: undefined }), NOW)).toBeNull();
    expect(mapReadsbAircraft(row({ hex: "" }), NOW)).toBeNull();
    expect(mapReadsbAircraft(row({ seen_pos: MAX_POSITION_AGE_SEC + 1 }), NOW)).toBeNull();
    expect(mapReadsbAircraft(row({ seen_pos: MAX_POSITION_AGE_SEC }), NOW)).not.toBeNull();
    expect(mapReadsbAircraft("nope", NOW)).toBeNull();
  });

  it("reads the list from ac or aircraft and rejects other shapes", () => {
    expect(mapReadsbResponse({ now: NOW * 1000, ac: [row()] }).aircraft).toHaveLength(1);
    expect(mapReadsbResponse({ now: NOW, aircraft: [row()] }).timeUnix).toBe(NOW);
    expect(mapReadsbResponse({ now: NOW * 1000, ac: [] })).toEqual({ timeUnix: NOW, aircraft: [] });
    expect(() => mapReadsbResponse({ msg: "error" })).toThrow();
    expect(() => mapReadsbResponse(null)).toThrow();
  });

  it("builds the documented endpoint urls", () => {
    expect(ADSB_FI.buildUrl(39.86, -104.67, 40)).toBe(
      "https://opendata.adsb.fi/api/v3/lat/39.8600/lon/-104.6700/dist/40",
    );
    expect(ADSB_LOL.buildUrl(39.86, -104.67, 40)).toBe(
      "https://api.adsb.lol/v2/point/39.8600/-104.6700/40",
    );
  });
});

describe("bounding boxes", () => {
  const ok = { lamin: 38, lomin: -106, lamax: 41, lomax: -103 };

  it("validates boxes", () => {
    expect(isValidBbox(ok)).toBe(true);
    expect(bboxAreaSqDeg(ok)).toBe(9);
    expect(isValidBbox({ ...ok, lamin: 42 })).toBe(false);
    expect(isValidBbox({ ...ok, lomax: 181 })).toBe(false);
    expect(isValidBbox({ ...ok, lamin: Number.NaN })).toBe(false);
  });

  it("covers the whole box with the query circle", () => {
    const point = bboxToPoint(ok);
    expect(point.latitude).toBe(39.5);
    expect(point.longitude).toBe(-104.5);
    // Half height is 90 NM, half width about 69 NM at this latitude.
    expect(point.radiusNm).toBeGreaterThanOrEqual(113);
    expect(point.radiusNm).toBeLessThanOrEqual(116);
    expect(bboxToPoint({ lamin: -60, lomin: -170, lamax: 60, lomax: 170 }).radiusNm).toBe(250);
  });

  it("tests membership", () => {
    expect(inBbox(ok, 39, -105)).toBe(true);
    expect(inBbox(ok, 45, -105)).toBe(false);
    expect(inBbox(ok, 39, -100)).toBe(false);
  });
});
