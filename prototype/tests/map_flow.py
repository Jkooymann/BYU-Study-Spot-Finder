"""Campus map browser regression checks. Start the prototype HTTP server first.
External requests are blocked; no shared data is changed.
"""
import os
from playwright.sync_api import sync_playwright
from sample_spots import use_sample_spots
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[]
 use_sample_spots(page)
 page.on('pageerror', lambda e: errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.goto(BASE_URL + '/#map',wait_until='networkidle')
 page.wait_for_selector('.campus-map')
 assert page.locator('.campus-map [data-building]').count()==page.evaluate('BUILDINGS.length')
 assert page.locator('.bldg-shape:not(path)').count()==0
 page.set_viewport_size({'width':390,'height':844});page.reload(wait_until='networkidle')
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert page.locator('.map-wrap').evaluate('(e)=>e.scrollLeft')>0
 page.set_viewport_size({'width':1440,'height':1100})
 page.locator('.campus-map [data-building="hbll"]').click()
 page.wait_for_url('**/#building-hbll')
 assert page.locator('#app h1').inner_text()=='Harold B. Lee Library'
 page.evaluate("App.go('map')");page.wait_for_selector('.campus-map')
 page.locator('.campus-map [data-building="wsc"]').focus();page.keyboard.press('Enter')
 page.wait_for_url('**/#building-wsc')
 page.evaluate("App.go('map-spot-s1')");page.wait_for_selector('.bldg.is-target')
 assert page.locator('.bldg.is-target').get_attribute('data-building')=='hbll'
 page.evaluate("() => {const f=Store.emptyFilters(); f.features.quietZone=true; Store.setFilters(f); App.go('map');}")
 page.wait_for_selector('.bldg.is-match');assert page.locator('.bldg.is-dim').count()>0
 # Every building retains the keyboard handoff, including empty buildings.
 for building_id in page.evaluate('BUILDINGS.map(b => b.id)'):
  page.evaluate("App.go('map')");page.wait_for_selector('.campus-map')
  page.locator('.campus-map [data-building="'+building_id+'"]').focus()
  page.keyboard.press('Space')
  page.wait_for_url('**/#building-'+building_id)
 page.evaluate("App.go('map')");page.wait_for_selector('.campus-map')
 page.emulate_media(color_scheme='dark')
 assert page.locator('.map-ground').evaluate('(e)=>getComputedStyle(e).fill')=='rgb(41, 54, 56)'
 page.evaluate("document.documentElement.dataset.theme='light'")
 assert page.locator('.map-ground').evaluate('(e)=>getComputedStyle(e).fill')=='rgb(210, 215, 213)'
 page.evaluate("document.documentElement.dataset.theme='dark'")
 assert page.locator('.map-ground').evaluate('(e)=>getComputedStyle(e).fill')=='rgb(41, 54, 56)'
 assert not errors,errors
 print('PASS: all building footprints, mouse/keyboard building navigation, selected spot, filters, mobile centering/overflow, dark mode; no uncaught errors')
 b.close()
