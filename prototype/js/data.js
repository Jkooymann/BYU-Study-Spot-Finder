/* =========================================================================
   BYU Study Spot Finder — MOCK DATA
   This is the ONE data file every screen reads from.
   Study spots and favorites are saved in Supabase (shared with the whole
   team) — see db.js. This file holds buildings and filter options.

   Spot data model (the shape db.js turns each study_spot row into)
   ---------------
   id          unique string
   dbId        study_spot_id of the spot in the Supabase database
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
const BUSYNESS_HINTS = { 'Usually empty': 'Easy to find a seat', Moderate: 'Some seats open', 'Usually busy': 'Hard to find a seat' };

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
   floors   team-supplied floor labels, in display order; B is the basement. */
const BUILDINGS = [
  { id: 'rb', name: 'Richards Building', short: 'RB', floors: [1, 2, 3] },
  { id: 'canc', name: 'Cannon Center', short: 'CANC', floors: [1] },
  { id: 'mb', name: 'Music Building', short: 'MB', floors: [1, 2, 3, 4] },
  { id: 'arts', name: 'Arts Building', short: 'ARTS', floors: [1, 2, 3, 4] },
  { id: 'lsb', name: 'Life Sciences Building', short: 'LSB', floors: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'eb', name: 'Engineering Building', short: 'EB', floors: [1, 2, 3, 4, 5] },
  { id: 'hbll', dbId: 1, name: 'Harold B. Lee Library',            short: 'HBLL', floors: [1, 2, 3, 4, 5, 6, 7, 8],    lat: 40.248630, lng: -111.649260, size: [104, 86] },
  { id: 'wsc',  dbId: 2, name: 'Wilkinson Student Center',         short: 'WSC',  floors: [1, 2, 3, 4, 5, 6, 7],          lat: 40.248609, lng: -111.647124, size: [108, 84] },
  { id: 'jfsb', dbId: 3, name: 'Joseph F. Smith Building',         short: 'JFSB', floors: ["B", 1, 2, 3, 4, 5],       lat: 40.248371, lng: -111.651633, size: [104, 70] },
  { id: 'tnrb', dbId: 4, name: 'Tanner Building',                  short: 'TNRB', floors: [1, 2, 3, 4, 5, 6, 7, 8], lat: 40.250409, lng: -111.652574, size: [88, 54] },
  { id: 'tmcb', dbId: 5, name: 'Talmage Building',                 short: 'TMCB', floors: [1, 2, 3, 4, 5, 6, 7, 8],       lat: 40.249600, lng: -111.650862, size: [78, 46] },
  { id: 'esc',  dbId: 6, name: 'Eyring Science Center',            short: 'ESC',  floors: ["B", 1, 2, 3, 4, 5, 6],          lat: 40.247227, lng: -111.650281, size: [66, 52] },
  { id: 'jkb',  name: 'Jesse Knight Building',                     short: 'JKB',  floors: [1, 2, 3, 4, 5, 6, 7, 8],       lat: 40.250211, lng: -111.649935, size: [62, 40] },
  { id: 'kmbl', name: 'Spencer W. Kimball Tower',                  short: 'KMBL', floors: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], lat: 40.247512, lng: -111.651053, size: [50, 40], nudge: [-6, 0] },
  { id: 'mckb', name: 'McKay School of Education',                 short: 'MCKB', floors: [1, 2, 3],          lat: 40.247222, lng: -111.651861, size: [62, 40], nudge: [-6, 4] },
  { id: 'hrcb', name: 'Kennedy Center (Herald R. Clark Building)', short: 'HRCB', floors: [1, 2],          lat: 40.247638, lng: -111.649381, size: [58, 38], nudge: [6, 0] },
  { id: 'marb', name: 'Thomas L. Martin Building',                 short: 'MARB', floors: [1, 2, 3],          lat: 40.246816, lng: -111.649241, size: [62, 40] },
  { id: 'cb',   name: 'Clyde Engineering Building',                short: 'CB',   floors: [1, 2, 3, 4, 5],       lat: 40.246903, lng: -111.648087, size: [62, 42] },
  { id: 'ctb',  name: 'Crabtree Technology Building',              short: 'CTB',  floors: [1, 2, 3, 4, 5, 6, 7, 8, 9],          lat: 40.247434, lng: -111.646751, size: [60, 40] },
  { id: 'snlb', name: 'William H. Snell Building',                 short: 'SNLB', floors: [1, 2],          lat: 40.247388, lng: -111.645336, size: [56, 38] },
  { id: 'jrcb', name: 'J. Reuben Clark Law Building',              short: 'JRCB', floors: ["B", 1, 2, 3, 4, 5],       lat: 40.249580, lng: -111.645376, size: [76, 50] },
  { id: 'jsb',  name: 'Joseph Smith Building',                     short: 'JSB',  floors: [1, 2, 3],             lat: 40.245845, lng: -111.651656, size: [56, 40], nudge: [-6, 0] },
  { id: 'bnsn', name: 'Ezra Taft Benson Building',                 short: 'BNSN', floors: ["B", 1, 2, 3, 4, 5],          lat: 40.245834, lng: -111.650856, size: [52, 38], nudge: [6, 0] },
];

// Every study spot now comes from the Supabase database (see db.js and
// Store.loadShared). The old built-in example spots were removed; the browser
// tests keep a copy in tests/sample_spots.js.
const SPOTS = [];

// Public floor labels stay readable; the existing database integer column uses 0 for B.
function parseFloor(value) { return String(value).toUpperCase() === 'B' ? 'B' : Number(value); }
function floorOrder(value) { return value === 'B' ? 0 : Number(value); }
function floorFromDatabase(value) { return Number(value) === 0 && value != null ? 'B' : value; }
function floorToDatabase(value) { return value === 'B' ? 0 : value; }
