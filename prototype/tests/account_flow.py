"""Run with a local prototype server; requires Python Playwright and Chromium.
All external requests are blocked and js/db.js is replaced with an in-memory
fake, so no real Supabase accounts are created.
Set CONFIRM=1 to simulate Supabase's "Confirm email" setting being on.
"""
import os
from playwright.sync_api import sync_playwright
from sample_spots import use_sample_spots

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
CONFIRM = 'true' if os.environ.get('CONFIRM') == '1' else 'false'

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
    use_sample_spots(page)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/js/db.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#list')
    page.evaluate('localStorage.clear()'); page.reload()

    # Logged out: whole site works, Log in button in the corner, favorites ask for a login.
    page.wait_for_selector('.spot-card')
    assert page.locator('.spot-card').count() == 26
    assert page.locator('.login-btn').inner_text() == 'Log in'
    page.locator('.spot-card [data-fav]').first.click()
    assert 'Log in to save favorites' in page.locator('#toast').inner_text()
    page.locator('.login-btn').click(); page.wait_for_url('**/#welcome'); page.wait_for_selector('a[href="#signup"]')
    page.get_by_role('link', name='Create an account', exact=True).click()

    def fill(name='Jane Smith', net=' JSmith@BYU.edu ', confirm='valid-password'):
        page.locator('#account-name').fill(name)
        page.locator('#account-netid').fill(net)
        page.locator('#account-password').fill('valid-password')
        page.locator('#account-confirm').fill(confirm)
    def submit(label): page.get_by_role('button', name=label, exact=True).click()

    # Validation
    fill(name=''); submit('Create account')
    assert page.locator('#account-name').get_attribute('aria-invalid') == 'true'
    fill(confirm='mismatch'); submit('Create account')
    assert page.locator('#account-confirm').get_attribute('aria-invalid') == 'true'
    fill(net='test@gmail.com'); submit('Create account')
    assert page.locator('#account-netid').get_attribute('aria-invalid') == 'true'
    fill(); page.get_by_role('button', name='Show', exact=True).click()
    assert page.locator('#account-password').get_attribute('type') == 'text'
    page.get_by_role('button', name='Hide', exact=True).click()

    # Sign up -> Log in page (not logged in yet), Net ID pre-filled
    submit('Create account'); page.wait_for_url('**/#login'); page.wait_for_selector('.account-success')  # wait for the page to redraw, not just the URL
    call = page.evaluate("window.fakeCalls.find((c) => c[0] === 'signUp')[1]")
    assert call == {'email': 'jsmith@byu.edu', 'netId': 'jsmith', 'password': 'valid-password', 'displayName': 'Jane Smith'}, call
    assert page.locator('.account-success').is_visible()
    assert page.locator('#account-netid').input_value() == 'jsmith'
    assert page.locator('.login-btn').inner_text() == 'Log in'

    # Wrong password, then right password -> name in the corner
    page.locator('#account-password').fill('nope'); submit('Log in')
    assert 'don’t match' in page.locator('#account-message').inner_text()
    page.locator('#account-password').fill('valid-password'); submit('Log in')
    page.wait_for_url('**/#start'); page.wait_for_selector('#account-btn')
    assert page.locator('#account-btn').inner_text() == 'Jane Smith'

    # Favorites are saved for this account and survive a reload
    page.evaluate("App.go('list')"); page.wait_for_selector('.spot-card')
    page.locator('.spot-card [data-fav]').first.click()
    page.evaluate("App.go('favorites')"); page.wait_for_selector('.fav-item')
    page.reload(); page.wait_for_selector('.fav-item')
    assert page.locator('.fav-item').count() == 1
    assert page.locator('#account-btn').inner_text() == 'Jane Smith'

    # Logged in users skip the account pages; Log out from the name menu
    page.evaluate("App.go('login')"); page.wait_for_url('**/#start')
    page.locator('#account-btn').click(); page.locator('[data-sign-out]').click()
    page.wait_for_selector('.login-btn:has-text("Log in")')
    page.evaluate("App.go('favorites')"); page.wait_for_selector('#app h1')
    assert page.locator('.fav-item').count() == 0

    # Duplicate sign-up
    page.evaluate("App.go('signup')"); page.wait_for_selector('#signup-form')
    fill(); submit('Create account')
    assert 'already exists' in page.locator('#account-message').inner_text()

    for width in [390, 1280]:
        page.set_viewport_size({'width': width, 'height': 850})
        page.evaluate("App.go('signup')"); page.wait_for_selector('#signup-form')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: open site, login prompt for favorites, validation, sign-up -> log in, name in corner, per-account favorites, reload, log out, duplicate account, mobile/desktop overflow; no uncaught errors')
    b.close()
