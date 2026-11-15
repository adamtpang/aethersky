# Roadmap

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

## Now

The repository is a placeholder plus this spec. The first implementation is the MVP in [HANDOFF-fable.md](HANDOFF-fable.md) and [tech-spec.md](tech-spec.md), delivered as a pull request, not a direct push to main, and not a production deploy.

## First shippable app (this pass)

- Live or mock traffic on a Leaflet OSM map
- Conflict engine with tests
- Sidebar, filters, disclaimer bar, MOCK DATA banner
- OpenSky proxy with cache, optional OAuth, and a safe fallback

## Pending follow-ups from the first build

Open items from the MVP pull request (adamtpang/aethersky#1), saved on November 15, 2026. Check each one off or delete it when it is settled.

- [ ] Review and merge the MVP pull request. Not merged yet, and nothing is deployed.
- [ ] First production deploy. Git-triggered Vercel builds are now skipped for this project (Ignored Build Step is `exit 0`), so deploy by hand with `vercel deploy --prod` from this folder once the pull request is merged. To let `main` build on its own instead, change the Ignored Build Step in Vercel under Settings, Git.
- [ ] Confirm the first deploy builds as Next.js. The Framework Preset was changed from the static placeholder to Next.js after a preview build failed with "No Output Directory named public". That failed build published nothing.
- [ ] Check whether OpenSky answers from Vercel. OpenSky may block cloud hosts, in which case live mode falls back to mock traffic on the deployed site.
- [ ] Decide on the grid prefilter change. The engine searches two cells out instead of the eight touching cells in the tech spec, because a fast head-on pair can start two cells apart and would otherwise be dropped. Either accept it and update section 7 of the tech spec, or pick a different fix.
- [ ] Delete `index.html`, the old placeholder page. It is unused. A workspace safety hook blocked removing it during the build.
- [ ] Decide whether mock should stay the default data source. It is the default now to protect the 400 anonymous OpenSky credits a day and to respect the non-profit terms. Live is opt-in.
- [ ] Decide whether to check vertical separation across the whole lookahead window. Today it is checked only at the moment of closest horizontal approach, as the tech spec defines it, so a pair inside both thresholds at some other moment is not flagged.
- [ ] Wire in PostHog with `tools/analytics/posthog-rollout.mjs` and add the site to `fleet.json`. This was outside the first brief.
- [ ] Reduce label overlap when aircraft are close together at low zoom.

## Later, only after the MVP is honest and reviewed

1. Better kinematics (turn rate, or a short history trail) clearly labeled as still advisory
2. Shareable bbox and threshold query parameters
3. A documented way for a licensed OpenSky user to plug in credentials on their own fork
4. Optional extra public data sources, each with its own terms section
5. Accessibility pass (keyboard selection, contrast, screen-reader labels on the disclaimer)

## Not on the roadmap

- Certification, or any path that implies this could replace ATC or TCAS
- Removing the disclaimer
- Paid default data providers
- Storing or selling track data in a way that conflicts with OpenSky terms
