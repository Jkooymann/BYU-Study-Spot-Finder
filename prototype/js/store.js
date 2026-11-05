/* =========================================================================
   Store — reads the mock data (data.js) and keeps the user's own data in
   localStorage: active filters and (when the database is off) added spots.
   Favorites and spots added on the Add a Spot page are saved in Supabase
   (db.js) for the student who is logged in; logged-out visitors are asked
   to log in to save them. If Supabase is off or can't be reached, new spots
   and favorites stay on this device.
   Every read/write is wrapped in try/catch so the app still works when
   storage is blocked (it falls back to in-memory values).
   ========================================================================= */

const Store = (() => {
  const PREFIX = 'byuStudySpots.';
  const memory = {};

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) return JSON.parse(raw);
    } catch (e) { /* storage blocked */ }
    return key in memory ? memory[key] : fallback;
  }
  function write(key, value) {
    memory[key] = value;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------- Spots ---------------- */
  function userSpots() { return read('userSpots', []); }

  function allSpots() {
    return SPOTS
      .concat(shared.spots.map((s) => ({ ...s, isUserSpot: true })))
      .concat(userSpots().map((s) => ({ ...s, isUserSpot: true, isLocalSpot: true })));
  }
  function getSpot(id) { return allSpots().find((s) => s.id === id) || null; }

  /**
   * Save a spot from the Add a Spot page. Goes to Supabase when it is
   * connected (rejects if saving fails), otherwise to this device.
   */
  async function addUserSpot(spot) {
    const me = currentStudent();
    if (shared.status === 'ok' && me) {
      const saved = await DB.addSpot(me.user_id, spot);
      shared.spots = shared.spots.concat(saved);
      return { ...saved, isUserSpot: true };
    }
    const id = 'u' + Date.now().toString(36);
    const saved = { ...spot, id };
    write('userSpots', userSpots().concat(saved));
    return { ...saved, isUserSpot: true };
  }

  /**
   * True when the person looking can delete this spot: a database spot the
   * logged-in student added, or a spot saved only on this device. Sample spots
   * and other students' spots can't be deleted.
   */
  function isOwnSpot(spot) {
    if (!spot) return false;
    if (spot.isLocalSpot) return true;
    return !!(shared.me && spot.dbId != null && spot.submittedBy === shared.me.user_id);
  }

  /** Delete one of your own spots. Returns a promise that rejects (and undoes) if Supabase refused. */
  function deleteSpot(id) {
    const spot = getSpot(id);
    if (!isOwnSpot(spot)) return Promise.reject(new Error('You can only delete spots you added.'));
    const fromDb = shared.spots.find((s) => s.id === id);
    if (fromDb) {
      const before = shared.spots;
      shared.spots = before.filter((s) => s.id !== id);
      return DB.deleteSpot(fromDb.dbId).catch((e) => { shared.spots = before; throw e; });
    }
    write('userSpots', userSpots().filter((s) => s.id !== id));
    write('favorites', localFavorites().filter((f) => f !== id));
    return Promise.resolve();
  }

  /** A random spot from the list given (all spots by default), or null. */
  function randomSpot(list) {
    const pool = list && list.length ? list : allSpots();
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /* ---------------- Shared favorites (Supabase) ---------------- */
  // status: 'off' (no Supabase key), 'loading', 'ok', or 'error'
  // me: the logged-in student's student_user row, or null when logged out.
  // spots: student-added spots from the database (not in data.js)
  const shared = { status: DB.ready ? 'loading' : 'off', me: null, favDbIds: [], spots: [] };
  const spotIdByDbId = (dbId) => {
    const s = SPOTS.find((x) => x.dbId === dbId) || shared.spots.find((x) => x.dbId === dbId);
    return s ? s.id : null;
  };
  const isShared = (spot) => shared.status === 'ok' && spot && spot.dbId != null;

  function sharedStatus() { return shared.status; }
  function currentStudent() { return shared.me; }
  /** True when favorites need a login (the database is up but nobody is logged in). */
  function needsLogin() { return shared.status === 'ok' && !shared.me; }

  /** Load who is logged in, student-added spots, and the student's favorites from Supabase. */
  async function loadShared() {
    if (!DB.ready) return;
    try {
      const inDataJs = new Set(SPOTS.map((s) => s.dbId));
      // If spots can't load, keep favorites and login working.
      const spots = DB.studentSpots().catch((e) => { console.error('Could not load added spots from Supabase', e); return []; });
      // Building ids for buildings added after the first six (matched by building code).
      const buildings = (DB.buildings ? DB.buildings() : Promise.resolve([]))
        .catch((e) => { console.error('Could not load buildings from Supabase', e); return []; });
      const [me, loaded, rows] = await Promise.all([DB.currentStudent(), spots, buildings]);
      rows.forEach((r) => { const b = BUILDINGS.find((x) => x.short === r.building_code); if (b) b.dbId = r.building_id; });
      shared.spots = loaded.filter((s) => !inDataJs.has(s.dbId) && s.building);
      shared.favDbIds = me ? await DB.favoriteSpotIds(me.user_id) : [];
      shared.me = me;
      shared.status = 'ok';
    } catch (e) {
      console.error('Could not load favorites from Supabase', e);
      shared.status = 'error';
    }
  }

  /* ---------------- Favorites ---------------- */
  function localFavorites() { return read('favorites', []); }
  function favorites() {
    if (shared.status === 'off' || shared.status === 'error') return localFavorites();
    if (needsLogin()) return [];
    const localOnly = localFavorites().filter((id) => { const s = getSpot(id); return s && s.dbId == null; });
    if (shared.status === 'loading') return localOnly;
    const fromDb = shared.favDbIds.map(spotIdByDbId).filter(Boolean);
    return fromDb.concat(localOnly);
  }
  function isFav(id) { return favorites().includes(id); }

  /**
   * Toggle a favorite. Returns { on, saved } where `on` is the new state
   * (shown right away) and `saved` is a promise that rejects if Supabase
   * refused the change, in which case the change has been undone.
   */
  function toggleFav(id) {
    const spot = getSpot(id);
    if (needsLogin()) return { on: false, needsLogin: true, saved: Promise.resolve() };
    if (shared.status === 'loading' && spot && spot.dbId != null) {
      return { on: false, saved: Promise.reject(new Error('Favorites are still loading')) };
    }
    if (!isShared(spot)) {
      const f = localFavorites();
      const next = f.includes(id) ? f.filter((x) => x !== id) : f.concat(id);
      write('favorites', next);
      return { on: next.includes(id), saved: Promise.resolve() };
    }
    const me = currentStudent();
    const before = shared.favDbIds;
    const on = !before.includes(spot.dbId);
    shared.favDbIds = on ? before.concat(spot.dbId) : before.filter((x) => x !== spot.dbId);
    const saved = (on ? DB.addFavorite(me.user_id, spot.dbId) : DB.removeFavorite(me.user_id, spot.dbId))
      .catch((e) => { shared.favDbIds = before; throw e; });
    return { on, saved };
  }

  /* ---------------- Filters ---------------- */
  /* Filters: { features: { quietZone, ... wifi ... }, setting: '' | 'indoors' | 'outdoors', building, groupSize } */
  function emptyFilters() {
    const features = {};
    FILTER_FEATURES.forEach((f) => { features[f.key] = false; });
    return { features, setting: '', building: '', groupSize: '' };
  }
  function normalize(f) {
    const base = emptyFilters();
    if (!f) return base;
    FILTER_FEATURES.forEach((x) => { base.features[x.key] = !!(f.features && f.features[x.key]); });
    // Older saved filters used an Outdoors checkbox and a separate Indoors flag.
    const oldOut = !!(f.features && f.features.outdoors), oldIn = !!f.indoors;
    const setting = f.setting || (oldOut && !oldIn ? 'outdoors' : oldIn && !oldOut ? 'indoors' : '');
    base.setting = SETTINGS.some((x) => x.key === setting) ? setting : '';
    base.building = BUILDINGS.some((b) => b.id === f.building) ? f.building : '';
    base.groupSize = f.groupSize || '';
    return base;
  }
  function getFilters() { return normalize(read('activeFilters', null)); }
  function setFilters(f) { write('activeFilters', normalize(f)); }
  function clearFilters() { write('activeFilters', emptyFilters()); }

  function matches(spot, f) {
    f = normalize(f);
    for (const x of FILTER_FEATURES) {
      if (f.features[x.key] && !spot.features[x.key]) return false;
    }
    if (f.setting === 'outdoors' && !spot.features.outdoors) return false;
    if (f.setting === 'indoors' && spot.features.outdoors) return false;
    if (f.building && spot.building !== f.building) return false;
    if (f.groupSize && spot.groupSize !== f.groupSize) return false;
    return true;
  }
  function filtered(f) { return allSpots().filter((s) => matches(s, f || getFilters())); }

  /** Human-readable list of active filters: [{ key, label }] */
  function describe(f) {
    f = normalize(f);
    const items = [];
    if (f.groupSize) items.push({ key: 'groupSize', label: GROUP_SIZES.find((g) => g.key === f.groupSize).label, group: true });
    if (f.setting) items.push({ key: 'setting', label: SETTINGS.find((x) => x.key === f.setting).label });
    FILTER_FEATURES.forEach((x) => { if (f.features[x.key]) items.push({ key: x.key, label: x.label }); });
    if (f.building) {
      const b = BUILDINGS.find((b) => b.id === f.building);
      items.push({ key: 'building', label: b ? b.short : f.building });
    }
    return items;
  }
  function isActive(f) { return describe(f || getFilters()).length > 0; }
  function removeKey(f, key) {
    f = normalize(f);
    if (key === 'groupSize') f.groupSize = '';
    else if (key === 'building') f.building = '';
    else if (key === 'setting') f.setting = '';
    else f.features[key] = false;
    return f;
  }
  const keyOf = (f) => JSON.stringify(normalize(f));

  /* ---------------- Small UI preferences ---------------- */
  function pref(key, fallback) { return read('pref.' + key, fallback); }
  function setPref(key, value) { write('pref.' + key, value); }

  return {
    allSpots, getSpot, addUserSpot, deleteSpot, isOwnSpot, randomSpot,
    sharedStatus, currentStudent, needsLogin, loadShared,
    favorites, isFav, toggleFav,
    emptyFilters, normalize, getFilters, setFilters, clearFilters, matches, filtered, describe, isActive, removeKey,
    pref, setPref, clone,
  };
})();

const buildingById = (id) => BUILDINGS.find((b) => b.id === id);
