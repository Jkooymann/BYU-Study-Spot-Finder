/* =========================================================================
   DB — the only file that talks to Supabase.
   Favorites (favorite_spot) and spots added on the Add a Spot page
   (study_spot + study_spot_amenity) are saved for the logged-in student
   (Supabase Auth; see the Accounts section below), so the whole team sees them.
   If the Supabase script or key is missing, DB.ready is false and the site
   falls back to saving on this device only.
   ========================================================================= */

const DB = (() => {
  const configured = typeof supabase !== 'undefined'
    && typeof SUPABASE_URL === 'string' && SUPABASE_URL
    && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('PASTE_');
  const client = configured ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // A Supabase email link brings people back with #access_token=…&type=recovery
  // (or #error=…&error_code=otp_expired). Note what kind of link it was now,
  // before the router changes the address. null when the page wasn't opened from a link.
  const authLink = (() => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('access_token') && !p.has('error') && !p.has('error_code')) return null;
    return { type: p.get('type') || '', error: p.get('error_code') || p.get('error') || '' };
  })();

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

  /* ---------------- Student-added spots ---------------- */
  const GROUP_TO_MAX = { solo: 1, 'small group': 4, 'big group': 8 };
  const BUSY_TO_DB = { 'Usually empty': 'Low', Moderate: 'Moderate', 'Usually busy': 'High' };
  const BUSY_FROM_DB = { Low: 'Usually empty', Moderate: 'Moderate', High: 'Usually busy' };
  // student_user!submitted_by_user_id names which link to follow: study_spot and
  // student_user are also linked through favorite_spot and spot_rating, and a
  // plain student_user(...) makes Supabase refuse with "more than one relationship".
  // Selecting table columns via * keeps indoor reads working before the outdoor
  // migration is deployed; the new coordinates are optional on older rows.
  const SPOT_COLUMNS = '*, study_spot_amenity(amenity_id), submitter:student_user!submitted_by_user_id(display_name)';

  /** Turn a study_spot row into the spot shape the site uses (see data.js). */
  function toSpot(row) {
    const amenities = new Set((row.study_spot_amenity || []).map((a) => a.amenity_id));
    const features = {};
    FEATURES.forEach((f) => { features[f.key] = amenities.has(FEATURE_AMENITY_IDS[f.key]); });
    features.outdoors = !row.is_indoors;
    const max = row.max_group_size || 1;
    const b = BUILDINGS.find((x) => x.dbId === row.building_id);
    return {
      id: 'd' + row.study_spot_id,
      dbId: row.study_spot_id,
      name: row.spot_name,
      building: b ? b.id : '',
      floor: floorFromDatabase(row.floor_number),
      campusPosition: row.campus_map_x_percent != null && row.campus_map_y_percent != null ? { x: Number(row.campus_map_x_percent), y: Number(row.campus_map_y_percent) } : null,
      room: '',
      position: row.campus_map_x_percent != null ? null : { x: Number(row.floor_plan_x_percent), y: Number(row.floor_plan_y_percent) },
      features,
      groupSize: max <= 1 ? 'solo' : max <= 4 ? 'small group' : 'big group',
      busyness: BUSY_FROM_DB[row.typical_busyness_level] || 'Moderate',
      description: row.description || '',
      submittedBy: row.submitted_by_user_id,
      submittedByName: row.submitter ? row.submitter.display_name : '',
    };
  }

  /** Spots students added (not the built-in sample spots), oldest first. */
  async function studentSpots() {
    const { data, error } = await client.from('study_spot')
      .select(SPOT_COLUMNS).eq('is_sample_spot', false).order('created_at');
    if (error) throw error;
    return data.map(toSpot);
  }

  /** Every building's id and code, so new buildings get their database id by code. */
  async function buildings() {
    const { data, error } = await client.from('building').select('building_id, building_code');
    if (error) throw error;
    return data;
  }

  /** Save a new spot for this student. Returns the saved spot. */
  async function addSpot(userId, spot) {
    const f = spot.features;
    if (f.outdoors && (!spot.campusPosition || ![spot.campusPosition.x, spot.campusPosition.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100))) {
      throw new Error('Place an outdoor pin on the campus map before saving.');
    }
    const building = buildingById(spot.building);
    if ((!f.outdoors || spot.building) && (!building || building.dbId == null)) {
      throw new Error(`${building ? building.short : 'This building'} isn't in the database yet. Ask the project owner to apply the latest building migrations in Supabase, then reload.`);
    }
    const noise = f.quietZone && !f.talkingAllowed ? 'Quiet' : f.talkingAllowed && !f.quietZone ? 'Moderate' : null;
    const { data, error } = await client.from('study_spot').insert({
      building_id: building ? building.dbId : null,
      submitted_by_user_id: userId,
      spot_name: spot.name,
      floor_number: f.outdoors ? null : floorToDatabase(spot.floor),
      description: spot.description || null,
      is_indoors: !f.outdoors,
      max_group_size: GROUP_TO_MAX[spot.groupSize] || 1,
      noise_level: noise,
      typical_busyness_level: BUSY_TO_DB[spot.busyness] || 'Moderate',
      floor_plan_x_percent: f.outdoors ? null : Math.round(spot.position.x * 100) / 100,
      floor_plan_y_percent: f.outdoors ? null : Math.round(spot.position.y * 100) / 100,
      ...(f.outdoors ? {
        campus_map_x_percent: Math.round(spot.campusPosition.x * 100) / 100,
        campus_map_y_percent: Math.round(spot.campusPosition.y * 100) / 100,
      } : {}),
      is_sample_spot: false,
    }).select('study_spot_id').single();
    if (error) throw error;
    const id = data.study_spot_id;

    const tags = Object.keys(FEATURE_AMENITY_IDS).filter((k) => f[k])
      .map((k) => ({ study_spot_id: id, amenity_id: FEATURE_AMENITY_IDS[k] }));
    if (tags.length) {
      const res = await client.from('study_spot_amenity').insert(tags);
      if (res.error) {
        await client.from('study_spot').delete().eq('study_spot_id', id); // don't keep a half-saved spot
        throw res.error;
      }
    }
    const saved = await client.from('study_spot').select(SPOT_COLUMNS).eq('study_spot_id', id).single();
    if (saved.error) throw saved.error;
    return toSpot(saved.data);
  }

  async function deleteSpot(studySpotId) {
    const { error } = await client.from('study_spot').delete()
      .eq('study_spot_id', studySpotId).eq('is_sample_spot', false);
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
      options: {
        data: { display_name: displayName || '', byu_net_id: netId || '' },
        // Where the confirmation email's link sends people (this site's address).
        // Must be listed under Authentication → URL Configuration in Supabase.
        emailRedirectTo: location.origin + location.pathname,
      },
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

  /**
   * The signed-in student's student_user row ({ user_id, display_name, byu_net_id })
   * plus `email`, the address they log in with, or null.
   * Use `email` for display: byu_net_id can have a suffix added when that Net ID
   * was already taken (see the sign-up trigger), so it isn't always their address.
   */
  async function currentStudent() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client.from('student_user')
      .select('user_id, display_name, byu_net_id').eq('auth_user_id', user.id).maybeSingle();
    if (error) throw error;
    return data ? { ...data, email: user.email } : null;
  }

  /* ---------------------------------------------------------------------
     AI recommendations (supabase/functions/recommend-spots). The function
     reads the student's favorites and every spot itself; spotIds is the list
     of study_spot_ids this page can show, so it never suggests one we can't open.
     Resolves to the function's answer, e.g.
       { status: 'ok', cached, recommendations: [{ spot_id, reason }] }
       { status: 'no_favorites' | 'no_candidates' | 'login_required' | 'rate_limited' | 'error' }
     --------------------------------------------------------------------- */
  async function recommendSpots(spotIds) {
    const { data, error } = await client.functions.invoke('recommend-spots', { body: { spot_ids: spotIds } });
    if (!error) return data;
    // Non-2xx answers (429 rate limit, 401 login) still carry a JSON body.
    const res = error.context;
    if (res && typeof res.json === 'function') {
      try { const body = await res.json(); if (body && body.status) return body; } catch (e) { /* not JSON */ }
    }
    throw error;
  }

  /* ---------------------------------------------------------------------
     Password reset. Supabase emails a one-time link (valid for an hour by
     default) that brings the person back here already logged in, so they
     can choose a new password with updatePassword().
     --------------------------------------------------------------------- */

  /**
   * Ask Supabase to email a reset link. Supabase answers the same way whether
   * or not the address has an account, so this doesn't reveal who has one.
   * The link returns to this page; its address must be listed under
   * Authentication → URL Configuration → Redirect URLs in Supabase.
   */
  async function requestPasswordReset(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname,
    });
    if (error) throw error;
  }

  /** Set a new password for whoever is logged in (after opening a reset link). */
  async function updatePassword(password) {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  /**
   * Wait until Supabase has read the email link in the address (it does this
   * on its own when the page loads). Returns true if someone is now logged in.
   */
  async function finishAuthLink() {
    if (!client) return false;
    const { data } = await client.auth.getSession();
    return !!(data && data.session);
  }

  return {
    ready: !!client, students, favoriteSpotIds, addFavorite, removeFavorite,
    buildings, studentSpots, addSpot, deleteSpot,
    signUp, signIn, signOut, currentStudent, recommendSpots,
    authLink, finishAuthLink, requestPasswordReset, updatePassword,
  };
})();
