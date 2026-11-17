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

  /* ---- Password reset ---- */
  resetSentTo: null,      // email shown in "If there's an account for …, we sent a link"
  justReset: false,       // Log in page says "Password updated"
  linkProblem: false,     // the reset link was expired, already used, or invalid
  authLinkHandled: false,

  /** True after opening a valid reset link in this tab, until the new password is saved. */
  get recovering() {
    try { return sessionStorage.getItem('byuStudySpots.recovering') === '1'; } catch (e) { return !!this._recovering; }
  },
  setRecovering(on) {
    this._recovering = on;
    try { if (on) sessionStorage.setItem('byuStudySpots.recovering', '1'); else sessionStorage.removeItem('byuStudySpots.recovering'); } catch (e) { /* storage blocked */ }
  },

  /**
   * The page was opened from a Supabase email link. Wait for Supabase to read
   * it (which logs the person in for a reset link), then show the right page:
   * a valid reset link → #reset-password; an expired/used one → #forgot.
   */
  async handleAuthLink() {
    this.authLinkHandled = true;
    const link = DB.authLink;
    $('#app').innerHTML = '<section class="account-layout"><p class="account-sub" role="status">One moment…</p></section>';
    let loggedIn = false;
    try { loggedIn = await DB.finishAuthLink(); } catch (e) { console.error('Could not read the email link', e && (e.code || e.message)); }
    let target = 'start';
    if (link.type === 'recovery' && loggedIn && !link.error) { this.setRecovering(true); target = 'reset-password'; }
    else if (link.type === 'recovery' || link.error) { this.linkProblem = true; target = 'forgot'; }
    history.replaceState(null, '', '#' + target);
    App.route();
    App.loadShared();
  },

  async signOut() {
    // OKR 1: send the session's last active time while the login still works.
    if (typeof SessionTracker !== 'undefined') { try { await SessionTracker.flush(); } catch (_) { /* not important */ } }
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

  /** Email a reset link. Resolves the same way whether or not the address has an account. */
  async requestReset(email) {
    if (!DB.ready) throw Object.assign(new Error('Password reset is not available right now. Please try again later.'), { friendly: true });
    await DB.requestPasswordReset(email);
  },

  /** Save the new password, then log out so the person logs in with it. */
  async saveNewPassword(password) {
    if (!DB.ready) throw Object.assign(new Error('Password reset is not available right now. Please try again later.'), { friendly: true });
    await DB.updatePassword(password);
    try { await DB.signOut(); } catch (e) { console.error('Sign out after reset failed', e); }
    await App.loadShared();
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

const isNetworkError = (err) => {
  const msg = String((err && err.message) || '').toLowerCase();
  return (err && err.name === 'AuthRetryableFetchError') || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed');
};

/** Message for the "Set a new password" form. */
function resetErrorMessage(err) {
  const code = String((err && err.code) || '');
  const msg = String((err && err.message) || '').toLowerCase();
  if (err && err.friendly) return err.message;
  if (isNetworkError(err)) return 'We couldn’t reach the server. Check your internet connection and try again.';
  if (code === 'same_password' || msg.includes('different from the old')) return 'That’s your current password. Choose a different one.';
  if (code === 'weak_password' || (err && err.name === 'AuthWeakPasswordError') || msg.includes('password should')) return 'That password is too easy to guess. Try a longer one.';
  if (code === 'session_not_found' || code === 'session_expired' || (err && err.name === 'AuthSessionMissingError') || msg.includes('session')) {
    return 'This reset link has expired. Request a new one and try again.';
  }
  return 'We couldn’t save your new password. Please try again later.';
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
  if (code === 'weak_password' || (err && err.name === 'AuthWeakPasswordError') || msg.includes('password should')) return 'That password is too easy to guess. Try a longer one.';
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

/* Form fields shared by the account pages. */
const netIdField = (value = '') => `<div class="field"><label class="label" for="account-netid">BYU Net ID</label><div class="account-email"><input class="input" id="account-netid" name="netId" value="${esc(value)}" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="80" aria-describedby="netid-error"><span>@byu.edu</span></div><p class="field-error" id="netid-error" hidden></p></div>`;
const passwordField = (label, autocomplete, help) => `<div class="field"><label class="label" for="account-password">${label}</label><div class="account-password"><input class="input" id="account-password" name="password" type="password" autocomplete="${autocomplete}" required ${autocomplete === 'new-password' ? 'minlength="8"' : ''} aria-describedby="${help ? 'password-help ' : ''}password-error"><button type="button" class="account-show" data-show-password="account-password" aria-controls="account-password" aria-pressed="false">Show</button></div>${help ? `<p class="account-note" id="password-help">${help}</p>` : ''}<p class="field-error" id="password-error" hidden></p></div>`;
const confirmField = (label) => `<div class="field"><label class="label" for="account-confirm">${label}</label><input class="input" id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" required aria-describedby="confirm-error"><p class="field-error" id="confirm-error" hidden></p></div>`;
const formMessage = '<p id="account-message" class="account-message" role="alert" tabindex="-1" hidden></p>';
const successNote = (html) => `<p class="account-message account-success" role="status">${icon('check')}<span>${html}</span></p>`;

const AccountPages = {
  titles: { welcome: 'Welcome', signup: 'Create account', login: 'Log in', forgot: 'Reset password', 'reset-password': 'Set a new password' },
  isPublic(route) { return Object.hasOwn(this.titles, route); },
  render(route) {
    const intro = `<div class="account-intro"><h1>A little less searching.<br>A lot more studying.</h1><p>Find a quiet corner, a group table, or a seat by an outlet anywhere on BYU campus.</p></div>`;
    let content;
    if (route === 'welcome') {
      content = `<h2 id="account-title">Save your favorite spots</h2><div class="account-actions"><a class="btn btn-primary btn-lg" href="#signup">Create an account</a><a class="btn btn-ghost btn-lg" href="#login">Log in</a></div>`;
    } else if (route === 'forgot') {
      content = this.forgot();
    } else if (route === 'reset-password') {
      content = this.resetPassword();
    } else {
      const signup = route === 'signup';
      const created = signup ? '' : this.createdMessage();
      const netIdValue = !signup && AccountSession.justCreated ? AccountSession.justCreated.netId : '';
      content = `<a class="account-back" href="#welcome">${icon('back')}Back</a><h2 id="account-title">${signup ? 'Make yourself at home.' : 'Welcome back.'}</h2>
        ${created}
        <form id="${signup ? 'signup' : 'login'}-form" novalidate>
          ${signup ? `<div class="field"><label class="label" for="account-name">Your name</label><input class="input" id="account-name" name="displayName" autocomplete="name" required maxlength="60" aria-describedby="name-error"><p class="field-error" id="name-error" hidden></p></div>` : ''}
          ${netIdField(netIdValue)}
          ${passwordField('Password', signup ? 'new-password' : 'current-password', signup ? 'At least 8 characters.' : '')}
          ${signup ? confirmField('Confirm password') : '<p class="account-forgot"><a href="#forgot">Forgot password?</a></p>'}
          ${formMessage}
          <button class="btn btn-primary btn-lg account-submit" type="submit">${signup ? 'Create account' : 'Log in'}</button>
        </form><p class="account-switch">${signup ? 'Already have an account? <a href="#login">Log in</a>' : 'New here? <a href="#signup">Create an account</a>'}</p>`;
    }
    return `<section class="account-layout">${intro}<div class="account-card" aria-labelledby="account-title">${content}</div></section>`;
  },

  /** #forgot: ask for a reset email, then say (without revealing whether the account exists) that it's on the way. */
  forgot() {
    const head = `<a class="account-back" href="#login">${icon('back')}Back to log in</a><h2 id="account-title">Reset your password.</h2>`;
    const sentTo = AccountSession.resetSentTo;
    if (sentTo) {
      return `${head}
        ${successNote(`If there’s an account for <strong>${esc(sentTo)}</strong>, we’ve emailed it a link to choose a new password.`)}
        <p class="account-sub">It can take a few minutes to arrive, so check your spam folder too. The link works once and expires after an hour.</p>
        <a class="btn btn-primary btn-lg account-submit" href="#login">Back to log in</a>
        <p class="account-switch">Didn’t get it? Wait a minute, then <button type="button" class="link-btn" data-reset-again>send another link</button>.</p>`;
    }
    const problem = AccountSession.linkProblem
      ? '<p class="account-message" role="alert">That reset link has expired or was already used. Request a new one below.</p>' : '';
    return `${head}<p class="account-sub">Enter your BYU Net ID and we’ll email you a link to choose a new password.</p>
      ${problem}
      <form id="forgot-form" novalidate>
        ${netIdField()}
        ${formMessage}
        <button class="btn btn-primary btn-lg account-submit" type="submit">Email me a reset link</button>
      </form><p class="account-switch">Remembered it? <a href="#login">Log in</a></p>`;
  },

  /** #reset-password: choose a new password (only after opening a valid reset link). */
  resetPassword() {
    if (!AccountSession.recovering) {
      return `<span class="account-badge">${icon('x')}</span><h2 id="account-title">This reset link isn’t valid anymore.</h2>
        <p class="account-sub">Reset links work once and expire after an hour. Request a new one to choose a new password.</p>
        <a class="btn btn-primary btn-lg account-submit" href="#forgot">Request a new link</a>
        <p class="account-switch"><a href="#login">Back to log in</a></p>`;
    }
    return `<h2 id="account-title">Choose a new password.</h2><p class="account-sub">You’ll use it the next time you log in.</p>
      <form id="reset-form" novalidate>
        ${passwordField('New password', 'new-password', 'Use at least 8 characters.')}
        ${confirmField('Confirm new password')}
        ${formMessage}
        <button class="btn btn-primary btn-lg account-submit" type="submit">Save new password</button>
      </form>`;
  },

  /** Green note on the Log in page after sign-up or a password reset. */
  createdMessage() {
    if (AccountSession.justReset) return successNote('<strong>Password updated!</strong> Log in with your new password.');
    const c = AccountSession.justCreated;
    if (!c) return '';
    const text = c.needsEmailConfirm
      ? `<strong>Account created!</strong> We sent a confirmation link to <strong>${esc(c.netId)}@byu.edu</strong>. Click it, then log in here.`
      : '<strong>Account created!</strong> Log in to get started.';
    return successNote(text);
  },
};

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-reset-again]')) {
    AccountSession.resetSentTo = null;
    App.route();
    const input = $('#account-netid'); if (input) input.focus();
  }
});

/** Show or clear the message under one field. Returns true when there's an error. */
function setFieldError(input, errorId, message) {
  const error = document.getElementById(errorId);
  error.textContent = message;
  error.hidden = !message;
  input.setAttribute('aria-invalid', String(!!message));
  return !!message;
}

/** Disable the submit button while a request runs; returns a function that undoes it. */
function startPending(form, busyLabel) {
  form.dataset.pending = 'true';
  const submit = form.querySelector('[type="submit"]');
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = busyLabel;
  return () => { delete form.dataset.pending; submit.disabled = false; submit.textContent = label; };
}
function showFormMessage(form, text) {
  const message = form.querySelector('#account-message');
  if (!form.isConnected || !message) return;
  message.textContent = text;
  message.hidden = false;
  message.focus();
}

/* Request a reset email (#forgot). */
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id !== 'forgot-form') return;
  event.preventDefault();
  if (form.dataset.pending) return;
  const netInput = form.elements.netId;
  const parsed = parseByuEmail(netInput.value);
  form.querySelector('#account-message').hidden = true;
  if (setFieldError(netInput, 'netid-error', parsed.error || '')) { netInput.focus(); return; }
  netInput.value = parsed.netId;
  const done = startPending(form, 'Sending…');
  try {
    await AccountAPI.requestReset(parsed.email);
  } catch (err) {
    // Only a lost connection (or a missing setup) is shown as an error. Anything Supabase
    // says about this address (rate limits, sending problems) would hint whether it has an
    // account, so those get the same "if there's an account…" answer as success.
    console.error('Password reset request failed', err && (err.code || err.message));
    if (isNetworkError(err) || (err && err.friendly)) {
      done();
      showFormMessage(form, err.friendly ? err.message : 'We couldn’t reach the server. Check your internet connection and try again.');
      return;
    }
  }
  done();
  AccountSession.linkProblem = false;
  AccountSession.resetSentTo = parsed.email;
  if (form.isConnected) { App.route(); const t = $('#account-title'); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); } }
});

/* Save a new password (#reset-password). */
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id !== 'reset-form') return;
  event.preventDefault();
  if (form.dataset.pending) return;
  const password = form.elements.password.value;
  const confirm = form.elements.confirmPassword.value;
  form.querySelector('#account-message').hidden = true;
  const bad = [
    setFieldError(form.elements.password, 'password-error', password.length >= 8 ? '' : 'Use a password with at least 8 characters.') && form.elements.password,
    setFieldError(form.elements.confirmPassword, 'confirm-error', confirm && confirm === password ? '' : 'Enter the same password again to confirm it.') && form.elements.confirmPassword,
  ].filter(Boolean);
  if (bad.length) { bad[0].focus(); return; }
  const done = startPending(form, 'Saving…');
  try {
    await AccountAPI.saveNewPassword(password);
    AccountSession.setRecovering(false);
    AccountSession.justReset = true;
    AccountSession.justCreated = null;
    App.go('login');
  } catch (err) {
    console.error('Saving new password failed', err && (err.code || err.message));
    showFormMessage(form, resetErrorMessage(err));
  } finally {
    form.elements.password.value = '';
    form.elements.confirmPassword.value = '';
    done();
  }
});

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
      AccountSession.justReset = false;
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
