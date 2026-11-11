"""Empty floor navigation and pin entry, using isolated local browser storage."""
import os
from playwright.sync_api import sync_playwright
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('https://**/*', lambda route: route.abort())
    page.goto(BASE_URL + '/#map')
    assert page.locator('.campus-map [data-building]').count() == page.evaluate('BUILDINGS.length')
    assert page.locator('[data-building="mb"]').get_attribute('aria-label').startswith('Music Building:')
    for building_id in ['arts', 'lsb', 'eb', 'cb', 'marb', 'rb', 'canc', 'mb']:
        page.evaluate("App.go('map')")
        page.wait_for_selector('.campus-map')
        page.locator('[data-building="' + building_id + '"]').focus()
        page.keyboard.press('Enter')
        page.wait_for_url('**/#building-' + building_id)
        page.wait_for_selector('.floor-tab')
        floors = page.evaluate('(id) => buildingById(id).floors', building_id)
        assert page.locator('.floor-tab').count() == len(floors)
        for floor in floors:
            page.locator('.floor-tab[href="#building-' + building_id + '-f' + str(floor) + '"]').click()
            page.wait_for_url('**/#building-' + building_id + '-f' + str(floor))
            assert page.locator('.fp-outline').count() == 1
            assert page.locator('.fp-marker').count() == 0
        page.locator('a[href="#add-' + building_id + '-f' + str(floors[-1]) + '"]').click()
        page.wait_for_selector('#add-form')
        assert page.locator('#add-building').input_value() == building_id
        assert page.evaluate('AddState.floor') == floors[-1]
        page.locator('#add-name').fill('Browser test spot')
        page.locator('#add-plan .fp-outline').click()
        assert page.locator('#add-plan .fp-pin').count() == 1
        page.locator('#add-form [type="submit"]').click()
        page.wait_for_url('**/#list')
        page.evaluate('(r) => App.go(r)', 'building-' + building_id + '-f' + str(floors[-1]))
        page.wait_for_selector('.fp-marker')
        page.reload(); page.wait_for_selector('.fp-marker')
        assert page.locator('.fp-marker').count() == 1
    assert not errors, errors
    browser.close()
    print('PASS: All clickable buildings; all floors in ARTS/LSB/EB/CB/MARB/RB/CANC/MB work without spots; selected-floor handoff, pin add and reload persistence passed locally')
