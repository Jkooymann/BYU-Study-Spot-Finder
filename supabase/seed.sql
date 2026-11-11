-- Sample data for the BYU Study Spot Finder tables.
-- Buildings match the front-end prototype (prototype/js/data.js).
-- Coordinates and hours are approximate sample values.
-- Safe to run more than once: rows that already exist are skipped.

insert into public.building
  (building_id, building_code, building_name, campus_map_latitude, campus_map_longitude, floor_count, weekday_open_time, weekday_close_time)
values
  (1, 'HBLL', 'Harold B. Lee Library',    40.248630, -111.649260, 5, '07:00', '00:00'),
  (2, 'WSC',  'Wilkinson Student Center', 40.248609, -111.647124, 3, '07:00', '23:00'),
  (3, 'JFSB', 'Joseph F. Smith Building', 40.248371, -111.651633, 4, '07:00', '22:00'),
  (4, 'TNRB', 'Tanner Building',          40.250409, -111.652574, 6, '07:00', '22:00'),
  (5, 'TMCB', 'Talmage Building',         40.249600, -111.650862, 4, '07:00', '23:00'),
  (6, 'ESC',  'Eyring Science Center',    40.247227, -111.650281, 3, '07:00', '22:00')
on conflict do nothing;

insert into public.student_user
  (user_id, byu_net_id, display_name, byu_email, account_created_at)
values
  (1, 'cosmo1', 'Cosmo C.',   'cosmo1@byu.edu', '2026-09-01 09:15:00-06'),
  (2, 'jsmith', 'Jenna S.',   'jsmith@byu.edu', '2026-09-03 14:02:00-06'),
  (3, 'tnguy7', 'Tran N.',    'tnguy7@byu.edu', '2026-09-10 20:41:00-06'),
  (4, 'mlarse', 'Mia L.',     'mlarse@byu.edu', '2026-09-22 11:30:00-06')
on conflict do nothing;

-- No study spots here: the old example spots were removed from the live
-- database on 2026-11-10, and real spots are added on the site's Add a Spot page.

insert into public.amenity
  (amenity_id, amenity_name, amenity_icon_name)
values
  (1, 'Power outlets',   'plug'),
  (2, 'WiFi',            'wifi'),
  (3, 'Tables',          'table'),
  (4, 'Comfy seating',   'sofa'),
  (5, 'Food allowed',    'utensils'),
  (6, 'Whiteboard',      'chalkboard'),
  (7, 'Natural light',   'sun')
on conflict do nothing;

insert into public.saved_filter
  (saved_filter_id, user_id, filter_name, group_size, preferred_noise_level, indoor_outdoor_preference, max_busyness_level, created_at)
values
  (1, 1, 'Solo cram session',   1, 'Silent',   'Indoor',  'Moderate', '2026-09-16 08:00:00-06'),
  (2, 2, 'Group project',       4, 'Moderate', 'Either',  'High',     '2026-09-19 17:45:00-06'),
  (3, 3, 'Sunny afternoon',     2, 'Quiet',    'Outdoor', 'Low',      '2026-09-21 14:00:00-06'),
  (4, 4, 'Quiet with friends',  3, 'Quiet',    'Indoor',  'Moderate', '2026-09-26 18:30:00-06')
on conflict do nothing;

-- The rows above set their own ids, so move each id counter past them.
-- Otherwise the next row the app inserts would try to reuse id 1.
select setval(pg_get_serial_sequence('public.building',     'building_id'),     (select max(building_id)     from public.building));
select setval(pg_get_serial_sequence('public.student_user', 'user_id'),         (select max(user_id)         from public.student_user));
select setval(pg_get_serial_sequence('public.amenity',      'amenity_id'),      (select max(amenity_id)      from public.amenity));
select setval(pg_get_serial_sequence('public.saved_filter', 'saved_filter_id'), (select max(saved_filter_id) from public.saved_filter));

-- Buildings added for real-data entry (no fabricated study spots).
insert into public.building (building_code, building_name, floor_count)
values
  ('ARTS', 'Arts Building', 4),
  ('LSB', 'Life Sciences Building', 5),
  ('EB', 'Engineering Building', 5)
on conflict (building_code) do nothing;
-- Activate these buildings for study-spot entry. Floor counts remain unknown
-- until the team supplies verified floor lists; do not invent counts or IDs.
insert into public.building (building_code, building_name)
values ('RB', 'Richards Building'), ('CANC', 'Cannon Center'), ('MB', 'Music Building')
on conflict (building_code) do nothing;

-- Correct a previously misidentified MB without changing its ID or linked spots.
update public.building set building_name = 'Music Building'
where building_code = 'MB' and building_name is distinct from 'Music Building';

-- Team-supplied floor counts, including the basement where present.
-- B is stored as 0 in study_spot.floor_number and shown as Floor B in the UI.
-- This changes metadata only; existing spots and coordinates are preserved.
update public.building as b
set floor_count = supplied.floor_count
from (values
  ('ARTS', 4),
  ('BNSN', 6),
  ('CANC', 1),
  ('CB', 5),
  ('CTB', 9),
  ('EB', 5),
  ('ESC', 7),
  ('HBLL', 8),
  ('HRCB', 2),
  ('JFSB', 6),
  ('JKB', 8),
  ('JRCB', 6),
  ('JSB', 3),
  ('KMBL', 12),
  ('LSB', 7),
  ('MARB', 3),
  ('MB', 4),
  ('MCKB', 3),
  ('RB', 3),
  ('SNLB', 2),
  ('TMCB', 8),
  ('TNRB', 8),
  ('WSC', 7)
) as supplied(building_code, floor_count)
where b.building_code = supplied.building_code;
