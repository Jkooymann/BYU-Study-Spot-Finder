-- New selectable buildings. IDs are assigned by Postgres and resolved by code.
-- Initial floor counts match the prototype; refine with floor-specific references.
insert into public.building (building_code, building_name, floor_count)
values
  ('ARTS', 'Arts Building', 4),
  ('LSB', 'Life Sciences Building', 5),
  ('EB', 'Engineering Building', 5)
on conflict (building_code) do nothing;
