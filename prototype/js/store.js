/* =========================================================================
   Store — reads the mock data (data.js) and keeps the user's own data in
   localStorage: ratings, active filters, saved filters, filter history,
   user-added spots, and deleted sample spots.
   Favorites of sample spots are shared through Supabase (db.js) for the
   student picked in the top bar; favorites of spots you added yourself stay
   on this device because those spots are not in the database yet.
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
  function deletedIds() { return read('deletedSampleIds', []); }

  function allSpots() {
    const hidden = new Set(deletedIds());
    return SPOTS.filter((s) => !hidden.has(s.id))
      .concat(userSpots().map((s) => ({ ...s, isUserSpot: true })));
  }
  function getSpot(id) { return allSpots().find((s) => s.id === id) || null; }

  function addUserSpot(spot) {
    const id = 'u' + Date.now().toString(36);
    const saved = { ...spot, id };
    write('userSpots', userSpots().concat(saved));
    return saved;
  }

  function deleteSpot(id) {
    if (userSpots().some((s) => s.id === id)) {
      write('userSpots', userSpots().filter((s) => s.id !== id));
    } else {
      write('deletedSampleIds', Array.from(new Set(deletedIds().concat(id))));
    }
    write('favorites', localFavorites().filter((f) => f !== id));
    const r = ratings(); delete r[id]; write('ratings', r);
  }
  function restoreSampleSpots() { write('deletedSampleIds', []); }

  /* ---------------- Shared favorites (Supabase) ---------------- */
  // status: 'off' (no Supabase key), 'loading', 'ok', or 'error'
  const shared = { status: DB.ready ? 'loading' : 'off', students: [], favDbIds: [] };
  const spotIdByDbId = (dbId) => { const s = SPOTS.find((x) => x.dbId === dbId); return s ? s.id : null; };
  const isShared = (spot) => shared.status === 'ok' && spot && spot.dbId != null;

  function sharedStatus() { return shared.status; }
  function students() { return shared.students; }
  function currentStudent() {
    const id = pref('studentId', null);
    return shared.students.find((u) => u.user_id === id) || shared.students[0] || null;
  }
  function setStudent(userId) { setPref('studentId', userId); }

  /** Load the student list and the current student's favorites from Supabase. */
  async function loadShared() {
    if (!DB.ready) return;
    try {
      shared.students = await DB.students();
      const me = currentStudent();
      shared.favDbIds = me ? await DB.favoriteSpotIds(me.user_id) : [];
      shared.status = 'ok';
    } catch (e) {
      console.error('Could not load favorites from Supabase', e);
      shared.status = 'error';
    }
  }

  /* ---------------- Favorites & ratings ---------------- */
  function localFavorites() { return read('favorites', []); }
  function favorites() {
    if (shared.status === 'off' || shared.status === 'error') return localFavorites();
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
  function ratings() { return read('ratings', {}); }
  function getRating(id) { return ratings()[id] || 0; }
  function setRating(id, n) { const r = ratings(); if (n) r[id] = n; else delete r[id]; write('ratings', r); }

  /* ---------------- Filters ---------------- */
  function emptyFilters() {
    const features = {};
    FEATURES.forEach((f) => { features[f.key] = false; });
    return { features, indoors: false, building: '', groupSize: '' };
  }
  function normalize(f) {
    const base = emptyFilters();
    if (!f) return base;
    FEATURES.forEach((x) => { base.features[x.key] = !!(f.features && f.features[x.key]); });
    base.indoors = !!f.indoors;
    base.building = f.building || '';
    base.groupSize = f.groupSize || '';
    return base;
  }
  function getFilters() { return normalize(read('activeFilters', null)); }
  function setFilters(f) { write('activeFilters', normalize(f)); }
  function clearFilters() { write('activeFilters', emptyFilters()); }

  function matches(spot, f) {
    f = normalize(f);
    for (const x of FEATURES) {
      if (x.key === 'outdoors') continue;
      if (f.features[x.key] && !spot.features[x.key]) return false;
    }
    // Outdoors and Indoors: if both are picked, either one is fine.
    const out = f.features.outdoors, ind = f.indoors;
    if (out && !ind && !spot.features.outdoors) return false;
    if (ind && !out && spot.features.outdoors) return false;
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
    FEATURES.forEach((x) => { if (f.features[x.key]) items.push({ key: x.key, label: x.label }); });
    if (f.indoors) items.push({ key: 'indoors', label: 'Indoors' });
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
    else if (key === 'indoors') f.indoors = false;
    else f.features[key] = false;
    return f;
  }
  const keyOf = (f) => JSON.stringify(normalize(f));

  /* ---------------- Saved filters & history ---------------- */
  function savedFilters() { return read('savedFilters', []); }
  function saveFilterSet(name, f) {
    const item = { id: 'f' + Date.now().toString(36), name, filters: normalize(f) };
    write('savedFilters', [item].concat(savedFilters()));
    return item;
  }
  function renameSaved(id, name) { write('savedFilters', savedFilters().map((x) => (x.id === id ? { ...x, name } : x))); }
  function deleteSaved(id) { write('savedFilters', savedFilters().filter((x) => x.id !== id)); }

  function history() { return read('filterHistory', []); }
  function pushHistory(f) {
    if (!isActive(f)) return;
    const k = keyOf(f);
    const old = history().find((h) => keyOf(h.filters) === k);
    const rest = history().filter((h) => keyOf(h.filters) !== k);
    const item = { id: 'h' + Date.now().toString(36), name: old ? old.name : '', usedAt: Date.now(), filters: normalize(f) };
    write('filterHistory', [item].concat(rest).slice(0, 5));
  }
  function renameHistory(id, name) { write('filterHistory', history().map((x) => (x.id === id ? { ...x, name } : x))); }
  function deleteHistory(id) { write('filterHistory', history().filter((x) => x.id !== id)); }

  /* ---------------- Small UI preferences ---------------- */
  function pref(key, fallback) { return read('pref.' + key, fallback); }
  function setPref(key, value) { write('pref.' + key, value); }

  return {
    allSpots, getSpot, addUserSpot, deleteSpot, restoreSampleSpots, deletedIds,
    sharedStatus, students, currentStudent, setStudent, loadShared,
    favorites, isFav, toggleFav, getRating, setRating,
    emptyFilters, normalize, getFilters, setFilters, clearFilters, matches, filtered, describe, isActive, removeKey,
    savedFilters, saveFilterSet, renameSaved, deleteSaved,
    history, pushHistory, renameHistory, deleteHistory,
    pref, setPref, clone,
  };
})();

const buildingById = (id) => BUILDINGS.find((b) => b.id === id);
