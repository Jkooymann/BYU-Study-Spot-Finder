-- Let the website save favorites before sign-in exists.
--
-- The prototype has no login yet: you pick a sample student from a dropdown
-- and save favorites as that student. That means the browser (the "anon" role,
-- using the public anon key) needs to:
--   * read the list of students for the dropdown (name only, no email), and
--   * read, add, and remove rows in favorite_spot.
--
-- DEMO ONLY: anyone with the site can add or remove favorites for any sample
-- student. When real sign-in is added, replace these policies with ones that
-- check auth.uid() so students can only change their own favorites.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Student list for the dropdown: only id, display name and NetID are readable.
-- ---------------------------------------------------------------------------
revoke select on public.student_user from anon;
grant select (user_id, display_name, byu_net_id) on public.student_user to anon;

drop policy if exists "Demo: anyone can read students" on public.student_user;
create policy "Demo: anyone can read students"
  on public.student_user for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Favorites: read, add, remove.
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.favorite_spot to anon, authenticated;

drop policy if exists "Demo: anyone can read favorites" on public.favorite_spot;
create policy "Demo: anyone can read favorites"
  on public.favorite_spot for select to anon, authenticated using (true);

drop policy if exists "Demo: anyone can add favorites" on public.favorite_spot;
create policy "Demo: anyone can add favorites"
  on public.favorite_spot for insert to anon, authenticated with check (true);

drop policy if exists "Demo: anyone can remove favorites" on public.favorite_spot;
create policy "Demo: anyone can remove favorites"
  on public.favorite_spot for delete to anon, authenticated using (true);
