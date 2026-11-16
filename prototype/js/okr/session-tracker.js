/* =========================================================================
   OKR 1 prototype: session tracker.
   One session = one browser tab, from opening the site until the tab closes.
   Reloading keeps the same session (sessionStorage survives a reload but is
   cleared when the tab closes). While the tab is visible it sends a heartbeat
   every 30 seconds; the database stamps the time, and
   session length = last heartbeat - start.

   Needs: js/supabase-config.js and js/okr/okr-api.js loaded first.
   Remove: delete the <script> tags for js/okr/*.js from index.html.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   WHO IS THE USER?  The only place that decides.
   For now: an anonymous id kept in this browser's localStorage.
   When login is fixed, return the logged-in student's id instead, e.g.:

     function getTrackingUserId() {
       const me = Store.currentStudent();            // see js/store.js
       return me ? 'student:' + me.user_id : null;    // null = don't track
     }

   and delete getAnonymousId() below. Returning null skips tracking (for
   example for logged-out visitors). Old anonymous rows stay in the table and
   can be deleted with:  delete from user_session where tracking_user_id like 'anon:%';
   --------------------------------------------------------------------------- */
function getTrackingUserId() {
  return getAnonymousId();
}

function getAnonymousId() {
  const KEY = 'byuStudySpots.okrAnonId';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = 'anon:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (_) {
    return null; // storage blocked (private mode etc.): don't track
  }
}

const SessionTracker = (() => {
  const SESSION_KEY = 'byuStudySpots.okrSession';
  const HEARTBEAT_MS = 30 * 1000;
  let session = null; // { id, userId }
  let timer = null;

  function load() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  }
  function save(s) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
  }

  async function begin(userId) {
    session = { id: await OKRApi.startSession(userId), userId };
    save(session);
  }

  async function beat(opts) {
    if (!session) return;
    try {
      const known = await OKRApi.heartbeat(session.id, opts);
      if (known === false) await begin(session.userId); // row was removed: start over
    } catch (err) {
      console.warn('[OKR] heartbeat failed', err);
    }
  }

  function startTimer() { if (!timer) timer = setInterval(beat, HEARTBEAT_MS); }
  function stopTimer() { clearInterval(timer); timer = null; }

  async function start() {
    const userId = getTrackingUserId();
    if (!OKRApi.ready || !userId) return;
    try {
      const saved = load();
      if (saved && saved.userId === userId) { session = saved; beat(); }
      else await begin(userId); // first load in this tab, or the user changed
    } catch (err) {
      console.warn('[OKR] could not start a session', err);
      return;
    }
    if (document.visibilityState === 'visible') startTimer();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { beat(); startTimer(); }
      else { stopTimer(); beat({ keepalive: true }); } // last word before hiding or closing
    });
    window.addEventListener('pagehide', () => beat({ keepalive: true }));
  }

  return { start, get sessionId() { return session && session.id; } };
})();

SessionTracker.start();
