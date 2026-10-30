-- Save every new account in student_user.
--
-- How it works:
--   1. The sign-up form calls supabase.auth.signUp(). Supabase Auth stores the
--      login (email + password) in its own private table, auth.users.
--   2. The trigger below runs right after that and copies the new person into
--      public.student_user, so the rest of the app (favorites, ratings, saved
--      filters) can point at them with a normal user_id.
--   3. student_user.auth_user_id links the two rows together.
--
-- The form can send display_name and byu_net_id as sign-up "metadata". If it
-- doesn't, the name and NetID are taken from the email (jsmith@byu.edu -> jsmith).
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Link column: which Supabase Auth account owns this student row.
-- Null for the sample students in seed.sql until someone signs up with their email.
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
