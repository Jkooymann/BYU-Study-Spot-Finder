// Real adapter + shared store with an isolated client; never contacts Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let stored;
const context = vm.createContext({
  console,
  SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test',
  supabase: { createClient() { return { from() {
    let selected;
    const query = {
      insert(row) { stored = { ...row, study_spot_id: 100, study_spot_amenity: [] }; return query; },
      select(fields) { selected = fields; return query; },
      eq() { return query; },
      async single() { return { data: selected === 'study_spot_id' ? { study_spot_id: 100 } : stored }; },
      async order() { return { data: [stored] }; },
    };
    return query;
  } }; } },
});
const root = path.join(__dirname, '../js');
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'db.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), context);
(async () => {
  for (const building of ['', 'hbll']) {
    context.testBuilding = building;
    const result = await vm.runInContext(`DB.addSpot(1, {name:'Outdoor test',building:testBuilding,floor:null,position:null,campusPosition:{x:0,y:100},features:{outdoors:true},groupSize:'solo'})`, context);
    assert.equal(stored.building_id, building ? 1 : null);
    assert.equal(stored.floor_number, null);
    assert.equal(stored.floor_plan_x_percent, null);
    assert.equal(stored.floor_plan_y_percent, null);
    assert.equal(stored.campus_map_x_percent, 0);
    assert.equal(stored.campus_map_y_percent, 100);
    assert.equal(result.building, building);
    assert.equal(result.floor, null);
    assert.equal(result.position, null);
    assert.equal(result.campusPosition.x, 0);
    const loaded = await vm.runInContext('DB.studentSpots()', context);
    assert.equal(loaded[0].campusPosition.y, 100);
  }
  for (const pin of [null, {x:-1,y:50}, {x:50,y:101}, {x:NaN,y:50}]) {
    context.badPin = pin;
    await assert.rejects(vm.runInContext(`DB.addSpot(1,{building:'',features:{outdoors:true},campusPosition:badPin})`, context), /Place an outdoor pin/);
  }
  // A legacy outside spot keeps its old floor coordinate system.
  stored = {study_spot_id:101,building_id:1,is_indoors:false,floor_number:2,floor_plan_x_percent:20,floor_plan_y_percent:30};
  const legacy = (await vm.runInContext('DB.studentSpots()', context))[0];
  assert.equal(legacy.campusPosition, null);
  assert.equal(legacy.floor, 2);
  assert.equal(legacy.position.x, 20);
  // Exercise the actual store loader, which previously dropped buildingless spots.
  vm.runInContext(`DB.buildings = async () => []; DB.currentStudent = async () => ({user_id:1}); DB.favoriteSpotIds = async () => [101];`, context);
  stored.building_id = null;
  await vm.runInContext('Store.loadShared()', context);
  assert.equal(vm.runInContext('Store.getSpot("d101").features.outdoors', context), true);
  assert.equal(vm.runInContext('Store.favorites()[0]', context), 'd101');
  console.log('PASS: outdoor DB round trips, optional landmarks, boundaries, validation, legacy pins and shared favorites');
})().catch(error => { console.error(error); process.exitCode = 1; });
