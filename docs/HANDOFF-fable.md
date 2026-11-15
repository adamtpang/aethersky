# Fable handoff: aethersky MVP

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

This file plus [tech-spec.md](tech-spec.md), [safety.md](safety.md), and [data-sources.md](data-sources.md) is the complete build brief. Read them, and the root [README.md](../README.md), before writing code. Do not invent a different algorithm, a different disclaimer, or silent default numbers when a value is already specified.

## Copy-paste kickoff prompt

Paste the block below to Fable as the starting prompt.

```
You are Fable, building the aethersky MVP on bubba.

Work in C:\Users\adamp\Aether\aethersky. The repo is https://github.com/adamtpang/aethersky, already cloned, on branch main. Live placeholder: https://aethersky.vercel.app (Vercel project name: aethersky).

Read docs/HANDOFF-fable.md, docs/tech-spec.md, docs/safety.md, and docs/data-sources.md in full before writing any code. Follow them exactly. Use the root README.md for product framing and citations.

Build the first version: a Next.js App Router + TypeScript + Tailwind app with a Leaflet map (OSM tiles, no Mapbox token), an OpenSky (or mock) aircraft feed, a pure TypeScript conflict engine, Vitest tests with the known geometry cases, and a dark UI. Keep the advisory disclaimer visible at all times and not dismissible.

Rules you must not break:
- Disclaimer text, exact: "Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation."
- Dark UI. No em dashes anywhere (code, comments, UI copy, commits, or PR text).
- Every numeric threshold is labeled a demo default, not a regulatory minimum. The shipped defaults are 5 NM lateral, 1000 ft vertical, and 120 s lookahead.
- No secrets in the repo. Do not commit .env, .env.local, or .vercel. Do not print tokens. Optional OpenSky credentials stay in env vars only.
- Do not push to main. Branch off main and open a pull request against main.
- Do not deploy to Vercel (production or preview). Production does not auto-redeploy unless Adam changes that. Adam deploys or asks.
- No paid plans, signups, or spending. No Mapbox, no paid map tiles, no paid ADS-B APIs.
- Respect OpenSky terms: non-profit research and education for the free API; credit OpenSky; fall back to deterministic mock traffic (flagged MOCK DATA) on errors, 429s, or when the user chooses mock.

When the acceptance criteria in docs/HANDOFF-fable.md are met, open the PR, paste the PR URL, and stop. Do not merge. Do not deploy.
```

## Goal

Ship a working, clearly disclaimed advisory demo that:

1. Shows aircraft on a map with heading, altitude, speed, and a short velocity vector.
2. Flags pair-wise geometric conflicts using the engine in [tech-spec.md](tech-spec.md).
3. Lets a user inspect a selected aircraft, filter the list, and tighten or loosen demo thresholds.
4. Runs on mock traffic with known conflict pairs when live data is unavailable, and never fails silently into an official-looking blank map.

The first build should take about 3 to 4 hours. Clarity and safety labeling beat extra features.

## Scope

In scope:

- Next.js App Router, TypeScript, Tailwind, Leaflet with react-leaflet and OSM tiles
- `app/api/aircraft/route.ts` as specified in the tech spec
- Deterministic mock traffic that includes conflict pairs, with a MOCK DATA banner
- `lib/conflict` engine, grid prefilter, Vitest cases F1 through F8
- Map, markers, vectors, conflict lines, sidebar, filters, always-on disclaimer bar
- A PR against main when done

Out of scope for this pass:

- Any claim of certification or operational use
- 3D globe, weather, or terrain
- Alert audio, or writing to avionics
- Paid data or paid maps
- Pushing to main, merging, or deploying
- Secrets, new signups, or spending

If time runs short, keep global threshold sliders and cut per-station-style extras (there are none required). Do not cut the disclaimer, the MOCK DATA flag, or the fixture tests.

## Stack

- Next.js App Router (current stable), TypeScript, Tailwind CSS
- Leaflet + react-leaflet, OSM default tiles (and the standard OSM attribution)
- Vitest for the engine
- Deploy target later (Adam only): the existing Vercel project named exactly `aethersky`, already linked or to be linked to this repo. Do not create a second project. Do not change billing.

## Rules

- Dark UI.
- No em dashes in any file you add or edit.
- Disclaimer always visible, never dismissible, exact wording.
- Demo thresholds labeled "not regulatory" in the UI.
- No secrets in git or in chat.
- No paid services.
- Branch and PR only. No deploy.

## Deploy and git notes

- The placeholder at https://aethersky.vercel.app was deployed on November 15, 2026 so the name would be held. Production may not auto-redeploy when main moves.
- Fable must not deploy with the Vercel CLI or dashboard, and must not push to `main`.
- Branch from current `main`, commit on the branch, and open a pull request against `main`.
- Adam deploys production, or asks someone to, after he reviews.

## Acceptance criteria

The PR is ready when all of the following are true:

1. `npm test` (or the repo's equivalent) passes, including fixtures F1 through F8 in [tech-spec.md](tech-spec.md) with the stated expected outputs.
2. `npm run build` succeeds.
3. `npm run dev` shows a dark map page. The exact disclaimer is visible without a close button. On mock data, a MOCK DATA banner is visible.
4. Aircraft markers rotate with heading, show callsign, altitude, ground speed, heading, and vertical rate, and draw a velocity vector (default 60 s projection).
5. Conflict pairs are highlighted (line plus color). The sidebar lists conflicts sorted by time to CPA.
6. Filters work: altitude band, text search, threshold sliders. The data-source toggle switches live proxy vs mock, and a live failure falls back to mock instead of hanging blank.
7. Grounded aircraft are excluded from conflict checks.
8. No Mapbox token, no secrets in the diff, no em dashes, no paid dependencies.
9. A PR is open against `main`. Fable has not merged it and has not deployed.

## Ordered task checklist (about 3 to 4 hours)

Work in this order. Times are estimates and should sum to about 210 to 240 minutes.

1. Scaffold (25 min). Branch off `main`. Add Next.js App Router, TypeScript, Tailwind, Leaflet, react-leaflet, and Vitest. Keep the disclaimer in the first UI. Do not commit `node_modules/`, `.env*`, or `.vercel/`. Add `.env.example` only if you change it, with comments and no secrets.
2. Types, units, and mock traffic (20 min). Shared aircraft types, unit helpers (meters, feet, NM, m/s, knots), and a deterministic mock set with at least two conflict pairs plus non-conflicts and one on-ground aircraft, as specified in the tech spec.
3. Conflict engine and tests (50 min). Implement ENU, CPA, vertical filter, on-ground skip, and the grid prefilter. Lock fixtures F1 through F8.
4. Aircraft API route (30 min). `app/api/aircraft/route.ts`: bbox proxy to OpenSky `/api/states/all`, optional OAuth2 client credentials, about 10 s cache, 429 handling, anonymous default, mock fallback with a `source: "mock"` flag.
5. Map (35 min). Leaflet OSM map, rotating markers, labels, 60 s vectors, conflict lines and colors. No Mapbox.
6. Sidebar and filters (25 min). Selected aircraft details, conflict list by time to CPA, altitude filter, search, threshold sliders, live vs mock toggle.
7. Disclaimer, banners, polish (15 min). Fixed disclaimer bar, MOCK DATA banner, OSM and OpenSky attribution, "demo default, not regulatory" labels, dark contrast pass.
8. Verify and open the PR (15 to 20 min). `npm test` and `npm run build` green. Push the branch, open a PR against `main` with a short summary (how to run, reminder not to deploy until Adam says yes). Do not merge. Do not deploy.

## After the PR

Stop and report the PR URL. Do not start later-roadmap work in this pass.
