-- One-step repair for the Add a Spot page ("Could not save your spot to the database").
--
-- Saving a spot needs pieces from four earlier files (save_new_users,
-- allow_demo_user_spots, own_spots_only, add_more_buildings). Each one had to be pasted
-- into the SQL Editor by hand, and if any was skipped the save fails.
-- This file puts every piece in place in one go. It changes nothing that is
-- already correct, so it is safe to run more than once.
--
-- Paste the whole file into Supabase -> SQL Editor -> New query -> Run.
-- The last query prints a checklist; every row should say "ok".

-- ---------------------------------------------------------------------------
-- 1. Columns and tags the Add a Spot form saves.
-- ---------------------------------------------------------------------------
alter table public.study_spot add column if not exists description text;

insert into public.amenity (amenity_id, amenity_name, amenity_icon_name)
values
  (1, 'Power outlets',   'plug'),
  (2, 'WiFi',            'wifi'),
  (3, 'Tables',          'table'),
  (4, 'Comfy seating',   'armchair'),
  (5, 'Food allowed',    'utensils'),
  (8, 'Quiet zone',      'volume-off'),
  (9, 'Talking allowed', 'message')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Every building on the Campus Map (a spot must point at a building row).
-- ---------------------------------------------------------------------------
insert into public.building
  (building_id, building_code, building_name, floor_count, weekday_open_time, weekday_close_time)
values
  (1, 'HBLL', 'Harold B. Lee Library',    5, '07:00', '00:00'),
  (2, 'WSC',  'Wilkinson Student Center', 3, '07:00', '23:00'),
  (3, 'JFSB', 'Joseph F. Smith Building', 4, '07:00', '22:00'),
  (4, 'TNRB', 'Tanner Building',          6, '07:00', '22:00'),
  (5, 'TMCB', 'Talmage Building',         4, '07:00', '23:00'),
  (6, 'ESC',  'Eyring Science Center',    3, '07:00', '22:00')
on conflict do nothing;

-- Move the id counters past the highest id in use, so new rows never reuse an id
-- (a reused id makes the save fail with "duplicate key").
select setval(pg_get_serial_sequence('public.building',   'building_id'),   greatest((select max(building_id)   from public.building), 1));
select setval(pg_get_serial_sequence('public.amenity',    'amenity_id'),    greatest((select max(amenity_id)    from public.amenity), 1));
select setval(pg_get_serial_sequence('public.study_spot', 'study_spot_id'), greatest((select max(study_spot_id) from public.study_spot), 1));

insert into public.building
  (building_code, building_name, campus_map_latitude, campus_map_longitude, floor_count)
values
  ('JKB',  'Jesse Knight Building',                     40.250211, -111.649935,  4),
  ('KMBL', 'Spencer W. Kimball Tower',                  40.247512, -111.651053, 11),
  ('MCKB', 'McKay School of Education',                 40.247222, -111.651861,  3),
  ('HRCB', 'Kennedy Center (Herald R. Clark Building)', 40.247638, -111.649381,  3),
  ('MARB', 'Thomas L. Martin Building',                 40.246816, -111.649241,  3),
  ('CB',   'Clyde Engineering Building',                40.246903, -111.648087,  4),
  ('CTB',  'Crabtree Technology Building',              40.247434, -111.646751,  3),
  ('SNLB', 'William H. Snell Building',                 40.247388, -111.645336,  3),
  ('JRCB', 'J. Reuben Clark Law Building',              40.249580, -111.645376,  4),
  ('JSB',  'Joseph Smith Building',                     40.245845, -111.651656,  2),
  ('BNSN', 'Ezra Taft Benson Building',                 40.245834, -111.650856,  3)
on conflict (building_code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Logged-in students. Same as save_new_users.sql: link each login to a
--    student_user row, and add that row automatically on sign-up.
-- ---------------------------------------------------------------------------
alter table public.student_user
  add column if not exists auth_user_id uuid unique
  references auth.users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Trigger function. "security definer" lets it write to student_user even
-- though the person signing up has no insert permission on that table.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_prefix text := split_part(coalesce(new.email, ''), '@', 1);
  net_id       text := lower(coalesce(nullif(trim(new.raw_user_meta_data ->> 'byu_net_id'), ''), email_prefix));
  name         text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), email_prefix);
begin
  if net_id = '' then
    net_id := 'user-' || left(new.id::text, 8);
    name   := net_id;
  end if;

  -- Someone already in student_user with this email (e.g. a sample student)
  -- and not yet linked: link that row instead of making a duplicate.
  update public.student_user
     set auth_user_id = new.id
   where lower(byu_email) = lower(new.email)
     and auth_user_id is null;
  if found then
    return new;
  end if;

  -- NetID taken by someone else: add a short suffix so sign-up never fails.
  if exists (select 1 from public.student_user where byu_net_id = net_id) then
    net_id := net_id || '-' || left(new.id::text, 4);
  end if;

  insert into public.student_user (auth_user_id, byu_net_id, display_name, byu_email)
  values (new.id, net_id, name, coalesce(nullif(new.email, ''), net_id || '@unknown'));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Permissions for signed-in students.
-- Like the anon role, they can see names and NetIDs but not emails (their own
-- email comes from supabase.auth.getUser()). Only the trigger creates rows, and
-- a student can change only their own display name.
-- ---------------------------------------------------------------------------
revoke all on public.student_user from authenticated;
grant select (user_id, display_name, byu_net_id, auth_user_id) on public.student_user to authenticated;
grant update (display_name) on public.student_user to authenticated;

drop policy if exists "Students can update their own row" on public.student_user;
create policy "Students can update their own row"
  on public.student_user for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- Accounts made before the sign-up trigger existed get their student row now.
insert into public.student_user (auth_user_id, byu_net_id, display_name, byu_email)
select u.id,
       lower(split_part(u.email, '@', 1)) || '-' || left(u.id::text, 4),
       split_part(u.email, '@', 1),
       u.email
  from auth.users u
 where coalesce(u.email, '') <> ''
   and not exists (select 1 from public.student_user s where s.auth_user_id = u.id)
   and not exists (select 1 from public.student_user s where lower(s.byu_email) = lower(u.email))
on conflict do nothing;
-- A sample student whose email matches a login: link them.
update public.student_user s
   set auth_user_id = u.id
  from auth.users u
 where s.auth_user_id is null
   and lower(s.byu_email) = lower(u.email)
   and not exists (select 1 from public.student_user x where x.auth_user_id = u.id);

-- The logged-in student's user_id (null when logged out).
create or replace function public.current_student_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.student_user where auth_user_id = (select auth.uid())
$$;
grant execute on function public.current_student_id() to anon, authenticated;

-- Logged-in students can read names (needed to show who added a spot).
grant select (user_id, display_name, byu_net_id) on public.student_user to anon, authenticated;
drop policy if exists "Demo: anyone can read students" on public.student_user;
create policy "Demo: anyone can read students"
  on public.student_user for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4. Who can add and delete spots: logged-in students, only their own.
--    Everyone can read every spot.
-- ---------------------------------------------------------------------------
grant select on public.study_spot, public.study_spot_amenity, public.building, public.amenity to anon, authenticated;
grant insert, delete on public.study_spot to authenticated;
grant insert on public.study_spot_amenity to authenticated;
revoke insert, delete on public.study_spot from anon;
revoke insert on public.study_spot_amenity from anon;

drop policy if exists "Anyone can read study spots" on public.study_spot;
create policy "Anyone can read study spots"
  on public.study_spot for select to anon, authenticated using (true);
drop policy if exists "Anyone can read study spot amenities" on public.study_spot_amenity;
create policy "Anyone can read study spot amenities"
  on public.study_spot_amenity for select to anon, authenticated using (true);
drop policy if exists "Anyone can read buildings" on public.building;
create policy "Anyone can read buildings"
  on public.building for select to anon, authenticated using (true);

drop policy if exists "Demo: anyone can add student spots" on public.study_spot;
drop policy if exists "Demo: anyone can delete student spots" on public.study_spot;
drop policy if exists "Demo: anyone can tag student spots" on public.study_spot_amenity;

drop policy if exists "Students can add their own spots" on public.study_spot;
create policy "Students can add their own spots"
  on public.study_spot for insert to authenticated
  with check (is_sample_spot = false and submitted_by_user_id = (select public.current_student_id()));

drop policy if exists "Students can delete their own spots" on public.study_spot;
create policy "Students can delete their own spots"
  on public.study_spot for delete to authenticated
  using (is_sample_spot = false and submitted_by_user_id = (select public.current_student_id()));

drop policy if exists "Students can tag their own spots" on public.study_spot_amenity;
create policy "Students can tag their own spots"
  on public.study_spot_amenity for insert to authenticated
  with check (exists (
    select 1 from public.study_spot s
    where s.study_spot_id = study_spot_amenity.study_spot_id
      and s.is_sample_spot = false
      and s.submitted_by_user_id = (select public.current_student_id())
  ));

-- Tell the website's API about the new column right away.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5. Checklist. Every row should say "ok".
-- ---------------------------------------------------------------------------
select item, case when passed then 'ok' else 'MISSING: ' || fix end as status
from (values
  ('Sign-up adds new students automatically',
   exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'),
   'run this file again'),
  ('Every login has a student row',
   not exists (select 1 from auth.users u where coalesce(u.email, '') <> '' and not exists (
     select 1 from public.student_user s where s.auth_user_id = u.id)),
   'run this file again'),
  ('study_spot.description column',
   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'study_spot' and column_name = 'description'),
   'run this file again'),
  ('Quiet zone / Talking allowed tags',
   (select count(*) from public.amenity where amenity_id in (8, 9)) = 2,
   'an amenity with that name already exists under another id'),
  ('All 17 Campus Map buildings',
   (select count(*) from public.building) >= 17,
   'run this file again'),
  ('Rule: students can add their own spots',
   exists (select 1 from pg_policies where tablename = 'study_spot' and policyname = 'Students can add their own spots'),
   'run this file again')
) as c(item, passed, fix);
