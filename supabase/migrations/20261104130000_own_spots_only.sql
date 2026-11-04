-- Now that students log in (see *_save_new_users.sql), tighten the demo rules
-- from *_allow_demo_user_spots.sql:
--   * only logged-in students can add spots, and only as themselves;
--   * a student can delete only the spots they added (never sample spots).
-- Everyone (logged in or not) can still read every spot.
--
-- Safe to run more than once.

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

-- ---------------------------------------------------------------------------
-- Study spots
-- ---------------------------------------------------------------------------
revoke insert, delete on public.study_spot from anon;
grant select on public.study_spot to anon;
grant select, insert, delete on public.study_spot to authenticated;

drop policy if exists "Demo: anyone can add student spots" on public.study_spot;
drop policy if exists "Demo: anyone can delete student spots" on public.study_spot;

drop policy if exists "Students can add their own spots" on public.study_spot;
create policy "Students can add their own spots"
  on public.study_spot for insert to authenticated
  with check (is_sample_spot = false and submitted_by_user_id = (select public.current_student_id()));

drop policy if exists "Students can delete their own spots" on public.study_spot;
create policy "Students can delete their own spots"
  on public.study_spot for delete to authenticated
  using (is_sample_spot = false and submitted_by_user_id = (select public.current_student_id()));

-- ---------------------------------------------------------------------------
-- Tags of a spot: only on your own spots.
-- ---------------------------------------------------------------------------
revoke insert on public.study_spot_amenity from anon;
grant select on public.study_spot_amenity to anon;
grant select, insert on public.study_spot_amenity to authenticated;

drop policy if exists "Demo: anyone can tag student spots" on public.study_spot_amenity;

drop policy if exists "Students can tag their own spots" on public.study_spot_amenity;
create policy "Students can tag their own spots"
  on public.study_spot_amenity for insert to authenticated
  with check (exists (
    select 1 from public.study_spot s
    where s.study_spot_id = study_spot_amenity.study_spot_id
      and s.is_sample_spot = false
      and s.submitted_by_user_id = (select public.current_student_id())
  ));
