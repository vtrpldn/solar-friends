import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
const output=process.argv[2]??'artifacts/biome-tradeoffs';await mkdir(output,{recursive:true});
const wasm=await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url));await init({module_or_path:wasm});
const hash=data=>createHash('sha256').update(data).digest('hex'),catalogGame=new Game();
const catalog=JSON.parse(catalogGame.scenario_catalog());catalogGame.free();
const report={passed:false,scope:'Controlled authored properties in all three biomes and two seeds. Sixty simulated minutes per crop comparison; moisture is the native crop minute-equivalent summary, not litres; instantaneous solar comparisons. Complements full seasonal-cycle evidence; not a visual, example-difficulty, long-term irrigation logistics or performance approval.',wasm_sha256:hash(wasm),script_sha256:hash(await readFile(new URL(import.meta.url))),cases:[]};
const persist=()=>writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
function load(g,d){const r=JSON.parse(g.load_scenario(JSON.stringify(d)));assert(r.ok,JSON.stringify(r));}
function checkpoint(g){const raw=g.snapshot(),copy=new Game();try{assert(copy.restore(raw));assert.equal(copy.snapshot(),raw);for(let i=0;i<8;i++){g.tick(.25);copy.tick(.25);}assert.equal(copy.snapshot(),g.snapshot(),'Checkpoint continuation stays exact');}finally{copy.free();}}
function accounts(g){const water=JSON.parse(g.water_report());for(let i=0;i<4;i++)assert(Math.abs(water.opening[i]+water.received[i]-water.consumed[i]-water.present[i])<.001);assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));const n=JSON.parse(g.snapshot()).village.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,node)=>sum+node.charge,0))<.001);}
for(const biome of catalog.biomes)for(const seed of [42,73]){
 const key=`${biome.id}-${seed}`,baseGame=new Game();let base;
 try{base=JSON.parse(baseGame.scenario_template('sandbox'));base.map=JSON.parse(baseGame.generate_biome_property(biome.id,seed));}finally{baseGame.free();}
 // Preserve the generated regional ground outside the controlled test plots.
 base.id=key;base.title='Regional planning tradeoffs';base.journal=null;base.map.river=null;base.map.nature=[];
 base.start.residents=base.start.residents.slice(0,1);base.start.minutes=720;
 Object.assign(base.rules,{climate:true,land:true,utilities:true,logistics:true,maintenance:false,market:false});
 base.rules.weather={...biome.weather,wet_rain_chance:0,dry_rain_chance:0,intro_days:0};
 const ground={habitat:'flower-meadow',fertility:.6,retention:1.1,cover:.4};
 for(let y=14;y<=23;y++)for(let x=14;x<=23;x++)base.map.terrain[y*64+x]={...ground};
 const original=JSON.stringify(base),rows={biome:biome.id,seed,profile:base.rules.weather,comparisons:{}};
 const measure=(label,{dry=false,shade=false,solar=false,clouds=false,minutes=720}={})=>{
  const d=structuredClone(base);d.start.minutes=(dry?biome.weather.season_days*1440:0)+minutes;
  if(clouds)d.rules.weather.wet_rain_chance=100;
  d.start.buildings.push({id:'test-plot',kind:solar?'solar_farm':'garden',x:18,y:18,state:'completed',recipe:'standard',appearance:null,...(!solar?{crop:{crop:'lettuce',stage:'planted',next_crop:'lettuce',replant:false,soil_wetness:.8}}:{})});
  if(shade)for(const [id,x,y]of [['shade-west',15,18],['shade-north',18,15]])d.start.buildings.push({id,kind:'grove',x,y,state:'completed',recipe:'standard',appearance:null});
  const g=new Game();try{
   load(g,d);const opening=JSON.parse(g.snapshot()),id=opening.village.scenario.buildings['test-plot'],preview=JSON.parse(g.land_preview(solar?'solar_farm':'garden',18,18));
   const read=s=>({weather:s.environment.weather.current,forecast:s.environment.weather.forecast[0],moisture:s.village.buildings.find(b=>b.id===id).crop.moisture,growth:s.village.buildings.find(b=>b.id===id).crop.growth,solar:s.environment.power.solar_generation});
   const before=read(opening);if(!solar)for(let frame=0;frame<80;frame++)g.tick(.25);
   const after=read(JSON.parse(g.snapshot()));accounts(g);checkpoint(g);accounts(g);
   rows.comparisons[label]={definition_sha256:hash(JSON.stringify(d)),ground:preview.ground,before,after,moistureLost:before.moisture-after.moisture};return rows.comparisons[label];
  }finally{g.free();}
 };
 const wet=measure('wet-open'),dry=measure('dry-open',{dry:true}),shaded=measure('wet-shaded',{shade:true});
 assert(wet.moistureLost>0);assert(dry.moistureLost>wet.moistureLost,'Dry regional weather must increase crop moisture loss');
 assert(shaded.ground.shade>wet.ground.shade);assert(shaded.moistureLost<wet.moistureLost,'Shade must preserve moisture');assert(shaded.after.growth<wet.after.growth,'Heavy shade must reduce crop growth');
 assert.equal(dry.before.weather.raining,false);assert.equal(wet.before.weather.raining,false);
 const sun=measure('sunny-solar',{solar:true}),shade=measure('shaded-solar',{solar:true,shade:true});assert(sun.before.solar>shade.before.solar&&shade.before.solar>0,'Canopies reduce actual solar supply');
 const cloudyProbe=measure('cloud-window',{solar:true,clouds:true}),minute=cloudyProbe.before.forecast.rain_start+40;
 const clear=measure('clear-at-rain-window',{solar:true,minutes:minute}),cloud=measure('cloudy-solar',{solar:true,clouds:true,minutes:minute});
 assert(cloud.before.weather.raining);assert(cloud.before.weather.clouds>clear.before.weather.clouds);assert(cloud.before.solar<clear.before.solar&&cloud.before.solar>0,'Clouds reduce actual solar supply at the same sun position');
 assert.equal(JSON.stringify(base),original,'Compiling comparisons cannot mutate the authored source');
 report.cases.push(rows);await persist();console.log(`${key}: dry crop moisture loss ${dry.moistureLost.toFixed(3)} > wet ${wet.moistureLost.toFixed(3)} > shaded ${shaded.moistureLost.toFixed(3)}; shade/cloud solar tradeoffs pass`);
}
report.passed=true;await persist();console.log('PASS six regional/seed planning comparisons with native compilation, conserved accounts and exact checkpoint continuations.');
