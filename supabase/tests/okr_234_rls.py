"""Checks the OKR 2, 3 and 4 numbers and access rules (supabase/migrations/*_okr_2_3_4.sql)
in a throwaway local Postgres set up like Supabase. Does NOT touch the real Supabase project.

    python3 supabase/tests/okr_234_rls.py

Same setup as private_shared_spots_rls.py (PGHOST / PGPORT / PGUSER; database okr234_test is
dropped and recreated). Builds a small, known set of students, spots, favorites and searches,
so every expected number below can be worked out by hand, then checks:
  * only the admin can read okr2/3/4_stats; students are refused; logged-out visitors can't call them
  * the website can't read spot_search; a student can't mark someone else's search found
  * the admin and the old demo accounts (no login) are left out of every number
  * OKR 2 counts each user once by their first search, includes searches with no spot found,
    and leaves out first searches still inside their 5 minutes
  * OKR 3 counts each user once; OKR 4 counts each user with favorites once, outdoor = outside
"""
import os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
MIG_DIR = os.path.join(SUPA, 'migrations')
MIG = next(f for f in sorted(os.listdir(MIG_DIR)) if f.endswith('_okr_2_3_4.sql'))
DB = 'okr234_test'
CONN = ['-h', os.environ.get('PGHOST', '127.0.0.1'), '-p', os.environ.get('PGPORT', '5432'), '-U', os.environ.get('PGUSER', 'postgres')]
fails = 0
STUB = open(os.path.join(HERE, 'private_shared_spots_rls.py')).read().split('STUB = """', 1)[1].split('"""', 1)[0]

def run(args, sql=''):
    return subprocess.run(['psql', *CONN, '-qtAX', '-v', 'ON_ERROR_STOP=1', *args], input=sql, capture_output=True, text=True)

def psql(sql, role=None, uid=None):
    pre = (f"set role {role};\n" if role else '') + (f"select set_config('request.jwt.claim.sub', '{uid}', false) \\gset\n" if uid else '')
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
val(open(os.path.join(SUPA, 'seed.sql')).read())   # buildings (HBLL) + 4 demo accounts with no login

# Accounts: the admin and four real students.
U = {name: f'b0000000-0000-0000-0000-00000000000{i}' for i, name in enumerate(['jason', 'amy', 'ben', 'cat', 'dan'], 1)}
for name, uid in U.items():
    val(f"""insert into auth.users (id, email, raw_user_meta_data) values ('{uid}', '{name}@byu.edu', '{{"display_name": "{name}"}}');""")
    if val(f"select count(*) from public.student_user where auth_user_id = '{uid}'") == '0':
        val(f"insert into public.student_user (auth_user_id, display_name, byu_net_id, byu_email) values ('{uid}', '{name}', '{name}', '{name}@byu.edu');")
val(f"insert into public.app_admin (auth_user_id) values ('{U['jason']}');")
sid = {name: val(f"select user_id from public.student_user where auth_user_id = '{uid}'") for name, uid in U.items()}
demo = val("select user_id from public.student_user where auth_user_id is null order by user_id limit 1")

ok, _, err = psql(open(os.path.join(MIG_DIR, MIG)).read())
if not ok: raise SystemExit(f'{MIG} failed: {err}')
ok, _, err = psql(open(os.path.join(MIG_DIR, MIG)).read())
check(ok, 'migration can be run twice', err)
check('MISSING' not in val(open(os.path.join(MIG_DIR, MIG)).read().split('every row should say ok.')[1]), 'checklist all ok')

# Spots (added by SQL, like the team's shared spots): one in the library, one in another building, one outdoors.
lib = val("insert into public.study_spot (building_id, spot_name, floor_number, is_shared) select building_id, 'Library 3rd floor', 3, true from public.building where building_code = 'HBLL' returning study_spot_id;")
jkb = val("insert into public.study_spot (building_id, spot_name, floor_number, is_shared) select building_id, 'JKB atrium', 1, true from public.building where building_code <> 'HBLL' order by building_id limit 1 returning study_spot_id;")
out = val("insert into public.study_spot (building_id, spot_name, is_indoors, campus_map_x_percent, campus_map_y_percent, is_shared) values (null, 'Quad bench', false, 40, 60, true) returning study_spot_id;")

# Favorites, added the way the site does it (as each student).
def fav(name, spot):
    val(f"insert into public.favorite_spot (user_id, study_spot_id) values ({sid[name]}, {spot});", 'authenticated', U[name])
fav('amy', lib)                      # library only
fav('ben', lib); fav('ben', out)     # library + outdoor -> outside
fav('cat', jkb)                      # other building -> outside
fav('jason', jkb)                    # admin: left out
val(f"insert into public.favorite_spot (user_id, study_spot_id) values ({demo}, {jkb});")   # demo account: left out
# dan: no favorites

# --- Who can read the numbers ---
for fn in ['okr2_stats', 'okr3_stats', 'okr4_stats']:
    ok, _, err = psql(f'select * from public.{fn}();', 'anon')
    check(not ok and 'permission denied' in err, f'logged-out visitor cannot call {fn}', err)
    ok, _, err = psql(f'select * from public.{fn}();', 'authenticated', U['amy'])
    check(not ok and 'Only the team admin' in err, f'student is refused by {fn}', err)
for role, uid in [('anon', None), ('authenticated', U['amy']), ('authenticated', U['jason'])]:
    for rel in ['spot_search', 'okr2_searches', 'okr_student_accounts']:
        ok, _, _ = psql(f'select * from public.{rel};', role, uid)
        check(not ok, f'{role}{" " + uid[-1] if uid else ""} cannot read {rel} directly')

# --- OKR 3 ---
row = val('select users_counted, users_with_favorite, percent_with_favorite, target_percent, favorites_total, median_favorites from public.okr3_stats();', 'authenticated', U['jason'])
# users: amy ben cat dan (admin + demo left out); with a favorite: amy ben cat; favorites 1+2+1
check(row == '4|3|75.0|80.0|4|1.0', 'OKR 3: each user once, admin and demo accounts left out', row)

# --- OKR 4 ---
row = val('select users_counted, users_outside, percent_outside, target_percent, users_library_only, favorites_in_library, favorites_outside from public.okr4_stats();', 'authenticated', U['jason'])
# eligible: amy ben cat; outside: ben (outdoor) + cat (other building); library only: amy
check(row == '3|2|66.7|30.0|1|2|2', 'OKR 4: eligible users once, outdoor and other buildings count as outside', row)

# --- OKR 2 ---
def search(name):
    return val('select public.okr_start_search();', 'authenticated', U[name])
check(val('select public.okr_start_search();', 'authenticated', U['jason']) == '', 'admin searches are not recorded')
ok, _, _ = psql('select public.okr_start_search();', 'anon')
check(not ok, 'logged-out visitor cannot start a search')
a1, a2, b1, c1, d1 = search('amy'), search('amy'), search('ben'), search('cat'), search('dan')
check(all(len(x) == 36 for x in [a1, a2, b1, c1, d1]), 'students can start searches')
check(val(f"select public.okr_spot_found('{a1}');", 'authenticated', U['ben']) == 'f', "can't mark someone else's search found")
check(val(f"select found_at is null from public.spot_search where search_id = '{a1}'") == 't', "someone else's attempt changed nothing")
for s_ in [a1, b1]:
    check(val(f"select public.okr_spot_found('{s_}');", 'authenticated', U['amy' if s_ == a1 else 'ben']) == 't', 'own search marked found')
check(val(f"select public.okr_spot_found('{a1}');", 'authenticated', U['amy']) == 'f', 'a search is found only once')
# Set the times (minutes ago) so the outcome is known.
def times(s_, started, found=None):
    f_ = f"now() - interval '{started} minutes' + interval '{found} minutes'" if found is not None else 'null'
    val(f"update public.spot_search set started_at = now() - interval '{started} minutes', found_at = {f_} where search_id = '{s_}'")
times(a1, 30, 3)    # amy first: found in 3 min -> within
times(a2, 8)        # amy second: nothing found (not first, but in "all searches")
times(b1, 20, 7)    # ben first: found in 7 min -> not within
times(c1, 15)       # cat first: never found, 15 min ago -> counts as not within
times(d1, 1)        # dan first: 1 min ago, still inside 5 minutes -> in progress, left out
# The admin's old activity can't sneak in either: a search row recorded for them directly.
val(f"insert into public.spot_search (user_id, started_at, found_at) values ({sid['jason']}, now() - interval '50 minutes', now() - interval '49 minutes');")
row = val('select users_counted, users_within_5, percent_within_5, target_percent, users_not_found, users_in_progress, searches_total, searches_within_5, median_minutes from public.okr2_stats();', 'authenticated', U['jason'])
check(row == '3|1|33.3|50.0|2|1|4|1|5.0', 'OKR 2: first search per user, not-found counted, in-progress and admin left out', row)

run(['-d', 'postgres', '-c', f'drop database if exists {DB};'])
print('\nALL PASSED' if not fails else f'\n{fails} FAILED')
raise SystemExit(1 if fails else 0)
