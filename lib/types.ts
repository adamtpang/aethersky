export type FeedSource = "opensky" | "mock";

export interface Aircraft {
  icao24: string;
  callsign: string;
  longitude: number; // degrees
  latitude: number; // degrees
  altitudeFt: number | null; // barometric when available, else geometric, else null
  geoAltitudeFt: number | null;
  groundSpeedKt: number | null;
  headingDeg: number | null; // true track, degrees clockwise from north
  verticalRateFpm: number | null; // feet per minute, up is positive
  onGround: boolean;
  lastContactUnix: number | null;
}

export interface AircraftFeed {
  source: FeedSource;
  fetchedAtUnix: number;
  timeUnix: number | null; // OpenSky `time`, or mock scenario time
  aircraft: Aircraft[];
  warning?: string; // e.g. rate limited, fell back to mock
}

// Demo defaults, not regulatory minima. See DEMO_DEFAULT_THRESHOLDS.
export interface ConflictThresholds {
  lateralNm: number; // demo default 5
  verticalFt: number; // demo default 1000
  lookaheadSec: number; // demo default 120
}

export interface ConflictPair {
  a: string; // icao24
  b: string; // icao24
  tcpaSec: number; // seconds from now, in [0, lookaheadSec]
  dcpaNm: number; // horizontal closest-approach distance, nautical miles
  verticalAtTcpaFt: number;
  currentHorizontalNm: number;
  currentVerticalFt: number;
}

export type EnuMeters = {
  east: number;
  north: number;
  up: number;
};

export interface BoundingBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

/**
 * Demo defaults only. These are teaching values for this advisory demo.
 * They are NOT FAA, ICAO, or TCAS separation minima.
 */
export const DEMO_DEFAULT_THRESHOLDS: ConflictThresholds = {
  lateralNm: 5,
  verticalFt: 1000,
  lookaheadSec: 120,
};
