"use client";

import { pairKey } from "@/lib/conflict";
import { DATA_CAVEAT_TEXT } from "@/lib/disclaimer";
import {
  fmtAltitude,
  fmtClock,
  fmtFeet,
  fmtHeading,
  fmtNm,
  fmtSpeed,
  fmtTcpa,
  fmtVerticalRate,
} from "@/lib/format";
import type {
  Aircraft,
  AircraftFeed,
  ConflictPair,
  ConflictThresholds,
} from "@/lib/types";
import Filters, { type DisplayFilters } from "./Filters";

export type SourceChoice = "mock" | "live";

interface SidebarProps {
  feed: AircraftFeed | null;
  loading: boolean;
  sourceChoice: SourceChoice;
  onSourceChange: (choice: SourceChoice) => void;
  onRefresh: () => void;
  conflicts: ConflictPair[];
  byId: ReadonlyMap<string, Aircraft>;
  conflictIds: ReadonlySet<string>;
  visibleAircraft: Aircraft[];
  totalAircraft: number;
  selected: Aircraft | null;
  selectedPairKey: string | null;
  onSelectAircraft: (icao24: string) => void;
  onSelectPair: (key: string) => void;
  filters: DisplayFilters;
  thresholds: ConflictThresholds;
  onFiltersChange: (next: DisplayFilters) => void;
  onThresholdsChange: (next: ConflictThresholds) => void;
}

const LIST_LIMIT = 150;

const SOURCE_OPTIONS: { value: SourceChoice; label: string }[] = [
  { value: "mock", label: "Mock" },
  { value: "live", label: "Live (OpenSky)" },
];

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

export default function Sidebar({
  feed,
  loading,
  sourceChoice,
  onSourceChange,
  onRefresh,
  conflicts,
  byId,
  conflictIds,
  visibleAircraft,
  totalAircraft,
  selected,
  selectedPairKey,
  onSelectAircraft,
  onSelectPair,
  filters,
  thresholds,
  onFiltersChange,
  onThresholdsChange,
}: SidebarProps) {
  const name = (id: string) => byId.get(id)?.callsign ?? id;
  const selectedConflicts = selected
    ? conflicts.filter((c) => c.a === selected.icao24 || c.b === selected.icao24)
    : [];
  const fellBack = sourceChoice === "live" && feed?.source === "mock";

  return (
    <aside
      aria-label="Traffic details and controls"
      className="flex min-h-0 flex-col overflow-y-auto border-line bg-panel text-[13px] lg:border-l"
    >
      <Section
        title="Data source"
        aside={
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded px-1.5 py-0.5 text-xs text-accent hover:underline disabled:text-muted/60 disabled:no-underline"
          >
            {loading ? "Loading" : "Refresh"}
          </button>
        }
      >
        <div
          role="radiogroup"
          aria-label="Data source"
          className="grid grid-cols-2 gap-1 rounded-md border border-line bg-bg p-1"
        >
          {SOURCE_OPTIONS.map((option) => {
            const active = sourceChoice === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSourceChange(option.value)}
                className={`rounded px-2 py-1.5 text-[13px] font-medium ${
                  active
                    ? "bg-accent text-bg"
                    : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-xs text-muted" aria-live="polite">
          {feed
            ? `${feed.source === "mock" ? "MOCK" : "OpenSky"} · ${totalAircraft} aircraft · updated ${fmtClock(feed.fetchedAtUnix)}`
            : "Loading traffic"}
        </p>
        {fellBack ? (
          <p
            role="alert"
            className="mt-2 rounded border border-danger/50 bg-danger/10 px-2 py-1.5 text-xs leading-snug text-[#ffc2bc]"
          >
            Live data is unavailable, so mock traffic is shown instead.
            {feed?.warning ? ` ${feed.warning}` : ""}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-snug text-muted">
          {DATA_CAVEAT_TEXT} Live mode uses the free OpenSky Network API, which
          is for non-profit research and education, and falls back to mock
          traffic on any error.
        </p>
      </Section>

      <Section
        title="Conflicts"
        aside={
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-xs ${
              conflicts.length > 0 ? "bg-warn/15 text-warn" : "bg-raised text-muted"
            }`}
          >
            {conflicts.length}
          </span>
        }
      >
        {conflicts.length === 0 ? (
          <p className="text-muted">
            {feed
              ? "No pairs flagged at the current demo thresholds."
              : "Waiting for traffic."}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {conflicts.map((pair) => {
              const key = pairKey(pair);
              const active = key === selectedPairKey;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onSelectPair(key)}
                    aria-pressed={active}
                    className={`w-full rounded-md border px-2.5 py-2 text-left ${
                      active
                        ? "border-danger bg-danger/10"
                        : "border-line bg-bg hover:border-warn/60"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-semibold text-warn">
                        {name(pair.a)}
                        <span className="px-1.5 text-muted">and</span>
                        {name(pair.b)}
                      </span>
                    </span>
                    <span className="mt-1 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                      <span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          Time to CPA
                        </span>
                        {fmtTcpa(pair.tcpaSec)}
                      </span>
                      <span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          Dist at CPA
                        </span>
                        {fmtNm(pair.dcpaNm)}
                      </span>
                      <span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">
                          Vert at CPA
                        </span>
                        {fmtFeet(pair.verticalAtTcpaFt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Sorted by time to closest point of approach (CPA). Constant-velocity
          geometry only. Not TCAS and not a resolution advisory.
        </p>
      </Section>

      <Section title="Selected aircraft">
        {selected ? (
          <div>
            <p className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className={`font-mono text-base font-semibold ${
                  conflictIds.has(selected.icao24) ? "text-warn" : "text-accent"
                }`}
              >
                {selected.callsign}
              </span>
              <span className="font-mono text-xs text-muted">{selected.icao24}</span>
            </p>
            <dl>
              <Detail
                label="Altitude"
                value={selected.onGround ? "on ground" : fmtAltitude(selected.altitudeFt)}
              />
              <Detail label="Ground speed" value={fmtSpeed(selected.groundSpeedKt)} />
              <Detail label="Heading" value={fmtHeading(selected.headingDeg)} />
              <Detail
                label="Vertical rate"
                value={fmtVerticalRate(selected.verticalRateFpm)}
              />
              <Detail
                label="Position"
                value={`${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`}
              />
              <Detail
                label="Last contact"
                value={
                  selected.lastContactUnix === null
                    ? "n/a"
                    : fmtClock(selected.lastContactUnix)
                }
              />
            </dl>
            <p className="mt-2 text-xs text-muted">
              {selected.onGround
                ? "On the ground, so it is excluded from conflict checks."
                : selected.headingDeg === null ||
                    selected.groundSpeedKt === null ||
                    selected.altitudeFt === null
                  ? "Missing heading, speed, or altitude, so it is excluded from conflict checks."
                  : selectedConflicts.length === 0
                    ? "Not in any flagged pair."
                    : `In ${selectedConflicts.length} flagged ${
                        selectedConflicts.length === 1 ? "pair" : "pairs"
                      }: ${selectedConflicts
                        .map((c) => name(c.a === selected.icao24 ? c.b : c.a))
                        .join(", ")}.`}
            </p>
          </div>
        ) : (
          <p className="text-muted">
            Select an aircraft on the map or in the list below.
          </p>
        )}
      </Section>

      <div className="border-b border-line px-4 py-4">
        <Filters
          filters={filters}
          thresholds={thresholds}
          onFiltersChange={onFiltersChange}
          onThresholdsChange={onThresholdsChange}
        />
      </div>

      <Section
        title="Aircraft"
        aside={
          <span className="font-mono text-xs text-muted">
            {visibleAircraft.length} of {totalAircraft}
          </span>
        }
      >
        {visibleAircraft.length === 0 ? (
          <p className="text-muted">
            {!feed
              ? "Waiting for traffic."
              : totalAircraft === 0
                ? "No aircraft reported in this area."
                : "No aircraft match the current filters."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {visibleAircraft.slice(0, LIST_LIMIT).map((ac) => {
              const active = selected?.icao24 === ac.icao24;
              return (
                <li key={ac.icao24}>
                  <button
                    type="button"
                    onClick={() => onSelectAircraft(ac.icao24)}
                    aria-pressed={active}
                    className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left font-mono text-xs ${
                      active ? "bg-raised" : "hover:bg-raised/70"
                    }`}
                  >
                    <span
                      className={
                        conflictIds.has(ac.icao24)
                          ? "font-semibold text-warn"
                          : ac.onGround
                            ? "text-muted"
                            : "text-fg"
                      }
                    >
                      {ac.callsign}
                    </span>
                    <span className="tabular-nums text-muted">
                      {ac.onGround
                        ? "on ground"
                        : `${fmtAltitude(ac.altitudeFt)} · ${fmtSpeed(ac.groundSpeedKt)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {visibleAircraft.length > LIST_LIMIT ? (
          <p className="mt-2 text-[11px] text-muted">
            Showing the first {LIST_LIMIT}. Use search or the altitude band to
            narrow the list.
          </p>
        ) : null}
      </Section>

      <footer className="px-4 py-4 text-[11px] leading-relaxed text-muted">
        <p>
          Map data &copy;{" "}
          <a
            className="text-accent hover:underline"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>{" "}
          contributors.
        </p>
        {sourceChoice === "live" || feed?.source === "opensky" ? (
          <p className="mt-1">
            Live traffic data:{" "}
            <a
              className="text-accent hover:underline"
              href="https://opensky-network.org"
              target="_blank"
              rel="noreferrer"
            >
              The OpenSky Network
            </a>
            . This demo is not an OpenSky product and is not endorsed by OpenSky.
          </p>
        ) : null}
        <p className="mt-1">
          aethersky is an open-source teaching demo. Thresholds are demo
          defaults, not FAA, ICAO, or TCAS minima.
        </p>
      </footer>
    </aside>
  );
}
