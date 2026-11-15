# CLAUDE.md - aethersky

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

Read `docs/safety.md` and `docs/tech-spec.md` before changing anything. The disclaimer wording, its always-visible placement, the LIVE DATA UNAVAILABLE banner, and the "demo defaults, not regulatory" threshold labels are safety requirements, not style choices.

Real traffic only (Adam, 2026-11-15: "no mock data, i want real only"). The app never draws simulated or scripted aircraft. When no live feed answers it shows nothing and says so. Scripted aircraft live only in test fixtures.

## Template

Scaffolded on 2026-11-15 from the official Next.js starter, `create-next-app@16.4.6` (template `app-tw`: App Router, TypeScript, Tailwind CSS, ESLint). Source: https://nextjs.org/docs/app/api-reference/cli/create-next-app. MIT licensed. Leaflet, react-leaflet, and Vitest were added on top.

This Next.js version differs from older ones. Read the matching guide in `node_modules/next/dist/docs/` before using a Next.js API.

## Design

The look is "Scope glass". Read `docs/design-language.md` before changing UI. No component library. Every map state has its own shape as well as its own color.

## Rules

- No em dashes anywhere (code, comments, UI copy, commits, PR text).
- Dark UI. No Mapbox, no paid tiles, no paid data.
- No secrets in git. `.env`, `.env.local`, and `.vercel` stay untracked.
- Branch and pull request only. Do not push to `main`. Do not deploy; Adam deploys.
- `lib/conflict` stays pure TypeScript with no React or Next.js imports.
- Do not weaken fixtures F1 through F8 in `lib/conflict/detect.test.ts`.
