/* =========================================================================
   OKR 2: search tracker. "50% of users find a spot within five minutes."

   * A search STARTS when a logged-in student turns on a feature (a Get Started
     choice or a feature in the Filter panel) and no search is open.
   * It's FOUND when they then open a spot from a spot card or a map / floor
     marker (anything with data-open-spot, except their Favorites list, which
     is revisiting saved spots rather than finding one).
   * A search stays open until a spot is found or 5 minutes pass. Turning on a
     feature after that starts a new search; searches with no spot found are
     kept and count as "not within five minutes".
   * Both moments are stamped by the database clock (okr_start_search,
     okr_spot_found), so the browser can't change the times.
   * Logged-out visitors and the admin account aren't tracked (same rule as
     getTrackingUserId() in session-tracker.js; the database also refuses the admin).

   Hooks: js/app.js calls SearchTracker.featureSelected() and
   SearchTracker.spotSelected(); js/components.js calls featureSelected() from
   the Filter panel.
   Needs: js/okr/okr-api.js and js/okr/session-tracker.js (getTrackingUserId).
   ========================================================================= */

const SearchTracker = (() => {
  const KEY = 'byuStudySpots.okrSearch';
  const WINDOW_MS = 5 * 60 * 1000;
  let queue = Promise.resolve();

  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (_) { return null; } }
  function save(s) {
    try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  }
  function later(fn) {
    queue = queue.then(fn).catch((err) => console.warn('[OKR 2]', err));
    return queue;
  }
  function who() { return OKRApi.ready && typeof getTrackingUserId === 'function' ? getTrackingUserId() : null; }

  /** The open search for this student, or null. { id, userId, startedAt } */
  function openSearch(userId) {
    const s = load();
    return s && s.userId === userId && !s.found && Date.now() - s.startedAt <= WINDOW_MS ? s : null;
  }

  /** A feature was turned on. Starts a search unless one is already open. */
  function featureSelected() {
    const userId = who();
    if (!userId || openSearch(userId)) return queue;
    const s = { id: null, userId, startedAt: Date.now(), found: false };
    save(s);
    return later(async () => {
      const id = await OKRApi.startSearch();
      const now = load();
      if (!now || now.startedAt !== s.startedAt || now.userId !== userId) return; // replaced meanwhile
      if (id) { now.id = id; save(now); } else save(null);                    // not recorded
    });
  }

  /** A spot card was opened. Marks the student's latest unfound search as found.
      (Even after 5 minutes: the database records the time, and the tracker counts
      it as not within five minutes.) */
  function spotSelected() {
    const userId = who();
    const s = load();
    if (!userId || !s || s.userId !== userId || s.found) return queue;
    s.found = true;
    save(s);
    // Runs after okr_start_search answers, so the id is there by then.
    return later(async () => {
      const id = (load() || {}).id || s.id;
      if (id) await OKRApi.spotFound(id);
    });
  }

  return { featureSelected, spotSelected, WINDOW_MS };
})();
