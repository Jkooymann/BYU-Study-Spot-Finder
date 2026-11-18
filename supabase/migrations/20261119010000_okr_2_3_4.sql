-- OKR 2, 3 and 4 trackers (team admin only), next to OKR 1.
--
-- Needs 20261118020000_okr_admin_only_and_active_time.sql (and the private/shared spots
-- migration before it, for app_admin / is_spot_admin()) first.
--
-- WHO COUNTS AS A USER (all four OKRs): a real student account, i.e. a student_user row
-- linked to a login (auth_user_id is set), NOT the team admin account. The old demo
-- accounts from seed.sql have no login and are left out. See view okr_student_accounts.
--
-- OKR 2: 50% of users find a spot within five minutes.
--   Nothing recorded this before, so this file adds spot_search. The site starts a search
--   when a logged-in student turns ON a feature (Get Started choices or the Filter panel)
--   and no search is open, and marks it found when they then open a spot from a spot card
--   or map/floor marker. Both times are stamped by the database clock.
--   A search stays open until a spot is found or 5 minutes pass; a feature turned on
--   after that starts a new search.
--   * Each user is counted once, by their FIRST search: within five minutes = found at most
--     5 minutes after it started. Searches with no spot found count as NOT within five
--     minutes once 5 minutes have passed. A first search still inside its 5 minutes is
--     "in progress" and counted when it finishes.
--     numerator   = users whose first search found a spot within 5 minutes
--     denominator = users with a first search that has finished (found, or 5 minutes passed)
--   * Period: every search since this tracking started.
--
-- OKR 3: at least 80% of users favorite one or more study spots.
--     numerator   = users with at least one favorite right now (each user once)
--     denominator = all users (real student accounts, admin left out)
--   * Period: current favorites (a removed favorite no longer counts), all accounts to date.
--
-- OKR 4: at least 30% of users who have favorited a spot have a favorite outside the library.
--     numerator   = eligible users with at least one favorite NOT in the Harold B. Lee Library
--                   (building_code 'HBLL'); outdoor spots (no building) count as outside
--     denominator = users with at least one favorite (the OKR 3 numerator)
--   * Period: current favorites, same as OKR 3.
--
-- Security: the website can't read or change spot_search directly; it can only call the
-- functions below. okr2_stats / okr3_stats / okr4_stats refuse everyone but the team admin
-- and return totals only. The admin's own searches are never recorded.
--
-- Run it in Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Who counts as a user.
-- ---------------------------------------------------------------------------
create or replace view public.okr_student_accounts
with (security_invoker = true) as
select su.user_id, su.display_name, su.account_created_at
from public.student_user su
where su.auth_user_id is not null
  and not exists (select 1 from public.app_admin a where a.auth_user_id = su.auth_user_id);

revoke all on public.okr_student_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. OKR 2 searches.
-- ---------------------------------------------------------------------------
create table if not exists public.spot_search (
  search_id   uuid primary key default gen_random_uuid(),
  user_id     bigint not null references public.student_user (user_id) on delete cascade,
  started_at  timestamptz not null default now(),
  found_at    timestamptz
);
create index if not exists spot_search_user_started_idx on public.spot_search (user_id, started_at);

alter table public.spot_search enable row level security;
revoke all on public.spot_search from anon, authenticated;
grant all on public.spot_search to service_role;

-- A logged-in student turned on a feature with no search open. Returns the new id, or
-- null when nobody is logged in, the login has no student row, or it's the admin account.
create or replace function public.okr_start_search()
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.spot_search (user_id)
  select su.user_id from public.student_user su
   where auth.uid() is not null and su.auth_user_id = auth.uid()
     and not public.is_spot_admin()
   limit 1
  returning search_id;
$$;

-- The student opened a spot card. Only the first one counts, and only on their own search.
create or replace function public.okr_spot_found(p_search_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.spot_search ss
       set found_at = now()
      from public.student_user su
     where ss.search_id = p_search_id
       and ss.found_at is null
       and su.user_id = ss.user_id
       and auth.uid() is not null
       and su.auth_user_id = auth.uid()
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- Every search with its outcome, admin and demo accounts left out.
-- Handy in the SQL Editor:  select * from okr2_searches order by started_at desc;
create or replace view public.okr2_searches
with (security_invoker = true) as
select
  ss.search_id,
  ss.user_id,
  sa.display_name,
  ss.started_at,
  ss.found_at,
  round(extract(epoch from ss.found_at - ss.started_at) / 60.0, 1)                as minutes_to_find,
  ss.found_at is not null and ss.found_at - ss.started_at <= interval '5 minutes' as within_5,
  ss.found_at is null and ss.started_at > now() - interval '5 minutes'            as in_progress,
  row_number() over (partition by ss.user_id order by ss.started_at) = 1          as is_first_search
from public.spot_search ss
join public.okr_student_accounts sa on sa.user_id = ss.user_id;

revoke all on public.okr2_searches from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The numbers. Each refuses anyone but the team admin.
-- ---------------------------------------------------------------------------
drop function if exists public.okr2_stats();
create function public.okr2_stats()
returns table (
  users_counted        bigint,   -- users whose first search has finished
  users_within_5       bigint,   -- ...and found a spot within 5 minutes
  percent_within_5     numeric,  -- null when there is nothing to count yet
  target_percent       numeric,
  users_not_found      bigint,   -- first search: no spot within 5 minutes (slow or gave up)
  users_in_progress    bigint,   -- first search still inside its 5 minutes
  searches_total       bigint,   -- every finished search (all of them, not only first)
  searches_within_5    bigint,
  median_minutes       numeric,  -- time to find, first searches that found a spot
  tracking_since       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_spot_admin() then
    raise exception 'Only the team admin account can see OKR numbers.' using errcode = '42501';
  end if;
  return query
  with s as (select * from public.okr2_searches),
       firsts as (select * from s where is_first_search),
       counted as (select * from firsts where not in_progress)
  select
    (select count(*) from counted),
    (select count(*) from counted where within_5),
    (select round(100.0 * count(*) filter (where within_5) / nullif(count(*), 0), 1) from counted),
    50.0::numeric,
    (select count(*) from counted where not within_5),
    (select count(*) from firsts where in_progress),
    (select count(*) from s where not in_progress),
    (select count(*) from s where within_5),
    (select round((percentile_cont(0.5) within group (order by minutes_to_find))::numeric, 1)
       from counted where found_at is not null),
    (select min(started_at) from s);
end;
$$;

drop function if exists public.okr3_stats();
create function public.okr3_stats()
returns table (
  users_counted        bigint,   -- every real student account
  users_with_favorite  bigint,   -- at least one favorite (each user once)
  percent_with_favorite numeric,
  target_percent       numeric,
  favorites_total      bigint,
  median_favorites     numeric   -- among users with at least one
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_spot_admin() then
    raise exception 'Only the team admin account can see OKR numbers.' using errcode = '42501';
  end if;
  return query
  with per_user as (
    select sa.user_id, count(f.study_spot_id) as favorites
    from public.okr_student_accounts sa
    left join public.favorite_spot f on f.user_id = sa.user_id
    group by sa.user_id
  )
  select
    (select count(*) from per_user),
    (select count(*) from per_user where favorites > 0),
    (select round(100.0 * count(*) filter (where favorites > 0) / nullif(count(*), 0), 1) from per_user),
    80.0::numeric,
    (select coalesce(sum(favorites), 0)::bigint from per_user),
    (select round((percentile_cont(0.5) within group (order by favorites))::numeric, 1) from per_user where favorites > 0);
end;
$$;

drop function if exists public.okr4_stats();
create function public.okr4_stats()
returns table (
  users_counted        bigint,   -- users with at least one favorite
  users_outside        bigint,   -- ...with at least one favorite outside the library (each user once)
  percent_outside      numeric,
  target_percent       numeric,
  users_library_only   bigint,
  favorites_in_library bigint,
  favorites_outside    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_spot_admin() then
    raise exception 'Only the team admin account can see OKR numbers.' using errcode = '42501';
  end if;
  return query
  with favs as (
    select f.user_id, coalesce(b.building_code = 'HBLL', false) as in_library
    from public.favorite_spot f
    join public.okr_student_accounts sa on sa.user_id = f.user_id
    join public.study_spot sp on sp.study_spot_id = f.study_spot_id
    left join public.building b on b.building_id = sp.building_id   -- outdoor spots have no building
  ),
  per_user as (
    select user_id, bool_or(not in_library) as has_outside from favs group by user_id
  )
  select
    (select count(*) from per_user),
    (select count(*) from per_user where has_outside),
    (select round(100.0 * count(*) filter (where has_outside) / nullif(count(*), 0), 1) from per_user),
    30.0::numeric,
    (select count(*) from per_user where not has_outside),
    (select count(*) from favs where in_library),
    (select count(*) from favs where not in_library);
end;
$$;

revoke all on function public.okr_start_search()        from public, anon;
revoke all on function public.okr_spot_found(uuid)      from public, anon;
revoke all on function public.okr2_stats()              from public, anon;
revoke all on function public.okr3_stats()              from public, anon;
revoke all on function public.okr4_stats()              from public, anon;
grant execute on function public.okr_start_search()     to authenticated;
grant execute on function public.okr_spot_found(uuid)   to authenticated;
grant execute on function public.okr2_stats()           to authenticated;  -- refuses non-admins inside
grant execute on function public.okr3_stats()           to authenticated;
grant execute on function public.okr4_stats()           to authenticated;

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status from (values
  ('spot_search table has RLS on',
   coalesce((select relrowsecurity from pg_class where oid = 'public.spot_search'::regclass), false)),
  ('website roles cannot read spot_search',
   not has_table_privilege('authenticated', 'public.spot_search', 'select') and not has_table_privilege('anon', 'public.spot_search', 'select')),
  ('logged-out visitors cannot call okr2/3/4_stats',
   not has_function_privilege('anon', 'public.okr2_stats()', 'execute')
   and not has_function_privilege('anon', 'public.okr3_stats()', 'execute')
   and not has_function_privilege('anon', 'public.okr4_stats()', 'execute')),
  ('library building HBLL exists',
   exists (select 1 from public.building where building_code = 'HBLL')),
  ('admin account chosen (app_admin)',
   exists (select 1 from public.app_admin))
) as checks(item, good);

-- ---------------------------------------------------------------------------
-- Undo (only to remove OKRs 2-4). Select these lines and Run:
--   drop function if exists public.okr4_stats();
--   drop function if exists public.okr3_stats();
--   drop function if exists public.okr2_stats();
--   drop function if exists public.okr_spot_found(uuid);
--   drop function if exists public.okr_start_search();
--   drop view if exists public.okr2_searches;
--   drop table if exists public.spot_search;
--   drop view if exists public.okr_student_accounts;
-- ---------------------------------------------------------------------------
