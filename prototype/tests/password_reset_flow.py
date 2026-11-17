"""Browser checks for "Forgot password?": requesting a reset email, opening the
link, and saving a new password.
Run with a local prototype server (same setup as account_flow.py):
    python3 prototype/tests/password_reset_flow.py
Unlike the other checks this uses the real js/db.js and the real supabase-js
library, so it also proves Supabase reads the token from the reset link. Every
request to Supabase is answered by a fake here; no email is sent and no real
password changes.
"""
import json, os, time
from urllib.parse import quote, urlparse
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('TEST_BASE_URL', 'http://127.0.0.1:8000')
BASE = BASE_URL.rstrip('/') + '/'
USER = {'id': '11111111-2222-3333-4444-555555555555', 'aud': 'authenticated', 'role': 'authenticated',
        'email': 'jane.doe@byu.edu', 'app_metadata': {'provider': 'email'}, 'user_metadata': {},
        'created_at': '2026-11-01T00:00:00Z'}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}

# What the fake Supabase server answers; changed per scenario.
fake = {'recover': (200, {}), 'update': (200, USER), 'user_ok': True}
log = []

def supabase(route):
    req = route.request
    url = urlparse(req.url)
    path, method = url.path, req.method
    log.append(f'{method} {path}' + (f'?{url.query}' if url.query else ''))
    def reply(status, body):
        route.fulfill(status=status, content_type='application/json', headers=CORS, body=json.dumps(body))
    if method == 'OPTIONS':
        return route.fulfill(status=204, headers=CORS)
    if path == '/auth/v1/recover':
        log.append('recover body ' + (req.post_data or ''))
        if fake['recover'] == 'offline':
            return route.abort('internetdisconnected')
        return reply(*fake['recover'])
    if path == '/auth/v1/user' and method == 'GET':
        return reply(200, USER) if fake['user_ok'] else reply(401, {'code': 'bad_jwt', 'msg': 'invalid JWT'})
    if path == '/auth/v1/user' and method == 'PUT':
        log.append('update body ' + (req.post_data or ''))
        return reply(*fake['update'])
    if path == '/auth/v1/logout':
        return route.fulfill(status=204, headers=CORS)
    if path.startswith('/rest/v1/student_user'):
        return reply(200, {'user_id': 7, 'display_name': 'Jane Doe', 'byu_net_id': 'jane.doe'} if fake['user_ok'] else None)
    if path.startswith('/rest/v1/'):
        return reply(200, [])
    return reply(404, {})

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 1280, 'height': 900}); errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route('**/*.supabase.co/**', supabase)
    page.route(lambda u: not u.startswith(BASE) and 'cdn.jsdelivr.net' not in u and '.supabase.co' not in u, lambda r: r.abort())

    def fresh(hash_):
        page.goto('about:blank'); page.goto(BASE + hash_); page.wait_for_selector('#account-title')
    def text(sel):
        return page.locator(sel).inner_text() if page.locator(sel).count() else ''
    def request_reset(net):
        page.locator('#account-netid').fill(net); page.locator('.account-submit').click()

    # Log in page links to the reset request page
    fresh('#login')
    page.get_by_role('link', name='Forgot password?').click(); page.wait_for_url('**/#forgot')
    assert 'Reset your password' in text('#account-title')

    # A bad Net ID is caught before anything is sent
    log.clear(); request_reset('jane..doe')
    assert 'period' in text('#netid-error') and not any('recover' in l for l in log)

    # Success: neutral message, normalized email, link returns to this page
    request_reset('Jane.Doe@BYU.edu'); page.wait_for_selector('.account-success')
    assert 'If there’s an account for jane.doe@byu.edu' in text('.account-success')
    assert any('"email":"jane.doe@byu.edu"' in l for l in log), log
    assert any(l.startswith('POST /auth/v1/recover?redirect_to=' + quote(BASE, safe='')) for l in log), log

    # Errors that would hint whether the address has an account get the same message
    for status, body in [(429, {'code': 'over_email_send_rate_limit', 'msg': 'email rate limit exceeded'}),
                         (429, {'code': 'over_request_rate_limit', 'msg': 'For security purposes, you can only request this after 59 seconds.'}),
                         (500, {'code': 'unexpected_failure', 'msg': 'Error sending recovery email'}),
                         (400, {'code': 'email_address_not_authorized', 'msg': 'Email address not authorized'})]:
        fake['recover'] = (status, body)
        fresh('#forgot'); request_reset('someone'); page.wait_for_selector('.account-success')
        assert 'If there’s an account for someone@byu.edu' in text('.account-success'), body
        assert body['msg'] not in text('.account-card'), body

    # No connection is a real error
    fake['recover'] = 'offline'
    fresh('#forgot'); request_reset('someone'); page.wait_for_selector('#account-message:not([hidden])')
    assert 'internet connection' in text('#account-message')
    fake['recover'] = (200, {})

    # "send another link" shows the form again
    fresh('#forgot'); request_reset('someone'); page.wait_for_selector('[data-reset-again]')
    page.locator('[data-reset-again]').click(); page.wait_for_selector('#forgot-form')

    # An expired link explains itself and offers a new one
    fresh('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    page.wait_for_url('**/#forgot')
    assert 'expired or was already used' in text('.account-card')

    # #reset-password without a link
    page.evaluate('sessionStorage.clear()'); fresh('#reset-password')
    assert 'isn’t valid anymore' in text('#account-title')

    # A valid reset link: supabase-js reads the token, the person is logged in, the form shows
    exp = int(time.time()) + 3600
    log.clear()
    page.goto('about:blank')
    page.goto(BASE + f'#access_token=fake-access&expires_at={exp}&expires_in=3600&refresh_token=fake-refresh&token_type=bearer&type=recovery')
    page.wait_for_url('**/#reset-password'); page.wait_for_selector('#reset-form')
    assert 'GET /auth/v1/user' in log, log
    page.wait_for_selector('#account-btn:has-text("Jane Doe")')

    def save(pw='new-password-1'):
        page.locator('#account-password').fill(pw); page.locator('#account-confirm').fill(pw)
        page.locator('.account-submit').click()

    save('short')
    assert '8 characters' in text('#password-error')
    for body, want in [({'code': 'same_password', 'msg': 'New password should be different from the old password.'}, 'current password'),
                       ({'code': 'weak_password', 'msg': 'Password is known to be weak and easy to guess, please choose a different one.', 'weak_password': {'reasons': ['pwned']}}, 'too easy to guess'),
                       ({'code': 'session_not_found', 'msg': 'Session from session_id claim in JWT does not exist'}, 'expired')]:
        fake['update'] = (422, body)
        save(); page.wait_for_selector('#account-message:not([hidden])')
        msg = text('#account-message')
        assert want in msg and body['msg'] not in msg, msg

    # Success: password sent, logged out, Log in page says so, the reset page can't be reused
    fake['update'] = (200, USER); fake['user_ok'] = False
    log.clear(); save(); page.wait_for_url('**/#login'); page.wait_for_selector('.account-success')
    assert any(l.startswith('update body') and '"password":"new-password-1"' in l for l in log), log
    assert any(l.startswith('POST /auth/v1/logout') for l in log), log
    assert 'Password updated' in text('.account-success')
    page.wait_for_selector('.login-btn:has-text("Log in")')
    page.evaluate("App.go('reset-password')"); page.wait_for_selector('#account-title:has-text("valid anymore")')

    page.set_viewport_size({'width': 390, 'height': 800}); fresh('#forgot')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    print('PASS: forgot link, request validation, neutral message for success and account-revealing errors, offline error, send again, expired link, reset link read by supabase-js, new-password validation and errors, save -> log out -> Log in, no reuse, mobile overflow; no uncaught errors')
    b.close()
