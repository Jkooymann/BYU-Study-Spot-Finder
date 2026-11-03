# BYU Study Spot Finder — front-end prototype

Open `index.html` in any browser. No server, build step, or install needed.

Favorite spots are saved in the team's Supabase database, so everyone sees them. Pick which sample student you are from the dropdown in the top bar (there is no sign-in yet). Everything else is still saved only in your own browser.

## Files

| File | What it does |
|---|---|
| `index.html` | The single page shell. Loads the CSS and scripts. |
| `css/styles.css` | All styles. Colors are tokens at the top (primary navy, accent gold) with a dark-mode set. |
| `js/supabase-config.js` | The Supabase project URL and publishable key. |
| `js/data.js` | **The one mock data file.** Buildings, filter list, and 26 study spots across 6 buildings. Each spot's `dbId` is its `study_spot_id` in Supabase. |
| `js/db.js` | The only file that talks to Supabase: loads students, loads/adds/removes favorites. |
| `js/store.js` | Reads the mock data, keeps shared favorites from `db.js`, and saves the rest in `localStorage` (ratings, active filters, saved filters, recent filters, user-added spots, deleted sample spots). Also holds the filter-matching logic. |
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

## Shared favorites (Supabase)

- Needs `supabase/migrations/20261009230000_allow_demo_favorites.sql` and the latest `supabase/seed.sql` in the database, and the publishable key in `js/supabase-config.js` (already filled in).
- The "Viewing as" dropdown lists the rows in `student_user`. Favorites are saved for that student in `favorite_spot`.
- This is demo-only: anyone with the site can change any sample student's favorites. Real sign-in should replace the dropdown and tighten the policies in that migration.
- Spots you add yourself on the Add a Spot page are not in the database yet, so favoriting one of those stays on your device.
- If the key is missing or the database can't be reached, the site falls back to saving favorites on your device and says so on the Favorites page.
- Teammates' changes show up when you reload or come back to the tab.

## Account pages and teammate handoff

Visitors enter at `#welcome`, with `#signup` and `#login` available. Existing app
routes redirect to welcome until `AccountSession` has a verified session.
The header keeps the same app name and pin icon without app navigation.

`js/account.js` owns the forms and integration boundary. Signup validates a Net ID,
a password of at least 8 characters, and a matching confirmation. Net IDs are
trimmed and lowercased; a pasted `@byu.edu` suffix is accepted and normalized.
Other email domains and spaces are rejected. Passwords are kept exactly as typed.

Connect `AccountAPI.createAccount({ email, netId, password })` to the auth provider.
For example, Net ID `jsmith` produces email `jsmith@byu.edu`. Confirmation passwords
are validated locally and are never included in the payload. Do not store plaintext
passwords in a database table; send them to the authentication provider. The existing
`DB.signUp` helper is available for the teammate implementing this connection.

The adapter must resolve to `{ authenticated: false }` when creation succeeds but
email confirmation or login is still needed, or `{ authenticated: true }` only when
a signed-in session has been verified. Rejections display a generic error, clear
password fields, and allow retry. Pending submits are disabled; leaving the form
prevents a late response from redirecting the user. The default adapter deliberately
rejects until connected, so it never claims to have created an account.

Login is a styled placeholder and does not authenticate. The login implementer
should call `AccountSession.completeSignIn()` only after verifying authentication.
Session restoration is also left to that integration; the current flag is memory
only and resets on reload. This client-side route guard establishes the UI flow;
actual data protection must use provider authentication and database policies.
The existing demo student picker/shared-favorites behavior is unchanged and must
be replaced with authenticated-user ownership as part of that work.

Credentials are never written to browser storage or logs. Backend refreshes do not
rerender account forms while someone types. The signup form includes visible labels,
inline validation, focus management, password visibility, and mobile/dark styles.

### Account flow browser checks

With the prototype server running on port 8000, run
`python3 prototype/tests/account_flow.py` from the repository root. This requires
Python Playwright and Chromium (`CHROMIUM_PATH` can override `/usr/bin/chromium`;
`TEST_BASE_URL` can override the local server URL). The checks block external
requests and mock account adapters, so no shared accounts or favorites are changed.
They cover validation, the normalized payload, adapter failure and success,
login placeholder, route gating, reload behavior, existing cards, and responsive
layout overflow. These checks do not validate real authentication or Supabase writes.
