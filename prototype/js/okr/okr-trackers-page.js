/* =========================================================================
   OKR Trackers page (#okr): the team admin's view of every OKR tracker.
   Only the designated admin account sees it. The menu item and this page check
   Store.isAdmin() (from the database's is_spot_admin()), but the real protection
   is in the database: each tracker's numbers come from a function that refuses
   anyone who isn't the admin (okr1_stats in
   supabase/migrations/20261118020000_okr_admin_only_and_active_time.sql,
   okr2/3/4_stats in supabase/migrations/20261119010000_okr_2_3_4.sql).

   "Users" everywhere = real student accounts (linked to a login), never the
   admin account. Every card is drawn by OKRPanel (js/okr/okr-panel.js).
   ========================================================================= */

const OKRTrackersPage = (() => {
  /* Each tracker: which database function, which column is the headline %, and what to say.
     The numerator / denominator / period for each are defined in the migrations above. */
  const TRACKERS = [
    {
      id: 'okr1', fn: 'okr1_stats', percentKey: 'percent_under_10',
      title: 'OKR 1: Short sessions',
      goal: 'Goal: 80% of sessions under 10 minutes, not counting each student’s first session. Only active time counts: the clock stops after 2 minutes without a click, tap, key press or scroll, and while the page is hidden.',
      period: 'Sessions: every finished session since tracking started.',
      measure: 'of sessions under 10 minutes',
      facts: (s, f) => [
        ['Sessions under 10 min', `${f.n(s.sessions_under_10)} of ${f.n(s.sessions_counted)}`],
        ['Median session', f.min(s.median_minutes)],
        ['Students counted', f.n(s.users_counted)],
        ['Left out: first / still open', `${f.n(s.first_sessions)} / ${f.n(s.open_sessions)}`],
      ],
      empty: (s, f) => `No sessions to count yet. A session counts once it has ended and it isn’t the student’s first. ${f.n(s.first_sessions)} first session(s) and ${f.n(s.open_sessions)} open session(s) so far.`,
    },
    {
      id: 'okr2', fn: 'okr2_stats', percentKey: 'percent_within_5',
      title: 'OKR 2: Find a spot fast',
      goal: 'Goal: 50% of users find a spot within 5 minutes, from turning on a feature to opening a study spot card. Searches with no spot opened count as not found.',
      period: 'Users: each student once, by their first search since tracking started.',
      measure: 'of users found a spot within 5 minutes',
      facts: (s, f) => [
        ['Users who found one in 5 min', `${f.n(s.users_within_5)} of ${f.n(s.users_counted)}`],
        ['Median time to find', f.min(s.median_minutes)],
        ['No spot in 5 min / in progress', `${f.n(s.users_not_found)} / ${f.n(s.users_in_progress)}`],
        ['All searches within 5 min', `${f.n(s.searches_within_5)} of ${f.n(s.searches_total)}`],
      ],
      empty: (s, f) => `No finished searches yet. A search starts when a logged-in student turns on a feature and finishes when they open a spot card or 5 minutes pass. ${f.n(s.users_in_progress)} in progress.`,
    },
    {
      id: 'okr3', fn: 'okr3_stats', percentKey: 'percent_with_favorite',
      title: 'OKR 3: Users with a favorite',
      goal: 'Goal: at least 80% of users have favorited one or more study spots.',
      period: 'Users: every student account, each counted once. Favorites: as saved right now.',
      measure: 'of users have at least one favorite',
      facts: (s, f) => [
        ['Users with a favorite', `${f.n(s.users_with_favorite)} of ${f.n(s.users_counted)}`],
        ['Users with none', f.n(s.users_counted - s.users_with_favorite)],
        ['Favorites saved', f.n(s.favorites_total)],
        ['Median favorites (if any)', f.n(s.median_favorites)],
      ],
      empty: () => 'No student accounts yet.',
    },
    {
      id: 'okr4', fn: 'okr4_stats', percentKey: 'percent_outside',
      title: 'OKR 4: Favorites beyond the library',
      goal: 'Goal: at least 30% of users who have a favorite have at least one outside the Harold B. Lee Library (other buildings and outdoor spots).',
      period: 'Users: students with at least one favorite, each counted once. Favorites: as saved right now.',
      measure: 'of users with favorites have one outside the library',
      facts: (s, f) => [
        ['Users with one outside', `${f.n(s.users_outside)} of ${f.n(s.users_counted)}`],
        ['Library-only users', f.n(s.users_library_only)],
        ['Favorites in the library', f.n(s.favorites_in_library)],
        ['Favorites outside', f.n(s.favorites_outside)],
      ],
      empty: () => 'No student has a favorite yet, so there is no one to count.',
    },
  ];
  /* The team's hand-coded admin portal (admin-portal/ on the admin-portal branch).
     Placeholder: it only works while the portal is running on your own computer
     (node index.js). Change this to the real address once the portal is deployed. */
  const ADMIN_PORTAL_URL = 'http://localhost:3000';
  let mounted = [];

  /** Page HTML. Non-admins (and logged-out visitors) get a message and no tracker at all. */
  function render() {
    const status = Store.sharedStatus();
    if (status === 'loading') {
      return `<section class="page okr-trackers-page">${pageHeader({ title: 'OKR Trackers' })}<p class="okr-checking">Checking your account…</p></section>`;
    }
    if (!Store.isAdmin()) {
      const me = Store.currentStudent();
      return `<section class="page"><div class="empty">
        <span class="empty-ic">${icon('lock')}</span>
        <p class="empty-title">This page is for the team admin</p>
        <p>${me ? 'Your account doesn’t have access to the OKR trackers.' : 'Log in with the team admin account to see the OKR trackers.'}</p>
        <div class="empty-actions">${me ? '' : '<a class="btn btn-primary" href="#login">Log in</a>'}<a class="btn btn-secondary" href="#start">Go to Home</a></div>
      </div></section>`;
    }
    return `<section class="page okr-trackers-page">
      ${pageHeader({ eyebrow: 'Team admin', title: 'OKR Trackers', sub: 'How the site is doing on the team’s goals. Your own visits as the admin are never counted.' })}
      <div class="okr-grid">
        ${TRACKERS.map((t) => `<article class="okr-card" id="okr-tracker-${t.id}"></article>`).join('')}
      </div>
      <div class="okr-admin-portal">
        <a class="btn btn-primary" href="${ADMIN_PORTAL_URL}" target="_blank" rel="noopener">${icon('users2')} Admin Portal</a>
      </div>
    </section>`;
  }

  /** After the page HTML is on screen: start each tracker (admin only). */
  function mount() {
    unmount();
    if (!Store.isAdmin()) return;
    mounted = TRACKERS.map((t) => {
      const el = document.getElementById(`okr-tracker-${t.id}`);
      return el ? OKRPanel.mount(el, t) : null;
    }).filter(Boolean);
  }

  /** Stop auto-refresh timers when leaving the page or redrawing it. */
  function unmount() {
    mounted.forEach((m) => { try { m.destroy(); } catch (_) { /* already gone */ } });
    mounted = [];
  }

  return { render, mount, unmount };
})();
