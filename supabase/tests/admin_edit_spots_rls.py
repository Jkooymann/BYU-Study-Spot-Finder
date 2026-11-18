"""Tries to break admin-only spot editing (supabase/migrations/*_admin_edit_spots.sql)
in a throwaway local Postgres set up like Supabase. Needs Postgres installed locally
(for example Postgres.app or `brew install postgresql`); it does NOT touch the real Supabase project.

    python3 supabase/tests/private_shared_spots_rls.py

Connects with PGHOST / PGPORT / PGUSER (defaults 127.0.0.1, 5432, postgres), creates a database
named spot_rls_test (dropped first if it exists), adds the parts of Supabase the migrations need
(the anon / authenticated / service_role roles, auth.users and auth.uid()), runs every earlier
migration and seed.sql, chooses "jason" as the admin, then applies the new migration and checks
who can and can't edit spots.
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
MIG_DIR = os.path.join(SUPA, 'migrations')
MIG = next(os.path.join(MIG_DIR, f) for f in sorted(os.listdir(MIG_DIR)) if 'admin_edit_spots' in f)
DB = 'spot_edit_test'
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

def add_spot(n, name):
    return val(f"insert into public.study_spot (building_id, submitted_by_user_id, spot_name, floor_number, is_indoors, floor_plan_x_percent, floor_plan_y_percent, typical_busyness_level) "
               f"values (1, {sid[n]}, '{name}', 1, true, 50, 50, 'Low') returning study_spot_id;", **A(n))
shared = add_spot('jason', 'Team spot')
val(f"insert into public.study_spot_amenity (study_spot_id, amenity_id) values ({shared}, 1), ({shared}, 2);", **A('jason'))
private = add_spot('alice', 'Alice private')

ok, out, err = psql(open(MIG).read())
check(ok, 'migration applies cleanly', err[-300:])
check(out.count('ok') == 4 and 'MISSING' not in out, 'checklist all ok', out)

def edit(spot, name="'Edited'", building='2', floor='3', indoors='true', fx='10', fy='20', cx='null', cy='null', tags="'{3,4}'", desc="'New words'"):
    return f"select public.admin_update_spot({spot}, {name}, {building}, {floor}, {desc}, {indoors}, 4, 'Quiet', 'High', {fx}, {fy}, {cx}, {cy}, {tags}::bigint[]);"
row = lambda spot: val(f"select spot_name, building_id, floor_number, description, max_group_size, noise_level, typical_busyness_level, floor_plan_x_percent, submitted_by_user_id, is_shared from public.study_spot where study_spot_id = {spot}")
tags = lambda spot: val(f"select string_agg(amenity_id::text, ',' order by amenity_id) from public.study_spot_amenity where study_spot_id = {spot}")
before = row(shared)

# Not the admin
ok, out, err = psql(edit(shared), **A('alice'))
check(not ok and 'Only the team admin' in err, 'alice cannot edit a shared spot', err)
ok, out, err = psql(edit(private), **A('alice'))
check(not ok, 'alice cannot edit even her own private spot (admin only)', err)
ok, out, err = psql(edit(shared), role='anon')
check(not ok and 'permission denied' in err, 'logged-out visitors cannot call the edit function', err)
ok, out, err = psql(f"update public.study_spot set spot_name = 'hacked' where study_spot_id = {shared};", **A('alice'))
check(not ok, 'alice cannot update the table directly', err)
ok, out, err = psql(f"update public.study_spot set spot_name = 'hacked' where study_spot_id = {shared};", **A('jason'))
check(not ok, 'even the admin cannot update the table directly (only through the function)', err)
val(f"""update auth.users set raw_user_meta_data = raw_user_meta_data || '{{"role":"admin"}}' where id = '{users['alice']}';""")
ok, out, err = psql(edit(shared), **A('alice'))
check(not ok, 'alice setting role=admin in her metadata still cannot edit', err)
check(row(shared) == before and tags(shared) == '1,2', 'shared spot unchanged after the failed attempts', row(shared))

# The admin
ok, out, err = psql(edit(shared), **A('jason'))
check(ok, 'the admin can edit a shared spot', err)
check(row(shared) == f'Edited|2|3|New words|4|Quiet|High|10.00|{sid["jason"]}|t', 'all fields saved; who added it and sharing unchanged', row(shared))
check(tags(shared) == '3,4', 'feature tags replaced', tags(shared))
check(val(f'select spot_name from public.study_spot where study_spot_id = {shared}', role='anon') == 'Edited', 'logged-out visitors see the edit')

ok, out, err = psql(edit(shared, building='null', floor='null', indoors='false', fx='null', fy='null', cx='30', cy='40', tags="'{}'", desc="''"), **A('jason'))
check(ok, 'the admin can move a spot outdoors', err)
check(val(f"select is_indoors, campus_map_x_percent, floor_plan_x_percent is null, description is null from public.study_spot where study_spot_id = {shared}") == 'f|30.00|t|t', 'outdoor location saved, empty description cleared')
check(tags(shared) is not None and tags(shared) == '', 'no tags when none picked', tags(shared))

ok, out, err = psql(edit(private), **A('jason'))
check(not ok, "the admin cannot edit alice's private spot", err)
check(val(f'select spot_name from public.study_spot where study_spot_id = {private}') == 'Alice private', "alice's spot unchanged")
ok, out, err = psql(edit(shared, name="'   '"), **A('jason'))
check(not ok, 'a blank name is refused', err)
ok, out, err = psql(edit(shared, indoors='true', building='null'), **A('jason'))
check(not ok, 'an indoor spot without a building is refused (table rule)', err)
ok, out, err = psql(edit(shared, tags="'{999}'"), **A('jason'))
check(not ok and val(f'select spot_name from public.study_spot where study_spot_id = {shared}') == 'Edited', 'a bad tag fails the whole edit (nothing half-saved)', err)
ok, out, err = psql(edit(99999), **A('jason'))
check(not ok, 'editing a spot that does not exist fails', err)

ok, out, err = psql(open(MIG).read())
check(ok, 'migration can be run again', err[-200:])

print(f'\n{"ALL PASSED" if not fails else str(fails) + " FAILED"}')
run(['-d', 'postgres', '-c', f'drop database if exists {DB};'])
sys.exit(1 if fails else 0)
