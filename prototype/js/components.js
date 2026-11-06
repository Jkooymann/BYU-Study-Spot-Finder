/* =========================================================================
   Reusable components: icons, top bar + Home Menu, chips, badges, star
   spot card, active-filter bar, group-size picker, floor plan,
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
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
};
function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
const GROUP_ICON = { solo: 'user', 'small group': 'users2', 'big group': 'users3' };
const groupLabel = (key) => (GROUP_SIZES.find((g) => g.key === key) || {}).label || key;

/* ---------------- Top bar + menu ---------------- */
// The ☰ menu on the right of the top bar (the logo also goes to Get Started).
const HOME_MENU = [
  { key: 'start', label: 'Home', sub: 'Pick what you need in a spot', icon: 'home', route: 'start' },
  { key: 'map', label: 'Campus Map', sub: 'Explore by building', icon: 'map', route: 'map' },
  { key: 'list', label: 'Study Spots', sub: 'Browse every spot', icon: 'list', route: 'list' },
  { key: 'favorites', label: 'Favorites', sub: 'Your saved study spots', icon: 'star', route: 'favorites' },
  { key: 'add', label: 'Add a Spot', sub: 'Share a spot you love', icon: 'plus', route: 'add' },
  { key: 'reset', label: 'Start Over', sub: 'Clear all filters', icon: 'refresh', route: 'start', clear: true, divider: true },
];

function menuItem({ label, sub, ic, attrs = '', current = false, divider = false }) {
  return `${divider ? '<div class="menu-divider" role="separator"></div>' : ''}
    <button type="button" role="menuitem" class="menu-item${current ? ' is-current' : ''}" ${attrs}${current ? ' aria-current="page"' : ''}>
      <span class="menu-item-ic">${icon(ic)}</span>
      <span><span class="menu-item-label">${label}</span>${sub ? `<span class="menu-item-sub">${sub}</span>` : ''}</span>
    </button>`;
}

function renderTopBar(pageKey) {
  const link = (route, label, ic) => {
    const cur = pageKey === route;
    return `<a href="#${route}" class="nav-link${cur ? ' is-current' : ''}"${cur ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
  };
  $('#topbar').innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="#start" aria-label="BYU Study Spot Finder, go to Home">
        <span class="brand-mark" aria-hidden="true">${icon('pin')}</span>
        <span class="brand-name"><span class="brand-byu">BYU</span> Study Spot Finder</span>
      </a>
      <nav class="main-nav" aria-label="Main">
        ${link('map', 'Map', 'map')}${link('list', 'List', 'list')}${link('favorites', 'Favorites', 'star')}
      </nav>
      <div class="topbar-right">
        ${accountControl(pageKey)}
        <div class="menu-wrap">
          <button id="home-btn" class="bar-btn menu-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="home-menu" aria-label="Menu">${icon('menu')}</button>
          <div id="home-menu" class="menu" role="menu" aria-label="Menu" hidden>
            ${HOME_MENU.map((m) => menuItem({
              label: m.label, sub: m.sub, ic: m.icon, divider: m.divider,
              current: pageKey === m.key,
              attrs: `data-menu-route="${m.route}"${m.clear ? ' data-menu-clear' : ''}`,
            })).join('')}
          </div>
        </div>
      </div>
    </div>`;
}
/** Top-right account control: "Log in" when logged out, or your name with a Log out dropdown. */
function accountControl(pageKey) {
  // Still checking who is logged in: keep the space empty instead of flashing "Log in".
  if (Store.sharedStatus() === 'loading') return '';
  const me = Store.currentStudent();
  if (!me) {
    const cur = pageKey === 'account';
    return `<a href="#welcome" class="bar-btn login-btn${cur ? ' is-current' : ''}"${cur ? ' aria-current="page"' : ''}>${icon('user')}<span class="login-label">Log in</span></a>`;
  }
  return `<div class="menu-wrap">
      <button id="account-btn" class="bar-btn account-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu" title="${esc(me.display_name)}">${icon('user')}<span class="account-name">${esc(me.display_name)}</span>${icon('chevronDown', 'chev')}</button>
      <div id="account-menu" class="menu account-menu" role="menu" aria-label="Account" hidden>
        <div class="menu-head"><span class="menu-head-label">Logged in as</span><strong>${esc(me.display_name)}</strong><span>${esc(me.byu_net_id)}@byu.edu</span></div>
        ${menuItem({ label: 'Log out', sub: 'Your favorites stay saved', ic: 'logout', attrs: 'data-sign-out' })}
      </div>
    </div>`;
}
function accountMenuOpen() { const m = $('#account-menu'); return !!m && !m.hidden; }
function setAccountMenu(open) {
  const m = $('#account-menu'), b = $('#account-btn');
  if (!m) return;
  m.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
  b.classList.toggle('is-open', open);
  if (open) $('.menu-item', m).focus();
}
function homeMenuOpen() { const m = $('#home-menu'); return m && !m.hidden; }
function setHomeMenu(open) {
  const m = $('#home-menu'), b = $('#home-btn');
  if (!m) return;
  m.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
  b.classList.toggle('is-open', open);
  if (open) { const first = $('.menu-item.is-current', m) || $('.menu-item', m); first && first.focus(); }
}

/* ---------------- Page header (same on every page) ---------------- */
function pageHeader({ eyebrow = '', title, sub = '', back = '', display = false }) {
  return `<header class="page-hero">
    ${back}
    ${eyebrow ? `<p class="hero-eyebrow">${eyebrow}</p>` : ''}
    <h1${display ? ' class="display"' : ''}>${title}</h1>
    ${sub ? `<p class="hero-sub">${sub}</p>` : ''}
  </header>`;
}

/* ---------------- No results (List, Map, Floor view, Get Started) ---------------- */
function noResults(opts = {}) {
  return `<div class="empty no-results" role="status">
    <span class="empty-ic">${icon('search')}</span>
    <p class="empty-title">${opts.title || 'No spots match all of your filters'}</p>
    <p>Try a different combination, or let us pick a spot for you.</p>
    <div class="empty-actions">
      ${opts.noPanel ? '' : `<button type="button" class="btn btn-primary" data-open-filters>${icon('filter')}Change filters</button>`}
      <button type="button" class="btn btn-secondary" data-random-spot>${icon('shuffle')}Pick a random spot</button>
      <button type="button" class="link-btn" data-clear-filters>Clear all filters</button>
    </div>
  </div>`;
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
function spotBadge(s) {
  if (!s.isUserSpot) return '';
  const me = Store.currentStudent();
  if (s.submittedBy == null || (me && me.user_id === s.submittedBy)) return '<span class="badge-mine">My spot</span>';
  return `<span class="badge-mine">Added by ${esc(s.submittedByName || 'a teammate')}</span>`;
}
function spotCard(s, opts = {}) {
  const b = buildingById(s.building) || { short: s.building };
  const feats = FEATURES.filter((f) => s.features[f.key]);
  return `<article class="spot-card${opts.dim ? ' is-dim' : ''}${opts.flash ? ' is-flash' : ''}" data-open-spot="${s.id}" tabindex="0" aria-label="${esc(s.name)}, ${esc(b.short)} floor ${s.floor}">
    ${opts.num ? `<span class="spot-num" aria-hidden="true">${opts.num}</span>` : ''}
    <div class="spot-card-main">
      <div class="spot-card-title">
        <h3>${esc(s.name)}</h3>
        ${spotBadge(s)}
      </div>
      <p class="spot-meta">${esc(b.short)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}</p>
      <div class="spot-card-row">${groupBadge(s.groupSize)}${busyBadge(s.busyness)}</div>
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
/* Read-only chips for a set of filters */
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

/* Indoors / Outdoors: one choice instead of two separate checkboxes */
function settingPicker(current, attr, withAny = true) {
  return `<div class="seg" role="radiogroup" aria-label="Indoors or outdoors">
    ${SETTINGS.filter((x) => withAny || x.key).map((x) => `<button type="button" role="radio" aria-checked="${current === x.key}" class="seg-opt${current === x.key ? ' is-on' : ''}" ${attr}="${x.key}">${icon(x.icon)}${x.label}</button>`).join('')}
  </div>`;
}

function toolbar() {
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
/** Short message at the bottom. Optional action adds a link, e.g. { href: '#login', label: 'Log in' }. */
function toast(msg, action) {
  const t = $('#toast');
  t.textContent = msg;
  if (action && action.href) t.insertAdjacentHTML('beforeend', ` <a class="toast-action" href="${action.href}">${esc(action.label)}</a>`);
  t.hidden = false;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => { t.hidden = true; }, 250); }, (action && action.duration) || (action ? 5000 : 2600));
}

/* ---------------- Sheets (shared open/close) ---------------- */
function anySheetOpen() { return !$('#filter-panel').hidden || !$('#spot-dialog').hidden; }
/* While a sheet is open the page behind it is pinned in place (overflow:hidden alone
   doesn't stop phones from scrolling the page instead of the sheet), and it goes
   back to the same scroll position when the sheet closes. */
let lockedScrollY = null;
function syncBackdrop() {
  const open = anySheetOpen();
  $('#sheet-backdrop').hidden = !open;
  document.documentElement.classList.toggle('sheet-open', open);
  const body = document.body;
  if (open && lockedScrollY === null) {
    lockedScrollY = window.scrollY;
    body.style.top = `-${lockedScrollY}px`;
    body.classList.add('scroll-locked');
  } else if (!open && lockedScrollY !== null) {
    const y = lockedScrollY;
    lockedScrollY = null;
    body.classList.remove('scroll-locked');
    body.style.top = '';
    window.scrollTo(0, y);
  }
}

/* ---------------- Filter Panel (Component 8) ---------------- */
const FilterPanel = {
  draft: null,
  open() {
    this.draft = Store.getFilters();
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
        <section class="fp-section">
          <h3 class="fp-h">Group size</h3>
          ${groupSizePicker(d.groupSize, 'data-fp-group')}
        </section>
        <section class="fp-section">
          <h3 class="fp-h">Indoors or outdoors</h3>
          ${settingPicker(d.setting, 'data-fp-setting')}
        </section>
        <section class="fp-section">
          <h3 class="fp-h">Features</h3>
          <div class="check-grid">
            ${FILTER_FEATURES.map((f) => `<label class="check" for="fp-${f.key}">
              <input type="checkbox" id="fp-${f.key}" data-fp-feature="${f.key}" ${d.features[f.key] ? 'checked' : ''}>
              <span class="check-box">${icon('check')}</span>${icon(f.key, 'check-ic')}<span>${f.label}</span></label>`).join('')}
          </div>
        </section>
        <section class="fp-section">
          <label class="fp-h" for="fp-building">Building</label>
          <select id="fp-building" class="select" data-fp-building>
            <option value="">All buildings</option>
            ${BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => `<option value="${b.id}" ${d.building === b.id ? 'selected' : ''}>${esc(b.name)} (${b.short})</option>`).join('')}
          </select>
        </section>
      </div>
      <footer class="sheet-foot">
        <p class="fp-none" id="fp-none" role="status" hidden>No spots match all of these. Remove a filter, or <button type="button" class="link-btn" data-random-spot>pick a random spot</button>.</p>
        <div class="sheet-foot-row">
          <button type="button" class="btn btn-ghost" data-fp-reset>Reset</button>
          <button type="button" class="btn btn-primary" data-fp-apply id="fp-apply"></button>
        </div>
      </footer>`;
    this.updateCount();
  },
  updateCount() {
    const n = this.count();
    const b = $('#fp-apply');
    b.textContent = n ? `Show ${plural(n, 'spot')}` : 'No spots match';
    b.disabled = n === 0;
    $('#fp-none').hidden = n > 0;
  },
  handleClick(e) {
    const t = e.target.closest('button, input, select');
    if (!t) return;
    if (t.id === 'fp-close') return this.close();
    if (t.matches('[data-fp-group]')) { this.draft.groupSize = t.dataset.fpGroup; return this.render(); }
    if (t.matches('[data-fp-setting]')) { this.draft.setting = t.dataset.fpSetting; return this.render(); }
    if (t.matches('[data-fp-reset]')) { this.draft = Store.emptyFilters(); return this.render(); }
    if (t.matches('[data-fp-apply]')) {
      Store.setFilters(this.draft);
      this.close();
      App.refresh();
      toast(`Showing ${plural(Store.filtered().length, 'matching spot')}`);
    }
  },
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
          <p class="eyebrow eyebrow-gold">${esc(b.name)}</p>
          <h2 id="sd-title">${esc(s.name)}</h2>
          <p class="spot-meta">${esc(b.short)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}${s.isUserSpot ? ' ' + spotBadge(s) : ''}</p>
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
          <div class="sd-fact">
            <span class="fact-label">Setting</span>
            <span class="fact-value">${icon(s.features.outdoors ? 'outdoors' : 'indoors')}${s.features.outdoors ? 'Outdoors' : 'Indoors'}</span>
          </div>
        </div>
        <h3 class="sd-h">Features</h3>
        <ul class="feature-list">
          ${FILTER_FEATURES.map((f) => `<li class="${s.features[f.key] ? 'has' : 'not'}">
            <span class="yn" aria-hidden="true">${s.features[f.key] ? '✓' : '✗'}</span>${icon(f.key)}<span>${f.label}</span>
            <span class="sr-only">${s.features[f.key] ? 'yes' : 'no'}</span></li>`).join('')}
        </ul>
        ${Store.isOwnSpot(s) ? `<div class="sd-danger">
          ${this.confirming ? `
            <p><strong>Delete your spot?</strong> ${s.isLocalSpot ? 'It will be removed from this device.' : 'It will be removed for everyone.'}</p>
            <div class="sd-danger-row">
              <button type="button" class="btn btn-danger btn-sm" data-sd-delete-confirm>Delete spot</button>
              <button type="button" class="btn btn-ghost btn-sm" data-sd-delete-cancel>Cancel</button>
            </div>` : `<button type="button" class="btn btn-ghost btn-sm danger-text" data-sd-delete>${icon('trash')}Delete my spot</button>`}
        </div>` : ''}
      </div>`;
  },
};
