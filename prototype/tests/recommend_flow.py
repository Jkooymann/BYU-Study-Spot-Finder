"""Browser checks for the AI "Suggest spots" button (js/recommend.js).
Run with a local prototype server (same setup as ui_flow.py):
    python3 prototype/tests/recommend_flow.py
js/db.js is replaced with an in-memory fake (the Edge Function is faked too),
so no AI calls are made and external requests are blocked.
"""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')

FAKE_DB = """
const DB = (() => {
  const load = (k, d) => JSON.parse(localStorage.getItem('fake.' + k) || JSON.stringify(d));
  const save = (k, v) => localStorage.setItem('fake.' + k, JSON.stringify(v));
  window.aiCalls = [];
  return {
    ready: true,
    async students() { return []; },
    async favoriteSpotIds(uid) { return load('favs', {})[uid] || []; },
    async addFavorite(uid, sid) { const f = load('favs', {}); f[uid] = (f[uid] || []).concat(sid); save('favs', f); },
    async removeFavorite(uid, sid) { const f = load('favs', {}); f[uid] = (f[uid] || []).filter((x) => x !== sid); save('favs', f); },
    async studentSpots() { return []; },
    async buildings() { return []; },
    async signIn() { save('session', 'jane@byu.edu'); return {}; },
    async signOut() { save('session', null); },
    async currentStudent() { return load('session', null) ? { user_id: 10, display_name: 'Jane', byu_net_id: 'jane' } : null; },
    async recommendSpots(spotIds) {
      window.aiCalls.push(spotIds);
      const mode = load('aiMode', 'ok');
      await new Promise((r) => setTimeout(r, 150));
      if (mode === 'limit') return { status: 'rate_limited', scope: 'hour' };
      if (mode === 'fail') throw new Error('network');
      // 9999 is a spot this page doesn't have (deleted / not loaded): it must be skipped.
      return { status: 'ok', cached: false, recommendations: [
        { spot_id: 9999, reason: 'Ghost spot' },
        { spot_id: 4, reason: 'Quiet like <b>your</b> library picks.' },
        { spot_id: 13, reason: 'Another calm HBLL nook.' },
      ] };
    },
  };
})();"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/js/db.js', lambda r: r.fulfill(content_type='application/javascript', body=FAKE_DB))
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#start')
    page.evaluate("localStorage.clear()")
    page.reload(); page.wait_for_selector('.start-chips')

    # The button is on every page.
    for route in ['start', 'map', 'list', 'favorites', 'add', 'login']:
        page.goto(BASE_URL + '/#' + route); page.wait_for_timeout(50)
        assert page.locator('#ai-fab').is_visible(), route

    # Logged out: asks to log in, no AI call.
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('.spot-card')
    page.click('#ai-fab'); page.wait_for_selector('#ai-panel:not([hidden])')
    assert 'Log in' in page.locator('#ai-panel').inner_text()
    page.keyboard.press('Escape'); assert page.locator('#ai-panel').is_hidden()

    # Logged in, no favorites: asks to save some first, no AI call.
    page.evaluate("localStorage.setItem('fake.session', JSON.stringify('jane@byu.edu'))")
    page.reload(); page.wait_for_selector('.spot-card'); page.wait_for_timeout(100)
    page.click('#ai-fab')
    assert 'Save a few favorites first' in page.locator('#ai-panel').inner_text()
    assert page.evaluate('window.aiCalls.length') == 0
    page.click('#ai-panel a[href="#list"]'); assert page.locator('#ai-panel').is_hidden()

    # Favorite a spot: the panel shows suggestions, skips unknown ids, escapes text, links to spots.
    page.click('.spot-card[data-open-spot="s3"] [data-fav]'); page.wait_for_timeout(100)
    page.click('#ai-fab')
    page.wait_for_selector('#ai-panel .ai-loading')
    page.wait_for_selector('#ai-panel .ai-item')
    items = page.locator('#ai-panel .ai-item')
    assert items.count() == 2, items.count()
    assert 'Ghost' not in page.locator('#ai-panel').inner_text()
    assert '<b>your</b>' in items.first.inner_text()  # shown as text, not HTML
    assert 'Based on your 1 favorite' in page.locator('#ai-panel').inner_text()
    sent = page.evaluate('window.aiCalls[0]')
    assert 3 in sent and len(sent) >= 26, len(sent)
    items.first.click(); page.wait_for_selector('#spot-dialog:not([hidden])')
    assert page.locator('#ai-panel').is_hidden()
    assert page.url.endswith('#spot-s4'), page.url
    page.click('#sd-close'); page.wait_for_selector('#spot-dialog', state='hidden')

    # Reopening with the same favorites doesn't ask the AI again.
    page.click('#ai-fab'); page.wait_for_selector('#ai-panel .ai-item')
    assert page.evaluate('window.aiCalls.length') == 1
    page.click('[data-ai-close]')

    # Rate limit and failure messages.
    page.evaluate("localStorage.setItem('fake.aiMode', JSON.stringify('limit'))")
    page.click('.spot-card[data-open-spot="s1"] [data-fav]'); page.wait_for_timeout(100)
    page.click('#ai-fab'); page.wait_for_selector('#ai-panel .ai-msg:not(.ai-loading)')
    assert 'this hour' in page.locator('#ai-panel').inner_text()
    page.click('[data-ai-close]')
    page.evaluate("localStorage.setItem('fake.aiMode', JSON.stringify('fail'))")
    page.click('.spot-card[data-open-spot="s2"] [data-fav]'); page.wait_for_timeout(100)
    page.click('#ai-fab'); page.wait_for_selector('[data-ai-retry]')
    page.evaluate("localStorage.setItem('fake.aiMode', JSON.stringify('ok'))")
    page.click('[data-ai-retry]'); page.wait_for_selector('#ai-panel .ai-item')
    page.click('[data-ai-close]')

    # Phone: button doesn't cause sideways scroll, panel fits the screen, nav stays clickable.
    page.set_viewport_size({'width': 375, 'height': 667})
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('.spot-card')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    fab = page.locator('#ai-fab').bounding_box()
    assert fab['width'] <= 56 and fab['x'] + fab['width'] <= 375
    page.click('#ai-fab'); page.wait_for_selector('#ai-panel .ai-item')
    box = page.locator('#ai-panel').bounding_box()
    assert box['x'] >= 0 and box['x'] + box['width'] <= 375 and box['y'] > 0, box
    nav = page.locator('.topbar').bounding_box()
    assert box['y'] >= nav['y'] + nav['height'], (box, nav)
    page.screenshot(path=os.environ.get('SHOT', '/tmp/ai_panel_phone.png'))
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.goto(BASE_URL + '/#list'); page.wait_for_selector('.spot-card')
    page.click('#ai-fab'); page.wait_for_selector('#ai-panel .ai-item')
    page.screenshot(path=os.environ.get('SHOT_DESKTOP', '/tmp/ai_panel_desktop.png'))

    assert not errors, errors
    b.close()
    print('recommend flow OK')
