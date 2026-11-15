import { describe, expect, it } from "vitest";
import { detectConflicts } from "./conflict";
import {
  MOCK_ORIGIN,
  MOCK_T0_UNIX,
  buildMockAircraft,
  buildMockFeed,
} from "./mockTraffic";
import { DEMO_DEFAULT_THRESHOLDS } from "./types";

const callsignOf = (aircraft: ReturnType<typeof buildMockAircraft>) => {
  const byId = new Map(aircraft.map((a) => [a.icao24, a.callsign]));
  return (id: string) => byId.get(id) ?? id;
};

describe("mock traffic", () => {
  it("is deterministic and flagged as mock", () => {
    expect(buildMockAircraft()).toEqual(buildMockAircraft());
    const feed = buildMockFeed("fell back");
    expect(feed.source).toBe("mock");
    expect(feed.timeUnix).toBe(MOCK_T0_UNIX);
    expect(feed.warning).toBe("fell back");
    expect(buildMockFeed().warning).toBeUndefined();
  });

  it("flags exactly the three scripted pairs at the demo defaults", () => {
    const aircraft = buildMockAircraft();
    const name = callsignOf(aircraft);
    const conflicts = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS, {
      origin: MOCK_ORIGIN,
    });
    const pairs = conflicts.map((c) => [name(c.a), name(c.b)].sort().join(" / "));
    expect(pairs.sort()).toEqual([
      "CLIMBER / LEVEL",
      "HORIZON / MERIDIAN",
      "PARALLEL-CLOSE / PARALLEL-CLOSE-B",
    ]);

    // Sorted by time to closest approach: the abeam pair is at t = 0.
    expect(conflicts[0].tcpaSec).toBe(0);
    expect(conflicts[0].dcpaNm).toBeCloseTo(3, 3);
    expect(conflicts[1].tcpaSec).toBeCloseTo(60, 1);
    expect(conflicts[2].tcpaSec).toBeCloseTo(60, 1);
  });

  it("includes non-flagging pairs and a grounded aircraft that is skipped", () => {
    const aircraft = buildMockAircraft();
    const grounded = aircraft.filter((a) => a.onGround);
    expect(grounded.map((a) => a.callsign)).toEqual(["TAXI"]);

    const baseline = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS, {
      origin: MOCK_ORIGIN,
    });
    const airborne = aircraft.map((a) => ({ ...a, onGround: false }));
    const ifAirborne = detectConflicts(airborne, DEMO_DEFAULT_THRESHOLDS, {
      origin: MOCK_ORIGIN,
    });
    // TAXI would flag against PARALLEL-CLOSE if it were not on the ground.
    expect(ifAirborne.length).toBe(baseline.length + 1);
    expect(baseline.some((c) => c.a === "mock07" || c.b === "mock07")).toBe(false);
  });
});
