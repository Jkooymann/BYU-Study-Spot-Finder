/* =========================================================================
   OKR 1: session tracker (active time).
   Counts how long a logged-in student is actively using the site.

   * Activity = a click / tap, a key press, or scrolling, while the page is visible.
     Opening or reloading the page (when visible) counts too.
   * Time counts from each activity until the next one, but never more than
     IDLE_MS (two minutes) after the last activity, and never while the page is
     hidden (another tab, phone locked, browser minimized).
   * Coming back more than two minutes after the last activity starts a NEW
     session on the next activity; the gap is never added to the old one.
     Coming back sooner continues the session, without the hidden time.
   * All of this is worked out from timestamps when something happens, so a
     timer that the phone pauses can't add or lose time. The 30-second timer
     only SENDS the total to the database; it doesn't count anything.
   * Reloading keeps the session (sessionStorage survives a reload, not closing the tab).
   * Logged-out visitors and the admin account aren't tracked. The database also
     refuses to record the admin (okr_start_session), so this is only a shortcut.

   Needs: js/supabase-config.js, js/db.js, js/store.js and js/okr/okr-api.js.
   App.loadShared() (js/app.js) calls SessionTracker.sync() after every
   login check, so logging in starts a session and logging out ends it.
   Remove: delete the js/okr/session-tracker.js <script> line in index.html.
   ========================================================================= */

/**
 * WHO IS THE USER? The logged-in student's user_id, or null when nobody is
 * logged in or it's the admin account (null = don't track). The database checks
 * the login itself; this is only used to notice when the person changes.
 */
function getTrackingUserId() {
  const me = typeof Store !== 'undefined' ? Store.currentStudent() : null;
  if (!me || (Store.isAdmin && Store.isAdmin())) return null;
  return me.user_id;
}

const SessionTracker = (() => {
  const SESSION_KEY = 'byuStudySpots.okrSession';
  const IDLE_MS = 2 * 60 * 1000;
  const REPORT_MS = 30 * 1000;
  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

  let userId = null;  // who is being tracked (null = nobody)
  /* The current session:
     { id,          database session id (null until okr_start_session answers)
       userId,
       activeMs,    active time counted so far
       lastActive,  time of the last activity (Date.now())
       countedTo,   active time has been added up to this moment
       windowEnd }  time stops here: lastActive + IDLE_MS, or when the page was hidden */
  let s = null;
  let timer = null;
  let listening = false;
  let queue = Promise.resolve(); // database calls run one at a time, in order
  const waiting = new WeakSet();  // sessions with a report already queued
  const visible = () => document.visibilityState === 'visible';

  function load() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  }
  function save() {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (_) { /* ignore */ }
  }
  function later(fn) {
    queue = queue.then(fn).catch((err) => console.warn('[OKR]', err));
    return queue;
  }

  /** Add the active time between countedTo and now (stopping at windowEnd). */
  function settle(sess, now) {
    const upTo = Math.min(now, sess.windowEnd);
    if (upTo > sess.countedTo) { sess.activeMs += upTo - sess.countedTo; sess.countedTo = upTo; }
  }

  /** Send a session's active time to the database. */
  function report(sess, { keepalive = false } = {}) {
    if (!sess || !sess.id) return Promise.resolve();
    settle(sess, Date.now());
    const send = async () => {
      const ok = await OKRApi.heartbeat(sess.id, sess.activeMs / 1000, { keepalive });
      if (keepalive || sess !== s) return;
      if (ok === null || ok === false) { s = null; save(); stopTimer(); } // logged out / unknown session: next activity starts over
    };
    // While the page is closing there's no time to wait for the queue.
    if (keepalive) return send().catch(() => {});
    if (waiting.has(sess)) return queue; // one queued report is enough; it sends the latest total
    waiting.add(sess);
    return later(() => { waiting.delete(sess); return send(); });
  }

  function newSession(now) {
    const sess = { id: null, userId, activeMs: 0, lastActive: now, countedTo: now, windowEnd: now + IDLE_MS };
    s = sess;
    save();
    later(async () => {
      const id = await OKRApi.startSession();
      sess.id = id || null;
      if (!id && sess === s) { s = null; stopTimer(); } // not recorded (logged out, or the database said no)
      if (sess === s) save();
      if (id) report(sess); // queued after this step (don't await: it waits for this step to finish)
    });
  }

  /** Something happened: a click, tap, key press or scroll (or the page opened). */
  function activity() {
    if (!userId || !visible()) return;
    const now = Date.now();
    if (s && s.userId === userId && now - s.lastActive <= IDLE_MS) {
      settle(s, now);                 // up to now, or up to when the page was hidden
      s.countedTo = Math.max(s.countedTo, now); // hidden time is skipped, never added later
      s.lastActive = now;
      s.windowEnd = now + IDLE_MS;
    } else {
      if (s) { const old = s; report(old); } // the old session ended at its idle cutoff
      newSession(now);
    }
    startTimer();
  }

  /** The page is being hidden or closed: stop the clock now and send the total. */
  function pause() {
    stopTimer();
    if (!s) return;
    const now = Date.now();
    settle(s, now);
    s.windowEnd = Math.min(s.windowEnd, now);
    save();
    report(s, { keepalive: true });
  }

  function tick() {
    if (!s) { stopTimer(); return; }
    report(s);
    save();
    if (Date.now() >= s.windowEnd) stopTimer(); // idle: nothing more to count until the next activity
  }
  function startTimer() { if (!timer && s && visible()) timer = setInterval(tick, REPORT_MS); }
  function stopTimer() { clearInterval(timer); timer = null; }

  function listen() {
    if (listening) return;
    listening = true;
    ACTIVITY_EVENTS.forEach((type) => document.addEventListener(type, activity, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!visible()) pause(); }); // coming back waits for activity
    window.addEventListener('pagehide', pause);
  }

  /** Match tracking to whoever is logged in now. Safe to call often. */
  function sync() {
    if (!OKRApi.ready) return Promise.resolve();
    const next = getTrackingUserId();
    if (next === userId) return queue;
    if (s) report(s);          // logging out or switching accounts: send what we have
    stopTimer();
    userId = next;
    s = null;
    if (!userId) { save(); return queue; }
    const saved = load();
    if (saved && saved.userId === userId && saved.id) s = saved; // reload: activity() decides if it continues
    listen();
    activity();                // opening the page / logging in counts as activity
    return queue;
  }

  /** Send the total now (used just before logging out, while the login still works). */
  function flush() { return s ? report(s) : queue; }

  return {
    sync, flush, IDLE_MS,
    get sessionId() { return s && s.id; },
    /** For testing: the current session's active seconds. */
    get activeSeconds() { if (!s) return 0; settle(s, Date.now()); return s.activeMs / 1000; },
  };
})();
