-- Outdoor locations belong to the campus, with an optional nearby building.
-- Existing floor coordinates are intentionally not converted to campus positions.
begin;
alter table public.study_spot alter column building_id drop not null;
alter table public.study_spot add column if not exists campus_map_x_percent numeric(5,2);
alter table public.study_spot add column if not exists campus_map_y_percent numeric(5,2);

alter table public.study_spot drop constraint if exists study_spot_indoor_building;
alter table public.study_spot add constraint study_spot_indoor_building
  check (not is_indoors or building_id is not null);
alter table public.study_spot drop constraint if exists study_spot_campus_location;
alter table public.study_spot add constraint study_spot_campus_location check (
  (campus_map_x_percent is null and campus_map_y_percent is null)
  or (
    campus_map_x_percent is not null and campus_map_y_percent is not null
    and campus_map_x_percent between 0 and 100
    and campus_map_y_percent between 0 and 100
    and not is_indoors and floor_number is null
    and floor_plan_x_percent is null and floor_plan_y_percent is null
  )
);
-- Keep existing favorites, ownership policies, IDs and legacy floor pins intact.
notify pgrst, 'reload schema';
commit;
