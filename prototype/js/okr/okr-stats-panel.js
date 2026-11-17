/* =========================================================================
   OKR 1: stats panel.
   A self-contained component, shown on the admin's OKR Trackers page
   (js/okr/okr-trackers-page.js): OKRStatsPanel.mount(element).
   The numbers come from okr1_stats(), which only answers the admin account.

   It brings its own styles (scoped to .okr1-panel) and uses the site's color
   tokens from css/styles.css when they exist, with fallbacks when they don't.
   ========================================================================= */

const OKRStatsPanel = (() => {
  const CSS = `
  .okr1-panel { font-family: var(--font-body, system-ui, sans-serif); color: var(--text, #15202f);
    background: var(--surface, #fff); border: 1px solid var(--border, #d8e0eb); border-radius: var(--r, 16px);
    box-shadow: var(--shadow, none); padding: 20px; max-width: 520px; }
  .okr1-panel h2 { font-family: var(--font-display, inherit); font-size: 1.15rem; margin: 0 0 4px; }
  .okr1-goal { color: var(--muted, #5a6779); font-size: .92rem; margin: 0 0 16px; }
  .okr1-big { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .okr1-num { font-family: var(--font-display, inherit); font-size: 2.8rem; font-weight: 800; line-height: 1;
    font-variant-numeric: tabular-nums; }
  .okr1-badge { font-size: .8rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .okr1-badge.ok { background: color-mix(in srgb, var(--ok, #1f7a4d) 15%, transparent); color: var(--ok, #1f7a4d); }
  .okr1-badge.miss { background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }
  .okr1-bar { position: relative; height: 10px; border-radius: 999px; background: var(--surface-2, #eef2f8); margin: 14px 0 6px; }
  .okr1-fill { height: 100%; border-radius: 999px; background: var(--primary, #0b3a6f); }
  .okr1-target { position: absolute; top: -4px; bottom: -4px; width: 2px; background: var(--text, #15202f); }
  .okr1-scale { display: flex; justify-content: space-between; font-size: .78rem; color: var(--muted, #5a6779); }
  .okr1-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 0; }
  .okr1-facts div { background: var(--surface-2, #eef2f8); border-radius: var(--r-sm, 10px); padding: 10px 12px; }
  .okr1-facts dt { font-size: .78rem; color: var(--muted, #5a6779); }
  .okr1-facts dd { margin: 2px 0 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  .okr1-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 14px;
    font-size: .8rem; color: var(--muted, #5a6779); }
  .okr1-foot button { font: inherit; font-weight: 600; min-height: 36px; padding: 0 14px; cursor: pointer;
    border-radius: 999px; border: 1px solid var(--border, #d8e0eb); background: var(--surface, #fff); color: var(--text, #15202f); }
  .okr1-error { color: var(--danger, #b42318); }
  .okr1-status { color: var(--muted, #5a6779); }
  .okr1-body.is-loading .okr1-big, .okr1-body.is-loading .okr1-bar, .okr1-body.is-loading .okr1-facts { opacity: .55; transition: opacity .15s; }
  .okr1-foot button:disabled { cursor: progress; opacity: .7; }
  `;

  function injectStyles() {
    if (document.getElementById('okr1-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'okr1-panel-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());

  function body(s) {
    const target = Number(s.target_percent || 80);
    if (s.percent_under_10 === null || s.percent_under_10 === undefined) {
      return `<p class="okr1-big"><span class="okr1-num">—</span></p>
        <p class="okr1-goal">No sessions to count yet. A session counts once it has ended and it isn't the student's first.
        ${n(s.first_sessions)} first session(s) and ${n(s.open_sessions)} open session(s) so far.</p>`;
    }
    const pct = Number(s.percent_under_10);
    const met = pct >= target;
    return `
      <div class="okr1-big">
        <span class="okr1-num">${esc(pct.toFixed(1))}%</span>
        <span class="okr1-badge ${met ? 'ok' : 'miss'}">${met ? 'Meeting target' : 'Below target'} (${esc(target)}%)</span>
      </div>
      <div class="okr1-bar" role="img" aria-label="${esc(pct.toFixed(1))}% of sessions under 10 minutes; target ${esc(target)}%">
        <div class="okr1-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div>
        <div class="okr1-target" style="left:${target}%"></div>
      </div>
      <div class="okr1-scale"><span>0%</span><span>target ${esc(target)}%</span><span>100%</span></div>
      <dl class="okr1-facts">
        <div><dt>Sessions under 10 min</dt><dd>${n(s.sessions_under_10)} of ${n(s.sessions_counted)}</dd></div>
        <div><dt>Median session</dt><dd>${s.median_minutes === null ? '—' : esc(s.median_minutes) + ' min'}</dd></div>
        <div><dt>Students counted</dt><dd>${n(s.users_counted)}</dd></div>
        <div><dt>Left out: first / still open</dt><dd>${n(s.first_sessions)} / ${n(s.open_sessions)}</dd></div>
      </dl>`;
  }

  /** Render the panel into `container`. Returns { refresh, destroy }. */
  function mount(container, { refreshMs = 60000 } = {}) {
    injectStyles();
    container.classList.add('okr1-panel');
    container.innerHTML = `
      <h2>OKR 1: Short sessions</h2>
      <p class="okr1-goal">Goal: 80% of sessions under 10 minutes, not counting each student's first session.
        Only active time counts: the clock stops after 2 minutes without a click, tap, key press or scroll, and while the page is hidden.</p>
      <div class="okr1-body" aria-live="polite"><p class="okr1-status">Loading…</p></div>
      <div class="okr1-foot"><span class="okr1-updated"></span><button type="button" class="okr1-refresh">Refresh</button></div>`;
    const bodyEl = container.querySelector('.okr1-body');
    const updatedEl = container.querySelector('.okr1-updated');
    const button = container.querySelector('.okr1-refresh');
    let latest = 0;     // only the newest request may change the panel
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
      if (!bodyEl.querySelector('.okr1-big')) bodyEl.innerHTML = '<p class="okr1-status">Loading…</p>';
      try {
        const stats = await OKRApi.stats();
        if (destroyed || req !== latest) return;
        bodyEl.innerHTML = body(stats || {});
        updatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      } catch (err) {
        if (destroyed || req !== latest) return;
        console.warn('[OKR] stats failed', err);
        bodyEl.innerHTML = `<p class="okr1-error" role="alert">${err && err.notAllowed
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
      destroy() { destroyed = true; clearInterval(timer); container.innerHTML = ''; container.classList.remove('okr1-panel'); },
    };
  }

  return { mount };
})();
