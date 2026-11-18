-- Let the team admin edit shared study spots. Nobody else can edit any spot.
--
-- Needs 20261118010000_private_and_shared_spots.sql (app_admin / is_spot_admin()) and
-- 20261117010000_outdoor_campus_locations.sql (campus map columns) first.
--
-- How it works:
--   * The website still has NO permission to update study_spot directly (the earlier rule
--     "no one can update spots" stays). Edits go through one database function,
--     admin_update_spot(), which first checks is_spot_admin() from the login, so changing
--     the site's code or sending your own request can't get around it.
--   * The admin can edit only SHARED spots (the ones everyone sees). Students' private
--     spots stay theirs: the admin can't see them, so can't edit them either.
--   * Editable: everything the Add a Spot page collects (name, indoors/outdoors, building,
--     floor, pin, group size, busyness, noise, features/tags, description).
--     Not editable: who added it, whether it's shared, when it was added, the spot's id.
--   * The spot and its feature tags change together: if any part fails, nothing changes.
--
-- Run it in Supabase -> SQL Editor -> New query -> Run. Safe to run more than once.

begin;

create or replace function public.admin_update_spot(
  p_study_spot_id          bigint,
  p_spot_name              text,
  p_building_id            bigint,
  p_floor_number           int,
  p_description            text,
  p_is_indoors             boolean,
  p_max_group_size         int,
  p_noise_level            text,
  p_typical_busyness_level text,
  p_floor_plan_x_percent   numeric,
  p_floor_plan_y_percent   numeric,
  p_campus_map_x_percent   numeric,
  p_campus_map_y_percent   numeric,
  p_amenity_ids            bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_spot_admin() then
    raise exception 'Only the team admin can edit study spots.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_spot_name), '') = '' then
    raise exception 'Enter a name for this spot.' using errcode = '22023';
  end if;

  update public.study_spot set
    spot_name              = left(btrim(p_spot_name), 60),
    building_id            = p_building_id,
    floor_number           = p_floor_number,
    description            = nullif(left(btrim(coalesce(p_description, '')), 240), ''),
    is_indoors             = p_is_indoors,
    max_group_size         = p_max_group_size,
    noise_level            = p_noise_level,
    typical_busyness_level = p_typical_busyness_level,
    floor_plan_x_percent   = p_floor_plan_x_percent,
    floor_plan_y_percent   = p_floor_plan_y_percent,
    campus_map_x_percent   = p_campus_map_x_percent,
    campus_map_y_percent   = p_campus_map_y_percent
  where study_spot_id = p_study_spot_id
    and is_shared
    and not is_sample_spot;

  if not found then
    raise exception 'That spot does not exist or is not a shared spot.' using errcode = 'P0002';
  end if;

  -- Replace the spot's feature tags with the ones sent.
  delete from public.study_spot_amenity where study_spot_id = p_study_spot_id;
  insert into public.study_spot_amenity (study_spot_id, amenity_id)
  select distinct p_study_spot_id, a from unnest(coalesce(p_amenity_ids, '{}')) as a;
end;
$$;

-- Only logged-in people can call it (and it refuses everyone but the admin).
revoke all on function public.admin_update_spot(bigint, text, bigint, int, text, boolean, int, text, text, numeric, numeric, numeric, numeric, bigint[]) from public, anon;
grant execute on function public.admin_update_spot(bigint, text, bigint, int, text, boolean, int, text, text, numeric, numeric, numeric, numeric, bigint[]) to authenticated;

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status from (values
  ('admin_update_spot function',
   to_regprocedure('public.admin_update_spot(bigint, text, bigint, int, text, boolean, int, text, text, numeric, numeric, numeric, numeric, bigint[])') is not null),
  ('logged-out visitors cannot call it',
   not has_function_privilege('anon', 'public.admin_update_spot(bigint, text, bigint, int, text, boolean, int, text, text, numeric, numeric, numeric, numeric, bigint[])', 'execute')),
  ('website still cannot update spots directly',
   not has_table_privilege('authenticated', 'public.study_spot', 'update')),
  ('admin account chosen',
   exists (select 1 from public.app_admin))
) as checks(item, good);
