"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { pairKey } from "@/lib/conflict";
import {
  DEMO_DEFAULT_THRESHOLDS,
  type Aircraft,
  type ConflictThresholds,
} from "@/lib/types";
import { useLiveTraffic } from "@/lib/useLiveTraffic";
import FeedBanner from "./FeedBanner";
import {
  ALT_FILTER_MAX_FT,
  DEFAULT_FILTERS,
  type DisplayFilters,
} from "./Filters";
import MapLegend from "./MapLegend";
import type { MapFocus } from "./MapView";
import Sidebar from "./Sidebar";
import StoryPanel from "./StoryPanel";

// Leaflet needs the browser, so the map is loaded on the client only.
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <MapNotice>Loading map</MapNotice>,
});

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
  if (ac.altitudeFt === null) return false;
  return ac.altitudeFt >= filters.altMinFt && ac.altitudeFt <= filters.altMaxFt;
}

export default function AppShell() {
  const [thresholds, setThresholds] = useState<ConflictThresholds>(
    DEMO_DEFAULT_THRESHOLDS,
  );
  const [filters, setFilters] = useState<DisplayFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);

  // Real traffic only. When the feed fails, the map shows no aircraft and
  // says so. Simulated traffic is never substituted.
  const traffic = useLiveTraffic(thresholds);
  const { aircraft, conflicts } = traffic;

  const byId = useMemo(
    () => new Map(aircraft.map((ac) => [ac.icao24, ac])),
    [aircraft],
  );

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pair of conflicts) {
      ids.add(pair.a);
      ids.add(pair.b);
    }
    return ids;
  }, [conflicts]);

  // Conflicts are checked across all traffic. Filters only narrow what is
  // drawn and listed, and never hide an aircraft in a flagged pair.
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

  const firstLoad = traffic.phase === "loading";

  return (
    <>
      {traffic.error ? <FeedBanner message={traffic.error} /> : null}
      <main className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,55%)_minmax(0,45%)] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
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
            onClearSelection={handleClearSelection}
          />
          <MapLegend />
          {traffic.error ? (
            <MapNotice>
              Live traffic is unavailable, so no aircraft are shown. Retrying
              automatically.
            </MapNotice>
          ) : firstLoad ? (
            <MapNotice>
              {traffic.regionsTotal > 0
                ? `Loading live traffic: ${traffic.regionsDone} of ${traffic.regionsTotal} regions`
                : "Loading live traffic"}
            </MapNotice>
          ) : aircraft.length === 0 ? (
            <MapNotice>The feed reported no airborne aircraft right now.</MapNotice>
          ) : null}
        </div>
        <Sidebar
          traffic={traffic}
          conflicts={conflicts}
          byId={byId}
          conflictIds={conflictIds}
          visibleAircraft={visibleAircraft}
          totalAircraft={aircraft.length}
          selected={selected}
          selectedPairKey={selectedPairKey}
          onSelectAircraft={handleSelectFromList}
          onSelectPair={handleSelectPair}
          onOpenStory={() => setStoryOpen(true)}
          filters={filters}
          thresholds={thresholds}
          onFiltersChange={setFilters}
          onThresholdsChange={setThresholds}
        />
        <StoryPanel open={storyOpen} onOpenChange={setStoryOpen} />
      </main>
    </>
  );
}
