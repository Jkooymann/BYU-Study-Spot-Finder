"""Browser checks for private and shared spots: what each person sees, the
"Only you" label, the Add a Spot note and message, and who gets a delete button.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/spot_visibility_flow.py
js/db.js is replaced with an in-memory fake that follows the same rules as the
database policies in supabase/migrations/*_private_and_shared_spots.sql. The
policies themselves are tested against Postgres, not here; this only checks the
pages show the right things.
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
    id: 'd' + dbId, dbId, name, building: 'wsc', floor: 1, room: '', position: { x: 40, y: 40 }, campusPosition: null,
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
    def add_menu_description():
        page.click('#home-btn')
        description = page.locator('#home-menu [data-menu-route="add"] .menu-item-sub').inner_text()
        page.keyboard.press('Escape')
        return description
    def card(name):
        return page.locator('.spot-card', has_text=name)
    def open_details(name):
        card(name).click(); page.wait_for_selector('#spot-dialog #sd-title')
        return page.locator('#spot-dialog')
    def close_details():
        page.locator('[data-sd-close]').first.click(); page.wait_for_selector('#spot-dialog', state='hidden')
    def add_spot(name):
        page.goto(BASE_URL + '/#add-wsc'); page.wait_for_selector('#add-form')
        note = page.locator('#app').inner_text()
        page.fill('#add-name', name); page.click('#add-plan .fp-outline'); page.click('[data-add-tag="wifi"]')
        page.click('#add-form [type="submit"]'); page.wait_for_url('**/#list'); page.wait_for_selector('.spot-card.is-flash')
        return note, page.locator('#toast').inner_text()

    # Logged out: shared spots only, no labels, no delete buttons
    as_user(None)
    assert add_menu_description() == 'Save a spot you love'
    assert card('Team Shared Spot').count() == 1 and card('Alice Secret Spot').count() == 0
    assert page.locator('.private-badge').count() == 0
    page.goto(BASE_URL + '/#add'); page.wait_for_selector('#app')
    assert 'Spots you add are private to your account' in page.locator('#app').inner_text()

    # Alice: her private spot (labelled) + shared; can delete hers, not the shared one
    as_user('alice@byu.edu')
    assert add_menu_description() == 'Save a spot you love'
    assert card('Alice Secret Spot').locator('.private-badge').inner_text().strip() == 'Only you'
    assert card('Team Shared Spot').locator('.private-badge').count() == 0
    d = open_details('Team Shared Spot')
    assert d.locator('[data-sd-delete]').count() == 0 and d.locator('.sd-private').count() == 0
    close_details()
    d = open_details('Alice Secret Spot')
    assert 'only you can see this spot' in d.locator('.sd-private').inner_text()
    d.locator('[data-sd-delete]').click()
    assert 'removed from your account' in d.inner_text()
    d.locator('[data-sd-delete-cancel]').click(); close_details()
    note, msg = add_spot('Alice New Spot')
    assert 'This spot will be private' in note, note
    assert msg == 'Added “Alice New Spot” to your private spots', msg
    assert card('Alice New Spot').locator('.private-badge').count() == 1

    # Bob: sees neither of Alice's private spots
    as_user('bob@byu.edu')
    assert card('Alice Secret Spot').count() == 0 and card('Alice New Spot').count() == 0
    assert card('Team Shared Spot').count() == 1

    # Jason (admin): adds shared spots, can delete shared spots, doesn't see Alice's
    as_user('jason@byu.edu')
    assert add_menu_description() == 'Share a spot you love'
    assert card('Alice Secret Spot').count() == 0
    note, msg = add_spot('Admin Shared Spot')
    assert 'shared with everyone' in note and '(team admin)' in note, note
    assert msg == 'Added “Admin Shared Spot” for everyone', msg
    assert card('Admin Shared Spot').locator('.private-badge').count() == 0
    d = open_details('Team Shared Spot')
    assert 'Delete shared spot' in d.locator('[data-sd-delete]').inner_text()
    d.locator('[data-sd-delete]').click()
    assert 'Delete this shared spot?' in d.inner_text() and 'removed for everyone' in d.inner_text()
    d.locator('[data-sd-delete-confirm]').click(); page.wait_for_selector('#spot-dialog', state='hidden')
    assert card('Team Shared Spot').count() == 0

    # Everyone sees the admin's new spot, including logged-out visitors
    as_user(None)
    assert card('Admin Shared Spot').count() == 1 and card('Alice New Spot').count() == 0
    as_user('bob@byu.edu')
    assert card('Admin Shared Spot').count() == 1

    assert not errors, errors
    print('PASS: logged-out sees shared only, private "Only you" label, add note + message for students and the admin, delete buttons (own private, admin shared), other students and the admin cannot see private spots; no uncaught errors')
    b.close()
