import { describe, expect, it } from "vitest";
import { DEMO_DEFAULT_THRESHOLDS } from "../types";
import { detectConflicts } from "./detect";
import { SCENE_ORIGIN, buildSceneAircraft } from "./scene.fixture";

const callsignOf = (aircraft: ReturnType<typeof buildSceneAircraft>) => {
  const byId = new Map(aircraft.map((a) => [a.icao24, a.callsign]));
  return (id: string) => byId.get(id) ?? id;
};

describe("scripted test scene", () => {
  it("is deterministic", () => {
    expect(buildSceneAircraft()).toEqual(buildSceneAircraft());
  });

  it("flags exactly the three scripted pairs at the demo defaults", () => {
    const aircraft = buildSceneAircraft();
    const name = callsignOf(aircraft);
    const conflicts = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS, {
      origin: SCENE_ORIGIN,
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

  it("gives the same result when the origin is the average position", () => {
    const aircraft = buildSceneAircraft();
    const fixed = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS, {
      origin: SCENE_ORIGIN,
    });
    const centroid = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS);
    expect(centroid.map((c) => `${c.a}-${c.b}`)).toEqual(
      fixed.map((c) => `${c.a}-${c.b}`),
    );
  });

  it("includes non-flagging pairs and a grounded aircraft that is skipped", () => {
    const aircraft = buildSceneAircraft();
    const grounded = aircraft.filter((a) => a.onGround);
    expect(grounded.map((a) => a.callsign)).toEqual(["TAXI"]);

    const baseline = detectConflicts(aircraft, DEMO_DEFAULT_THRESHOLDS, {
      origin: SCENE_ORIGIN,
    });
    const airborne = aircraft.map((a) => ({ ...a, onGround: false }));
    const ifAirborne = detectConflicts(airborne, DEMO_DEFAULT_THRESHOLDS, {
      origin: SCENE_ORIGIN,
    });
    // TAXI would flag against PARALLEL-CLOSE if it were not on the ground.
    expect(ifAirborne.length).toBe(baseline.length + 1);
    expect(baseline.some((c) => c.a === "test07" || c.b === "test07")).toBe(false);
  });
});
