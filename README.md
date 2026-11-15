# aethersky

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

aethersky is a free, non-certified public demo: a web map that shows public ADS-B traffic and runs a simple geometric conflict check (time and distance of closest approach, plus a vertical filter). It is a starter that anyone can fork and improve. It is not a certified avionics product, not an ATC system, and not a navigation source.

Live placeholder: [https://aethersky.vercel.app](https://aethersky.vercel.app)

This repository holds the first version of the app, the safety rules, and the build brief it was written from. See [docs/HANDOFF-fable.md](docs/HANDOFF-fable.md) and [docs/tech-spec.md](docs/tech-spec.md). The live placeholder above may still show the earlier holding page until the maintainer deploys.

## Run it locally

Requires Node.js 20.19 or newer (22 or 24 recommended).

```
npm install
npm run dev
```

Open http://localhost:3000. The app opens on the whole contiguous United States with live airborne traffic, with no credentials needed. Aircraft appear within a second or two and fill in region by region, busiest airspace first. A full pass over the country takes about 35 seconds. It shows real traffic only. If no live feed answers, the map shows no aircraft and a LIVE DATA UNAVAILABLE banner. It never substitutes simulated traffic.

Other commands:

- `npm test` runs the Vitest suite, including conflict fixtures F1 through F8 from the tech spec
- `npm run build` makes a production build
- `npm run lint` and `npm run typecheck` check the code

No feed answers one request for the whole country, so the server sweeps it: `/api/traffic` asks [adsb.fi](https://adsb.fi) for 30 overlapping circles of 250 NM, one request at a time to stay inside its limit of 1 request per second. A sweep takes about 35 seconds, is shared by every visitor, and is refreshed about once a minute. The route streams each region as it arrives, so the page can draw it straight away. The page then moves every aircraft forward along its track to the current moment every 5 seconds, so every position on the map is an estimate. A report older than 120 seconds is dropped. Aircraft on the ground are left out. Alaska and Hawaii are not covered.

A second route, `/api/aircraft`, returns one bounding box and tries three feeds in order: adsb.fi, then [adsb.lol](https://adsb.lol), then [OpenSky](https://opensky-network.org). The app no longer uses it, but it is handy for forks. All three feeds work with no key. Optional keys go in `.env.local` (copy `.env.example`): `ADSBLOL_API_KEY` raises the adsb.lol daily limit, and `OPENSKY_CLIENT_ID` with `OPENSKY_CLIENT_SECRET` raises the OpenSky one. Never commit that file.

## How the check works

Each airborne aircraft with a position, heading, ground speed, and altitude is projected onto a flat local plane and assumed to keep its current velocity. Across a whole country one plane would be badly stretched, so the traffic is sorted into a grid, two cheap tests throw out pairs that cannot possibly close in time, and each remaining pair is measured on its own small plane centered between the two aircraft. The check runs in a background worker. On a laptop it covers about 5,600 aircraft in 10 to 20 milliseconds, and the sidebar shows the live figure. For every pair, the app finds the time and horizontal distance of closest approach inside the lookahead window, and the vertical separation at that time. A pair is flagged when both are under the thresholds.

The shipped thresholds are 5 NM lateral, 1000 ft vertical, and 120 s lookahead. They are demo defaults, not regulatory minimums, and the sliders say so. Aircraft on the ground are never paired. The engine lives in `lib/conflict` as plain TypeScript with no framework code, so it is easy to read, test, and replace.

## Disclaimer

The following text must stay visible on every page of the app, and it must not be dismissible:

> Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

Traffic data may be delayed, incomplete, or wrong. Thresholds in the demo are teaching defaults, not regulatory separation minima. Do not use this project to fly, to separate aircraft, or to replace any official service.

## The name

Aether (sometimes written Aither) is the primordial Greek god of the bright upper sky, the clear air the gods were said to breathe. The name is a nod to that sky, and to building in the open.

## Why this exists

On November 13, 2026, the FAA issued a nationwide ground stop at about 3:30 p.m. ET after a technical problem on its telecommunications network. The FAA says data flooded the FTI network at a rate of about 1,000 connection attempts every 4 to 5 seconds, which destabilized aircraft communications and radar feeds. The FAA's account points to work that included a new router at a radio communications site in El Dorado, Arkansas, and also names a radar site in Amarillo, Texas. L3Harris, the network service provider, had been doing work at the El Dorado site. The FAA isolated the locations, the network stabilized, and flights resumed at 8:15 p.m. ET that day. The FAA and L3Harris said the investigation was continuing. Sources: the [FAA nationwide ground stop Q&A](https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers), the [L3Harris statement of November 14, 2026](https://www.l3harris.com/newsroom/press-release/2026/11/l3harris-statement-nov-13-ground-stop), and [CNBC reporting on November 14, 2026](https://www.cnbc.com/2026/11/14/faa-ground-stop-flights-resume-delays.html).

The FAA Q&A also says operators canceled approximately 12,462 flights, including 9,082 by major airlines, and that not all cancellations were caused directly by the ground stop. It says about 3,500 aircraft in the air at the time landed safely. Prefer those official figures over informal "12-15k flights affected" summaries.

On November 15, 2026, Blake Scholl ([@bscholl](https://x.com/bscholl)) posted an early-draft proposal for ATC modernization after that outage: [https://x.com/bscholl/status/2122023016754503683](https://x.com/bscholl/status/2122023016754503683) (11:44 a.m. CT). In that post he argues the current system can be ripped out and replaced for less than the cost of maintaining it, and that safety could improve. The proposal, which he presents as an early draft, includes dual Starlink antennas on every airplane, real-time position and trajectory uploads, removal of radar, radio, and ground navigation aids (ILS, VOR, RNAV), text-based ATC over satcom, and automated routine ATC, with about 1% of staff kept for emergencies, starting in en-route airspace and run in parallel with the current system. Read the post itself for his exact wording.

Casey Handmer ([@CJHandmer](https://x.com/CJHandmer)) replied the same day:

- [https://x.com/CJHandmer/status/2122040258686767138](https://x.com/CJHandmer/status/2122040258686767138) (12:53 p.m. CT): "You could literally just use ADS-B and per-aircraft conflict avoidance."
- [https://x.com/CJHandmer/status/2122069804442059078](https://x.com/CJHandmer/status/2122069804442059078) (2:50 p.m. CT): "I might just build this as a free advisory service."

Scholl replied, "This would be so fun": [https://x.com/bscholl/status/2122069975410397496](https://x.com/bscholl/status/2122069975410397496).

aethersky is a public-good starter inspired by that exchange. It is a small, honest advisory demo, not an implementation of Scholl's full proposal and not a substitute for ATC. Anyone can fork it.

## What it is, and what it is not

It is:

- An open-source, MIT-licensed teaching and demo app
- A live traffic map with a simple, documented conflict predictor
- A place for contributors to improve the math, the UI, and the data path in the open

It is not:

- Certified, approved, or endorsed by the FAA or any other authority
- A replacement for ATC, ATIS, TCAS/ACAS, ADS-B In traffic displays, or pilot judgment
- A source of official separation
- An official OpenSky product (see data terms below)

## Data and terms

Live traffic comes from community ADS-B networks. Each has its own terms, summarized in [docs/data-sources.md](docs/data-sources.md):

- [adsb.fi](https://adsb.fi) open data is for personal, non-commercial use, limited to 1 request per second, and must be credited with a link.
- [adsb.lol](https://adsb.lol) data is under the Open Database License (ODbL 1.0), with 500 requests a day per IP without a key.
- [OpenSky](https://opensky-network.org/) is the third choice.

OpenSky's [terms of use](https://opensky-network.org/about/terms-of-use) limit free API use to non-profit research and non-profit education. Use by a for-profit or commercial entity needs a written license. Operational use of the REST API in a live product, service, or automated system also needs a written license, including for non-profit entities. Forks that go beyond this demo must read those terms and get a license when required. OpenSky often does not answer cloud hosts, which is why it is tried last.

If you use OpenSky data, credit the project as required by its terms:

> Bringing up OpenSky: A large-scale ADS-B sensor network for research, Matthias Schafer, Martin Strohmeier, Vincent Lenders, Ivan Martinovic, Matthias Wilhelm, ACM/IEEE International Conference on Information Processing in Sensor Networks, April 2014

> The OpenSky Network, http://www.opensky-network.org

The name "Schafer" is written here without a diacritic only to keep this file in plain ASCII in one line; the original citation uses the published spelling. See [docs/data-sources.md](docs/data-sources.md).

## Docs

- [docs/HANDOFF-fable.md](docs/HANDOFF-fable.md): build brief and kickoff prompt for the first implementation
- [docs/tech-spec.md](docs/tech-spec.md): stack, data path, conflict math, tests, UI, and acceptance
- [docs/safety.md](docs/safety.md): safety rules and disclaimer requirements
- [docs/data-sources.md](docs/data-sources.md): live feeds and their terms, citations
- [docs/roadmap.md](docs/roadmap.md): first build, then later ideas
- [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md)

## Credits

- Logo: the plane icon from [Lucide](https://lucide.dev), ISC license. The notice is in [docs/brand/LUCIDE-LICENSE.txt](docs/brand/LUCIDE-LICENSE.txt). It is a shared open-source icon, not a registered or exclusive mark.
- Map: [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, drawn with [Leaflet](https://leafletjs.com).
- Traffic: [adsb.fi](https://adsb.fi), [adsb.lol](https://adsb.lol), and [The OpenSky Network](https://opensky-network.org).

## License

MIT. See [LICENSE](LICENSE).
