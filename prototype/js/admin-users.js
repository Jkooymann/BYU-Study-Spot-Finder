/* =========================================================================
   Admin Page → Users: the team admin can see every account, add one, edit one,
   or delete one (Create / Read / Update / Delete). Shown under the OKR trackers
   on #okr (js/okr/okr-trackers-page.js).

   The page only draws this for the admin, but the real protection is in the
   database: every list / add / edit / delete is a function that refuses anyone
   who isn't the admin (supabase/migrations/*_admin_manage_users.sql).

   Everything lives in AdminUsers.state, so the section can be redrawn at any
   time (the site redraws pages when you come back to the tab) without losing
   what the admin has typed.
   ========================================================================= */

const AdminUsers = (() => {
  const fresh = () => ({
    status: 'idle',     // idle | loading | ok | error
    users: [],
    loadError: '',
    form: null,         // { mode: 'create' | 'edit', userId, values: { displayName, netId, email, password }, errors: {}, message, pending }
    confirmDelete: null, // user_id waiting for "Yes, delete"
    deleting: null,
  });
  let state = fresh();

  const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDate = (v) => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? dateFmt.format(d) : '—'; };
  const byId = (id) => state.users.find((u) => u.user_id === id) || null;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  /** A short message that is safe to show for a database error. */
  function errorMessage(err, fallback) {
    const code = String((err && err.code) || '');
    const msg = String((err && err.message) || '');
    if (code === 'PGRST202' || /could not find the function/i.test(msg)) {
      return 'The user tools aren’t set up in the database yet. Run supabase/migrations/20261120010000_admin_manage_users.sql in the Supabase SQL Editor.';
    }
    // Messages written in the migration (not the admin, missing user, bad input, already taken).
    if (['42501', 'P0002', '22023', '23505'].includes(code) && msg) return msg;
    if (/failed to fetch|network|load failed/i.test(msg)) return 'We couldn’t reach the server. Check your internet connection and try again.';
    return fallback;
  }

  /* ---------------- Drawing ---------------- */

  function render() {
    return `<section class="admin-users" id="admin-users" aria-labelledby="admin-users-title">${inner()}</section>`;
  }

  function inner() {
    const count = state.status === 'ok' ? `<span class="admin-users-count">${plural(state.users.length, 'user')}</span>` : '';
    const head = `<div class="admin-users-head">
        <div><h2 id="admin-users-title">Users ${count}</h2>
        <p class="admin-users-sub">Every account on the site. Deleting a user also deletes their favorites and private spots.</p></div>
        ${state.form && state.form.mode === 'create' ? '' : `<button type="button" class="btn btn-primary" data-au-new>${icon('plus')}Add user</button>`}
      </div>`;
    return head + (state.form ? formHtml() : '') + body();
  }

  function body() {
    if (state.status === 'idle' || state.status === 'loading') return '<p class="admin-users-note" role="status">Loading users…</p>';
    if (state.status === 'error') {
      return `<div class="notice admin-users-error" role="alert">${icon('x')}<div><p>${esc(state.loadError)}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-au-reload>Try again</button></div></div>`;
    }
    if (!state.users.length) return '<p class="admin-users-note">No accounts yet.</p>';
    return `<div class="admin-users-table-wrap"><table class="admin-users-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Net ID</th><th scope="col">Email</th><th scope="col">Joined</th><th scope="col">Favorites</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${state.users.map(rowHtml).join('')}</tbody>
    </table></div>`;
  }

  function rowHtml(u) {
    const editing = state.form && state.form.mode === 'edit' && state.form.userId === u.user_id;
    const badges = (u.is_admin ? '<span class="admin-badge">Admin</span>' : '')
      + (u.has_login ? '' : '<span class="admin-badge admin-badge-muted" title="This row has no login, so this person can’t log in">No login</span>');
    let actions;
    if (state.confirmDelete === u.user_id) {
      const busy = state.deleting === u.user_id;
      actions = `<div class="admin-users-confirm" role="group" aria-label="Confirm delete">
        <span>Delete ${esc(u.display_name)}?</span>
        <button type="button" class="btn btn-danger btn-sm" data-au-delete-yes="${u.user_id}" ${busy ? 'disabled' : ''}>${busy ? 'Deleting…' : 'Yes, delete'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-au-delete-no ${busy ? 'disabled' : ''}>Cancel</button></div>`;
    } else {
      actions = `<div class="admin-users-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-au-edit="${u.user_id}" aria-label="Edit ${esc(u.display_name)}">${icon('edit')}Edit</button>
        ${u.is_admin ? '' : `<button type="button" class="btn btn-ghost btn-sm danger-text" data-au-delete="${u.user_id}" aria-label="Delete ${esc(u.display_name)}">${icon('trash')}Delete</button>`}
      </div>`;
    }
    return `<tr${editing ? ' class="is-editing"' : ''} data-user-row="${u.user_id}">
      <td data-label="Name"><span><span class="admin-users-name">${esc(u.display_name)}</span>${badges}</span></td>
      <td data-label="Net ID">${esc(u.byu_net_id)}</td>
      <td data-label="Email" class="admin-users-email">${esc(u.byu_email)}</td>
      <td data-label="Joined">${fmtDate(u.account_created_at)}</td>
      <td data-label="Favorites">${Number(u.favorite_count) || 0}</td>
      <td class="admin-users-cell-actions">${actions}</td>
    </tr>`;
  }

  function formHtml() {
    const f = state.form;
    const edit = f.mode === 'edit';
    const u = edit ? byId(f.userId) : null;
    const v = f.values;
    const field = (key, label, attrs, help = '') => `<div class="field">
        <label class="label" for="au-${key}">${label}</label>
        <input class="input" id="au-${key}" name="${key}" value="${esc(v[key] || '')}" ${attrs} aria-invalid="${!!f.errors[key]}" aria-describedby="${help ? `au-${key}-help ` : ''}au-${key}-error">
        ${help ? `<p class="account-note" id="au-${key}-help">${help}</p>` : ''}
        <p class="field-error" id="au-${key}-error"${f.errors[key] ? '' : ' hidden'}>${esc(f.errors[key] || '')}</p>
      </div>`;
    return `<form class="admin-users-form" id="admin-users-form" novalidate aria-labelledby="au-form-title">
      <h3 id="au-form-title">${edit ? `Edit ${esc(u ? u.display_name : 'user')}` : 'Add a user'}</h3>
      <div class="admin-users-fields">
        ${field('displayName', 'Name', 'autocomplete="off" maxlength="60" required')}
        ${field('email', 'Email', 'type="email" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="120" required', edit ? 'Changing this changes the email they log in with.' : 'They log in with this email.')}
        ${field('netId', 'Net ID', 'autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="80"', edit ? '' : 'Leave blank to use the part of the email before @.')}
        ${field('password', edit ? 'New password' : 'Password', 'type="password" autocomplete="new-password"', edit ? 'Leave blank to keep their current password.' : 'At least 8 characters. Share it with them so they can log in.')}
      </div>
      ${edit && u && !u.has_login ? '<p class="admin-users-note">This user has no login, so the email and password only change their profile.</p>' : ''}
      <p class="account-message" role="alert"${f.message ? '' : ' hidden'}>${esc(f.message || '')}</p>
      <div class="admin-users-form-actions">
        <button type="submit" class="btn btn-primary" ${f.pending ? 'disabled' : ''}>${f.pending ? 'Saving…' : edit ? 'Save changes' : 'Add user'}</button>
        <button type="button" class="btn btn-ghost" data-au-cancel ${f.pending ? 'disabled' : ''}>Cancel</button>
      </div>
    </form>`;
  }

  /** Redraw just this section, keeping focus on the same control when possible. */
  function redraw(focusSel) {
    const el = document.getElementById('admin-users');
    if (!el) return;
    const active = document.activeElement;
    const keepId = !focusSel && active && el.contains(active) && active.id ? '#' + active.id : null;
    el.innerHTML = inner();
    const target = focusSel || keepId;
    const next = target && el.querySelector(target);
    if (next) next.focus();
  }

  /* ---------------- Data ---------------- */

  async function load() {
    state.status = 'loading';
    redraw();
    try {
      state.users = (await DB.adminListUsers()) || [];
      state.status = 'ok';
    } catch (err) {
      console.error('Could not load users', err && (err.code || err.message));
      state.loadError = errorMessage(err, 'We couldn’t load the users. Please try again.');
      state.status = 'error';
    }
    redraw();
  }

  function mount() {
    if (!Store.isAdmin()) return;
    if (state.status === 'idle') load();
  }

  function reset() { state = fresh(); }

  function openForm(mode, user) {
    state.confirmDelete = null;
    state.form = {
      mode, userId: user ? user.user_id : null, errors: {}, message: '', pending: false,
      values: user ? { displayName: user.display_name, netId: user.byu_net_id, email: user.byu_email, password: '' }
        : { displayName: '', netId: '', email: '', password: '' },
    };
    redraw('#au-displayName');
    const form = document.getElementById('admin-users-form');
    if (form) form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function validate() {
    const f = state.form;
    const v = f.values;
    const edit = f.mode === 'edit';
    v.displayName = (v.displayName || '').trim().replace(/\s+/g, ' ');
    v.email = (v.email || '').trim().toLowerCase();
    v.netId = (v.netId || '').trim().toLowerCase();
    f.errors = {};
    if (!v.displayName) f.errors.displayName = 'Enter a name.';
    if (!EMAIL_RE.test(v.email)) f.errors.email = 'Enter an email address, like jdoe@byu.edu.';
    if (edit && !v.netId) f.errors.netId = 'Enter a Net ID.';
    if (/\s/.test(v.netId)) f.errors.netId = 'Remove the spaces from the Net ID.';
    if (edit ? v.password && v.password.length < 8 : (v.password || '').length < 8) f.errors.password = 'Use a password with at least 8 characters.';
    return Object.keys(f.errors);
  }

  async function submit() {
    const f = state.form;
    if (!f || f.pending) return;
    f.message = '';
    const bad = validate();
    if (bad.length) { redraw('#au-' + bad[0]); return; }
    f.pending = true;
    redraw();
    const v = f.values;
    try {
      if (f.mode === 'create') {
        await DB.adminCreateUser({ email: v.email, password: v.password, displayName: v.displayName, netId: v.netId });
        toast(`Added ${v.displayName}. They can log in with ${v.email}.`);
      } else {
        await DB.adminUpdateUser(f.userId, { displayName: v.displayName, netId: v.netId, email: v.email, newPassword: v.password });
        toast(`Saved changes to ${v.displayName}.`);
        // Edited your own account: update the name in the top bar.
        const me = Store.currentStudent();
        if (me && me.user_id === f.userId) App.loadShared();
      }
      state.form = null;
      await load();
      const btn = document.querySelector('[data-au-new]');
      if (btn) btn.focus();
    } catch (err) {
      console.error('Saving user failed', err && (err.code || err.message));
      if (state.form === f) {
        f.pending = false;
        f.message = errorMessage(err, f.mode === 'create' ? 'We couldn’t add this user. Please try again.' : 'We couldn’t save these changes. Please try again.');
        v.password = '';
        redraw();
        const msg = document.querySelector('#admin-users-form .account-message');
        if (msg) { msg.tabIndex = -1; msg.focus(); }
      }
    }
  }

  async function remove(userId) {
    const u = byId(userId);
    if (!u || state.deleting) return;
    state.deleting = userId;
    redraw();
    try {
      await DB.adminDeleteUser(userId);
      if (state.form && state.form.userId === userId) state.form = null;
      state.confirmDelete = null;
      state.deleting = null;
      toast(`Deleted ${u.display_name}.`);
      await load();
      const btn = document.querySelector('[data-au-new]');
      if (btn) btn.focus();
    } catch (err) {
      console.error('Deleting user failed', err && (err.code || err.message));
      state.deleting = null;
      state.confirmDelete = null;
      redraw();
      toast(errorMessage(err, `We couldn’t delete ${u.display_name}. Please try again.`));
    }
  }

  /* ---------------- Events ---------------- */

  document.addEventListener('click', (event) => {
    const t = event.target;
    if (!t.closest || !t.closest('#admin-users')) return;
    let el;
    if (t.closest('[data-au-new]')) openForm('create');
    else if ((el = t.closest('[data-au-edit]'))) openForm('edit', byId(Number(el.dataset.auEdit)));
    else if (t.closest('[data-au-cancel]')) { state.form = null; redraw('[data-au-new]'); }
    else if (t.closest('[data-au-reload]')) load();
    else if ((el = t.closest('[data-au-delete]'))) { state.confirmDelete = Number(el.dataset.auDelete); redraw(`[data-au-delete-no]`); }
    else if (t.closest('[data-au-delete-no]')) { const id = state.confirmDelete; state.confirmDelete = null; redraw(`[data-au-delete="${id}"]`); }
    else if ((el = t.closest('[data-au-delete-yes]'))) remove(Number(el.dataset.auDeleteYes));
  });

  document.addEventListener('input', (event) => {
    const t = event.target;
    if (!state.form || !t.closest || !t.closest('#admin-users-form') || !t.name) return;
    state.form.values[t.name] = t.value;
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'admin-users-form') return;
    event.preventDefault();
    submit();
  });

  return { render, mount, reset, load, get state() { return state; } };
})();
