# Roadmap

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

## Now

The repository is a placeholder plus this spec. The first implementation is the MVP in [HANDOFF-fable.md](HANDOFF-fable.md) and [tech-spec.md](tech-spec.md), delivered as a pull request, not a direct push to main, and not a production deploy.

## First shippable app (this pass)

- Live or mock traffic on a Leaflet OSM map
- Conflict engine with tests
- Sidebar, filters, disclaimer bar, MOCK DATA banner
- OpenSky proxy with cache, optional OAuth, and a safe fallback

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
