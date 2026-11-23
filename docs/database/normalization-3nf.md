# Database normalization to 3NF (IS 402, Project 4)

This page records how the Study Spot Finder database was checked against the rules of
normalization, what was wrong, and every change made to the database because of it.

- Spreadsheet with each step (one sheet per step): [StudySpotFinder_Normalization.xlsx](StudySpotFinder_Normalization.xlsx)
- SQL for the changes: [`supabase/migrations/20261123010000_normalize_to_3nf.sql`](../../supabase/migrations/20261123010000_normalize_to_3nf.sql)
- The script that builds the spreadsheet: [build_normalization_xlsx.py](build_normalization_xlsx.py)

## What was reviewed

The real schema after all 19 earlier migrations (12 tables and 3 views):
`building`, `student_user`, `study_spot`, `amenity`, `study_spot_amenity`, `spot_rating`,
`favorite_spot`, `saved_filter`, `ai_recommendation`, `user_session`, `spot_search`,
`app_admin`, and the OKR views.

The spreadsheet flattens one study spot listing (spot, building, hours, who added it,
amenities, favorites and reviews) into a single unnormalized table and works it back up:

| Sheet | What it shows |
| --- | --- |
| Unnormalized Data | One row per spot, with lists and combined values in single cells |
| 1st Normal Form | One value per cell; one row per amenity x favorite x review (20 rows) |
| Primary Key | `SpotName, AmenityName, FavByNetID, RatedByNetID` |
| Dependencies | Partial, transitive and other dependencies found |
| 2nd Normal Form | STUDY_SPOT, STUDY_SPOT_AMENITY, AMENITY, FAVORITE_SPOT, SPOT_RATING |
| 3rd Normal Form | Adds BUILDING, STUDENT_USER, BUSYNESS_LEVEL |
| 3rd Normal Form w IDs | The final design with real Supabase table and column names |
| Supporting Tables | The tracking and admin tables checked one by one |
| Database Changes | Every change, applied or recommended |

Study spot rows in the spreadsheet are sample rows. Buildings, students, amenities and their
ids are the real seed rows.

## Problems found

| Problem | Where | Rule |
| --- | --- | --- |
| Busyness label and hint ("High" = "Usually busy", "Hard to find a seat") depend on the busyness level, and only lived in the website's JavaScript | `study_spot.typical_busyness_level` | 3NF (transitive dependency) |
| The allowed noise and busyness values were typed out in CHECK rules in two tables each | `study_spot`, `saved_filter` | Update anomaly (no single place for the list) |
| The day of the week was part of the column name (`weekday_open_time`, `weekday_close_time`) | `building` | 1NF (repeating group) |
| A list of recommended spots and reasons is stored as JSON in one cell | `ai_recommendation.recommendations` | 1NF |
| Noise level is stored twice: as the Quiet zone / Talking allowed tags and as `noise_level`, which the website computes from them | `study_spot`, `study_spot_amenity` | Derived (redundant) data |
| Nothing stops a student from rating the same spot twice, although (spot, student) is the real key | `spot_rating` | Missing candidate key |
| `is_sample_spot` is false on every row since the example spots were deleted | `study_spot` | Column with no information |
| Buildings are listed in the database and again in `prototype/js/data.js` | `building` | Duplicate source of data |

Everything else (all the other tables, keys and join tables) was already in 3NF.

## Database changes made (2026-11-23)

All in `supabase/migrations/20261123010000_normalize_to_3nf.sql`. No website or AI function
code had to change, because the columns the website uses keep the same values.

1. **New table `noise_level`** (`noise_level` PK, `sort_order`, `description`) with Silent,
   Quiet, Moderate, Loud. `study_spot.noise_level` and `saved_filter.preferred_noise_level`
   now have foreign keys to it. Removed CHECK rules: `study_spot_noise_level_check`,
   `saved_filter_preferred_noise_level_check`.
2. **New table `busyness_level`** (`busyness_level` PK, `sort_order`, `display_label`,
   `display_hint`) with Low / Moderate / High and the labels and hints the website shows.
   `study_spot.typical_busyness_level` and `saved_filter.max_busyness_level` now have foreign
   keys to it. Removed CHECK rules: `study_spot_typical_busyness_level_check`,
   `saved_filter_max_busyness_level_check`.
3. **New table `building_hours`** (`building_id`, `day_of_week` 0 = Sunday ... 6 = Saturday,
   `open_time`, `close_time`; PK `building_id, day_of_week`). Each building's weekday hours
   were copied to days 1-5. **Removed columns** `building.weekday_open_time` and
   `building.weekday_close_time` (nothing on the website or in the AI function read them).
4. All three new tables have Row Level Security on: anyone can read them, nobody can change
   them from the website.
5. `supabase/seed.sql` now inserts the sample hours into `building_hours`.

After this migration has run, don't re-run `20261105090000_add_more_buildings.sql` or
`20261106060000_fix_add_spot.sql`: they still insert into the removed hour columns.

Tested on a local PostgreSQL 16 with all 20 migrations and `seed.sql` (run twice each):
the checklist at the end of the file is all ok, a bad value like `noise_level = 'Bogus'` is
refused by the new foreign key, and the OKR views still work.

## Recommended, not applied yet

These need website or AI function changes, so they are left for later:

- Keep noise level in one place (either the two tags or `noise_level`, not both).
- Move `ai_recommendation.recommendations` into a table `ai_recommendation_spot`
  (`ai_recommendation_id`, `rank`, `study_spot_id`, `reason`); needs the Edge Function changed and redeployed.
- Add a unique rule on `spot_rating (user_id, study_spot_id)` when ratings come back.
- Remove `study_spot.is_sample_spot` (first stop `db.js` and the security rules from using it).
- Have the website read buildings from the `building` table instead of its own copy.

## Running the SQL in Supabase

1. Open the project in Supabase and click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/migrations/20261123010000_normalize_to_3nf.sql` on GitHub, click **Copy raw file**, and paste it into the editor.
4. Click **Run**. The last result is a checklist; every row should say `ok`.
