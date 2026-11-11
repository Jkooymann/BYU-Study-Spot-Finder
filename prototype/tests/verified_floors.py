"""Team-provided floor labels, basement routing, and local pin persistence."""
import os
from playwright.sync_api import sync_playwright
EXPECTED = {"arts": [1, 2, 3, 4], "bnsn": ["B", 1, 2, 3, 4, 5], "canc": [1], "cb": [1, 2, 3, 4, 5], "ctb": [1, 2, 3, 4, 5, 6, 7, 8, 9], "eb": [1, 2, 3, 4, 5], "esc": ["B", 1, 2, 3, 4, 5, 6], "hbll": [1, 2, 3, 4, 5, 6, 7, 8], "hrcb": [1, 2], "jfsb": ["B", 1, 2, 3, 4, 5], "jkb": [1, 2, 3, 4, 5, 6, 7, 8], "jrcb": ["B", 1, 2, 3, 4, 5], "jsb": [1, 2, 3], "kmbl": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "lsb": [1, 2, 3, 4, 5, 6, 7], "marb": [1, 2, 3], "mb": [1, 2, 3, 4], "mckb": [1, 2, 3], "rb": [1, 2, 3], "snlb": [1, 2], "tmcb": [1, 2, 3, 4, 5, 6, 7, 8], "tnrb": [1, 2, 3, 4, 5, 6, 7, 8], "wsc": [1, 2, 3, 4, 5, 6, 7]}
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8011')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('https://**/*',lambda route:route.abort())
    page.goto(BASE_URL+'/#map')
    assert page.evaluate('Object.fromEntries(BUILDINGS.map(b=>[b.id,b.floors]))') == EXPECTED
    for building, floors in EXPECTED.items():
        for floor in floors:
            page.goto(BASE_URL+'/#building-'+building+'-f'+str(floor))
            page.wait_for_selector('.floor-tab.is-on')
            assert page.locator('.floor-tab span').all_inner_texts()==['Floor '+str(f) for f in floors]
            assert page.locator('.floor-tab.is-on span').inner_text()=='Floor '+str(floor)
            assert page.locator('.fp-outline').get_attribute('d')==page.evaluate('(id)=>CAMPUS_FOOTPRINTS[id].d',building)
        if 'B' in floors:
            page.goto(BASE_URL+'/#building-'+building+'-fB')
            page.locator('a[href="#add-'+building+'-fB"]').click()
            page.wait_for_selector('#add-plan')
            assert page.evaluate('AddState.floor')=='B'
            assert page.locator('[data-add-floor="B"]').get_attribute('aria-checked')=='true'
            page.locator('#add-name').fill('Basement browser test')
            # Find an interior point, including for JFSB's courtyard footprint.
            page.locator('#add-plan').scroll_into_view_if_needed()
            point=page.locator('#add-plan .fp-outline').evaluate('''path=>{
              const b=path.getBBox();
              for(let x=b.x+b.width*.2;x<b.x+b.width;x+=2) for(let y=b.y+b.height*.2;y<b.y+b.height;y+=2){
                if(path.isPointInFill(new DOMPoint(x,y))){const p=new DOMPoint(x,y).matrixTransform(path.getScreenCTM());return {x:p.x,y:p.y};}
              }
            }''')
            page.mouse.click(point['x'],point['y'])
            assert page.locator('#add-plan .fp-pin').count()==1
            page.locator('#add-form [type="submit"]').click()
            page.wait_for_url('**/#list')
            page.goto(BASE_URL+'/#building-'+building+'-fB')
            page.wait_for_selector('.fp-marker');page.reload();page.wait_for_selector('.fp-marker')
            assert page.locator('.spot-meta').filter(has_text='Floor B').count()>0
    page.set_viewport_size({'width':390,'height':844})
    page.goto(BASE_URL+'/#building-kmbl-f12');page.wait_for_selector('.floor-tabs')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert not errors,errors
    browser.close()
    print('PASS: exact floor tabs for all 23 buildings, outlines, four basement add/reload flows, mobile layout')
