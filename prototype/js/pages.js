/* =========================================================================
   Pages. Each returns HTML for <main id="app">. Clicks are handled by the
   delegated listeners in app.js. Every page starts with pageHeader() so the
   header looks the same everywhere.
   ========================================================================= */

const Pages = {};

/* ---------------- Page 1: Get Started ---------------- */
// Same options as the Filter Panel: every feature, plus Indoors / Outdoors (pick one).
const START_CHIPS = FILTER_FEATURES.map((f) => ({ key: f.key, label: f.label, icon: f.key }))
  .concat(SETTINGS.filter((x) => x.key).map((x) => ({ key: x.key, label: x.label, icon: x.icon })));
const StartState = { selected: new Set() };

/** The filters the Get Started picks add up to. */
function startFilters() {
  const f = Store.emptyFilters();
  StartState.selected.forEach((k) => {
    if (k === 'indoors' || k === 'outdoors') f.setting = k;
    else f.features[k] = true;
  });
  return f;
}

Pages.start = () => {
  const spots = Store.allSpots();
  const sel = StartState.selected;
  const matches = Store.filtered(startFilters()).length;
  const showLabel = sel.size ? `Show ${plural(matches, 'matching spot')}` : `Browse all ${plural(spots.length, 'spot')}`;
  return `<section class="page start">
    ${pageHeader({
      eyebrow: `${plural(spots.length, 'study spot')} · ${plural(BUILDINGS.length, 'building')} · not just the library`,
      title: 'What do you want in your study spot?',
      sub: 'Pick everything that matters to you. We’ll show the spots that have it all.',
      display: true,
    })}
    <div class="start-chips" role="group" aria-label="What you want in a study spot">
      ${START_CHIPS.map((c) => `<button type="button" class="chip chip-toggle chip-lg${sel.has(c.key) ? ' is-on' : ''}" aria-pressed="${sel.has(c.key)}" data-start-chip="${c.key}">
        ${icon(c.icon)}<span>${c.label}</span><span class="chip-check">${icon('check')}</span></button>`).join('')}
    </div>
    ${sel.size && !matches ? noResults({ noPanel: true, title: 'No spots have all of these yet' }) : `
    <div class="start-actions">
      <div class="start-action">
        <button type="button" class="btn btn-primary btn-lg btn-block" id="go-btn">${icon('search')}${showLabel}</button>
        <p class="start-hint">${sel.size ? `Shows spots that have all ${plural(sel.size, 'thing')} you picked.` : 'Or pick what you need above first.'}</p>
      </div>
      <span class="start-or" aria-hidden="true">or</span>
      <div class="start-action">
        <button type="button" class="btn btn-secondary btn-lg btn-block" id="random-btn">${icon('shuffle')}Pick a random spot</button>
        <p class="start-hint">${sel.size ? 'We’ll choose one that matches your picks.' : 'Can’t decide? We’ll choose one for you.'}</p>
      </div>
    </div>`}
    <div class="start-links">
      <a href="#map" class="start-link">${icon('map')}<span><strong>Browse the campus map</strong><small>See spots building by building, floor by floor</small></span></a>
      <a href="#add" class="start-link">${icon('plus')}<span><strong>Know a hidden spot?</strong><small>Add it so other students can find it</small></span></a>
    </div>
  </section>`;
};

/* ---------------- Page 2: Campus Map ---------------- */
// Exterior footprints and background share one reference-based SVG coordinate system.
function mapBox(b) {
  const footprint = CAMPUS_FOOTPRINTS[b.id];
  return { ...footprint, cx: footprint.label[0], cy: footprint.label[1] };
}

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
  const anyMatch = BUILDINGS.some((b) => counts[b.id].match);
  // Draw the selected building last so its outline sits on top.
  const order = BUILDINGS.slice().sort((a, b) => (target && a.id === target.building) - (target && b.id === target.building));
  const buildingSvg = order.map((b) => {
    const m = mapBox(b), c = counts[b.id];
    const state = [
      !c.total ? 'is-empty' : '',
      active && c.match ? 'is-match' : '', active && !c.match ? 'is-dim' : '',
      target && target.building === b.id ? 'is-target' : '',
    ].join(' ');
    const n = active ? c.match : c.total;
    const fs = m.font || 14;
    return `<g class="bldg ${state}" data-building="${b.id}" tabindex="0" role="button"
        aria-label="${esc(b.name)}: ${active ? `${c.match} of ${c.total} spots match` : plural(c.total, 'study spot')}. Open floor view.">
      <title>${esc(b.name)}</title>
      <path class="bldg-shadow" d="${m.d}" fill-rule="evenodd" transform="translate(2 3)"/>
      <path class="bldg-shape" d="${m.d}" fill-rule="evenodd"/>
      <text class="bldg-short" x="${m.cx}" y="${m.cy + fs * 0.35}" text-anchor="middle" style="font-size:${fs}px">${b.short}</text>
      ${n > 0 ? `<g class="bldg-badge"><circle cx="${m.badge[0]}" cy="${m.badge[1]}" r="11"/><text x="${m.badge[0]}" y="${m.badge[1] + 4}" text-anchor="middle">${n}</text></g>` : ''}
      ${target && target.building === b.id ? `<g class="map-pin" transform="translate(${m.badge[0] - 16} ${m.badge[1] - 8})"><path d="M0 0c-7-8-11-13-11-18a11 11 0 0 1 22 0c0 5-4 10-11 18z"/><circle cy="-18" r="4"/></g>` : ''}
    </g>`;
  }).join('');

  let selected = '';
  if (target) {
    const b = buildingById(target.building);
    selected = `<div class="map-selected" id="map-selected" aria-live="polite">
      <div class="map-selected-head">
        <p class="eyebrow eyebrow-gold">${icon('pin')}Selected spot · ${esc(b.name)}</p>
        <button type="button" class="link-btn" data-close-popup>Clear</button>
      </div>
      ${spotCard(target)}
      <div class="map-selected-actions">
        <button type="button" class="btn btn-primary btn-sm" data-open-spot="${target.id}">View details</button>
        <a class="btn btn-secondary btn-sm" href="#building-${target.building}-f${target.floor}">${icon('layers')}Floor ${target.floor} plan</a>
      </div>
    </div>`;
  }

  return `<section class="page">
    ${pageHeader({
      eyebrow: `${plural(BUILDINGS.length, 'building')} · ${plural(all.length, 'spot')}`,
      title: 'Campus map',
      sub: active ? 'Gold buildings have spots that match your filters. Tap one to see its floors.' : 'Tap a building to see its floors and study spots. Numbers show how many spots each has.',
    })}
    ${toolbar()}
    ${active && !anyMatch ? noResults() : ''}
    ${selected}
    <div class="campus-map-heading"><span>${icon('pin')}BYU · Provo, Utah</span><span>North up · Campus overview</span></div>
    <div class="map-wrap" tabindex="0" role="region" aria-label="Scrollable campus map" aria-describedby="campus-map-help">
      <svg class="campus-map" viewBox="0 0 ${CAMPUS.w} ${CAMPUS.h}" role="group" aria-label="Map of BYU campus buildings with study spots">
        <rect class="map-ground" x="0" y="0" width="${CAMPUS.w}" height="${CAMPUS.h}" rx="18"/>
        ${campusBackdrop()}
        <g class="map-compass" transform="translate(${CAMPUS.w - 34} ${CAMPUS.h - 34})"><circle r="16"/><path d="M0 -10 5 5 0 2-5 5z"/><text y="-21" text-anchor="middle">N</text></g>
        ${buildingSvg}
      </svg>
    </div>
    <p class="map-legend" id="campus-map-help">${active
      ? '<span class="legend-dot legend-match"></span>Has matching spots <span class="legend-dot legend-dim"></span>No matches'
      : '<span class="legend-dot legend-has"></span>Has study spots <span class="legend-dot legend-dim"></span>No spots yet'}
      <span class="legend-note">Reference-based campus overview; building outlines and paths are approximate. Muted landmarks are shown for orientation.<span class="map-pan-hint"> Swipe the map to see more.</span></span></p>
    <h2 class="section-h">All buildings</h2>
    <div class="building-grid">
      ${BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((b) => {
        const c = counts[b.id];
        const text = !c.total ? 'No spots yet · add one' : active ? `${c.match} of ${plural(c.total, 'spot')} match` : plural(c.total, 'study spot');
        return `<a class="building-card${active && !c.match ? ' is-dim' : ''}${!c.total ? ' is-empty' : ''}${target && target.building === b.id ? ' is-target' : ''}" href="#building-${b.id}">
          <span class="building-short">${b.short}</span>
          <span class="building-card-text"><strong>${esc(b.name)}</strong><small>${text}</small></span>
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
    return `<section class="page">
      ${pageHeader({ back: `<a href="#map" class="back-link">${icon('back')}Back to map</a>`, eyebrow: b.short, title: esc(b.name), sub: 'No study spots here yet.' })}
      <div class="empty"><span class="empty-ic">${icon('plus')}</span><p class="empty-title">Know a good spot in the ${esc(b.short)}?</p><p>Add it so other students can find it.</p><div class="empty-actions"><a class="btn btn-primary" href="#add-${b.id}">${icon('plus')}Add a spot here</a></div></div></section>`;
  }
  let floor = Number(floorArg);
  if (!floors.includes(floor)) {
    // Default to the first floor with a match, else the lowest floor.
    floor = (active && floors.find((fl) => spots.some((s) => s.floor === fl && Store.matches(s, f)))) || floors[0];
  }
  const onFloor = spots.filter((s) => s.floor === floor).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const items = onFloor.map((s, i) => ({ spot: s, num: i + 1, match: !active || Store.matches(s, f) }));
  const matchCount = items.filter((i) => i.match).length;
  const anyMatch = !active || spots.some((s) => Store.matches(s, f));
  return `<section class="page">
    ${pageHeader({ back: `<a href="#map" class="back-link">${icon('back')}Back to map</a>`, eyebrow: b.short, title: esc(b.name), sub: `${plural(spots.length, 'study spot')} on ${plural(floors.length, 'floor')}` })}
    ${toolbar()}
    ${anyMatch ? '' : noResults({ title: `No spots in the ${esc(b.short)} match your filters` })}
    <div class="floor-tabs" role="tablist" aria-label="Floors">
      ${floors.map((fl) => {
        const m = spots.filter((s) => s.floor === fl && (!active || Store.matches(s, f))).length;
        return `<a role="tab" aria-selected="${fl === floor}" class="floor-tab${fl === floor ? ' is-on' : ''}${active && !m ? ' is-dim' : ''}" href="#building-${b.id}-f${fl}">
          <span>Floor ${fl}</span><small>${active ? `${m} match` : plural(spots.filter((s) => s.floor === fl).length, 'spot')}</small></a>`;
      }).join('')}
    </div>
    <div class="floorplan-card">
      <p class="fact-note">Approximate building outline, shared across floors. Interior layouts are not shown.</p>
      ${floorPlanSvg(b.id, floor, items)}
      <p class="map-legend" id="campus-map-help">${active
        ? `<span class="legend-dot legend-match"></span>Glowing = matches your filters (${matchCount}) <span class="legend-dot legend-dim"></span>Gray = doesn't match`
        : '<span class="legend-dot legend-match"></span>Tap a glowing marker to see the spot'}</p>
    </div>
    <h2 class="section-h">Spots on floor ${floor}</h2>
    <div class="spot-list">${items.map((i) => spotCard(i.spot, { num: i.num, dim: !i.match })).join('')}</div>
  </section>`;
};

/* ---------------- Page 7: Study Spot List ---------------- */
// A–Z was dropped: spot names aren't something people search by, and the
// Building grouping already keeps the list easy to scan.
const SORTS = [
  { key: 'building', label: 'Building' },
  { key: 'busy', label: 'Least busy first' },
];
Pages.list = () => {
  const all = Store.allSpots();
  const spots = Store.filtered();
  const sort = SORTS.some((x) => x.key === Store.pref('sort')) ? Store.pref('sort') : 'building';
  const flash = App.flashId;
  App.flashId = null;
  let body;
  if (!spots.length) {
    body = noResults();
  } else if (sort === 'building') {
    const groups = BUILDINGS.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((b) => ({ b, list: spots.filter((s) => s.building === b.id).sort((x, y) => x.floor - y.floor || x.name.localeCompare(y.name)) }))
      .filter((g) => g.list.length);
    body = groups.map((g) => `<section class="list-group">
      <h2 class="group-h"><span class="group-h-code">${g.b.short}</span><a href="#building-${g.b.id}">${esc(g.b.name)}</a><span class="group-h-count">${plural(g.list.length, 'spot')}</span></h2>
      <div class="spot-list">${g.list.map((s) => spotCard(s, { flash: s.id === flash })).join('')}</div></section>`).join('');
  } else {
    const sorted = spots.slice().sort((a, b) => BUSYNESS.indexOf(a.busyness) - BUSYNESS.indexOf(b.busyness) || a.name.localeCompare(b.name));
    body = `<div class="spot-list">${sorted.map((s) => spotCard(s, { flash: s.id === flash })).join('')}</div>`;
  }
  return `<section class="page">
    ${pageHeader({ eyebrow: `${plural(BUILDINGS.length, 'building')} · ${plural(all.length, 'spot')}`, title: 'Study spots', sub: 'Every spot on campus. Narrow it down by group size or filters.' })}
    ${toolbar()}
    <div class="results-bar">
      <p class="results-count" aria-live="polite">${spots.length === all.length ? `Showing all <strong>${plural(all.length, 'spot')}</strong>` : `<strong>${spots.length}</strong> of ${plural(all.length, 'spot')} match`}</p>
      ${spots.length ? `<div class="sort">
        <label for="sort-select">${icon('sort')}Sort by</label>
        <select id="sort-select" class="select select-sm">${SORTS.map((s) => `<option value="${s.key}" ${sort === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      </div>` : ''}
    </div>
    ${body}
    <div class="list-foot">
      <p>Know a spot that isn’t here?</p>
      <a class="btn btn-secondary" href="#add">${icon('plus')}Add a spot</a>
    </div>
  </section>`;
};

/* ---------------- Page 9: Favorites ---------------- */
Pages.favorites = () => {
  const favs = Store.favorites().map((id) => Store.getSpot(id)).filter(Boolean);

  const spotsPanel = favs.length
    ? `<ul class="fav-list">${favs.map((s) => {
        const b = buildingById(s.building);
        return `<li class="fav-item">
          <span class="fav-star" aria-hidden="true">${icon('star')}</span>
          <div class="fav-text">
            <button type="button" class="fav-name" data-open-spot="${s.id}">${esc(s.name)}</button>
            ${spotBadge(s)}
            <p class="spot-meta">${esc(b.name)} · Floor ${s.floor}${s.room ? ' · ' + esc(s.room) : ''}</p>
          </div>
          <div class="fav-actions">
            <a class="btn btn-secondary btn-sm" href="#map-spot-${s.id}">${icon('map')}View on map</a>
            <button type="button" class="btn btn-ghost btn-sm" data-unfav="${s.id}">Remove</button>
          </div></li>`;
      }).join('')}</ul>`
    : `<div class="empty"><span class="empty-ic">${icon('star')}</span><p class="empty-title">No favorites yet</p><p>Tap the ☆ on any spot to save it here.</p><div class="empty-actions"><a class="btn btn-primary" href="#list">Browse study spots</a></div></div>`;

  return `<section class="page">
    ${pageHeader({ eyebrow: favs.length ? plural(favs.length, 'saved spot') : 'Your list', title: 'Favorites', sub: 'Your go-to study spots, all in one place.' })}
    ${notice(favoritesNote())}
    ${spotsPanel}
  </section>`;
};

/** Small status box under the page header (account / database state). */
function notice(html) {
  return html ? `<p class="notice">${icon('user')}<span>${html}</span></p>` : '';
}

function favoritesNote() {
  const status = Store.sharedStatus();
  const me = Store.currentStudent();
  if (status === 'ok' && me) return `Saved to <strong>${esc(me.display_name)}</strong>’s account.`;
  if (status === 'ok') return '<a href="#login">Log in</a> to save favorite spots to your account.';
  if (status === 'loading') return 'Loading your favorites…';
  if (status === 'error') return 'Could not reach the database, so favorites are saved on this device for now.';
  return 'Saved on this device.';
}

/* ---------------- Page 10: Add a Spot ---------------- */
function addSpotNote() {
  const me = Store.currentStudent();
  if (Store.sharedStatus() === 'ok' && me) return `Adding as <strong>${esc(me.display_name)}</strong>. Your spot will be visible to everyone.`;
  if (Store.needsLogin()) return '<a href="#login">Log in</a> to add a spot. It will be visible to everyone.';
  if (Store.sharedStatus() === 'loading') return 'Connecting to the database…';
  if (Store.sharedStatus() === 'error') return 'Could not reach the database, so your spot is saved only on this device.';
  return 'Your spot is saved only on this device.';
}
const AddState = {
  reset() {
    Object.assign(this, { name: '', building: '', floor: null, pin: null, groupSize: 'solo', busyness: 'Moderate', setting: 'indoors', tags: {}, description: '', errors: {}, submitted: false, saving: false });
  },
};
AddState.reset();

Pages.add = () => {
  const s = AddState, e = s.errors;
  const b = buildingById(s.building);
  const existing = b && s.floor ? Store.allSpots().filter((x) => x.building === b.id && x.floor === s.floor) : [];
  return `<section class="page page-narrow">
    ${pageHeader({ eyebrow: 'Share a spot', title: 'Add a spot', sub: 'Know a great place to study? Add it so other students can find it.' })}
    ${notice(addSpotNote())}
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
            <p class="pin-help">${s.pin ? `${icon('check')}Pin placed. Click again to move it.` : `${icon('pin')}Click inside the building outline to place your pin.`}</p>
            <p class="fact-note">Approximate building outline, shared across floors. Place pins inside the outline; courtyards are excluded.</p><div id="add-plan" class="add-plan">${floorPlanSvg(b.id, s.floor, existing.map((x, i) => ({ spot: x, num: i + 1, match: false })), { pin: s.pin, interactive: true })}</div>
            ${existing.length ? '<p class="fact-note">Gray markers are spots already on this floor.</p>' : ''}
          </div>` : `<div class="pin-placeholder">${icon('layers')}<span>${b ? 'Choose a floor to see its floor plan.' : 'Choose a building and floor to see the floor plan.'}</span></div>`}
        <p class="field-error" id="add-loc-err" ${e.location ? '' : 'hidden'}>${esc(e.location || '')}</p>
      </fieldset>

      <div class="field">
        <span class="label">Group size</span>
        ${groupSizePicker(s.groupSize, 'data-add-group', false)}
      </div>

      <div class="field">
        <span class="label">How busy it usually is</span>
        ${busynessPicker(s.busyness, 'data-add-busy')}
      </div>

      <div class="field">
        <span class="label">Indoors or outdoors</span>
        ${settingPicker(s.setting, 'data-add-setting', false)}
      </div>

      <div class="field">
        <span class="label">Features <span class="opt">Pick all that apply</span></span>
        <div class="chip-wrap" role="group" aria-label="Features">
          ${FILTER_FEATURES.map((f) => `<button type="button" class="chip chip-toggle${s.tags[f.key] ? ' is-on' : ''}" aria-pressed="${!!s.tags[f.key]}" data-add-tag="${f.key}">${icon(f.key)}${f.label}</button>`).join('')}
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
