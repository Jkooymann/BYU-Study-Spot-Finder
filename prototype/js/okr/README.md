# OKR 1 session tracking (PROTOTYPE)

OKR 1: **80% of users spend less than 10 minutes in a single session, not counting their first session.**

| File | What it does |
|---|---|
| `okr-api.js` | Calls the three database functions. Plain `fetch`, no Supabase client. |
| `session-tracker.js` | Starts a session when a tab opens the site, heartbeats every 30 s while the tab is visible. Holds `getTrackingUserId()`, the one place that decides who the user is. |
| `okr-stats-panel.js` | `OKRStatsPanel.mount(element)`: the stats card. Brings its own styles. |
| `../../okr-stats.html` | Stand-in for the admin page; shows the panel. |
| `supabase/migrations/20261116220000_okr1_session_tracking.sql` | `user_session` table, `okr_start_session`, `okr_heartbeat`, `okr1_stats()`, view `okr1_session_lengths`. |

**Rules.** One session = one browser tab, open to close (reloads keep the session).
Length = last heartbeat − start, both stamped by the database clock. Each user's first
session is left out, and so are sessions heard from in the last 2 minutes (still open).

## Swap the anonymous id for the logged-in user

Edit only `getTrackingUserId()` in `session-tracker.js` (the comment above it has the
code), then delete `getAnonymousId()`. Optionally clear old rows in the SQL Editor:
`delete from user_session where tracking_user_id like 'anon:%';`

## Move the panel to the admin page

On the admin page add a `<div id="okr1-panel"></div>`, load `js/supabase-config.js`,
`js/okr/okr-api.js` and `js/okr/okr-stats-panel.js`, then call
`OKRStatsPanel.mount(document.getElementById('okr1-panel'))`. Delete `okr-stats.html`.
Don't load `session-tracker.js` on the admin page, so admins viewing stats aren't counted.

## Remove it completely

Delete `prototype/js/okr/`, `prototype/okr-stats.html`, and the two `js/okr/` script
lines at the bottom of `prototype/index.html`. In Supabase, run the "Undo" lines at the
end of the migration file.
