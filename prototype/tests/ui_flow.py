"""Browser checks for the main UI: Get Started, filters and the no-results
message, the campus map, the menus, favorites and deleting your own spots.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/ui_flow.py
js/db.js is replaced with an in-memory fake and external requests are blocked.
"""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
CONFIRM = 'false'

FAKE_DB = """
const DB = (() => {
  const load = (k, d) => JSON.parse(localStorage.getItem('fake.' + k) || JSON.stringify(d));
  const save = (k, v) => localStorage.setItem('fake.' + k, JSON.stringify(v));
  window.fakeCalls = [];
  return {
    ready: true,
    async students() { return []; },
    async favoriteSpotIds(uid) { return load('favs', {})[uid] || []; },
    async addFavorite(uid, sid) { const f = load('favs', {}); f[uid] = (f[uid] || []).concat(sid); save('favs', f); },
    async removeFavorite(uid, sid) { const f = load('favs', {}); f[uid] = (f[uid] || []).filter((x) => x !== sid); save('favs', f); },
    async studentSpots() { return load('spots', []); },
    async addSpot(uid, spot) {
      const spots = load('spots', []); const dbId = 1000 + spots.length;
      const saved = { ...spot, id: 'd' + dbId, dbId, submittedBy: uid, submittedByName: '' };
      save('spots', spots.concat(saved)); return saved;
    },
    async deleteSpot(dbId) { save('spots', load('spots', []).filter((x) => x.dbId !== dbId)); },
    async signUp(input) {
      window.fakeCalls.push(['signUp', input]);
      const users = load('users', []);
      if (users.some((u) => u.email === input.email)) throw Object.assign(new Error('User already registered'), { code: 'user_already_exists' });
      users.push({ ...input, user_id: users.length + 10 }); save('users', users);
      if (!CONFIRM_ON) save('session', input.email);
      return { user: {}, needsEmailConfirm: CONFIRM_ON };
    },
    async signIn({ email, password }) {
      const u = load('users', []).find((x) => x.email === email && x.password === password);
      if (!u) throw Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' });
      save('session', email); return {};
    },
    async signOut() { save('session', null); },
    async currentStudent() {
      const e = load('session', null); const u = load('users', []).find((x) => x.email === e);
      return u ? { user_id: u.user_id, display_name: u.displayName, byu_net_id: u.netId } : null;
    },
  };
})();""".replace('CONFIRM_ON', CONFIRM)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/js/db.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#start')
    page.evaluate("localStorage.clear(); localStorage.setItem('fake.users', JSON.stringify([{ email: 'jane@byu.edu', password: 'password1', displayName: 'Jane Smith', netId: 'jane', user_id: 10 }])); localStorage.setItem('fake.spots', JSON.stringify([]))")
    page.reload(); page.wait_for_selector('.start-chips')

    # Header: logo goes home, the menu button is a hamburger with every page in it.
    assert page.locator('.brand').get_attribute('href') == '#start'
    page.click('#home-btn')
    labels = page.locator('#home-menu .menu-item-label').all_inner_texts()
    assert labels == ['Home', 'Campus Map', 'Study Spots', 'Favorites', 'Add a Spot', 'Start Over'], labels
    page.keyboard.press('Escape')

    # Get Started: 9 equal options incl. WiFi; Indoors and Outdoors are one choice.
    chips = page.locator('[data-start-chip]')
    assert chips.count() == 9
    assert page.locator('[data-start-chip="talkingAllowed"]').inner_text().strip() == 'Talking allowed'
    sizes = {tuple(round(v) for v in (c.bounding_box()['width'], c.bounding_box()['height'])) for c in chips.all()}
    assert len(sizes) == 1, sizes
    page.click('[data-start-chip="indoors"]'); page.click('[data-start-chip="outdoors"]')
    assert page.locator('[data-start-chip="indoors"]').get_attribute('aria-pressed') == 'false'
    page.click('[data-start-chip="wifi"]')
    assert 'matching spot' in page.locator('#go-btn').inner_text()
    page.click('#go-btn'); page.wait_for_url('**/#list')
    page.wait_for_selector('.spot-card'); c = page.locator('.spot-card').count(); assert c == 3, (c, page.url, page.locator('.active-filters').inner_text())  # outdoor spots with WiFi
    assert sorted(page.locator('.active-filters .chip').all_inner_texts()) == ['Outdoors', 'WiFi']

    # No results: message with Change filters / random spot / clear.
    page.evaluate("const f = Store.getFilters(); f.features.quietZone = true; Store.setFilters(f); App.refresh()")
    page.wait_for_selector('.no-results')
    assert page.locator('.no-results [data-open-filters]').count() == 1
    page.click('.no-results [data-random-spot]'); page.wait_for_selector('#spot-dialog:not([hidden])')
    page.click('#sd-close'); page.wait_for_selector('#spot-dialog', state='hidden')
    page.click('.no-results [data-clear-filters]')
    assert page.locator('.spot-card').count() == 26
    assert page.locator('#sort-select option').all_inner_texts() == ['Building', 'Least busy first']

    # Filter panel: same options, WiFi included, Indoors/Outdoors as one setting.
    page.click('[data-open-filters]')
    assert page.locator('[data-fp-feature]').count() == 7 and page.locator('#fp-wifi').count() == 1
    assert page.locator('[data-fp-setting]').count() == 3
    page.click('#fp-close')

    # Map: every building on the map and in the directory; Show on map opens a card, not a pop-up.
    page.goto(BASE_URL + '/#map'); page.wait_for_selector('.campus-map')
    n = page.evaluate('BUILDINGS.length')
    assert page.locator('.bldg').count() == n and page.locator('.building-card').count() == n and n >= 17
    page.goto(BASE_URL + '/#spot-s4'); page.wait_for_selector('#spot-dialog:not([hidden])')
    page.click('text=Show on map'); page.wait_for_selector('#map-selected')
    assert page.locator('#spot-dialog').is_hidden()
    assert page.locator('.bldg.is-target').get_attribute('data-building') == 'hbll'
    page.click('#map-selected [data-open-spot="s4"].btn'); page.wait_for_selector('#spot-dialog:not([hidden])')
    page.click('#sd-close'); page.wait_for_selector('#map-selected')

    # Logged out: sample spots can't be deleted.
    page.goto(BASE_URL + '/#spot-s1'); page.wait_for_selector('#spot-dialog:not([hidden])')
    assert page.locator('[data-sd-delete]').count() == 0
    page.click('#sd-close')

    # Log in: account dropdown, favorites, add + delete your own spot.
    page.goto(BASE_URL + '/#login'); page.fill('#account-netid', 'jane'); page.fill('#account-password', 'password1')
    page.click('.account-submit'); page.wait_for_selector('#account-btn')
    page.click('#account-btn'); page.wait_for_selector('#account-menu:not([hidden]) [data-sign-out]')
    page.keyboard.press('Escape')
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('.spot-card')
    page.click('.spot-card[data-open-spot="s3"] [data-fav]')
    page.goto(BASE_URL + '/#favorites'); page.wait_for_selector('.fav-item')
    assert page.locator('.fav-item').count() == 1

    page.goto(BASE_URL + '/#add-wsc'); page.wait_for_selector('#add-form')
    assert page.locator('#add-building').input_value() == 'wsc'
    page.fill('#add-name', 'Test Nook'); page.click('#add-plan .fp-outline')
    page.click('[data-add-setting="outdoors"]'); page.click('[data-add-tag="wifi"]')
    page.click('#add-form [type="submit"]'); page.wait_for_url('**/#list'); page.wait_for_selector('.spot-card.is-flash')
    spot_id = page.locator('.spot-card.is-flash').get_attribute('data-open-spot')
    page.goto(BASE_URL + '/#spot-' + spot_id); page.wait_for_selector('[data-sd-delete]')
    assert 'Outdoors' in page.locator('.sd-facts').inner_text()
    page.click('[data-sd-delete]'); page.click('[data-sd-delete-confirm]')
    page.wait_for_timeout(200)
    assert page.locator('.spot-card').count() == 26

    # Phone: no sideways scrolling, and the filter sheet scrolls on its own.
    page.set_viewport_size({'width': 375, 'height': 667})
    for route in ['start', 'map', 'list', 'favorites', 'add']:
        page.goto(BASE_URL + '/#' + route); page.wait_for_selector('.page-hero')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), route
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('.spot-card')
    page.evaluate('window.scrollTo(0, 600)'); page.evaluate('FilterPanel.open()')
    assert page.evaluate("getComputedStyle(document.body).position") == 'fixed'
    assert page.evaluate("(() => { const b = document.querySelector('#filter-panel .sheet-body'); return b.scrollHeight > b.clientHeight && getComputedStyle(b).overflowY === 'auto'; })()")
    page.click('#fp-close')
    y = page.evaluate("Math.round(window.scrollY)"); assert y == 600, y

    assert not errors, errors
    print('PASS: header menu, Get Started options, filters + no-results, campus map + selected spot, delete only own spots, favorites, add a spot, mobile scroll lock; no uncaught errors')
    b.close()
