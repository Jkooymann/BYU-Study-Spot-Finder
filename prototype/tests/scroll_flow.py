"""Map <-> building <-> floor navigation keeps your place instead of jumping to the top.
Run: cd prototype && python3 -m http.server 8000 & python3 tests/scroll_flow.py
"""
import os
from playwright.sync_api import sync_playwright
from sample_spots import use_sample_spots

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
STATE = "() => ({ h: location.hash, y: Math.round(scrollY), mx: document.querySelector('.map-wrap')?.scrollLeft ?? null })"
CLICK_BLDG = "(id) => document.querySelector(`[data-building=\"${id}\"] .bldg-shape`).dispatchEvent(new MouseEvent('click', { bubbles: true }))"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    use_sample_spots(page)
    page.route('https://**/*', lambda r: r.abort())
    page.goto(BASE_URL + '/#map'); page.wait_for_selector('.map-wrap')
    page.evaluate("() => { scrollTo(0, 700); document.querySelector('.map-wrap').scrollLeft = 120; }")
    start = page.evaluate(STATE)
    assert start['y'] == 700 and start['mx'] == 120, start

    page.evaluate(CLICK_BLDG, 'hbll'); page.wait_for_selector('.floor-tabs')
    assert page.evaluate(STATE)['h'] == '#building-hbll'
    # The floor tabs and plan come before the group/filter toolbar so they're above the fold.
    assert page.evaluate("() => document.querySelector('.floorplan-card').getBoundingClientRect().top < innerHeight")

    page.evaluate('() => scrollTo(0, 300)')
    page.evaluate("() => document.querySelector('.floor-tab:nth-child(4)').click()"); page.wait_for_url('**/#building-hbll-f4')
    assert page.evaluate(STATE)['y'] == 300, 'switching floors should not jump to the top'

    page.click('[data-back-map]'); page.wait_for_selector('.map-wrap')
    s = page.evaluate(STATE)
    assert s['y'] == 700 and s['mx'] == 120, ('Back to map should return to the same spot', s)

    page.evaluate(CLICK_BLDG, 'jfsb'); page.wait_for_url('**/#building-jfsb')
    page.go_back(); page.wait_for_selector('.map-wrap')
    s = page.evaluate(STATE)
    assert s['y'] == 700 and s['mx'] == 120, ('browser Back should return to the same spot', s)

    page.click('a.nav-link[href="#list"]'); page.wait_for_url('**/#list')
    page.wait_for_selector('.results-bar')
    assert page.evaluate(STATE)['y'] == 0, ('other pages still open at the top', page.evaluate(STATE))
    assert not errors, errors
    b.close()
print('PASS: map -> building keeps map position, floor switches keep scroll, Back to map / browser Back restore map scroll + pan')
