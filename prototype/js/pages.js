/* =========================================================================
   Pages. Each returns HTML for <main id="app">. Clicks are handled by the
   delegated listeners in app.js.
   ========================================================================= */

const Pages = {};

/* ---------------- Page 1: Get Started ---------------- */
const START_CHIPS = [
  { key: 'foodAllowed', label: 'Food allowed', icon: 'foodAllowed' },
  { key: 'talkingAllowed', label: 'Group work / Talking allowed', icon: 'talkingAllowed' },
  { key: 'quietZone', label: 'Quiet zone', icon: 'quietZone' },
  { key: 'outlets', label: 'Outlets', icon: 'outlets' },
  { key: 'tables', label: 'Tables', icon: 'tables' },
  { key: 'comfySeating', label: 'Comfy seating', icon: 'comfySeating' },
  { key: 'outdoors', label: 'Outdoors', icon: 'outdoors' },
  { key: 'indoors', label: 'Indoors', icon: 'indoors' },
];
const StartState = { selected: new Set() };

Pages.start = () => {
  const spots = Store.allSpots();
  const buildings = new Set(spots.map((s) => s.building)).size;
  const sel = StartState.selected;
  return `<section class="page start">
    <div class="start-intro">
      <p class="eyebrow">${plural(spots.length, 'study spot')} · ${plural(buildings, 'building')} · not just the library</p>
      <h1 class="display">What do you want in your study spot?</h1>
      <p class="sub">Select all that apply.</p>
    </div>
    <div class="start-chips" role="group" aria-label="What you want in a study spot">
      ${START_CHIPS.map((c) => `<button type="button" class="chip chip-toggle chip-lg${sel.has(c.key) ? ' is-on' : ''}" aria-pressed="${sel.has(c.key)}" data-start-chip="${c.key}">
        ${icon(c.icon)}<span>${c.label}</span><span class="chip-check">${icon('check')}</span></button>`).join('')}
    </div>
    <div class="start-actions">
      <button type="button" class="btn btn-primary btn-lg" id="go-btn" ${sel.size ? '' : 'disabled'}>Go${sel.size ? ` · ${plural(sel.size, 'filter')}` : ''}</button>
      <button type="button" class="btn btn-secondary btn-lg" id="random-btn">${icon('shuffle')}Find a new study spot!</button>
    </div>
    <p class="start-hint" id="go-hint">${sel.size ? 'Go shows only the spots that match everything you picked.' : 'Pick at least one option to continue.'}</p>
    <div class="start-links">
      <a href="#map" class="start-link">${icon('map')}<span><strong>Browse the campus map</strong><small>See spots building by building, floor by floor</small></span></a>
      <a href="#add" class="start-link">${icon('plus')}<span><strong>Know a hidden spot?</strong><small>Add it to your own list</small></span></a>
    </div>
  </section>`;
};

/* ---------------- Page 2: Campus Map ---------------- */
Pages.map = (spotId) => {
  const f = Store.getFilters();
  const active = Store.isActive(f);
  const all = Store.allSpots();
  const target = spotId ? Store.getSpot(spotId) : null;
  const counts = {};
  BUILDINGS.forEach((b) => {
    counts[b.id] = {
      total: all.filter((s) => s.building === b.id).length,
      match: all.filter((s) => s.building === b.id && Store.matches(s, f)).length,
    };
  });
  const buildingSvg = BUILDINGS.map((b) => {
    const m = b.map, c = counts[b.id];
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const state = [
      active && c.match ? 'is-match' : '', active && !c.match ? 'is-dim' : '',
      target && target.building === b.id ? 'is-target' : '',
    ].join(' ');
    const badgeText = plural(active ? c.match : c.total, 'spot');
    const showBadge = active ? c.match > 0 : false;
    const bw = 84;
    return `<g class="bldg ${state}" data-building="${b.id}" tabindex="0" role="button"
        aria-label="${esc(b.name)}: ${active ? `${c.match} of ${c.total} spots match` : plural(c.total, 'study spot')}. Open floor view.">
      <rect class="bldg-shadow" x="${m.x + 5}" y="${m.y + 7}" width="${m.w}" height="${m.h}" rx="14"/>
      <rect class="bldg-shape" x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="14"/>
      <text class="bldg-short" x="${cx}" y="${cy + 4}" text-anchor="middle">${b.short}</text>
      <text class="bldg-name" x="${cx}" y="${cy + 28}" text-anchor="middle">${esc(b.name)}</text>
      ${showBadge ? `<g class="bldg-badge"><rect x="${m.x + m.w - bw + 12}" y="${m.y - 14}" width="${bw}" height="28" rx="14"/><text x="${m.x + m.w - bw / 2 + 12}" y="${m.y + 5}" text-anchor="middle">${badgeText}</text></g>` : ''}
    </g>`;
  }).join('');

  let popup = '';
  if (target) {
    const b = buildingById(target.building), m = b.map;
    const left = Math.min(80, Math.max(20, ((m.x + m.w / 2) / 800) * 100));
    const top = Math.max(4, (m.y / 460) * 100);
    popup = `<div class="map-popup" style="left:${left}%;top:${top}%" role="dialog" aria-label="Selected spot">
      <button type="button" class="icon-btn icon-btn-sm map-popup-close" data-close-popup aria-label="Close">${icon('x')}</button>
      <p class="eyebrow">${b.short} · Floor ${target.floor}</p>
      <strong>${esc(target.name)}</strong>
      <button type="button" class="btn btn-primary btn-sm" data-open-spot="${target.id}">View details</button>
    </div>`;
  }

  return `<section class="page">
    <div class="page-head">
      <div><h1>Campus map</h1>
      <p class="sub">${active ? 'Highlighted buildings have spots that match your filters.' : 'Tap a building to see its floors and study spots.'}</p></div>
    </div>
    ${toolbar()}
    <div class="map-wrap">
      <svg class="campus-map" viewBox="0 0 800 460" role="group" aria-label="Map of BYU campus buildings with study spots">
        <rect class="map-ground" x="0" y="0" width="800" height="460" rx="18"/>
        <path class="map-grass" d="M250 175h300v20H250zM20 180h240v15H20zM520 175h260v20H520z"/>
        <rect class="map-grass" x="255" y="15" width="40" height="150" rx="10"/>
        <rect class="map-grass" x="500" y="15" width="45" height="150" rx="10"/>
        <path class="map-walk" d="M20 185H780M270 20V440M540 20V440M20 400H780"/>
        <rect class="map-plaza" x="508" y="225" width="62" height="140" rx="10"/>
        <text class="map-label" transform="translate(544 295) rotate(-90)" text-anchor="middle">Brigham Square</text>
        <text class="map-label" x="400" y="428" text-anchor="middle">Campus Drive</text>
        <g class="map-compass" transform="translate(760 420)"><circle r="16"/><path d="M0 -10 5 5 0 2-5 5z"/><text y="-20" text-anchor="middle">N</text></g>
        ${buildingSvg}
      </svg>
      ${popup}
    </div>
    <p class="map-legend">${active ? '<span class="legend-dot legend-match"></span>Has matching spots <span class="legend-dot legend-dim"></span>No matches' : 'Simplified map. Buildings are not to scale.'}</p>
    <h2 class="section-h">Buildings</h2>
    <div class="building-grid">
      ${BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => {
        const c = counts[b.id];
        return `<a class="building-card${active && !c.match ? ' is-dim' : ''}${target && target.building === b.id ? ' is-target' : ''}" href="#building-${b.id}">
          <span class="building-short">${b.short}</span>
          <span class="building-card-text"><strong>${esc(b.name)}</strong><small>${active ? `${c.match} of ${plural(c.total, 'spot')} match` : plural(c.total, 'study spot')}</small></span>
        </a>`;
      }).join('')}
    </div>
  </section>`;
};

/* ---------------- Page 3: Building Floor View ---------------- */
Pages.building = (buildingId, floorArg) => {
  const b = buildingById(buildingId);
  if (!b) return Pages.notFound();
  const f = Store.getFilters();
  const active = Store.isActive(f);
  const spots = Store.allSpots().filter((s) => s.building === b.id);
  const floors = Array.from(new Set(spots.map((s) => s.floor))).sort((a, b) => a - b);
  if (!floors.length) {
    return `<section class="page"><a href="#map" class="back-link">${icon('back')}Back to map</a><h1>${esc(b.name)}</h1>
      <div class="empty"><p>There are no study spots in this building yet.</p><a class="btn btn-primary" href="#add">${icon('plus')}Add a spot</a></div></section>`;
  }
  let floor = Number(floorArg);
  if (!floors.includes(floor)) {
    // Default to the first floor with a match, else the lowest floor.
    floor = (active && floors.find((fl) => spots.some((s) => s.floor === fl && Store.matches(s, f)))) || floors[0];
  }
  const onFloor = spots.filter((s) => s.floor === floor).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const items = onFloor.map((s, i) => ({ spot: s, num: i + 1, match: !active || Store.matches(s, f) }));
  const matchCount = items.filter((i) => i.match).length;
  return `<section class="page">
    <a href="#map" class="back-link">${icon('back')}Back to map</a>
    <div class="page-head">
      <div><p class="eyebrow">${b.short}</p><h1>${esc(b.name)}</h1>
      <p class="sub">${plural(spots.length, 'study spot')} on ${plural(floors.length, 'floor')}</p></div>
    </div>
    ${toolbar()}
    <div class="floor-tabs" role="tablist" aria-label="Floors">
      ${floors.map((fl) => {
        const m = spots.filter((s) => s.floor === fl && (!active || Store.matches(s, f))).length;
        return `<a role="tab" aria-selected="${fl === floor}" class="floor-tab${fl === floor ? ' is-on' : ''}${active && !m ? ' is-dim' : ''}" href="#building-${b.id}-f${fl}">
          <span>Floor ${fl}</span><small>${active ? `${m} match` : plural(spots.filter((s) => s.floor === fl).length, 'spot')}</small></a>`;
      }).join('')}
    </div>
    <div class="floorplan-card">
      ${floorPlanSvg(b.id, floor, items)}
      <p class="map-legend">${active
        ? `<span class="legend-dot legend-match"></span>Glowing = matches your filters (${matchCount}) <span class="legend-dot legend-dim"></span>Gray = doesn't match`
        : '<span class="legend-dot legend-match"></span>Tap a glowing marker to see the spot'}</p>
    </div>
    <h2 class="section-h">Spots on floor ${floor}</h2>
    <div class="spot-list">${items.map((i) => spotCard(i.spot, { num: i.num, dim: !i.match })).join('')}</div>
  </section>`;
};

/* ---------------- Page 7: Study Spot List ---------------- */
const SORTS = [
  { key: 'building', label: 'Building' },
  { key: 'busy', label: 'Least busy' },
  { key: 'az', label: 'A–Z' },
];
Pages.list = () => {
  const all = Store.allSpots();
  const spots = Store.filtered();
  const sort = Store.pref('sort', 'building');
  const flash = App.flashId;
  App.flashId = null;
  let body;
  if (!spots.length) {
    body = `<div class="empty">
      <p class="empty-title">No spots match your filters</p>
      <p>Try removing a filter or two.</p>
      <button type="button" class="btn btn-primary" data-clear-filters>Clear filters</button></div>`;
  } else if (sort === 'building') {
    const groups = BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ b, list: spots.filter((s) => s.building === b.id).sort((x, y) => x.floor - y.floor || x.name.localeCompare(y.name)) }))
      .filter((g) => g.list.length);
    body = groups.map((g) => `<section class="list-group">
      <h2 class="group-h"><a href="#building-${g.b.id}">${esc(g.b.name)}</a><span>${g.b.short} · ${plural(g.list.length, 'spot')}</span></h2>
      <div class="spot-list">${g.list.map((s) => spotCard(s, { flash: s.id === flash })).join('')}</div></section>`).join('');
  } else {
    const sorted = spots.slice().sort(sort === 'busy'
      ? (a, b) => BUSYNESS.indexOf(a.busyness) - BUSYNESS.indexOf(b.busyness) || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
    body = `<div class="spot-list">${sorted.map((s) => spotCard(s, { flash: s.id === flash })).join('')}</div>`;
  }
  const hidden = Store.deletedIds().length;
  return `<section class="page">
    <div class="page-head">
      <div><h1>Study spots</h1>
      <p class="sub" aria-live="polite">${spots.length === all.length ? `All ${plural(all.length, 'spot')}` : `${spots.length} of ${plural(all.length, 'spot')} match`}</p></div>
      <div class="sort">
        <label for="sort-select">${icon('sort')}Sort by</label>
        <select id="sort-select" class="select select-sm">${SORTS.map((s) => `<option value="${s.key}" ${sort === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      </div>
    </div>
    ${toolbar()}
    ${body}
    <div class="list-foot">
      <a class="btn btn-secondary" href="#add">${icon('plus')}Add a spot</a>
      ${hidden ? `<button type="button" class="link-btn" data-restore-spots>Restore ${plural(hidden, 'deleted sample spot')}</button>` : ''}
    </div>
  </section>`;
};

/* ---------------- Page 9: Favorites & Saved Filters ---------------- */
const FavState = { renaming: null };
Pages.favorites = (tab) => {
  tab = tab === 'filters' ? 'filters' : 'spots';
  const favs = Store.favorites().map((id) => Store.getSpot(id)).filter(Boolean);
  const saved = Store.savedFilters();
  const hist = Store.history();
  const fmt = (t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const filterItem = (item, kind) => {
    const renaming = FavState.renaming === item.id;
    const name = item.name || (kind === 'history' ? 'Unnamed search' : 'Untitled');
    return `<li class="saved-item">
      <div class="saved-top">
        ${renaming ? `<div class="inline-form">
            <label class="sr-only" for="rename-${item.id}">New name</label>
            <input id="rename-${item.id}" class="input" type="text" maxlength="40" value="${esc(item.name)}" placeholder="e.g., Quiet + outlets">
            <button type="button" class="btn btn-primary btn-sm" data-rename-save="${item.id}" data-kind="${kind}">Save</button>
            <button type="button" class="btn btn-ghost btn-sm" data-rename-cancel>Cancel</button></div>`
          : `<div><h3 class="saved-name${item.name ? '' : ' is-unnamed'}">${esc(name)}</h3>${kind === 'history' ? `<p class="saved-time">Used ${fmt(item.usedAt)}</p>` : ''}</div>`}
      </div>
      ${filterChips(item.filters)}
      <div class="saved-actions">
        <button type="button" class="btn btn-primary btn-sm" data-apply-set="${item.id}" data-kind="${kind}">Apply</button>
        <button type="button" class="btn btn-ghost btn-sm" data-rename="${item.id}">Rename</button>
        <button type="button" class="btn btn-ghost btn-sm danger-text" data-delete-set="${item.id}" data-kind="${kind}">Delete</button>
      </div>
    </li>`;
  };

  const spotsPanel = favs.length
    ? `<ul class="fav-list">${favs.map((s) => {
        const b = buildingById(s.building);
        return `<li class="fav-item">
          <span class="fav-star" aria-hidden="true">${icon('star')}</span>
          <div class="fav-text">
            <button type="button" class="fav-name" data-open-spot="${s.id}">${esc(s.name)}</button>
            ${s.isUserSpot ? '<span class="badge-mine">My spot</span>' : ''}
            <p class="spot-meta">${esc(b.name)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}</p>
          </div>
          <div class="fav-actions">
            <a class="btn btn-secondary btn-sm" href="#map-spot-${s.id}">${icon('map')}View on map</a>
            <button type="button" class="btn btn-ghost btn-sm" data-unfav="${s.id}">Remove</button>
          </div></li>`;
      }).join('')}</ul>`
    : `<div class="empty"><p class="empty-title">No favorites yet</p><p>Tap the ★ on any spot to save it here.</p><a class="btn btn-primary" href="#list">Browse study spots</a></div>`;

  const filtersPanel = `
    <h2 class="section-h">Your saved filters</h2>
    ${saved.length ? `<ul class="saved-list">${saved.map((i) => filterItem(i, 'saved')).join('')}</ul>`
      : `<div class="empty empty-sm"><p>No saved filters yet. Open <strong>Filters</strong> on the Map or List and choose “Save these filters”.</p></div>`}
    <h2 class="section-h">Recent <span class="section-sub">Last 5 filter combinations you used</span></h2>
    ${hist.length ? `<ul class="saved-list">${hist.map((i) => filterItem(i, 'history')).join('')}</ul>`
      : `<div class="empty empty-sm"><p>Filters you use with <strong>Go</strong> or <strong>Apply</strong> will show up here.</p></div>`}`;

  return `<section class="page">
    <div class="page-head"><div><h1>Favorites</h1><p class="sub">${favoritesNote()}</p></div></div>
    <div class="tabs" role="tablist" aria-label="Favorites sections">
      <a role="tab" class="tab${tab === 'spots' ? ' is-on' : ''}" aria-selected="${tab === 'spots'}" href="#favorites">${icon('star')}Favorite spots<span class="count-pill">${favs.length}</span></a>
      <a role="tab" class="tab${tab === 'filters' ? ' is-on' : ''}" aria-selected="${tab === 'filters'}" href="#favorites-filters">${icon('filter')}Saved filters<span class="count-pill">${saved.length}</span></a>
    </div>
    <div class="tab-panel" role="tabpanel">${tab === 'spots' ? spotsPanel : filtersPanel}</div>
  </section>`;
};

function favoritesNote() {
  const status = Store.sharedStatus();
  const me = Store.currentStudent();
  if (status === 'ok' && me) return `Favorite spots for <strong>${esc(me.display_name)}</strong>, shared with your team. Saved filters stay on this device.`;
  if (status === 'loading') return 'Loading shared favorites…';
  if (status === 'error') return 'Could not reach the database, so favorites are saved on this device for now.';
  return 'Saved on this device.';
}

/* ---------------- Page 10: Add a Spot ---------------- */
const AddState = {
  reset() {
    Object.assign(this, { name: '', building: '', floor: null, pin: null, groupSize: 'solo', tags: {}, description: '', errors: {}, submitted: false });
  },
};
AddState.reset();

Pages.add = () => {
  const s = AddState, e = s.errors;
  const b = buildingById(s.building);
  const existing = b && s.floor ? Store.allSpots().filter((x) => x.building === b.id && x.floor === s.floor) : [];
  return `<section class="page page-narrow">
    <div class="page-head"><div><h1>Add a spot</h1><p class="sub">Your spot is saved only on this device and is visible only to you.</p></div></div>
    <form id="add-form" class="form" novalidate>
      <div class="field">
        <label for="add-name" class="label">Spot name <span class="req">Required</span></label>
        <input id="add-name" class="input${e.name ? ' has-error' : ''}" type="text" maxlength="60" value="${esc(s.name)}" placeholder="e.g., Couches by the 2nd-floor elevator" aria-describedby="add-name-err" ${e.name ? 'aria-invalid="true"' : ''}>
        <p class="field-error" id="add-name-err" ${e.name ? '' : 'hidden'}>${esc(e.name || '')}</p>
      </div>

      <fieldset class="field">
        <legend class="label">Location <span class="req">Required</span></legend>
        <div class="loc-row">
          <div class="loc-col">
            <label for="add-building" class="label-sm">Building</label>
            <select id="add-building" class="select${e.building ? ' has-error' : ''}">
              <option value="">Choose a building</option>
              ${BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.id}" ${s.building === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
          </div>
          ${b ? `<div class="loc-col"><span class="label-sm" id="floor-lbl">Floor</span>
            <div class="floor-pick" role="radiogroup" aria-labelledby="floor-lbl">
              ${b.floors.map((fl) => `<button type="button" role="radio" aria-checked="${s.floor === fl}" class="floor-pick-btn${s.floor === fl ? ' is-on' : ''}" data-add-floor="${fl}">${fl}</button>`).join('')}
            </div></div>` : ''}
        </div>
        ${b && s.floor ? `<div class="pin-area">
            <p class="pin-help">${s.pin ? `${icon('check')}Pin placed. Click again to move it.` : `${icon('pin')}Click the floor plan to place a pin where your spot is.`}</p>
            <div id="add-plan" class="add-plan">${floorPlanSvg(b.id, s.floor, existing.map((x, i) => ({ spot: x, num: i + 1, match: false })), { pin: s.pin, interactive: true })}</div>
            ${existing.length ? '<p class="fact-note">Gray markers are spots already on this floor.</p>' : ''}
          </div>` : `<div class="pin-placeholder">${icon('layers')}<span>${b ? 'Choose a floor to see its floor plan.' : 'Choose a building and floor to see the floor plan.'}</span></div>`}
        <p class="field-error" id="add-loc-err" ${e.location ? '' : 'hidden'}>${esc(e.location || '')}</p>
      </fieldset>

      <div class="field">
        <span class="label">Group size</span>
        ${groupSizePicker(s.groupSize, 'data-add-group', false)}
      </div>

      <div class="field">
        <span class="label">Tags</span>
        <div class="chip-wrap" role="group" aria-label="Tags">
          ${FEATURES.map((f) => `<button type="button" class="chip chip-toggle${s.tags[f.key] ? ' is-on' : ''}" aria-pressed="${!!s.tags[f.key]}" data-add-tag="${f.key}">${icon(f.key)}${f.label}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <label for="add-desc" class="label">Short description <span class="opt">Optional</span></label>
        <textarea id="add-desc" class="input textarea" maxlength="240" rows="3" placeholder="What makes this spot good? When is it quiet?">${esc(s.description)}</textarea>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg">${icon('plus')}Add spot</button>
        <button type="button" class="btn btn-ghost btn-lg" data-add-cancel>Cancel</button>
      </div>
    </form>
  </section>`;
};

Pages.notFound = () => `<section class="page"><div class="empty"><p class="empty-title">That page doesn't exist</p><a class="btn btn-primary" href="#start">Go to Get Started</a></div></section>`;
