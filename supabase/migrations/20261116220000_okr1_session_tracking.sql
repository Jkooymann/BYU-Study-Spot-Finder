-- PROTOTYPE: OKR 1 session tracking. Not merged to main yet.
--
-- OKR 1: "80% of users spend less than 10 minutes in a single session,
--         discounting their first session."
--
-- How it works
--   * Every browser tab that opens the site starts one session row
--     (okr_start_session). Reloading the same tab keeps the same session; a new
--     tab, or reopening after closing the tab, starts a new one.
--   * While the tab is visible the site calls okr_heartbeat every 30 seconds,
--     which sets last_seen_at to the database's own clock (the browser can't
--     fake a time).
--   * Session length = last_seen_at - started_at.
--   * okr1_stats() skips each user's first session, skips sessions that are
--     still open (heard from in the last 2 minutes), and returns the % of the
--     rest that were under 10 minutes.
--
-- Who is the "user"? For now an anonymous id the browser keeps in localStorage
-- (tracking_user_id is text so it can hold that). When login is finished the
-- site will send the logged-in student's id instead; nothing here has to change.
--
-- Security: the browser can't read or change the table directly. It can only
-- call the three functions below. A heartbeat needs the session's random id,
-- which only the tab that started it knows. okr1_stats returns totals only.
--
-- Paste the whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once. To remove it all, run the "Undo" block at the end.

create table if not exists public.user_session (
  session_id        uuid primary key default gen_random_uuid(),
  tracking_user_id  text not null check (length(tracking_user_id) between 1 and 100),
  started_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);

create index if not exists user_session_user_started_idx
  on public.user_session (tracking_user_id, started_at);

alter table public.user_session enable row level security;
revoke all on public.user_session from anon, authenticated;
grant all on public.user_session to service_role;

-- ---------------------------------------------------------------------------
-- Start a session. Returns the new session id.
-- ---------------------------------------------------------------------------
create or replace function public.okr_start_session(p_tracking_user_id text)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.user_session (tracking_user_id)
  values (left(p_tracking_user_id, 100))
  returning session_id;
$$;

-- ---------------------------------------------------------------------------
-- "This tab is still open." Returns false if the session id is unknown, so the
-- site can start a fresh session (for example after the table was reset).
-- ---------------------------------------------------------------------------
create or replace function public.okr_heartbeat(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.user_session
       set last_seen_at = now()
     where session_id = p_session_id
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- ---------------------------------------------------------------------------
-- Every session with its length and whether it was that user's first one.
-- Handy in the SQL Editor:  select * from okr1_session_lengths order by started_at desc;
-- Not readable from the website.
-- ---------------------------------------------------------------------------
create or replace view public.okr1_session_lengths
with (security_invoker = true) as
select
  session_id,
  tracking_user_id,
  started_at,
  last_seen_at,
  last_seen_at - started_at                                   as session_length,
  round(extract(epoch from last_seen_at - started_at) / 60.0, 1) as minutes,
  row_number() over (partition by tracking_user_id order by started_at) = 1 as is_first_session,
  last_seen_at > now() - interval '2 minutes'                 as still_open
from public.user_session;

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
  users_counted        bigint,   -- users with at least one counted session
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
    (select count(distinct tracking_user_id) from counted),
    (select count(*) from s where is_first_session),
    (select count(*) from s where still_open),
    (select round((percentile_cont(0.5) within group (order by minutes))::numeric, 1) from counted);
$$;

revoke all on function public.okr_start_session(text) from public;
revoke all on function public.okr_heartbeat(uuid)    from public;
revoke all on function public.okr1_stats()            from public;
grant execute on function public.okr_start_session(text) to anon, authenticated;
grant execute on function public.okr_heartbeat(uuid)    to anon, authenticated;
grant execute on function public.okr1_stats()            to anon, authenticated;

select 'OKR 1 session tracking ready' as status;

-- ---------------------------------------------------------------------------
-- Undo (only if you want to remove the prototype). Select these lines and Run:
--   drop function if exists public.okr1_stats();
--   drop function if exists public.okr_heartbeat(uuid);
--   drop function if exists public.okr_start_session(text);
--   drop view if exists public.okr1_session_lengths;
--   drop table if exists public.user_session;
-- ---------------------------------------------------------------------------
