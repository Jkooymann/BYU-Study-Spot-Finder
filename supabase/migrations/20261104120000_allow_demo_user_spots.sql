-- Let the website save spots from the Add a Spot page before sign-in exists.
--
-- The site submits a spot as whichever sample student is picked in the
-- "Viewing as" dropdown. The browser (the "anon" role) needs to:
--   * add rows to study_spot and study_spot_amenity, and
--   * delete spots that students added (never the built-in sample spots).
--
-- DEMO ONLY: anyone with the site can add spots as any sample student and
-- delete any student-added spot. When real sign-in is added, replace these
-- policies with ones that check auth.uid().
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The Add a Spot form has a short description, which had no column yet.
-- ---------------------------------------------------------------------------
alter table public.study_spot add column if not exists description text;

-- ---------------------------------------------------------------------------
-- Two form tags that have no matching amenity yet.
-- (Outdoors is stored in study_spot.is_indoors.)
-- ---------------------------------------------------------------------------
insert into public.amenity (amenity_id, amenity_name, amenity_icon_name)
values
  (8, 'Quiet zone',      'volume-off'),
  (9, 'Talking allowed', 'message')
on conflict do nothing;
select setval(pg_get_serial_sequence('public.amenity', 'amenity_id'),
              greatest((select max(amenity_id) from public.amenity), 1));

-- ---------------------------------------------------------------------------
-- Study spots: add student spots, delete student spots.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.study_spot to anon, authenticated;

drop policy if exists "Demo: anyone can add student spots" on public.study_spot;
create policy "Demo: anyone can add student spots"
  on public.study_spot for insert to anon, authenticated
  with check (is_sample_spot = false and submitted_by_user_id is not null);

drop policy if exists "Demo: anyone can delete student spots" on public.study_spot;
create policy "Demo: anyone can delete student spots"
  on public.study_spot for delete to anon, authenticated
  using (is_sample_spot = false);

-- ---------------------------------------------------------------------------
-- Amenities of a spot: add them for student spots only.
-- (Deleting a spot removes its amenity rows through on delete cascade.)
-- ---------------------------------------------------------------------------
grant select, insert on public.study_spot_amenity to anon, authenticated;

drop policy if exists "Demo: anyone can tag student spots" on public.study_spot_amenity;
create policy "Demo: anyone can tag student spots"
  on public.study_spot_amenity for insert to anon, authenticated
  with check (exists (
    select 1 from public.study_spot s
    where s.study_spot_id = study_spot_amenity.study_spot_id and s.is_sample_spot = false
  ));
