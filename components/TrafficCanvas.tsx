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
import { perfStats } from "@/lib/perf";
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
const DEG = Math.PI / 180;

const glyphSize = (zoom: number): number =>
  zoom <= 4 ? 3 : zoom === 5 ? 4 : zoom === 6 ? 5 : zoom === 7 ? 6 : 8;

/** Web Mercator, as a fraction of the world from 0 to 1. */
const mercX = (lon: number): number => (lon + 180) / 360;
const mercY = (lat: number): number => {
  const s = Math.sin(lat * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/** Add one aircraft glyph to the current path. Nothing is filled here. */
function addGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  headingDeg: number | null,
) {
  if (headingDeg === null) {
    const r = size * 0.55;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const a = headingDeg * DEG;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  // A dart pointing along the track: nose, right tail, notch, left tail.
  const nose = -size * 1.25;
  const wing = size * 0.8;
  const notch = size * 0.5;
  ctx.moveTo(x - nose * sin, y + nose * cos);
  ctx.lineTo(x + wing * cos - size * sin, y + wing * sin + size * cos);
  ctx.lineTo(x - notch * sin, y + notch * cos);
  ctx.lineTo(x - wing * cos - size * sin, y - wing * sin + size * cos);
  ctx.closePath();
}

/** Headings are drawn in steps of this many degrees. */
const HEADING_STEP_DEG = 10;
const HEADING_SLOTS = 360 / HEADING_STEP_DEG;

interface SpriteSheet {
  image: HTMLCanvasElement;
  /** Side of one sprite cell, in CSS pixels. */
  cell: number;
  /** Side of one sprite cell, in device pixels. */
  cellPx: number;
}

const spriteCache = new Map<string, SpriteSheet>();

/**
 * One small picture of the glyph per heading step, drawn once and reused.
 * Stamping a ready picture is far cheaper than tracing a shape for each of
 * several thousand aircraft on every frame.
 */
function spritesFor(size: number, color: string, dpr: number): SpriteSheet {
  const key = `${size}|${color}|${dpr}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const cell = Math.ceil(size * 2.6) + 2;
  const cellPx = Math.ceil(cell * dpr);
  const image = document.createElement("canvas");
  image.width = cellPx * (HEADING_SLOTS + 1);
  image.height = cellPx;
  const ctx = image.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    for (let slot = 0; slot <= HEADING_SLOTS; slot++) {
      ctx.setTransform(dpr, 0, 0, dpr, slot * cellPx, 0);
      ctx.beginPath();
      // The last slot is the dot used when no heading is known.
      addGlyph(ctx, cell / 2, cell / 2, size, slot === HEADING_SLOTS ? null : slot * HEADING_STEP_DEG);
      ctx.fill();
    }
  }
  const sheet = { image, cell, cellPx };
  spriteCache.set(key, sheet);
  return sheet;
}

const headingSlot = (headingDeg: number | null): number =>
  headingDeg === null
    ? HEADING_SLOTS
    : ((Math.round(headingDeg / HEADING_STEP_DEG) % HEADING_SLOTS) + HEADING_SLOTS) % HEADING_SLOTS;

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  nameColor: string,
  border: string,
) {
  ctx.font = FONT;
  let width = 0;
  for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
  width += 10;
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
 *
 * Built for speed: positions are turned into map fractions once per data
 * update, a frame only does arithmetic on them, and each aircraft is a
 * stamp of a ready-made glyph instead of a shape traced from scratch.
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
  const frameRef = useRef<number | null>(null);

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

    // Many move events can arrive between two frames. Draw once per frame.
    const redraw = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        drawRef.current();
      });
    };
    const hide = () => {
      canvas.style.visibility = "hidden";
    };
    const show = () => {
      canvas.style.visibility = "visible";
      drawRef.current();
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
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  }, [map]);

  // Draw whenever the data or the selection changes.
  useEffect(() => {
    // Done once per data update, not once per frame.
    const n = aircraft.length;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const flagged = new Uint8Array(n);
    const slots = new Uint8Array(n);
    const indexOf = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const ac = aircraft[i];
      xs[i] = mercX(ac.longitude);
      ys[i] = mercY(ac.latitude);
      flagged[i] = conflictIds.has(ac.icao24) ? 1 : 0;
      slots[i] = headingSlot(ac.headingDeg);
      indexOf.set(ac.icao24, i);
    }

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
      const drawStartedAt = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);

      const zoom = map.getZoom();
      const scale = 256 * 2 ** zoom;
      // World pixel of the top-left corner of the view.
      const corner = map.project(map.containerPointToLatLng([0, 0]), zoom);
      const ox = corner.x;
      const oy = corner.y;
      const w = size.x;
      const h = size.y;
      const pad = 24;
      const s = glyphSize(zoom);

      const px = (i: number) => xs[i] * scale - ox;
      const py = (i: number) => ys[i] * scale - oy;
      const visible = (x: number, y: number) =>
        x > -pad && x < w + pad && y > -pad && y < h + pad;

      // Velocity vectors, once they are long enough to see.
      if (zoom >= 8) {
        for (const pass of [0, 1]) {
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            if (flagged[i] !== pass) continue;
            const x = px(i);
            const y = py(i);
            if (!visible(x, y)) continue;
            const end = projectAhead(aircraft[i], VECTOR_SECONDS);
            if (!end) continue;
            ctx.moveTo(x, y);
            ctx.lineTo(mercX(end[1]) * scale - ox, mercY(end[0]) * scale - oy);
          }
          ctx.strokeStyle = pass ? WARN : ACCENT;
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1.25;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Unflagged traffic: stamp a ready-made glyph for each aircraft.
      let inView = 0;
      const plain = spritesFor(s, ACCENT, dpr);
      const half = plain.cell / 2;
      ctx.globalAlpha = zoom <= 5 ? 0.75 : 0.95;
      for (let i = 0; i < n; i++) {
        const x = px(i);
        const y = py(i);
        if (!visible(x, y)) continue;
        inView++;
        if (flagged[i]) continue;
        ctx.drawImage(
          plain.image,
          slots[i] * plain.cellPx,
          0,
          plain.cellPx,
          plain.cellPx,
          x - half,
          y - half,
          plain.cell,
          plain.cell,
        );
      }
      ctx.globalAlpha = 1;

      // Flagged pairs: lines in one path, rings in another.
      const far = zoom < 8;
      let selectedPair: ConflictPair | null = null;
      ctx.beginPath();
      const rings: [number, number, number][] = [];
      for (const pair of conflicts) {
        const ia = indexOf.get(pair.a);
        const ib = indexOf.get(pair.b);
        if (ia === undefined || ib === undefined) continue;
        const ax = px(ia);
        const ay = py(ia);
        const bx = px(ib);
        const by = py(ib);
        if (!visible(ax, ay) && !visible(bx, by)) continue;
        if (pairKey(pair) === selectedPairKey) {
          selectedPair = pair;
          continue;
        }
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        if (far) {
          rings.push([
            (ax + bx) / 2,
            (ay + by) / 2,
            Math.max(7, Math.hypot(ax - bx, ay - by) / 2 + 6),
          ]);
        }
      }
      ctx.strokeStyle = WARN;
      ctx.lineWidth = 1.75;
      // From far out the lines are a few pixels long. Dashes only cost time.
      if (!far) ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (rings.length > 0) {
        ctx.beginPath();
        for (const [x, y, r] of rings) {
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // Flagged traffic on top.
      const hot = spritesFor(Math.max(s, 5), WARN, dpr);
      const hotHalf = hot.cell / 2;
      for (let i = 0; i < n; i++) {
        if (!flagged[i]) continue;
        const x = px(i);
        const y = py(i);
        if (!visible(x, y)) continue;
        ctx.drawImage(
          hot.image,
          slots[i] * hot.cellPx,
          0,
          hot.cellPx,
          hot.cellPx,
          x - hotHalf,
          y - hotHalf,
          hot.cell,
          hot.cell,
        );
      }

      // The selected pair is drawn alone, stronger, with its numbers.
      if (selectedPair) {
        const ia = indexOf.get(selectedPair.a) as number;
        const ib = indexOf.get(selectedPair.b) as number;
        const ax = px(ia);
        const ay = py(ia);
        const bx = px(ib);
        const by = py(ib);
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        ctx.strokeStyle = DANGER;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(9, Math.hypot(ax - bx, ay - by) / 2 + 8), 0, Math.PI * 2);
        ctx.stroke();
        drawLabel(
          ctx,
          mx - 12,
          my + 26,
          [
            `CPA ${fmtTcpa(selectedPair.tcpaSec)} · ${fmtNm(selectedPair.dcpaNm)} · ${fmtFeet(selectedPair.verticalAtTcpaFt)}`,
          ],
          FG,
          DANGER,
        );
      }

      // Name labels when zoomed in far enough for them to fit.
      if (zoom >= 9 && inView <= MAX_LABELS) {
        for (let i = 0; i < n; i++) {
          const ac = aircraft[i];
          if (ac.icao24 === selectedId) continue;
          const x = px(i);
          const y = py(i);
          if (!visible(x, y)) continue;
          drawLabel(
            ctx,
            x,
            y,
            zoom >= 10
              ? [ac.callsign, `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`]
              : [ac.callsign],
            flagged[i] ? WARN : FG,
            flagged[i] ? "rgba(245, 185, 66, 0.6)" : "#262c35",
          );
        }
      }

      // The selected aircraft always gets a ring and a full label.
      const si = selectedId ? indexOf.get(selectedId) : undefined;
      if (si !== undefined) {
        const ac = aircraft[si];
        const x = px(si);
        const y = py(si);
        ctx.strokeStyle = FG;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(s, 5) + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        addGlyph(ctx, x, y, Math.max(s, 6), ac.headingDeg);
        ctx.fillStyle = flagged[si] ? WARN : ACCENT;
        ctx.fill();
        drawLabel(
          ctx,
          x + 8,
          y,
          [
            ac.callsign,
            `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`,
            `${fmtHeading(ac.headingDeg)} · ${fmtVerticalRate(ac.verticalRateFpm)}`,
          ],
          flagged[si] ? WARN : FG,
          FG,
        );
      }

      perfStats.drawMs = performance.now() - drawStartedAt;
    };
    drawRef.current();
  }, [map, aircraft, byId, conflicts, conflictIds, selectedId, selectedPairKey]);

  // A click selects the nearest aircraft, or clears the selection.
  useEffect(() => {
    const onClick = (event: { containerPoint: { x: number; y: number } }) => {
      const { x, y } = event.containerPoint;
      const zoom = map.getZoom();
      const scale = 256 * 2 ** zoom;
      const corner = map.project(map.containerPointToLatLng([0, 0]), zoom);
      let best: Aircraft | null = null;
      let bestDistance = HIT_RADIUS_PX;
      for (const ac of aircraft) {
        const d = Math.hypot(
          mercX(ac.longitude) * scale - corner.x - x,
          mercY(ac.latitude) * scale - corner.y - y,
        );
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
