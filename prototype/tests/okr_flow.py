"""Browser checks for the OKR Trackers page and active-time session tracking.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/okr_flow.py
js/db.js is replaced with an in-memory fake (three accounts; Jason is the admin), and every
OKR database call is answered here, following the same rules as
supabase/migrations/*_okr_admin_only_and_active_time.sql (stats only for the admin, the admin
is never recorded). Those rules are tested against Postgres in supabase/tests/okr_admin_rls.py.
Time is controlled with Playwright's fake clock.
"""
import json, os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')

FAKE_DB = """
const DB = (() => {
  const load = (k, d) => JSON.parse(localStorage.getItem('fake.' + k) || JSON.stringify(d));
  const USERS = [
    { user_id: 1, email: 'jason@byu.edu', display_name: 'Jason', byu_net_id: 'jason', admin: true },
    { user_id: 2, email: 'alice@byu.edu', display_name: 'Alice', byu_net_id: 'alice', admin: false },
  ];
  const me = () => USERS.find((u) => u.email === load('session', null)) || null;
  return {
    ready: true,
    async students() { return []; }, async buildings() { return []; }, async studentSpots() { return []; },
    async favoriteSpotIds() { return []; }, async addFavorite() {}, async removeFavorite() {},
    async signOut() { window.__signOutAt = (window.__okrLog || []).length; localStorage.setItem('fake.session', 'null'); },
    async accessToken() { const m = me(); return m ? 'token-' + m.byu_net_id : null; },
    async currentStudent() { const m = me(); return m ? { user_id: m.user_id, display_name: m.display_name, byu_net_id: m.byu_net_id, email: m.email, isAdmin: m.admin } : null; },
  };
})();"""

# Lets the test hide / show the page like switching tabs or locking a phone.
VISIBILITY = """
window.__vis = 'visible';
Object.defineProperty(Document.prototype, 'visibilityState', { get() { return window.__vis; }, configurable: true });
Object.defineProperty(Document.prototype, 'hidden', { get() { return window.__vis !== 'visible'; }, configurable: true });
"""

STATS = {'sessions_counted': 12, 'sessions_under_10': 10, 'percent_under_10': 83.3, 'target_percent': 80.0,
         'users_counted': 5, 'first_sessions': 5, 'open_sessions': 1, 'median_minutes': 4.2}
fake = {'stats': 'ok', 'stats_value': STATS}
calls = []     # (function, user, body)
held = []      # okr1_stats requests waiting to be answered
sessions = {'n': 0}

def rpc(route):
    req = route.request
    name = req.url.split('/rpc/')[1].split('?')[0]
    auth = req.headers.get('authorization', '')
    user = auth.split('token-')[1] if 'token-' in auth else None
    body = json.loads(req.post_data or '{}')
    calls.append((name, user, body))
    reply = lambda status, data: route.fulfill(status=status, content_type='application/json', body=json.dumps(data))
    if name == 'okr1_stats':
        if user != 'jason': return reply(403, {'code': '42501', 'message': 'Only the team admin account can see OKR numbers.'})
        if fake['stats'] == 'hold': return held.append(route)
        if fake['stats'] == 'error': return reply(500, {'code': 'XX000', 'message': 'boom: internal detail'})
        return reply(200, [fake['stats_value']])
    if name == 'okr_start_session':
        if not user or user == 'jason': return reply(200, None)   # the database never records the admin
        sessions['n'] += 1
        return reply(200, f'session-{sessions["n"]}')
    if name == 'okr_heartbeat':
        return reply(200, bool(user))
    return reply(404, {})

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    page = ctx.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(VISIBILITY)
    page.route('**/js/db.js*', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('**/rest/v1/rpc/**', rpc)
    page.route(lambda u: not u.startswith(BASE_URL) and '/rest/v1/rpc/' not in u, lambda r: r.abort())
    page.clock.install(time=datetime(2026, 11, 18, 9, 0, tzinfo=timezone.utc))

    def as_user(email, hash_='favorites'):
        page.goto(BASE_URL + '/#start')
        page.evaluate(f"localStorage.setItem('fake.session', JSON.stringify({'null' if email is None else repr(email)}))")
        page.evaluate('sessionStorage.clear()')
        page.goto(BASE_URL + '/#' + hash_); page.reload()
        page.wait_for_function('Store.sharedStatus() === "ok"')
    def menu_labels():
        page.click('#home-btn'); labels = page.locator('#home-menu .menu-item-label').all_inner_texts(); page.click('#home-btn')
        return labels
    def stats_calls(): return [c for c in calls if c[0] == 'okr1_stats']
    def text(sel): return page.locator(sel).inner_text()

    # ---------------- Menu + page protection ----------------
    for who in [None, 'alice@byu.edu']:
        as_user(who)
        assert 'OKR Trackers' not in menu_labels(), who
        calls.clear()
        page.goto(BASE_URL + '/#okr'); page.wait_for_selector('.empty-title')
        assert 'for the team admin' in text('.empty-title'), who
        assert page.locator('.okr1-panel, .okr-card').count() == 0, who
        assert not stats_calls(), (who, calls)                     # page never asks for the numbers
        assert ('Log in' in text('#app')) == (who is None), who
        # Even if someone forces the request, the database refuses (fake follows the migration).
        res = page.evaluate("OKRApi.stats().then(() => 'got numbers', (e) => e.notAllowed ? 'refused' : 'other error')")
        assert res == 'refused', (who, res)

    as_user('jason@byu.edu')
    labels = menu_labels()
    assert labels[-1] == 'OKR Trackers', labels
    page.click('#home-btn'); page.locator('[data-menu-route="okr"]').click()
    page.wait_for_url('**/#okr'); page.wait_for_selector('.okr1-num')
    assert text('.okr1-num') == '83.3%' and 'Meeting target' in text('.okr1-badge')
    assert '10 of 12' in text('.okr1-facts') and 'Updated' in text('.okr1-updated')
    assert page.locator('.okr-grid > .okr-card').count() == 1
    assert 'OKR Trackers' in page.title()

    # ---------------- Refresh button ----------------
    fake['stats'] = 'hold'; n = len(stats_calls())
    page.click('.okr1-refresh')
    page.wait_for_function('document.querySelector(".okr1-refresh").disabled')
    assert text('.okr1-refresh') == 'Refreshing…' and page.get_attribute('.okr1-body', 'aria-busy') == 'true'
    page.click('.okr1-refresh', force=True)                       # disabled: no second request
    assert len(stats_calls()) == n + 1, stats_calls()
    fake['stats_value'] = {**STATS, 'percent_under_10': 70.0, 'sessions_under_10': 7, 'sessions_counted': 10}
    held.pop().fulfill(status=200, content_type='application/json', body=json.dumps([fake['stats_value']]))
    page.wait_for_function('document.querySelector(".okr1-num").textContent === "70.0%"')
    assert 'Below target' in text('.okr1-badge') and text('.okr1-refresh') == 'Refresh'
    assert not page.locator('.okr1-refresh').is_disabled() and page.get_attribute('.okr1-body', 'aria-busy') == 'false'

    fake['stats'] = 'error'; page.click('.okr1-refresh'); page.wait_for_selector('.okr1-error')
    assert 'Check your connection' in text('.okr1-error') and 'boom' not in text('#app'), text('.okr1-error')
    assert text('.okr1-refresh') == 'Refresh' and not page.locator('.okr1-refresh').is_disabled()
    fake['stats'] = 'ok'; page.click('.okr1-refresh'); page.wait_for_selector('.okr1-num')
    assert text('.okr1-num') == '70.0%'

    # Auto refresh every minute; leaving the page stops it.
    n = len(stats_calls()); page.clock.run_for(61_000); page.wait_for_timeout(50)
    assert len(stats_calls()) == n + 1
    page.goto(BASE_URL + '/#favorites'); page.wait_for_selector('.page-hero h1')
    n = len(stats_calls()); page.clock.run_for(180_000); page.wait_for_timeout(50)
    assert len(stats_calls()) == n, 'timer kept running after leaving the page'

    # The admin is not tracked
    assert not [c for c in calls if c[0] in ('okr_start_session', 'okr_heartbeat')], calls

    # Mobile layout
    page.set_viewport_size({'width': 390, 'height': 800}); page.goto(BASE_URL + '/#okr'); page.wait_for_selector('.okr1-num')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.set_viewport_size({'width': 1280, 'height': 900})

    # ---------------- Active time ----------------
    calls.clear()
    as_user('alice@byu.edu')
    active = lambda: round(page.evaluate('SessionTracker.activeSeconds'))
    sid = lambda: page.evaluate('SessionTracker.sessionId')
    def beats(s):
        page.wait_for_timeout(150)   # let queued reports go out (they're real requests)
        return [c[2]['p_active_seconds'] for c in calls if c[0] == 'okr_heartbeat' and c[2]['p_session_id'] == s]
    def act(kind='click'):
        if kind == 'click': page.locator('.page-hero h1').click()
        elif kind == 'key': page.keyboard.press('Shift')
        elif kind == 'wheel': page.mouse.move(600, 500); page.mouse.wheel(0, 40)
        elif kind == 'tap': page.dispatch_event('.page-hero h1', 'touchstart')
        page.wait_for_timeout(20)
    def set_visible(on):
        page.evaluate(f"window.__vis = '{'visible' if on else 'hidden'}'; document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(20)
    page.wait_for_function('SessionTracker.sessionId')
    s1 = sid(); assert active() == 0
    nth = lambda k: f'session-{int(s1.split("-")[1]) + k}'

    # Time counts while reading, but stops two minutes after the last activity.
    page.clock.run_for(30_000); assert active() == 30
    act(); page.clock.run_for(300_000); assert active() == 30 + 120, active()
    assert beats(s1)[-1] == 150, beats(s1)
    n = len(beats(s1)); page.clock.run_for(120_000); page.wait_for_timeout(50)
    assert len(beats(s1)) == n, 'kept reporting while idle'

    # Coming back after the cutoff starts a new session; the gap isn't added to the old one.
    act(); page.wait_for_function(f'SessionTracker.sessionId === "{nth(1)}"')
    s2 = sid(); assert active() == 0 and beats(s1)[-1] == 150

    # Keys, scrolling and taps all count as activity.
    for kind in ['key', 'wheel', 'tap']:
        page.clock.run_for(100_000); act(kind)
    page.clock.run_for(100_000)
    assert sid() == s2 and active() == 400, (kind, active())

    # Hidden page: the clock stops at once and the total is sent.
    act(); base = active(); page.clock.run_for(20_000)
    set_visible(False); assert active() == base + 20
    page.wait_for_timeout(50); assert beats(s2)[-1] == base + 20
    act('key')                                       # hidden: ignored
    page.clock.run_for(60_000); assert active() == base + 20
    set_visible(True); page.clock.run_for(10_000)
    assert active() == base + 20, 'counted time before the student did anything'
    act(); page.clock.run_for(10_000)                # back within 2 min of the last activity: same session
    assert sid() == s2 and active() == base + 30, active()

    # Locked phone for 10 minutes: new session on return, old one gets nothing extra.
    set_visible(False); before = active()
    page.clock.run_for(600_000); set_visible(True); act()
    page.wait_for_function(f'SessionTracker.sessionId === "{nth(2)}"')
    assert beats(s2)[-1] == before and active() == 0

    # Mobile browser froze the page (no timers, no visibilitychange) for 10 minutes:
    # the clock jumps but nothing fires. Only the two minutes before the cutoff count.
    act(); page.clock.run_for(5_000); s3 = sid(); base = active()
    page.clock.set_system_time(datetime.fromtimestamp((page.evaluate('Date.now()') + 600_000) / 1000, timezone.utc))
    assert active() == base - 5 + 120, active()
    act(); page.wait_for_function(f'SessionTracker.sessionId === "{nth(3)}"')
    page.wait_for_timeout(50); assert beats(s3)[-1] == base - 5 + 120, beats(s3)

    # Reload within two minutes keeps the session.
    s4 = sid(); act(); page.clock.run_for(20_000); before = active()
    page.reload(); page.wait_for_function('Store.sharedStatus() === "ok" && SessionTracker.sessionId')
    assert sid() == s4 and active() >= before, (sid(), active(), before)

    # Logging out sends the final total while the login still works.
    act(); page.clock.run_for(15_000); calls.clear()
    page.click('#account-btn'); page.click('[data-sign-out]'); page.wait_for_selector('.login-btn')
    hb = [c for c in calls if c[0] == 'okr_heartbeat']
    assert hb and hb[0][1] == 'alice', calls
    assert page.evaluate('SessionTracker.sessionId') is None

    assert not errors, errors
    print('PASS: OKR menu only for the admin, #okr blocked for logged-out and students (no stats request, forced request refused), '
          'admin sees OKR 1 card; Refresh shows loading, ignores double clicks, shows new numbers, friendly error and recovers; '
          'auto refresh stops when leaving; admin not tracked; active time stops 2 min after activity, new session after the cutoff, '
          'keys/scroll/taps count, hidden time not counted, frozen-page time not counted, reload keeps session, logout sends final total; no uncaught errors')
    b.close()
