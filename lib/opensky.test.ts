import { describe, expect, it } from "vitest";
import { mapStateVector, mapStatesResponse } from "./opensky";

// Field order from the OpenSky REST docs for /states/all.
const row = (overrides: Record<number, unknown> = {}): unknown[] => {
  const base: unknown[] = [
    "ABC123", // 0 icao24
    "TEST12  ", // 1 callsign
    "Testland", // 2 origin_country
    1_700_000_000, // 3 time_position
    1_700_000_001, // 4 last_contact
    -104.67, // 5 longitude
    39.86, // 6 latitude
    3048, // 7 baro_altitude, meters
    false, // 8 on_ground
    154.33333333333334, // 9 velocity, m/s
    90, // 10 true_track
    -10.16, // 11 vertical_rate, m/s
    null, // 12 sensors
    3100, // 13 geo_altitude, meters
    "1200", // 14 squawk
    false, // 15 spi
    0, // 16 position_source
  ];
  for (const [index, value] of Object.entries(overrides)) {
    base[Number(index)] = value;
  }
  return base;
};

describe("opensky mapping", () => {
  it("converts SI fields once at the boundary", () => {
    const ac = mapStateVector(row());
    expect(ac).not.toBeNull();
    expect(ac!.icao24).toBe("abc123");
    expect(ac!.callsign).toBe("TEST12");
    expect(ac!.altitudeFt).toBeCloseTo(10000, 6);
    expect(ac!.geoAltitudeFt).toBeCloseTo(3100 / 0.3048, 6);
    expect(ac!.groundSpeedKt).toBeCloseTo(300, 6);
    expect(ac!.headingDeg).toBe(90);
    expect(ac!.verticalRateFpm).toBeCloseTo(-2000, 6);
    expect(ac!.onGround).toBe(false);
    expect(ac!.lastContactUnix).toBe(1_700_000_001);
  });

  it("prefers barometric altitude, then geometric, else null", () => {
    expect(mapStateVector(row({ 7: null }))!.altitudeFt).toBeCloseTo(3100 / 0.3048, 6);
    expect(mapStateVector(row({ 7: null, 13: null }))!.altitudeFt).toBeNull();
  });

  it("drops vectors with no position and keeps null kinematics", () => {
    expect(mapStateVector(row({ 5: null }))).toBeNull();
    expect(mapStateVector(row({ 6: null }))).toBeNull();
    expect(mapStateVector("nope")).toBeNull();
    const sparse = mapStateVector(row({ 1: null, 9: null, 10: null, 11: null }));
    expect(sparse!.callsign).toBe("ABC123");
    expect(sparse!.groundSpeedKt).toBeNull();
    expect(sparse!.headingDeg).toBeNull();
    expect(sparse!.verticalRateFpm).toBeNull();
  });

  it("treats null states as an empty box and rejects other shapes", () => {
    expect(mapStatesResponse({ time: 5, states: null })).toEqual({
      timeUnix: 5,
      aircraft: [],
    });
    expect(mapStatesResponse({ time: 5, states: [row()] }).aircraft).toHaveLength(1);
    expect(() => mapStatesResponse({})).toThrow();
    expect(() => mapStatesResponse(null)).toThrow();
    expect(() => mapStatesResponse({ time: 5, states: "x" })).toThrow();
  });
});
