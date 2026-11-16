# Roadmap

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

## Now

The repository is a placeholder plus this spec. The first implementation is the MVP in [HANDOFF-fable.md](HANDOFF-fable.md) and [tech-spec.md](tech-spec.md), delivered as a pull request, not a direct push to main, and not a production deploy.

## First shippable app (this pass)

- Live traffic on a Leaflet OSM map
- Conflict engine with tests
- Sidebar, filters, disclaimer bar, LIVE DATA UNAVAILABLE banner
- Live feed chain (adsb.fi, adsb.lol, OpenSky) with a cache and an honest unavailable state

## Pending follow-ups from the first build

Open items from the MVP pull request (adamtpang/aethersky#1), saved on November 15, 2026. Check each one off or delete it when it is settled.

- [x] Review and merge the MVP pull request. Merged on November 15, 2026 at Adam's request. Nothing is deployed yet.
- [x] First production deploy (done November 15, 2026, by hand).
- [ ] Deploys stay manual. Git-triggered Vercel builds are now skipped for this project (Ignored Build Step is `exit 0`), so deploy by hand with `vercel deploy --prod` from this folder once the pull request is merged. To let `main` build on its own instead, change the Ignored Build Step in Vercel under Settings, Git.
- [ ] Confirm the first deploy builds as Next.js. The Framework Preset was changed from the static placeholder to Next.js after a preview build failed with "No Output Directory named public". That failed build published nothing.
- [x] Check whether OpenSky answers from Vercel. It does not (timed out on November 15, 2026), so it is now the third choice.
- [x] Check that adsb.fi answers from Vercel. It does (November 15, 2026).
- [x] Check that the national sweep finishes on Vercel. It does: 30 of 30 regions in 32 seconds, and repeat requests are served from the CDN cache (November 15, 2026).
- [x] Check that the streamed version behaves the same on Vercel. It does: regions arrive one by one, and repeat requests are served from the CDN cache in 0.2 seconds (November 15, 2026).
- [x] Flagged pairs were dominated by slow traffic near airports (about 480 nationally). An adjustable check floor, default 10,000 ft and labeled a demo default, cut that to about 27 in one test.
- [x] The map moves between refreshes: positions advance every 5 seconds and are labeled as estimates.
- [ ] Alaska and Hawaii are not covered.
- [ ] Get a free adsb.lol key and set `ADSBLOL_API_KEY` in Vercel, so the backup feed has more than 500 requests a day.
- [ ] Check with adsb.fi that this use is fine. Its open data terms say personal, non-commercial use.
- [ ] Decide on the grid prefilter change. The engine searches two cells out instead of the eight touching cells in the tech spec, because a fast head-on pair can start two cells apart and would otherwise be dropped. Either accept it and update section 7 of the tech spec, or pick a different fix.
- [ ] Delete `index.html`, the old placeholder page. It is unused. A workspace safety hook blocked removing it during the build.
- [x] Decide the data source. Adam chose real traffic only on November 15, 2026. Mock is removed from the app and kept only as a test fixture. Feeds are adsb.fi, then adsb.lol, then OpenSky.
- [ ] Ask OpenSky about a license (contact@opensky-network.org) if OpenSky ever becomes a main feed again. It is now only the third choice.
- [ ] Watch feed limits once the site has visitors. All visitors share the server address, so adsb.fi (1 request a second) and adsb.lol (500 a day) limits are shared too.
- [x] Vertical separation is now checked across the whole lookahead window.
- [ ] Wire in PostHog with `tools/analytics/posthog-rollout.mjs` and add the site to `fleet.json`. This was outside the first brief.
- [x] Labels are now data blocks drawn only when zoomed in and when at most 120 aircraft are in view.
- [x] Scope glass design pass (see design-language.md).
- [x] Fixed: aircraft could vanish after zooming or after the tab sat in the background. The page was judging cached positions against the wrong clock and discarding all of them. It now reads the server clock from the stream, refreshes as soon as a tab returns, and asks again at once if everything has expired.
- [x] "Conflicts only" view, a plain definition of a conflict, and an info card when an aircraft is clicked.
- [x] Colors now follow the small airplane emoji.
- [x] The story moved from a popup that opened on arrival to an About page in the nav bar (Adam, November 15, 2026).
- [x] Conflict resolution illustration: clicking a flagged aircraft shows one small change that would clear the pair.
- [x] Detection blind spot closed: the check now covers the whole window, so an aircraft climbing through another's level is caught.
- [x] Link previews: the site now sends a preview image, title, and description when shared.
- [ ] On cached data the page clock runs about 18 seconds behind, so aircraft are drawn slightly behind.
- [x] Cold start: a first visitor used to watch the map fill in for about 30 seconds. The page now shows the last finished sweep faintly and labeled while live traffic loads, and regions load spread across the country.
- [ ] Ask adsb.fi for a higher request rate. The 30 second sweep comes from their limit of 1 request per second. This is the only thing that makes the real number smaller.
- [ ] Look at the site on a real phone. Layout was measured at 375 px wide, not seen on a device.

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
