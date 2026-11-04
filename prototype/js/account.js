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

/** Turn a Supabase error into a short message that is safe to show. */
function accountErrorMessage(err, signup) {
  const code = String((err && err.code) || '');
  const msg = String((err && err.message) || '').toLowerCase();
  if (err && err.friendly) return err.message;
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'An account with that Net ID already exists. Try logging in instead.';
  if (code === 'weak_password' || msg.includes('password should')) return 'That password is too easy to guess. Try a longer one.';
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'That Net ID and password don’t match. Please try again.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Please confirm your account first. Open the email we sent to your BYU address and click the link.';
  if (code.includes('rate_limit') || msg.includes('rate limit')) return 'Too many tries in a short time. Please wait a few minutes and try again.';
  return signup ? 'We couldn’t create your account. Please try again later.' : 'We couldn’t log you in. Please try again later.';
}

const AccountPages = {
  titles: { welcome: 'Welcome', signup: 'Create account', login: 'Log in' },
  isPublic(route) { return Object.hasOwn(this.titles, route); },
  render(route) {
    const intro = `<div class="account-intro"><span class="account-eyebrow">YOUR CAMPUS. YOUR STUDY SPOT.</span><h1>A little less searching.<br>A lot more studying.</h1><p>Find your quiet corner, your group’s next meeting place, or a seat near an outlet. Your next favorite spot is right here at BYU.</p><div class="account-perks"><span>${icon('pin')}Explore campus</span><span>${icon('filter')}Find your fit</span><span>${icon('star')}Save your favorites</span></div></div>`;
    let content;
    if (route === 'welcome') {
      content = `<span class="account-badge">${icon('map')}</span><h2 id="account-title">Find a place to focus.</h2><p class="account-sub">Log in or create an account to save your favorite study spots.</p><div class="account-actions"><a class="btn btn-primary btn-lg" href="#signup">Create an account</a><a class="btn btn-ghost btn-lg" href="#login">Log in</a></div><p class="account-note">Made for the way you study at BYU.</p>`;
    } else {
      const signup = route === 'signup';
      const created = !signup && this.createdMessage();
      const netIdValue = !signup && AccountSession.justCreated ? esc(AccountSession.justCreated.netId) : '';
      content = `<a class="account-back" href="#welcome">${icon('back')}Back</a><h2 id="account-title">${signup ? 'Make yourself at home.' : 'Welcome back.'}</h2><p class="account-sub">${signup ? 'Create your account with your BYU Net ID.' : 'Log in with your BYU account to find your next spot.'}</p>
        ${created}
        <form id="${signup ? 'signup' : 'login'}-form" novalidate>
          ${signup ? `<div class="field"><label class="label" for="account-name">Your name</label><input class="input" id="account-name" name="displayName" autocomplete="name" required maxlength="60" aria-describedby="name-help name-error"><p class="account-note" id="name-help">This is what we’ll show in the top corner.</p><p class="field-error" id="name-error" hidden></p></div>` : ''}
          <div class="field"><label class="label" for="account-netid">BYU Net ID</label><div class="account-email"><input class="input" id="account-netid" name="netId" value="${netIdValue}" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="64" aria-describedby="netid-help netid-error"><span>@byu.edu</span></div><p class="account-note" id="netid-help">Enter just your Net ID. We’ll add @byu.edu for you.</p><p class="field-error" id="netid-error" hidden></p></div>
          <div class="field"><label class="label" for="account-password">Password</label><div class="account-password"><input class="input" id="account-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required ${signup ? 'minlength="8"' : ''} aria-describedby="password-help password-error"><button type="button" class="account-show" data-show-password="account-password" aria-controls="account-password" aria-pressed="false">Show</button></div><p class="account-note" id="password-help">${signup ? 'Use at least 8 characters.' : 'Enter your account password.'}</p><p class="field-error" id="password-error" hidden></p></div>
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
  // Accept a pasted BYU email too, but never append a second domain.
  const netId = netInput.value.trim().toLowerCase().replace(/@byu\.edu$/i, '');
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
  validate(netInput, 'netid-error', /^[a-z0-9][a-z0-9._-]*$/.test(netId) ? '' : 'Enter your BYU Net ID, without spaces or another email domain.');
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
  const email = `${netId}@byu.edu`;
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
      message.textContent = accountErrorMessage(err, signup);
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
