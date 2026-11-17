# OKR 1 session tracking

OKR 1: **80% of users spend less than 10 minutes in a single session, not counting their first session.**

| File | What it does |
|---|---|
| `okr-api.js` | Calls the three database functions with plain `fetch`, sending the logged-in person's access token (`DB.accessToken()` in `js/db.js`). |
| `session-tracker.js` | Starts a session for the logged-in student, heartbeats every 30 s while the tab is visible, ends it on logout. `getTrackingUserId()` says who is logged in. |
| `okr-stats-panel.js` | `OKRStatsPanel.mount(element)`: the stats card. Brings its own styles. |
| `../../okr-stats.html` | Stand-in for the admin page; shows the panel. |
| `supabase/migrations/20261116220000_okr1_session_tracking.sql` | `user_session` table (`user_id` → `student_user`), `okr_start_session()`, `okr_heartbeat()`, `okr1_stats()`, view `okr1_session_lengths`. |

**Rules.** One session = one browser tab for one logged-in student, from opening the
site (or logging in) until the tab closes (or they log out). Reloads keep the session.
Logged-out visitors aren't tracked. Length = last heartbeat − start, both stamped by
the database clock. The database finds the student from the login (`auth.uid()`), so
nobody can record sessions for someone else. Each student's first session is left out,
and so are sessions heard from in the last 2 minutes (still open).

**Hooks into the rest of the site:** two `<script>` lines at the end of
`prototype/index.html`, one line in `App.loadShared()` (`js/app.js`) that calls
`SessionTracker.sync()` after each login check, and `DB.accessToken()` in `js/db.js`.

## Move the panel to the admin page

On the admin page add a `<div id="okr1-panel"></div>`, load `js/supabase-config.js`,
`js/okr/okr-api.js` and `js/okr/okr-stats-panel.js`, then call
`OKRStatsPanel.mount(document.getElementById('okr1-panel'))`. Delete `okr-stats.html`.
Don't load `session-tracker.js` on the admin page, so admins viewing stats aren't counted.

## Remove it completely

Delete `prototype/js/okr/`, `prototype/okr-stats.html`, the two `js/okr/` script lines
in `prototype/index.html`, and the `SessionTracker.sync()` line in `js/app.js`. In
Supabase, run the "Undo" lines at the end of the migration file.
