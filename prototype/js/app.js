/* =========================================================================
   App — hash router + all delegated event handling.
   Routes:  #start  #map  #map-spot-<id>  #building-<id>[-f<floor>]
            #spot-<id> (Spot Details over the page you came from)
            #list  #favorites  #add  #add-<building id> (Add a Spot with the building picked)
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
    // Account pages (#welcome, #login, #signup) are optional; the rest of the site works without signing in.
    let h = location.hash.slice(1) || 'start';
    // Coming back from a Supabase email link (#access_token=… or #error=…): Supabase reads it, we show Get Started.
    if (/(^|&)(access_token|error)=/.test(h)) { h = 'start'; history.replaceState(null, '', '#start'); }
    // Already logged in: skip the Welcome / Log in / Create account pages.
    if (AccountPages.isPublic(h) && AccountSession.signedIn) { h = 'start'; history.replaceState(null, '', '#start'); }
    // #add-<building>: open Add a Spot with that building already chosen.
    if (h.startsWith('add-')) {
      const b = buildingById(h.slice(4));
      if (b && AddState.building !== b.id) { AddState.building = b.id; AddState.floor = b.floors[0]; AddState.pin = null; }
      h = 'add'; history.replaceState(null, '', '#add');
    }
    setHomeMenu(false);
    setAccountMenu(false);
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
    if (AccountPages.isPublic(h)) html = AccountPages.render(h);
    else if (h === 'start') html = Pages.start();
    else if (h === 'map') html = Pages.map();
    else if (h.startsWith('map-spot-')) html = Pages.map(h.slice(9));
    else if (h.startsWith('building-')) { const [id, fl] = h.slice(9).split('-f'); html = Pages.building(id, fl); }
    else if (h === 'list') html = Pages.list();
    else if (h === 'favorites' || h === 'favorites-filters') html = Pages.favorites(); // old saved-filters link still works
    else if (h === 'add') html = Pages.add();
    else html = Pages.notFound();
    renderTopBar(AccountPages.isPublic(h) ? 'account' : this.pageKeyFor(h));
    $('#app').innerHTML = html;
    this.renderedBase = h;
    const names = { start: 'Get Started', map: 'Campus Map', list: 'Study Spots', favorites: 'Favorites', add: 'Add a Spot' };
    document.title = `${AccountPages.titles[h] || names[this.pageKeyFor(h)] || 'Floor View'} · BYU Study Spot Finder`;
    if (h.startsWith('building-')) document.title = `${(buildingById(h.slice(9).split('-f')[0]) || {}).name || 'Building'} · BYU Study Spot Finder`;
    window.scrollTo(0, keepScroll ? y : 0);
    const flash = $('.spot-card.is-flash');
    if (flash) flash.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // Phones: the map is wider than the screen, so center it on the selected building (or the library).
    const wrap = $('.map-wrap');
    if (wrap && wrap.scrollWidth > wrap.clientWidth) {
      const focus = $('.bldg.is-target .bldg-shape') || $('[data-building="hbll"] .bldg-shape');
      const scale = wrap.scrollWidth / CAMPUS.w;
      if (focus) wrap.scrollLeft = (focus.getBBox().x + focus.getBBox().width / 2) * scale - wrap.clientWidth / 2;
    }
    // Selected spot on the map: bring its card and the highlighted building into view.
    if (!keepScroll && h.startsWith('map-spot-') && $('#map-selected')) $('#map-selected').scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    // Never replace a form while someone is typing; just update the top bar.
    if (AccountPages.isPublic(this.base)) { renderTopBar('account'); Recommend.refresh(); return; }
    this.renderBase(this.base, true);
    if (SpotDialog.id) SpotDialog.render();
    Recommend.refresh();
  },

  /** Open a random spot (from `list`, or every spot), e.g. when nothing matches. */
  randomSpot(list) {
    const choice = Store.randomSpot(list);
    if (!choice) return;
    FilterPanel.close();
    this.go('spot-' + choice.id);
    toast(`Random pick: ${choice.name}`);
  },

  closeSpot() {
    if (this.navCount > 0) history.back();
    else this.go(this.base);
  },
};

/* ---------------- Delegated clicks ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target;

  // Account menu (your name in the top bar)
  if (t.closest('#account-btn')) { setAccountMenu(!accountMenuOpen()); return; }
  if (t.closest('[data-sign-out]')) { setAccountMenu(false); AccountSession.signOut(); return; }

  // "Pick a random spot" (no-results message, Filter Panel)
  if (t.closest('[data-random-spot]')) { App.randomSpot(); return; }
  if (accountMenuOpen() && !t.closest('#account-menu')) setAccountMenu(false);

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
      if (!Store.isOwnSpot(s)) return;
      Store.deleteSpot(SpotDialog.id).catch((err) => {
        console.error('Could not delete spot', err);
        App.refresh();
        toast(`Could not delete “${s.name}”. Check your connection and try again.`);
      });
      SpotDialog.close();
      toast(`Deleted “${s.name}”`);
      // Leave the details route without going "back" into a deleted spot.
      const base = App.base.includes('map-spot-') ? 'map' : App.base;
      history.replaceState(null, '', '#' + base);
      App.base = base;
      App.refresh();
      return;
    }
  }

  // Favorite star (cards, dialog)
  const fav = t.closest('[data-fav]');
  if (fav) {
    e.stopPropagation();
    const id = fav.dataset.fav;
    const { on, needsLogin } = App.toggleFav(id);
    if (needsLogin) { toast('Log in to save favorites.', { href: '#login', label: 'Log in' }); return; }
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
    App.refresh();
    const again = $(`[data-quick-group="${qg.dataset.quickGroup}"]`); again && again.focus();
    return;
  }

  // Get Started
  const chip = t.closest('[data-start-chip]');
  if (chip) {
    const k = chip.dataset.startChip, sel = StartState.selected;
    if (sel.has(k)) sel.delete(k);
    else {
      sel.add(k);
      // Indoors and Outdoors are one choice: picking one un-picks the other.
      if (k === 'indoors') sel.delete('outdoors');
      if (k === 'outdoors') sel.delete('indoors');
    }
    App.refresh();
    $(`[data-start-chip="${k}"]`).focus();
    return;
  }
  if (t.closest('#go-btn')) {
    Store.setFilters(startFilters());
    App.go('list');
    return;
  }
  if (t.closest('#random-btn')) { App.randomSpot(Store.filtered(startFilters())); return; }

  // Favorites page
  const unfav = t.closest('[data-unfav]');
  if (unfav) { App.toggleFav(unfav.dataset.unfav); toast('Removed from Favorites'); return; }
  // Add a Spot
  const fl = t.closest('[data-add-floor]');
  if (fl) { AddState.floor = Number(fl.dataset.addFloor); AddState.pin = null; App.refresh(); $(`[data-add-floor="${fl.dataset.addFloor}"]`).focus(); return; }
  const ag = t.closest('[data-add-group]');
  if (ag) { AddState.groupSize = ag.dataset.addGroup; App.refresh(); $(`[data-add-group="${ag.dataset.addGroup}"]`).focus(); return; }
  const st = t.closest('[data-add-setting]');
  if (st) { AddState.setting = st.dataset.addSetting; App.refresh(); $(`[data-add-setting="${st.dataset.addSetting}"]`).focus(); return; }
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

/* ---------------- Inputs ---------------- */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.closest('#filter-panel')) { FilterPanel.handleChange(e); return; }
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
/** Plain-words reason a spot didn't save, so the toast says what to fix
    instead of always blaming the connection. Full details go to the console. */
function spotSaveError(err) {
  const msg = String((err && err.message) || err || '');
  const code = err && err.code;
  const fix = 'Run supabase/migrations/20261106060000_fix_add_spot.sql in the Supabase SQL Editor.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Could not reach the database. Check your connection and try again.';
  }
  if (/isn't in the database yet/.test(msg)) return `Could not save your spot: ${msg.replace(/ Apply .*$/, '')} ${fix}`;
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return `Could not save your spot: the database doesn't allow it yet. ${fix}`;
  }
  if (code === 'PGRST204' || code === '42703' || code === '23503' || code === '42883') {
    return `Could not save your spot: the database is missing a part this page needs. ${fix}`;
  }
  if (code === '23505') return `Could not save your spot: the database's id counter is behind. ${fix}`;
  if (code === 'PGRST301' || /jwt/i.test(msg)) return 'Your login has expired. Log out, log back in, and try again.';
  return `Could not save your spot to the database: ${msg || 'unknown error'}`;
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'add-form') return;
  e.preventDefault();
  const s = AddState;
  if (s.saving) return;
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
  if (Store.needsLogin()) { toast('Log in to add a spot for your team.', { href: '#login', label: 'Log in' }); return; }
  const features = {};
  FILTER_FEATURES.forEach((f) => { features[f.key] = !!s.tags[f.key]; });
  features.outdoors = s.setting === 'outdoors';
  const submitBtn = e.target.querySelector('[type="submit"]');
  s.saving = true;
  submitBtn.disabled = true;
  let saved;
  try {
    saved = await Store.addUserSpot({
      name: s.name.trim(), building: s.building, floor: s.floor, room: '', position: s.pin,
      features, groupSize: s.groupSize, busyness: 'Moderate', description: s.description.trim(),
    });
  } catch (err) {
    console.error('Could not save spot', err);
    toast(spotSaveError(err), { duration: 9000 });
    return;
  } finally {
    s.saving = false;
    if (submitBtn.isConnected) submitBtn.disabled = false;
  }
  // Make sure the new spot is visible in the list.
  if (!Store.matches({ ...saved }, Store.getFilters())) Store.clearFilters();
  App.flashId = saved.id;
  AddState.reset();
  toast(Store.sharedStatus() === 'ok' ? `Added “${saved.name}” for your whole team` : `Added “${saved.name}” on this device`);
  App.go('list');
});

/* ---------------- Keyboard ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (homeMenuOpen()) { setHomeMenu(false); $('#home-btn').focus(); return; }
    if (accountMenuOpen()) { setAccountMenu(false); $('#account-btn').focus(); return; }
    if (!$('#filter-panel').hidden) { FilterPanel.close(); return; }
    if (SpotDialog.id) { App.closeSpot(); return; }
    if ($('#map-selected')) { App.go('map'); return; }
  }
  // Enter / Space on cards, map buildings and markers
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-spot]:not(button), [data-building]')) {
    e.preventDefault();
    // SVG building groups do not implement HTMLElement.click().
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  // Arrow keys inside the Home Menu
  if (homeMenuOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = $$('#home-menu .menu-item'); const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
});

/* ---------------- Mobile: swipe a sheet down to close it ---------------- */
(() => {
  let drag = null;
  document.addEventListener('touchstart', (e) => {
    const sheet = e.target.closest('.sheet');
    if (!sheet || window.innerWidth >= 760) return;
    // Only from the grip / header, or from the body when it is already scrolled to the top.
    const body = $('.sheet-body', sheet);
    const fromHead = !!e.target.closest('.sheet-grip, .sheet-head');
    if (!fromHead && !(e.target.closest('.sheet-body') && body.scrollTop <= 0)) return;
    drag = { sheet, y0: e.touches[0].clientY, dy: 0, fromHead };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y0);
    if (!drag.fromHead && drag.dy < 12) return;
    drag.sheet.style.transition = 'none';
    drag.sheet.style.transform = `translateY(${drag.dy}px)`;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!drag) return;
    const { sheet, dy } = drag;
    drag = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy < 90) return;
    if (sheet.id === 'filter-panel') FilterPanel.close();
    else if (SpotDialog.id) App.closeSpot();
  });
})();

App.init();
