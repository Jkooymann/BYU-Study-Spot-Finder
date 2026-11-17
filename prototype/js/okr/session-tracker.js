/* =========================================================================
   OKR 1: session tracker.
   One session = one browser tab for one logged-in student, from opening the
   site (or logging in) until the tab closes (or they log out). Reloading keeps
   the same session (sessionStorage survives a reload but is cleared when the
   tab closes). While the tab is visible it sends a heartbeat every 30 seconds;
   the database stamps the time, and session length = last heartbeat - start.
   Logged-out visitors are not tracked.

   Needs: js/supabase-config.js, js/db.js, js/store.js and js/okr/okr-api.js.
   App.loadShared() (js/app.js) calls SessionTracker.sync() after every
   login check, so logging in starts a session and logging out ends it.
   Remove: delete the two js/okr/ <script> lines in index.html.
   ========================================================================= */

/**
 * WHO IS THE USER? The logged-in student's user_id, or null when nobody is
 * logged in (null = don't track). The database checks the login itself; this
 * is only used to notice when the person changes.
 */
function getTrackingUserId() {
  const me = typeof Store !== 'undefined' ? Store.currentStudent() : null;
  return me ? me.user_id : null;
}

const SessionTracker = (() => {
  const SESSION_KEY = 'byuStudySpots.okrSession';
  const HEARTBEAT_MS = 30 * 1000;
  let session = null; // { id, userId }
  let timer = null;
  let listening = false;
  let busy = Promise.resolve();

  function load() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  }
  function save(s) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (_) { /* ignore */ }
  }

  async function begin(userId) {
    const id = await OKRApi.startSession();
    session = id ? { id, userId } : null;
    save(session);
  }

  function end() { stopTimer(); session = null; save(null); }

  async function beat(opts) {
    if (!session) return;
    try {
      const ok = await OKRApi.heartbeat(session.id, opts);
      if (opts && opts.keepalive) return;
      if (ok === null) end();                         // logged out
      else if (ok === false) await begin(session.userId); // not found: start over
    } catch (err) {
      console.warn('[OKR] heartbeat failed', err);
    }
  }

  function startTimer() { if (!timer && session && document.visibilityState === 'visible') timer = setInterval(beat, HEARTBEAT_MS); }
  function stopTimer() { clearInterval(timer); timer = null; }

  function listen() {
    if (listening) return;
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { beat(); startTimer(); }
      else { stopTimer(); beat({ keepalive: true }); } // last word before hiding or closing
    });
    window.addEventListener('pagehide', () => beat({ keepalive: true }));
  }

  /** Match the session to whoever is logged in now. Safe to call often. */
  function sync() {
    busy = busy.then(async () => {
      if (!OKRApi.ready) return;
      const userId = getTrackingUserId();
      try {
        if (!userId) { end(); return; }
        if (session && session.userId === userId) return; // already tracking this student
        const saved = load();
        if (saved && saved.userId === userId) { session = saved; await beat(); } // reload in the same tab
        else await begin(userId);                                              // first load, or a new login
        listen();
        startTimer();
      } catch (err) {
        console.warn('[OKR] could not start a session', err);
      }
    });
    return busy;
  }

  return { sync, get sessionId() { return session && session.id; } };
})();
