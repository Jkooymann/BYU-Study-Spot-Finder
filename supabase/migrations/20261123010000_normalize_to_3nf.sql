-- Project 4 (IS 402): normalization fixes for the Study Spot Finder database.
-- Full write-up: docs/database/normalization-3nf.md
-- Spreadsheet:   docs/database/StudySpotFinder_Normalization.xlsx
--
-- What this file changes (nothing on the website needs to change for it):
--   1. New lookup table noise_level. study_spot.noise_level and
--      saved_filter.preferred_noise_level now point to it (foreign keys)
--      instead of each repeating the same list of allowed words.
--   2. New lookup table busyness_level. It stores each level's label and hint
--      ("High" = "Usually busy" / "Hard to find a seat"), which today only live
--      in the website's JavaScript. study_spot.typical_busyness_level and
--      saved_filter.max_busyness_level now point to it.
--   3. New table building_hours (one row per building per day of the week).
--      The weekday hours are copied into it for Monday-Friday, and the old
--      building.weekday_open_time / weekday_close_time columns are removed.
--      Nothing on the website or in the AI function reads those two columns.
--
-- How to run: Supabase -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run more than once. The last result is a checklist; every row should say ok.
--
-- After this file has run, do not re-run these older files, because they still
-- insert into the removed weekday_open_time / weekday_close_time columns:
--   20261105090000_add_more_buildings.sql, 20261106060000_fix_add_spot.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. noise_level lookup table
-- ---------------------------------------------------------------------------
create table if not exists public.noise_level (
  noise_level text primary key,              -- Silent, Quiet, Moderate, Loud
  sort_order  int  not null unique,
  description text not null
);

insert into public.noise_level (noise_level, sort_order, description) values
  ('Silent',   1, 'No talking at all'),
  ('Quiet',    2, 'Whispering only'),
  ('Moderate', 3, 'Normal conversation is fine'),
  ('Loud',     4, 'Lively; expect noise')
on conflict (noise_level) do update
  set sort_order = excluded.sort_order, description = excluded.description;

-- ---------------------------------------------------------------------------
-- 2. busyness_level lookup table (labels and hints match prototype/js/data.js)
-- ---------------------------------------------------------------------------
create table if not exists public.busyness_level (
  busyness_level text primary key,           -- Low, Moderate, High
  sort_order     int  not null unique,
  display_label  text not null unique,       -- what the website shows
  display_hint   text not null
);

insert into public.busyness_level (busyness_level, sort_order, display_label, display_hint) values
  ('Low',      1, 'Usually empty', 'Easy to find a seat'),
  ('Moderate', 2, 'Moderate',      'Some seats open'),
  ('High',     3, 'Usually busy',  'Hard to find a seat')
on conflict (busyness_level) do update
  set sort_order = excluded.sort_order,
      display_label = excluded.display_label,
      display_hint = excluded.display_hint;

-- Replace the repeated CHECK lists with foreign keys to the lookup tables.
alter table public.study_spot   drop constraint if exists study_spot_noise_level_check;
alter table public.study_spot   drop constraint if exists study_spot_typical_busyness_level_check;
alter table public.saved_filter drop constraint if exists saved_filter_preferred_noise_level_check;
alter table public.saved_filter drop constraint if exists saved_filter_max_busyness_level_check;

alter table public.study_spot   drop constraint if exists study_spot_noise_level_fkey;
alter table public.study_spot   drop constraint if exists study_spot_typical_busyness_level_fkey;
alter table public.saved_filter drop constraint if exists saved_filter_preferred_noise_level_fkey;
alter table public.saved_filter drop constraint if exists saved_filter_max_busyness_level_fkey;

alter table public.study_spot add constraint study_spot_noise_level_fkey
  foreign key (noise_level) references public.noise_level (noise_level) on update cascade;
alter table public.study_spot add constraint study_spot_typical_busyness_level_fkey
  foreign key (typical_busyness_level) references public.busyness_level (busyness_level) on update cascade;
alter table public.saved_filter add constraint saved_filter_preferred_noise_level_fkey
  foreign key (preferred_noise_level) references public.noise_level (noise_level) on update cascade;
alter table public.saved_filter add constraint saved_filter_max_busyness_level_fkey
  foreign key (max_busyness_level) references public.busyness_level (busyness_level) on update cascade;

-- ---------------------------------------------------------------------------
-- 3. building_hours (replaces building.weekday_open_time / weekday_close_time)
-- ---------------------------------------------------------------------------
create table if not exists public.building_hours (
  building_id bigint   not null references public.building (building_id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday ... 6 = Saturday
  open_time   time     not null,
  close_time  time     not null,                                      -- 00:00 = midnight
  primary key (building_id, day_of_week)
);

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'building'
               and column_name = 'weekday_open_time') then
    -- Copy each building's weekday hours to Monday (1) through Friday (5).
    insert into public.building_hours (building_id, day_of_week, open_time, close_time)
    select b.building_id, d.day, b.weekday_open_time, b.weekday_close_time
      from public.building b
     cross join generate_series(1, 5) as d(day)
     where b.weekday_open_time is not null and b.weekday_close_time is not null
    on conflict (building_id, day_of_week) do nothing;

    alter table public.building drop column weekday_open_time;
    alter table public.building drop column weekday_close_time;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Security: like building and amenity, anyone may read these tables and
--    nobody can change them from the website.
-- ---------------------------------------------------------------------------
alter table public.noise_level    enable row level security;
alter table public.busyness_level enable row level security;
alter table public.building_hours enable row level security;

revoke all on public.noise_level, public.busyness_level, public.building_hours from anon, authenticated;
grant select on public.noise_level, public.busyness_level, public.building_hours to anon, authenticated;

drop policy if exists "Anyone can read noise levels" on public.noise_level;
create policy "Anyone can read noise levels"
  on public.noise_level for select to anon, authenticated using (true);
drop policy if exists "Anyone can read busyness levels" on public.busyness_level;
create policy "Anyone can read busyness levels"
  on public.busyness_level for select to anon, authenticated using (true);
drop policy if exists "Anyone can read building hours" on public.building_hours;
create policy "Anyone can read building hours"
  on public.building_hours for select to anon, authenticated using (true);

notify pgrst, 'reload schema';
commit;

-- ---------------------------------------------------------------------------
-- Checklist: every row should say ok.
-- ---------------------------------------------------------------------------
select item, case when good then 'ok' else 'MISSING' end as status
from (values
  ('noise_level table has 4 rows',
     (select count(*) = 4 from public.noise_level)),
  ('busyness_level table has 3 rows',
     (select count(*) = 3 from public.busyness_level)),
  ('study_spot.noise_level points to noise_level',
     exists (select 1 from pg_constraint where conname = 'study_spot_noise_level_fkey')),
  ('study_spot.typical_busyness_level points to busyness_level',
     exists (select 1 from pg_constraint where conname = 'study_spot_typical_busyness_level_fkey')),
  ('saved_filter points to both lookup tables',
     (select count(*) = 2 from pg_constraint
       where conname in ('saved_filter_preferred_noise_level_fkey', 'saved_filter_max_busyness_level_fkey'))),
  ('building_hours table exists',
     to_regclass('public.building_hours') is not null),
  ('old weekday hour columns removed from building',
     not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'building'
                    and column_name in ('weekday_open_time', 'weekday_close_time')))
) as checks(item, good);
