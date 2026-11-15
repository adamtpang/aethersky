"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { DEFAULT_BBOX, type ViewBounds } from "@/lib/geo";
import type { Aircraft, ConflictPair } from "@/lib/types";
import AircraftLayer from "./AircraftLayer";
import ConflictLayer from "./ConflictLayer";

export interface MapFocus {
  points: [number, number][];
  seq: number;
}

interface MapViewProps {
  aircraft: Aircraft[];
  byId: ReadonlyMap<string, Aircraft>;
  conflicts: ConflictPair[];
  conflictIds: ReadonlySet<string>;
  selectedId: string | null;
  selectedPairKey: string | null;
  focus: MapFocus | null;
  onSelectAircraft: (icao24: string) => void;
  onSelectPair: (key: string) => void;
  onClearSelection: () => void;
  onBoundsChange: (bounds: ViewBounds) => void;
}

const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [DEFAULT_BBOX.lamin, DEFAULT_BBOX.lomin],
  [DEFAULT_BBOX.lamax, DEFAULT_BBOX.lomax],
];

function ViewReporter({
  onBoundsChange,
  onClearSelection,
}: Pick<MapViewProps, "onBoundsChange" | "onClearSelection">) {
  const map = useMap();
  const report = useCallback(() => {
    const b = map.getBounds();
    onBoundsChange({
      south: b.getSouth(),
      west: b.getWest(),
      north: b.getNorth(),
      east: b.getEast(),
    });
  }, [map, onBoundsChange]);
  useMapEvents({
    moveend: report,
    click: onClearSelection,
  });
  useEffect(() => {
    report();
  }, [report]);
  return null;
}

/**
 * Keep Leaflet in step with the layout when the map container resizes. Until
 * someone moves the map, a resize also refits the first view, so a map that
 * was created while the layout was still settling does not stay zoomed out.
 */
function SizeWatcher({ touchedRef }: { touchedRef: RefObject<boolean> }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const markTouched = () => {
      touchedRef.current = true;
    };
    const events = ["pointerdown", "wheel", "keydown"] as const;
    for (const name of events) {
      container.addEventListener(name, markTouched, { passive: true });
    }
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      if (!touchedRef.current) map.fitBounds(INITIAL_BOUNDS, { animate: false });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      for (const name of events) {
        container.removeEventListener(name, markTouched);
      }
    };
  }, [map, touchedRef]);
  return null;
}

function FocusController({
  focus,
  touchedRef,
}: {
  focus: MapFocus | null;
  touchedRef: RefObject<boolean>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus || focus.points.length === 0) return;
    touchedRef.current = true;
    if (focus.points.length === 1) {
      map.flyTo(focus.points[0], Math.max(map.getZoom(), 9), { duration: 0.5 });
    } else {
      map.flyToBounds(focus.points, {
        padding: [90, 90],
        maxZoom: 11,
        duration: 0.5,
      });
    }
  }, [focus, map, touchedRef]);
  return null;
}

/** Leaflet map on default OpenStreetMap tiles. No Mapbox, no paid tiles. */
export default function MapView({
  aircraft,
  byId,
  conflicts,
  conflictIds,
  selectedId,
  selectedPairKey,
  focus,
  onSelectAircraft,
  onSelectPair,
  onClearSelection,
  onBoundsChange,
}: MapViewProps) {
  // True once a person or a selection has moved the map.
  const touchedRef = useRef(false);
  return (
    <MapContainer
      bounds={INITIAL_BOUNDS}
      minZoom={4}
      maxZoom={14}
      worldCopyJump
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ViewReporter
        onBoundsChange={onBoundsChange}
        onClearSelection={onClearSelection}
      />
      <SizeWatcher touchedRef={touchedRef} />
      <FocusController focus={focus} touchedRef={touchedRef} />
      <ConflictLayer
        conflicts={conflicts}
        byId={byId}
        selectedPairKey={selectedPairKey}
        onSelectPair={onSelectPair}
      />
      <AircraftLayer
        aircraft={aircraft}
        conflictIds={conflictIds}
        selectedId={selectedId}
        onSelect={onSelectAircraft}
      />
    </MapContainer>
  );
}
