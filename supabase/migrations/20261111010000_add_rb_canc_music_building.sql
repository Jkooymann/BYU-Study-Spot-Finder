-- Activate these buildings for study-spot entry. Floor counts remain unknown
-- until the team supplies verified floor lists; do not invent counts or IDs.
insert into public.building (building_code, building_name)
values ('RB', 'Richards Building'), ('CANC', 'Cannon Center'), ('MB', 'Music Building')
on conflict (building_code) do nothing;

-- Correct a previously misidentified MB without changing its ID or linked spots.
update public.building set building_name = 'Music Building'
where building_code = 'MB' and building_name is distinct from 'Music Building';
