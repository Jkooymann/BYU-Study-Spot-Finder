/* =========================================================================
   DB — the only file that talks to Supabase.
   Favorites (favorite_spot) and spots added on the Add a Spot page
   (study_spot + study_spot_amenity) are stored here so the whole team sees
   them. There is no sign-in yet: the site acts as whichever sample student
   is picked in the top bar (see supabase/migrations/*_allow_demo_*.sql).
   If the Supabase script or key is missing, DB.ready is false and the site
   falls back to saving on this device only.
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

  /* ---------------- Student-added spots ---------------- */
  const GROUP_TO_MAX = { solo: 1, 'small group': 4, 'big group': 8 };
  const BUSY_TO_DB = { 'Usually empty': 'Low', Moderate: 'Moderate', 'Usually busy': 'High' };
  const BUSY_FROM_DB = { Low: 'Usually empty', Moderate: 'Moderate', High: 'Usually busy' };
  const SPOT_COLUMNS = 'study_spot_id, building_id, submitted_by_user_id, spot_name, floor_number, location_description, '
    + 'description, is_indoors, max_group_size, typical_busyness_level, floor_plan_x_percent, floor_plan_y_percent, '
    + 'study_spot_amenity(amenity_id), student_user(display_name)';

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
      floor: row.floor_number,
      room: row.location_description || '',
      position: { x: Number(row.floor_plan_x_percent), y: Number(row.floor_plan_y_percent) },
      features,
      groupSize: max <= 1 ? 'solo' : max <= 4 ? 'small group' : 'big group',
      busyness: BUSY_FROM_DB[row.typical_busyness_level] || 'Moderate',
      description: row.description || '',
      submittedBy: row.submitted_by_user_id,
      submittedByName: row.student_user ? row.student_user.display_name : '',
    };
  }

  /** Spots students added (not the built-in sample spots), oldest first. */
  async function studentSpots() {
    const { data, error } = await client.from('study_spot')
      .select(SPOT_COLUMNS).eq('is_sample_spot', false).order('created_at');
    if (error) throw error;
    return data.map(toSpot);
  }

  /** Save a new spot for this student. Returns the saved spot. */
  async function addSpot(userId, spot) {
    const f = spot.features;
    const noise = f.quietZone && !f.talkingAllowed ? 'Quiet' : f.talkingAllowed && !f.quietZone ? 'Moderate' : null;
    const { data, error } = await client.from('study_spot').insert({
      building_id: buildingById(spot.building).dbId,
      submitted_by_user_id: userId,
      spot_name: spot.name,
      floor_number: spot.floor,
      location_description: spot.room || null,
      description: spot.description || null,
      is_indoors: !f.outdoors,
      max_group_size: GROUP_TO_MAX[spot.groupSize] || 1,
      noise_level: noise,
      typical_busyness_level: BUSY_TO_DB[spot.busyness] || 'Moderate',
      floor_plan_x_percent: Math.round(spot.position.x * 100) / 100,
      floor_plan_y_percent: Math.round(spot.position.y * 100) / 100,
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

  return {
    ready: !!client, students, favoriteSpotIds, addFavorite, removeFavorite,
    studentSpots, addSpot, deleteSpot,
  };
})();
