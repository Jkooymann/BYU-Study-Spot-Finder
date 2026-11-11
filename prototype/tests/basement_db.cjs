// Exercise the real database adapter with an isolated fake Supabase client.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let stored;
const context = vm.createContext({
  SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test',
  supabase: { createClient() { return { from() {
    let selected;
    const query = {
      insert(row) { stored = { ...row, study_spot_id: 100, study_spot_amenity: [] }; return query; },
      select(fields) { selected=fields; return query; },
      eq() { return query; },
      async single() { return { data: selected === 'study_spot_id' ? { study_spot_id: 100 } : stored }; },
      async order() { return { data: [stored] }; },
    };
    return query;
  } }; } },
});
const root=path.join(__dirname,'../js');
vm.runInContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),context);
vm.runInContext('const buildingById = id => BUILDINGS.find(b => b.id === id);',context);
vm.runInContext(fs.readFileSync(path.join(root,'db.js'),'utf8'),context);
(async()=>{
  for(const floor of ['B',1,8]) {
    context.testFloor=floor;
    const result=await vm.runInContext(`DB.addSpot(1,{building:'jfsb',floor:testFloor,name:'Test',features:{},groupSize:'solo',position:{x:25,y:25}})`,context).catch(error=>{throw error;});
    // Newer buildings resolve their database ID at load time; emulate that binding.
    assert.equal(result.floor,floor);
    assert.equal(stored.floor_number,floor==='B'?0:floor);
    const loaded=await vm.runInContext('DB.studentSpots()',context);
    assert.equal(loaded[0].floor,floor);
  }
  console.log('PASS: real DB adapter saves B as integer 0 and restores Floor B; numeric floors unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;});
