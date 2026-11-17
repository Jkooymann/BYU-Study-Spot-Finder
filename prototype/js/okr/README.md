# OKR tracking

OKR 1: **80% of users spend less than 10 minutes in a single session, not counting their first session.**

| File | What it does |
|---|---|
| `okr-api.js` | Calls the database functions with plain `fetch`, sending the logged-in person's access token (`DB.accessToken()` in `js/db.js`). |
| `session-tracker.js` | Counts a logged-in student's **active** time and reports it every 30 s. `getTrackingUserId()` says who is tracked (nobody for logged-out visitors and the admin). |
| `okr-stats-panel.js` | `OKRStatsPanel.mount(element)`: the OKR 1 card with its Refresh button. Brings its own styles. |
| `okr-trackers-page.js` | The **OKR Trackers** page (`#okr`), team admin only. Lists every tracker in `TRACKERS`. |
| `supabase/migrations/20261116220000_okr1_session_tracking.sql` | `user_session` table, `okr_start_session()`, `okr_heartbeat()`, `okr1_stats()`, view `okr1_session_lengths`. |
| `supabase/migrations/20261118020000_okr_admin_only_and_active_time.sql` | Makes the numbers admin only, leaves the admin out, and switches to active time. |

## Rules

**Active time.** Clicks, taps, key presses and scrolling count as activity (so does opening
or reloading the page while it's visible). Time counts from each activity until the next
one, but stops **2 minutes** after the last activity and whenever the page is hidden
(another tab, phone locked). It's worked out from timestamps when things happen, not
from a running timer, so a phone pausing the page can't add time.

**Sessions.** One session = one stretch of activity in one browser tab. Coming back within
2 minutes of the last activity continues the session (without the hidden time); coming back
later starts a new session on the next activity, and the gap is never added to the old one.
Reloads keep the session. Logged-out visitors aren't tracked.

**Counting.** Each student's first session is left out, and so are sessions heard from in the
last 3 minutes (still open). The database finds the student from the login (`auth.uid()`), so
nobody can record sessions for someone else, and it never lets a session's active time be more
than the real time since it started. Sessions recorded before the active-time change keep
their old length (last heartbeat − start).

**Admin.** The designated admin account (`public.app_admin`, checked by `is_spot_admin()`)
is never recorded and is left out of every number. Only that account can open the OKR Trackers
page (☰ menu → OKR Trackers), and `okr1_stats()` refuses everyone else, so typing `#okr` in the
address bar shows only a "for the team admin" message.

## Add OKR 2–4

1. Write a panel like `okr-stats-panel.js` whose `mount(element)` returns `{ destroy }`.
2. Back it with a database function that starts with the same `is_spot_admin()` check as
   `okr1_stats()` and is not granted to `anon`.
3. Load its script in `prototype/index.html` (with the other `js/okr/` lines, before `app.js`).
4. Add one line to `TRACKERS` in `okr-trackers-page.js`.

## Remove it completely

Delete `prototype/js/okr/`, the `js/okr/` script lines in `prototype/index.html`, the
`SessionTracker` lines in `js/app.js` and `js/account.js`, the `okr` parts of `js/app.js` and
the `okr` menu item in `js/components.js`. In Supabase, run the "Undo" lines at the end of
`20261116220000_okr1_session_tracking.sql`.
