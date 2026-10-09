# BYU Study Spot Finder — front-end prototype

Open `index.html` in any browser. No server, build step, or install needed.

## Files

| File | What it does |
|---|---|
| `index.html` | The single page shell. Loads the CSS and scripts. |
| `css/styles.css` | All styles. Colors are tokens at the top (primary navy, accent gold) with a dark-mode set. |
| `js/data.js` | **The one mock data file.** Buildings, filter list, and 24 study spots across 6 buildings. |
| `js/store.js` | Reads the mock data and saves user data in `localStorage` (favorites, ratings, active filters, saved filters, recent filters, user-added spots, deleted sample spots). Also holds the filter-matching logic. |
| `js/components.js` | Reusable pieces: top bar + Home Menu, chips, spot card, busyness badge, group-size picker, star rating, floor plan, Filter Panel, Spot Details, toast. |
| `js/pages.js` | The pages: Get Started, Campus Map, Building Floor View, Study Spot List, Favorites & Saved Filters, Add a Spot. |
| `js/app.js` | Hash router and all click / keyboard handling. |

## Pages (URL hash)

| Spec page | Route |
|---|---|
| 1 Get Started | `#start` |
| 2 Campus Map | `#map`, or `#map-spot-s4` to highlight a spot |
| 3 Building Floor View | `#building-hbll`, `#building-hbll-f3` |
| 5 Spot Details | `#spot-s4` (opens over the page you came from) |
| 6 Home Menu | dropdown in the top bar on every page |
| 7 Study Spot List | `#list` |
| 8 Filter Panel | side panel (desktop) / bottom sheet (mobile) on Map, Floor View, and List |
| 9 Favorites & Saved Filters | `#favorites`, `#favorites-filters` |
| 10 Add a Spot | `#add` |

## Notes on decisions

- Busyness is a typical level, not live data. It is labeled "est." everywhere and explained on Spot Details.
- Get Started's "Indoors" chip has no checkbox in the Filter Panel (the panel uses the exact spec list). It shows as a removable "Indoors" chip. Picking both Indoors and Outdoors shows both.
- Deleting a sample spot hides it on this device only. "Restore deleted sample spots" at the bottom of the List brings them back. Deleting a user-added spot removes it.
- User-added spots get a default busyness of "Moderate" because the form has no busyness field.
- Group size is shown as a large picker above the Map, Floor View, and List, and at the top of the Filter Panel.
- To reset all user data, clear the site's localStorage (keys start with `byuStudySpots.`).
