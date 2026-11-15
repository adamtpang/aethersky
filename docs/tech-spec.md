# Tech spec: aethersky MVP

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

This is the technical contract for the first build. It goes with [HANDOFF-fable.md](HANDOFF-fable.md). Do not invent a different default threshold, a different disclaimer, or a different CPA formula when this file already states one.

Demo default thresholds (not regulatory): 5 nautical miles lateral, 1000 feet vertical, 120 seconds lookahead.

> **Amendment, November 15, 2026 (maintainer decision): real traffic only.** Sections 8, 9, and 11 below describe the first build, which fell back to mock traffic. That is no longer how the app works. The app now tries adsb.fi, then adsb.lol, then OpenSky, and shows no aircraft with a LIVE DATA UNAVAILABLE banner when none answer. There is no mock source, no source toggle, and no MOCK DATA banner. The scripted scene lives on only as a test fixture in `lib/conflict/scene.fixture.ts`. The current contract is in [data-sources.md](data-sources.md) and [safety.md](safety.md). Sections 3 through 7 and the fixtures in section 10 are unchanged. Section 7 is also amended: the grid searches two cells out, not one, so a fast head-on pair is never dropped.

## 1. Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Leaflet and `react-leaflet`, with default OpenStreetMap tiles (no Mapbox token, no paid tiles)
- Vitest for `lib/conflict` and unit helpers
- Optional runtime env: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` (server only)

The existing Vercel project is named `aethersky`. Do not create another one in this pass, and do not deploy.

## 2. File and folder structure

Create roughly this tree. Names may vary by one folder if the Next.js scaffold requires it, but keep the conflict engine pure and the API route in App Router.

```
aethersky/
  app/
    layout.tsx
    page.tsx
    globals.css
    api/
      aircraft/
        route.ts
  components/
    DisclaimerBar.tsx
    MapView.tsx
    AircraftLayer.tsx
    ConflictLayer.tsx
    Sidebar.tsx
    Filters.tsx
    MockBanner.tsx
  lib/
    types.ts
    units.ts
    mockTraffic.ts
    opensky.ts
    conflict/
      enu.ts
      cpa.ts
      grid.ts
      detect.ts
      index.ts
  public/
  docs/                  # already in the repo; do not delete
  README.md
  .env.example
```

Do not commit `.env`, `.env.local`, `.vercel/`, `.next/`, or `node_modules/`.

## 3. Types

```ts
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
```

`ConflictThresholds` must be labeled in the UI as demo defaults, not regulatory minima.

## 4. Units and constants

Use exact SI conversions:

- 1 international nautical mile = 1852 meters
- 1 foot = 0.3048 meters
- 1 knot = 1852 / 3600 meters per second
- 1 foot per minute = 0.3048 / 60 meters per second

Mean Earth radius for the local tangent plane (ASSUMPTION, teaching default, not a WGS-84 ellipsoid): `R = 6_371_000` meters. Label it in a code comment as an assumption.

OpenSky state fields (from the REST docs) arrive in SI and must be converted once at the API boundary:

- `baro_altitude`, `geo_altitude`: meters
- `velocity`: meters per second, ground speed
- `true_track`: degrees clockwise from north
- `vertical_rate`: meters per second, up is positive
- `on_ground`: boolean
- `longitude`, `latitude`: degrees
- Prefer barometric altitude for the vertical filter when it is present; otherwise geometric; if both are null and the aircraft is not on the ground, exclude it from pairing (it can still be drawn if a position exists).

## 5. Local ENU projection

Pick a local origin once per detection run: the center of the current bounding box, or the average of the aircraft positions if no bbox is supplied.

With `lat`, `lon` in radians, origin `lat0`, `lon0`, and `R` as above:

```
east  = R * (lon - lon0) * cos(lat0)
north = R * (lat - lat0)
up    = altitudeMeters - originAltitudeMeters
```

This is a flat-earth tangent plane. It is good enough for a demo over a few tens of nautical miles and will drift at long range. Do not claim WGS-84 geodesy. Horizontal CPA uses `east` and `north` only. `up` is used for altitude at a given time, or you may integrate altitude in feet and convert.

Horizontal velocity in ENU, with heading `psi` in radians from north, clockwise (true track):

```
vEast  = groundSpeedMps * sin(psi)
vNorth = groundSpeedMps * cos(psi)
vUp    = verticalRateMps
```

If heading or ground speed is null, exclude the aircraft from pairing (it may still be drawn).

## 6. Closest point of approach

For two aircraft, let `p` be the horizontal relative position (east, north) of B minus A, in meters, and `v` the horizontal relative velocity (B minus A), in meters per second.

- If `|v|^2` is smaller than a tiny epsilon (use `1e-9` m^2/s^2), treat the tracks as parallel at constant spacing. Set `tcpa = 0` and `dcpa = |p|`.
- Otherwise `tcpa = -dot(p, v) / dot(v, v)`.
- If `tcpa < 0`, the closest approach is in the past. Evaluate at `t = 0` only: set `tcpa = 0` and `dcpa = |p|`.
- If `tcpa > lookaheadSec`, do not flag (the closest approach is beyond the window). Do not clamp and still flag unless the current distance is already inside both thresholds (in that case use `t = 0`).
- Otherwise `dcpa = |p + v * tcpa|`.

Vertical motion, in feet (or convert consistently):

```
alt(t) = alt0 + verticalRateFpm * t / 60
verticalAtT = abs(altB(t) - altA(t))
```

A pair is a conflict when all of the following hold, and neither aircraft is on the ground:

1. `0 <= tcpa <= lookaheadSec` under the rules above
2. `dcpa` is strictly less than `lateralNm` (use `<`, not `<=`, so a pair exactly 5.0 NM apart is not flagged; tests rely on this)
3. `verticalAtTcpa` is strictly less than `verticalFt`

Skip a pair if either aircraft is `onGround === true`, or is missing position, heading, or ground speed, or has no usable altitude while airborne.

When several pairs share an aircraft, return all of them. Sort the sidebar by `tcpaSec` ascending, then by `dcpaNm` ascending.

This model assumes constant velocity. It is not TCAS, not a resolution advisory, and not a certified CPA implementation.

## 7. Grid prefilter

A naive loop is `O(n^2)` and is acceptable for a few hundred aircraft, but still run a uniform grid so the code is ready for denser boxes.

- Cell size in meters: `cell = lateralNm * 1852 + maxGroundSpeedMps * lookaheadSec`
  If ground speeds are missing, use 300 m/s as a cap (ASSUMPTION, labeled in a comment; about 583 knots, a generous cap so cells do not drop a fast closer).
- Bucket each eligible aircraft by `floor(east / cell)` and `floor(north / cell)`.
- Compare an aircraft only with others in the same cell or the eight neighbor cells, and only with a higher `icao24` (or another stable id) so each pair is considered once.

The prefilter must not drop a pair that the exact CPA test would have flagged. Fixture F8 checks a pair that sits across a cell boundary.

## 8. OpenSky API route

`GET /api/aircraft`

Query parameters:

- `lamin`, `lomin`, `lamax`, `lomax` (required for a live request; all four or none)
- `source=live` or `source=mock` (optional; default `live` if a bbox is present, otherwise `mock`)

Behavior:

1. If `source=mock`, or if the bbox is missing, return the deterministic mock feed with `source: "mock"`.
2. Otherwise request `https://opensky-network.org/api/states/all` with the bbox.
3. If `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` are both set, fetch a client-credentials token from `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token` and send it as a Bearer token. Cache the token in memory until shortly before expiry (for example 30 seconds of margin). If only one of the two env vars is set, treat it as anonymous and log a server-side warning (no secrets in the log).
4. Cache the mapped aircraft list for 10 seconds per bbox key. Anonymous OpenSky resolution is already 10 seconds; polling faster wastes credits.
5. On 429, honor `X-Rate-Limit-Retry-After-Seconds` if present, do not retry in a tight loop, and fall back to mock with `warning` set.
6. On network errors, 401/403/5xx, or an empty unexpected body, fall back to mock with `warning` set.
7. Constrain bbox area in the client so a full-world query is not the default (keeps credit cost down). A reasonable first bbox is a few degrees on a side, for example a region around the mock origin, and the map should send the current view (clamped).
8. Never log or return the client secret. Never send OpenSky credentials to the browser.

Keep the route in the slim style: no database.

## 9. Deterministic mock traffic

Put the scenario in `lib/mockTraffic.ts`. It must not depend on `Date.now()` for positions, except to stamp `fetchedAtUnix`. Use a fixed scenario time `T0 = 1_700_000_000` (or another documented constant).

Place the scene near 39.86 N, 104.67 W (a generic area east of the Denver region, documented as a teaching locale, not a claim about that airspace). Origin for ENU in tests can be that same point.

Include at least:

- Pair HORIZON / MERIDIAN: head-on, same altitude, 10 NM apart, 300 knots each, so they meet in 60 seconds (fixture F1 geometry).
- Pair PARALLEL-WIDE / PARALLEL-WIDE-B: same direction, 6 NM abeam, same speed, same altitude (F2, not a conflict).
- Pair PARALLEL-CLOSE / PARALLEL-CLOSE-B: same direction, 3 NM abeam (F3, conflict at tcpa 0).
- Pair LEVEL / CLIMBER: F5-style vertical closer, or a second head-on with a 3000 ft vertical offset and zero vertical rates (F4, not a conflict) plus a climbing pair. You may implement F4 and F5 as unit-test-only aircraft rather than putting every fixture on the map, but the map mock must contain at least two flagging pairs and at least one non-flagging pair.
- One on-ground aircraft near a pair that would otherwise flag (must be skipped).

Callsigns are invented. Flag the feed as mock.

## 10. Vitest cases (required, known outputs)

Use `toBeCloseTo` with the tolerances below. Do not weaken a fixture to match a buggy implementation.

Unless a case says otherwise, thresholds are the demo defaults: 5 NM, 1000 ft, 120 s. Build aircraft in a local ENU frame and, if you go through lat/lon, invert the ENU projection at the documented origin (39.86 N, 104.67 W) so rounding stays tight.

### F1: Head-on, same altitude, meet in 60 s

- A at east = -9260 m, north = 0, altitude = 10,000 ft, heading 90 deg, 300 kt, vertical rate 0
- B at east = +9260 m, north = 0, altitude = 10,000 ft, heading 270 deg, 300 kt, vertical rate 0
- 9260 m is exactly 5 NM. 300 kt is exactly `300 * 1852 / 3600` m/s. In 60 s each covers 5 NM.
- Expected: one conflict, `tcpaSec` close to 60 (tolerance 0.05 s), `dcpaNm` close to 0 (tolerance 0.001 NM), `verticalAtTcpaFt` close to 0 (tolerance 1 ft).

### F2: Parallel, 6 NM abeam, same velocity

- A at (0, 0), B at (0, 6 * 1852), both heading 90 deg, 300 kt, same altitude, vertical rate 0
- Expected: no conflict. Relative velocity is zero, `dcpa` is 6 NM, which is not strictly less than 5.

### F3: Parallel, 3 NM abeam, same velocity

- Same as F2 with 3 NM north offset
- Expected: one conflict, `tcpaSec` = 0, `dcpaNm` close to 3 (tolerance 0.001 NM).

### F4: Head-on like F1, but 3000 ft of vertical separation, zero vertical rates

- B 3000 ft above A
- Expected: no conflict, because vertical separation at every t in the window is 3000 ft.

### F5: Head-on like F1, vertical close at 60 s

- A at 10,000 ft, vertical rate 0
- B at 12,000 ft, vertical rate -2000 fpm (2000 ft in 60 s)
- Expected: one conflict, `tcpaSec` close to 60, `verticalAtTcpaFt` close to 0 (tolerance 5 ft).

### F6: On ground

- Geometry of F3, but B has `onGround: true`
- Expected: no conflict.

### F7: Already diverged, currently 6 NM apart

- A at east = -9260 * 6/5, heading 270 deg, 300 kt (moving west)
- B at east = +9260 * 6/5, heading 90 deg, 300 kt (moving east)
- Same altitude
- Expected: no conflict (`tcpa` would be negative, current horizontal distance is 6 NM).

### F8: Grid neighbor

- Two aircraft that flag under F1, but whose ENU positions fall in adjacent grid cells with the cell size from section 7
- You may construct this by placing them just across a cell edge while keeping the F1 kinematics, or by asserting that `detectConflicts` on the F1 pair returns the same result with the prefilter enabled and disabled
- Expected: the pair is still reported (the prefilter must not drop it)

Also add a tiny units test: `5 * 1852 === 9260`, and `300 * 1852 / 3600` is the F1 speed.

## 11. UI

Dark theme (near `#0b0d10` background, light text, a cool accent is fine). No official FAA, OpenSky, or airline marks beyond required text attribution.

Required pieces:

1. `DisclaimerBar`: fixed, always visible, exact disclaimer text, no dismiss control. Keep it on screen at a laptop viewport without relying on a hover.
2. `MapView`: Leaflet map, OSM tiles, OSM attribution visible.
3. Aircraft markers: an icon or triangle that rotates by heading. Label with callsign, altitude, ground speed, heading, and vertical rate. Use compact units (ft, kt, fpm).
4. Velocity vectors: a line along track for a 60 s projection at current ground speed and heading (this 60 s is a display default, distinct from the 120 s conflict lookahead). If you make it configurable, default it to 60 s.
5. Conflict lines: a distinct color (for example amber or red) connecting each flagged pair. Highlight the selected pair more strongly.
6. `Sidebar`: selected aircraft details; conflict list sorted by time to CPA, showing both callsigns, `tcpa`, `dcpa`, and vertical separation at CPA.
7. `Filters`: altitude band, a search box (callsign or icao24), sliders for lateral NM, vertical ft, and lookahead seconds, with the "demo default, not regulatory" label next to the sliders. Reset-to-defaults is nice but optional.
8. Data-source toggle: live vs mock. Live errors must fall back to mock and show the warning plus MOCK DATA.
9. `MockBanner`: when `source === "mock"`, a visible MOCK DATA banner.
10. Footer or corner credit: OpenSky when live, plus OSM. Link the terms in the README, not as a claim that OpenSky endorses the app.

Empty states: no aircraft, no conflicts, and a failed live fetch should all be readable, not a blank crash.

## 12. Acceptance criteria

See also [HANDOFF-fable.md](HANDOFF-fable.md). In short: tests F1-F8 pass, production build passes, disclaimer cannot be dismissed, mock is obvious, conflicts render and sort correctly, no secrets, no paid tiles, no deploy from the implementer, PR against main only.

## 13. Timed checklist

Copy of the handoff checklist, for convenience: scaffold 25 min, types and mock 20 min, engine and tests 50 min, API route 30 min, map 35 min, sidebar and filters 25 min, disclaimer and polish 15 min, PR 15 to 20 min. Total about 215 to 240 minutes.

If the clock is short, keep global sliders and cut optional vector-length controls. Do not cut tests, the disclaimer, or the mock fallback.
