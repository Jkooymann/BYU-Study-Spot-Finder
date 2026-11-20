"""Browser checks for the Admin Page (#okr): its name, the Users table (add / view / edit /
delete), that students and logged-out visitors can't use it, and that Log out clears cookies,
sessionStorage and the site's localStorage.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/admin_users_flow.py
js/db.js is replaced with an in-memory fake that follows the same rules as
supabase/migrations/*_admin_manage_users.sql (tested against Postgres in
supabase/tests/admin_manage_users_rls.py); this only checks the pages.
"""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
SHOTS = os.environ.get('SHOTS_DIR')

FAKE_DB = """
const DB = (() => {
  const load = (k, d) => JSON.parse(localStorage.getItem('fake.' + k) || JSON.stringify(d));
  const save = (k, v) => localStorage.setItem('fake.' + k, JSON.stringify(v));
  if (!localStorage.getItem('fake.users')) save('users', [
    { user_id: 1, byu_email: 'jason@byu.edu', display_name: 'Jason', byu_net_id: 'jason', is_admin: true, has_login: true, favorite_count: 0, account_created_at: '2026-10-01T10:00:00Z' },
    { user_id: 2, byu_email: 'alice@byu.edu', display_name: 'Alice', byu_net_id: 'alice', is_admin: false, has_login: true, favorite_count: 3, account_created_at: '2026-10-05T10:00:00Z' },
    { user_id: 3, byu_email: 'bob@byu.edu', display_name: 'Bob', byu_net_id: 'bob', is_admin: false, has_login: true, favorite_count: 1, account_created_at: '2026-11-02T10:00:00Z' },
  ]);
  const users = () => load('users', []);
  const me = () => users().find((u) => u.byu_email === load('session', null)) || null;
  const err = (message, code) => Object.assign(new Error(message), { code });
  const needAdmin = () => { window.__adminCalls = (window.__adminCalls || 0) + 1; if (load('fail', null)) throw err('Failed to fetch'); if (!(me() && me().is_admin)) throw err('Only the team admin can manage users.', '42501'); };
  const taken = (field, value, except) => users().some((u) => u[field] === value && u.user_id !== except);
  return {
    ready: true,
    async students() { return []; }, async buildings() { return []; }, async studentSpots() { return []; },
    async favoriteSpotIds() { return []; }, async addFavorite() {}, async removeFavorite() {},
    async signOut() { save('session', null); },
    async currentStudent() { const m = me(); return m ? { user_id: m.user_id, display_name: m.display_name, byu_net_id: m.byu_net_id, email: m.byu_email, isAdmin: m.is_admin } : null; },
    async adminListUsers() { needAdmin(); return users().slice().reverse(); },
    async adminCreateUser({ email, password, displayName, netId }) {
      needAdmin(); window.__lastCreate = { email, password, displayName, netId };
      if (taken('byu_email', email)) throw err('An account with that email already exists.', '23505');
      const id = Math.max(...users().map((u) => u.user_id)) + 1;
      save('users', users().concat({ user_id: id, byu_email: email, display_name: displayName, byu_net_id: netId || email.split('@')[0], is_admin: false, has_login: true, favorite_count: 0, account_created_at: '2026-11-20T01:00:00Z' }));
      return id;
    },
    async adminUpdateUser(id, { displayName, netId, email, newPassword }) {
      needAdmin(); window.__lastUpdate = { id, displayName, netId, email, newPassword };
      if (taken('byu_net_id', netId, id)) throw err('That Net ID is already used by another account.', '23505');
      save('users', users().map((u) => (u.user_id === id ? { ...u, display_name: displayName, byu_net_id: netId, byu_email: email } : u)));
    },
    async adminDeleteUser(id) {
      needAdmin();
      if (users().find((u) => u.user_id === id && u.is_admin)) throw err("You can't delete the admin account.", '42501');
      save('users', users().filter((u) => u.user_id !== id));
    },
  };
})();"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=2 if SHOTS else 1); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/js/db.js*', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#start'); page.evaluate('localStorage.clear()')

    def as_user(email, hash_='okr'):
        page.evaluate(f"localStorage.setItem('fake.session', JSON.stringify({'null' if email is None else repr(email)}))")
        page.goto(BASE_URL + '/#' + hash_); page.reload()
        page.wait_for_function('Store.sharedStatus() === "ok"')
    def menu_labels():
        page.click('#home-btn'); labels = page.locator('#home-menu .menu-item-label').all_inner_texts(); page.click('#home-btn')
        return labels
    text = lambda sel: page.locator(sel).inner_text()
    row = lambda name: page.locator('.admin-users-table tbody tr', has_text=name)
    names = lambda: page.locator('.admin-users-name').all_inner_texts()

    # ---------------- Students and logged-out visitors ----------------
    for who in [None, 'alice@byu.edu']:
        as_user(who)
        page.wait_for_selector('.empty-title')
        assert 'Admin Page' not in menu_labels(), who
        assert page.locator('#admin-users').count() == 0 and 'Admin Page' in text('#app'), who
        assert page.evaluate('window.__adminCalls || 0') == 0, who     # page never asks for users
        # Forcing the request: the database refuses.
        res = page.evaluate("DB.adminListUsers().then(() => 'got users', (e) => e.code)")
        assert res == '42501', (who, res)

    # ---------------- Admin: page name, no Admin Portal button, Read ----------------
    as_user('jason@byu.edu')
    assert menu_labels()[-1] == 'Admin Page'
    page.wait_for_selector('.admin-users-table')
    assert text('.page-hero h1') == 'Admin Page' and 'Admin Page' in page.title()
    assert page.locator('text=Admin Portal').count() == 0 and page.locator('a[href*="localhost"]').count() == 0
    assert page.locator('.okr-grid').count() == 1, 'OKR cards stay above the users'
    order = page.evaluate("[...document.querySelectorAll('.okr-grid, #admin-users')].map((e) => e.id || 'okr')")
    assert order == ['okr', 'admin-users'], order
    assert names() == ['Bob', 'Alice', 'Jason'] and '3 users' in text('#admin-users-title')
    assert 'alice@byu.edu' in text('.admin-users-table') and 'Admin' in row('Jason').inner_text()
    assert row('Jason').locator('[data-au-delete]').count() == 0, 'no Delete on the admin account'
    if SHOTS: page.locator('#admin-users').screenshot(path=f'{SHOTS}/admin-users-desktop.png')

    # ---------------- Create ----------------
    page.click('[data-au-new]'); page.wait_for_selector('#admin-users-form')
    assert page.evaluate('document.activeElement.id') == 'au-displayName'
    page.click('#admin-users-form [type=submit]')
    assert page.locator('#au-displayName-error').is_visible() and page.locator('#au-password-error').is_visible()
    assert page.evaluate('document.activeElement.id') == 'au-displayName'
    page.fill('#au-displayName', '  Carla   Diaz '); page.fill('#au-email', 'Carla@BYU.edu'); page.fill('#au-password', 'short')
    page.click('#admin-users-form [type=submit]')
    assert page.locator('#au-password-error').is_visible() and not page.locator('#au-email-error').is_visible()
    # Coming back to the tab redraws the page: what was typed stays.
    page.evaluate('App.refresh()')
    assert page.input_value('#au-displayName') == 'Carla Diaz' and page.input_value('#au-email') == 'carla@byu.edu'
    page.fill('#au-password', 'longpassword1')
    if SHOTS: page.locator('#admin-users').screenshot(path=f'{SHOTS}/admin-users-add-form.png')
    page.click('#admin-users-form [type=submit]')
    page.wait_for_function("document.querySelectorAll('.admin-users-name').length === 4")
    assert page.evaluate('window.__lastCreate') == {'email': 'carla@byu.edu', 'password': 'longpassword1', 'displayName': 'Carla Diaz', 'netId': ''}
    assert names()[0] == 'Carla Diaz' and 'Added Carla Diaz' in text('#toast') and page.locator('#admin-users-form').count() == 0
    # Duplicate email: friendly message from the database, form stays open.
    page.click('[data-au-new]'); page.fill('#au-displayName', 'Again'); page.fill('#au-email', 'alice@byu.edu'); page.fill('#au-password', 'longpassword1')
    page.click('#admin-users-form [type=submit]'); page.wait_for_selector('#admin-users-form .account-message:not([hidden])')
    assert 'already exists' in text('#admin-users-form .account-message') and page.input_value('#au-password') == ''
    page.click('[data-au-cancel]'); assert page.locator('#admin-users-form').count() == 0

    # ---------------- Update ----------------
    row('Bob').locator('[data-au-edit]').click(); page.wait_for_selector('#admin-users-form')
    assert 'Edit Bob' in text('#au-form-title') and page.input_value('#au-email') == 'bob@byu.edu' and page.input_value('#au-netId') == 'bob'
    assert 'is-editing' in (row('Bob').get_attribute('class') or '')
    page.fill('#au-netId', 'alice'); page.click('#admin-users-form [type=submit]')
    page.wait_for_selector('#admin-users-form .account-message:not([hidden])')
    assert 'Net ID is already used' in text('#admin-users-form .account-message')
    page.fill('#au-displayName', 'Robert'); page.fill('#au-netId', 'robert'); page.fill('#au-email', 'robert@byu.edu')
    page.click('#admin-users-form [type=submit]')
    page.wait_for_selector('.admin-users-table tbody tr:has-text("Robert")')
    assert page.evaluate('window.__lastUpdate') == {'id': 3, 'displayName': 'Robert', 'netId': 'robert', 'email': 'robert@byu.edu', 'newPassword': ''}
    assert 'robert@byu.edu' in row('Robert').inner_text() and 'Bob' not in names()
    row('Alice').locator('[data-au-edit]').click(); page.fill('#au-password', 'abc'); page.click('#admin-users-form [type=submit]')
    assert page.locator('#au-password-error').is_visible(), 'short new password refused'
    page.click('[data-au-cancel]')

    # ---------------- Delete ----------------
    row('Alice').locator('[data-au-delete]').click()
    assert 'Delete Alice?' in row('Alice').inner_text()
    page.click('[data-au-delete-no]'); assert row('Alice').locator('[data-au-delete]').count() == 1
    row('Alice').locator('[data-au-delete]').click(); page.click('[data-au-delete-yes]')
    page.wait_for_function("![...document.querySelectorAll('.admin-users-name')].some((e) => e.textContent === 'Alice')")
    assert 'Deleted Alice' in text('#toast') and names() == ['Carla Diaz', 'Robert', 'Jason']

    # ---------------- Errors ----------------
    page.evaluate("localStorage.setItem('fake.fail', 'true')")
    page.evaluate('AdminUsers.load()'); page.wait_for_selector('.admin-users-error')
    assert 'couldn’t reach the server' in text('.admin-users-error')
    page.evaluate("localStorage.removeItem('fake.fail')"); page.click('[data-au-reload]'); page.wait_for_selector('.admin-users-table')

    # ---------------- Phone width ----------------
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'no sideways scroll on phones'
    assert row('Robert').locator('td[data-label="Email"]').is_visible()
    if SHOTS: page.locator('#admin-users').screenshot(path=f'{SHOTS}/admin-users-phone.png')
    page.set_viewport_size({'width': 1280, 'height': 900})

    # ---------------- Log out clears cookies and stored data ----------------
    page.evaluate("""document.cookie = 'test_cookie=1; path=/'; sessionStorage.setItem('byuStudySpots.okrSession', '{}');
      localStorage.setItem('sb-abc-auth-token', 'secret'); Store.setFilters({ ...Store.getFilters(), building: 'hbll' }); Store.setPref('sort', 'name');""")
    assert 'test_cookie' in page.evaluate('document.cookie')
    page.evaluate("AccountSession.signOut()"); page.wait_for_function("location.hash === '#start' && !Store.currentStudent()")
    left = page.evaluate("""({ cookie: document.cookie, session: sessionStorage.length,
      site: Object.keys(localStorage).filter((k) => k.startsWith('byuStudySpots.') || k.startsWith('sb-')),
      filters: Store.getFilters().building, sort: Store.pref('sort', 'default'), admin: AdminUsers.state.status })""")
    assert left == {'cookie': '', 'session': 0, 'site': [], 'filters': '', 'sort': 'default', 'admin': 'idle'}, left
    assert 'logged out' in text('#toast')
    page.goto(BASE_URL + '/#okr'); page.wait_for_selector('.empty-title')
    assert page.locator('#admin-users').count() == 0, 'users table gone after logout'

    assert not errors, errors
    b.close()
print('PASS: Admin Page name + menu, no Admin Portal button, OKRs above Users; students/logged-out get no table and the database refuses them; admin lists, adds (validation, kept across redraw, duplicate email), edits (taken Net ID, short password), deletes (confirm/cancel, not the admin), load error + retry; phone layout has no sideways scroll; Log out clears cookies, sessionStorage, Supabase login and site localStorage; no uncaught errors')
