# Gap analysis: aethersky vs Casey Handmer's "US airspace on a toothbrush CPU"

One sentence: Casey's demo is the right yardstick because it comes from the person whose post started this project and it does the half of the job aethersky does not (resolving conflicts), and this measures aethersky against it.

## The benchmark

- What: [faa.caseyhandmer.com](https://faa.caseyhandmer.com/), "US airspace on a toothbrush CPU". A simulated day of US traffic with conflict detection and resolution, run on an emulated ESP32-C3 chip.
- Why this is the right yardstick, not just a flattering comparison: it is a working answer to the same question, by the author of the idea, and it is ahead of aethersky on several dimensions. It is also behind on a few, which is where aethersky has something to offer.
- Source: the live page and its `data/summary.json`, read on 2026-11-15. No public repository was found (page source, the `CHandmer` GitHub account, and a GitHub search were checked).

## The dimensions (fact-based, not vibes)

| Dimension | What the benchmark has/does | aethersky today | Grade | Closes when |
|---|---|---|---|---|
| Real traffic | Simulated: 45,000 scheduled flights, about 5,000 airborne at the peak | Live ADS-B from adsb.fi, about 4,500 to 5,900 airborne, refreshed about once a minute | 🟢 ahead | Already ahead. Stays green while the live feed works. |
| Country-wide detection | Every pair checked every 5 seconds | Every pair checked every 5 seconds in a web worker, 10 to 17 ms on a laptop | 🟢 | Already matched. |
| Open code | No repository found | Public, MIT, with a "Hack on it" guide | 🟢 ahead | Already ahead. |
| Lookahead | 5 minutes | 2 minutes by default, slider up to 5 | 🟡 | A 5 minute check is the default or a one-click option, and the extra false alarms from straight-line guessing are measured and stated. |
| Airspace-aware rules | 5 nmi and 1,000 ft en route, 3 nmi in terminal airspace, tower traffic left out of the solver | One rule everywhere, plus a blunt floor: nothing below 10,000 ft is checked | 🟡 | Terminal areas use a tighter rule and are checked, in place of ignoring everything below the floor. |
| Portable, tiny compute | A C kernel in 133.5 KB of RAM, about 40 ms per solve on an emulated 160 MHz chip, every solve checked bit-identical against a native build | TypeScript in a browser. Fast, but tied to a laptop and a JavaScript engine | 🟡 | The check runs outside a browser from the same code (for example as WebAssembly or a small native build) with a stated memory and time budget. |
| Conflict resolution | Issues instructions (turn 20 or 45 degrees, level off, reduce speed) and the simulated aircraft obey. 14 clearances for 15 predicted conflicts in one sampled cycle | For a selected flagged pair, shows one small change that clears it and the separation predicted after it, checked against nearby traffic over the whole window, labeled as an illustration, with tests (`lib/conflict/resolve.ts`). Nothing obeys it: real aircraft keep flying as they were | 🟡 | A closed loop exists somewhere: either a replay of recorded traffic where the suggested changes are applied and the outcome is counted, or the benchmark solver run on this live feed. |
| Measured outcomes | A full day of results: 880 pairs lost separation over the day, per-solve timing for all 17,280 solves, charts across 24 hours | No history. Nothing measures how often a flag was a false alarm | 🔴 | The app records flags over time and reports how many flagged pairs actually came close, from recorded real traffic. |
| Hardware path | A proposed board, pinout, and the exact data frames in and out over USB or Wi-Fi | None. Needs the internet, a server, and a third-party feed | 🔴 | The check runs from a local ADS-B radio receiver with no internet connection. |

**Distance: 3/9 dimensions green, with conflict resolution moved from red to amber on 2026-11-15.** Two of the three greens are places where aethersky is ahead of the benchmark, not merely level. N is 9 today and can grow. This is a count of dimensions, not a percentage of the way there.

Verification notes (2026-11-15): Benchmark side read live from the page and `data/summary.json` (5 minute lookahead, 5 second step, 45,000 flights, peak 5,022 airborne, 880 loss-of-separation pairs, 17,280 solves all bit-identical, 136 KB static RAM). aethersky side from the code merged to `main` at `902685d` and the live site: `lib/conflict/regional.ts` and `lib/conflict/worker.ts` (detection, worker), `lib/types.ts` (120 second default, 10,000 ft floor), `lib/nationalFeed.ts` (live sweep), measured 10 to 17 ms per check and 4,455 live aircraft on the deployed site. Not verified: how the benchmark's solver chooses a resolution, since its code is not public.

## Next dimension to close

**Measured outcomes.** Conflict resolution now exists as an illustration, so the weakest point is that nothing is measured. aethersky cannot say how often a flag is a false alarm, or how often its suggested change would have worked. Recording live traffic for a day and replaying it would answer both, and would also close the loop on resolution.

Building the resolution illustration surfaced two findings worth keeping:

- With the default 2 minute lookahead, a fast head-on pair often cannot be cleared by one aircraft making one small change. With 5 minutes it can. That is evidence for the benchmark's 5 minute lookahead, and for moving the "Lookahead" dimension next.
- The detection check looks at vertical separation only at the moment of closest horizontal approach. The resolution check had to scan the whole window to be safe. The detection check should do the same.
