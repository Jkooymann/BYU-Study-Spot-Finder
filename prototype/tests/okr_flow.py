"""Browser checks for the Admin Page's OKR trackers and active-time session tracking.
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
from sample_spots import use_sample_spots

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
# OKR 2-4 numbers as the database functions would return them (shape from *_okr_2_3_4.sql).
STATS2 = {'users_counted': 8, 'users_within_5': 5, 'percent_within_5': 62.5, 'target_percent': 50.0, 'users_not_found': 3,
          'users_in_progress': 1, 'searches_total': 14, 'searches_within_5': 9, 'median_minutes': 2.3, 'tracking_since': '2026-11-19T00:00:00Z'}
STATS3 = {'users_counted': 10, 'users_with_favorite': 7, 'percent_with_favorite': 70.0, 'target_percent': 80.0,
          'favorites_total': 19, 'median_favorites': 2.0}
STATS4 = {'users_counted': 7, 'users_outside': 3, 'percent_outside': 42.9, 'target_percent': 30.0,
          'users_library_only': 4, 'favorites_in_library': 12, 'favorites_outside': 7}
OTHER = {'okr2_stats': STATS2, 'okr3_stats': STATS3, 'okr4_stats': STATS4}
fake = {'stats': 'ok', 'stats_value': STATS}
searches = {'n': 0}
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
    if name in OTHER:
        if user != 'jason': return reply(403, {'code': '42501', 'message': 'Only the team admin account can see OKR numbers.'})
        return reply(200, [OTHER[name]])
    if name == 'okr_start_search':
        if not user or user == 'jason': return reply(200, None)
        searches['n'] += 1
        return reply(200, f'search-{searches["n"]}')
    if name == 'okr_spot_found':
        return reply(200, bool(user))
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
    use_sample_spots(page)
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
    def stats_calls(fn='okr1_stats'): return [c for c in calls if c[0] == fn]
    def text(sel): return page.locator(sel).inner_text()

    # ---------------- Menu + page protection ----------------
    for who in [None, 'alice@byu.edu']:
        as_user(who)
        assert 'Admin Page' not in menu_labels(), who
        calls.clear()
        page.goto(BASE_URL + '/#okr'); page.wait_for_selector('.empty-title')
        assert 'for the team admin' in text('.empty-title'), who
        assert page.locator('.okr-panel, .okr-card').count() == 0, who
        assert not [c for c in calls if c[0].endswith('_stats')], (who, calls)   # page never asks for the numbers
        assert ('Log in' in text('#app')) == (who is None), who
        # Even if someone forces the request, the database refuses (fake follows the migration).
        for fn in ['okr1_stats', 'okr2_stats', 'okr3_stats', 'okr4_stats']:
            res = page.evaluate(f"OKRApi.stats('{fn}').then(() => 'got numbers', (e) => e.notAllowed ? 'refused' : 'other error')")
            assert res == 'refused', (who, fn, res)

    as_user('jason@byu.edu')
    labels = menu_labels()
    assert labels[-1] == 'Admin Page', labels
    page.click('#home-btn'); page.locator('[data-menu-route="okr"]').click()
    page.wait_for_url('**/#okr'); page.wait_for_selector('#okr-tracker-okr1 .okr-num')
    assert text('#okr-tracker-okr1 .okr-num') == '83.3%' and 'Meeting target' in text('#okr-tracker-okr1 .okr-badge')
    assert '10 of 12' in text('#okr-tracker-okr1 .okr-facts') and 'Updated' in text('#okr-tracker-okr1 .okr-updated')
    # All four trackers, in order, same design
    assert page.locator('.okr-grid > .okr-card').count() == 4
    assert page.locator('.okr-card h2').all_inner_texts() == ['OKR 1: Short sessions', 'OKR 2: Find a spot fast',
                                                              'OKR 3: Users with a favorite', 'OKR 4: Favorites beyond the library']
    for oid, num, badge, fact in [('okr2', '62.5%', 'Meeting target (50%)', '5 of 8'), ('okr3', '70.0%', 'Below target (80%)', '7 of 10'),
                                  ('okr4', '42.9%', 'Meeting target (30%)', '3 of 7')]:
        card = f'#okr-tracker-{oid}'; page.wait_for_selector(card + ' .okr-num')
        assert text(card + ' .okr-num') == num and badge in text(card + ' .okr-badge'), (oid, text(card))
        assert fact in text(card + ' .okr-facts') and 'Updated' in text(card + ' .okr-updated'), oid
        assert page.locator(card + ' .okr-bar .okr-target').count() == 1 and page.locator(card + ' .okr-facts > div').count() == 4
    assert '3 / 1' in text('#okr-tracker-okr2 .okr-facts') and '9 of 14' in text('#okr-tracker-okr2 .okr-facts')
    assert 'Library-only users' in text('#okr-tracker-okr4') and '12' in text('#okr-tracker-okr4 .okr-facts')
    # Each card's Refresh reloads its own numbers
    for oid in ['okr2', 'okr3', 'okr4']:
        pct = {'okr2': 'percent_within_5', 'okr3': 'percent_with_favorite', 'okr4': 'percent_outside'}[oid]
        OTHER[f'{oid}_stats'] = {**OTHER[f'{oid}_stats'], pct: 12.5}
        n = len(stats_calls(f'{oid}_stats'))
        page.click(f'#okr-tracker-{oid} .okr-refresh')
        page.wait_for_function(f'document.querySelector("#okr-tracker-{oid} .okr-num").textContent === "12.5%"')
        assert len(stats_calls(f'{oid}_stats')) == n + 1 and 'Below target' in text(f'#okr-tracker-{oid} .okr-badge'), oid
    # Empty state (nothing to count yet) for a new tracker
    OTHER['okr2_stats'] = {**STATS2, 'users_counted': 0, 'users_within_5': 0, 'percent_within_5': None, 'users_in_progress': 2}
    page.click('#okr-tracker-okr2 .okr-refresh'); page.wait_for_function('document.querySelector("#okr-tracker-okr2 .okr-num").textContent === "—"')
    assert 'No finished searches yet' in text('#okr-tracker-okr2') and '2 in progress' in text('#okr-tracker-okr2')
    assert 'Admin Page' in page.title()

    # ---------------- Refresh button ----------------
    fake['stats'] = 'hold'; n = len(stats_calls())
    page.click('#okr-tracker-okr1 .okr-refresh')
    page.wait_for_function('document.querySelector("#okr-tracker-okr1 .okr-refresh").disabled')
    assert text('#okr-tracker-okr1 .okr-refresh') == 'Refreshing…' and page.get_attribute('#okr-tracker-okr1 .okr-body', 'aria-busy') == 'true'
    page.click('#okr-tracker-okr1 .okr-refresh', force=True)                       # disabled: no second request
    assert len(stats_calls()) == n + 1, stats_calls()
    fake['stats_value'] = {**STATS, 'percent_under_10': 70.0, 'sessions_under_10': 7, 'sessions_counted': 10}
    held.pop().fulfill(status=200, content_type='application/json', body=json.dumps([fake['stats_value']]))
    page.wait_for_function('document.querySelector("#okr-tracker-okr1 .okr-num").textContent === "70.0%"')
    assert 'Below target' in text('#okr-tracker-okr1 .okr-badge') and text('#okr-tracker-okr1 .okr-refresh') == 'Refresh'
    assert not page.locator('#okr-tracker-okr1 .okr-refresh').is_disabled() and page.get_attribute('#okr-tracker-okr1 .okr-body', 'aria-busy') == 'false'

    fake['stats'] = 'error'; page.click('#okr-tracker-okr1 .okr-refresh'); page.wait_for_selector('#okr-tracker-okr1 .okr-error')
    assert 'Check your connection' in text('#okr-tracker-okr1 .okr-error') and 'boom' not in text('#app'), text('#okr-tracker-okr1 .okr-error')
    assert text('#okr-tracker-okr1 .okr-refresh') == 'Refresh' and not page.locator('#okr-tracker-okr1 .okr-refresh').is_disabled()
    fake['stats'] = 'ok'; page.click('#okr-tracker-okr1 .okr-refresh'); page.wait_for_selector('#okr-tracker-okr1 .okr-num')
    assert text('#okr-tracker-okr1 .okr-num') == '70.0%'

    # Auto refresh every minute; leaving the page stops it.
    ns = [len(stats_calls(f'okr{i}_stats')) for i in range(1, 5)]; page.clock.run_for(61_000); page.wait_for_timeout(100)
    assert [len(stats_calls(f'okr{i}_stats')) for i in range(1, 5)] == [x + 1 for x in ns]
    page.goto(BASE_URL + '/#favorites'); page.wait_for_selector('.page-hero h1')
    n = len([c for c in calls if c[0].endswith('_stats')]); page.clock.run_for(180_000); page.wait_for_timeout(50)
    assert len([c for c in calls if c[0].endswith('_stats')]) == n, 'timer kept running after leaving the page'

    # The admin is not tracked
    page.goto(BASE_URL + '/#start'); page.wait_for_selector('[data-start-chip]')
    page.click('[data-start-chip="wifi"]'); page.click('#go-btn'); page.wait_for_selector('.spot-card')
    page.locator('.spot-card').first.click(); page.wait_for_selector('#spot-dialog #sd-title'); page.wait_for_timeout(100)
    assert not [c for c in calls if c[0] in ('okr_start_session', 'okr_heartbeat', 'okr_start_search', 'okr_spot_found')], calls

    # Mobile layout
    page.set_viewport_size({'width': 390, 'height': 800}); page.goto(BASE_URL + '/#okr'); page.wait_for_selector('#okr-tracker-okr1 .okr-num')
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
        elif kind == 'wheel':
            # Chrome hands wheel events to the page on the next animation frame, and the fake clock
            # runs animation frames, so step it 50 ms and wait for the event before jumping ahead.
            page.evaluate("window.__wheel = false; document.addEventListener('wheel', () => { window.__wheel = true; }, { once: true, capture: true })")
            page.mouse.move(600, 500); page.mouse.wheel(0, 40)
            for _ in range(20):
                if page.evaluate('window.__wheel'): break
                page.clock.run_for(50); page.wait_for_timeout(20)
            assert page.evaluate('window.__wheel'), 'wheel event never arrived'
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

    # ---------------- OKR 2: searches ----------------
    as_user('alice@byu.edu', 'start'); calls.clear()
    srch = lambda name: [c for c in calls if c[0] == name]
    def settle(): page.wait_for_timeout(150)
    def open_card():
        page.wait_for_selector('.spot-card'); page.locator('.spot-card').first.click()
        page.wait_for_selector('#spot-dialog #sd-title'); settle()
    def close_card():
        page.locator('[data-sd-close]').first.click(); page.wait_for_selector('#spot-dialog', state='hidden')
    # Get Started choice starts a search; more choices don't start another; opening a card finds it.
    page.click('[data-start-chip="wifi"]'); settle()
    assert len(srch('okr_start_search')) == 1 and srch('okr_start_search')[0][1] == 'alice', calls
    first = srch('okr_start_search')
    page.click('[data-start-chip="outlets"]'); page.click('[data-start-chip="outlets"]'); settle()   # on, then off
    assert len(srch('okr_start_search')) == 1
    page.click('#go-btn'); open_card()
    s1_ = f'search-{searches["n"]}'
    assert srch('okr_spot_found') == [('okr_spot_found', 'alice', {'p_search_id': s1_})], calls
    page.evaluate('SearchTracker.spotSelected()'); settle()   # a second card in the same search
    assert len(srch('okr_spot_found')) == 1, 'a search is found only once'
    close_card()
    # Filter panel feature after a found search starts a new one; turning one OFF doesn't.
    page.click('[data-open-filters]'); page.wait_for_selector('#filter-panel:not([hidden])')
    page.locator('[data-fp-feature="quietZone"]').check(force=True); settle()
    assert len(srch('okr_start_search')) == 2
    page.locator('[data-fp-feature="quietZone"]').uncheck(force=True); page.locator('[data-fp-feature="outlets"]').check(force=True); settle()
    assert len(srch('okr_start_search')) == 2, 'started a second search while one was open'
    page.keyboard.press('Escape')
    # No spot within 5 minutes: the next feature starts a new search (the old one stays "not found").
    page.clock.run_for(5 * 60_000 + 1000)
    page.click('[data-open-filters]'); page.wait_for_selector('#filter-panel:not([hidden])')
    page.locator('[data-fp-feature="tables"]').check(force=True); settle()
    assert len(srch('okr_start_search')) == 3 and len(srch('okr_spot_found')) == 1
    page.keyboard.press('Escape')
    # Opening a spot from the Favorites list isn't finding one.
    page.evaluate('''document.querySelector('#app').insertAdjacentHTML('beforeend',
        '<ul class="fav-list"><li><button type="button" id="test-fav" data-open-spot="s1">x</button></li></ul>')''')
    page.click('#test-fav'); page.wait_for_selector('#spot-dialog #sd-title'); settle()
    assert len(srch('okr_spot_found')) == 1, 'favorites click counted'
    close_card()
    # Found after 5 minutes still records the time (the database counts it as not within 5).
    page.clock.run_for(6 * 60_000); page.goto(BASE_URL + '/#list'); open_card()
    assert srch('okr_spot_found')[-1][2] == {'p_search_id': f'search-{searches["n"]}'}
    close_card()
    # A reload keeps the open search.
    page.goto(BASE_URL + '/#start'); page.wait_for_selector('[data-start-chip]')
    page.click('[data-start-chip="quietZone"]'); settle(); open_id = f'search-{searches["n"]}'
    page.reload(); page.wait_for_function('Store.sharedStatus() === "ok"'); page.goto(BASE_URL + '/#list'); open_card()
    assert srch('okr_spot_found')[-1][2] == {'p_search_id': open_id}, calls
    close_card()
    # Logged out: nothing recorded.
    as_user(None, 'start'); calls.clear()
    page.click('[data-start-chip="wifi"]'); page.click('#go-btn'); open_card()
    assert not srch('okr_start_search') and not srch('okr_spot_found'), calls

    assert not errors, errors
    print('PASS: OKR menu only for the admin, #okr blocked for logged-out and students (no stats request, forced request refused), '
          'admin sees OKR 1 card; Refresh shows loading, ignores double clicks, shows new numbers, friendly error and recovers; '
          'auto refresh stops when leaving; admin not tracked; active time stops 2 min after activity, new session after the cutoff, '
          'keys/scroll/taps count, hidden time not counted, frozen-page time not counted, reload keeps session, logout sends final total; OKR 2-4 cards show their numbers, refresh on their own and show empty states; OKR 2 searches: start on Get Started or Filter panel features, '
          'one open search at a time, found once on a spot card (not from Favorites), new search after 5 min, late finds recorded, kept across reload, '
          'not for the admin or logged-out visitors; no uncaught errors')
    b.close()
