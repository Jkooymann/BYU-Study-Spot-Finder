/* =========================================================================
   OKR Trackers page (#okr): the team admin's view of every OKR tracker.
   Only the designated admin account sees it. The menu item and this page check
   Store.isAdmin() (from the database's is_spot_admin()), but the real protection
   is in the database: each tracker's numbers come from a function that refuses
   anyone who isn't the admin (see okr1_stats() in
   supabase/migrations/20261118020000_okr_admin_only_and_active_time.sql).

   ADDING A TRACKER (OKR 2, 3, 4): write a panel like js/okr/okr-stats-panel.js
   whose mount(element) returns { destroy }, protect its database function the
   same way as okr1_stats(), load its script in index.html, and add one line to
   TRACKERS below. The page lays the cards out in a grid automatically.
   ========================================================================= */

const OKRTrackersPage = (() => {
  const TRACKERS = [
    { id: 'okr1', mount: (el) => OKRStatsPanel.mount(el) },
    // { id: 'okr2', mount: (el) => OKR2Panel.mount(el) },
  ];
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
    </section>`;
  }

  /** After the page HTML is on screen: start each tracker (admin only). */
  function mount() {
    unmount();
    if (!Store.isAdmin()) return;
    mounted = TRACKERS.map((t) => {
      const el = document.getElementById(`okr-tracker-${t.id}`);
      return el ? t.mount(el) : null;
    }).filter(Boolean);
  }

  /** Stop auto-refresh timers when leaving the page or redrawing it. */
  function unmount() {
    mounted.forEach((m) => { try { m.destroy(); } catch (_) { /* already gone */ } });
    mounted = [];
  }

  return { render, mount, unmount };
})();
