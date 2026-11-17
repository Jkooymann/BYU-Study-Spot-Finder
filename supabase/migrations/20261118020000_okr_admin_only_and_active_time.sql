-- OKR trackers: admin-only numbers, admin left out, active time only.
--
-- Needs 20261116220000_okr1_session_tracking.sql and
-- 20261118010000_private_and_shared_spots.sql (for app_admin / is_spot_admin()) first.
--
-- What changes:
--   * Only the designated admin account (public.app_admin) can read the OKR numbers.
--     okr1_stats() refuses everyone else, including logged-out visitors. The admin is
--     checked by the database from the login, not by anything the browser sends.
--   * The admin account's activity is never recorded (okr_start_session returns null for
--     it) and is left out of every calculation, including sessions it recorded before.
--   * Session length is now ACTIVE time, measured by the site: time stops two minutes after
--     the last click / tap / key / scroll, and while the page is hidden. A student who comes
--     back after that starts a new session. The site reports the running total with each
--     heartbeat (okr_heartbeat's new p_active_seconds). The database keeps the total from
--     going down and from ever being more than the real time since the session started.
--   * A session counts as finished once it hasn't been heard from for 3 minutes (two-minute
--     idle cutoff plus some slack for slow networks).
--   * Sessions recorded before this change have no active time; they keep their old length
--     (last heartbeat - start). See the note at the bottom to clear them instead.
--
-- Run it in Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Active time for each session (null for sessions from before this change).
-- ---------------------------------------------------------------------------
alter table public.user_session add column if not exists active_seconds numeric;

-- ---------------------------------------------------------------------------
-- 2. Don't record the admin account at all.
-- ---------------------------------------------------------------------------
create or replace function public.okr_start_session()
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.user_session (user_id, active_seconds)
  select su.user_id, 0 from public.student_user su
   where auth.uid() is not null and su.auth_user_id = auth.uid()
     and not public.is_spot_admin()
   limit 1
  returning session_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Heartbeat, now with the session's active time so far.
--    Returns true = recorded, false = not this student's session (start a new one).
--    p_active_seconds is optional so a browser still running the old site keeps working.
-- ---------------------------------------------------------------------------
drop function if exists public.okr_heartbeat(uuid);
create or replace function public.okr_heartbeat(p_session_id uuid, p_active_seconds numeric default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.user_session us
       set last_seen_at = now(),
           active_seconds = case
             when p_active_seconds is null then us.active_seconds
             -- never goes down, never more than the real time since the session started
             else least(greatest(coalesce(us.active_seconds, 0), p_active_seconds),
                        extract(epoch from now() - us.started_at))
           end
      from public.student_user su
     where us.session_id = p_session_id
       and su.user_id = us.user_id
       and auth.uid() is not null
       and su.auth_user_id = auth.uid()
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- ---------------------------------------------------------------------------
-- 4. Every student session with its length. The admin account is left out, so it
--    doesn't count toward anything (including which session is a student's first).
--    Handy in the SQL Editor:  select * from okr1_session_lengths order by started_at desc;
--    Not readable from the website.
-- ---------------------------------------------------------------------------
drop view if exists public.okr1_session_lengths;
create view public.okr1_session_lengths
with (security_invoker = true) as
with s as (
  select
    us.session_id,
    us.user_id,
    su.display_name,
    us.started_at,
    us.last_seen_at,
    coalesce(us.active_seconds, extract(epoch from us.last_seen_at - us.started_at)) as seconds,
    us.active_seconds is not null as active_time_measured
  from public.user_session us
  join public.student_user su on su.user_id = us.user_id
  where not exists (select 1 from public.app_admin a where a.auth_user_id = su.auth_user_id)
)
select
  session_id,
  user_id,
  display_name,
  started_at,
  last_seen_at,
  make_interval(secs => seconds)                                      as session_length,
  round(seconds / 60.0, 1)                                            as minutes,
  active_time_measured,
  row_number() over (partition by user_id order by started_at) = 1    as is_first_session,
  last_seen_at > now() - interval '3 minutes'                         as still_open
from s;

revoke all on public.okr1_session_lengths from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The OKR 1 number, for the admin's OKR Trackers page only.
-- ---------------------------------------------------------------------------
drop function if exists public.okr1_stats();
create function public.okr1_stats()
returns table (
  sessions_counted     bigint,   -- finished sessions, first sessions left out
  sessions_under_10    bigint,
  percent_under_10     numeric,  -- null when there is nothing to count yet
  target_percent       numeric,
  users_counted        bigint,   -- students with at least one counted session
  first_sessions       bigint,   -- left out on purpose
  open_sessions        bigint,   -- still going, counted once they end
  median_minutes       numeric
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
  with s as (select * from public.okr1_session_lengths),
       counted as (select * from s where not is_first_session and not still_open)
  select
    (select count(*) from counted),
    (select count(*) from counted where session_length < interval '10 minutes'),
    (select round(100.0 * count(*) filter (where session_length < interval '10 minutes')
                  / nullif(count(*), 0), 1) from counted),
    80.0::numeric,
    (select count(distinct user_id) from counted),
    (select count(*) from s where is_first_session),
    (select count(*) from s where still_open),
    (select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) from counted);
end;
$$;

revoke all on function public.okr_start_session()                from public, anon;
revoke all on function public.okr_heartbeat(uuid, numeric)       from public, anon;
revoke all on function public.okr1_stats()                       from public, anon;
grant execute on function public.okr_start_session()             to authenticated;
grant execute on function public.okr_heartbeat(uuid, numeric)    to authenticated;
grant execute on function public.okr1_stats()                    to authenticated;  -- refuses non-admins inside

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status from (values
  ('user_session.active_seconds column',
   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_session' and column_name = 'active_seconds')),
  ('logged-out visitors cannot call okr1_stats',
   not has_function_privilege('anon', 'public.okr1_stats()', 'execute')),
  ('heartbeat takes active time',
   to_regprocedure('public.okr_heartbeat(uuid, numeric)') is not null),
  ('old heartbeat removed',
   to_regprocedure('public.okr_heartbeat(uuid)') is null),
  ('admin account chosen (app_admin)',
   exists (select 1 from public.app_admin))
) as checks(item, good);

-- ---------------------------------------------------------------------------
-- Optional: start the numbers fresh. Sessions recorded before this change were
-- measured the old way (no idle cutoff). To drop them, select this line and Run:
--   delete from public.user_session where active_seconds is null;
-- ---------------------------------------------------------------------------
