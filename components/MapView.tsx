"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, type RefObject } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { CONUS_BOUNDS } from "@/lib/geo";
import type { Aircraft, ConflictPair } from "@/lib/types";
import TrafficCanvas from "./TrafficCanvas";

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
  onClearSelection: () => void;
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
      if (!touchedRef.current) map.fitBounds(CONUS_BOUNDS, { animate: false });
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
      map.flyTo(focus.points[0], Math.max(map.getZoom(), 9), { duration: 0.6 });
    } else {
      map.flyToBounds(focus.points, {
        padding: [110, 110],
        maxZoom: 11,
        duration: 0.6,
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
  onClearSelection,
}: MapViewProps) {
  // True once a person or a selection has moved the map.
  const touchedRef = useRef(false);
  return (
    <MapContainer
      bounds={CONUS_BOUNDS}
      minZoom={3}
      maxZoom={14}
      worldCopyJump
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <SizeWatcher touchedRef={touchedRef} />
      <FocusController focus={focus} touchedRef={touchedRef} />
      <TrafficCanvas
        aircraft={aircraft}
        byId={byId}
        conflicts={conflicts}
        conflictIds={conflictIds}
        selectedId={selectedId}
        selectedPairKey={selectedPairKey}
        onSelectAircraft={onSelectAircraft}
        onClearSelection={onClearSelection}
      />
    </MapContainer>
  );
}
