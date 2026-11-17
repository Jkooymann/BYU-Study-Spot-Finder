"""Outdoor campus placement, filters and shared spot views; no external writes."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://**/*', lambda route: route.abort())
    page.goto(BASE + '/#map')
    page.evaluate('localStorage.clear()'); page.reload()
    page.locator('[data-map-layer="outdoors"]').click()
    assert page.evaluate('Store.getFilters().setting') == 'outdoors'
    page.locator('a[href="#add-outdoors"]').click()
    page.locator('#add-name').fill('Courtyard tables')
    assert page.locator('[data-add-floor]').count() == 0
    page.locator('#add-form [type="submit"]').click()
    assert 'campus map' in page.locator('#add-loc-err').inner_text()
    svg = page.locator('#add-campus-plan svg')
    # Convert an illustration point to screen pixels, exercising real click handling.
    point = svg.evaluate("s => {const p = new DOMPoint(450,425).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y};}")
    page.mouse.click(point['x'], point['y'])
    pin = page.evaluate('AddState.campusPin')
    assert abs(pin['x']-50) < 0.1 and abs(pin['y']-50) < 0.1
    page.locator('#add-campus-plan').press('ArrowRight')
    assert page.evaluate('AddState.campusPin.x') > 50
    page.select_option('#add-building', 'hbll')
    assert page.evaluate('AddState.campusPin.x') > 50
    assert page.locator('[data-add-floor]').count() == 0
    page.select_option('#add-building', '')
    # Switching setting must not reinterpret campus coordinates as a floor pin.
    page.locator('[data-add-setting="indoors"]').click()
    assert page.evaluate('AddState.pin') is None
    page.locator('[data-add-setting="outdoors"]').click()
    assert page.evaluate('AddState.campusPin.x') > 50
    page.locator('#add-form [type="submit"]').click()
    page.wait_for_url('**/#list')
    spot = page.evaluate("Store.allSpots().find(s=>s.name==='Courtyard tables')")
    assert spot['building'] == '' and spot['floor'] is None and spot['position'] is None
    sid = spot['id']
    page.reload(); page.wait_for_selector('.spot-card')
    assert 'Courtyard tables' in page.locator('#app').inner_text()
    # Recommendation cards must render a buildingless outdoor location too.
    page.evaluate("Recommend.picks=[{spot:Store.allSpots()[0],reason:'Quiet outside'}];Recommend.state='ok';Recommend.render()")
    assert 'Outdoors' in page.locator('#ai-panel .ai-item-meta').inner_text()
    assert 'Floor' not in page.locator('#ai-panel .ai-item-meta').inner_text()
    page.locator('.spot-card [data-fav]').click()
    page.goto(BASE + '/#favorites'); page.wait_for_selector('.fav-item')
    assert 'Outdoors' in page.locator('.fav-item').inner_text()
    page.locator('.fav-name').click(); page.wait_for_selector('#spot-dialog:not([hidden])')
    assert 'Floor null' not in page.locator('#spot-dialog').inner_text()
    assert page.locator('#spot-dialog a[href^="#building-"]').count() == 0
    page.locator('#spot-dialog a[href="#map-spot-'+sid+'"]').click()
    page.wait_for_selector('.outdoor-marker.is-target')
    page.locator('.outdoor-marker').focus(); page.keyboard.press('Enter')
    page.wait_for_selector('#spot-dialog:not([hidden])')
    page.locator('#sd-close').click(); page.wait_for_selector('.outdoor-marker')
    # Clearing Outdoors on a selected map must actually return to buildings.
    page.locator('[data-remove-filter="setting"]').click()
    assert page.locator('[data-map-layer="buildings"]').get_attribute('aria-pressed') == 'true'
    # Legacy floor pin and optional nearby building survive without fake campus pins.
    page.evaluate("""async () => {
      const base = {features:{outdoors:true,wifi:true},groupSize:'solo',busyness:'Moderate',description:''};
      await Store.addUserSpot({...base,name:'Indoor desk',features:{wifi:true},building:'hbll',floor:1,position:{x:25,y:25}});
      await Store.addUserSpot({...base,name:'Legacy outside',building:'hbll',floor:1,position:{x:25,y:25}});
      await Store.addUserSpot({...base,name:'Near library',building:'hbll',floor:null,position:null,campusPosition:{x:55,y:60}});
      const f=Store.emptyFilters();f.setting='outdoors';f.features.wifi=true;f.building='hbll';f.groupSize='solo';Store.setFilters(f);App.go('map');
    }""")
    page.wait_for_selector('.outdoor-marker')
    assert page.locator('.outdoor-marker').count() == 1
    assert 'Legacy outside' in page.locator('#app').inner_text()
    assert 'Campus pin needed' in page.locator('#app').inner_text()
    assert page.locator('.spot-card').count() == 2
    page.locator('[data-map-layer="buildings"]').click()
    assert page.evaluate('Store.getFilters()') == {'features':page.evaluate('Store.getFilters().features'),'setting':'','building':'hbll','groupSize':'solo'}
    assert page.evaluate('Store.getFilters().features.wifi')
    page.locator('[data-map-layer="outdoors"]').click()
    page.locator('[data-open-filters]').click()
    page.locator('[data-fp-setting="indoors"]').click()
    page.locator('[data-fp-apply]').click()
    assert page.locator('[data-map-layer="buildings"]').get_attribute('aria-pressed') == 'true'
    assert page.evaluate('Store.getFilters().setting') == 'indoors'
    page.locator('[data-open-filters]').click()
    page.locator('[data-fp-setting="outdoors"]').click()
    page.locator('[data-fp-apply]').click()
    assert page.locator('[data-map-layer="outdoors"]').get_attribute('aria-pressed') == 'true'
    # A selected spot is still locatable when other filters exclude it.
    page.goto(BASE + '/#map-spot-' + sid)
    page.wait_for_selector('.outdoor-marker.is-target')
    assert 'does not match' in page.locator('#map-selected').inner_text()
    page.locator('[data-clear-filters]').click()
    assert page.locator('[data-map-layer="buildings"]').get_attribute('aria-pressed') == 'true'
    page.set_viewport_size({'width':390,'height':844})
    page.goto(BASE + '/#add-outdoors'); page.wait_for_selector('#add-campus-plan')
    page.locator('#add-campus-plan').focus(); page.keyboard.press('ArrowLeft')
    assert page.evaluate('AddState.campusPin.x') == 49
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
    print('PASS: outdoor creation/reload, campus coordinates, keyboard placement, filters, favorites, details, legacy pins and mobile layout')
