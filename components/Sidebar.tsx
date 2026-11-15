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
  FeedSource,
} from "@/lib/types";
import Filters, { type DisplayFilters } from "./Filters";
import Logo from "./Logo";

interface SidebarProps {
  feed: AircraftFeed | null;
  feedError: string | null;
  loading: boolean;
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
const CONFLICT_LIST_LIMIT = 100;

const SOURCES: Record<FeedSource, { name: string; href: string; note: string }> = {
  "adsb.fi": {
    name: "adsb.fi",
    href: "https://adsb.fi",
    note: "Community ADS-B network. Open data for personal, non-commercial use.",
  },
  "adsb.lol": {
    name: "adsb.lol",
    href: "https://adsb.lol",
    note: "Community ADS-B network. Data under the Open Database License.",
  },
  opensky: {
    name: "The OpenSky Network",
    href: "https://opensky-network.org",
    note: "Research ADS-B network. Free API for non-profit research and education.",
  },
};

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
  feedError,
  loading,
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
  const source = feed ? SOURCES[feed.source] : null;

  return (
    <aside
      aria-label="Traffic details and controls"
      className="flex min-h-0 flex-col overflow-y-auto border-line bg-panel text-[13px] lg:border-l"
    >
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Logo size={30} />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">aethersky</p>
          <p className="text-[11px] text-muted">
            Open-source advisory traffic demo
          </p>
        </div>
        <a
          href="https://github.com/adamtpang/aethersky"
          target="_blank"
          rel="noreferrer"
          className="ml-auto rounded border border-line px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          GitHub
        </a>
      </header>
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
        <p className="font-mono text-xs" aria-live="polite">
          {feed && source ? (
            <>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#4ade80]" aria-hidden="true" />
              <span className="text-fg">Live</span>
              <span className="text-muted">
                {` \u00b7 ${source.name} \u00b7 ${totalAircraft.toLocaleString("en-US")} airborne \u00b7 ${fmtClock(feed.fetchedAtUnix)}`}
              </span>
            </>
          ) : feedError ? (
            <span className="text-danger">Unavailable. No aircraft shown.</span>
          ) : (
            <span className="text-muted">Loading live traffic</span>
          )}
        </p>
        {feedError ? (
          <p
            role="alert"
            className="mt-2 rounded border border-danger/50 bg-danger/10 px-2 py-1.5 text-xs leading-snug text-[#ffc2bc]"
          >
            {feedError} Retrying automatically.
          </p>
        ) : null}
        {feed?.warning ? (
          <p className="mt-2 rounded border border-line bg-bg px-2 py-1.5 text-xs leading-snug text-muted">
            {feed.warning}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-snug text-muted">
          {DATA_CAVEAT_TEXT} Contiguous United States, airborne aircraft
          only, refreshed about once a minute. Positions are up to a minute or
          two old and are moved forward along each track to the refresh time.
          Real traffic only: if the feed fails, the map shows nothing.
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
            {conflicts.slice(0, CONFLICT_LIST_LIMIT).map((pair) => {
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
          {conflicts.length > CONFLICT_LIST_LIMIT
            ? `Showing the first ${CONFLICT_LIST_LIMIT} of ${conflicts.length.toLocaleString("en-US")}. `
            : ""}
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
            {visibleAircraft.length.toLocaleString("en-US")} of{" "}
            {totalAircraft.toLocaleString("en-US")}
          </span>
        }
      >
        {visibleAircraft.length === 0 ? (
          <p className="text-muted">
            {!feed
              ? "Waiting for traffic."
              : totalAircraft === 0
                ? "No airborne aircraft reported."
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
        {source ? (
          <p className="mt-1">
            Live traffic data:{" "}
            <a
              className="text-accent hover:underline"
              href={source.href}
              target="_blank"
              rel="noreferrer"
            >
              {source.name}
            </a>
            . {source.note} This demo is not a product of, and is not endorsed
            by, any data provider.
          </p>
        ) : null}
        <p className="mt-1">
          aethersky is an open-source teaching demo. Thresholds are demo
          defaults, not FAA, ICAO, or TCAS minima. Logo icon from Lucide.
        </p>
      </footer>
    </aside>
  );
}
