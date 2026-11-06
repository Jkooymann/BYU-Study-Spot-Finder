import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':900});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.goto(os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000') + '/#building-hbll')
 for bid in page.evaluate('BUILDINGS.map(b=>b.id)'):
  result=page.evaluate('''id => {
   const host=document.createElement('div'); document.body.append(host);
   host.innerHTML=floorPlanSvg(id,1,[],{interactive:true});
   const svg=host.querySelector('svg'), path=svg.querySelector('.fp-outline');
   const box=path.getBBox(), geometry=floorGeometry(id);
   const same=path.getAttribute('d')===CAMPUS_FOOTPRINTS[id].d;
   const ratio=Math.abs(geometry.w/geometry.h-box.width/box.height)<0.0001;
   let valid=false;
   for(let x=box.x+1;x<box.x+box.width && !valid;x+=2) {
    for(let y=box.y+1;y<box.y+box.height && !valid;y+=2) {
     if(!path.isPointInFill(new DOMPoint(x,y))) continue;
     const screen=new DOMPoint(x,y).matrixTransform(path.getScreenCTM());
     const pin=floorPinAt(svg,screen.x,screen.y);
     const rendered=new DOMPoint(geometry.x+pin.x/100*geometry.w,geometry.y+pin.y/100*geometry.h).matrixTransform(svg.getScreenCTM());
     valid=Math.hypot(rendered.x-screen.x,rendered.y-screen.y)<0.01;
    }
   }
   const outside=new DOMPoint(1,1).matrixTransform(svg.getScreenCTM());
   const rejects=floorPinAt(svg,outside.x,outside.y)===null;
   let courtyard=true;
   if(id==='jfsb') {
    const hole=new DOMPoint(322,422).matrixTransform(path.getScreenCTM());
    courtyard=floorPinAt(svg,hole.x,hole.y)===null;
   }
   host.remove();return {same,ratio,valid,rejects,courtyard};
  }''',bid)
  assert all(result.values()),(bid,result)
 assert page.locator('.fp-room,.fp-stairs,.fp-corridor').count()==0
 page.goto(os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000') + '/#building-tnrb')
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS: all shared outlines, aspect ratios, pin coordinate round trips, outside/courtyard rejection, blank interiors, responsive layout; no browser errors')
 b.close()
