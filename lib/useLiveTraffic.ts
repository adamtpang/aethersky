"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectConflictsRegional } from "./conflict";
import type { DetectRequest, DetectResponse } from "./conflict/worker";
import { perfStats } from "./perf";
import { projectRow } from "./projection";
import type {
  Aircraft,
  ConflictPair,
  ConflictThresholds,
  FeedSource,
} from "./types";
import { decodeSighting, type SweepEvent, type TrafficSnapshot, type WireRow } from "./wire";

/**
 * How often the page asks for the national sweep. The server refreshes it
 * about once a minute and shares it with every visitor.
 */
const POLL_MS = 45_000;
/** How often positions are moved forward along their tracks. */
const TICK_MS = 5_000;
/**
 * An earlier picture older than this is not shown at all. It is only ever a
 * placeholder for the few seconds before live traffic arrives. Thirty
 * minutes (Adam, 2026-11-15, raised from ten): a quiet site otherwise has
 * nothing to show a cold visitor. It is always drawn faint and labeled
 * with its age.
 */
export const EARLIER_MAX_AGE_SEC = 1800;
/** While regions are streaming in, redraw at most this often. */
const STREAM_REDRAW_MS = 350;

export type TrafficPhase = "loading" | "live" | "error";

export interface LiveTraffic {
  /** Every airborne aircraft, projected to the current moment. */
  aircraft: Aircraft[];
  conflicts: ConflictPair[];
  phase: TrafficPhase;
  error: string | null;
  warning: string | null;
  source: FeedSource | null;
  regionsDone: number;
  regionsTotal: number;
  /** When the last full sweep finished, unix seconds. */
  sweptAtUnix: number | null;
  /** True while a sweep is being read. */
  refreshing: boolean;
  /**
   * The last finished sweep, shown dimmed while the first live sweep loads.
   * Positions are as last seen, not projected. Never used for conflict
   * checks. Null once live traffic has fully arrived, or if it is too old.
   */
  earlier: { aircraft: Aircraft[]; ageSec: number } | null;
  /** Time of the last conflict check, milliseconds, and how many aircraft. */
  detectMs: number;
  checked: number;
  refresh: () => void;
}

interface Meta {
  phase: TrafficPhase;
  error: string | null;
  warning: string | null;
  source: FeedSource | null;
  regionsDone: number;
  regionsTotal: number;
  sweptAtUnix: number | null;
  refreshing: boolean;
}

const INITIAL_META: Meta = {
  phase: "loading",
  error: null,
  warning: null,
  source: null,
  regionsDone: 0,
  regionsTotal: 0,
  sweptAtUnix: null,
  refreshing: true,
};

/**
 * Live national traffic. Reads the server's stream region by region, keeps
 * the freshest sighting of each aircraft, moves every aircraft forward to
 * the current moment every few seconds, and runs the conflict check in a
 * background worker.
 *
 * Real traffic only: when a sweep fails, every aircraft is removed.
 */
export function useLiveTraffic(
  thresholds: ConflictThresholds,
  checkFloorFt: number,
): LiveTraffic {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [conflicts, setConflicts] = useState<ConflictPair[]>([]);
  const [meta, setMeta] = useState<Meta>(INITIAL_META);
  const [timing, setTiming] = useState({ detectMs: 0, checked: 0 });
  const [earlier, setEarlier] = useState<LiveTraffic["earlier"]>(null);
  /** The earlier picture as received, and whether it is still wanted. */
  const earlierRef = useRef<{ aircraft: Aircraft[]; finishedAtUnix: number } | null>(null);
  const firstSweepDoneRef = useRef(false);

  const sightingsRef = useRef(new Map<string, WireRow>());
  /** Server clock minus this device's clock, seconds. */
  const clockOffsetRef = useRef(0);
  /** False until a response has told us what time the server thinks it is. */
  const clockKnownRef = useRef(false);
  /** Seconds a cached response sat in the CDN before reaching this page. */
  const responseAgeRef = useRef(0);
  const lastLoadAtRef = useRef(0);
  const loadingRef = useRef(false);
  const redrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  /** Project every sighting to now and publish the result. */
  const rebuild = useCallback(() => {
    const sightings = sightingsRef.current;
    const next: Aircraft[] = [];
    if (!clockKnownRef.current) {
      // Without a trusted clock nothing can be called stale, so nothing is
      // projected or dropped yet. Show positions as reported.
      for (const row of sightings.values()) {
        const asReported = projectRow(row, row[8]);
        if (asReported) next.push(asReported);
      }
      setAircraft(next);
      return;
    }
    const nowUnix = Date.now() / 1000 + clockOffsetRef.current;
    for (const [id, row] of sightings) {
      const projected = projectRow(row, nowUnix);
      if (projected) next.push(projected);
      else sightings.delete(id);
    }
    setAircraft(next);
  }, []);

  /** Work out the earlier picture's age, and drop it once it is too old. */
  const refreshEarlier = useCallback(() => {
    const held = earlierRef.current;
    if (!held || firstSweepDoneRef.current) {
      earlierRef.current = null;
      setEarlier(null);
      return;
    }
    const nowUnix = Date.now() / 1000 + clockOffsetRef.current;
    const ageSec = Math.max(0, Math.round(nowUnix - held.finishedAtUnix));
    if (ageSec > EARLIER_MAX_AGE_SEC) {
      earlierRef.current = null;
      setEarlier(null);
      return;
    }
    setEarlier({ aircraft: held.aircraft, ageSec });
  }, []);

  const scheduleRebuild = useCallback(() => {
    if (redrawTimerRef.current !== null) return;
    redrawTimerRef.current = setTimeout(() => {
      redrawTimerRef.current = null;
      rebuild();
    }, STREAM_REDRAW_MS);
  }, [rebuild]);

  const handleEvent = useCallback(
    (event: SweepEvent) => {
      if (event.t === "clock") {
        // Real server time now: when the response was written, plus how
        // long a cache held it.
        clockOffsetRef.current =
          event.nowUnix + responseAgeRef.current - Date.now() / 1000;
        clockKnownRef.current = true;
        refreshEarlier();
      } else if (event.t === "start") {
        setMeta((m) => ({
          ...m,
          source: event.source,
          regionsDone: 0,
          regionsTotal: event.regionsTotal,
          refreshing: true,
        }));
      } else if (event.t === "region") {
        const sightings = sightingsRef.current;
        for (const row of event.rows) {
          const known = sightings.get(row[0]);
          if (!known || row[8] > known[8]) sightings.set(row[0], row);
        }
        setMeta((m) => ({ ...m, regionsDone: event.done }));
        scheduleRebuild();
      } else {
        // Live traffic has spoken. The placeholder is no longer needed,
        // and after a failure it must not stay on screen either.
        firstSweepDoneRef.current = true;
        refreshEarlier();
        if (event.error) {
          sightingsRef.current.clear();
          setMeta((m) => ({
            ...m,
            phase: "error",
            error: event.error ?? null,
            warning: null,
            refreshing: false,
          }));
        } else {
          setMeta((m) => ({
            ...m,
            phase: "live",
            error: null,
            warning: event.warning ?? null,
            sweptAtUnix: event.finishedAtUnix,
            regionsDone: event.regionsTotal,
            regionsTotal: event.regionsTotal,
            refreshing: false,
          }));
        }
        rebuild();
      }
    },
    [rebuild, scheduleRebuild, refreshEarlier],
  );

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    lastLoadAtRef.current = Date.now();
    setMeta((m) => ({ ...m, refreshing: true }));
    try {
      const res = await fetch("/api/traffic");
      if (!res.ok || !res.body) {
        throw new Error(`The traffic service answered with status ${res.status}.`);
      }
      const age = Number(res.headers.get("age"));
      responseAgeRef.current = Number.isFinite(age) && age > 0 ? age : 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            const event = JSON.parse(line) as SweepEvent;
            if (event.t === "end") ended = true;
            handleEvent(event);
          }
          newline = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (!ended) throw new Error("The traffic stream stopped before it finished.");
    } catch (error) {
      firstSweepDoneRef.current = true;
      refreshEarlier();
      sightingsRef.current.clear();
      setMeta((m) => ({
        ...m,
        phase: "error",
        error:
          error instanceof Error && error.message.startsWith("The traffic")
            ? error.message
            : "The traffic service could not be reached.",
        warning: null,
        refreshing: false,
      }));
      rebuild();
    } finally {
      loadingRef.current = false;
    }
  }, [handleEvent, rebuild, refreshEarlier]);

  // Once, on arrival: ask for the last finished sweep. The CDN usually has
  // a copy and answers at once, so a cold visit is not an empty map.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/traffic?snapshot=1");
        if (!res.ok) return;
        const snapshot = (await res.json()) as TrafficSnapshot;
        if (cancelled || firstSweepDoneRef.current) return;
        if (!Array.isArray(snapshot.rows) || !snapshot.finishedAtUnix) return;
        earlierRef.current = {
          aircraft: snapshot.rows.map(decodeSighting),
          finishedAtUnix: snapshot.finishedAtUnix,
        };
        refreshEarlier();
      } catch {
        // No earlier picture. The live sweep carries on as usual.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshEarlier]);

  // Read a sweep now, then on a timer while the tab is visible. A tab that
  // comes back from the background refreshes at once, because everything it
  // was holding has gone stale in the meantime.
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLoadAtRef.current > 10_000) {
        void load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Between sweeps, keep moving aircraft forward along their tracks.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      rebuild();
      if (earlierRef.current) refreshEarlier();
      // Everything expired and nothing is on its way: ask again now.
      if (
        sightingsRef.current.size === 0 &&
        !loadingRef.current &&
        Date.now() - lastLoadAtRef.current > 10_000
      ) {
        void load();
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      if (redrawTimerRef.current !== null) clearTimeout(redrawTimerRef.current);
    };
  }, [rebuild, load, refreshEarlier]);

  // The conflict check runs in a worker. If a worker cannot start, it runs here.
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./conflict/worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("message", (event: MessageEvent<DetectResponse>) => {
        const { id, conflicts: found, ms, checked } = event.data;
        // Ignore answers to questions that have since been replaced.
        if (id !== requestIdRef.current) return;
        perfStats.detectMs = ms;
        perfStats.checked = checked;
        setConflicts(found);
        setTiming({ detectMs: ms, checked });
      });
    } catch {
      worker = null;
    }
    workerRef.current = worker;
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const id = ++requestIdRef.current;
    const worker = workerRef.current;
    // Aircraft below the floor are drawn but left out of the check.
    const candidates =
      checkFloorFt > 0
        ? aircraft.filter(
            (ac) => ac.altitudeFt !== null && ac.altitudeFt >= checkFloorFt,
          )
        : aircraft;
    if (worker) {
      const request: DetectRequest = { id, aircraft: candidates, thresholds };
      worker.postMessage(request);
      return;
    }
    const timer = setTimeout(() => {
      const startedAt = performance.now();
      const found = detectConflictsRegional(candidates, thresholds);
      const ms = performance.now() - startedAt;
      perfStats.detectMs = ms;
      perfStats.checked = candidates.length;
      setConflicts(found);
      setTiming({ detectMs: ms, checked: candidates.length });
    }, 0);
    return () => clearTimeout(timer);
  }, [aircraft, thresholds, checkFloorFt]);

  return {
    aircraft,
    conflicts,
    ...meta,
    ...timing,
    earlier,
    refresh: load,
  };
}
