/**
 * Last measured timings, in milliseconds. Shown in the sidebar and exposed
 * on `window.__aetherskyPerf` so anyone can check the numbers in a console.
 */
export interface PerfStats {
  /** Time to draw one frame of the traffic canvas. */
  drawMs: number;
  /** Time for one country-wide conflict check. */
  detectMs: number;
  /** Aircraft in the last check. */
  checked: number;
}

export const perfStats: PerfStats = { drawMs: 0, detectMs: 0, checked: 0 };

if (typeof window !== "undefined") {
  (window as unknown as { __aetherskyPerf: PerfStats }).__aetherskyPerf = perfStats;
}
