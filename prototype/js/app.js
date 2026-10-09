/* =========================================================================
   App — hash router + all delegated event handling.
   Routes:  #start  #map  #map-spot-<id>  #building-<id>[-f<floor>]
            #spot-<id> (Spot Details over the page you came from)
            #list  #favorites  #favorites-filters  #add
   ========================================================================= */

const App = {
  base: 'start',        // last non-spot route (the page under Spot Details)
  renderedBase: null,
  navCount: 0,          // hash changes since load, used for "Back"
  flashId: null,        // newly added spot to highlight in the list

  init() {
    window.addEventListener('hashchange', () => { this.navCount++; this.route(); });
    this.route();
    if (Store.sharedStatus() !== 'off') {
      this.loadShared();
      // Pick up teammates' changes when you come back to the tab.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.loadShared(); });
    }
  },

  go(route) {
    if (location.hash.slice(1) === route) this.route();
    else location.hash = route;
  },

  route() {
    const h = location.hash.slice(1) || 'start';
    setHomeMenu(false);
    FilterPanel.close();
    if (h.startsWith('spot-')) {
      const id = h.slice(5);
      if (!Store.getSpot(id)) { this.go('list'); return; }
      if (this.renderedBase !== this.base) this.renderBase(this.base);
      SpotDialog.open(id);
      return;
    }
    SpotDialog.close();
    const sameAsBefore = this.renderedBase === h;
    this.base = h;
    this.renderBase(h, sameAsBefore);
  },

  pageKeyFor(h) {
    if (h.startsWith('map') || h.startsWith('building')) return 'map';
    if (h.startsWith('favorites')) return 'favorites';
    if (['list', 'add', 'start'].includes(h)) return h;
    return '';
  },

  renderBase(h, keepScroll = false) {
    const y = window.scrollY;
    let html;
    if (h === 'start') html = Pages.start();
    else if (h === 'map') html = Pages.map();
    else if (h.startsWith('map-spot-')) html = Pages.map(h.slice(9));
    else if (h.startsWith('building-')) { const [id, fl] = h.slice(9).split('-f'); html = Pages.building(id, fl); }
    else if (h === 'list') html = Pages.list();
    else if (h === 'favorites' || h === 'favorites-filters') html = Pages.favorites(h === 'favorites-filters' ? 'filters' : 'spots');
    else if (h === 'add') html = Pages.add();
    else html = Pages.notFound();
    renderTopBar(this.pageKeyFor(h));
    $('#app').innerHTML = html;
    this.renderedBase = h;
    const names = { start: 'Get Started', map: 'Campus Map', list: 'Study Spots', favorites: 'Favorites', add: 'Add a Spot' };
    document.title = `${names[this.pageKeyFor(h)] || 'Floor View'} · BYU Study Spot Finder`;
    if (h.startsWith('building-')) document.title = `${(buildingById(h.slice(9).split('-f')[0]) || {}).name || 'Building'} · BYU Study Spot Finder`;
    window.scrollTo(0, keepScroll ? y : 0);
    const flash = $('.spot-card.is-flash');
    if (flash) flash.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },

  /** Load shared favorites from Supabase, then redraw. */
  async loadShared() {
    await Store.loadShared();
    this.refresh();
    if (Store.sharedStatus() === 'error') toast('Could not reach the database. Favorites are saved on this device for now.');
  },

  /** Toggle a favorite, redraw right away, and undo it if saving fails. */
  toggleFav(id) {
    const result = Store.toggleFav(id);
    this.refresh();
    result.saved.catch((err) => {
      console.error('Could not save favorite', err);
      this.refresh();
      toast('Could not save that favorite. Check your connection and try again.');
    });
    return result;
  },

  /** Re-render the current page after data/filters change. */
  refresh() {
    this.renderBase(this.base, true);
    if (SpotDialog.id) SpotDialog.render();
  },

  closeSpot() {
    if (this.navCount > 0) history.back();
    else this.go(this.base);
  },
};

/* ---------------- Delegated clicks ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target;

  // Home Menu
  if (t.closest('#home-btn')) { setHomeMenu(!homeMenuOpen()); return; }
  const item = t.closest('[data-menu-route]');
  if (item) {
    setHomeMenu(false);
    if (item.hasAttribute('data-menu-clear')) {
      Store.clearFilters();
      StartState.selected.clear();
      toast('Starting over. Filters cleared.');
    }
    App.go(item.dataset.menuRoute);
    return;
  }
  if (homeMenuOpen() && !t.closest('#home-menu')) setHomeMenu(false);

  // Backdrop closes any open sheet
  if (t.id === 'sheet-backdrop') {
    if (!$('#filter-panel').hidden) FilterPanel.close();
    else if (SpotDialog.id) App.closeSpot();
    return;
  }

  // Filter panel internals
  if (t.closest('#filter-panel')) { FilterPanel.handleClick(e); return; }

  // Spot details internals
  if (t.closest('#spot-dialog')) {
    if (t.closest('[data-sd-close]')) { App.closeSpot(); return; }
    if (t.closest('[data-sd-delete]')) { SpotDialog.confirming = true; SpotDialog.render(); $('[data-sd-delete-confirm]').focus(); return; }
    if (t.closest('[data-sd-delete-cancel]')) { SpotDialog.confirming = false; SpotDialog.render(); return; }
    if (t.closest('[data-sd-delete-confirm]')) {
      const s = Store.getSpot(SpotDialog.id);
      Store.deleteSpot(SpotDialog.id);
      SpotDialog.close();
      toast(`Deleted “${s.name}”`);
      // Leave the details route without going "back" into a deleted spot.
      const base = App.base.includes('map-spot-') ? 'map' : App.base;
      history.replaceState(null, '', '#' + base);
      App.base = base;
      App.refresh();
      return;
    }
    const rate = t.closest('[data-rate]');
    if (rate) {
      const id = rate.dataset.rate, v = Number(rate.dataset.value);
      Store.setRating(id, Store.getRating(id) === v ? 0 : v);
      SpotDialog.render();
      App.renderBase(App.base, true);
      $(`[data-rate="${id}"][data-value="${v}"]`).focus();
      return;
    }
  }

  // Favorite star (cards, dialog)
  const fav = t.closest('[data-fav]');
  if (fav) {
    e.stopPropagation();
    const id = fav.dataset.fav;
    const { on } = App.toggleFav(id);
    toast(on ? 'Added to Favorites' : 'Removed from Favorites');
    const again = $(`#spot-dialog [data-fav="${id}"]`) || $(`#app [data-fav="${id}"]`);
    if (again) again.focus();
    return;
  }

  // Open spot details
  const open = t.closest('[data-open-spot]');
  if (open) { App.go('spot-' + open.dataset.openSpot); return; }

  // Map building
  const bld = t.closest('[data-building]');
  if (bld) { App.go('building-' + bld.dataset.building); return; }
  if (t.closest('[data-close-popup]')) { App.go('map'); return; }

  // Filters (shared)
  if (t.closest('[data-open-filters]')) { FilterPanel.open(); return; }
  const rm = t.closest('[data-remove-filter]');
  if (rm) { Store.setFilters(Store.removeKey(Store.getFilters(), rm.dataset.removeFilter)); App.refresh(); return; }
  if (t.closest('[data-clear-filters]')) { Store.clearFilters(); App.refresh(); toast('Filters cleared'); return; }
  const qg = t.closest('[data-quick-group]');
  if (qg) {
    const f = Store.getFilters();
    f.groupSize = qg.dataset.quickGroup;
    Store.setFilters(f);
    if (Store.isActive(f)) Store.pushHistory(f);
    App.refresh();
    const again = $(`[data-quick-group="${qg.dataset.quickGroup}"]`); again && again.focus();
    return;
  }

  // Get Started
  const chip = t.closest('[data-start-chip]');
  if (chip) {
    const k = chip.dataset.startChip, sel = StartState.selected;
    sel.has(k) ? sel.delete(k) : sel.add(k);
    App.refresh();
    $(`[data-start-chip="${k}"]`).focus();
    return;
  }
  if (t.closest('#go-btn')) {
    const f = Store.emptyFilters();
    StartState.selected.forEach((k) => { if (k === 'indoors') f.indoors = true; else f.features[k] = true; });
    Store.setFilters(f);
    Store.pushHistory(f);
    App.go('list');
    return;
  }
  if (t.closest('#random-btn')) {
    const all = Store.allSpots();
    const pick = all[Math.floor(Math.random() * all.length)];
    App.go('list');
    setTimeout(() => App.go('spot-' + pick.id), 60);
    return;
  }

  // List
  if (t.closest('[data-restore-spots]')) { Store.restoreSampleSpots(); App.refresh(); toast('Sample spots restored'); return; }

  // Favorites page
  const unfav = t.closest('[data-unfav]');
  if (unfav) { App.toggleFav(unfav.dataset.unfav); toast('Removed from Favorites'); return; }
  const findSet = (el) => (el.dataset.kind === 'history' ? Store.history() : Store.savedFilters()).find((x) => x.id === (el.dataset.applySet || el.dataset.deleteSet || el.dataset.renameSave));
  const apply = t.closest('[data-apply-set]');
  if (apply) {
    const set = findSet(apply);
    Store.setFilters(set.filters);
    Store.pushHistory(set.filters);
    toast(set.name ? `Applied “${set.name}”` : 'Filters applied');
    App.go('list');
    return;
  }
  const ren = t.closest('[data-rename]');
  if (ren) { FavState.renaming = ren.dataset.rename; App.refresh(); const i = $(`#rename-${ren.dataset.rename}`); i.focus(); i.select(); return; }
  if (t.closest('[data-rename-cancel]')) { FavState.renaming = null; App.refresh(); return; }
  const rs = t.closest('[data-rename-save]');
  if (rs) { saveRename(rs); return; }
  const del = t.closest('[data-delete-set]');
  if (del) {
    if (del.dataset.kind === 'history') Store.deleteHistory(del.dataset.deleteSet); else Store.deleteSaved(del.dataset.deleteSet);
    App.refresh(); toast('Filter set deleted');
    return;
  }

  // Add a Spot
  const fl = t.closest('[data-add-floor]');
  if (fl) { AddState.floor = Number(fl.dataset.addFloor); AddState.pin = null; App.refresh(); $(`[data-add-floor="${fl.dataset.addFloor}"]`).focus(); return; }
  const ag = t.closest('[data-add-group]');
  if (ag) { AddState.groupSize = ag.dataset.addGroup; App.refresh(); $(`[data-add-group="${ag.dataset.addGroup}"]`).focus(); return; }
  const tag = t.closest('[data-add-tag]');
  if (tag) { const k = tag.dataset.addTag; AddState.tags[k] = !AddState.tags[k]; App.refresh(); $(`[data-add-tag="${k}"]`).focus(); return; }
  if (t.closest('[data-add-cancel]')) { AddState.reset(); App.go('list'); return; }
  const plan = t.closest('#add-plan svg');
  if (plan) {
    const r = plan.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * FP.w, sy = ((e.clientY - r.top) / r.height) * FP.h;
    const clamp = (v) => Math.round(Math.min(97, Math.max(3, v)) * 10) / 10;
    AddState.pin = { x: clamp(((sx - FP.pad) / (FP.w - FP.pad * 2)) * 100), y: clamp(((sy - FP.pad) / (FP.h - FP.pad * 2)) * 100) };
    delete AddState.errors.location;
    App.refresh();
  }
});

function saveRename(btn) {
  const id = btn.dataset.renameSave;
  const name = $(`#rename-${id}`).value.trim();
  if (!name) { toast('Type a name first.'); return; }
  if (btn.dataset.kind === 'history') Store.renameHistory(id, name); else Store.renameSaved(id, name);
  FavState.renaming = null;
  App.refresh();
  toast('Renamed');
}

/* ---------------- Inputs ---------------- */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.closest('#filter-panel')) { FilterPanel.handleChange(e); return; }
  if (t.id === 'student-select') {
    Store.setStudent(Number(t.value));
    App.loadShared().then(() => {
      const me = Store.currentStudent();
      if (me) toast(`Showing favorites for ${me.display_name}`);
      const sel = $('#student-select'); if (sel) sel.focus();
    });
    return;
  }
  if (t.id === 'sort-select') { Store.setPref('sort', t.value); App.refresh(); $('#sort-select').focus(); return; }
  if (t.id === 'add-building') {
    AddState.building = t.value;
    const b = buildingById(t.value);
    AddState.floor = b ? b.floors[0] : null;
    AddState.pin = null;
    if (b) delete AddState.errors.building;
    if (AddState.errors.location === 'Choose a building.' && b) delete AddState.errors.location;
    App.refresh();
    $('#add-building').focus();
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'add-name') {
    AddState.name = t.value;
    if (AddState.errors.name && t.value.trim()) {
      delete AddState.errors.name;
      t.classList.remove('has-error'); t.removeAttribute('aria-invalid');
      $('#add-name-err').hidden = true;
    }
  }
  if (t.id === 'add-desc') AddState.description = t.value;
});

/* ---------------- Add a Spot submit ---------------- */
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'add-form') return;
  e.preventDefault();
  const s = AddState;
  s.errors = {};
  if (!s.name.trim()) s.errors.name = 'Enter a name for this spot.';
  if (!s.building) s.errors.location = 'Choose a building.';
  else if (!s.floor) s.errors.location = 'Choose a floor.';
  else if (!s.pin) s.errors.location = 'Click the floor plan to place a pin where the spot is.';
  if (Object.keys(s.errors).length) {
    App.refresh();
    (s.errors.name ? $('#add-name') : $('#add-building')).focus();
    return;
  }
  const features = {};
  FEATURES.forEach((f) => { features[f.key] = !!s.tags[f.key]; });
  const saved = Store.addUserSpot({
    name: s.name.trim(), building: s.building, floor: s.floor, room: '', position: s.pin,
    features, groupSize: s.groupSize, busyness: 'Moderate', description: s.description.trim(),
  });
  // Make sure the new spot is visible in the list.
  if (!Store.matches({ ...saved }, Store.getFilters())) Store.clearFilters();
  App.flashId = saved.id;
  AddState.reset();
  toast(`Added “${saved.name}” to your spots`);
  App.go('list');
});

/* ---------------- Keyboard ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (homeMenuOpen()) { setHomeMenu(false); $('#home-btn').focus(); return; }
    if (!$('#filter-panel').hidden) { FilterPanel.close(); return; }
    if (SpotDialog.id) { App.closeSpot(); return; }
    if ($('.map-popup')) { App.go('map'); return; }
  }
  // Enter / Space on cards, map buildings and markers
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-spot]:not(button), [data-building]')) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Enter' && e.target.id === 'fp-save-name') { e.preventDefault(); FilterPanel.confirmSave(); }
  if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('rename-')) {
    e.preventDefault();
    saveRename($(`[data-rename-save="${e.target.id.slice(7)}"]`));
  }
  // Arrow keys inside the Home Menu
  if (homeMenuOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = $$('.home-item'); const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
});

App.init();
