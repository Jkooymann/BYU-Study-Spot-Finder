/* =========================================================================
   Accounts — the Welcome / Create account / Log in pages and their forms.
   Sign-up and log-in go through DB.signUp / DB.signIn (db.js), which use
   Supabase Auth. A database trigger copies each new account into
   student_user (supabase/migrations/*_save_new_users.sql), and favorites are
   saved against that student_user row.
   Passwords are passed straight to Supabase and are never logged or stored.
   ========================================================================= */

const AccountSession = {
  /** True when someone is logged in (their student_user row has loaded). */
  get signedIn() { return !!Store.currentStudent(); },

  /** Set right after sign-up so the Log in page can say "Account created". */
  justCreated: null, // { netId, needsEmailConfirm }

  async signOut() {
    try { await DB.signOut(); } catch (e) { console.error('Sign out failed', e); }
    await App.loadShared();
    App.go('start');
    toast('You are logged out.');
  },
};

const AccountAPI = {
  /**
   * Create the account in Supabase. Returns { needsEmailConfirm }.
   * The user is always left logged out afterwards so they log in themselves.
   */
  async createAccount({ email, netId, password, displayName }) {
    if (!DB.ready) throw Object.assign(new Error('Accounts are not available right now. Please try again later.'), { friendly: true });
    const { needsEmailConfirm } = await DB.signUp({ email, password, displayName, netId });
    if (!needsEmailConfirm) await DB.signOut();
    return { needsEmailConfirm };
  },

  /** Log in and load this student's favorites. Returns their student_user row. */
  async logIn({ email, password }) {
    if (!DB.ready) throw Object.assign(new Error('Log in is not available right now. Please try again later.'), { friendly: true });
    await DB.signIn({ email, password });
    await App.loadShared();
    return Store.currentStudent();
  },
};

/* Characters allowed before the @ in an email address (RFC 5322 "dot-atom",
   the same set Supabase Auth accepts). Periods are checked separately. */
const EMAIL_LOCAL_CHARS = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/**
 * Turn what someone typed in the Net ID box into their BYU email.
 * Accepts a Net ID ("jane.doe") or a full BYU email ("Jane.Doe@byu.edu").
 * Returns { netId, email } or { error } with a message to show under the box.
 */
function parseByuEmail(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return { error: 'Enter your BYU Net ID.' };
  if (/\s/.test(value)) return { error: 'Remove the spaces from your Net ID.' };
  const at = value.lastIndexOf('@');
  const local = at === -1 ? value : value.slice(0, at);
  if (at !== -1 && value.slice(at + 1) !== 'byu.edu') return { error: 'Use your BYU Net ID or @byu.edu email. Other email addresses can’t be used.' };
  if (!local) return { error: 'Enter the part of your email that comes before @byu.edu.' };
  if (local.includes('@')) return { error: 'Your Net ID can only have one @. Check for typos.' };
  if (local.length > 64) return { error: 'That’s too long for an email address (64 characters before @byu.edu at most). Check for typos.' };
  if (!EMAIL_LOCAL_CHARS.test(local)) return { error: 'That has a character email addresses can’t use. Use letters, numbers, and symbols like . _ - + only.' };
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return { error: 'A period can’t be first, last, or right next to another period. Check for typos.' };
  return { netId: local, email: `${local}@byu.edu` };
}

/**
 * Turn a Supabase error into a short message that is safe to show: it says what
 * went wrong and what to do next, never the raw error. `email` is the address
 * the person typed (their own, so safe to repeat back).
 */
function accountErrorMessage(err, signup, email) {
  const code = String((err && err.code) || '');
  const msg = String((err && err.message) || '').toLowerCase();
  const name = String((err && err.name) || '');
  const addr = email || 'that address';
  if (err && err.friendly) return err.message;
  // No answer from Supabase at all (offline, blocked, timed out).
  if (name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'We couldn’t reach the server. Check your internet connection and try again.';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered')) return 'An account with that Net ID already exists. Try logging in instead.';
  if (code === 'weak_password' || msg.includes('password should')) return 'That password is too easy to guess. Try a longer one.';
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'That Net ID and password don’t match. Please try again.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Please confirm your account first. Open the email we sent to your BYU address and click the link.';
  if (code === 'over_email_send_rate_limit') return 'We’ve sent too many emails in a short time. Please wait a few minutes, then try again.';
  if (code.includes('rate_limit') || msg.includes('rate limit')) return 'Too many tries in a short time. Please wait a few minutes and try again.';
  // Supabase didn't accept the address (format, or a domain it won't send to).
  if (code === 'email_address_invalid' || (code === 'validation_failed' && msg.includes('email')) || msg.includes('unable to validate email') || (msg.includes('email address') && msg.includes('invalid'))) {
    return `${addr} wasn’t accepted as an email address. Check your Net ID for typos and try again.`;
  }
  // The confirmation email couldn't be sent.
  if (code === 'email_address_not_authorized' || msg.includes('sending confirmation') || msg.includes('error sending')) {
    return `We couldn’t send a confirmation email to ${addr}. Check that your Net ID is spelled correctly. If it is, please try again later.`;
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return 'New accounts can’t be created right now. Please try again later.';
  // The database step after sign-up failed (the student_user trigger).
  if (msg.includes('database error')) return 'Something went wrong on our end while setting up your account. Please try again in a few minutes.';
  return signup ? 'We couldn’t create your account. Please try again later.' : 'We couldn’t log you in. Please try again later.';
}

const AccountPages = {
  titles: { welcome: 'Welcome', signup: 'Create account', login: 'Log in' },
  isPublic(route) { return Object.hasOwn(this.titles, route); },
  render(route) {
    const intro = `<div class="account-intro"><h1>A little less searching.<br>A lot more studying.</h1><p>Find a quiet corner, a group table, or a seat by an outlet anywhere on BYU campus.</p></div>`;
    let content;
    if (route === 'welcome') {
      content = `<h2 id="account-title">Save your favorite spots</h2><div class="account-actions"><a class="btn btn-primary btn-lg" href="#signup">Create an account</a><a class="btn btn-ghost btn-lg" href="#login">Log in</a></div>`;
    } else {
      const signup = route === 'signup';
      const created = signup ? '' : this.createdMessage();
      const netIdValue = !signup && AccountSession.justCreated ? esc(AccountSession.justCreated.netId) : '';
      content = `<a class="account-back" href="#welcome">${icon('back')}Back</a><h2 id="account-title">${signup ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        ${created}
        <form id="${signup ? 'signup' : 'login'}-form" novalidate>
          ${signup ? `<div class="field"><label class="label" for="account-name">Your name</label><input class="input" id="account-name" name="displayName" autocomplete="name" required maxlength="60" aria-describedby="name-error"><p class="field-error" id="name-error" hidden></p></div>` : ''}
          <div class="field"><label class="label" for="account-netid">BYU Net ID</label><div class="account-email"><input class="input" id="account-netid" name="netId" value="${netIdValue}" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="80" aria-describedby="netid-error"><span>@byu.edu</span></div><p class="field-error" id="netid-error" hidden></p></div>
          <div class="field"><label class="label" for="account-password">Password</label><div class="account-password"><input class="input" id="account-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required ${signup ? 'minlength="8"' : ''} aria-describedby="${signup ? 'password-help ' : ''}password-error"><button type="button" class="account-show" data-show-password="account-password" aria-controls="account-password" aria-pressed="false">Show</button></div>${signup ? '<p class="account-note" id="password-help">At least 8 characters.</p>' : ''}<p class="field-error" id="password-error" hidden></p></div>
          ${signup ? `<div class="field"><label class="label" for="account-confirm">Confirm password</label><input class="input" id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" required aria-describedby="confirm-error"><p class="field-error" id="confirm-error" hidden></p></div>` : ''}
          <p id="account-message" class="account-message" role="alert" tabindex="-1" hidden></p>
          <button class="btn btn-primary btn-lg account-submit" type="submit">${signup ? 'Create account' : 'Log in'}</button>
        </form><p class="account-switch">${signup ? 'Already have an account? <a href="#login">Log in</a>' : 'New here? <a href="#signup">Create an account</a>'}</p>`;
    }
    return `<section class="account-layout">${intro}<div class="account-card" aria-labelledby="account-title">${content}</div></section>`;
  },

  /** Green "Account created" note shown on the Log in page after sign-up. */
  createdMessage() {
    const c = AccountSession.justCreated;
    if (!c) return '';
    const text = c.needsEmailConfirm
      ? `<strong>Account created!</strong> We sent a confirmation link to <strong>${esc(c.netId)}@byu.edu</strong>. Click it, then log in here.`
      : '<strong>Account created!</strong> Log in to get started.';
    return `<p class="account-message account-success" role="status">${icon('check')}<span>${text}</span></p>`;
  },
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-show-password]');
  if (!button) return;
  const input = document.getElementById(button.dataset.showPassword);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.textContent = show ? 'Hide' : 'Show';
  button.setAttribute('aria-pressed', String(show));
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['signup-form', 'login-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.dataset.pending) return;
  const signup = form.id === 'signup-form';
  const netInput = form.elements.netId;
  // Accept a Net ID or a pasted BYU email, including valid punctuation (. _ - + ' and so on).
  const parsed = parseByuEmail(netInput.value);
  const netId = parsed.netId || '';
  const password = form.elements.password.value;
  const displayName = signup ? form.elements.displayName.value.trim().replace(/\s+/g, ' ') : '';
  const errors = [];
  function validate(input, errorId, message) {
    const error = document.getElementById(errorId);
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', String(!!message));
    if (message) errors.push(input);
  }
  if (signup) validate(form.elements.displayName, 'name-error', displayName ? '' : 'Enter your name.');
  validate(netInput, 'netid-error', parsed.error || '');
  validate(form.elements.password, 'password-error', password.length >= (signup ? 8 : 1) ? '' : signup ? 'Use a password with at least 8 characters.' : 'Enter your password.');
  if (signup) validate(form.elements.confirmPassword, 'confirm-error', form.elements.confirmPassword.value && form.elements.confirmPassword.value === password ? '' : 'Enter the same password again to confirm it.');
  const message = form.querySelector('#account-message');
  message.hidden = true;
  if (errors.length) { errors[0].focus(); return; }
  netInput.value = netId;

  form.dataset.pending = 'true';
  const submit = form.querySelector('[type="submit"]');
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = signup ? 'Creating account…' : 'Logging in…';
  const email = parsed.email;
  try {
    if (signup) {
      const { needsEmailConfirm } = await AccountAPI.createAccount({ email, netId, password, displayName });
      AccountSession.justCreated = { netId, needsEmailConfirm };
      App.go('login');
    } else {
      const me = await AccountAPI.logIn({ email, password });
      AccountSession.justCreated = null;
      App.go('start');
      toast(me ? `Welcome, ${me.display_name}!` : 'You are logged in.');
    }
  } catch (err) {
    console.error(signup ? 'Sign up failed' : 'Log in failed', err && (err.code || err.message));
    if (form.isConnected) {
      message.textContent = accountErrorMessage(err, signup, email);
      message.hidden = false;
      message.focus();
    }
  } finally {
    form.elements.password.value = '';
    if (signup) form.elements.confirmPassword.value = '';
    delete form.dataset.pending;
    submit.disabled = false;
    submit.textContent = label;
  }
});
