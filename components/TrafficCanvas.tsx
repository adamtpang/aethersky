"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { pairKey } from "@/lib/conflict";
import {
  fmtAltitude,
  fmtFeet,
  fmtHeading,
  fmtNm,
  fmtSpeed,
  fmtTcpa,
  fmtVerticalRate,
} from "@/lib/format";
import { VECTOR_SECONDS, projectAhead } from "@/lib/geo";
import type { Aircraft, ConflictPair } from "@/lib/types";

interface TrafficCanvasProps {
  aircraft: Aircraft[];
  byId: ReadonlyMap<string, Aircraft>;
  conflicts: ConflictPair[];
  conflictIds: ReadonlySet<string>;
  selectedId: string | null;
  selectedPairKey: string | null;
  onSelectAircraft: (icao24: string) => void;
  onClearSelection: () => void;
}

const ACCENT = "#7eb6d6";
const WARN = "#f5b942";
const DANGER = "#ff6b5e";
const FG = "#e8eaed";
const MUTED = "#9aa3ad";
const LABEL_BG = "rgba(11, 13, 16, 0.86)";
const FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** How close a click must be to an aircraft to select it, in pixels. */
const HIT_RADIUS_PX = 14;
/** Most name labels drawn at once, so a busy view stays readable. */
const MAX_LABELS = 140;

const glyphSize = (zoom: number): number =>
  zoom <= 4 ? 3 : zoom === 5 ? 4 : zoom === 6 ? 5 : zoom === 7 ? 6 : 8;

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  headingDeg: number | null,
) {
  if (headingDeg === null) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const a = (headingDeg * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  // A dart pointing along the track: nose, right tail, notch, left tail.
  const pts: [number, number][] = [
    [0, -size * 1.25],
    [size * 0.8, size],
    [0, size * 0.5],
    [-size * 0.8, size],
  ];
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const rx = x + px * cos - py * sin;
    const ry = y + px * sin + py * cos;
    if (i === 0) ctx.moveTo(rx, ry);
    else ctx.lineTo(rx, ry);
  });
  ctx.closePath();
  ctx.fill();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  nameColor: string,
  border: string,
) {
  ctx.font = FONT;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10;
  const height = lines.length * 14 + 5;
  const left = x + 12;
  const top = y - height / 2;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? nameColor : MUTED;
    ctx.fillText(line, left + 5, top + 13 + i * 14);
  });
}

/**
 * Every aircraft, vector, flagged pair, and label on one canvas. Thousands
 * of DOM markers would stall the page, so nothing here is an element.
 */
export default function TrafficCanvas({
  aircraft,
  byId,
  conflicts,
  conflictIds,
  selectedId,
  selectedPairKey,
  onSelectAircraft,
  onClearSelection,
}: TrafficCanvasProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<() => void>(() => {});

  // One canvas over the map for the life of the map.
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      zIndex: "450",
      pointerEvents: "none",
    });
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const redraw = () => drawRef.current();
    const hide = () => {
      canvas.style.visibility = "hidden";
    };
    const show = () => {
      canvas.style.visibility = "visible";
      redraw();
    };
    map.on("move", redraw);
    map.on("resize", redraw);
    // Leaflet animates zoom by scaling its own layers. Hide ours meanwhile.
    map.on("zoomstart", hide);
    map.on("zoomend", show);
    return () => {
      map.off("move", redraw);
      map.off("resize", redraw);
      map.off("zoomstart", hide);
      map.off("zoomend", show);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  // Draw whenever the data or the selection changes.
  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
        canvas.width = size.x * dpr;
        canvas.height = size.y * dpr;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = map.getZoom();
      const bounds = map.getBounds().pad(0.05);
      const point = (lat: number, lon: number) =>
        map.latLngToContainerPoint([lat, lon]);
      const inView = aircraft.filter((ac) =>
        bounds.contains([ac.latitude, ac.longitude]),
      );
      const s = glyphSize(zoom);

      // Velocity vectors, once they are long enough to see.
      if (zoom >= 8) {
        ctx.lineWidth = 1.25;
        for (const ac of inView) {
          const end = projectAhead(ac, VECTOR_SECONDS);
          if (!end) continue;
          const a = point(ac.latitude, ac.longitude);
          const b = point(end[0], end[1]);
          ctx.strokeStyle = conflictIds.has(ac.icao24) ? WARN : ACCENT;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Unflagged traffic first, so flagged traffic sits on top.
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = zoom <= 5 ? 0.75 : 0.95;
      for (const ac of inView) {
        if (conflictIds.has(ac.icao24)) continue;
        const p = point(ac.latitude, ac.longitude);
        drawGlyph(ctx, p.x, p.y, s, ac.headingDeg);
      }
      ctx.globalAlpha = 1;

      // Flagged pairs: a line between them, and a ring so they show from far out.
      for (const pair of conflicts) {
        const a = byId.get(pair.a);
        const b = byId.get(pair.b);
        if (!a || !b) continue;
        if (
          !bounds.contains([a.latitude, a.longitude]) &&
          !bounds.contains([b.latitude, b.longitude])
        ) {
          continue;
        }
        const selected = pairKey(pair) === selectedPairKey;
        const pa = point(a.latitude, a.longitude);
        const pb = point(b.latitude, b.longitude);
        ctx.strokeStyle = selected ? DANGER : WARN;
        ctx.lineWidth = selected ? 3 : 1.75;
        ctx.setLineDash(selected ? [] : [6, 5]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (zoom < 8 || selected) {
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          const r = Math.max(7, Math.hypot(pa.x - pb.x, pa.y - pb.y) / 2 + 6);
          ctx.lineWidth = selected ? 2.5 : 1.25;
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (selected) {
          const text = `CPA ${fmtTcpa(pair.tcpaSec)} · ${fmtNm(pair.dcpaNm)} · ${fmtFeet(pair.verticalAtTcpaFt)}`;
          drawLabel(ctx, (pa.x + pb.x) / 2 - 12, (pa.y + pb.y) / 2 + 26, [text], FG, DANGER);
        }
      }

      ctx.fillStyle = WARN;
      for (const ac of inView) {
        if (!conflictIds.has(ac.icao24)) continue;
        const p = point(ac.latitude, ac.longitude);
        drawGlyph(ctx, p.x, p.y, Math.max(s, 5), ac.headingDeg);
      }

      // Name labels when zoomed in far enough for them to fit.
      if (zoom >= 9 && inView.length <= MAX_LABELS) {
        for (const ac of inView) {
          if (ac.icao24 === selectedId) continue;
          const p = point(ac.latitude, ac.longitude);
          const flagged = conflictIds.has(ac.icao24);
          drawLabel(
            ctx,
            p.x,
            p.y,
            zoom >= 10
              ? [ac.callsign, `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`]
              : [ac.callsign],
            flagged ? WARN : FG,
            flagged ? "rgba(245, 185, 66, 0.6)" : "#262c35",
          );
        }
      }

      // The selected aircraft always gets a ring and a full label.
      const selected = selectedId ? byId.get(selectedId) : undefined;
      if (selected) {
        const p = point(selected.latitude, selected.longitude);
        ctx.strokeStyle = FG;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(s, 5) + 7, 0, Math.PI * 2);
        ctx.stroke();
        const flagged = conflictIds.has(selected.icao24);
        ctx.fillStyle = flagged ? WARN : ACCENT;
        drawGlyph(ctx, p.x, p.y, Math.max(s, 6), selected.headingDeg);
        drawLabel(
          ctx,
          p.x + 8,
          p.y,
          [
            selected.callsign,
            `${fmtAltitude(selected.altitudeFt)} · ${fmtSpeed(selected.groundSpeedKt)}`,
            `${fmtHeading(selected.headingDeg)} · ${fmtVerticalRate(selected.verticalRateFpm)}`,
          ],
          flagged ? WARN : FG,
          FG,
        );
      }
    };
    drawRef.current();
  }, [map, aircraft, byId, conflicts, conflictIds, selectedId, selectedPairKey]);

  // A click selects the nearest aircraft, or clears the selection.
  useEffect(() => {
    const onClick = (event: { containerPoint: { x: number; y: number } }) => {
      const { x, y } = event.containerPoint;
      let best: Aircraft | null = null;
      let bestDistance = HIT_RADIUS_PX;
      for (const ac of aircraft) {
        const p = map.latLngToContainerPoint([ac.latitude, ac.longitude]);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDistance) {
          best = ac;
          bestDistance = d;
        }
      }
      if (best) onSelectAircraft(best.icao24);
      else onClearSelection();
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, aircraft, onSelectAircraft, onClearSelection]);

  return null;
}
