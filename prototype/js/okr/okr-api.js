/* =========================================================================
   OKR 1 prototype: talks to the three database functions in
   supabase/migrations/20261116220000_okr1_session_tracking.sql.
   Uses plain fetch (no second Supabase client) so it works on any page that
   loads js/supabase-config.js first, including a future admin page.
   ========================================================================= */

const OKRApi = (() => {
  const ready = typeof SUPABASE_URL === 'string' && SUPABASE_URL
    && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('PASTE_');

  /** Call a database function. keepalive lets the call finish while the tab closes. */
  async function rpc(name, args = {}, { keepalive = false } = {}) {
    if (!ready) throw new Error('Supabase is not configured (js/supabase-config.js).');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      keepalive,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
    startSession: (trackingUserId) => rpc('okr_start_session', { p_tracking_user_id: trackingUserId }),
    heartbeat: (sessionId, opts) => rpc('okr_heartbeat', { p_session_id: sessionId }, opts),
    stats: async () => (await rpc('okr1_stats'))[0],
  };
})();
