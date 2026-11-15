"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectConflicts, pairKey } from "@/lib/conflict";
import { DEFAULT_BBOX, clampBbox, type ViewBounds } from "@/lib/geo";
import {
  DEMO_DEFAULT_THRESHOLDS,
  type Aircraft,
  type AircraftFeed,
  type BoundingBox,
  type ConflictThresholds,
} from "@/lib/types";
import {
  ALT_FILTER_MAX_FT,
  DEFAULT_FILTERS,
  type DisplayFilters,
} from "./Filters";
import type { MapFocus } from "./MapView";
import FeedBanner from "./FeedBanner";
import Sidebar from "./Sidebar";

// Leaflet needs the browser, so the map is loaded on the client only.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <MapNotice>Loading map</MapNotice>,
});

/**
 * Live poll interval. OpenSky anonymous resolution is 10 seconds and the
 * server caches for 10 seconds, so polling faster would only waste credits.
 */
const LIVE_POLL_MS = 15_000;

const NO_AIRCRAFT: Aircraft[] = [];

function MapNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-3">
      <p className="rounded-md border border-line bg-panel/95 px-3 py-1.5 text-[13px] text-fg shadow-lg">
        {children}
      </p>
    </div>
  );
}

function matchesFilters(ac: Aircraft, filters: DisplayFilters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (
    query &&
    !ac.callsign.toLowerCase().includes(query) &&
    !ac.icao24.toLowerCase().includes(query)
  ) {
    return false;
  }
  const bandIsOpen =
    filters.altMinFt <= 0 && filters.altMaxFt >= ALT_FILTER_MAX_FT;
  if (bandIsOpen) return true;
  // With a narrowed band, aircraft with no usable altitude are hidden.
  if (ac.onGround || ac.altitudeFt === null) return false;
  return ac.altitudeFt >= filters.altMinFt && ac.altitudeFt <= filters.altMaxFt;
}

export default function AppShell() {
  // Real traffic only. When no live feed answers, the map shows no aircraft
  // and says so. Simulated traffic is never substituted.
  const [feed, setFeed] = useState<AircraftFeed | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState<ConflictThresholds>(
    DEMO_DEFAULT_THRESHOLDS,
  );
  const [filters, setFilters] = useState<DisplayFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const bboxRef = useRef<BoundingBox>(DEFAULT_BBOX);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    const bbox = bboxRef.current;
    const params = new URLSearchParams({
      lamin: bbox.lamin.toFixed(2),
      lomin: bbox.lomin.toFixed(2),
      lamax: bbox.lamax.toFixed(2),
      lomax: bbox.lomax.toFixed(2),
    });
    let next: AircraftFeed | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(`/api/aircraft?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as Partial<AircraftFeed> & { error?: string };
      if (res.ok && data && Array.isArray(data.aircraft)) {
        next = data as AircraftFeed;
      } else {
        error = data?.error ?? `The aircraft service answered with status ${res.status}.`;
      }
    } catch {
      error = "The aircraft service could not be reached.";
    }
    if (seq !== requestSeq.current) return;
    // On failure the old picture is dropped. Stale traffic is not shown.
    setFeed(next);
    setFeedError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const aircraft = feed?.aircraft ?? NO_AIRCRAFT;

  const byId = useMemo(
    () => new Map(aircraft.map((ac) => [ac.icao24, ac])),
    [aircraft],
  );

  // Conflicts are always checked across all traffic, never the filtered view.
  const conflicts = useMemo(
    () =>
      detectConflicts(aircraft, thresholds),
    [aircraft, thresholds],
  );

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pair of conflicts) {
      ids.add(pair.a);
      ids.add(pair.b);
    }
    return ids;
  }, [conflicts]);

  const visibleAircraft = useMemo(
    () =>
      aircraft.filter(
        (ac) => conflictIds.has(ac.icao24) || matchesFilters(ac, filters),
      ),
    [aircraft, conflictIds, filters],
  );

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const selectedPairKey =
    selectedPair && conflicts.some((c) => pairKey(c) === selectedPair)
      ? selectedPair
      : null;

  // A selected aircraft is always drawn, even when a filter would hide it.
  const mapAircraft = useMemo(
    () =>
      selected && !visibleAircraft.includes(selected)
        ? [...visibleAircraft, selected]
        : visibleAircraft,
    [visibleAircraft, selected],
  );

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleSelectAircraft = useCallback((icao24: string) => {
    setSelectedId(icao24);
    setSelectedPair(null);
  }, []);

  const handleSelectFromList = useCallback(
    (icao24: string) => {
      setSelectedId(icao24);
      setSelectedPair(null);
      const ac = byId.get(icao24);
      if (ac) {
        setFocus((prev) => ({
          points: [[ac.latitude, ac.longitude]],
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    },
    [byId],
  );

  const handleSelectPair = useCallback(
    (key: string) => {
      const pair = conflicts.find((c) => pairKey(c) === key);
      if (!pair) return;
      setSelectedPair(key);
      setSelectedId(pair.a);
      const a = byId.get(pair.a);
      const b = byId.get(pair.b);
      if (a && b) {
        setFocus((prev) => ({
          points: [
            [a.latitude, a.longitude],
            [b.latitude, b.longitude],
          ],
          seq: (prev?.seq ?? 0) + 1,
        }));
      }
    },
    [conflicts, byId],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedPair(null);
  }, []);

  const handleBoundsChange = useCallback((bounds: ViewBounds) => {
    bboxRef.current = clampBbox(bounds);
  }, []);

  return (
    <>
      {feedError ? <FeedBanner message={feedError} /> : null}
      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,55%)_minmax(0,45%)] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
        <div className="relative min-h-0 bg-bg">
          <MapView
            aircraft={mapAircraft}
            byId={byId}
            conflicts={conflicts}
            conflictIds={conflictIds}
            selectedId={selected?.icao24 ?? null}
            selectedPairKey={selectedPairKey}
            focus={focus}
            onSelectAircraft={handleSelectAircraft}
            onSelectPair={handleSelectPair}
            onClearSelection={handleClearSelection}
            onBoundsChange={handleBoundsChange}
          />
          {feedError ? (
            <MapNotice>
              Live traffic is unavailable, so no aircraft are shown. Retrying
              automatically.
            </MapNotice>
          ) : !feed ? (
            <MapNotice>Loading live traffic</MapNotice>
          ) : aircraft.length === 0 ? (
            <MapNotice>
              No aircraft reported in this area right now. Pan or zoom the map.
            </MapNotice>
          ) : null}
        </div>
        <Sidebar
          feed={feed}
          feedError={feedError}
          loading={loading}
          onRefresh={handleRefresh}
          conflicts={conflicts}
          byId={byId}
          conflictIds={conflictIds}
          visibleAircraft={visibleAircraft}
          totalAircraft={aircraft.length}
          selected={selected}
          selectedPairKey={selectedPairKey}
          onSelectAircraft={handleSelectFromList}
          onSelectPair={handleSelectPair}
          filters={filters}
          thresholds={thresholds}
          onFiltersChange={setFilters}
          onThresholdsChange={setThresholds}
        />
      </main>
    </>
  );
}
