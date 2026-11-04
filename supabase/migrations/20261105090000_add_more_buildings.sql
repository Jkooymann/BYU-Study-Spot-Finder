-- Add the rest of the campus buildings shown on the site's Campus Map, so
-- students can add study spots in them (study_spot.building_id needs a row here).
-- The site finds each building's id by building_code, so ids are left to the
-- database. Coordinates match prototype/js/data.js. Floor counts are estimates.
-- Safe to run more than once.

-- Make sure the first six buildings keep ids 1-6 (seed.sql and data.js use
-- them), even on a fresh local database where seed.sql runs after this file.
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
select setval(pg_get_serial_sequence('public.building', 'building_id'), (select max(building_id) from public.building));

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

-- The first six buildings: move them to their real campus coordinates.
update public.building set campus_map_latitude = 40.248630, campus_map_longitude = -111.649260 where building_code = 'HBLL';
update public.building set campus_map_latitude = 40.248609, campus_map_longitude = -111.647124 where building_code = 'WSC';
update public.building set campus_map_latitude = 40.248371, campus_map_longitude = -111.651633 where building_code = 'JFSB';
update public.building set campus_map_latitude = 40.250409, campus_map_longitude = -111.652574 where building_code = 'TNRB';
update public.building set campus_map_latitude = 40.249600, campus_map_longitude = -111.650862 where building_code = 'TMCB';
update public.building set campus_map_latitude = 40.247227, campus_map_longitude = -111.650281 where building_code = 'ESC';
