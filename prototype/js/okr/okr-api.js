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
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (_) { /* not JSON */ }
      throw new Error(`${name} failed (${res.status}) ${detail}`.trim());
    }
    return res.json();
  }

  return {
    ready,
    /** New session for the logged-in student; null if nobody is logged in. */
    startSession: () => rpc('okr_start_session', {}, { asUser: true }),
    /** true = recorded, false = not this student's session (start a new one), null = logged out. */
    heartbeat: (sessionId, opts = {}) => rpc('okr_heartbeat', { p_session_id: sessionId }, { ...opts, asUser: true }),
    stats: async () => (await rpc('okr1_stats'))[0],
  };
})();
