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

// Scope glass palette. See docs/design-language.md. Color never carries a
// meaning alone: each state also has its own shape.
const TRAFFIC = "#dcd4ea"; // hollow diamond: traffic that is not flagged
const WARN = "#f45d7f"; // filled circle: aircraft in a flagged pair
const DANGER = "#40d0f0"; // filled square: the selected pair
const TRACK = "#40d0f0"; // the selected aircraft's track
const FG = "#f0e8f6";
const HALO = "#0e0b14";
const FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** How close a click must be to an aircraft to select it, in pixels. */
const HIT_RADIUS_PX = 14;
/** Most data blocks drawn at once, so a busy view stays readable. */
const MAX_LABELS = 120;
const DEG = Math.PI / 180;

type Shape = "dot" | "diamond" | "circle" | "square";

/** Symbol half-size in pixels at each zoom. */
const symbolSize = (zoom: number): number =>
  zoom <= 4 ? 1.5 : zoom === 5 ? 2 : zoom === 6 ? 4 : zoom === 7 ? 5 : 6;

/** Web Mercator, as a fraction of the world from 0 to 1. */
const mercX = (lon: number): number => (lon + 180) / 360;
const mercY = (lat: number): number => {
  const s = Math.sin(lat * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

interface Sprite {
  image: HTMLCanvasElement;
  /** Side of the sprite in CSS pixels. */
  side: number;
}

const spriteCache = new Map<string, Sprite>();

/**
 * One small picture per symbol, drawn once and reused. Stamping a ready
 * picture is far cheaper than tracing a shape for each of several thousand
 * aircraft on every frame.
 */
function sprite(shape: Shape, size: number, color: string, dpr: number): Sprite {
  const key = `${shape}|${size}|${color}|${dpr}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const side = Math.ceil(size * 2) + 6;
  const image = document.createElement("canvas");
  image.width = Math.ceil(side * dpr);
  image.height = Math.ceil(side * dpr);
  const ctx = image.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = side / 2;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (shape === "dot") {
      ctx.fillRect(c - size, c - size, size * 2, size * 2);
    } else if (shape === "diamond") {
      // Hollow, with a dark core so it reads over map detail.
      ctx.beginPath();
      ctx.moveTo(c, c - size);
      ctx.lineTo(c + size * 0.8, c);
      ctx.lineTo(c, c + size);
      ctx.lineTo(c - size * 0.8, c);
      ctx.closePath();
      ctx.fillStyle = "rgba(14, 11, 20, 0.7)";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(c, c, size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(c - size, c - size, size * 2, size * 2);
    }
  }
  const made = { image, side };
  spriteCache.set(key, made);
  return made;
}

/** Text with a dark edge, readable over any map detail. No box. */
function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = HALO;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * A controller-style data block: a short leader line from the target up and
 * to the right, then lines of text.
 */
function dataBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  color: string,
) {
  const tx = x + 14;
  const ty = y - 12;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 5, y - 5);
  ctx.lineTo(tx - 2, ty + 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = FONT;
  lines.forEach((line, i) => haloText(ctx, line, tx, ty + i * 12, color));
}

/** Altitude in hundreds of feet and speed in tens of knots, as on a scope. */
function shortTag(ac: Aircraft): string {
  const alt =
    ac.altitudeFt === null
      ? "---"
      : String(Math.max(0, Math.round(ac.altitudeFt / 100))).padStart(3, "0");
  const speed =
    ac.groundSpeedKt === null
      ? "--"
      : String(Math.round(ac.groundSpeedKt / 10)).padStart(2, "0");
  return `${alt} ${speed}`;
}

/**
 * Every aircraft, vector, flagged pair, and data block on one canvas.
 * Thousands of DOM markers would stall the page, so nothing here is an
 * element.
 *
 * Built for speed: positions are turned into map fractions once per data
 * update, a frame only does arithmetic on them, and each aircraft is a
 * stamp of a ready-made symbol instead of a shape traced from scratch.
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
    const indexOf = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const ac = aircraft[i];
      xs[i] = mercX(ac.longitude);
      ys[i] = mercY(ac.latitude);
      flagged[i] = conflictIds.has(ac.icao24) ? 1 : 0;
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
      const s = symbolSize(zoom);
      const far = zoom <= 5;

      const px = (i: number) => xs[i] * scale - ox;
      const py = (i: number) => ys[i] * scale - oy;
      const visible = (x: number, y: number) =>
        x > -pad && x < w + pad && y > -pad && y < h + pad;
      const stamp = (sp: Sprite, x: number, y: number) =>
        ctx.drawImage(sp.image, x - sp.side / 2, y - sp.side / 2, sp.side, sp.side);

      // Velocity vectors: where each aircraft will be in 60 seconds.
      if (zoom >= 7) {
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
          ctx.strokeStyle = pass ? WARN : TRAFFIC;
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Unflagged traffic: a dot from far out, a hollow diamond up close.
      let inView = 0;
      const plain = sprite(far ? "dot" : "diamond", s, TRAFFIC, dpr);
      ctx.globalAlpha = far ? 0.8 : 1;
      for (let i = 0; i < n; i++) {
        const x = px(i);
        const y = py(i);
        if (!visible(x, y)) continue;
        inView++;
        if (flagged[i]) continue;
        stamp(plain, x, y);
      }
      ctx.globalAlpha = 1;

      // Flagged pairs: a line between them, and a ring from far out.
      let selectedPair: ConflictPair | null = null;
      const ringed = zoom < 8;
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
        if (ringed) {
          rings.push([
            (ax + bx) / 2,
            (ay + by) / 2,
            Math.max(8, Math.hypot(ax - bx, ay - by) / 2 + 7),
          ]);
        }
      }
      ctx.strokeStyle = WARN;
      ctx.lineWidth = 1.5;
      // From far out the lines are a few pixels long. Dashes only cost time.
      if (!ringed) ctx.setLineDash([6, 5]);
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

      // Flagged traffic on top: a filled circle.
      const hot = sprite("circle", Math.max(s, 3), WARN, dpr);
      for (let i = 0; i < n; i++) {
        if (!flagged[i]) continue;
        const x = px(i);
        const y = py(i);
        if (!visible(x, y)) continue;
        stamp(hot, x, y);
      }

      // The selected pair is drawn alone: red line, red squares, its numbers.
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
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        const sq = sprite("square", Math.max(s, 5), DANGER, dpr);
        stamp(sq, ax, ay);
        stamp(sq, bx, by);
        ctx.font = FONT;
        const text = `CPA ${fmtTcpa(selectedPair.tcpaSec)} · ${fmtNm(selectedPair.dcpaNm)} · ${fmtFeet(selectedPair.verticalAtTcpaFt)}`;
        haloText(ctx, text, mx - ctx.measureText(text).width / 2, my + 26, DANGER);
      }

      // Data blocks when zoomed in far enough for them to fit.
      if (zoom >= 9 && inView <= MAX_LABELS) {
        for (let i = 0; i < n; i++) {
          const ac = aircraft[i];
          if (ac.icao24 === selectedId) continue;
          const x = px(i);
          const y = py(i);
          if (!visible(x, y)) continue;
          dataBlock(
            ctx,
            x,
            y,
            zoom >= 10 ? [ac.callsign, shortTag(ac)] : [ac.callsign],
            flagged[i] ? WARN : FG,
          );
        }
      }

      // The selected aircraft: a ring, its track ahead, and a full block.
      const si = selectedId ? indexOf.get(selectedId) : undefined;
      if (si !== undefined) {
        const ac = aircraft[si];
        const x = px(si);
        const y = py(si);
        const end = projectAhead(ac, VECTOR_SECONDS * 2);
        if (end) {
          ctx.strokeStyle = TRACK;
          ctx.lineWidth = 1.75;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(mercX(end[1]) * scale - ox, mercY(end[0]) * scale - oy);
          ctx.stroke();
        }
        ctx.strokeStyle = FG;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(s, 5) + 6, 0, Math.PI * 2);
        ctx.stroke();
        dataBlock(
          ctx,
          x + 4,
          y - 4,
          [
            ac.callsign,
            `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`,
            `${fmtHeading(ac.headingDeg)} · ${fmtVerticalRate(ac.verticalRateFpm)}`,
          ],
          flagged[si] ? WARN : FG,
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
