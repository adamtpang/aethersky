"use client";

import {
  fmtAltitude,
  fmtFeet,
  fmtHeading,
  fmtNm,
  fmtSpeed,
  fmtTcpa,
  fmtVerticalRate,
} from "@/lib/format";
import type { Aircraft, ConflictPair } from "@/lib/types";

interface AircraftCardProps {
  aircraft: Aircraft;
  /** Flagged pairs this aircraft is part of, soonest first. */
  pairs: ConflictPair[];
  nameOf: (icao24: string) => string;
  checkFloorFt: number;
  onShowPair: (pair: ConflictPair) => void;
  onClose: () => void;
}

/** One plain sentence about what the check predicts for a pair. */
export function describePair(pair: ConflictPair): string {
  const distance = fmtNm(pair.dcpaNm);
  const vertical = fmtFeet(pair.verticalAtTcpaFt);
  if (pair.tcpaSec < 0.5) {
    return `They are inside the demo limits right now: ${distance} and ${vertical} apart.`;
  }
  return `If both keep flying straight, in ${fmtTcpa(pair.tcpaSec)} they pass ${distance} and ${vertical} apart.`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/**
 * Shown on the map when an aircraft is clicked: what it is doing, whether
 * the demo check flagged it, and what that would and would not mean.
 */
export default function AircraftCard({
  aircraft,
  pairs,
  nameOf,
  checkFloorFt,
  onShowPair,
  onClose,
}: AircraftCardProps) {
  const belowFloor =
    checkFloorFt > 0 &&
    (aircraft.altitudeFt === null || aircraft.altitudeFt < checkFloorFt);
  const incomplete =
    aircraft.headingDeg === null ||
    aircraft.groundSpeedKt === null ||
    aircraft.altitudeFt === null;

  return (
    <section
      aria-label={`Aircraft ${aircraft.callsign}`}
      className="absolute inset-x-2 bottom-2 z-[1001] border border-line bg-panel/95 p-3 text-[12px] shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-14 sm:w-80"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-base font-semibold leading-tight ${
              pairs.length > 0 ? "text-warn" : "text-fg"
            }`}
          >
            {aircraft.callsign}
          </p>
          <p className="text-[11px] text-muted">ICAO {aircraft.icao24}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-line px-2 py-0.5 text-[11px] text-fg hover:border-accent hover:text-accent"
        >
          Close
        </button>
      </header>

      <dl className="space-y-0.5">
        <Row label="Altitude" value={fmtAltitude(aircraft.altitudeFt)} />
        <Row label="Ground speed" value={fmtSpeed(aircraft.groundSpeedKt)} />
        <Row label="Heading" value={fmtHeading(aircraft.headingDeg)} />
        <Row label="Climb or descent" value={fmtVerticalRate(aircraft.verticalRateFpm)} />
        <Row
          label="Position"
          value={`${aircraft.latitude.toFixed(3)}, ${aircraft.longitude.toFixed(3)}`}
        />
      </dl>

      <div className="mt-2 border-t border-line pt-2 leading-snug">
        {pairs.length > 0 ? (
          <>
            <p className="font-semibold text-warn">
              Flagged with {pairs.length === 1 ? "1 aircraft" : `${pairs.length} aircraft`}
            </p>
            <ul className="mt-1 space-y-1.5">
              {pairs.slice(0, 3).map((pair) => {
                const other = pair.a === aircraft.icao24 ? pair.b : pair.a;
                return (
                  <li key={`${pair.a}|${pair.b}`}>
                    <button
                      type="button"
                      onClick={() => onShowPair(pair)}
                      className="text-left text-fg underline decoration-line underline-offset-2 hover:text-accent"
                    >
                      With {nameOf(other)}
                    </button>
                    <p className="text-muted">{describePair(pair)}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-muted">
              A real system would have one aircraft climb and the other
              descend, or turn, well before this point. This page only
              watches. It gives no instructions.
            </p>
          </>
        ) : belowFloor ? (
          <p className="text-muted">
            Not checked: it is below the{" "}
            {checkFloorFt.toLocaleString("en-US")} ft check floor.
          </p>
        ) : incomplete ? (
          <p className="text-muted">
            Not checked: its heading, speed, or altitude is missing.
          </p>
        ) : (
          <p className="text-muted">
            Checked, and not flagged with any other aircraft.
          </p>
        )}
      </div>
    </section>
  );
}
