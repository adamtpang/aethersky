"use client";

import { THRESHOLD_LABEL } from "@/lib/disclaimer";
import {
  DEMO_DEFAULT_CHECK_FLOOR_FT,
  DEMO_DEFAULT_THRESHOLDS,
  type ConflictThresholds,
} from "@/lib/types";

export interface DisplayFilters {
  search: string;
  altMinFt: number;
  altMaxFt: number;
}

export const ALT_FILTER_MAX_FT = 60000;

export const DEFAULT_FILTERS: DisplayFilters = {
  search: "",
  altMinFt: 0,
  altMaxFt: ALT_FILTER_MAX_FT,
};

interface FiltersProps {
  filters: DisplayFilters;
  thresholds: ConflictThresholds;
  checkFloorFt: number;
  onCheckFloorChange: (next: number) => void;
  onFiltersChange: (next: DisplayFilters) => void;
  onThresholdsChange: (next: ConflictThresholds) => void;
}

interface SliderSpec {
  key: keyof ConflictThresholds;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: "lateralNm", label: "Lateral", unit: "NM", min: 1, max: 10, step: 0.5 },
  { key: "verticalFt", label: "Vertical", unit: "ft", min: 300, max: 3000, step: 100 },
  { key: "lookaheadSec", label: "Lookahead", unit: "s", min: 30, max: 300, step: 10 },
];

const inputClass =
  "w-full rounded border border-line bg-bg px-2 py-1.5 font-mono text-[13px] text-fg placeholder:text-muted/70";

const clampAlt = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(ALT_FILTER_MAX_FT, Math.max(0, Math.round(parsed)));
};

export default function Filters({
  filters,
  thresholds,
  checkFloorFt,
  onCheckFloorChange,
  onFiltersChange,
  onThresholdsChange,
}: FiltersProps) {
  const thresholdsAreDefault =
    checkFloorFt === DEMO_DEFAULT_CHECK_FLOOR_FT &&
    SLIDERS.every((s) => thresholds[s.key] === DEMO_DEFAULT_THRESHOLDS[s.key]);
  const filtersAreDefault =
    filters.search === "" &&
    filters.altMinFt === 0 &&
    filters.altMaxFt === ALT_FILTER_MAX_FT;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="thresholds-heading">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 id="thresholds-heading" className="text-sm font-semibold">
            Conflict thresholds
          </h2>
          <button
            type="button"
            onClick={() => {
              onThresholdsChange(DEMO_DEFAULT_THRESHOLDS);
              onCheckFloorChange(DEMO_DEFAULT_CHECK_FLOOR_FT);
            }}
            disabled={thresholdsAreDefault}
            className="rounded px-1.5 py-0.5 text-xs text-accent hover:underline disabled:cursor-default disabled:text-muted/60 disabled:no-underline"
          >
            Reset
          </button>
        </div>
        <p className="mb-3 inline-block rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">
          {THRESHOLD_LABEL}
        </p>
        <div className="flex flex-col gap-3">
          {SLIDERS.map((s) => (
            <label key={s.key} className="block text-[13px]">
              <span className="flex items-baseline justify-between">
                <span className="text-muted">{s.label}</span>
                <span className="font-mono tabular-nums">
                  {thresholds[s.key]} {s.unit}
                  <span className="ml-2 text-[11px] text-muted">
                    demo default {DEMO_DEFAULT_THRESHOLDS[s.key]}
                  </span>
                </span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={thresholds[s.key]}
                onChange={(e) =>
                  onThresholdsChange({
                    ...thresholds,
                    [s.key]: Number(e.target.value),
                  })
                }
                className="mt-1 w-full"
              />
            </label>
          ))}
          <label className="block text-[13px]">
            <span className="flex items-baseline justify-between">
              <span className="text-muted">Check floor</span>
              <span className="font-mono tabular-nums">
                {checkFloorFt === 0
                  ? "off"
                  : `${checkFloorFt.toLocaleString("en-US")} ft`}
                <span className="ml-2 text-[11px] text-muted">
                  demo default{" "}
                  {DEMO_DEFAULT_CHECK_FLOOR_FT.toLocaleString("en-US")}
                </span>
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={18000}
              step={1000}
              value={checkFloorFt}
              onChange={(e) => onCheckFloorChange(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <p className="text-[11px] leading-snug text-muted">
            Aircraft below the floor are drawn but not checked. Near airports,
            traffic is close together on purpose, under air traffic control,
            and a straight-line check would flag hundreds of those pairs. Set
            the floor to 0 to check everything.
          </p>
        </div>
      </section>

      <section aria-labelledby="filters-heading">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="filters-heading" className="text-sm font-semibold">
            Display filters
          </h2>
          <button
            type="button"
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            disabled={filtersAreDefault}
            className="rounded px-1.5 py-0.5 text-xs text-accent hover:underline disabled:cursor-default disabled:text-muted/60 disabled:no-underline"
          >
            Clear
          </button>
        </div>
        <label className="mb-3 block text-[13px]">
          <span className="mb-1 block text-muted">Search callsign or icao24</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="HORIZON"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <label className="block">
            <span className="mb-1 block text-muted">Altitude min, ft</span>
            <input
              type="number"
              min={0}
              max={ALT_FILTER_MAX_FT}
              step={500}
              value={filters.altMinFt}
              onChange={(e) =>
                onFiltersChange({ ...filters, altMinFt: clampAlt(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted">Altitude max, ft</span>
            <input
              type="number"
              min={0}
              max={ALT_FILTER_MAX_FT}
              step={500}
              value={filters.altMaxFt}
              onChange={(e) =>
                onFiltersChange({ ...filters, altMaxFt: clampAlt(e.target.value) })
              }
              className={inputClass}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Filters only change what is drawn and listed. Conflicts are checked
          across all traffic, and aircraft in a flagged pair are always shown.
        </p>
      </section>
    </div>
  );
}
