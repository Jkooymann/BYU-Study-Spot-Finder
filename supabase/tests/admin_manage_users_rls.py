"""Tries to break the Admin Page's user management (supabase/migrations/*_admin_manage_users.sql)
in a throwaway local Postgres set up like Supabase. Needs Postgres installed locally
(for example Postgres.app or `brew install postgresql`); it does NOT touch the real Supabase project.

    python3 supabase/tests/admin_manage_users_rls.py

Connects with PGHOST / PGPORT / PGUSER (defaults 127.0.0.1, 5432, postgres), creates a database
named spot_rls_test (dropped first if it exists), adds the parts of Supabase the migrations need
(the anon / authenticated / service_role roles, auth.users and auth.uid()), runs every earlier
migration and seed.sql, chooses "jason" as the admin, then applies the new migration and checks
who can list, add, edit and delete users.
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
MIG_DIR = os.path.join(SUPA, 'migrations')
MIG = next(os.path.join(MIG_DIR, f) for f in sorted(os.listdir(MIG_DIR)) if 'admin_manage_users' in f)
DB = 'admin_users_test'
CONN = ['-h', os.environ.get('PGHOST', '127.0.0.1'), '-p', os.environ.get('PGPORT', '5432'), '-U', os.environ.get('PGUSER', 'postgres')]
fails = 0

STUB = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default: new tables/functions in public are granted to the API roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud varchar(255), role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255),
  created_at timestamptz default now(), updated_at timestamptz
);
-- Like Supabase: logins have identities; email is worked out from identity_data.
create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid primary key default gen_random_uuid(),
  unique (provider_id, provider)
);
-- Supabase keeps pgcrypto (crypt / gen_salt) in the extensions schema.
create schema extensions;
create extension pgcrypto schema extensions;
-- Same as Supabase's auth.uid(): the logged-in user's id from the request's JWT.
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$f$;
grant execute on function auth.uid() to anon, authenticated, service_role;
"""

def run(args, sql=''):
    return subprocess.run(['psql', *CONN, '-qtAX', '-v', 'ON_ERROR_STOP=1', *args], input=sql, capture_output=True, text=True)

def psql(sql, role=None, uid=None):
    pre = ''
    if role: pre += f"set role {role};\n"
    if uid: pre += f"select set_config('request.jwt.claim.sub', '{uid}', false) \\gset\n"
    r = run(['-d', DB], pre + sql)
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()

def check(cond, label, detail=''):
    global fails
    if not cond: fails += 1
    print(('ok   ' if cond else 'FAIL ') + label + (f'   [{detail}]' if detail and not cond else ''))

def val(sql, role=None, uid=None):
    ok, out, err = psql(sql, role, uid)
    if not ok: raise SystemExit(f'setup query failed: {sql}\n{err}')
    return out

# --- A fresh database with everything before the new migration ---
r = run(['-d', 'postgres', '-c', f'drop database if exists {DB};', '-c', f'create database {DB};'])
if r.returncode: raise SystemExit('Could not create the test database (is Postgres running?)\n' + r.stderr)
ok, _, err = psql(STUB)
if not ok: raise SystemExit('Supabase stand-in failed: ' + err)
for f in sorted(os.listdir(MIG_DIR)):
    if f.endswith('.sql') and f < os.path.basename(MIG):
        ok, _, err = psql(open(os.path.join(MIG_DIR, f)).read())
        if not ok: raise SystemExit(f'{f} failed: {err}')
ok, _, err = psql(open(os.path.join(SUPA, 'seed.sql')).read())
if not ok: raise SystemExit('seed.sql failed: ' + err)

users = {}
for name in ['jason', 'alice', 'bob']:
    users[name] = val(f"insert into auth.users (email, raw_user_meta_data) values ('{name}@byu.edu', '{{\"display_name\":\"{name.title()}\"}}') returning id;")
sid = {n: val(f"select user_id from public.student_user where auth_user_id = '{u}'") for n, u in users.items()}
A = lambda n: dict(role='authenticated', uid=users[n])
val("insert into public.app_admin (auth_user_id) select id from auth.users where email = 'jason@byu.edu';")

ok, out, err = psql(open(MIG).read())
check(ok, 'migration applies cleanly', err[-300:])
check(out.count('ok') == 5 and 'MISSING' not in out, 'checklist all ok', out)

LIST = "select string_agg(byu_net_id || ':' || byu_email || ':' || has_login || ':' || is_admin, ',' order by byu_net_id) from public.admin_list_users();"
create = lambda email, pw="'password123'", name="'New Person'", net="'newbie'": f"select public.admin_create_user({email}, {pw}, {name}, {net});"
update = lambda uid, name="'Bobby'", net="'bobby'", email="'bobby@byu.edu'", pw='null': f"select public.admin_update_user({uid}, {name}, {net}, {email}, {pw});"
delete = lambda uid: f"select public.admin_delete_user({uid});"
count_users = lambda: val("select count(*) from public.student_user;")
n_before = count_users()

# --- Not the admin: every function refuses ---
for who, opts in [('alice', A('alice')), ('logged out', dict(role='anon'))]:
    ok, out, err = psql(LIST, **opts)
    check(not ok, f'{who} cannot list users', err)
    ok, out, err = psql(create("'sneaky@byu.edu'"), **opts)
    check(not ok, f'{who} cannot create a user', err)
    ok, out, err = psql(update(sid['bob']), **opts)
    check(not ok, f'{who} cannot edit a user', err)
    ok, out, err = psql(delete(sid['bob']), **opts)
    check(not ok, f'{who} cannot delete a user', err)
ok, out, err = psql(LIST, **A('alice'))
check('Only the team admin' in err, 'non-admin gets the friendly "Only the team admin" message', err)
ok, out, err = psql(f"select byu_email from public.student_user;", **A('alice'))
check(not ok, 'alice still cannot read emails from the table directly', err)
ok, out, err = psql(f"update public.student_user set display_name = 'hacked' where user_id = {sid['bob']};", **A('alice'))
check(ok and val(f"select display_name from public.student_user where user_id = {sid['bob']}") == 'Bob', 'alice cannot rename bob directly (row unchanged)')
ok, out, err = psql("select public.admin_require();", **A('alice'))
check(not ok and 'permission denied' in err, 'helper functions are not callable from the website', err)
val(f"""update auth.users set raw_user_meta_data = raw_user_meta_data || '{{"role":"admin"}}' where id = '{users['alice']}';""")
ok, out, err = psql(LIST, **A('alice'))
check(not ok, 'alice setting role=admin in her metadata still cannot list users', err)
check(count_users() == n_before, 'no users added or removed by the failed attempts')

# --- Admin: Read ---
ok, out, err = psql(LIST, **A('jason'))
check(ok and 'alice:alice@byu.edu:true:false' in out and 'jason:jason@byu.edu:true:true' in out, 'admin sees every user with email and admin flag', out + err)

# --- Admin: Create ---
ok, out, err = psql(create("' New@BYU.edu '", net="''"), **A('jason'))
check(ok and out.isdigit(), 'admin creates a user', err)
new_id = out
row = val(f"select display_name || '|' || byu_net_id || '|' || byu_email || '|' || (auth_user_id is not null) from public.student_user where user_id = {new_id}")
check(row == 'New Person|new|new@byu.edu|true', 'new user has a student_user row linked to a login (Net ID from email)', row)
au = val(f"select u.email || '|' || (u.email_confirmed_at is not null) || '|' || (u.encrypted_password = extensions.crypt('password123', u.encrypted_password)) || '|' || coalesce(u.confirmation_token, 'NULL') || '|' || u.aud from auth.users u join public.student_user s on s.auth_user_id = u.id where s.user_id = {new_id}")
check(au == 'new@byu.edu|true|true||authenticated', 'login is confirmed, password works, token columns are blank not null', au)
check(val(f"select count(*) from auth.identities i join public.student_user s on s.auth_user_id = i.user_id where s.user_id = {new_id} and i.provider = 'email' and i.email = 'new@byu.edu'") == '1', 'login has an email identity')
ok, out, err = psql(create("'NEW@byu.edu'", net="'other'"), **A('jason'))
check(not ok and 'already exists' in err, 'duplicate email refused', err)
ok, out, err = psql(create("'x@byu.edu'", net="'alice'"), **A('jason'))
check(not ok and 'Net ID' in err, 'duplicate Net ID refused', err)
ok, out, err = psql(create("'y@byu.edu'", pw="'short'"), **A('jason'))
check(not ok and '8 characters' in err, 'short password refused', err)
ok, out, err = psql(create("'not-an-email'"), **A('jason'))
check(not ok and 'valid email' in err, 'bad email refused', err)
ok, out, err = psql(create("'z@byu.edu'", name="'   '"), **A('jason'))
check(not ok and 'name' in err, 'blank name refused', err)

# --- Admin: Update ---
ok, out, err = psql(update(sid['bob'], pw="'newpassword9'"), **A('jason'))
check(ok, 'admin edits bob', err)
row = val(f"select s.display_name || '|' || s.byu_net_id || '|' || s.byu_email || '|' || u.email || '|' || (u.encrypted_password = extensions.crypt('newpassword9', u.encrypted_password)) || '|' || (u.raw_user_meta_data ->> 'display_name') from public.student_user s join auth.users u on u.id = s.auth_user_id where s.user_id = {sid['bob']}")
check(row == 'Bobby|bobby|bobby@byu.edu|bobby@byu.edu|true|Bobby', 'name, Net ID, email (table + login) and password all changed', row)
pw_before = val(f"select encrypted_password from auth.users where id = '{users['bob']}'")
ok, out, err = psql(update(sid['bob'], name="'Bob'", pw="''"), **A('jason'))
check(ok and val(f"select encrypted_password from auth.users where id = '{users['bob']}'") == pw_before, 'blank new password keeps the old one', err)
ok, out, err = psql(update(sid['bob'], net="'alice'"), **A('jason'))
check(not ok and 'Net ID' in err, 'cannot take another user\'s Net ID', err)
ok, out, err = psql(update(sid['bob'], email="'ALICE@byu.edu'"), **A('jason'))
check(not ok and 'already exists' in err, 'cannot take another user\'s email', err)
ok, out, err = psql(update(999999), **A('jason'))
check(not ok and 'does not exist' in err, 'editing a missing user says so', err)

# --- Admin: Delete ---
private = val(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, floor_number, is_indoors, floor_plan_x_percent, floor_plan_y_percent, typical_busyness_level) values (1, {sid['alice']}, 'Alice private', 1, true, 50, 50, 'Low') returning study_spot_id;", **A('alice'))
team = val(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, floor_number, is_indoors, floor_plan_x_percent, floor_plan_y_percent, typical_busyness_level) values (1, {sid['jason']}, 'Team spot', 1, true, 50, 50, 'Low') returning study_spot_id;", **A('jason'))
val(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid['alice']}, {team});", **A('alice'))
ok, out, err = psql(delete(sid['jason']), **A('jason'))
check(not ok and 'admin account' in err, 'admin cannot delete their own account', err)
ok, out, err = psql(delete(sid['alice']), **A('jason'))
check(ok, 'admin deletes alice', err)
gone = val(f"select (select count(*) from public.student_user where user_id = {sid['alice']}) + (select count(*) from auth.users where id = '{users['alice']}') + (select count(*) from auth.identities where user_id = '{users['alice']}') + (select count(*) from public.favorite_spot where user_id = {sid['alice']}) + (select count(*) from public.study_spot where study_spot_id = {private})")
check(gone == '0', 'alice\'s row, login, favorites and private spot are gone', gone)
check(val(f"select count(*) from public.study_spot where study_spot_id = {team}") == '1', 'shared spots stay')
ok, out, err = psql(delete(sid['alice']), **A('jason'))
check(not ok and 'does not exist' in err, 'deleting twice says the user does not exist', err)
# A row with no login (like an old sample student) can be deleted too.
nologin = val("insert into public.student_user (byu_net_id, display_name, byu_email) values ('sample9', 'Sample', 'sample9@byu.edu') returning user_id;")
ok, out, err = psql(delete(nologin), **A('jason'))
check(ok and val(f"select count(*) from public.student_user where user_id = {nologin}") == '0', 'admin deletes a user with no login', err)

ok, out, err = psql(open(MIG).read())
check(ok, 'migration can be run a second time', err[-300:])

print('\n' + ('All checks passed.' if not fails else f'{fails} check(s) FAILED.'))
sys.exit(1 if fails else 0)
