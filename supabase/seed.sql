-- Sample data for the BYU Study Spot Finder tables.
-- Buildings and spots match the front-end prototype (prototype/js/data.js);
-- each spot's study_spot_id is the dbId of the same spot in data.js.
-- Coordinates, hours and seat counts are approximate sample values.
-- Safe to run more than once: rows that already exist are skipped.

insert into public.building
  (building_id, building_code, building_name, campus_map_latitude, campus_map_longitude, floor_count, weekday_open_time, weekday_close_time)
values
  (1, 'HBLL', 'Harold B. Lee Library',    40.248800, -111.649200, 5, '07:00', '00:00'),
  (2, 'WSC',  'Wilkinson Student Center', 40.248400, -111.646800, 3, '07:00', '23:00'),
  (3, 'JFSB', 'Joseph F. Smith Building', 40.248700, -111.651000, 4, '07:00', '22:00'),
  (4, 'TNRB', 'Tanner Building',          40.250200, -111.654500, 6, '07:00', '22:00'),
  (5, 'TMCB', 'Talmage Building',         40.249300, -111.651000, 4, '07:00', '23:00'),
  (6, 'ESC',  'Eyring Science Center',    40.247400, -111.648500, 3, '07:00', '22:00')
on conflict do nothing;

insert into public.student_user
  (user_id, byu_net_id, display_name, byu_email, account_created_at)
values
  (1, 'cosmo1', 'Cosmo C.',   'cosmo1@byu.edu', '2026-09-01 09:15:00-06'),
  (2, 'jsmith', 'Jenna S.',   'jsmith@byu.edu', '2026-09-03 14:02:00-06'),
  (3, 'tnguy7', 'Tran N.',    'tnguy7@byu.edu', '2026-09-10 20:41:00-06'),
  (4, 'mlarse', 'Mia L.',     'mlarse@byu.edu', '2026-09-22 11:30:00-06')
on conflict do nothing;

insert into public.study_spot
  (study_spot_id, building_id, submitted_by_user_id, spot_name, floor_number, location_description,
   is_indoors, seat_count, max_group_size, noise_level, typical_busyness_level,
   floor_plan_x_percent, floor_plan_y_percent, is_sample_spot)
values
  (1, 1, null, 'Main Floor Group Tables', 1, 'North reading area',     true,  40, 6, 'Moderate', 'High',     22, 25, true),
  (2, 1, null, 'Group Study Rooms',       1, 'Rooms 1100–1130',        true,  60, 8, 'Moderate', 'High',     70, 78, true),
  (3, 1, null, 'West Window Carrels',     2, 'West wall',              true,  24, 1, 'Quiet',    'Moderate', 10, 60, true),
  (4, 1, null, 'Silent Reading Room',     3, 'Room 3300',              true,  50, 1, 'Silent',   'Moderate', 55, 22, true),
  (5, 2, null, 'Cougareat Tables',        1, 'Food court',             true, 200, 8, 'Loud',     'High',     40, 30, true),
  (6, 2, null, 'Garden Court',            2, 'Garden Court',           true,  30, 4, 'Moderate', 'Moderate', 60, 70, true),
  (7, 2, null, 'East Terrace',            1, 'East doors patio',       false, 20, 6, 'Moderate', 'Low',      92, 55, true),
  (8, 3, null, 'Courtyard Benches',       1, 'Center courtyard',       false, 16, 4, 'Quiet',    'Low',      50, 50, true),
  (9, 3, 2,    'Atrium Tables',           2, 'Main atrium',            true,  32, 4, 'Moderate', 'Moderate', 35, 30, false),
  (10, 4, 1,   'Business Lounge',         3, 'Third floor east lounge', true, 18, 4, 'Quiet',    'Moderate', 70, 40, false),
  (11, 5, 3,   'CS Lab Couches',          1, 'Outside the open lab',   true,  12, 3, 'Moderate', 'High',     30, 65, false)
on conflict do nothing;

-- The rest of the prototype's sample spots (prototype/js/data.js), so every
-- spot on the website has a matching row and can be saved as a favorite.
-- The id of each row is the spot's dbId in data.js.
insert into public.study_spot
  (study_spot_id, building_id, submitted_by_user_id, spot_name, floor_number, location_description,
   is_indoors, seat_count, max_group_size, noise_level, typical_busyness_level,
   floor_plan_x_percent, floor_plan_y_percent, is_sample_spot)
values
  (12, 1, null, 'Atrium Lounge Chairs', 4, 'Atrium overlook', true, 24, 4, 'Moderate', 'Moderate', 45, 72, true),
  (13, 1, null, 'Top Floor Study Nook', 5, 'Southeast corner', true, 12, 1, 'Quiet', 'Low', 85, 80, true),
  (14, 2, null, 'Ballroom Hallway Lounge', 3, 'Outside the Ballroom', true, 24, 4, 'Moderate', 'Low', 25, 50, true),
  (15, 3, null, 'Third-Floor Window Seats', 3, 'North windows', true, 12, 1, 'Quiet', 'Low', 78, 18, true),
  (16, 3, null, 'Fourth-Floor Study Corner', 4, 'Near Room 4010', true, 24, 4, 'Quiet', 'Low', 15, 82, true),
  (17, 4, null, 'Tanner Atrium Tables', 1, 'Atrium', true, 60, 8, 'Moderate', 'High', 50, 40, true),
  (18, 4, null, 'Business Group Rooms', 3, 'Rooms 310–330', true, 24, 4, 'Moderate', 'Moderate', 80, 25, true),
  (19, 4, null, 'Fifth-Floor Quiet Lounge', 5, 'West lounge', true, 12, 1, 'Quiet', 'Low', 20, 70, true),
  (20, 4, null, 'Tanner Front Patio', 1, 'South entrance', false, 24, 4, 'Moderate', 'Low', 50, 92, true),
  (21, 5, null, 'CS Lab Commons', 1, 'Open lab area', true, 24, 4, 'Moderate', 'High', 30, 30, true),
  (22, 5, null, 'Hallway Booths', 2, 'East hallway', true, 24, 4, 'Moderate', 'Moderate', 75, 50, true),
  (23, 5, null, 'Stairwell Quiet Tables', 3, 'By the north stairs', true, 12, 1, 'Quiet', 'Low', 12, 20, true),
  (24, 6, null, 'ESC Lobby Tables', 1, 'Main lobby', true, 60, 8, 'Moderate', 'Moderate', 50, 50, true),
  (25, 6, null, 'Physics Tutoring Lab', 2, 'Room W166', true, 24, 4, 'Moderate', 'High', 25, 75, true),
  (26, 6, null, 'Upper Hallway Desks', 3, 'South hallway', true, 12, 1, 'Quiet', 'Low', 70, 82, true)
on conflict do nothing;

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

insert into public.study_spot_amenity
  (study_spot_id, amenity_id)
values
  (1, 1), (1, 2), (1, 3),
  (2, 1), (2, 2), (2, 3), (2, 6),
  (3, 1), (3, 2), (3, 7),
  (4, 2), (4, 3),
  (5, 2), (5, 3), (5, 5),
  (6, 2), (6, 4), (6, 7),
  (7, 2), (7, 5), (7, 7),
  (8, 7),
  (9, 1), (9, 2), (9, 3),
  (10, 1), (10, 2), (10, 4),
  (11, 1), (11, 2), (11, 4), (11, 6),
  (12, 1), (12, 2), (12, 4),
  (13, 1), (13, 2), (13, 3),
  (14, 1), (14, 2), (14, 4),
  (15, 2), (15, 4),
  (16, 1), (16, 2), (16, 3),
  (17, 1), (17, 2), (17, 3), (17, 5),
  (18, 1), (18, 2), (18, 3),
  (19, 1), (19, 2), (19, 4),
  (20, 2), (20, 3), (20, 5),
  (21, 1), (21, 2), (21, 3),
  (22, 1), (22, 2), (22, 3), (22, 4), (22, 5),
  (23, 1), (23, 2), (23, 3),
  (24, 1), (24, 2), (24, 3), (24, 5),
  (25, 1), (25, 2), (25, 3),
  (26, 1), (26, 2), (26, 3)
on conflict do nothing;

insert into public.spot_rating
  (spot_rating_id, user_id, study_spot_id, star_rating, review_comment, rated_at)
values
  (1, 1, 4,  5, 'Actually silent. Best place to grind before a midterm.', '2026-09-15 19:20:00-06'),
  (2, 2, 4,  4, 'Great focus, but hard to find a seat after 7pm.',        '2026-09-18 21:05:00-06'),
  (3, 3, 5,  2, 'Way too loud to study, fine for a quick group sync.',     '2026-09-20 12:40:00-06'),
  (4, 4, 6,  5, null,                                                       '2026-09-25 15:10:00-06'),
  (5, 1, 2,  4, 'Reserve a room ahead of time during finals.',             '2026-10-01 10:00:00-06'),
  (6, 2, 7,  3, 'Nice on sunny days, no outlets though.',                  '2026-10-03 13:30:00-06')
on conflict do nothing;

insert into public.favorite_spot
  (user_id, study_spot_id, favorited_at)
values
  (1, 4, '2026-09-15 19:21:00-06'),
  (1, 2, '2026-10-01 10:01:00-06'),
  (2, 6, '2026-09-18 21:10:00-06'),
  (3, 11, '2026-09-21 09:00:00-06'),
  (4, 6, '2026-09-25 15:11:00-06')
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
select setval(pg_get_serial_sequence('public.study_spot',   'study_spot_id'),   (select max(study_spot_id)   from public.study_spot));
select setval(pg_get_serial_sequence('public.amenity',      'amenity_id'),      (select max(amenity_id)      from public.amenity));
select setval(pg_get_serial_sequence('public.spot_rating',  'spot_rating_id'),  (select max(spot_rating_id)  from public.spot_rating));
select setval(pg_get_serial_sequence('public.saved_filter', 'saved_filter_id'), (select max(saved_filter_id) from public.saved_filter));
