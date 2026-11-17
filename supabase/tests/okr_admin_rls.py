"""Tries to break the OKR rules (supabase/migrations/*_okr_admin_only_and_active_time.sql)
in a throwaway local Postgres set up like Supabase. Does NOT touch the real Supabase project.

    python3 supabase/tests/okr_admin_rls.py

Same setup as private_shared_spots_rls.py (PGHOST / PGPORT / PGUSER; database okr_rls_test is
dropped and recreated). Runs the migrations before the OKR change, records some "old" sessions
(including the admin's), applies the change, then checks:
  * only the admin can read okr1_stats(); students get a refusal, logged-out visitors can't call it
  * the admin is never recorded and old admin sessions are left out of the numbers
  * active time can't go down, can't exceed the real time since the session started, and
    can't be reported on someone else's session
  * the numbers use active time, skip first sessions and still-open sessions
"""
import os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
MIG_DIR = os.path.join(SUPA, 'migrations')
MIG = next(f for f in sorted(os.listdir(MIG_DIR)) if 'okr_admin_only_and_active_time' in f)
DB = 'okr_rls_test'
CONN = ['-h', os.environ.get('PGHOST', '127.0.0.1'), '-p', os.environ.get('PGPORT', '5432'), '-U', os.environ.get('PGUSER', 'postgres')]
fails = 0

STUB = open(os.path.join(HERE, 'private_shared_spots_rls.py')).read().split('STUB = """', 1)[1].split('"""', 1)[0]

def run(args, sql=''):
    return subprocess.run(['psql', *CONN, '-qtAX', '-v', 'ON_ERROR_STOP=1', *args], input=sql, capture_output=True, text=True)

def psql(sql, role=None, uid=None):
    pre = ''
    if role: pre += f"set role {role};\n"
    if uid: pre += f"select set_config('request.jwt.claim.sub', '{uid}', false) \\gset\n"
    r = run(['-d', DB], pre + sql)
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()

def val(sql, role=None, uid=None):
    ok, out, err = psql(sql, role, uid)
    if not ok: raise SystemExit(f'query failed: {sql}\n{err}')
    return out

def check(cond, label, detail=''):
    global fails
    if not cond: fails += 1
    print(('ok   ' if cond else 'FAIL ') + label + (f'   [{detail}]' if detail and not cond else ''))

r = run(['-d', 'postgres', '-c', f'drop database if exists {DB};', '-c', f'create database {DB};'])
if r.returncode: raise SystemExit('Could not create the test database (is Postgres running?)\n' + r.stderr)
val(STUB)
for f in sorted(os.listdir(MIG_DIR)):
    if f.endswith('.sql') and f < MIG:
        ok, _, err = psql(open(os.path.join(MIG_DIR, f)).read())
        if not ok: raise SystemExit(f'{f} failed: {err}')

# Three accounts: the admin and two students (the signup trigger makes their student_user rows).
ADMIN, AMY, BEN = ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
                   'a0000000-0000-0000-0000-000000000003')
for uid, email, name in [(ADMIN, 'jkooyman@byu.edu', 'Jason'), (AMY, 'amy@byu.edu', 'Amy'), (BEN, 'ben@byu.edu', 'Ben')]:
    val(f"""insert into auth.users (id, email, raw_user_meta_data) values ('{uid}', '{email}', '{{"display_name": "{name}"}}');""")
    if val(f"select count(*) from public.student_user where auth_user_id = '{uid}'") == '0':
        val(f"insert into public.student_user (auth_user_id, display_name, byu_net_id) values ('{uid}', '{name}', '{email.split('@')[0]}');")
val(f"insert into public.app_admin (auth_user_id) values ('{ADMIN}');")
sid = lambda uid: val(f"select user_id from public.student_user where auth_user_id = '{uid}'")

# Sessions recorded before the change (old way: length = last heartbeat - start).
def old_session(uid, start_min_ago, length_min):
    val(f"""insert into public.user_session (user_id, started_at, last_seen_at)
            values ({sid(uid)}, now() - interval '{start_min_ago} minutes', now() - interval '{start_min_ago} minutes' + interval '{length_min} minutes');""")
old_session(ADMIN, 600, 1)   # admin's first
old_session(ADMIN, 500, 30)  # admin, long: would drag the % down if counted
old_session(AMY, 400, 5)     # Amy's first: left out

ok, _, err = psql(open(os.path.join(MIG_DIR, MIG)).read())
if not ok: raise SystemExit(f'{MIG} failed: {err}')
ok, _, err = psql(open(os.path.join(MIG_DIR, MIG)).read())
check(ok, 'migration can be run twice', err)
check('MISSING' not in val(open(os.path.join(MIG_DIR, MIG)).read().split('every row should say ok.')[1]), 'checklist all ok')

# --- Who can read the numbers ---
ok, _, err = psql('select * from public.okr1_stats();', 'anon')
check(not ok and 'permission denied' in err, 'logged-out visitor cannot call okr1_stats', err)
ok, _, err = psql('select * from public.okr1_stats();', 'authenticated', AMY)
check(not ok and 'Only the team admin' in err, 'student is refused by okr1_stats', err)
ok, out, err = psql('select sessions_counted from public.okr1_stats();', 'authenticated', ADMIN)
check(ok, 'admin can read okr1_stats', err)
for role, uid in [('anon', None), ('authenticated', AMY), ('authenticated', ADMIN)]:
    ok, _, _ = psql('select * from public.user_session;', role, uid)
    check(not ok, f'{role}{" " + uid[-1] if uid else ""} cannot read user_session directly')
    ok, _, _ = psql('select * from public.okr1_session_lengths;', role, uid)
    check(not ok, f'{role}{" " + uid[-1] if uid else ""} cannot read okr1_session_lengths directly')
ok, _, _ = psql("select public.okr_start_session();", 'anon')
check(not ok, 'logged-out visitor cannot start a session')

# --- The admin is never recorded ---
before = val('select count(*) from public.user_session')
out = val('select public.okr_start_session();', 'authenticated', ADMIN)
check(out == '' and val('select count(*) from public.user_session') == before, 'admin start_session records nothing', out)
check(val('select count(*) from public.okr1_session_lengths where display_name = \'Jason\'') == '0', 'old admin sessions left out of the numbers')

# --- Active time reporting ---
amy_s = val('select public.okr_start_session();', 'authenticated', AMY)
check(len(amy_s) == 36, 'student start_session returns an id', amy_s)
# Pretend the session started 6 minutes ago.
val(f"update public.user_session set started_at = now() - interval '6 minutes' where session_id = '{amy_s}'")
check(val(f"select public.okr_heartbeat('{amy_s}', 90);", 'authenticated', AMY) == 't', 'heartbeat with active seconds recorded')
check(val(f"select active_seconds from public.user_session where session_id = '{amy_s}'") == '90', 'active seconds stored')
val(f"select public.okr_heartbeat('{amy_s}', 30);", 'authenticated', AMY)
check(val(f"select active_seconds from public.user_session where session_id = '{amy_s}'") == '90', 'active time cannot go down')
val(f"select public.okr_heartbeat('{amy_s}', 100000);", 'authenticated', AMY)
capped = float(val(f"select active_seconds from public.user_session where session_id = '{amy_s}'"))
check(359 <= capped <= 362, 'active time capped at real time since start (6 min)', capped)
check(val(f"select public.okr_heartbeat('{amy_s}', 5);", 'authenticated', BEN) == 'f', "can't report on someone else's session")
check(float(val(f"select active_seconds from public.user_session where session_id = '{amy_s}'")) == capped, "someone else's report changed nothing")
check(val(f"select public.okr_heartbeat('{amy_s}');", 'authenticated', AMY) == 't', 'old-style heartbeat (no active seconds) still accepted')
check(float(val(f"select active_seconds from public.user_session where session_id = '{amy_s}'")) == capped, 'old-style heartbeat keeps active time')

# --- The numbers ---
# Amy: first (old, left out) + this one (6 min active, now finished) + a long-wall-clock but short-active one.
val(f"update public.user_session set last_seen_at = now() - interval '5 minutes' where session_id = '{amy_s}'")
long_s = val('select public.okr_start_session();', 'authenticated', AMY)
val(f"update public.user_session set started_at = now() - interval '60 minutes', last_seen_at = now() - interval '4 minutes', active_seconds = 240 where session_id = '{long_s}'")
# Ben: first session (left out), a 15-minute active session, and one still open.
ben1 = val('select public.okr_start_session();', 'authenticated', BEN)
val(f"update public.user_session set started_at = now() - interval '300 minutes', last_seen_at = now() - interval '299 minutes', active_seconds = 60 where session_id = '{ben1}'")
ben2 = val('select public.okr_start_session();', 'authenticated', BEN)
val(f"update public.user_session set started_at = now() - interval '100 minutes', last_seen_at = now() - interval '80 minutes', active_seconds = 900 where session_id = '{ben2}'")
ben3 = val('select public.okr_start_session();', 'authenticated', BEN)
val(f"update public.user_session set started_at = now() - interval '20 minutes', last_seen_at = now() - interval '1 minute', active_seconds = 30 where session_id = '{ben3}'")
row = val('select sessions_counted, sessions_under_10, percent_under_10, users_counted, first_sessions, open_sessions, median_minutes from public.okr1_stats();', 'authenticated', ADMIN)
# counted: Amy 6 min, Amy 4 min (60 min wall clock), Ben 15 min -> 2 of 3 under 10 = 66.7%
check(row == '3|2|66.7|2|2|1|6.0', 'okr1_stats uses active time, skips first + open sessions + admin', row)

run(['-d', 'postgres', '-c', f'drop database if exists {DB};'])
print('\nALL PASSED' if not fails else f'\n{fails} FAILED')
raise SystemExit(1 if fails else 0)
