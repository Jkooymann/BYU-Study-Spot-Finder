# BYU Study Spot Finder — front-end prototype

Open `index.html` in any browser. No server, build step, or install needed.

Favorite spots and spots you add on the Add a Spot page are saved in the team's Supabase database, so everyone sees them. Pick which sample student you are from the dropdown in the top bar (there is no sign-in yet). Everything else is still saved only in your own browser.

## Files

| File | What it does |
|---|---|
| `index.html` | The single page shell. Loads the CSS and scripts. |
| `css/styles.css` | All styles. Colors are tokens at the top (primary navy, accent gold) with a dark-mode set. |
| `js/supabase-config.js` | The Supabase project URL and publishable key. |
| `js/data.js` | **The one mock data file.** Buildings, filter list, and 26 study spots across 6 buildings. Each spot's `dbId` is its `study_spot_id` in Supabase. |
| `js/db.js` | The only file that talks to Supabase: loads students, loads/adds/removes favorites, loads/adds/deletes student-added spots. |
| `js/store.js` | Reads the mock data, keeps shared favorites from `db.js`, and saves the rest in `localStorage` (ratings, active filters, saved filters, recent filters, deleted sample spots, and added spots when the database is off). Also holds the filter-matching logic. |
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

## Shared favorites and added spots (Supabase)

- Needs `supabase/migrations/20261009230000_allow_demo_favorites.sql`, `supabase/migrations/20261104120000_allow_demo_user_spots.sql`, and the latest `supabase/seed.sql` in the database, and the publishable key in `js/supabase-config.js` (already filled in).
- The "Viewing as" dropdown lists the rows in `student_user`. Favorites are saved for that student in `favorite_spot`.
- This is demo-only: anyone with the site can change any sample student's favorites. Real sign-in should replace the dropdown and tighten the policies in that migration.
- Spots added on the Add a Spot page are saved in `study_spot` (submitted by the "Viewing as" student) and their tags in `study_spot_amenity`. Quiet zone and Talking allowed are amenities 8 and 9; Outdoors is `is_indoors`. Teammates' spots show an "Added by …" badge, and anyone can delete them (demo only).
- If the database can't be reached when the site loads, new spots are saved on your device instead, and favorites of those stay on your device too.
## Favorites (Supabase)

- Needs the migrations in `supabase/migrations/` applied to the database, and the publishable key in `js/supabase-config.js` (already filled in).
- Favorites are saved in `favorite_spot` for the logged-in student. Logged-out visitors who tap a star are asked to log in, and the Favorites page links to Log in.
- Spots you add yourself on the Add a Spot page are not in the database yet, so favoriting one of those stays on your device.
- If the key is missing or the database can't be reached, the site falls back to saving favorites on your device and says so on the Favorites page.
- Still demo-level security: the favorites policies in `*_allow_demo_favorites.sql` let anyone change any row. They should be tightened to `auth.uid()` so students can only change their own favorites.

## Accounts

Visitors land on `#start` and can use the whole site without logging in. The
**Log in** button in the top bar (left of the Home button) opens `#welcome`, with
`#signup` and `#login` available from there.

- **Create account** (`js/account.js`) asks for name, BYU Net ID, password (8+ characters)
  and a matching confirmation, then calls
  `DB.signUp({ email, password, displayName, netId })`. Net ID `jsmith` becomes
  `jsmith@byu.edu`. Supabase Auth stores the login, and the trigger in
  `*_save_new_users.sql` adds the person to `student_user`.
- After sign-up the user is sent to **Log in** with their Net ID filled in. If
  Supabase's "Confirm email" setting is on, the page tells them to click the link in
  their BYU email first. The link returns to this site (see `emailRedirectTo` in
  `js/db.js`; that address must be allowed under Authentication → URL Configuration).
- **Log in** calls `DB.signIn`, loads the student's favorites and shows their name in
  the top bar. Clicking the name opens a menu with **Log out**.
- Supabase keeps the session in the browser, so people stay logged in after a reload.
  Logged-in users who open `#welcome`, `#login` or `#signup` are sent to Get Started.
- Passwords go straight to Supabase and are never stored or logged by the site.

### Account flow browser checks

With the prototype server running on port 8000, run
`python3 prototype/tests/account_flow.py` from the repository root. This requires
Python Playwright and Chromium (`CHROMIUM_PATH` can override `/usr/bin/chromium`;
`TEST_BASE_URL` can override the local server URL; `CONFIRM=1` simulates email
confirmation being on). The checks replace `js/db.js` with an in-memory fake and
block external requests, so no real accounts or favorites are changed.
