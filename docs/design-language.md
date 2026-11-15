# Design language: Scope glass

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

Decided November 15, 2026. Adam picked two directions, "Glass deck" and "Scope", and they were merged into one language.

## The project in three lines

- **Subject:** live aircraft over the United States, and which pairs a simple check thinks are converging.
- **Audience:** curious engineers, pilots, and people who followed the November 13 ground stop.
- **Primary job:** see the traffic, see what is flagged, and understand what the flag does and does not mean.

## What the interface is made of

| Kind | Count | What |
| --- | --- | --- |
| Interactive widgets | 4 kinds | sliders, text and number inputs, list buttons, one dialog |
| Data graphics | 1 | the map, which is most of the screen |
| Reading content | 1 | the "What is this?" panel |
| Marketing | 0 | none |

Shape: **data graphic**. The map is the product. Everything else serves it.

## Decision

- **Component library: none.** There are four kinds of control and no forms or accounts. A library would add weight to style things the app does not have.
- **Graphics: one HTML canvas**, drawn by hand in `components/TrafficCanvas.tsx`, over a Leaflet map. Several thousand aircraft cannot be DOM elements.
- **Design language: Scope glass.**

## Where it comes from

Three real things from the subject's own world:

1. **A controller's radar scope.** Black glass, small targets, a data block of text on a leader line beside each one. It lends the black background, the mono lettering, and the data block.
2. **A cockpit traffic display.** Each kind of traffic has its own shape as well as its own color, so a warning survives a glance and survives color blindness. It lends the shape code.
3. **A paper flight strip.** Dense rows of figures in fixed columns, no decoration. It lends the sidebar: hairline rules, square corners, figures that line up.

## Rules

Each one can be checked on a screenshot.

1. **The map background is black, and the base map is a faint backdrop.** Traffic is always the brightest thing on screen.
2. **Every state has its own shape and its own color.** Hollow diamond is unflagged traffic. Filled circle is an aircraft in a flagged pair. Filled square is the selected pair. No state is told apart by color alone.
3. **Text on the map has no box.** A data block is a leader line and lettering with a dark edge.
4. **One type family, mono, for the whole instrument.** The only exception is long prose in the story panel.
5. **Square corners and hairline rules.** No rounded cards, no shadows on the instrument itself.
6. **Amber and red are never decoration.** Amber means "flagged by the demo check". Red means "the pair you selected" or "something failed". The disclaimer bar is the one fixed amber surface.

## Tokens

Defined in `app/globals.css`.

| Layer | May it vary? | Tokens |
| --- | --- | --- |
| Neutrals | No | `bg` #000000, `panel` #05080b, `raised` #0d1318, `line` #1c252e, `fg` #dfe6ec, `muted` #8f9ba6 |
| Semantic | No | `accent` #35d0e0 (traffic, links, focus), `warn` #ffb000 (flagged), `danger` #ff4d3d (selected pair, failures), `track` #ff4fd8 (selected aircraft's track) |
| Theme | Not used | There is one theme. A light theme would be a new decision. |

## Type

- **Mono system stack** for everything: names, figures, labels. It needs no download and digits line up in columns.
- **System sans** for paragraphs in the story panel only, because long prose in mono is tiring.

## The signature element

The **data block**: callsign on the first line, then altitude in hundreds of feet and speed in tens of knots (for example `315 45`), on a short leader line. It is what makes the map read as a scope and not as a generic flight tracker. Everything around it stays quiet.

## Checked

- Desktop, 1440 by 900, by screenshot: whole-country view, a metro view, and a close view with data blocks.
- Phone, 375 by 812, by measurement: no horizontal scroll, the disclaimer stays on screen, and the legend moves into the sidebar so it does not cover the map.
- Contrast: `fg` and `muted` on `bg` are both above 4.5 to 1.
- Keyboard focus is visible on every control (2 px accent outline).

Not checked: a real phone, a screen reader, and reduced-motion settings (the only motion is the map's own pan and zoom).

## Options considered

| Option | Verdict | Why |
| --- | --- | --- |
| No component library | **Chosen** | Four kinds of control. |
| shadcn/ui | Not now | The right pick if the app grows forms, dialogs, or accounts. License and maintenance were not checked today. |
| MapLibre with vector tiles | Later | Would draw a true dark base map instead of darkening OpenStreetMap raster tiles in the browser. It is a swap of the map engine, so it needs its own decision. Not checked today. |
| Design language "Night chart" | Not chosen | Calmer and more public-friendly, but Adam preferred the other two. |

## Revisit when

- The app gains forms, accounts, or more than a handful of controls.
- A light theme is wanted.
- The base map changes engine.
