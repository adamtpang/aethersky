"use client";

import L from "leaflet";
import { useMemo, useState } from "react";
import { Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import {
  escapeHtml,
  fmtAltitude,
  fmtHeading,
  fmtSpeed,
  fmtVerticalRate,
} from "@/lib/format";
import { VECTOR_SECONDS, projectAhead } from "@/lib/geo";
import type { Aircraft } from "@/lib/types";

type LabelDetail = "full" | "name" | "none";

interface AircraftLayerProps {
  aircraft: Aircraft[];
  conflictIds: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (icao24: string) => void;
}

const ACCENT = "#7eb6d6";
const WARN = "#f5b942";

function glyph(ac: Aircraft): string {
  if (ac.headingDeg === null) {
    // No track available: draw a neutral dot instead of a pointed glyph.
    return '<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="6" fill="currentColor" stroke="#0b0d10" stroke-width="1.5"/></svg>';
  }
  const rotation = Math.round(ac.headingDeg * 10) / 10;
  return `<svg viewBox="0 0 28 28" aria-hidden="true" style="transform:rotate(${rotation}deg)"><path d="M14 3 L21.5 24 L14 19.5 L6.5 24 Z" fill="currentColor" stroke="#0b0d10" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function label(ac: Aircraft, detail: LabelDetail): string {
  if (detail === "none") return "";
  const name = `<b>${escapeHtml(ac.callsign)}</b>`;
  // Put the label behind the aircraft so it does not cover the track ahead:
  // on the left for eastbound traffic, on the right otherwise.
  const eastbound =
    ac.headingDeg !== null && ac.headingDeg % 360 > 0 && ac.headingDeg % 360 < 180;
  const open = `<div class="ac__label${eastbound ? " ac__label--left" : ""}">`;
  if (detail === "name") return `${open}${name}</div>`;
  const line2 = ac.onGround
    ? "on ground"
    : `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`;
  const line3 = `${fmtHeading(ac.headingDeg)} · ${fmtVerticalRate(ac.verticalRateFpm)}`;
  return `${open}${name}<span>${escapeHtml(line2)}</span><span>${escapeHtml(line3)}</span></div>`;
}

function makeIcon(
  ac: Aircraft,
  detail: LabelDetail,
  inConflict: boolean,
  selected: boolean,
): L.DivIcon {
  const classes = ["ac"];
  if (ac.onGround) classes.push("ac--ground");
  if (inConflict) classes.push("ac--conflict");
  if (selected) classes.push("ac--selected");
  return L.divIcon({
    className: "ac-marker",
    html: `<div class="${classes.join(" ")}">${glyph(ac)}${label(ac, detail)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Rotating aircraft markers, labels, and 60 s velocity vectors. */
export default function AircraftLayer({
  aircraft,
  conflictIds,
  selectedId,
  onSelect,
}: AircraftLayerProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const baseDetail: LabelDetail =
    zoom >= 8 && aircraft.length <= 80 ? "full" : zoom >= 7 ? "name" : "none";

  const items = useMemo(
    () =>
      aircraft.map((ac) => {
        const inConflict = conflictIds.has(ac.icao24);
        const selected = ac.icao24 === selectedId;
        const detail = inConflict || selected ? "full" : baseDetail;
        return {
          ac,
          inConflict,
          selected,
          icon: makeIcon(ac, detail, inConflict, selected),
          vectorEnd: ac.onGround ? null : projectAhead(ac, VECTOR_SECONDS),
        };
      }),
    [aircraft, conflictIds, selectedId, baseDetail],
  );

  return (
    <>
      {items.map(({ ac, inConflict, vectorEnd }) =>
        vectorEnd ? (
          <Polyline
            key={`v-${ac.icao24}`}
            positions={[[ac.latitude, ac.longitude], vectorEnd]}
            pathOptions={{
              color: inConflict ? WARN : ACCENT,
              weight: 1.5,
              opacity: 0.9,
            }}
            interactive={false}
          />
        ) : null,
      )}
      {items.map(({ ac, inConflict, selected, icon }) => (
        <Marker
          key={ac.icao24}
          position={[ac.latitude, ac.longitude]}
          icon={icon}
          title={ac.callsign}
          alt={`Aircraft ${ac.callsign}`}
          zIndexOffset={selected ? 2000 : inConflict ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(ac.icao24) }}
        />
      ))}
    </>
  );
}
