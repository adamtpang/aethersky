import type { Aircraft, ConflictPair, ConflictThresholds } from "../types";
import { detectConflictsRegional } from "./regional";

/**
 * Runs the country-wide conflict check off the main thread, so panning the
 * map and dragging a slider never wait on it.
 */

export interface DetectRequest {
  id: number;
  aircraft: Aircraft[];
  thresholds: ConflictThresholds;
}

export interface DetectResponse {
  id: number;
  conflicts: ConflictPair[];
  /** How long the check took, milliseconds. */
  ms: number;
  checked: number;
}

addEventListener("message", (event: MessageEvent<DetectRequest>) => {
  const { id, aircraft, thresholds } = event.data;
  const startedAt = performance.now();
  const conflicts = detectConflictsRegional(aircraft, thresholds);
  const response: DetectResponse = {
    id,
    conflicts,
    ms: performance.now() - startedAt,
    checked: aircraft.length,
  };
  (postMessage as (message: DetectResponse) => void)(response);
});
