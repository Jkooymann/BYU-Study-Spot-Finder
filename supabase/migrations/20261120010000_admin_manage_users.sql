-- Admin Page: the team admin can see, add, edit and delete user accounts.
--
-- Needs 20261030040000_save_new_users.sql (student_user.auth_user_id + sign-up trigger) and
-- 20261118010000_private_and_shared_spots.sql (app_admin / is_spot_admin()) first.
--
-- How it works:
--   * The website still can't read emails or change other people's rows in student_user.
--     Everything here goes through four database functions, and each one first checks
--     is_spot_admin() from the login. Changing the site's code or sending your own request
--     can't get around it: anyone who isn't the admin gets "Only the team admin ...".
--       admin_list_users()   Read:   every account (name, Net ID, email, joined, favorites)
--       admin_create_user()  Create: a real login (email + password) that works right away
--       admin_update_user()  Update: name, Net ID, email, and optionally a new password
--       admin_delete_user()  Delete: the login and everything that belongs to it
--   * Creating a user makes the Supabase login directly (already confirmed, so no email is
--     sent). The existing sign-up trigger then adds their student_user row, same as sign-up.
--   * Deleting a user removes their login, student_user row, favorites, ratings, private
--     spots and OKR tracking rows. Shared spots stay on the site.
--   * The admin can't delete their own account (so the team can't lock itself out).
--
-- Run it in Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------
create or replace function public.admin_require()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_spot_admin() then
    raise exception 'Only the team admin can manage users.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.admin_require() from public, anon, authenticated;

-- Supabase's login server expects these text columns to be '' rather than empty (null).
-- Only touches the columns that exist in this Supabase version.
create or replace function public.admin_fill_auth_blanks(p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text;
begin
  for col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and is_generated = 'NEVER'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new',
                           'email_change_token_current', 'email_change', 'phone_change',
                           'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = coalesce(%I, '''') where id = $1', col, col) using p_auth_user_id;
  end loop;
end;
$$;
revoke all on function public.admin_fill_auth_blanks(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read: every account
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  user_id            bigint,
  display_name       text,
  byu_net_id         text,
  byu_email          text,
  account_created_at timestamptz,
  has_login          boolean,
  last_sign_in_at    timestamptz,
  is_admin           boolean,
  favorite_count     bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_require();
  return query
    select su.user_id, su.display_name, su.byu_net_id,
           coalesce(au.email::text, su.byu_email),
           su.account_created_at,
           au.id is not null,
           au.last_sign_in_at,
           exists (select 1 from public.app_admin a where a.auth_user_id = su.auth_user_id),
           (select count(*) from public.favorite_spot f where f.user_id = su.user_id)
      from public.student_user su
      left join auth.users au on au.id = su.auth_user_id
     order by su.account_created_at desc, su.user_id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create: a new login that can log in right away
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_email        text,
  p_password     text,
  p_display_name text,
  p_byu_net_id   text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_name   text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_net_id text := lower(btrim(coalesce(p_byu_net_id, '')));
  v_id     uuid := gen_random_uuid();
  v_now    timestamptz := now();
  v_user   bigint;
begin
  perform public.admin_require();
  if v_name = '' then raise exception 'Enter a name.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  if v_net_id = '' then v_net_id := split_part(v_email, '@', 1); end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Use a password with at least 8 characters.' using errcode = '22023'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.student_user where lower(byu_email) = v_email) then
    raise exception 'An account with that email already exists.' using errcode = '23505';
  end if;
  if exists (select 1 from public.student_user where byu_net_id = v_net_id) then
    raise exception 'That Net ID is already used by another account.' using errcode = '23505';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf')), v_now,
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('display_name', v_name, 'byu_net_id', v_net_id, 'email_verified', true),
          v_now, v_now);
  perform public.admin_fill_auth_blanks(v_id);

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id::text, v_id,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', v_now, v_now, v_now);

  -- The sign-up trigger (handle_new_auth_user) has just added the student_user row.
  select su.user_id into v_user from public.student_user su where su.auth_user_id = v_id;
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update: name, Net ID, email, and (optional) a new password
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user(
  p_user_id      bigint,
  p_display_name text,
  p_byu_net_id   text,
  p_email        text,
  p_new_password text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_name   text := left(regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g'), 60);
  v_net_id text := lower(btrim(coalesce(p_byu_net_id, '')));
  v_auth   uuid;
begin
  perform public.admin_require();
  select su.auth_user_id into v_auth from public.student_user su where su.user_id = p_user_id;
  if not found then raise exception 'That user does not exist.' using errcode = 'P0002'; end if;
  if v_name = '' then raise exception 'Enter a name.' using errcode = '22023'; end if;
  if v_net_id = '' then raise exception 'Enter a Net ID.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.' using errcode = '22023'; end if;
  if p_new_password is not null and p_new_password <> '' and length(p_new_password) < 8 then
    raise exception 'Use a password with at least 8 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.student_user where byu_net_id = v_net_id and user_id <> p_user_id) then
    raise exception 'That Net ID is already used by another account.' using errcode = '23505';
  end if;
  if exists (select 1 from public.student_user where lower(byu_email) = v_email and user_id <> p_user_id)
     or exists (select 1 from auth.users where lower(email) = v_email and id is distinct from v_auth) then
    raise exception 'An account with that email already exists.' using errcode = '23505';
  end if;

  update public.student_user
     set display_name = v_name, byu_net_id = v_net_id, byu_email = v_email
   where user_id = p_user_id;

  if v_auth is not null then
    update auth.users
       set email = v_email,
           encrypted_password = case when coalesce(p_new_password, '') = '' then encrypted_password
                                     else extensions.crypt(p_new_password, extensions.gen_salt('bf')) end,
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('display_name', v_name, 'byu_net_id', v_net_id),
           updated_at = now()
     where id = v_auth;
    update auth.identities
       set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_email),
           updated_at = now()
     where user_id = v_auth and provider = 'email';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete: the login and everything that belongs to it
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid;
begin
  perform public.admin_require();
  select su.auth_user_id into v_auth from public.student_user su where su.user_id = p_user_id;
  if not found then raise exception 'That user does not exist.' using errcode = 'P0002'; end if;
  if v_auth = (select auth.uid()) or exists (select 1 from public.app_admin a where a.auth_user_id = v_auth) then
    raise exception 'You can''t delete the admin account.' using errcode = '42501';
  end if;

  -- Their private spots (only they could see them). Shared spots stay on the site.
  delete from public.study_spot where submitted_by_user_id = p_user_id and not is_shared;
  -- Favorites, ratings, saved filters and OKR rows go with the student_user row (on delete cascade).
  delete from public.student_user where user_id = p_user_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

-- Only logged-in people can call these (and they refuse everyone but the admin).
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
revoke all on function public.admin_update_user(bigint, text, text, text, text) from public, anon;
revoke all on function public.admin_delete_user(bigint) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_update_user(bigint, text, text, text, text) to authenticated;
grant execute on function public.admin_delete_user(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status from (values
  ('admin user functions (list, create, update, delete)',
   to_regprocedure('public.admin_list_users()') is not null
   and to_regprocedure('public.admin_create_user(text, text, text, text)') is not null
   and to_regprocedure('public.admin_update_user(bigint, text, text, text, text)') is not null
   and to_regprocedure('public.admin_delete_user(bigint)') is not null),
  ('logged-out visitors cannot call them',
   not has_function_privilege('anon', 'public.admin_list_users()', 'execute')
   and not has_function_privilege('anon', 'public.admin_delete_user(bigint)', 'execute')),
  ('website still cannot read emails directly',
   not has_column_privilege('authenticated', 'public.student_user', 'byu_email', 'select')),
  ('password tool (pgcrypto) available',
   to_regprocedure('extensions.crypt(text, text)') is not null),
  ('admin account chosen',
   exists (select 1 from public.app_admin))
) as checks(item, good);
