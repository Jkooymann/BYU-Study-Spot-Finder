"""Run with a local prototype server; requires Python Playwright and Chromium.
All external requests are blocked and account adapters are mocked.
"""
import os
from playwright.sync_api import sync_playwright
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(); errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.goto(BASE_URL + '/#list')
 assert page.locator('#account-title').inner_text()=='Find a place to focus.'
 assert page.locator('.main-nav').count()==0
 page.get_by_role('link',name='Create an account',exact=True).click()
 def fill(net=' TestNet@BYU.edu ',confirm='valid-password'):
  page.locator('#account-netid').fill(net)
  page.locator('#account-password').fill('valid-password')
  page.locator('#account-confirm').fill(confirm)
 def submit(): page.get_by_role('button',name='Create account',exact=True).click()
 fill(confirm='mismatch');submit()
 assert page.locator('#account-confirm').get_attribute('aria-invalid')=='true'
 fill(net='test@gmail.com');submit()
 assert page.locator('#account-netid').get_attribute('aria-invalid')=='true'
 fill();page.get_by_role('button',name='Show',exact=True).click()
 assert page.locator('#account-password').get_attribute('type')=='text'
 page.get_by_role('button',name='Hide',exact=True).click()
 submit()
 assert page.locator('#account-message').is_visible()
 assert page.locator('#account-password').input_value()==''
 assert page.evaluate('AccountSession.signedIn') is False
 page.evaluate("() => { AccountAPI.createAccount = async (input) => { window.payloadValid = input.email === 'testnet@byu.edu' && input.netId === 'testnet' && input.password === 'valid-password' && !('confirmPassword' in input); return {authenticated:false}; }; }")
 fill();submit()
 page.wait_for_url('**/#account-created')
 assert page.evaluate('window.payloadValid')
 page.get_by_role('link',name='Go to log in').click()
 page.locator('#account-netid').fill('testnet');page.locator('#account-password').fill('valid-password')
 page.get_by_role('button',name='Log in',exact=True).click()
 assert page.locator('#account-message').is_visible()
 page.goto(BASE_URL + '/#signup')
 page.evaluate("() => { AccountAPI.createAccount = async () => ({authenticated:true}); }")
 fill();submit();page.wait_for_url('**/#start')
 page.evaluate("App.go('list')")
 page.wait_for_selector('.spot-card');assert page.locator('.spot-card').count()==26
 page.reload();assert page.locator('#account-title').inner_text()=='Find a place to focus.'
 for width in [390,1280]:
  page.set_viewport_size({'width':width,'height':850})
  page.evaluate("App.go('signup')");page.wait_for_selector('#signup-form')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert not errors, errors
 print('PASS: route gate, validation, password visibility, adapter failure/success, normalized payload, login placeholder, verified-session handoff, refresh gate, mobile/desktop overflow, existing 26 spots; no uncaught errors')
 b.close()
