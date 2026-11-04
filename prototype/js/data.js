/* =========================================================================
   BYU Study Spot Finder — MOCK DATA
   This is the ONE data file every screen reads from.
   Favorites are saved in Supabase (shared with the whole team) — see db.js.
   Other user data (user-added spots) still lives in
   localStorage — see store.js.

   Spot data model
   ---------------
   id          unique string
   dbId        study_spot_id of the same spot in the Supabase database
               (favorites are saved there; see supabase/seed.sql)
   name        display name
   building    building id (see BUILDINGS)
   floor       floor number
   room        room / area label
   position    { x, y } — percent position (0–100) on the floor plan
   features    { quietZone, talkingAllowed, foodAllowed, outlets, wifi,
                 tables, comfySeating, outdoors }  (true / false)
   groupSize   "solo" | "small group" | "big group"
   busyness    "Usually empty" | "Moderate" | "Usually busy"
               (a typical / estimated level — NOT live data)
   description short text
   ========================================================================= */

const FEATURES = [
  { key: 'quietZone',      label: 'Quiet zone' },
  { key: 'talkingAllowed', label: 'Talking allowed' },
  { key: 'foodAllowed',    label: 'Food allowed' },
  { key: 'outlets',        label: 'Outlets' },
  { key: 'wifi',           label: 'WiFi' },
  { key: 'tables',         label: 'Tables' },
  { key: 'comfySeating',   label: 'Comfy seating' },
  { key: 'outdoors',       label: 'Outdoors' },
];

const GROUP_SIZES = [
  { key: 'solo',        label: 'Solo',        hint: 'Just you' },
  { key: 'small group', label: 'Small group', hint: '2–4 people' },
  { key: 'big group',   label: 'Big group',   hint: '5+ people' },
];

const BUSYNESS = ['Usually empty', 'Moderate', 'Usually busy'];

/* amenity_id in Supabase for each feature tag (Outdoors is study_spot.is_indoors). */
const FEATURE_AMENITY_IDS = {
  outlets: 1, wifi: 2, tables: 3, comfySeating: 4, foodAllowed: 5, quietZone: 8, talkingAllowed: 9,
};

/* Filter options shown everywhere (Get Started, Filter Panel, active-filter chips).
   Indoors / Outdoors is a separate "Setting" choice instead of a feature checkbox. */
const FILTER_FEATURES = FEATURES.filter((f) => f.key !== 'outdoors');
const SETTINGS = [
  { key: '',         label: 'Anywhere', icon: 'layers' },
  { key: 'indoors',  label: 'Indoors',  icon: 'indoors' },
  { key: 'outdoors', label: 'Outdoors', icon: 'outdoors' },
];

/* Buildings
   dbId     building_id in Supabase (see supabase/seed.sql). Buildings added after
            the first six get their id from the database by building code when
            the site loads (see Store.loadShared), so no id is hard-coded here.
   lat/lng  the building's center on campus. The Campus Map places each building
            from these coordinates, so the layout matches the real campus.
            Source: byudevelopers/BYUFreeFood buildings.js.
   size     footprint on the map in pixels (simplified, roughly to scale)
   floors   floors with study space. For the newer buildings these are estimates;
            correct them if you know better. */
const BUILDINGS = [
  { id: 'hbll', dbId: 1, name: 'Harold B. Lee Library',            short: 'HBLL', floors: [1, 2, 3, 4, 5],    lat: 40.248630, lng: -111.649260, size: [104, 86] },
  { id: 'wsc',  dbId: 2, name: 'Wilkinson Student Center',         short: 'WSC',  floors: [1, 2, 3],          lat: 40.248609, lng: -111.647124, size: [108, 84] },
  { id: 'jfsb', dbId: 3, name: 'Joseph F. Smith Building',         short: 'JFSB', floors: [1, 2, 3, 4],       lat: 40.248371, lng: -111.651633, size: [104, 70] },
  { id: 'tnrb', dbId: 4, name: 'Tanner Building',                  short: 'TNRB', floors: [1, 2, 3, 4, 5, 6], lat: 40.250409, lng: -111.652574, size: [88, 54] },
  { id: 'tmcb', dbId: 5, name: 'Talmage Building',                 short: 'TMCB', floors: [1, 2, 3, 4],       lat: 40.249600, lng: -111.650862, size: [78, 46] },
  { id: 'esc',  dbId: 6, name: 'Eyring Science Center',            short: 'ESC',  floors: [1, 2, 3],          lat: 40.247227, lng: -111.650281, size: [66, 52] },
  { id: 'jkb',  name: 'Jesse Knight Building',                     short: 'JKB',  floors: [1, 2, 3, 4],       lat: 40.250211, lng: -111.649935, size: [62, 40] },
  { id: 'kmbl', name: 'Spencer W. Kimball Tower',                  short: 'KMBL', floors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], lat: 40.247512, lng: -111.651053, size: [50, 40], nudge: [-6, 0] },
  { id: 'mckb', name: 'McKay School of Education',                 short: 'MCKB', floors: [1, 2, 3],          lat: 40.247222, lng: -111.651861, size: [62, 40], nudge: [-6, 4] },
  { id: 'hrcb', name: 'Kennedy Center (Herald R. Clark Building)', short: 'HRCB', floors: [1, 2, 3],          lat: 40.247638, lng: -111.649381, size: [58, 38], nudge: [6, 0] },
  { id: 'marb', name: 'Thomas L. Martin Building',                 short: 'MARB', floors: [1, 2, 3],          lat: 40.246816, lng: -111.649241, size: [62, 40] },
  { id: 'cb',   name: 'Clyde Engineering Building',                short: 'CB',   floors: [1, 2, 3, 4],       lat: 40.246903, lng: -111.648087, size: [62, 42] },
  { id: 'ctb',  name: 'Crabtree Technology Building',              short: 'CTB',  floors: [1, 2, 3],          lat: 40.247434, lng: -111.646751, size: [60, 40] },
  { id: 'snlb', name: 'William H. Snell Building',                 short: 'SNLB', floors: [1, 2, 3],          lat: 40.247388, lng: -111.645336, size: [56, 38] },
  { id: 'jrcb', name: 'J. Reuben Clark Law Building',              short: 'JRCB', floors: [1, 2, 3, 4],       lat: 40.249580, lng: -111.645376, size: [76, 50] },
  { id: 'jsb',  name: 'Joseph Smith Building',                     short: 'JSB',  floors: [1, 2],             lat: 40.245845, lng: -111.651656, size: [56, 40], nudge: [-6, 0] },
  { id: 'bnsn', name: 'Ezra Taft Benson Building',                 short: 'BNSN', floors: [1, 2, 3],          lat: 40.245834, lng: -111.650856, size: [52, 38], nudge: [6, 0] },
];

const SPOTS = [
  // ---------- Harold B. Lee Library ----------
  { id: 's1', dbId: 1, name: 'Main Floor Group Tables', building: 'hbll', floor: 1, room: 'North reading area', position: { x: 22, y: 25 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'big group', busyness: 'Usually busy',
    description: 'Long tables near the entrance with outlets on every table. Good for group projects, but it fills up by mid-morning.' },
  { id: 's2', dbId: 2, name: 'Group Study Rooms', building: 'hbll', floor: 1, room: 'Rooms 1100–1130', position: { x: 70, y: 78 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Glass-walled rooms with a whiteboard and a wall screen. Close the door and talk as much as you need.' },
  { id: 's3', dbId: 3, name: 'West Window Carrels', building: 'hbll', floor: 2, room: 'West wall', position: { x: 10, y: 60 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'solo', busyness: 'Moderate',
    description: 'Single desks along the windows with natural light and an outlet at each carrel.' },
  { id: 's4', dbId: 4, name: 'Silent Reading Room', building: 'hbll', floor: 3, room: 'Room 3300', position: { x: 55, y: 22 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: false, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'Armchairs and total silence. Bring a charged laptop because outlets are hard to find.' },
  { id: 's5', dbId: 12, name: 'Atrium Lounge Chairs', building: 'hbll', floor: 4, room: 'Atrium overlook', position: { x: 45, y: 72 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Soft chairs around low tables overlooking the atrium. Quiet conversation is fine here.' },
  { id: 's6', dbId: 13, name: 'Top Floor Study Nook', building: 'hbll', floor: 5, room: 'Southeast corner', position: { x: 85, y: 80 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'A tucked-away corner with a handful of desks. Most people never make it up this far.' },

  // ---------- Wilkinson Student Center ----------
  { id: 's7', dbId: 5, name: 'Cougareat Tables', building: 'wsc', floor: 1, room: 'Food court', position: { x: 40, y: 30 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'big group', busyness: 'Usually busy',
    description: 'Loud at lunch, but the easiest place to grab food and spread out with a big group.' },
  { id: 's8', dbId: 6, name: 'Garden Court', building: 'wsc', floor: 2, room: 'Garden Court', position: { x: 60, y: 70 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: false, wifi: true, tables: true, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Bright, plant-filled space with tables and a few couches. A relaxed place to review with friends.' },
  { id: 's9', dbId: 14, name: 'Ballroom Hallway Lounge', building: 'wsc', floor: 3, room: 'Outside the Ballroom', position: { x: 25, y: 50 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Usually empty',
    description: 'Couches along a wide hallway. Empty most of the day unless there is an event in the Ballroom.' },
  { id: 's10', dbId: 7, name: 'East Terrace', building: 'wsc', floor: 1, room: 'East doors patio', position: { x: 92, y: 55 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: false, wifi: true, tables: true, comfySeating: false, outdoors: true },
    groupSize: 'big group', busyness: 'Moderate',
    description: 'Outdoor tables with mountain views. Best in fall and spring; the WiFi reaches most tables.' },

  // ---------- Joseph F. Smith Building ----------
  { id: 's11', dbId: 8, name: 'Courtyard Benches', building: 'jfsb', floor: 1, room: 'Center courtyard', position: { x: 50, y: 50 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: false, wifi: true, tables: false, comfySeating: false, outdoors: true },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Benches around the open courtyard. Nice for reading or a quick study session between classes.' },
  { id: 's12', dbId: 9, name: 'Atrium Tables', building: 'jfsb', floor: 2, room: 'Main atrium', position: { x: 35, y: 30 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'big group', busyness: 'Usually busy',
    description: 'Big shared tables in the atrium with outlets built into the floor. Popular before exams.' },
  { id: 's13', dbId: 15, name: 'Third-Floor Window Seats', building: 'jfsb', floor: 3, room: 'North windows', position: { x: 78, y: 18 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: false, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'Cushioned window ledges with a view of the courtyard. Quiet and rarely taken.' },
  { id: 's14', dbId: 16, name: 'Fourth-Floor Study Corner', building: 'jfsb', floor: 4, room: 'Near Room 4010', position: { x: 15, y: 82 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Usually empty',
    description: 'A few tables pushed together near the language labs. Whisper-level quiet.' },

  // ---------- Tanner Building ----------
  { id: 's15', dbId: 17, name: 'Tanner Atrium Tables', building: 'tnrb', floor: 1, room: 'Atrium', position: { x: 50, y: 40 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'big group', busyness: 'Usually busy',
    description: 'The central atrium with lots of tables. Great energy for group work; hard to find a seat at noon.' },
  { id: 's16', dbId: 18, name: 'Business Group Rooms', building: 'tnrb', floor: 3, room: 'Rooms 310–330', position: { x: 80, y: 25 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Small rooms with whiteboards. Meant for case teams, so they are perfect for 3–4 people.' },
  { id: 's17', dbId: 19, name: 'Fifth-Floor Quiet Lounge', building: 'tnrb', floor: 5, room: 'West lounge', position: { x: 20, y: 70 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'Leather chairs with side outlets. One of the calmest spots on campus.' },
  { id: 's18', dbId: 20, name: 'Tanner Front Patio', building: 'tnrb', floor: 1, room: 'South entrance', position: { x: 50, y: 92 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: false, wifi: true, tables: true, comfySeating: false, outdoors: true },
    groupSize: 'small group', busyness: 'Usually empty',
    description: 'A few outdoor tables by the south doors. Shady in the afternoon.' },

  // ---------- Talmage Building ----------
  { id: 's19', dbId: 21, name: 'CS Lab Commons', building: 'tmcb', floor: 1, room: 'Open lab area', position: { x: 30, y: 30 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Usually busy',
    description: 'Desks with monitors and lots of outlets. TAs are often nearby during lab hours.' },
  { id: 's20', dbId: 22, name: 'Hallway Booths', building: 'tmcb', floor: 2, room: 'East hallway', position: { x: 75, y: 50 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: true, wifi: true, tables: true, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'Padded booths that fit four. Good for pair programming or a quick snack while you study.' },
  { id: 's21', dbId: 23, name: 'Stairwell Quiet Tables', building: 'tmcb', floor: 3, room: 'By the north stairs', position: { x: 12, y: 20 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'Two small tables tucked by the stairs. Quiet and almost always open.' },

  // ---------- Eyring Science Center ----------
  { id: 's22', dbId: 24, name: 'ESC Lobby Tables', building: 'esc', floor: 1, room: 'Main lobby', position: { x: 50, y: 50 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: true, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'big group', busyness: 'Moderate',
    description: 'Round tables in the lobby next to the science exhibits. Plenty of room for a study group.' },
  { id: 's23', dbId: 25, name: 'Physics Tutoring Lab', building: 'esc', floor: 2, room: 'Room W166', position: { x: 25, y: 75 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'small group', busyness: 'Usually busy',
    description: 'Tables with tutors on hand. Busy the week before a physics exam.' },
  { id: 's24', dbId: 26, name: 'Upper Hallway Desks', building: 'esc', floor: 3, room: 'South hallway', position: { x: 70, y: 82 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: true, comfySeating: false, outdoors: false },
    groupSize: 'solo', busyness: 'Usually empty',
    description: 'A row of single desks with outlets in a quiet hallway.' },

  // ---------- Spots teammates submitted (also in supabase/seed.sql) ----------
  { id: 's25', dbId: 10, name: 'Business Lounge', building: 'tnrb', floor: 3, room: 'Third floor east lounge', position: { x: 70, y: 40 },
    features: { quietZone: true, talkingAllowed: false, foodAllowed: false, outlets: true, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Moderate',
    description: 'A quiet lounge with soft chairs and outlets, tucked away on the third floor.' },
  { id: 's26', dbId: 11, name: 'CS Lab Couches', building: 'tmcb', floor: 1, room: 'Outside the open lab', position: { x: 30, y: 65 },
    features: { quietZone: false, talkingAllowed: true, foodAllowed: false, outlets: true, wifi: true, tables: false, comfySeating: true, outdoors: false },
    groupSize: 'small group', busyness: 'Usually busy',
    description: 'Couches and a whiteboard right outside the lab. Handy for working through homework with classmates.' },
];
