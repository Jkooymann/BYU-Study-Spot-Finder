# BYU Study Spot Finder — front-end prototype

Open `index.html` in any browser. No server, build step, or install needed.

Favorite spots and spots you add on the Add a Spot page are saved in the team's Supabase database for the logged-in student, so everyone sees the added spots. Everything else is still saved only in your own browser.

## Files

| File | What it does |
|---|---|
| `index.html` | The single page shell. Loads the CSS and scripts. |
| `css/styles.css` | All styles. Colors are tokens at the top (primary navy, accent gold) with a dark-mode set. |
| `js/supabase-config.js` | The Supabase project URL and publishable key. |
| `js/data.js` | **The one mock data file.** 17 buildings (with real campus coordinates for the map), the filter options, and 26 study spots. Each spot's `dbId` is its `study_spot_id` in Supabase. |
| `js/db.js` | The only file that talks to Supabase: loads/adds/removes favorites, loads/adds/deletes student-added spots, and sign-up / log-in. |
| `js/store.js` | Reads the mock data, keeps shared favorites from `db.js`, and saves the rest in `localStorage` (active filters, and added spots when the database is off). Also holds the filter-matching logic. |
| `js/components.js` | Reusable pieces: top bar + ☰ menu + account dropdown, page header, no-results message, chips, spot card, busyness badge, group-size and indoors/outdoors pickers, floor plan, Filter Panel, Spot Details, toast. |
| `js/pages.js` | The pages: Get Started, Campus Map, Building Floor View, Study Spot List, Favorites, Add a Spot. |
| `js/recommend.js` | The ✨ **Suggest spots** button (bottom-right of every page) and its panel of AI picks. |
| `js/app.js` | Hash router and all click / keyboard handling. |

## Pages (URL hash)

| Spec page | Route |
|---|---|
| 1 Get Started | `#start` |
| 2 Campus Map | `#map`, or `#map-spot-s4` to show a spot's card above the map and highlight its building |
| 3 Building Floor View | `#building-hbll`, `#building-hbll-f3` |
| 5 Spot Details | `#spot-s4` (opens over the page you came from) |
| 6 Menu | ☰ dropdown in the top bar on every page (the logo also goes to Get Started) |
| 7 Study Spot List | `#list` |
| 8 Filter Panel | side panel (desktop) / bottom sheet (mobile) on Map, Floor View, and List |
| 9 Favorites | `#favorites` |
| 10 Add a Spot | `#add`, or `#add-jkb` with a building already picked |

## Notes on decisions

- Busyness is a typical level, not live data. It is labeled "est." everywhere and explained on Spot Details.
- Filters are the same everywhere: group size, Indoors / Outdoors (one choice: Anywhere, Indoors or Outdoors), seven features including WiFi, and building. Get Started shows the same features plus Indoors and Outdoors.
- When nothing matches, every page shows the same message with Change filters, Pick a random spot, and Clear all filters.
- Only the person who added a spot can delete it. Sample spots and other students' spots have no delete button.
- The Campus Map places each building from its latitude/longitude in `data.js`; shapes are simplified. Buildings without spots are drawn dashed and invite people to add one.
- The List sorts by Building or Least busy first (A–Z was removed).
- User-added spots get a default busyness of "Moderate" because the form has no busyness field.
- Group size is shown as a large picker above the Map, Floor View, and List, and at the top of the Filter Panel.
- To reset all user data, clear the site's localStorage (keys start with `byuStudySpots.`).

## Favorites and added spots (Supabase)

- Needs the migrations in `supabase/migrations/` applied to the database, and the publishable key in `js/supabase-config.js` (already filled in).
- If Add a Spot shows "Could not save your spot", paste `supabase/migrations/20261106060000_fix_add_spot.sql` into the Supabase SQL Editor and run it. It puts every piece saving needs in place (safe to run more than once) and ends with a checklist that should say "ok" on every row. The error message now says what went wrong; the full error is in the browser console (F12).
- Favorites are saved in `favorite_spot` for the logged-in student. Logged-out visitors who tap a star are asked to log in, and the Favorites page links to Log in.
- Spots added on the Add a Spot page are saved in `study_spot` (with `submitted_by_user_id` set to the logged-in student) and their tags in `study_spot_amenity`. Quiet zone and Talking allowed are amenities 8 and 9; Outdoors is `is_indoors`. Everyone sees every added spot; teammates' spots show an "Added by …" badge.
- Logged-out visitors are asked to log in before adding a spot. Students can delete only their own spots (`*_own_spots_only.sql`).
- The 11 buildings added to the map need `*_add_more_buildings.sql` (or `*_fix_add_spot.sql`) applied before students can add spots in them. The site looks up their ids by building code, so until then adding a spot there shows an error and nothing else breaks.
- If the key is missing or the database can't be reached, the site falls back to saving favorites and new spots on your device and says so on the Favorites and Add a Spot pages.
- Still demo-level security: the favorites policies in `*_allow_demo_favorites.sql` let anyone change any row. They should be tightened to `auth.uid()` so students can only change their own favorites.

## AI recommendations (✨ Suggest spots)

A button in the bottom-right corner of every page suggests 3–5 study spots based on
the spots the student saved as favorites. Each suggestion has a one-line reason and
opens that spot's details.

- **Where the AI runs.** `supabase/functions/recommend-spots/index.ts`, a Supabase
  Edge Function, calls Google Gemini (free tier) with the `GEMINI_API_KEY` secret. The
  browser never sees the key. Default model: `gemini-flash-latest`, falling back to
  `gemini-flash-lite-latest` if the first is out of quota. Set a `GEMINI_MODEL` secret to
  pin a specific model.
- **Works while spots change.** On every request the function reads the student's
  favorites and every spot (name, building, floor, indoors, noise, busyness, group size,
  tags, description) live from the database. Nothing about spots is hard-coded. Gemini
  may only pick from the spot ids it is sent, and every id it returns is checked before
  it reaches the page; the page then skips any spot it can't show. With lots of spots,
  the 120 closest matches to the favorites are sent.
- **No favorites** (or only favorites of deleted spots): the panel asks the student to
  save some first and the AI is not called. Logged-out visitors are asked to log in.
- **Free-tier protection.** Answers are cached in the `ai_recommendation` table: the same
  favorites and the same spots reuse the last answer for 7 days (editing a spot's details
  counts as a change). Fresh AI calls are limited to 8 per student per hour, 25 per
  student per day and 200 for the whole site per day. Change these with the secrets
  `AI_USER_HOURLY_LIMIT`, `AI_USER_DAILY_LIMIT` and `AI_SITE_DAILY_LIMIT`. When a limit or
  Gemini's own quota is hit, the panel shows a friendly "try again later" message.

### Set it up (once)

1. **Table.** Paste `supabase/migrations/20261106220000_ai_recommendations.sql` into
   Supabase → SQL Editor → New query → Run. It should print "ai_recommendation table ready".
2. **Secret.** Supabase → Edge Functions → Secrets: `GEMINI_API_KEY` (from Google AI Studio).
3. **Deploy the function**, either way:
   - *Dashboard:* Edge Functions → Deploy a new function → Via Editor. Name it exactly
     `recommend-spots`, replace the sample code with all of
     `supabase/functions/recommend-spots/index.ts`, and deploy. Then open the function's
     settings and turn **off** "Verify JWT" (the function checks the login itself, and the
     check at the gateway can reject the site's new-style publishable key).
   - *Command line:* `npx supabase login`, `npx supabase link --project-ref hpptrcuconnytcdqnicx`,
     then `npx supabase functions deploy recommend-spots --no-verify-jwt` from the repository root.
4. Log in on the site, favorite a spot or two, and click ✨. If it says it couldn't get
   suggestions, check Edge Functions → recommend-spots → Logs.

## Accounts

Visitors land on `#start` and can use the whole site without logging in. The
**Log in** button in the top bar (left of the ☰ menu) opens `#welcome`, with
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

### Browser checks

With the prototype server running on port 8000, run
`python3 prototype/tests/account_flow.py`, `python3 prototype/tests/ui_flow.py` and
`python3 prototype/tests/recommend_flow.py`
from the repository root. This requires
Python Playwright and Chromium (`CHROMIUM_PATH` can override `/usr/bin/chromium`;
`TEST_BASE_URL` can override the local server URL; `CONFIRM=1` simulates email
confirmation being on). The checks replace `js/db.js` with an in-memory fake and
block external requests, so no real accounts or favorites are changed.

## Campus overview map

`js/campus-map.js` defines the north-up exterior footprints, label/badge anchors,
and SVG landscape in one 900 × 850 illustration coordinate system. The overview
follows the supplied BYU campus-map screenshots: library and WSC in the center,
Tanner/Talmage/JKB to the northwest, the science buildings to the south, and lawns,
walkways, roads, fields, and muted nearby landmarks for orientation. It is an
approximate illustration rather than surveyed geometry or a live navigation map.
It uses local vectors and has no map API, tile server, API key, or network dependency.

The 17 existing building IDs still drive spot counts, filter highlighting, the
building directory, and links into the existing floor views. Background landmarks
are noninteractive orientation aids; their study spots/floors are not added here.
Floor plans remain unchanged and should be developed separately. When adding a
selectable building to `BUILDINGS`, add its footprint and label/badge anchors to
`CAMPUS_FOOTPRINTS`. Do not mix illustration coordinates with the lat/lng data.
On phones the overview scrolls horizontally and centers on the library or selected
building. Keyboard users can focus buildings and activate them with Enter or Space.

With the prototype served on port 8000, run `python3 prototype/tests/map_flow.py`
from the repository root (Python Playwright + Chromium; `CHROMIUM_PATH` and
`TEST_BASE_URL` are supported). It checks exterior paths, all 17 keyboard links,
mouse navigation, selected-spot highlighting, filters, mobile overflow/centering,
and explicit/automatic dark mode. External requests are blocked during testing.
