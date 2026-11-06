-- Remove two study_spot columns the website no longer uses.
--   seat_count            never shown or saved by the site.
--   location_description  replaced by the "description" column, which is what
--                         the Add a Spot form fills in.
-- Safe to run more than once.

alter table public.study_spot drop column if exists seat_count;
alter table public.study_spot drop column if exists location_description;
