"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type RefObject } from "react";
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

/**
 * Keeps the map position in the address bar as #zoom/lat/lon, so a view can
 * be shared as a link. Reading it happens once, in `readHashView`.
 */
function HashSync() {
  const map = useMap();
  useEffect(() => {
    const write = () => {
      const c = map.getCenter();
      const hash = `#${map.getZoom()}/${c.lat.toFixed(3)}/${c.lng.toFixed(3)}`;
      window.history.replaceState(null, "", hash);
    };
    map.on("moveend", write);
    return () => {
      map.off("moveend", write);
    };
  }, [map]);
  return null;
}

/** A shared view from the address bar, if it holds a valid one. */
function readHashView(): { center: [number, number]; zoom: number } | null {
  if (typeof window === "undefined") return null;
  const match = /^#(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(
    window.location.hash,
  );
  if (!match) return null;
  const zoom = Number(match[1]);
  const lat = Number(match[2]);
  const lon = Number(match[3]);
  if (zoom < 3 || zoom > 14 || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { center: [lat, lon], zoom };
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
  // A link can open the map on a shared view. Read once, when the map mounts.
  const [shared] = useState(readHashView);
  // True once a person, a selection, or a shared link has placed the map.
  const touchedRef = useRef(shared !== null);
  return (
    <MapContainer
      {...(shared
        ? { center: shared.center, zoom: shared.zoom }
        : { bounds: CONUS_BOUNDS })}
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
      <HashSync />
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
