/* =========================================================================
   OKR 1: talks to the database functions in
   supabase/migrations/20261116220000_okr1_session_tracking.sql.
   Uses plain fetch (so a heartbeat can finish while the tab closes) with the
   logged-in person's access token, so the database itself decides who the
   student is. The browser never sends a student id it could fake.
   Needs js/supabase-config.js first; uses DB.accessToken() (js/db.js) when
   it's on the page.
   ========================================================================= */

const OKRApi = (() => {
  const ready = typeof SUPABASE_URL === 'string' && SUPABASE_URL
    && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('PASTE_');

  async function token() {
    try { return (typeof DB !== 'undefined' && DB.accessToken) ? await DB.accessToken() : null; } catch (_) { return null; }
  }

  /** Call a database function. keepalive lets the call finish while the tab closes. */
  async function rpc(name, args = {}, { keepalive = false, asUser = false } = {}) {
    if (!ready) throw new Error('Supabase is not configured (js/supabase-config.js).');
    const userToken = asUser ? await token() : null;
    if (asUser && !userToken) return null; // nobody logged in
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      keepalive,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${userToken || SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch (_) { /* not JSON */ }
      // notAllowed: the database refused (not the admin account). Pages show their own wording.
      throw Object.assign(new Error(`${name} failed (${res.status}) ${body.message || ''}`.trim()),
        { status: res.status, notAllowed: body.code === '42501' || res.status === 401 || res.status === 403 });
    }
    return res.json();
  }

  return {
    ready,
    /** New session for the logged-in student; null if nobody is logged in. */
    startSession: () => rpc('okr_start_session', {}, { asUser: true }),
    /** Report the session's active seconds so far.
        true = recorded, false = not this student's session (start a new one), null = logged out. */
    heartbeat: (sessionId, activeSeconds, opts = {}) =>
      rpc('okr_heartbeat', { p_session_id: sessionId, p_active_seconds: Math.round(activeSeconds) }, { ...opts, asUser: true }),
    /** OKR 1 numbers. Only the admin account gets them; anyone else gets an error with notAllowed. */
    stats: async () => {
      const rows = await rpc('okr1_stats', {}, { asUser: true });
      if (rows === null) throw Object.assign(new Error('okr1_stats: not logged in'), { notAllowed: true });
      return rows[0];
    },
  };
})();
