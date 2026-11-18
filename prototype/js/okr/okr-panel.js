/* =========================================================================
   OKR tracker card: the same design and behavior for every OKR.
   OKRPanel.mount(element, tracker) draws one card and returns { refresh, destroy }.
   The trackers (title, goal, which database function, which facts) are listed
   in js/okr/okr-trackers-page.js. Every card:
     * loads its numbers from its database function (okr1_stats … okr4_stats),
       which only answers the team admin account;
     * has a Refresh button (shows "Refreshing…", ignores double clicks, shows
       a friendly error and recovers on the next press) and refreshes itself
       every minute while the page is open;
     * shows the main percentage against the target, a progress bar with the
       target marked, four supporting numbers, and an empty state.
   It brings its own styles and uses the site's color tokens from css/styles.css.
   ========================================================================= */

const OKRPanel = (() => {
  const CSS = `
  .okr-panel { font-family: var(--font-body, system-ui, sans-serif); color: var(--text, #15202f);
    background: var(--surface, #fff); border: 1px solid var(--border, #d8e0eb); border-radius: var(--r, 16px);
    box-shadow: var(--shadow, none); padding: 20px; }
  .okr-panel h2 { font-family: var(--font-display, inherit); font-size: 1.15rem; margin: 0 0 4px; }
  .okr-goal { color: var(--muted, #5a6779); font-size: .92rem; margin: 0 0 6px; }
  .okr-period { color: var(--muted, #5a6779); font-size: .8rem; margin: 0 0 16px; }
  .okr-big { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .okr-num { font-family: var(--font-display, inherit); font-size: 2.8rem; font-weight: 800; line-height: 1;
    font-variant-numeric: tabular-nums; }
  .okr-badge { font-size: .8rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .okr-badge.ok { background: color-mix(in srgb, var(--ok, #1f7a4d) 15%, transparent); color: var(--ok, #1f7a4d); }
  .okr-badge.miss { background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }
  .okr-bar { position: relative; height: 10px; border-radius: 999px; background: var(--surface-2, #eef2f8); margin: 14px 0 6px; }
  .okr-fill { height: 100%; border-radius: 999px; background: var(--primary, #0b3a6f); }
  .okr-target { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--text, #15202f); }
  .okr-scale { display: flex; justify-content: space-between; font-size: .78rem; color: var(--muted, #5a6779); }
  .okr-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 0; }
  .okr-facts div { background: var(--surface-2, #eef2f8); border-radius: var(--r-sm, 10px); padding: 10px 12px; }
  .okr-facts dt { font-size: .78rem; color: var(--muted, #5a6779); }
  .okr-facts dd { margin: 2px 0 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  .okr-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 14px;
    font-size: .8rem; color: var(--muted, #5a6779); }
  .okr-foot button { font: inherit; font-weight: 600; min-height: 36px; padding: 0 14px; cursor: pointer;
    border-radius: 999px; border: 1px solid var(--border, #d8e0eb); background: var(--surface, #fff); color: var(--text, #15202f); }
  .okr-error { color: var(--danger, #b42318); }
  .okr-status { color: var(--muted, #5a6779); }
  .okr-body.is-loading .okr-big, .okr-body.is-loading .okr-bar, .okr-body.is-loading .okr-facts { opacity: .55; transition: opacity .15s; }
  .okr-foot button:disabled { cursor: progress; opacity: .7; }
  `;


  function injectStyles() {
    if (document.getElementById('okr-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'okr-panel-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** Formatting helpers handed to each tracker's facts(). */
  const fmt = {
    n: (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString()),
    min: (v) => (v === null || v === undefined ? '—' : `${esc(v)} min`),
    date: (v) => (v ? new Date(v).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'),
  };

  function body(t, s) {
    const target = Number(s.target_percent);
    const raw = s[t.percentKey];
    if (raw === null || raw === undefined) {
      return `<p class="okr-big"><span class="okr-num">—</span></p>
        <p class="okr-goal">${t.empty(s, fmt)}</p>`;
    }
    const pct = Number(raw);
    const met = pct >= target;
    return `
      <div class="okr-big">
        <span class="okr-num">${esc(pct.toFixed(1))}%</span>
        <span class="okr-badge ${met ? 'ok' : 'miss'}">${met ? 'Meeting target' : 'Below target'} (${esc(target)}%)</span>
      </div>
      <div class="okr-bar" role="img" aria-label="${esc(pct.toFixed(1))}% ${esc(t.measure)}; target ${esc(target)}%">
        <div class="okr-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
        <div class="okr-target" style="left:${target}%"></div>
      </div>
      <div class="okr-scale"><span>0%</span><span>target ${esc(target)}%</span><span>100%</span></div>
      <dl class="okr-facts">
        ${t.facts(s, fmt).map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}
      </dl>`;
  }

  /** Draw tracker `t` into `container`. Returns { refresh, destroy }. */
  function mount(container, t, { refreshMs = 60000 } = {}) {
    injectStyles();
    container.classList.add('okr-panel');
    container.dataset.okr = t.id;
    container.innerHTML = `
      <h2>${esc(t.title)}</h2>
      <p class="okr-goal">${esc(t.goal)}</p>
      <p class="okr-period">${esc(t.period)}</p>
      <div class="okr-body" aria-live="polite"><p class="okr-status">Loading…</p></div>
      <div class="okr-foot"><span class="okr-updated"></span><button type="button" class="okr-refresh" aria-label="Refresh ${esc(t.title)}">Refresh</button></div>`;
    const bodyEl = container.querySelector('.okr-body');
    const updatedEl = container.querySelector('.okr-updated');
    const button = container.querySelector('.okr-refresh');
    let latest = 0;     // only the newest request may change the card
    let destroyed = false;

    function setLoading(on) {
      button.disabled = on;
      button.textContent = on ? 'Refreshing…' : 'Refresh';
      bodyEl.setAttribute('aria-busy', String(on));
      bodyEl.classList.toggle('is-loading', on);
    }

    async function refresh() {
      const req = ++latest;
      setLoading(true);
      if (!bodyEl.querySelector('.okr-big')) bodyEl.innerHTML = '<p class="okr-status">Loading…</p>';
      try {
        const stats = await OKRApi.stats(t.fn);
        if (destroyed || req !== latest) return;
        bodyEl.innerHTML = body(t, stats || {});
        updatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      } catch (err) {
        if (destroyed || req !== latest) return;
        console.warn(`[OKR] ${t.fn} failed`, err);
        bodyEl.innerHTML = `<p class="okr-error" role="alert">${err && err.notAllowed
          ? 'Only the team admin account can see these numbers. Log in with that account and try again.'
          : 'Couldn’t load the numbers. Check your connection and press Refresh to try again.'}</p>`;
        updatedEl.textContent = '';
      } finally {
        if (!destroyed && req === latest) setLoading(false);
      }
    }

    button.addEventListener('click', refresh);
    const timer = refreshMs ? setInterval(refresh, refreshMs) : null;
    refresh();
    return {
      refresh,
      destroy() { destroyed = true; clearInterval(timer); container.innerHTML = ''; container.classList.remove('okr-panel'); },
    };
  }

  return { mount };
})();
