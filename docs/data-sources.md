# Data sources

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

## Context for why the project exists

These sources describe the November 13, 2026 FAA ground stop and the November 15, 2026 X discussion. They are background. They are not inputs to the conflict engine.

| Item | Date | Source |
| --- | --- | --- |
| FAA nationwide ground stop at about 3:30 p.m. ET; FTI network flooded at about 1,000 connection attempts every 4 to 5 seconds; El Dorado, AR and Amarillo, TX sites named; flights resumed 8:15 p.m. ET; about 12,462 cancellations, not all caused directly by the ground stop; about 3,500 aircraft in the air landed safely | Event November 13, 2026; Q&A consulted November 15, 2026 | [FAA Q&A](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers) |
| L3Harris says it has been converting legacy copper to fiber (more than 70% complete in the statement) and is supporting the FAA investigation | November 14, 2026 | [L3Harris statement](https://www.l3harris.com/newsroom/press-release/2026/11/l3harris-statement-nov-13-ground-stop) |
| Reporting on the router work in El Dorado, the flooding rate, and comments from Transportation Secretary Sean Duffy | November 14, 2026 | [CNBC](https://www.cnbc.com/2026/11/14/faa-ground-stop-flights-resume-delays.html) |
| Blake Scholl early-draft ATC modernization proposal (dual Starlink antennas, trajectory uploads, removing radar, radio, and ground nav aids, text ATC over satcom, automated routine ATC, start en-route and run in parallel) | November 15, 2026, 11:44 a.m. CT | [x.com/bscholl/status/2122023016754503683](https://x.com/bscholl/status/2122023016754503683) |
| Casey Handmer: "You could literally just use ADS-B and per-aircraft conflict avoidance." | November 15, 2026, 12:53 p.m. CT | [x.com/CJHandmer/status/2122040258686767138](https://x.com/CJHandmer/status/2122040258686767138) |
| Casey Handmer: "I might just build this as a free advisory service." | November 15, 2026, 2:50 p.m. CT | [x.com/CJHandmer/status/2122069804442059078](https://x.com/CJHandmer/status/2122069804442059078) |

## Live feeds (real traffic only)

Changed on November 15, 2026: the app shows real traffic or nothing. `GET /api/aircraft` tries these feeds in order and returns the first that answers. If none do, it returns a 503 and the map shows no aircraft. Terms below were read on November 15, 2026. The provider's own page controls.

| Order | Feed | Endpoint | Limit without a key | Terms in short |
| --- | --- | --- | --- | --- |
| 1 | [adsb.fi](https://adsb.fi) | `https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}` | 1 request per second, radius up to 250 NM | Personal, non-commercial use only. No reselling. Must cite adsb.fi and link its home page. [Terms](https://github.com/adsbfi/opendata) |
| 2 | [adsb.lol](https://adsb.lol) | `https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}` | 500 requests per day per IP | Open Database License (ODbL 1.0). A free key (`x-api-key`) raises the limit. [API docs](https://www.adsb.lol/docs/open-data/api/) |
| 3 | [OpenSky](https://opensky-network.org) | `https://opensky-network.org/api/states/all` | 400 credits per day | Non-profit research and education. See below. |

### National sweep (what the app uses)

`GET /api/traffic` returns one snapshot of airborne traffic over the contiguous United States. Added November 15, 2026.

- 30 circles of 250 NM from adsb.fi, in a honeycomb layout trimmed to a coarse outline of the country. Alaska and Hawaii are not covered.
- One request at a time, at least 1.1 seconds apart, so a sweep is about 35 seconds and about 30 requests. With visitors on the site that is roughly one sweep a minute.
- The server reuses a finished sweep for 30 seconds and the CDN caches the response for 15 seconds (serving it for up to 30 more while it refreshes). Simultaneous callers share one sweep, so visitors do not each trigger their own. These windows are short on purpose: a copy held longer carries positions too old to project.
- Regions are fetched in an order that jumps around the country, so the map fills in evenly instead of one coast at a time.
- `GET /api/traffic?snapshot=1` returns the last finished sweep as one JSON object. The CDN serves its copy at once and refreshes it in the background (fresh for 30 seconds, then reused for up to a day), and a server that already holds a finished sweep answers without waiting for a new one. The page shows it faintly while live traffic loads, and ignores it if it is more than 10 minutes old. This adds no extra requests to adsb.fi: it reuses the same sweep the live stream runs.
- The first line of the stream is the server clock when the response was written. The page adds the response Age header to it, so it knows the real time even when a cache hands it an older copy.
- Circles overlap. The freshest sighting of each aircraft is kept.
- The route is a stream of JSON lines: one `start`, one `region` per region as it arrives (busiest airspace first), and one `end`. A page can draw the first region about a second after asking.
- Positions are sent as reported, each with the time it was true. The page moves every aircraft forward along its reported track, at its reported speed and climb, to the current moment, and repeats that every 5 seconds. So positions on the map are estimates. A report older than 120 seconds is dropped instead of projected (a teaching default).
- Aircraft on the ground are left out.
- If three regions in a row fail, the sweep stops. If fewer than 60 percent of regions answer, the stream ends with an error and the page removes every aircraft. If a few regions fail, the snapshot carries a warning that part of the map is missing traffic.
- This is a heavier use of adsb.fi than one map view. It stays inside the published limit of 1 request per second, but the terms say personal, non-commercial use. Ask adsb.fi before pointing a large audience at it.
- Only adsb.fi is used for the sweep. adsb.lol allows 500 requests a day without a key, which is about 16 sweeps.

Notes for the single-box route `/api/aircraft`:

- Both community feeds use the readsb JSON format and already report feet, knots, and feet per minute.
- The route caches each box for 10 seconds, waits at least 1.1 seconds between adsb.fi requests, and leaves a feed alone for 20 seconds after a failure (or for the time a 429 asks for).
- A deployed site sends every visitor's request from the server's address, so the per-IP limits are shared by all visitors. adsb.fi is first because it has no daily cap.
- Positions older than 60 seconds are dropped (a teaching default), because the engine projects each aircraft forward at constant velocity.
- adsb.fi's terms say personal, non-commercial use. This repository is a free public demo with no revenue. A fork that sells anything, or runs at a higher request rate, must contact adsb.fi first.
- Optional env var: `ADSBLOL_API_KEY`. Server only. Never commit it.
- Show the credit for whichever feed is on screen, with a link, in the app footer.

Tried and not used: airplanes.live answered 403 on November 15, 2026 and now asks projects to email for access.

## OpenSky Network (third choice)

- REST root: `https://opensky-network.org/api`
- Endpoint for this app: `GET /states/all` with a bounding box (`lamin`, `lomin`, `lamax`, `lomax`)
- Docs: [OpenSky REST API](https://openskynetwork.github.io/opensky-api/rest.html)
- Python client and OAuth notes: [openskynetwork/opensky-api](https://github.com/openskynetwork/opensky-api)
- Terms: [https://opensky-network.org/about/terms-of-use](https://opensky-network.org/about/terms-of-use)
- FAQ (including live API use): [https://opensky-network.org/about/faq](https://opensky-network.org/about/faq)

### Auth (current as of docs checked November 15, 2026)

Since March 18, 2026, OpenSky uses the OAuth2 client credentials flow. Basic username and password auth is no longer accepted.

- Optional env vars: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`
- Token URL: `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`
- Body: `grant_type=client_credentials`, plus the client id and secret
- Send `Authorization: Bearer <token>` on API requests
- Tokens expire after about 30 minutes; refresh on 401 or shortly before expiry
- If the env vars are unset, call `/states/all` anonymously (lower limits)

Do not commit credentials. `.env.example` must not contain real values.

### Rate limits and credits (from the REST docs, November 15, 2026)

- Anonymous users are bucketed by IP, get only the latest states (the `time` parameter is ignored), and have 10-second time resolution.
- Anonymous credit quota for `/states/*` is 400 credits per day (refill daily). Standard user 4,000/day; other tiers are documented by OpenSky.
- `/states/all` credit cost depends on bounding-box area (latitude range times longitude range, in square degrees): 1 credit if area is at most 25 sq degrees (or a serial-only query), 2 if 25-100, 3 if 100-400, 4 if larger or global.
- A 429 response includes `X-Rate-Limit-Retry-After-Seconds`. Back off. Do not tight-loop.
- Cache successful responses for about 10 seconds (anonymous resolution is already 10 seconds; faster polling wastes credits).
- OpenSky has said it may block AWS and other hyperscaler IPs because of abuse. On November 15, 2026 it did not answer requests from the Vercel deployment at all, which is why it is tried last.

### Terms in short (read the official page; it controls)

- Free use of the data and REST API is for non-profit research and non-profit education.
- Any use by a for-profit or commercial entity, including government and military contractors, needs a written license from OpenSky.
- Operational use of the REST API in a live product, service, or automated system needs a written license, even for non-profit or government users.
- This repository is a public demo and teaching starter. It is not a license. Forks that operate a service or use the API commercially must contact OpenSky: contact@opensky-network.org (as listed on the terms page).

### Attribution (required when OpenSky data is used)

From the terms, cite:

> Bringing up OpenSky: A large-scale ADS-B sensor network for research, Matthias Schafer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic, Matthias Wilhelm, ACM/IEEE International Conference on Information Processing in Sensor Networks, April 2014

> The OpenSky Network, http://www.opensky-network.org

The published paper spells the first author's name with a diacritic. Keep the official paper title in citations when you can.

Show OpenSky credit in the app footer when OpenSky is the feed on screen, and keep OSM tile attribution on the map.

## Test scene

`lib/conflict/scene.fixture.ts` holds scripted aircraft for the test suite only. It is invented geometry, not a recording of real flights, and the app never shows it.

## Map tiles

OpenStreetMap default tiles via Leaflet. Follow [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and keep the standard attribution. No Mapbox token. No paid tile host in the MVP.
