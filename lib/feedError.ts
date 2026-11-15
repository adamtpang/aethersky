/** A live feed request that did not produce usable aircraft data. */
export class FeedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

export interface LiveStates {
  timeUnix: number | null;
  aircraft: import("./types").Aircraft[];
}

export const REQUEST_TIMEOUT_MS = 8_000;

export const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
