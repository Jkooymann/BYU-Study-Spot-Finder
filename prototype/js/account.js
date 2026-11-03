/* Account integration boundary. See README.md before connecting authentication.
   Credentials are passed directly to the adapter, never logged or persisted. */
const AccountSession = {
  signedIn: false,
  // Call only after your authentication provider verifies the session.
  completeSignIn() {
    this.signedIn = true;
    App.go('start');
    App.loadShared();
  },
};

const AccountAPI = {
  // Replace with an async database/auth adapter receiving { email, netId, password }.
  // Return { authenticated: true } ONLY for a verified signed-in session.
  // Return { authenticated: false } if creation succeeded but login/confirmation is needed.
  async createAccount({ email, netId, password }) {
    throw new Error('Account creation is not available yet. Please try again later.');
  },
};

const AccountPages = {
  titles: { welcome: 'Welcome', signup: 'Create account', login: 'Log in', 'account-created': 'Account created' },
  isPublic(route) { return Object.hasOwn(this.titles, route); },
  created: false,
  render(route) {
    const intro = `<div class="account-intro"><span class="account-eyebrow">YOUR CAMPUS. YOUR STUDY SPOT.</span><h1>A little less searching.<br>A lot more studying.</h1><p>Find your quiet corner, your group’s next meeting place, or a seat near an outlet. Your next favorite spot is right here at BYU.</p><div class="account-perks"><span>${icon('pin')}Explore campus</span><span>${icon('filter')}Find your fit</span><span>${icon('star')}Save your favorites</span></div></div>`;
    let content;
    if (route === 'welcome') {
      content = `<span class="account-badge">${icon('map')}</span><h2 id="account-title">Find a place to focus.</h2><p class="account-sub">Log in or create an account to find study spots that work for you.</p><div class="account-actions"><a class="btn btn-primary btn-lg" href="#signup">Create an account</a><a class="btn btn-ghost btn-lg" href="#login">Log in</a></div><p class="account-note">Made for the way you study at BYU.</p>`;
    } else if (route === 'account-created' && this.created) {
      content = `<span class="account-badge">${icon('check')}</span><h2 id="account-title">Your account is created.</h2><p class="account-sub">Check your BYU email for any confirmation instructions, then log in to get started.</p><a class="btn btn-primary btn-lg" href="#login">Go to log in</a>`;
    } else if (route === 'account-created') {
      content = `<h2 id="account-title">Let’s get you started.</h2><a class="btn btn-primary btn-lg" href="#signup">Create an account</a>`;
    } else {
      const signup = route === 'signup';
      content = `<a class="account-back" href="#welcome">${icon('back')}Back</a><h2 id="account-title">${signup ? 'Make yourself at home.' : 'Welcome back.'}</h2><p class="account-sub">${signup ? 'Create your account with your BYU Net ID.' : 'Log in with your BYU account to find your next spot.'}</p>
        <form id="${signup ? 'signup' : 'login'}-form" novalidate>
          <div class="field"><label class="label" for="account-netid">BYU Net ID</label><div class="account-email"><input class="input" id="account-netid" name="netId" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="64" aria-describedby="netid-help netid-error"><span>@byu.edu</span></div><p class="account-note" id="netid-help">Enter just your Net ID. We’ll add @byu.edu for you.</p><p class="field-error" id="netid-error" hidden></p></div>
          <div class="field"><label class="label" for="account-password">Password</label><div class="account-password"><input class="input" id="account-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required ${signup ? 'minlength="8"' : ''} aria-describedby="password-help password-error"><button type="button" class="account-show" data-show-password="account-password" aria-controls="account-password" aria-pressed="false">Show</button></div><p class="account-note" id="password-help">${signup ? 'Use at least 8 characters.' : 'Enter your account password.'}</p><p class="field-error" id="password-error" hidden></p></div>
          ${signup ? `<div class="field"><label class="label" for="account-confirm">Confirm password</label><input class="input" id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" required aria-describedby="confirm-error"><p class="field-error" id="confirm-error" hidden></p></div>` : ''}
          <p id="account-message" class="account-message" role="status" aria-live="polite" tabindex="-1" hidden></p>
          <button class="btn btn-primary btn-lg account-submit" type="submit">${signup ? 'Create account' : 'Log in'}</button>
        </form><p class="account-switch">${signup ? 'Already have an account? <a href="#login">Log in</a>' : 'New here? <a href="#signup">Create an account</a>'}</p>`;
    }
    return `<section class="account-layout">${intro}<div class="account-card" aria-labelledby="account-title">${content}</div></section>`;
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
  const errors = [];
  function validate(input, errorId, message) {
    const error = document.getElementById(errorId);
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', String(!!message));
    if (message) errors.push(input);
  }
  validate(netInput, 'netid-error', /^[a-z0-9][a-z0-9._-]*$/.test(netId) ? '' : 'Enter your BYU Net ID, without spaces or another email domain.');
  validate(form.elements.password, 'password-error', password.length >= (signup ? 8 : 1) ? '' : signup ? 'Use a password with at least 8 characters.' : 'Enter your password.');
  if (signup) validate(form.elements.confirmPassword, 'confirm-error', form.elements.confirmPassword.value && form.elements.confirmPassword.value === password ? '' : 'Enter the same password again to confirm it.');
  const message = form.querySelector('#account-message');
  message.hidden = true;
  if (errors.length) { errors[0].focus(); return; }
  netInput.value = netId;
  if (!signup) {
    message.textContent = 'Log in is not available yet. Please check back soon.';
    message.hidden = false;
    form.elements.password.value = '';
    message.focus();
    return;
  }
  form.dataset.pending = 'true';
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Creating account…';
  try {
    const result = await AccountAPI.createAccount({ email: `${netId}@byu.edu`, netId, password });
    if (!result || typeof result.authenticated !== 'boolean') throw new Error('Invalid account adapter result');
    // Ignore stale responses if the user has left this form.
    if (!form.isConnected) return;
    AccountPages.created = true;
    if (result.authenticated) AccountSession.completeSignIn();
    else App.go('account-created');
  } catch (_) {
    if (form.isConnected) {
      // Provider errors may contain sensitive details. Keep the UI message generic.
      message.textContent = 'We couldn’t create your account. Please try again later.';
      message.hidden = false;
      message.focus();
    }
  } finally {
    form.elements.password.value = '';
    form.elements.confirmPassword.value = '';
    delete form.dataset.pending;
    submit.disabled = false;
    submit.textContent = 'Create account';
  }
});
