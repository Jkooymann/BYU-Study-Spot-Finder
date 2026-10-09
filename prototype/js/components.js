/* =========================================================================
   Reusable components: icons, top bar + Home Menu, chips, badges, star
   rating, spot card, active-filter bar, group-size picker, floor plan,
   Filter Panel, Spot Details dialog, toast.
   ========================================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------------- Icons (simple line icons, 24×24) ---------------- */
const ICONS = {
  quietZone: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  talkingAllowed: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.2A8 8 0 1 1 20 12z"/><path d="M9 11h.01M13 11h.01M17 11h.01"/>',
  foodAllowed: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18"/><path d="M18 21V3c-2.5 1.2-3.5 4-3.5 7.5H18"/>',
  outlets: '<path d="M9 2v5M15 2v5"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  tables: '<path d="M3 8h18M6 8v12M18 8v12M6 13h12"/>',
  comfySeating: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 18v2M19 18v2"/>',
  outdoors: '<path d="M12 3 5.5 12H9l-3.5 5h13L15 12h3.5z"/><path d="M12 17v4"/>',
  indoors: '<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users2: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 13.5a7 7 0 0 1 4 6.5"/>',
  users3: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.3"/><circle cx="19" cy="10" r="2.3"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0M1 19a4 4 0 0 1 4.5-4M23 19a4 4 0 0 0-4.5-4"/>',
  sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
};
function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const GROUP_ICON = { solo: 'user', 'small group': 'users2', 'big group': 'users3' };
const groupLabel = (key) => (GROUP_SIZES.find((g) => g.key === key) || {}).label || key;

/* ---------------- Top bar + Home Menu ---------------- */
const HOME_MENU = [
  { key: 'favorites', label: 'Favorites', sub: 'Favorites & saved filters', icon: 'star', route: 'favorites' },
  { key: 'list', label: 'Study Spot List', sub: 'Browse every spot', icon: 'list', route: 'list' },
  { key: 'map', label: 'Campus Map', sub: 'Explore by building', icon: 'map', route: 'map' },
  { key: 'start', label: 'Start Over', sub: 'Clears active filters', icon: 'refresh', route: 'start', clear: true },
  { key: 'add', label: 'Add a Spot', sub: 'Save your own spot', icon: 'plus', route: 'add' },
];

function renderTopBar(pageKey) {
  const link = (route, label, ic) => {
    const cur = pageKey === route;
    return `<a href="#${route}" class="nav-link${cur ? ' is-current' : ''}"${cur ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
  };
  $('#topbar').innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="#start" aria-label="BYU Study Spot Finder, Get Started">
        <span class="brand-mark" aria-hidden="true">${icon('pin')}</span>
        <span class="brand-name"><span class="brand-byu">BYU</span> Study Spot Finder</span>
      </a>
      <nav class="main-nav" aria-label="Main">
        ${link('map', 'Map', 'map')}${link('list', 'List', 'list')}${link('favorites', 'Favorites', 'star')}
      </nav>
      <div class="topbar-right">
      ${studentPicker()}
      <div class="home-menu-wrap">
        <button id="home-btn" class="icon-btn home-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="home-menu" aria-label="Home menu">${icon('home')}</button>
        <div id="home-menu" class="home-menu" role="menu" aria-label="Home menu" hidden>
          ${HOME_MENU.map((m) => `
            <button type="button" role="menuitem" class="home-item${pageKey === m.key ? ' is-current' : ''}" data-menu-route="${m.route}"${m.clear ? ' data-menu-clear' : ''}${pageKey === m.key ? ' aria-current="page"' : ''}>
              <span class="home-item-ic">${icon(m.icon)}</span>
              <span><span class="home-item-label">${m.label}</span><span class="home-item-sub">${m.sub}</span></span>
            </button>`).join('')}
        </div>
      </div>
      </div>
    </div>`;
}
/** "Viewing as" dropdown: which sample student's favorites to show and save (no sign-in yet). */
function studentPicker() {
  const list = Store.students();
  if (Store.sharedStatus() !== 'ok' || !list.length) return '';
  const me = Store.currentStudent();
  return `<label class="student-pick" title="Favorites are saved for this student and shared with your team">
      ${icon('user')}
      <select id="student-select" class="student-select" aria-label="Viewing as student">
        ${list.map((u) => `<option value="${u.user_id}"${me && me.user_id === u.user_id ? ' selected' : ''}>${esc(u.display_name)}</option>`).join('')}
      </select>
    </label>`;
}
function homeMenuOpen() { const m = $('#home-menu'); return m && !m.hidden; }
function setHomeMenu(open) {
  const m = $('#home-menu'), b = $('#home-btn');
  if (!m) return;
  m.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
  b.classList.toggle('is-open', open);
  if (open) { const first = $('.home-item.is-current', m) || $('.home-item', m); first && first.focus(); }
}

/* ---------------- Small pieces ---------------- */
function busyBadge(level) {
  const n = BUSYNESS.indexOf(level) + 1;
  const cls = ['empty', 'moderate', 'busy'][n - 1] || 'moderate';
  return `<span class="busy busy-${cls}" title="Typical busyness (estimate, not live)">
      <span class="busy-bars" aria-hidden="true"><i></i><i></i><i></i></span>${esc(level)}<span class="est">est.</span></span>`;
}
function groupBadge(key) {
  return `<span class="group-badge">${icon(GROUP_ICON[key] || 'user')}${esc(groupLabel(key))}</span>`;
}
function favButton(id, withLabel = false) {
  const on = Store.isFav(id);
  return `<button type="button" class="fav-btn${on ? ' is-on' : ''}${withLabel ? ' fav-btn-label' : ''}" data-fav="${id}" aria-pressed="${on}" aria-label="${on ? 'Remove from favorites' : 'Add to favorites'}">${icon('star')}${withLabel ? `<span>${on ? 'Favorited' : 'Favorite'}</span>` : ''}</button>`;
}
function starRating(id) {
  const r = Store.getRating(id);
  return `<div class="stars" role="radiogroup" aria-label="Your rating">
    ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${r === n}" aria-label="${plural(n, 'star')}" class="star${n <= r ? ' is-on' : ''}" data-rate="${id}" data-value="${n}">${icon('star')}</button>`).join('')}
  </div>`;
}
function starsSmall(n) {
  if (!n) return '';
  return `<span class="stars-small" aria-label="Your rating: ${plural(n, 'star')}">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? 'is-on' : ''}">${icon('star')}</span>`).join('')}</span>`;
}

function spotCard(s, opts = {}) {
  const b = buildingById(s.building) || { short: s.building };
  const feats = FEATURES.filter((f) => s.features[f.key]);
  return `<article class="spot-card${opts.dim ? ' is-dim' : ''}${opts.flash ? ' is-flash' : ''}" data-open-spot="${s.id}" tabindex="0" aria-label="${esc(s.name)}, ${esc(b.short)} floor ${s.floor}">
    ${opts.num ? `<span class="spot-num" aria-hidden="true">${opts.num}</span>` : ''}
    <div class="spot-card-main">
      <div class="spot-card-title">
        <h3>${esc(s.name)}</h3>
        ${s.isUserSpot ? '<span class="badge-mine">My spot</span>' : ''}
      </div>
      <p class="spot-meta">${esc(b.short)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}</p>
      <div class="spot-card-row">${groupBadge(s.groupSize)}${busyBadge(s.busyness)}${starsSmall(Store.getRating(s.id))}</div>
      <ul class="feature-icons" aria-label="Features">
        ${feats.map((f) => `<li title="${f.label}">${icon(f.key)}<span class="sr-only">${f.label}</span></li>`).join('')}
      </ul>
    </div>
    ${favButton(s.id)}
  </article>`;
}

/* Active filters as removable chips + Clear all (Map, List, Floor view) */
function activeFiltersBar() {
  const items = Store.describe(Store.getFilters());
  if (!items.length) return '';
  return `<div class="active-filters" aria-label="Active filters">
    ${items.map((i) => `<button type="button" class="chip chip-removable${i.group ? ' chip-group' : ''}" data-remove-filter="${i.key}" aria-label="Remove filter: ${esc(i.label)}">${esc(i.label)}${icon('x')}</button>`).join('')}
    <button type="button" class="link-btn" data-clear-filters>Clear all</button>
  </div>`;
}
/* Read-only chips for saved filter sets */
function filterChips(f) {
  const items = Store.describe(f);
  return `<div class="chip-row">${items.map((i) => `<span class="chip chip-static${i.group ? ' chip-group' : ''}">${esc(i.label)}</span>`).join('')}</div>`;
}

/* Group size — prominent segmented control (key use case) */
function groupSizePicker(current, attr = 'data-quick-group', withAny = true) {
  const opts = (withAny ? [{ key: '', label: 'Any size', hint: 'All groups' }] : []).concat(GROUP_SIZES);
  return `<div class="group-picker" role="radiogroup" aria-label="Group size">
    ${opts.map((g) => `<button type="button" role="radio" aria-checked="${current === g.key}" class="group-opt${current === g.key ? ' is-on' : ''}" ${attr}="${g.key}">
      ${icon(g.key ? GROUP_ICON[g.key] : 'layers')}<span class="group-opt-label">${g.label}</span><span class="group-opt-hint">${g.hint}</span></button>`).join('')}
  </div>`;
}

function toolbar(count) {
  const n = Store.describe(Store.getFilters()).length;
  return `<div class="toolbar">
    <div class="toolbar-group">
      <p class="toolbar-label">Who's studying?</p>
      ${groupSizePicker(Store.getFilters().groupSize)}
    </div>
    <button type="button" class="btn btn-secondary filter-btn" data-open-filters>${icon('filter')}Filters${n ? `<span class="count-pill">${n}</span>` : ''}</button>
  </div>
  ${activeFiltersBar()}`;
}

/* ---------------- Floor plan (simple rectangles) ---------------- */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}
const FP = { w: 400, h: 250, pad: 10 };
const fpX = (pct) => FP.pad + (pct / 100) * (FP.w - FP.pad * 2);
const fpY = (pct) => FP.pad + (pct / 100) * (FP.h - FP.pad * 2);

/**
 * spots: [{ spot, num, match }]   opts: { pin:{x,y}, interactive }
 */
function floorPlanSvg(buildingId, floor, spots = [], opts = {}) {
  const rnd = seeded(buildingId + '-' + floor);
  const left = FP.pad, right = FP.w - FP.pad, top = FP.pad, bottom = FP.h - FP.pad;
  const cTop = 108, cBot = 142;
  const rooms = [];
  const row = (y1, y2) => {
    let x = left;
    while (x < right - 30) {
      const w = Math.min(right - x, 50 + Math.floor(rnd() * 70));
      rooms.push(`<rect class="fp-room" x="${x}" y="${y1}" width="${right - x - w < 30 ? right - x : w}" height="${y2 - y1}"/>`);
      if (right - x - w < 30) break;
      x += w;
    }
  };
  row(top, cTop); row(cBot, bottom);
  const stairX = left + 20 + Math.floor(rnd() * 300);
  const markers = spots.map(({ spot, num, match }) => {
    const x = fpX(spot.position.x), y = fpY(spot.position.y);
    return `<g class="fp-marker${match ? ' is-match' : ' is-off'}" data-open-spot="${spot.id}" tabindex="0" role="button" aria-label="${esc(spot.name)}${match ? '' : ' (does not match filters)'}" transform="translate(${x} ${y})">
      <circle class="fp-halo" r="16"/><circle class="fp-dot" r="10"/><text class="fp-num" y="4">${num}</text></g>`;
  }).join('');
  const pin = opts.pin ? `<g class="fp-pin" transform="translate(${fpX(opts.pin.x)} ${fpY(opts.pin.y)})"><circle class="fp-halo" r="16"/><path class="fp-pin-shape" d="M0 0c-6-7-9-11-9-15a9 9 0 0 1 18 0c0 4-3 8-9 15z" transform="translate(0 -2)"/><circle class="fp-pin-hole" cy="-17" r="3.2"/></g>` : '';
  return `<svg class="floorplan${opts.interactive ? ' is-interactive' : ''}" viewBox="0 0 ${FP.w} ${FP.h}" role="img" aria-label="Floor plan, floor ${floor}">
    <rect class="fp-ground" x="0" y="0" width="${FP.w}" height="${FP.h}" rx="12"/>
    ${rooms.join('')}
    <rect class="fp-corridor" x="${left}" y="${cTop}" width="${right - left}" height="${cBot - cTop}"/>
    <g class="fp-stairs"><rect x="${stairX}" y="${cTop + 6}" width="26" height="22"/><path d="M${stairX + 5} ${cTop + 6}v22M${stairX + 11} ${cTop + 6}v22M${stairX + 17} ${cTop + 6}v22"/></g>
    <rect class="fp-wall" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="4"/>
    <text class="fp-label" x="${right - 8}" y="${cTop + 21}" text-anchor="end">Floor ${floor}</text>
    ${markers}${pin}
  </svg>`;
}

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => { t.hidden = true; }, 250); }, msg.length > 60 ? 7000 : 2600);
}

/* ---------------- Sheets (shared open/close) ---------------- */
function anySheetOpen() { return !$('#filter-panel').hidden || !$('#spot-dialog').hidden; }
function syncBackdrop() {
  const open = anySheetOpen();
  $('#sheet-backdrop').hidden = !open;
  document.documentElement.classList.toggle('sheet-open', open);
}

/* ---------------- Filter Panel (Component 8) ---------------- */
const FilterPanel = {
  draft: null,
  saving: false,
  open() {
    this.draft = Store.getFilters();
    this.saving = false;
    this.render();
    $('#filter-panel').hidden = false;
    syncBackdrop();
    $('#fp-close').focus();
  },
  close() {
    if ($('#filter-panel').hidden) return;
    $('#filter-panel').hidden = true;
    syncBackdrop();
  },
  count() { return Store.filtered(this.draft).length; },
  render() {
    const d = this.draft;
    const el = $('#filter-panel');
    el.innerHTML = `
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 id="fp-title">Filters</h2>
        <button type="button" class="icon-btn" id="fp-close" aria-label="Close filters">${icon('x')}</button>
      </header>
      <div class="sheet-body">
        <section class="fp-section fp-group">
          <h3 class="fp-h">Group size</h3>
          ${groupSizePicker(d.groupSize, 'data-fp-group')}
        </section>
        <section class="fp-section">
          <h3 class="fp-h">Features</h3>
          <div class="check-grid">
            ${FEATURES.map((f) => `<label class="check" for="fp-${f.key}">
              <input type="checkbox" id="fp-${f.key}" data-fp-feature="${f.key}" ${d.features[f.key] ? 'checked' : ''}>
              <span class="check-box">${icon('check')}</span>${icon(f.key, 'check-ic')}<span>${f.label}</span></label>`).join('')}
          </div>
          ${d.indoors ? `<p class="fp-note">Also showing <strong>indoor spots only</strong> (from Get Started). <button type="button" class="link-btn" data-fp-indoors>Remove</button></p>` : ''}
        </section>
        <section class="fp-section">
          <label class="fp-h" for="fp-building">Building</label>
          <select id="fp-building" class="select" data-fp-building>
            <option value="">All buildings</option>
            ${BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => `<option value="${b.id}" ${d.building === b.id ? 'selected' : ''}>${esc(b.name)} (${b.short})</option>`).join('')}
          </select>
        </section>
        <section class="fp-section fp-save" ${this.saving ? '' : 'hidden'}>
          <label class="fp-h" for="fp-save-name">Name this filter set</label>
          <div class="inline-form">
            <input id="fp-save-name" class="input" type="text" maxlength="40" placeholder="e.g., Quiet + outlets">
            <button type="button" class="btn btn-primary btn-sm" data-fp-save-confirm>Save</button>
            <button type="button" class="btn btn-ghost btn-sm" data-fp-save-cancel>Cancel</button>
          </div>
          <p class="field-error" id="fp-save-error" hidden></p>
        </section>
      </div>
      <footer class="sheet-foot">
        <div class="sheet-foot-row">
          <button type="button" class="btn btn-ghost" data-fp-reset>Reset</button>
          <button type="button" class="btn btn-secondary" data-fp-save>Save these filters</button>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-fp-apply id="fp-apply"></button>
      </footer>`;
    this.updateCount();
  },
  updateCount() {
    const n = this.count();
    const b = $('#fp-apply');
    b.textContent = n ? `Show ${plural(n, 'spot')}` : 'No spots match';
    b.disabled = n === 0;
  },
  handleClick(e) {
    const t = e.target.closest('button, input, select');
    if (!t) return;
    if (t.id === 'fp-close') return this.close();
    if (t.matches('[data-fp-group]')) { this.draft.groupSize = t.dataset.fpGroup; return this.rerenderKeepSave(); }
    if (t.matches('[data-fp-indoors]')) { this.draft.indoors = false; return this.rerenderKeepSave(); }
    if (t.matches('[data-fp-reset]')) { this.draft = Store.emptyFilters(); return this.rerenderKeepSave(); }
    if (t.matches('[data-fp-save]')) {
      if (!Store.isActive(this.draft)) { toast('Pick at least one filter to save.'); return; }
      this.saving = true; $('.fp-save').hidden = false; $('#fp-save-name').focus(); return;
    }
    if (t.matches('[data-fp-save-cancel]')) { this.saving = false; $('.fp-save').hidden = true; return; }
    if (t.matches('[data-fp-save-confirm]')) return this.confirmSave();
    if (t.matches('[data-fp-apply]')) {
      Store.setFilters(this.draft);
      Store.pushHistory(this.draft);
      this.close();
      App.refresh();
      toast(`Showing ${plural(Store.filtered().length, 'matching spot')}`);
    }
  },
  confirmSave() {
    const name = $('#fp-save-name').value.trim();
    const err = $('#fp-save-error');
    if (!name) { err.textContent = 'Give this filter set a name, like “Quiet + outlets”.'; err.hidden = false; $('#fp-save-name').focus(); return; }
    Store.saveFilterSet(name, this.draft);
    this.saving = false;
    $('.fp-save').hidden = true;
    toast(`Saved “${name}” to Favorites`);
  },
  rerenderKeepSave() { const name = $('#fp-save-name') ? $('#fp-save-name').value : ''; this.render(); if (this.saving) $('#fp-save-name').value = name; },
  handleChange(e) {
    const t = e.target;
    if (t.matches('[data-fp-feature]')) this.draft.features[t.dataset.fpFeature] = t.checked;
    if (t.matches('[data-fp-building]')) this.draft.building = t.value;
    this.updateCount();
  },
};

/* ---------------- Spot Details (Page 5, shown as a dialog over the page you came from) ---------------- */
const SpotDialog = {
  id: null,
  confirming: false,
  open(id) {
    this.id = id;
    this.confirming = false;
    this.render();
    const el = $('#spot-dialog');
    const wasHidden = el.hidden;
    el.hidden = false;
    syncBackdrop();
    if (wasHidden) { el.scrollTop = 0; $('#sd-close').focus(); }
  },
  close() {
    const el = $('#spot-dialog');
    if (el.hidden) return;
    el.hidden = true;
    this.id = null;
    syncBackdrop();
  },
  render() {
    const s = Store.getSpot(this.id);
    if (!s) return;
    const b = buildingById(s.building);
    $('#spot-dialog').innerHTML = `
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head sd-head">
        <button type="button" class="btn btn-ghost btn-sm" data-sd-close>${icon('back')}Back</button>
        <button type="button" class="icon-btn" id="sd-close" data-sd-close aria-label="Close spot details">${icon('x')}</button>
      </header>
      <div class="sheet-body sd-body">
        <div class="sd-title">
          <p class="eyebrow">${esc(b.name)}</p>
          <h2 id="sd-title">${esc(s.name)}</h2>
          <p class="spot-meta">${esc(b.short)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}${s.isUserSpot ? ' <span class="badge-mine">My spot</span>' : ''}</p>
        </div>
        <div class="sd-actions">
          ${favButton(s.id, true)}
          <a class="btn btn-secondary" href="#map-spot-${s.id}">${icon('map')}Show on map</a>
          <a class="btn btn-ghost" href="#building-${s.building}-f${s.floor}">${icon('layers')}Floor plan</a>
        </div>
        ${s.description ? `<p class="sd-desc">${esc(s.description)}</p>` : ''}
        <div class="sd-facts">
          <div class="sd-fact sd-fact-group">
            <span class="fact-label">Group size</span>
            <span class="fact-value">${icon(GROUP_ICON[s.groupSize])}${groupLabel(s.groupSize)}</span>
          </div>
          <div class="sd-fact">
            <span class="fact-label">How busy it usually is</span>
            <span class="fact-value">${busyBadge(s.busyness)}</span>
            <span class="fact-note">Estimated typical level, not live data.</span>
          </div>
        </div>
        <h3 class="sd-h">Features</h3>
        <ul class="feature-list">
          ${FEATURES.map((f) => `<li class="${s.features[f.key] ? 'has' : 'not'}">
            <span class="yn" aria-hidden="true">${s.features[f.key] ? '✓' : '✗'}</span>${icon(f.key)}<span>${f.label}</span>
            <span class="sr-only">${s.features[f.key] ? 'yes' : 'no'}</span></li>`).join('')}
        </ul>
        <h3 class="sd-h">Your rating</h3>
        ${starRating(s.id)}
        <p class="fact-note">Ratings are saved on this device only.</p>
        <div class="sd-danger">
          ${this.confirming ? `
            <p><strong>Delete this spot?</strong> ${s.isUserSpot ? 'Your spot will be removed from this device.' : 'This hides the sample spot on this device. You can restore sample spots from the list page.'}</p>
            <div class="sd-danger-row">
              <button type="button" class="btn btn-danger btn-sm" data-sd-delete-confirm>Delete spot</button>
              <button type="button" class="btn btn-ghost btn-sm" data-sd-delete-cancel>Cancel</button>
            </div>` : `<button type="button" class="btn btn-ghost btn-sm danger-text" data-sd-delete>${icon('trash')}Delete this spot</button>`}
        </div>
      </div>`;
  },
};
