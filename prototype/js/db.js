/* =========================================================================
   DB — the only file that talks to Supabase.
   Favorites are stored in the favorite_spot table so the whole team sees
   them. There is no sign-in yet: the site acts as whichever sample student
   is picked in the top bar (see supabase/migrations/*_allow_demo_favorites.sql).
   If the Supabase script or key is missing, DB.ready is false and the site
   falls back to saving favorites on this device only.
   ========================================================================= */

const DB = (() => {
  const configured = typeof supabase !== 'undefined'
    && typeof SUPABASE_URL === 'string' && SUPABASE_URL
    && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('PASTE_');
  const client = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  async function students() {
    const { data, error } = await client.from('student_user')
      .select('user_id, display_name, byu_net_id').order('user_id');
    if (error) throw error;
    return data;
  }

  /** study_spot_ids the student has favorited, oldest first. */
  async function favoriteSpotIds(userId) {
    const { data, error } = await client.from('favorite_spot')
      .select('study_spot_id').eq('user_id', userId).order('favorited_at');
    if (error) throw error;
    return data.map((r) => r.study_spot_id);
  }

  async function addFavorite(userId, studySpotId) {
    const { error } = await client.from('favorite_spot').insert({ user_id: userId, study_spot_id: studySpotId });
    if (error && error.code !== '23505') throw error; // 23505 = already a favorite
  }

  async function removeFavorite(userId, studySpotId) {
    const { error } = await client.from('favorite_spot').delete()
      .eq('user_id', userId).eq('study_spot_id', studySpotId);
    if (error) throw error;
  }

  /** Turn a Supabase error into a sentence that says how to fix it. */
  function explain(err) {
    const code = err && err.code;
    const msg = (err && err.message) || String(err);
    if (code === '23503') return 'That spot is not in the database yet. Run supabase/seed.sql in the Supabase SQL Editor.';
    if (code === '42501' || code === 'PGRST301' || /permission denied|row-level security/i.test(msg)) {
      return 'The database blocked this. Run the allow_demo_favorites migration in the Supabase SQL Editor.';
    }
    if (code === 'NO_STUDENTS') return msg;
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Could not reach Supabase. Check your internet connection.';
    return `The database said: ${msg}`;
  }

  return { ready: !!client, students, favoriteSpotIds, addFavorite, removeFavorite, explain };
})();
