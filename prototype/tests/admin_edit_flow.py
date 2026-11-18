"""Browser checks for admin-only editing of study spots: who sees the Edit button,
that the edit form opens filled in, saves, cancels, and that students can't open it.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/admin_edit_flow.py
js/db.js is replaced with an in-memory fake that follows the same rules as
supabase/migrations/*_admin_edit_spots.sql (tested against Postgres in
supabase/tests/admin_edit_spots_rls.py); this only checks the pages.
"""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')

FAKE_DB = """
const DB = (() => {
  const load = (k, d) => JSON.parse(localStorage.getItem('fake.' + k) || JSON.stringify(d));
  const save = (k, v) => localStorage.setItem('fake.' + k, JSON.stringify(v));
  const USERS = [
    { user_id: 1, email: 'jason@byu.edu', display_name: 'Jason', byu_net_id: 'jason', admin: true },
    { user_id: 2, email: 'alice@byu.edu', display_name: 'Alice', byu_net_id: 'alice', admin: false },
    { user_id: 3, email: 'bob@byu.edu', display_name: 'Bob', byu_net_id: 'bob', admin: false },
  ];
  const me = () => USERS.find((u) => u.email === load('session', null)) || null;
  const spot = (dbId, name, by, shared) => ({
    id: 'd' + dbId, dbId, name, building: 'wsc', floor: shared ? 7 : 1, room: '', position: { x: 40, y: 40 }, campusPosition: null,
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate', description: '', submittedBy: by, submittedByName: '', shared,
  });
  if (!localStorage.getItem('fake.spots')) save('spots', [spot(500, 'Team Shared Spot', 1, true), spot(501, 'Alice Secret Spot', 2, false)]);
  return {
    ready: true,
    async students() { return []; },
    async buildings() { return []; },
    async favoriteSpotIds() { return []; },
    async addFavorite() {}, async removeFavorite() {},
    // Same rule as the database: shared spots plus your own private ones.
    async studentSpots() { const m = me(); return load('spots', []).filter((s) => s.shared || (m && s.submittedBy === m.user_id)); },
    async addSpot(uid, s) {
      const spots = load('spots', []); const dbId = 600 + spots.length;
      const saved = { ...s, id: 'd' + dbId, dbId, submittedBy: uid, submittedByName: '', shared: !!(me() && me().admin) };
      save('spots', spots.concat(saved)); return saved;
    },
    // Same rule as admin_update_spot: admin only, shared spots only.
    async updateSpot(dbId, s) {
      if (!(me() && me().admin)) throw Object.assign(new Error('Only the team admin can edit study spots.'), { code: '42501' });
      const spots = load('spots', []); const old = spots.find((x) => x.dbId === dbId && x.shared);
      if (!old) throw Object.assign(new Error('not shared'), { code: 'P0002' });
      const saved = { ...old, ...s, id: old.id, dbId, submittedBy: old.submittedBy, shared: true };
      save('spots', spots.map((x) => (x.dbId === dbId ? saved : x))); return saved;
    },
    async deleteSpot(dbId) { save('spots', load('spots', []).filter((x) => x.dbId !== dbId)); },
    async signOut() { save('session', null); },
    async currentStudent() { const m = me(); return m ? { user_id: m.user_id, display_name: m.display_name, byu_net_id: m.byu_net_id, email: m.email, isAdmin: m.admin } : null; },
  };
})();"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 1280, 'height': 900}); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/js/db.js*', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#list'); page.evaluate('localStorage.clear()')

    def as_user(email):
        page.evaluate(f"localStorage.setItem('fake.session', JSON.stringify({'null' if email is None else repr(email)}))")
        page.goto(BASE_URL + '/#start'); page.reload()
        page.evaluate("App.go('list')"); page.wait_for_selector('.spot-card')
    card = lambda name: page.locator('.spot-card', has_text=name)
    def open_details(name):
        card(name).click(); page.wait_for_selector('#spot-dialog #sd-title')
        return page.locator('#spot-dialog')

    # Logged out and regular students: no Edit button, and #edit-… sends them away
    for who in [None, 'alice@byu.edu']:
        as_user(who)
        d = open_details('Team Shared Spot')
        assert d.locator('[data-sd-edit]').count() == 0, who
        page.goto(BASE_URL + '/#edit-d500'); page.wait_for_timeout(300)
        assert '#edit-' not in page.url and page.locator('#add-form').count() == 0, (who, page.url)
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('#spot-dialog', state='hidden')
    d = open_details('Alice Secret Spot')
    assert d.locator('[data-sd-edit]').count() == 0, 'students cannot edit even their own private spot'

    # Admin: Edit button on shared spots; the form opens filled in
    as_user('jason@byu.edu')
    assert 'Floor 7' in card('Team Shared Spot').locator('.spot-meta').inner_text()
    d = open_details('Team Shared Spot')
    assert 'Floor 7' in d.locator('.spot-meta').inner_text()
    d.locator('a[href="#building-wsc-f7"]').click()
    page.wait_for_selector('.floor-tab.is-on')
    assert page.locator('.floor-tab.is-on span').inner_text() == 'Floor 1'
    assert page.locator('.fp-marker').count() == 0
    page.goto(BASE_URL + '/#list')
    d = open_details('Team Shared Spot')
    d.locator('[data-sd-edit]').click(); page.wait_for_selector('#add-form')
    assert '#edit-d500' in page.url
    assert page.locator('h1', has_text='Edit spot').count() == 1
    assert page.input_value('#add-name') == 'Team Shared Spot'
    assert page.input_value('#add-building') == 'wsc'
    assert page.locator('[data-add-floor]').all_inner_texts() == ['1', '2', '3']
    assert page.locator('[data-add-floor][aria-checked="true"]').count() == 0
    assert page.locator('[data-add-group="small group"]').get_attribute('aria-checked') == 'true' or 'is-on' in (page.locator('[data-add-group="small group"]').get_attribute('class') or '')
    assert page.locator('[data-add-tag="wifi"]').get_attribute('aria-pressed') == 'true'
    assert 'Save changes' in page.locator('#add-form [type="submit"]').inner_text()
    assert 'Editing as' in page.locator('#app').inner_text()

    # Cancel goes back to the spot's details without saving
    page.fill('#add-name', 'Not saved')
    page.click('[data-add-cancel]'); page.wait_for_selector('#spot-dialog #sd-title')
    assert page.locator('#sd-title').inner_text() == 'Team Shared Spot'

    # Edit and save
    page.locator('#spot-dialog [data-sd-edit]').click(); page.wait_for_selector('#add-form')
    assert page.input_value('#add-name') == 'Team Shared Spot', 'cancelled edits are dropped'
    page.fill('#add-name', 'Renamed Spot')
    page.click('[data-add-busy="Usually busy"]')
    page.click('[data-add-tag="wifi"]'); page.click('[data-add-tag="foodAllowed"]')
    page.fill('#add-desc', 'Great by the windows')
    page.click('#add-form [type="submit"]'); page.wait_for_selector('#spot-dialog #sd-title')
    assert page.locator('#toast').inner_text() == 'Saved changes to “Renamed Spot”', page.locator('#toast').inner_text()
    d = page.locator('#spot-dialog')
    assert page.locator('#sd-title').inner_text() == 'Renamed Spot'
    assert 'Great by the windows' in d.inner_text() and 'Usually busy' in d.inner_text()
    saved = page.evaluate("JSON.parse(localStorage.getItem('fake.spots')).find(s => s.dbId === 500)")
    assert saved['floor'] == 7 and saved['position'] == {'x': 40, 'y': 40}, saved
    assert saved['features']['wifi'] is False and saved['features']['foodAllowed'] is True and saved['busyness'] == 'Usually busy', saved
    page.locator('[data-sd-close]').first.click(); page.wait_for_selector('#spot-dialog', state='hidden')
    assert card('Renamed Spot').count() == 1 and card('Team Shared Spot').count() == 0
    assert '#edit-' not in page.url

    # Reloading on the edit page opens the form once spots load
    page.goto(BASE_URL + '/#edit-d500'); page.reload(); page.wait_for_selector('#add-form')
    assert page.input_value('#add-name') == 'Renamed Spot'
    # Going to Add a Spot from the menu gives an empty form, not the edit
    page.goto(BASE_URL + '/#add'); page.wait_for_selector('#add-form')
    assert page.input_value('#add-name') == '' and page.locator('h1', has_text='Add a spot').count() == 1

    # Everyone sees the change
    as_user('bob@byu.edu')
    assert card('Renamed Spot').count() == 1

    assert not errors, errors
    print('PASS: Edit button only for the admin on shared spots, students and logged-out visitors cannot open the edit page, form opens filled in, cancel drops changes, save updates the spot for everyone, reload on the edit page works; no uncaught errors')
    b.close()
