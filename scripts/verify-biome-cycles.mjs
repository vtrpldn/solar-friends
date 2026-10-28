import {buyServiceParts} from './upkeep-playtest.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
const wasm=await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url));await init({module_or_path:wasm});
const settlement=process.argv.includes('--settlement'),population=settlement?5:1;
const biomeArg=process.argv.find(a=>a.startsWith('--biome='))?.slice(8),seedArg=process.argv.find(a=>a.startsWith('--seed='))?.slice(7);
const output=process.env.SOLAR_BIOME_CYCLES_OUTPUT||(settlement?'artifacts/biome-settlement-cycles':'artifacts/biome-cycles');await mkdir(output,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex'),catalogGame=new Game(),catalog=JSON.parse(catalogGame.scenario_catalog());catalogGame.free();
assert(!biomeArg||catalog.biomes.some(b=>b.id===biomeArg));assert(!seedArg||['42','73'].includes(seedArg));
const results={passed:false,population,maintenance:settlement,market:settlement,wasm_sha256:hash(wasm),script_sha256:hash(await readFile(new URL(import.meta.url))),scope:settlement?'Five residents, three gardens, beds, kitchen, inherited workshop wear, automatic service and finite paid upkeep orders; default Sandbox opening funds. Not an example-difficulty, artwork, maximum-roster or full release approval.':'One resident; finite logistics/water, living land and real regional seasons. Maintenance disabled to isolate climate. Not a population, artwork, example-difficulty or full equipment-lifecycle release approval.',cases:[]};
const persist=()=>writeFile(output+'/report.json',JSON.stringify(results,null,2));await persist();
for(const biome of catalog.biomes.filter(b=>!biomeArg||b.id===biomeArg))for(const seed of [42,73].filter(s=>!seedArg||s===Number(seedArg))){
 const g=new Game();let continuation=null,continuationUntil=0;
 const key=`${biome.id}-${seed}`,days=biome.weather.season_days*2;
 try{
  const d=JSON.parse(g.scenario_template('sandbox'));d.id='seasonal-'+key;d.title='Seasonal check '+key;d.journal=null;d.map=JSON.parse(g.generate_biome_property(biome.id,seed));if(seed===73)d.map.river=null;
  // An authored soil override proves the cycle uses the frozen edited property.
  d.map.terrain[25*64+28]={habitat:'flower-meadow',fertility:.6,retention:1.1,cover:.4};
  Object.assign(d.rules,{logistics:true,utilities:true,land:true,climate:true,maintenance:settlement,learning:true,market:settlement});delete d.rules.weather;
  d.start.residents=d.start.residents.slice(0,population);d.start.minutes=0;d.start.fresh_water=100;
  for(const [id,kind,x,y] of [['home','home',25,25],['garden','garden',28,25],['cistern','well',31,25],['solar','solar_farm',34,25]])d.start.buildings.push({id,kind,x,y,state:'completed',recipe:'standard',appearance:null,...(kind==='garden'?{crop:{crop:'lettuce',stage:'planted',next_crop:'lettuce',replant:true,soil_wetness:.8}}:{})});
  if(settlement){
   for(const [id,kind,x,y]of [['home-2','home',22,25],['home-3','home',22,28],['garden-2','garden',28,34],['garden-3','garden',28,37],['kitchen','kitchen',25,28],['workshop','workshop',22,31]])d.start.buildings.push({id,kind,x,y,state:'completed',recipe:'standard',appearance:null,...(kind==='garden'?{crop:{crop:'lettuce',stage:'planted',next_crop:'lettuce',replant:true,soil_wetness:.8}}:{})});
   for(const inventory of d.start.inventories)delete inventory.items.tools;
   d.start.equipment=[{asset:{kind:'workshop',id:'workshop'},condition:65,defer_automatic:false}];d.start.automatic_service=true;d.start.residents[1].outside_shifts=true;
  }
  const loaded=JSON.parse(g.load_scenario(JSON.stringify(d)));assert(loaded.ok,JSON.stringify(loaded));
  const geometry=JSON.parse(g.world_geometry());if(d.map.river){const site=geometry.hydro_sites.find(([x,y])=>x>0&&y>=4&&y<60);assert(site,'Generated river offers a real hydro site');d.start.buildings.push({id:'river-generator',kind:'hydro',x:site[0],y:site[1],state:'completed',recipe:'standard',appearance:null});assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);}else assert.equal(geometry.hydro_sites.length,0);
  const initial=JSON.parse(g.snapshot()),garden=initial.village.scenario.buildings.garden;
  const report={biome:biome.id,seed,river:d.map.river!==null,days,definition_sha256:hash(JSON.stringify(d)),profile:initial.environment.weather.profile,opening_funds:d.start.funds,service_orders:0,service_spending:0,service_receipts:[],tools_price:[Infinity,-Infinity],completed_services:0,checks:0,continuations:0,seasons:{wet:{days:0,rain_days:0,rain_observations:0,evaporation:[],hydro:[Infinity,-Infinity]},dry:{days:0,rain_days:0,rain_observations:0,evaporation:[],hydro:[Infinity,-Infinity]}},min_food:Infinity,max_hunger:0,min_energy:100,soil_moisture:[Infinity,-Infinity],generated_energy:0,solar_output_max:0,rain_caught:false,harvests:0,harvests_when_lonely:null};
  assert.equal(report.profile.intro_days,0);assert.equal(report.profile.season_days,biome.weather.season_days);const forecast=new Map();
  await writeFile(output+'/'+key+'-definition.json',JSON.stringify(d));
  for(let frame=0;frame<=days*1920;frame++){
   if(frame%40===0){const s=JSON.parse(g.snapshot()),v=s.village,w=s.environment.weather,current=w.current,day=Math.floor(v.minutes/1440),today=w.forecast[0],season=report.seasons[today.season];
    assert.equal(w.profile.season_days,report.profile.season_days);assert.equal(v.scenario.definition.map.biome.id,biome.id);assert.equal(s.residents.length,population);if(!d.map.river)assert(s.environment.power.hydro_generation===0,'No-river properties cannot invent hydro output');
    const time=v.minutes%1440;assert.equal(current.raining,today.rain_expected&&time>=today.rain_start&&time<today.rain_end,'Forecast and actual rain window agree');
    if(frame<days*1920){season.rain_observations+=Number(current.raining);season.hydro[0]=Math.min(season.hydro[0],s.environment.power.hydro_generation);season.hydro[1]=Math.max(season.hydro[1],s.environment.power.hydro_generation);if(!season.evaporation.includes(current.evaporation))season.evaporation.push(current.evaporation);}
    report.solar_output_max=Math.max(report.solar_output_max,s.environment.power.solar_generation);report.rain_caught ||= v.progress.rain_caught;
    const crop=v.buildings.find(b=>b.id===garden).crop;report.soil_moisture[0]=Math.min(report.soil_moisture[0],crop.moisture);report.soil_moisture[1]=Math.max(report.soil_moisture[1],crop.moisture);report.harvests=v.harvests;if(population===1&&s.residents[0].social===0&&report.harvests_when_lonely===null)report.harvests_when_lonely=v.harvests;report.min_food=Math.min(report.min_food,v.food+v.meals);report.max_hunger=Math.max(report.max_hunger,...s.residents.map(r=>r.hunger));report.min_energy=Math.min(report.min_energy,...s.residents.map(r=>r.energy));
    if(settlement){
     const upkeep=JSON.parse(g.maintenance_report());report.completed_services=Math.max(report.completed_services,upkeep.jobs.filter(j=>j.job.finished!==null).length);
     const price=s.environment.economy.materials[catalog.materials.indexOf('tools')].price;report.tools_price[0]=Math.min(report.tools_price[0],price);report.tools_price[1]=Math.max(report.tools_price[1],price);
     const buy=(game,state)=>{const order=buyServiceParts(game,state);if(order)assert.equal(state.environment.economy.money-JSON.parse(game.snapshot()).environment.economy.money,order.paid,'Upkeep purchase must charge the real quoted cost');return order;};
     const order=buy(g,s);if(order){report.service_orders++;report.service_spending+=order.paid;report.service_receipts.push({minutes:v.minutes,parts:order.parts,paid:order.paid});}if(continuation)buy(continuation,JSON.parse(continuation.snapshot()));
    }
    if(frame%1920===0){
     if(forecast.has(day))assert.deepEqual(today,forecast.get(day),'Saved seven-day forecast predicts the later day');for(const prediction of w.forecast)forecast.set(prediction.day,prediction);
     if(frame<days*1920){season.days++;season.rain_days+=Number(today.rain_expected);}
     const saved=g.snapshot(),copy=new Game();assert(copy.restore(saved),key+' checkpoint reload');assert.equal(copy.snapshot(),saved);assert.equal(copy.weather_report(),g.weather_report());copy.free();
     assert(JSON.parse(g.simulation_report()).materials.every(m=>m.difference===0));const water=JSON.parse(g.water_report());for(let i=0;i<4;i++)assert(Math.abs(water.opening[i]+water.received[i]-water.consumed[i]-water.present[i])<.001);
     const n=v.power.network,a=n.account;assert(Math.abs(a.opening+a.generated-a.consumed-a.curtailed-a.discharged-n.nodes.reduce((sum,p)=>sum+p.charge,0))<.001);report.checks++;
     if(frame<days*1920&&day%7===0){assert.equal(continuation,null);continuation=new Game();assert(continuation.restore(saved));continuationUntil=frame+80;}
     if(day%7===0||frame===days*1920)console.log(`${key}: ${day}/${days} days; ${today.season}, ${report.checks} conserved checkpoints`);
     if(day===biome.weather.season_days||frame===days*1920)await writeFile(output+'/'+key+'-day-'+day+'.json',saved);
    }
    if(frame===days*1920)report.generated_energy=v.power.network.account.generated-initial.village.power.network.account.generated;
   }
   if(continuation&&frame===continuationUntil){assert.equal(continuation.snapshot(),g.snapshot(),'Reloaded simulation must continue exactly');continuation.free();continuation=null;report.continuations++;}
   if(frame<days*1920){g.tick(.25);continuation?.tick(.25);}
  }
  assert.equal(report.seasons.wet.days,biome.weather.season_days);assert.equal(report.seasons.dry.days,biome.weather.season_days);assert(report.seasons.wet.rain_observations>0);assert(report.seasons.dry.evaporation[0]>report.seasons.wet.evaporation[0]);assert(report.generated_energy>0);assert(report.solar_output_max>0);assert(report.rain_caught,'Real rain must reach the cistern');if(d.map.river)assert(report.seasons.wet.hydro[0]>report.seasons.dry.hydro[1],'River generator output follows the lower dry-season flow');assert(report.harvests>0,'A planted bed must support real harvested output');if(population===1)assert(report.harvests_when_lonely!==null&&report.harvests>report.harvests_when_lonely,'Solo harvesting must continue after social need reaches zero');else{assert(report.service_orders>0,'Missing inherited service tools must be bought through town');assert(report.tools_price[1]>report.tools_price[0],'Seasonal market prices must actually vary');assert(report.completed_services>0,'Residents must complete real equipment service');assert(report.max_hunger<95,'The settlement must keep food accessible');assert(report.min_energy>20,'The settlement must retain actual rest');}assert(report.continuations>=6);results.cases.push(report);await persist();
 }catch(error){await writeFile(output+'/'+key+'-failure.json',g.snapshot());results.failure={case:key,message:error.message};await persist();throw error;}finally{continuation?.free();g.free();}
}
results.passed=true;await persist();console.log(`PASS: ${results.cases.length} full regional wet/dry cycles, forecasts, rain, crops, solar and exact continued checkpoints; ${output}/report.json`);
