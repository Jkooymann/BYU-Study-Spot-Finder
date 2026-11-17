"""Tries to break the private/shared spot rules (supabase/migrations/*_private_and_shared_spots.sql)
in a throwaway local Postgres set up like Supabase. Needs Postgres installed locally
(for example Postgres.app or `brew install postgresql`); it does NOT touch the real Supabase project.

    python3 supabase/tests/private_shared_spots_rls.py

Connects with PGHOST / PGPORT / PGUSER (defaults 127.0.0.1, 5432, postgres), creates a database
named spot_rls_test (dropped first if it exists), adds the parts of Supabase the migrations need
(the anon / authenticated / service_role roles, auth.users and auth.uid()), runs every earlier
migration and seed.sql, adds a few spots as "jason" like the live data, then applies the new
migration and checks what each person can and can't do.
Set WITHOUT_SPOT_RATING=1 to test a database without the spot_rating table (like the live one).
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
MIG_DIR = os.path.join(SUPA, 'migrations')
MIG = next(os.path.join(MIG_DIR, f) for f in sorted(os.listdir(MIG_DIR)) if 'private_and_shared_spots' in f)
DB = 'spot_rls_test'
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
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
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
    if f.endswith('.sql') and f < os.path.basename(MIG):  # only the migrations before it
        ok, _, err = psql(open(os.path.join(MIG_DIR, f)).read())
        if not ok: raise SystemExit(f'{f} failed: {err}')
ok, _, err = psql(open(os.path.join(SUPA, 'seed.sql')).read())
if not ok: raise SystemExit('seed.sql failed: ' + err)

# --- People (the sign-up trigger creates their student_user rows) ---
users = {}
for name in ['jason', 'alice', 'bob']:
    users[name] = val(f"insert into auth.users (email, raw_user_meta_data) values ('{name}@byu.edu', '{{\"display_name\":\"{name.title()}\"}}') returning id;")
sid = {n: val(f"select user_id from public.student_user where auth_user_id = '{u}'") for n, u in users.items()}
A = lambda n: dict(role='authenticated', uid=users[n])

def add_spot(n, name, extra=''):
    return psql(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, floor_number, is_indoors, floor_plan_x_percent, floor_plan_y_percent{', ' + extra.split('=')[0] if extra else ''}) "
                f"values (1, {sid[n]}, '{name}', 1, true, 50, 50{', ' + extra.split('=')[1] if extra else ''}) returning study_spot_id, is_shared;", **A(n))

# --- Before the change: Jason has added the team's spots (like the live database) ---
legacy = [val(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, floor_number, is_indoors) values (1, {sid['jason']}, 'Legacy {i}', 1, true) returning study_spot_id;", **A('jason')) for i in range(3)]
val(f"insert into public.study_spot_amenity (study_spot_id, amenity_id) values ({legacy[0]}, 1);", **A('jason'))
val(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid['alice']}, {legacy[1]});", **A('alice'))
print('before: everyone sees', val('select count(*) from public.study_spot', role='anon'), 'spots')

# The live database no longer has spot_rating; WITHOUT_SPOT_RATING=1 tests that case.
if os.environ.get('WITHOUT_SPOT_RATING'):
    val('drop table public.spot_rating;')
    print('(spot_rating table removed, like the live database)')

# --- Apply the new migration ---
ok, out, err = psql(open(MIG).read())
check(ok, 'migration applies cleanly', err[-300:])
print('checklist:', out.replace('\n', ' | '))
check('MISSING' in out and out.count('ok') == 8, 'checklist: 8 ok, only "admin account chosen" missing before step 2', out)

# Before an admin is chosen, nobody can share
ok, out, err = add_spot('jason', 'Before admin')
check(ok and out.endswith('|f'), 'before step 2, even Jason\'s new spots are private', out + err)
val(f"delete from public.study_spot where spot_name = 'Before admin';")

# --- Step 2: choose the admin (as the dashboard would, by email) ---
val("insert into public.app_admin (auth_user_id, note) select id, 'Shared spots admin' from auth.users where email = 'jason@byu.edu';")
ok, out, err = psql("insert into public.app_admin (auth_user_id) select id from auth.users where email = 'alice@byu.edu';")
check(not ok, 'a second admin cannot be added (one admin only)', err)

# Existing spots: still visible to everyone, now shared
check(val('select count(*) from public.study_spot where is_shared', role='anon') == '3', 'existing 3 spots are shared and still visible to logged-out visitors')
check(val('select count(*) from public.study_spot_amenity', role='anon') == '1', 'existing spot tags still visible')
check(val(f'select count(*) from public.favorite_spot', **A('alice')) == '1', "alice's existing favorite is kept")

# --- Regular students: private spots ---
ok, out, err = add_spot('alice', 'Alice private')
check(ok and out.endswith('|f'), 'alice adds a spot -> private', out + err)
alice_spot = out.split('|')[0]
ok, out, err = add_spot('alice', 'Alice tries shared', 'is_shared=true')
check(ok and out.endswith('|f'), 'alice sends is_shared=true -> the database stores it private anyway', out + err)
val(f"insert into public.study_spot_amenity (study_spot_id, amenity_id) values ({alice_spot}, 2);", **A('alice'))
ok, out, err = add_spot('bob', 'Bob private')
bob_spot = out.split('|')[0]

check(val(f'select count(*) from public.study_spot where study_spot_id = {alice_spot}', **A('alice')) == '1', 'alice sees her private spot')
check(val(f'select count(*) from public.study_spot where study_spot_id = {alice_spot}', **A('bob')) == '0', "bob cannot see alice's private spot")
check(val(f'select count(*) from public.study_spot where study_spot_id = {alice_spot}', role='anon') == '0', "logged-out visitors cannot see alice's private spot")
check(val(f'select count(*) from public.study_spot where study_spot_id = {alice_spot}', **A('jason')) == '0', "the admin cannot see alice's private spot")
check(val(f'select count(*) from public.study_spot_amenity where study_spot_id = {alice_spot}', **A('bob')) == '0', "bob cannot see the tags of alice's private spot")
check(val('select count(*) from public.study_spot', **A('alice')) == '5', 'alice sees 3 shared + her 2 private spots')

# Impersonation and tampering
ok, out, err = psql(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, is_indoors, floor_number) values (1, {sid['alice']}, 'Bob as Alice', true, 1);", **A('bob'))
check(not ok, 'bob cannot add a spot as alice', err)
ok, out, err = psql(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, is_indoors, floor_number) values (1, {sid['jason']}, 'Bob as admin', true, 1);", **A('bob'))
check(not ok, 'bob cannot add a spot as the admin (to get it shared)', err)
ok, out, err = psql(f"update public.study_spot set is_shared = true where study_spot_id = {alice_spot};", **A('alice'))
check(not ok, 'alice cannot change her spot to shared (no updates)', err)
ok, out, err = psql(f"update public.study_spot set spot_name = 'hacked' where study_spot_id = {legacy[0]};", **A('alice'))
check(not ok, 'alice cannot edit a shared spot', err)
ok, out, err = psql(f"insert into public.study_spot_amenity (study_spot_id, amenity_id) values ({legacy[0]}, 3);", **A('alice'))
check(not ok, 'alice cannot add tags to a shared spot', err)
ok, out, err = psql(f"delete from public.study_spot_amenity where study_spot_id = {legacy[0]};", **A('alice'))
check(not ok, 'alice cannot remove tags from a shared spot', err)

# Admin cannot be self-granted
for sql, label in [("select count(*) from public.app_admin;", 'alice cannot read the admin table'),
                   (f"insert into public.app_admin (auth_user_id) values ('{users['alice']}');", 'alice cannot make herself admin'),
                   ("delete from public.app_admin;", 'alice cannot remove the admin')]:
    ok, out, err = psql(sql, **A('alice')); check(not ok, label, out + err)
ok, out, err = psql(f"insert into public.app_admin (auth_user_id) values ('{users['alice']}');", role='anon')
check(not ok, 'a logged-out visitor cannot add an admin', err)
# Editable user metadata does nothing
val(f"""update auth.users set raw_user_meta_data = raw_user_meta_data || '{{"role":"admin","is_admin":true}}' where id = '{users['alice']}';""")
check(val('select public.is_spot_admin()', **A('alice')) == 'f', 'alice setting role=admin in her user metadata does not make her admin')
ok, out, err = add_spot('alice', 'After metadata trick')
check(ok and out.endswith('|f'), '...and her new spots are still private', out + err)
check(val('select public.is_spot_admin()', **A('jason')) == 't', 'jason is the admin')
check(val('select public.is_spot_admin()', role='anon') == 'f', 'logged out is not admin')

# Deleting
ok, out, err = psql(f"delete from public.study_spot where study_spot_id = {legacy[0]} returning 1;", **A('alice'))
check(ok and out == '', 'alice cannot delete a shared spot', out + err)
ok, out, err = psql(f"delete from public.study_spot where study_spot_id = {alice_spot} returning 1;", **A('bob'))
check(ok and out == '', "bob cannot delete alice's private spot", out + err)
ok, out, err = psql(f"delete from public.study_spot where study_spot_id = {alice_spot} returning 1;", **A('jason'))
check(ok and out == '', "the admin cannot delete alice's private spot", out + err)

# --- The admin: shared spots ---
ok, out, err = add_spot('jason', 'Admin new spot')
check(ok and out.endswith('|t'), 'the admin adds a spot -> shared', out + err)
admin_spot = out.split('|')[0]
ok, out, err = add_spot('jason', 'Admin tries private', 'is_shared=false')
check(ok and out.endswith('|t'), 'the admin cannot accidentally make a private spot (always shared)', out + err)
val(f"insert into public.study_spot_amenity (study_spot_id, amenity_id) values ({admin_spot}, 4);", **A('jason'))
check(val(f'select count(*) from public.study_spot where study_spot_id = {admin_spot}', role='anon') == '1', "logged-out visitors see the admin's new spot")
check(val(f'select count(*) from public.study_spot_amenity where study_spot_id = {admin_spot}', **A('bob')) == '1', "bob sees the admin's spot tags")
ok, out, err = psql(f"delete from public.study_spot where study_spot_id = {legacy[2]} returning 1;", **A('jason'))
check(ok and out == '1', 'the admin can delete a shared spot', out + err)

# --- Favorites ---
ok, out, err = psql(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid['bob']}, {alice_spot});", **A('bob'))
check(not ok, "bob cannot favorite alice's private spot (even knowing its id)", err)
ok, out, err = psql(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid['alice']}, {legacy[0]});", **A('bob'))
check(not ok, 'bob cannot add favorites for alice', err)
ok, out, err = psql(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid['bob']}, {legacy[0]});", **A('bob'))
check(ok, 'bob can favorite a shared spot', err)
check(val('select count(*) from public.favorite_spot', **A('bob')) == '1', "bob sees only his own favorites, not alice's")
ok, out, err = psql(f"delete from public.favorite_spot where user_id = {sid['alice']} returning 1;", **A('bob'))
check(ok and out == '', "bob cannot remove alice's favorites", out + err)
ok, out, err = psql('select count(*) from public.favorite_spot;', role='anon')
check(not ok, 'logged-out visitors cannot read favorites', err)

# --- Running the migration again doesn't share private spots ---
before = val('select count(*) from public.study_spot where not is_shared')
ok, out, err = psql(open(MIG).read())
check(ok, 'migration can be run again', err[-200:])
check(val('select count(*) from public.study_spot where not is_shared') == before and before != '0', f'private spots stay private after a re-run ({before})')
check(out.count('ok') == 9, 'checklist all ok after step 2', out)

print(f'\n{"ALL PASSED" if not fails else str(fails) + " FAILED"}')
run(['-d', 'postgres', '-c', f'drop database if exists {DB};'])
sys.exit(1 if fails else 0)
