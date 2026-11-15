# Safety

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

This project is a public demo and a teaching tool. It is not certified software. It must never be presented as an operational conflict-avoidance system.

## Required disclaimer

Every page, including the placeholder and the first real app, must show this sentence in full. It must remain visible during normal use (for example a fixed bar). There must be no close, dismiss, or "don't show again" control.

> Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

Also tell users, in the README and in a short UI note, that traffic data may be delayed, incomplete, or wrong.

## What this engine is not

The conflict predictor is a first-order geometric check:

- It uses a flat-earth local ENU plane, which drifts as range from the origin grows.
- It assumes current velocity is constant (no turns, no speed changes, no procedure constraints).
- It does not model intent, clearances, airways, or airport surfaces.
- Default thresholds (5 NM, 1000 ft, 120 s) are demo defaults, not FAA, ICAO, or TCAS minima, and must be labeled that way in the UI.
- Missing, stale, or spoofed ADS-B data will produce wrong results.

Do not use the output to point an aircraft, to issue a clearance, or to second-guess ATC.

## Real traffic only

Changed on November 15, 2026 at the maintainer's direction: the app shows real traffic or nothing. It must never draw simulated, scripted, or replayed aircraft on the map.

When no live feed answers, the UI must say LIVE DATA UNAVAILABLE in a way that cannot be missed (a banner, not only a tooltip), must show no aircraft, and must say that an empty map does not mean an empty sky. Traffic from a failed refresh is dropped, not left on screen.

Scripted aircraft exist only in the test suite (`lib/conflict/scene.fixture.ts`) to exercise the engine.

## Data terms

OpenSky's terms restrict how the live API may be used. Read [data-sources.md](data-sources.md). Do not hide those terms behind a "live official feed" framing. If live requests fail, show the unavailable state and back off rather than retrying in a tight loop.

## Reporting harm

If someone opens an issue that describes using this app in flight or as a substitute for ATC, maintainers should reply with the disclaimer and close any request to remove it. Safety regressions in the disclaimer or in threshold labeling should be treated as high priority. See [SECURITY.md](../SECURITY.md) for vulnerability reports.
