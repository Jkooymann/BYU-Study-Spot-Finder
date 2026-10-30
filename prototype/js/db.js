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

  /* ---------------------------------------------------------------------
     Accounts. Use these from the sign-up / log-in forms.
     DB.signUp() creates the login in Supabase Auth; a database trigger then
     adds the person to student_user automatically
     (supabase/migrations/*_save_new_users.sql), so the form does not insert
     anything itself.
     --------------------------------------------------------------------- */

  /**
   * Create an account. displayName and netId are optional; if left out they
   * come from the email (jsmith@byu.edu -> "jsmith").
   * Returns { user, needsEmailConfirm }. Throws with a readable message on error
   * (for example "User already registered" or a too-short password).
   */
  async function signUp({ email, password, displayName, netId }) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || '', byu_net_id: netId || '' } },
    });
    if (error) throw error;
    // No session yet means Supabase sent a confirmation email first.
    return { user: data.user, needsEmailConfirm: !data.session };
  }

  async function signIn({ email, password }) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  /** The signed-in student's student_user row ({ user_id, display_name, byu_net_id }), or null. */
  async function currentStudent() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client.from('student_user')
      .select('user_id, display_name, byu_net_id').eq('auth_user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    ready: !!client, students, favoriteSpotIds, addFavorite, removeFavorite,
    signUp, signIn, signOut, currentStudent,
  };
})();
