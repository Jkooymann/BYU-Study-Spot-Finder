-- OKR 1 session tracking.
--
-- OKR 1: "80% of users spend less than 10 minutes in a single session,
--         discounting their first session."
--
-- How it works
--   * Every browser tab where a student is logged in starts one session row
--     (okr_start_session). Reloading the same tab keeps the same session; a new
--     tab, reopening after closing the tab, or logging in again starts a new one.
--     Logged-out visitors are not tracked.
--   * While the tab is visible the site calls okr_heartbeat every 30 seconds,
--     which sets last_seen_at to the database's own clock (the browser can't
--     fake a time).
--   * Session length = last_seen_at - started_at.
--   * okr1_stats() skips each student's first session, skips sessions that are
--     still open (heard from in the last 2 minutes), and returns the % of the
--     rest that were under 10 minutes.
--
-- Who is the "user"? The logged-in student (student_user.user_id). The
-- database works it out from the login (auth.uid()), so nobody can record
-- sessions for someone else.
--
-- Security: the browser can't read or change the table directly. It can only
-- call the three functions below. okr1_stats returns totals only.
--
-- Paste the whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once. To remove it all, run the "Undo" block at the end.

-- The first prototype (Nov 16) stored an anonymous browser id. If that version
-- of the table is here, remove it; it only held test sessions.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'user_session'
               and column_name = 'tracking_user_id') then
    drop view if exists public.okr1_session_lengths;
    drop table public.user_session;
  end if;
end $$;
drop function if exists public.okr_start_session(text);

create table if not exists public.user_session (
  session_id    uuid primary key default gen_random_uuid(),
  user_id       bigint not null references public.student_user (user_id) on delete cascade,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists user_session_user_started_idx
  on public.user_session (user_id, started_at);

alter table public.user_session enable row level security;
revoke all on public.user_session from anon, authenticated;
grant all on public.user_session to service_role;

-- ---------------------------------------------------------------------------
-- Start a session for whoever is logged in. Returns the new session id, or
-- null when nobody is logged in (or the login has no student_user row).
-- ---------------------------------------------------------------------------
create or replace function public.okr_start_session()
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.user_session (user_id)
  select su.user_id from public.student_user su
   where auth.uid() is not null and su.auth_user_id = auth.uid()
   limit 1
  returning session_id;
$$;

-- ---------------------------------------------------------------------------
-- "This tab is still open." Returns false if the session id is unknown or
-- belongs to someone else, so the site starts a fresh session.
-- ---------------------------------------------------------------------------
create or replace function public.okr_heartbeat(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.user_session us
       set last_seen_at = now()
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
-- Every session with its length and whether it was that student's first one.
-- Handy in the SQL Editor:  select * from okr1_session_lengths order by started_at desc;
-- Not readable from the website.
-- ---------------------------------------------------------------------------
create or replace view public.okr1_session_lengths
with (security_invoker = true) as
select
  us.session_id,
  us.user_id,
  su.display_name,
  us.started_at,
  us.last_seen_at,
  us.last_seen_at - us.started_at                                   as session_length,
  round(extract(epoch from us.last_seen_at - us.started_at) / 60.0, 1) as minutes,
  row_number() over (partition by us.user_id order by us.started_at) = 1 as is_first_session,
  us.last_seen_at > now() - interval '2 minutes'                     as still_open
from public.user_session us
join public.student_user su on su.user_id = us.user_id;

revoke all on public.okr1_session_lengths from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The OKR 1 number, for the stats panel.
-- ---------------------------------------------------------------------------
create or replace function public.okr1_stats()
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
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.okr1_session_lengths),
       counted as (select * from s where not is_first_session and not still_open)
  select
    (select count(*) from counted),
    (select count(*) from counted where session_length < interval '10 minutes'),
    (select round(100.0 * count(*) filter (where session_length < interval '10 minutes')
                  / nullif(count(*), 0), 1) from counted),
    80.0,
    (select count(distinct user_id) from counted),
    (select count(*) from s where is_first_session),
    (select count(*) from s where still_open),
    (select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) from counted);
$$;

revoke all on function public.okr_start_session()     from public;
revoke all on function public.okr_heartbeat(uuid)    from public;
revoke all on function public.okr1_stats()            from public;
grant execute on function public.okr_start_session()     to authenticated;
grant execute on function public.okr_heartbeat(uuid)    to authenticated;
grant execute on function public.okr1_stats()            to anon, authenticated;

select 'OKR 1 session tracking ready' as status;

-- ---------------------------------------------------------------------------
-- Undo (only if you want to remove the prototype). Select these lines and Run:
--   drop function if exists public.okr1_stats();
--   drop function if exists public.okr_heartbeat(uuid);
--   drop function if exists public.okr_start_session();
--   drop view if exists public.okr1_session_lengths;
--   drop table if exists public.user_session;
-- ---------------------------------------------------------------------------
