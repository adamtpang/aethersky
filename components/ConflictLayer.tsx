"use client";

import { Fragment } from "react";
import { Polyline, Tooltip } from "react-leaflet";
import { pairKey } from "@/lib/conflict";
import { fmtFeet, fmtNm, fmtTcpa } from "@/lib/format";
import type { Aircraft, ConflictPair } from "@/lib/types";

interface ConflictLayerProps {
  conflicts: ConflictPair[];
  byId: ReadonlyMap<string, Aircraft>;
  selectedPairKey: string | null;
  onSelectPair: (key: string) => void;
}

const WARN = "#f5b942";
const DANGER = "#ff6b5e";

/** A line between each flagged pair. The selected pair is drawn stronger. */
export default function ConflictLayer({
  conflicts,
  byId,
  selectedPairKey,
  onSelectPair,
}: ConflictLayerProps) {
  return (
    <>
      {conflicts.map((pair) => {
        const a = byId.get(pair.a);
        const b = byId.get(pair.b);
        if (!a || !b) return null;
        const key = pairKey(pair);
        const selected = key === selectedPairKey;
        const positions: [number, number][] = [
          [a.latitude, a.longitude],
          [b.latitude, b.longitude],
        ];
        return (
          <Fragment key={key}>
            <Polyline
              positions={positions}
              pathOptions={
                selected
                  ? { color: DANGER, weight: 4, opacity: 1, dashArray: undefined }
                  : { color: WARN, weight: 2.5, opacity: 0.95, dashArray: "7 6" }
              }
              interactive={false}
            />
            {/* Wide invisible line so the pair is easy to click. */}
            <Polyline
              key={selected ? "hit-selected" : "hit"}
              positions={positions}
              pathOptions={{ color: WARN, weight: 16, opacity: 0 }}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => onSelectPair(key) }}
            >
              {selected ? (
                <Tooltip permanent direction="center" className="conflict-tip">
                  {`CPA ${fmtTcpa(pair.tcpaSec)} · ${fmtNm(pair.dcpaNm)} · ${fmtFeet(pair.verticalAtTcpaFt)}`}
                </Tooltip>
              ) : null}
            </Polyline>
          </Fragment>
        );
      })}
    </>
  );
}
