-- Private spots for students, shared spots from one team admin account.
--
-- What changes:
--   * Spots a regular student adds are PRIVATE: only that student sees them (while logged in).
--   * Spots the designated admin account adds are SHARED: everyone sees them, logged in or not.
--   * Everyone sees all shared spots plus their own private spots. The admin does NOT see
--     other students' private spots.
--   * Only the admin can add or delete shared spots. Nobody can edit a spot's sharing.
--
-- Who the admin is lives in public.app_admin. The website's keys (anon / authenticated)
-- cannot read or change that table at all; only the SQL Editor (or the service role) can.
-- It holds at most one account. Spot sharing is set by the database when a spot is added,
-- never by the browser, so editing a request or the site's code can't create a shared spot.
--
-- Existing spots: every spot that exists when this first runs was visible to everyone
-- before, so they are all marked shared (decided 2026-11-18). Nothing private is exposed,
-- and nothing disappears.
--
-- Run it in Supabase → SQL Editor → New query → Run. Safe to run more than once.
-- THEN do step 2 at the bottom (choose the admin account) by hand.

begin;

-- ---------------------------------------------------------------------------
-- 1. Shared flag. The one-time "mark existing spots shared" only happens when the
--    column is first added, so running this file again never shares private spots.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'study_spot' and column_name = 'is_shared'
  ) then
    alter table public.study_spot add column is_shared boolean not null default false;
    update public.study_spot set is_shared = true;
  end if;
end $$;

create index if not exists study_spot_is_shared_idx on public.study_spot (is_shared);

-- ---------------------------------------------------------------------------
-- 2. The admin account (server-controlled).
-- ---------------------------------------------------------------------------
create table if not exists public.app_admin (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  note         text,
  added_at     timestamptz not null default now()
);
-- At most one admin account.
create unique index if not exists app_admin_only_one on public.app_admin ((true));

alter table public.app_admin enable row level security;
revoke all on public.app_admin from anon, authenticated;
-- No policies on purpose: nobody using the website can read, add, or remove admins.

-- Is the logged-in person the admin? (false when logged out)
create or replace function public.is_spot_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admin where auth_user_id = (select auth.uid()))
$$;
revoke all on function public.is_spot_admin() from public;
grant execute on function public.is_spot_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The database decides whether a new spot is shared: shared if (and only if) the
--    admin adds it. Whatever the browser sends for is_shared is replaced.
--    Inserts with no logged-in user (SQL Editor, service role) keep the value given,
--    so the team can still add shared spots by SQL. The website's logged-out role
--    can't insert spots at all (see step 4).
-- ---------------------------------------------------------------------------
create or replace function public.set_spot_sharing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.is_shared := public.is_spot_admin();
  end if;
  return new;
end;
$$;

drop trigger if exists study_spot_set_sharing on public.study_spot;
create trigger study_spot_set_sharing
  before insert on public.study_spot
  for each row execute function public.set_spot_sharing();

-- ---------------------------------------------------------------------------
-- 4. Study spots: who can read, add, and delete. (No one can update.)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.study_spot from anon;
revoke update on public.study_spot from authenticated;
grant select on public.study_spot to anon, authenticated;
grant insert, delete on public.study_spot to authenticated;

drop policy if exists "Anyone can read study spots" on public.study_spot;
drop policy if exists "Read shared spots and your own" on public.study_spot;
create policy "Read shared spots and your own"
  on public.study_spot for select to anon, authenticated
  using (is_shared or submitted_by_user_id = (select public.current_student_id()));

drop policy if exists "Students can add their own spots" on public.study_spot;
drop policy if exists "Add your own spots; only the admin's are shared" on public.study_spot;
create policy "Add your own spots; only the admin's are shared"
  on public.study_spot for insert to authenticated
  with check (
    is_sample_spot = false
    and submitted_by_user_id = (select public.current_student_id())
    and is_shared = (select public.is_spot_admin())
  );

drop policy if exists "Students can delete their own spots" on public.study_spot;
drop policy if exists "Delete your private spots; admin deletes shared spots" on public.study_spot;
create policy "Delete your private spots; admin deletes shared spots"
  on public.study_spot for delete to authenticated
  using (
    is_sample_spot = false
    and (
      (not is_shared and submitted_by_user_id = (select public.current_student_id()))
      or (is_shared and (select public.is_spot_admin()))
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Things attached to spots follow the spot's visibility.
--    (The study_spot read rule above applies inside these checks.)
-- ---------------------------------------------------------------------------
-- Tags (amenities) of a spot: read only for spots you can see. Adding tags is still
-- limited to spots you added ("Students can tag their own spots").
revoke insert, update, delete on public.study_spot_amenity from anon;
revoke update, delete on public.study_spot_amenity from authenticated;
drop policy if exists "Anyone can read study spot amenities" on public.study_spot_amenity;
drop policy if exists "Read tags of spots you can see" on public.study_spot_amenity;
create policy "Read tags of spots you can see"
  on public.study_spot_amenity for select to anon, authenticated
  using (exists (select 1 from public.study_spot s where s.study_spot_id = study_spot_amenity.study_spot_id));

-- Ratings (not used by the site any more): same rule, if the table still exists.
-- (The live database no longer has spot_rating, so this part is skipped there.)
do $$
begin
  if to_regclass('public.spot_rating') is not null then
    drop policy if exists "Anyone can read spot ratings" on public.spot_rating;
    drop policy if exists "Read ratings of spots you can see" on public.spot_rating;
    create policy "Read ratings of spots you can see"
      on public.spot_rating for select to anon, authenticated
      using (exists (select 1 from public.study_spot s where s.study_spot_id = spot_rating.study_spot_id));
  end if;
end $$;

-- Favorites: replace the demo rules (anyone could read or change anyone's favorites)
-- with your own favorites only, and only on spots you can see. Otherwise a student could
-- favorite someone else's private spot by guessing its id.
revoke all on public.favorite_spot from anon;
revoke update on public.favorite_spot from authenticated;
grant select, insert, delete on public.favorite_spot to authenticated;
drop policy if exists "Demo: anyone can read favorites" on public.favorite_spot;
drop policy if exists "Demo: anyone can add favorites" on public.favorite_spot;
drop policy if exists "Demo: anyone can remove favorites" on public.favorite_spot;
drop policy if exists "Read your own favorites" on public.favorite_spot;
drop policy if exists "Favorite spots you can see" on public.favorite_spot;
drop policy if exists "Remove your own favorites" on public.favorite_spot;
create policy "Read your own favorites"
  on public.favorite_spot for select to authenticated
  using (user_id = (select public.current_student_id()));
create policy "Favorite spots you can see"
  on public.favorite_spot for insert to authenticated
  with check (
    user_id = (select public.current_student_id())
    and exists (select 1 from public.study_spot s where s.study_spot_id = favorite_spot.study_spot_id)
  );
create policy "Remove your own favorites"
  on public.favorite_spot for delete to authenticated
  using (user_id = (select public.current_student_id()));

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status from (values
  ('study_spot.is_shared column',
   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'study_spot' and column_name = 'is_shared')),
  ('app_admin table has RLS on',
   coalesce((select relrowsecurity from pg_class where oid = 'public.app_admin'::regclass), false)),
  ('website roles cannot read app_admin',
   not has_table_privilege('authenticated', 'public.app_admin', 'select') and not has_table_privilege('anon', 'public.app_admin', 'select')),
  ('sharing trigger',
   exists (select 1 from pg_trigger where tgname = 'study_spot_set_sharing')),
  ('read policy: shared + your own',
   exists (select 1 from pg_policies where tablename = 'study_spot' and policyname = 'Read shared spots and your own')),
  ('old "anyone can read" spot policy removed',
   not exists (select 1 from pg_policies where tablename = 'study_spot' and policyname = 'Anyone can read study spots')),
  ('no one can update spots',
   not has_table_privilege('authenticated', 'public.study_spot', 'update')),
  ('favorites: own only',
   not exists (select 1 from pg_policies where tablename = 'favorite_spot' and policyname like 'Demo:%')),
  ('admin account chosen (step 2)',
   exists (select 1 from public.app_admin))
) as checks(item, good);

-- ---------------------------------------------------------------------------
-- STEP 2 — choose the admin account. Run once by hand, with that account's login email.
-- (The team chose Jason's existing account.)
--
--   insert into public.app_admin (auth_user_id, note)
--   select id, 'Shared spots admin' from auth.users where email = 'PUT-THE-ADMIN-EMAIL-HERE@byu.edu';
--
-- Check it worked (should show one row with that email):
--   select u.email, a.added_at from public.app_admin a join auth.users u on u.id = a.auth_user_id;
--
-- To switch to a different admin account later:
--   delete from public.app_admin;
--   then run the insert above with the new email.
-- ---------------------------------------------------------------------------
