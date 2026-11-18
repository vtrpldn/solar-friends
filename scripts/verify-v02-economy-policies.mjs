import {STARTING_CAPITAL} from '../web/v02/weekend/economy-reference.js';
import assert from 'node:assert/strict';
import {createWeekend,chooseCamp,PROJECTS,PROCESSES,MATERIALS,requiredLoads,automaticSales,queueProduction,materialCount,tick,save,restore,enableFastNavigation} from '../web/v02/weekend/simulation.js';
import {economyPolicies,salePreview} from '../web/v02/weekend/economy-policies.js';
import {syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
const fresh=()=>{const s=createWeekend(42);chooseCamp(s,'entrance');enableFastNavigation(s);s.rainSeen=s.rainResolved=true;return s;};
const built=(s,key,x,z)=>{const p={id:s.nextId++,key,x,z,work:PROJECTS[key].work,delivered:requiredLoads(key)};s.projects.push(p);syncInfrastructure(s,PROJECTS);return p;};
const s=fresh(),pol=economyPolicies(s);s.materials.bamboo=100;pol.sales.bamboo={enabled:true,keep:24,above:48,daily:24};
assert.equal(salePreview(s,'bamboo',MATERIALS,PROCESSES,materialCount).quantity,24);automaticSales(s);assert.equal(s.materials.bamboo,76);assert.equal(s.money,STARTING_CAPITAL.modest,'exports reserve goods rather than minting cash');automaticSales(s);assert.equal(s.materials.bamboo,76,'daily cap');
s.time=3200;automaticSales(s);assert.equal(s.materials.bamboo,52,'daily cap resets');const restored=restore(save(s));assert(restored);automaticSales(restored);assert.equal(restored.money,s.money,'reload cannot duplicate daily sales');
s.materials.food=25;s.materials.meals=0;pol.sales.food={enabled:true,keep:0,above:0,daily:0};automaticSales(s);assert.equal(s.materials.food,25,'population food reserve protected');
const g=built(s,'garden',23,-4);g.repeat='vegetables';g.stockTarget=60;s.materials.seedlings=8;pol.sales.seedlings={enabled:true,keep:0,above:0,daily:0};automaticSales(s);assert.equal(s.materials.seedlings,0,'obsolete repeat settings do not reserve unqueued inputs');
const bad=JSON.parse(save(s));bad.economyPolicies.sales.bamboo.keep=-1;assert.equal(restore(JSON.stringify(bad)),null);const invalid=JSON.parse(save(s));invalid.projects[0].stockTarget=-1;assert.equal(restore(JSON.stringify(invalid)),null);
// A real production job must progress alongside resident construction, not only after it.
const mixed=fresh();const b=built(mixed,'supply-1',23,-4);assert.equal(queueProduction(mixed,b.id,'bamboo'),'');const house=built(mixed,'home-shared',40,1);house.work=0;delete mixed.infrastructure.nodes[house.id];mixed.infrastructure.links=mixed.infrastructure.links.filter(l=>l.from!==house.id&&l.to!==house.id);syncInfrastructure(mixed,PROJECTS);economyPolicies(mixed).work={food:3,maintenance:3,production:1,construction:3,essentialWorkers:1,productionWorkers:1};
let simultaneous=false;for(let i=0;i<20000;i++){tick(mixed,.1);if(mixed.operations.some(o=>o.recipe==="bamboo"&&o.planted)&&house.work>0&&house.work<PROJECTS[house.key].work){simultaneous=true;break;}}assert(simultaneous,'reserved production runs during a high-priority house build');
assert(restore(save(mixed)),'work priorities and manual production restore');
// Legacy repeat settings cannot schedule new work, even before a reload.
const target=fresh();target.materials.bamboo=20;for(let i=0;i<3;i++){const p=built(target,'supply-1',23+i*3,-4);p.repeat='bamboo';p.stockTarget=24;}tick(target,.1);assert.equal((target.operations||[]).filter(o=>o.recipe==='bamboo').length,0,'legacy repeat flags do not queue work');
console.log('PASS automatic sales, protected food, daily rollover, save validation, concurrent production/construction and retired repeat policies');
