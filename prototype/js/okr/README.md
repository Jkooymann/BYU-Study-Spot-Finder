# OKR tracking

| OKR | Target | Card |
|---|---|---|
| 1 | 80% of sessions under 10 minutes (active time), not counting each student's first session | Short sessions |
| 2 | 50% of users find a spot within 5 minutes (feature selected → spot card opened) | Find a spot fast |
| 3 | At least 80% of users favorite one or more study spots | Users with a favorite |
| 4 | At least 30% of users with a favorite have one outside the library | Favorites beyond the library |

All four are on the admin-only **Admin Page** (☰ → Admin Page, `#okr`), above the Users table (`js/admin-users.js`).

| File | What it does |
|---|---|
| `okr-api.js` | Calls the database functions with plain `fetch`, sending the logged-in person's access token (`DB.accessToken()` in `js/db.js`). |
| `session-tracker.js` | Counts a logged-in student's **active** time and reports it every 30 s. `getTrackingUserId()` says who is tracked (nobody for logged-out visitors and the admin). |
| `search-tracker.js` | OKR 2: starts a search when a logged-in student turns on a feature, marks it found when they open a spot card. |
| `okr-panel.js` | `OKRPanel.mount(element, tracker)`: the card every OKR uses (percentage vs target, bar, four numbers, Refresh). Brings its own styles. |
| `okr-trackers-page.js` | The **Admin Page** (`#okr`), team admin only. `TRACKERS` lists the four cards: database function, headline column, wording. |
| `supabase/migrations/20261116220000_okr1_session_tracking.sql` | `user_session` table, `okr_start_session()`, `okr_heartbeat()`, `okr1_stats()`, view `okr1_session_lengths`. |
| `supabase/migrations/20261118020000_okr_admin_only_and_active_time.sql` | Makes the numbers admin only, leaves the admin out, and switches to active time. |
| `supabase/migrations/20261119010000_okr_2_3_4.sql` | `spot_search` table, `okr_start_search()`, `okr_spot_found()`, `okr2_stats()`, `okr3_stats()`, `okr4_stats()`, views `okr_student_accounts`, `okr2_searches`. |

## Who is a "user"

For every OKR: a real student account (a `student_user` row linked to a login), never the team
admin account. The old demo accounts from `seed.sql` have no login and are left out.
(`okr_student_accounts` in the OKR 2–4 migration.)

## OKR 1 rules

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
is never recorded and is left out of every number. Only that account can open the Admin Page
(☰ menu → Admin Page), and `okr1_stats()` refuses everyone else, so typing `#okr` in the
address bar shows only a "for the team admin" message.

## OKR 2 rules (find a spot within five minutes)

* **Search starts:** a logged-in student turns ON a feature (a Get Started choice or a feature
  checkbox in the Filter panel) while no search is open. Turning features off doesn't count.
* **Found:** they open a spot from a spot card or a map / floor marker (anything with
  `data-open-spot`), except their Favorites list. Only the first one counts.
* A search stays open until a spot is found or 5 minutes pass; a feature turned on after that
  starts a new search. Searches with no spot found are kept and count as not within 5 minutes.
  Both times come from the database clock. Reloads keep the open search.
* **Numerator:** users whose **first** search found a spot within 5 minutes.
  **Denominator:** users whose first search has finished (found, or 5 minutes passed).
  First searches still inside their 5 minutes are shown as "in progress".
  **Period:** every search since this tracking started. The card also shows all searches.

## OKR 3 rules (users with a favorite)

* **Numerator:** users with at least one favorite right now, each counted once.
* **Denominator:** all users. **Period:** current favorites, all accounts to date.

## OKR 4 rules (a favorite outside the library)

* **Numerator:** users with at least one favorite not in the Harold B. Lee Library
  (`building_code = 'HBLL'`), each counted once. Outdoor spots count as outside.
* **Denominator:** users with at least one favorite (OKR 3's numerator).
* **Period:** current favorites, same as OKR 3.

## Add another tracker

1. Write a database function like `okr3_stats()`: start with the same `is_spot_admin()` check,
   use `okr_student_accounts` for "users", return a percentage column and `target_percent`,
   and don't grant it to `anon`.
2. Add an entry to `TRACKERS` in `okr-trackers-page.js` (function name, headline column, wording,
   four facts). The card, Refresh button and layout come from `okr-panel.js`.

## Remove it completely

Delete `prototype/js/okr/`, the `js/okr/` script lines in `prototype/index.html`, the
`SessionTracker` / `SearchTracker` lines in `js/app.js`, `js/account.js` and `js/components.js`,
the `okr` parts of `js/app.js` and the `okr` menu item in `js/components.js`. In Supabase, run the
"Undo" lines at the end of `20261119010000_okr_2_3_4.sql` and `20261116220000_okr1_session_tracking.sql`.
