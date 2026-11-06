/* =========================================================================
   Recommend — the ✨ "Suggest spots" button in the bottom-right of every page.
   Opens a small panel with 3–5 spots picked by AI (Gemini) from the spots the
   student saved as favorites. The AI runs in a Supabase Edge Function
   (supabase/functions/recommend-spots) that reads spots and favorites live
   from the database, so nothing here needs updating when spots are edited,
   added or deleted. Every spot it returns is looked up on this page again,
   and any spot the page doesn't have is skipped.
   With no favorites (or only favorites of deleted spots) the panel asks the
   student to save some first and the AI is not called.
   ========================================================================= */

const Recommend = {
  isOpen: false,
  state: 'idle',     // idle | waiting | offline | login | no_favorites | loading | ok | no_candidates | rate_limited | error
  scope: '',         // for rate_limited: hour | day | site | gemini
  picks: [],         // [{ spot, reason }]
  favCount: 0,
  memo: {},          // answers already shown, by favorites + spots, so reopening doesn't ask again
  requestId: 0,

  init() {
    const fab = $('#ai-fab');
    fab.innerHTML = `${icon('sparkle')}<span class="ai-fab-label">Suggest spots</span>`;
    fab.addEventListener('click', (e) => { e.stopPropagation(); this.isOpen ? this.close() : this.open(); });
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (e.target.closest('[data-ai-close]')) { this.close(true); return; }
      if (e.target.closest('[data-ai-retry]')) { this.load(true); return; }
      if (e.target.closest('#ai-panel a')) { this.close(); return; }
      if (!e.target.closest('#ai-panel') && !e.target.closest('#ai-fab')) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) { e.stopImmediatePropagation(); this.close(true); }
    }, true);
    window.addEventListener('hashchange', () => { if (this.isOpen) this.close(); });
  },

  open() {
    this.isOpen = true;
    $('#ai-panel').hidden = false;
    $('#ai-fab').setAttribute('aria-expanded', 'true');
    $('#ai-fab').classList.add('is-open');
    this.load();
    const h = $('#ai-panel h2'); if (h) h.focus();
  },

  close(returnFocus = false) {
    this.isOpen = false;
    this.requestId++;     // ignore an answer that arrives after closing
    if (this.state === 'loading') this.state = 'idle';
    $('#ai-panel').hidden = true;
    $('#ai-fab').setAttribute('aria-expanded', 'false');
    $('#ai-fab').classList.remove('is-open');
    if (returnFocus) $('#ai-fab').focus();
  },

  /** Called after the page's data reloads (App.refresh); only updates "waiting"-type messages. */
  refresh() {
    if (this.isOpen && ['waiting', 'login', 'no_favorites', 'offline'].includes(this.state)) this.load();
  },

  /** Database ids of the student's favorites that still exist on this page. */
  favoriteDbIds() {
    return Store.favorites().map((id) => Store.getSpot(id)).filter((s) => s && s.dbId != null).map((s) => s.dbId);
  },

  async load(force = false) {
    const status = Store.sharedStatus();
    if (status === 'off' || status === 'error') return this.show('offline');
    if (status === 'loading') return this.show('waiting');
    if (Store.needsLogin()) return this.show('login');
    const favs = this.favoriteDbIds();
    this.favCount = favs.length;
    if (!favs.length) return this.show('no_favorites');

    const spotIds = Store.allSpots().filter((s) => s.dbId != null).map((s) => s.dbId);
    const key = favs.slice().sort((a, b) => a - b).join(',') + '|' + spotIds.slice().sort((a, b) => a - b).join(',');
    if (!force && this.memo[key]) { this.picks = this.memo[key]; return this.show('ok'); }

    const req = ++this.requestId;
    this.show('loading');
    let res;
    try {
      res = await DB.recommendSpots(spotIds);
    } catch (err) {
      console.error('Could not get AI recommendations', err);
      res = { status: 'error' };
    }
    if (req !== this.requestId) return;   // closed or asked again meanwhile
    if (!res || res.status !== 'ok') {
      this.scope = (res && res.scope) || '';
      return this.show(['no_favorites', 'no_candidates', 'login_required', 'rate_limited'].includes(res && res.status)
        ? (res.status === 'login_required' ? 'login' : res.status) : 'error');
    }
    // Only spots this page can open, once each.
    const seen = new Set();
    const picks = (res.recommendations || []).map((r) => ({ spot: Store.getSpotByDbId(Number(r.spot_id)), reason: r.reason || '' }))
      .filter((p) => p.spot && !seen.has(p.spot.id) && seen.add(p.spot.id));
    if (!picks.length) return this.show('no_candidates');
    this.memo[key] = picks;
    this.picks = picks;
    this.show('ok');
  },

  show(state) {
    this.state = state;
    if (this.isOpen) this.render();
  },

  render() {
    const panel = $('#ai-panel');
    panel.setAttribute('aria-busy', String(this.state === 'loading'));
    panel.innerHTML = `
      <div class="ai-head">
        <span class="ai-badge">${icon('sparkle')}</span>
        <h2 id="ai-title" tabindex="-1">Suggested for you</h2>
        <button type="button" class="icon-btn icon-btn-sm" data-ai-close aria-label="Close suggestions">${icon('x')}</button>
      </div>
      <div class="ai-body">${this.body()}</div>`;
  },

  body() {
    const msg = (text, action = '') => `<p class="ai-msg">${text}</p>${action}`;
    const link = (href, label, cls = 'btn-primary') => `<a class="btn ${cls} ai-action" href="${href}">${label}</a>`;
    const retry = '<button type="button" class="btn btn-secondary ai-action" data-ai-retry>' + icon('refresh') + 'Try again</button>';
    switch (this.state) {
      case 'offline':
        return msg('Suggestions need the database connection. Check your connection and reload the page.');
      case 'waiting':
        return '<p class="ai-msg ai-loading"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span>Loading your favorites…</p>';
      case 'login':
        return msg('Log in and save a few favorite spots, and I’ll suggest similar places to study.', link('#login', 'Log in'));
      case 'no_favorites':
        return msg(`Save a few favorites first. Tap the ${icon('star', 'ai-inline-ic')} on any spot you like, then come back and I’ll suggest similar spots.`,
          link('#list', `${icon('list')}Browse study spots`));
      case 'loading':
        return `<p class="ai-msg ai-loading"><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span>Finding spots like your ${plural(this.favCount, 'favorite')}…</p>`;
      case 'no_candidates':
        return msg('You’ve already saved every spot I know about, so there’s nothing new to suggest right now. Check back when more spots are added!');
      case 'rate_limited':
        return msg({
          hour: 'You’ve asked for a lot of suggestions this hour. Try again in a little while.',
          day: 'You’ve used today’s suggestions. Try again tomorrow!',
        }[this.scope] || 'The AI has hit its free limit for now. Try again later.');
      case 'error':
        return msg('I couldn’t get suggestions right now. Try again in a minute.', retry);
      case 'ok':
        return `<p class="ai-sub">Based on your ${plural(this.favCount, 'favorite')}</p>
          <ol class="ai-list">${this.picks.map(({ spot, reason }) => {
            const b = buildingById(spot.building) || { short: spot.building };
            return `<li><a class="ai-item" href="#spot-${esc(spot.id)}">
              <span class="ai-item-name">${esc(spot.name)}</span>
              <span class="ai-item-meta">${esc(b.short)} · Floor ${esc(spot.floor)}</span>
              ${reason ? `<span class="ai-item-why">${esc(reason)}</span>` : ''}
            </a></li>`;
          }).join('')}</ol>
          <p class="ai-note">Suggestions are made by AI and can be wrong.</p>`;
      default:
        return '';
    }
  },
};

Recommend.init();
