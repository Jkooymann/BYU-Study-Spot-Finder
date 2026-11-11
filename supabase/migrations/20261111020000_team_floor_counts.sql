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
