import { projectLabel, numberProject, numberProjects } from "./project-names.js";
import { brl } from "./money.js";
import {ensureAnimalCare,animalAvailable,collectAnimal,validAnimalCare,animalWaitText} from './animal-care.js';
import {packDrinkingWater,hydrationWorkFactor} from './hydration.js';
import {ensureHydrology,extractWater,validHydrology} from './hydrology.js';
import {weatherStep,validWeather} from './weather.js';
import {harvestExpired,CROPS,fieldSizeValid,bedLayout,bedWorld,ensureCultivation,farmAutoBuy,farmRecipe,farmJobError,farmJobSpec,finishFarmJob,cultivationStep,validCultivation} from './cultivation.js';
import {foodPolicy,validFoodPolicy,manageKitchens} from './food-policy.js';
import {startAutonomousWork,autonomousWorkPlan} from './autonomous-work.js';
import {pantryForecast,foodSurplus} from './food-planning.js';
import {registerGathering,gatheringStatus,gatheringState,validGathering} from './gathering.js';
import {biologyLabel} from './biological-production.js';
import {foodPortions,FOOD_SERVINGS} from './food-storage.js';
import {quantityText} from './material-measures.js';
import {supplierError,reserveSupplier,validSuppliers,purchaseCategory} from './supplier-stock.js';
import {validMaterialLedger} from './material-ledger.js';
import {productionLoad,validProductionHauling} from './production-hauling.js';
import {projectMaterials,captureProjectMaterials} from './project-materials.js';
import {dispatchReady,validLogisticsPolicy} from './logistics-policy.js';
import {requestRemoval,removalStep,validRemovals} from './building-lifecycle.js';
import {orderDelivery,deliveryStep,validDelivery} from "./deliveries.js";
import {activeTrips,uncollectedProjects} from "./trip-state.js";
import {upkeepStep,performUpkeep,recordVehicleDistance,validUpkeep,serviceParts,ANIMAL_CARE} from "./asset-upkeep.js";
import {tripEstimate,STARTING_CAPITAL} from "./economy-reference.js";
import {CROP_CARE,BIOLOGY,beginBiology,biologicalStep,harvestOutput,validBiology} from "./biological-production.js";
import {atTownJob, dayShiftDue, startOutsideWork, outsideWorkStep, validOutsideWork} from "./outside-work.js";
import {coolStoredFood} from './cold-storage.js';
import {refreshSandboxFood,foodChange,takeFoodLots,freshLots,foodStorageStep,validFoodStorage,returnUnsoldFood,FOOD_DAYS} from './food-storage.js';
import {recordProduction,validProductionAccounting} from './production-accounting.js';
import {applyConstructionSpecs,migrateConstructionLabor,CONSTRUCTION_LABOR_VERSION} from './construction-specs.js';
import {collectionBudget,spendableMoney} from './procurement-budget.js';
import {returnPickup,pickupFare,reserveExport,pendingExports,loadExports,settleExports,validTrade,transportCost,fitsCargo,blueprintManifest,receiveBlueprintShipment,projectFreight} from './physical-trade.js';
import {recordEvent} from './event-history.js';
import {footfallBefore,recordFootfall,repairFootfall,trodden} from './footfall.js';
import { unrotatedSiteSize, validSiteVersion } from './site-space.js';
import { accessGeometry, insideSolid, segmentHitsSolid, BODY_RADIUS } from './building-access.js';
import { craftingBlocker, craftStage, practiceCraft, validCraftSkills } from './crafting.js';
import { equipmentState, equipmentSummary, protectedEquipment, releaseEquipment, useEquipment, productionEquipment, repairEquipment, validEquipment } from './equipment.js';
import { migrateItemProjects } from "./items.js";
import {economyPolicies,workGroup,salePreview,validatePolicies} from './economy-policies.js';
import {ensureFinances,recordMoney,transact,validFinances} from './finances.js';
import {registerNaturalProjects,ensureNaturalLand} from './natural-resources.js';
import { STORAGE_KINDS, crewLimit, carriedLoads, crewEfficiency } from "./construction-logistics.js";
import {registerWorld,validSettings,townDuration,waterFactor} from './world-settings.js';
import {depositCapacity} from './land-layout.js';
import {idleActivity,clearDowntime,downtimeInvalid} from './resident-downtime.js';
import {workMultiplier,profileFor} from './resident-personality.js';
import {workPreference,noticeAspiration,validMind} from './resident-mind.js';
import { ensureNeeds, decayNeeds, chooseNeed, advanceNeed, validNeeds, cancelNeed } from "./resident-needs.js";
import { validTerrainVertices } from "./terraform.js";
import { ROAD_SHIFT } from "./road-layout.js";
import { roadLine } from "./placement-helpers.js";
import { autoConnectUtilities } from "./auto-utilities.js";
import { PathQueue } from "./path-queue.js";
import { carDoor, TRIP_DURATION, DRIVE_DURATION } from "./town-trip.js";
import { CELL_MIN, CELL_MAX } from "./map-size.js";
import { foundationPad, elevationAt } from "./elevation.js";
import { OPENING_PROJECTS, openingProgress } from "./opening.js";
import { COMMUNITY } from "../library/community-defs.js";
import {
  ensureInfrastructure,
  syncProjectNode,
  syncInfrastructure,
  infrastructureStep,
  connect,
  useWater,
  LIQUIDS,
  liquidIndex,
  retireUntreatedWater,
  validInfrastructure,
} from "./infrastructure.js";
import { expandMaterials, expandProjects, PROCESSES } from "./catalog-rules.js";
import { accessRoadAt, PARKING_SITE } from "./road-layout.js";
import { ARRIVAL_DURATION, ARRIVAL_SPOTS } from "./arrival.js";
import { CAMP_LOADS, campPoint, campRect, campCells, campSiteCells, campDoor, campApproach, campDropSpot, campEdges } from "./camp.js";
import { riverBankAt, riverAccess, riverCenter, riverWidth } from "./river-layout.js";
// A self-contained v2 prototype. Time is measured in active simulation seconds.
export const CAMPS = [
  {
    id: "shade",
    name: "Under the trees",
    x: 28,
    z: 31,
    shade: true,
    wet: false,
    description: "Cool afternoons, but a longer walk from the unloading point.",
  },
  {
    id: "entrance",
    name: "Beside the entrance",
    x: 33,
    z: 27 - ROAD_SHIFT / 2,
    shade: false,
    wet: false,
    description: "Quick unloading beside the entrance clearing.",
  },
  {
    id: "clearing",
    name: "The open clearing",
    x: 36,
    z: 36,
    shade: false,
    wet: false,
    description: "Dry, roomy ground. You’ll need to make your own shade.",
  },
];
export const MATERIALS = {
  wood: { name: "timber pieces", batch: 4, quantity: 12, price: 432 },
  hardware: { name: "fastener packs", batch: 1, quantity: 2, price: 30 },
  roofing: { name: "roof sheets", batch: 2, quantity: 6, price: 120 },
  tarp: { name: "tarp & rope kits", batch: 1, quantity: 1, price: 50 },
  tank: { name: "water tanks", batch: 1, quantity: 1, price: 320 },
  plumbing: { name: "pipe & tap kits", batch: 1, quantity: 1, price: 40 },
  sanitation: { name: "toilet kits", batch: 1, quantity: 1, price: 80 },
};
export const PROJECTS = {
  gathering: {
    name: "Gathering place",
    repeatable: true,
    asset: "picnic-table",
    size: [2, 2],
    materials: {
      wood: 8,
      hardware: 1,
    },
    work: 134,
    description:
      "Assemble a table and benches from pre-cut boards. About 1 person-hour of assembly, plus carrying.",
  },
  water: {
    name: "Water storage",
    asset: "well",
    size: [2, 2],
    materials: { wood: 8, hardware: 1, tank: 1, plumbing: 1 },
    work: 267,
    description:
      "An unpowered tank holding 500 liters of water. Residents carry water here from the river, a well or a rain barrel; a pump fills it through a pipe. No power needed. About 2 person-hours to assemble.",
  },
  shelter: {
    name: "Basic shelter",
    repeatable: true,
    asset: "shed",
    size: [2, 2],
    materials: { wood: 24, hardware: 3, roofing: 6 },
    work: 1067,
    description:
      "Raise a small open timber shelter with a sheet roof. About 8 person-hours with pre-cut timber, plus carrying. The frame gives shade halfway through.",
  },
  toilet: {
    name: "Private toilet",
    repeatable: true,
    asset: "eco_toilet",
    size: [2, 2],
    materials: { wood: 16, hardware: 2, roofing: 2, sanitation: 1 },
    work: 534,
    description:
      "Assemble a temporary screened toilet around a purchased dry-toilet kit. About 4 person-hours, plus carrying; permanent sanitation comes later.",
  },
};
expandMaterials(MATERIALS);
expandProjects(PROJECTS);
registerNaturalProjects(PROJECTS);
PROJECTS.field={name:'Cultivated field',asset:'garden',kind:'garden',size:[2,2],materials:{},work:1,repeatable:true,description:'Cultivate ground in beds with working aisles. Each bed requires resident preparation and planting.'};
registerGathering(PROJECTS,PROCESSES);
Object.assign(PROJECTS, OPENING_PROJECTS);
PROJECTS.well.materials={...PROJECTS.well.materials,tank:4};
applyConstructionSpecs(PROJECTS);
PROJECTS.well.legacyMaterials={...PROJECTS.well.materials,tank:1};
// Preserve the pre-calibration paid quantities for older unsnapshotted projects.
PROJECTS.solar_farm.legacyMaterials={...PROJECTS.solar_farm.materials};
PROJECTS.solar_farm.materials={...PROJECTS.solar_farm.materials,panels:6};
export { PROCESSES };
const DEFAULT_FIELD_SIZE = [2, 2], DEPOSIT_PREVIEW_SIZE = [1, 1];
function projectSiteSize(p) {
  if (p.key === 'field') return p.fieldSize || DEFAULT_FIELD_SIZE;
  if (!p.natural && (p.key === 'supply-2' || p.key === 'supply-3')) return DEPOSIT_PREVIEW_SIZE;
  return unrotatedSiteSize(p, PROJECTS[p.key].size);
}
export function footprint(p) {
  const [w, d] = projectSiteSize(p);
  return (p.rotation || 0) % 2 ? [d, w] : [w, d];
}
function shelteredFrontCell(p, x, z) {
  const [w, d] = footprint(p);
  return [z === p.z + d - 1, x === p.x + w - 1, z === p.z, x === p.x][
    p.rotation || 0
  ];
}
export function buildingFront(p) {
  return accessGeometry(p,PROJECTS[p.key],footprint(p)).delivery[0];
}
export function crossingAt(s, x, z) {
  return s.projects.find(
    (p) =>
      p.key === "bridge" && p.work >= PROJECTS[p.key].work && covers(p, x, z),
  );
}
function covers(p, x, z) {
  const [w, d] = footprint(p);
  return (
    x >= p.x - 0.5 && x <= p.x + w - 0.5 && z >= p.z - 0.5 && z <= p.z + d - 0.5
  );
}
function roadAt(s,x,z){
  if(activeNavigation?.state!==s)return roadAtUncached(s,x,z);
  const key=`${x},${z}`,cache=activeNavigation.roads;
  if(!cache.has(key))cache.set(key,roadAtUncached(s,x,z));
  return cache.get(key);
}
// Made roads and the tracks residents have worn: ground a walker keeps to.
const pathAt=(s,x,z)=>roadAt(s,x,z)||trodden(s,x,z);
function roadAtUncached(s, x, z) {
  return (
    accessRoadAt(x, z) ||
    s.projects.some(
      (p) =>
        ["road", "bridge"].includes(p.key) &&
        p.work >= PROJECTS[p.key].work &&
        covers(p, x, z),
    )
  );
}
export function bridgeDeckHeight(p, x, z) {
  const [w, d] = footprint(p),
    along =
      (p.rotation || 0) % 2 ? z - (p.z + (d - 1) / 2) : x - (p.x + (w - 1) / 2);
  return 0.08 + 0.42 * Math.min(1, Math.max(0, (8 - Math.abs(along * 2)) / 2));
}
function bridgeEnds(p) {
  const [w, d] = footprint(p);
  return (p.rotation || 0) % 2
    ? [
        { x: p.x + (w - 1) / 2, z: p.z - 1 },
        { x: p.x + (w - 1) / 2, z: p.z + d },
      ]
    : [
        { x: p.x - 1, z: p.z + (d - 1) / 2 },
        { x: p.x + w, z: p.z + (d - 1) / 2 },
      ];
}
export function storageCapacity(s) {
  if (s.mode === "sandbox") return 1000000;
  return (
    600 +
    s.projects.filter(
      (p) =>
        ["warehouse", "covered-storage"].includes(PROJECTS[p.key].kind) &&
        p.work >= PROJECTS[p.key].work,
    ).length *
      600
  );
}
// Organic residues lie in a heap outdoors and take no room in the stores.
// Counted against capacity, they grew without limit (spoilage, kitchen and
// harvest leavings) until nothing else could be brought in: no harvest, no
// fodder, no food from town.
export function storedMaterials(s) {
  return s.wood + Object.values(s.materials).reduce((a, b) => a + b, 0) - (s.materials.scraps || 0) + pendingExports(s).reduce((n,o)=>n+o.quantity,0);
}
function changeMaterial(s,id,n,lots,reason='transfer'){return foodChange(s,id,n,lots,reason);}
export function sellMaterial(s, id, holdForPickup=false) {
  const item = MATERIALS[id];
  if (
    !item ||
    !item.quantity ||
    s.stage !== "playing" ||
    materialCount(s, id) - protectedEquipment(s,id) < 1
  )
    return false;
  const reserved=reserveExport(s,id,MATERIALS,materialCount,changeMaterial,protectedEquipment(s,id));
  if(reserved && holdForPickup) s.trade.orders.at(-1).holdForPickup=true;
  return reserved;
}
export function automaticSales(s) {
  if(s.stage!=='playing'||s.mode==='sandbox')return;
  const policies=economyPolicies(s);
  for(const [id,p]of Object.entries(policies.sales)) {
    if(!p.enabled)continue;
    const offer=salePreview(s,id,MATERIALS,PROCESSES,materialCount);
    if(p.day!==offer.day){p.day=offer.day;p.sold=0;}
    for(let n=0;n<offer.quantity;n+=MATERIALS[id].quantity){if(!sellMaterial(s,id))break;p.sold+=MATERIALS[id].quantity;}
  }
}
// Left to themselves, residents keep the food they can eat before it spoils
// and set the rest aside for town while it is still worth something.
export function sellFoodSurplus(s) {
  if(s.stage!=='playing'||s.mode==='sandbox'||!foodPolicy(s).automatic)return;
  const kitchen=s.projects.some(p=>PROJECTS[p.key].kind==='kitchen'&&p.work>=PROJECTS[p.key].work&&!p.removal&&s.infrastructure?.nodes[p.id]?.enabled!==false);
  const cooking={};
  if(kitchen)for(const r of Object.values(PROCESSES)){
    if(r.kind!=='kitchen'||!r.output.meals)continue;
    for(const [id,n] of Object.entries(r.input))if(FOOD_DAYS[id]&&!FOOD_SERVINGS[id])
      cooking[id]={size:n/r.output.meals,keepDays:Math.min(FOOD_DAYS.meals,foodPolicy(s).freshDays||1)};
  }
  // For food the village does eat, less than one round of meals is within the
  // error of the estimate. A crop nobody can cook is surplus down to the last kilo.
  const worthSelling=Math.ceil(s.people.length*3/3);
  for(const [id,surplus] of Object.entries(foodSurplus(s,cooking))){
    const size=FOOD_SERVINGS[id]||cooking[id]?.size;
    if(size&&surplus/size<worthSelling)continue;
    let left=surplus,reserved=0;
    while(left>0){
      const stock=materialCount(s,id);
      if(!reserveExport(s,id,MATERIALS,materialCount,changeMaterial,Math.max(protectedEquipment(s,id),stock-left)))break;
      const order=s.trade.orders.at(-1);order.surplus=true;
      left-=order.quantity;reserved+=order.quantity;
    }
    if(reserved)say(s,`${materialText(id,reserved)} is more than the village can eat before it spoils. Set aside to sell in town.`);
  }
  // A trip that costs more fuel than it earns is waste too: small lots wait
  // for a car that is going to town anyway.
  const waiting=pendingExports(s).filter(o=>o.surplus);
  if(!waiting.length)return;
  // While beds are still being harvested the car waits for the rest of the
  // crop, unless what is already set aside has less than a day left.
  const soonest=Math.min(...waiting.flatMap(o=>(o.foodLots||[]).map(l=>l.expires)));
  const moreComing=s.operations?.some(o=>!o.done&&o.farm?.action==='harvest')&&soonest>s.time+3200;
  // A dedicated trip should clearly pay for its fuel; with under a day left,
  // covering the fuel is enough.
  const value=waiting.reduce((n,o)=>n+o.cents,0),fuel=transportCost(s)*100;
  const worthTrip=!moreComing&&value>=fuel*(soonest>s.time+3200?3:1);
  for(const o of waiting){if(worthTrip)delete o.holdForPickup;else o.holdForPickup=true;}
}
function wakeHelpers(s) {
  for (const r of s.people)
    if (
      !r.job &&
      !r.tentPhase &&
      [
        "idle",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
        "relax",
      ].includes(r.action)
    ) {
      r.walk = [];
      r.target = null;
      clearDowntime(r);
    }
}
export function connectUtility(s, kind, from, to) {
  if (s.stage !== "playing") return "Choose a camp first.";
  const error = connect(s, PROJECTS, kind, Number(from), Number(to));
  if (!error) wakeHelpers(s);
  return error;
}
export function committedMaterials(s) {
  const totals={};
  const add=items=>{for(const [id,n] of Object.entries(items||{}))totals[id]=(totals[id]||0)+n;};
  for(const p of s.projects)if(p.work<PROJECTS[p.key].work)add(projectMaterials(p,PROJECTS));
  for(const o of s.operations||[])if(!o.done&&!o.water&&!o.waitingSeeds)add(o.input||PROCESSES[o.recipe]?.input);
  return totals;
}
export function configureBed(s,site,id,settings) {
  const p=s.projects.find(p=>p.id===site),b=p&&ensureCultivation(s,p)?.beds[id];
  if(!b)return 'Choose a cultivation bed.';
  if((s.operations||[]).some(o=>!o.done&&o.site===site&&o.farm?.bed===id))return 'Wait for this bed’s current job to finish.';
  if((settings.crop!==undefined||settings.density!==undefined)&&!['unprepared','prepared','harvested'].includes(b.stage))return 'Clear the standing crop before changing planting settings.';
  if(settings.crop!==undefined&&!CROPS[settings.crop]||settings.density!==undefined&&![.5,1,1.5].includes(settings.density)||settings.irrigation!==undefined&&typeof settings.irrigation!=='boolean'||settings.residues!==undefined&&!['leave','collect'].includes(settings.residues))return 'Invalid cultivation settings.';
  for(const key of ['crop','density','irrigation','residues'])if(settings[key]!==undefined)b[key]=settings[key];
  return '';
}
// Queued planting owns no seed packets until they physically reach storage.
function incomingSeeds(s,id) {
 return [...activeTrips(s),s.delivery].filter(t=>t&&!t.project&&!t.shipments&&!t.saleOnly&&t.material===id)
  .reduce((n,t)=>n+(t.quantity??MATERIALS[id].quantity),0);
}
const inputText=id=>id==='compost'?'compost':'seed packets';
// Quotes the missing seeds or compost for one bed job. `waitingSeeds` marks either input.
export function plantingPurchase(s,b,p=null,action='plant') {
 const [id,n]=Object.entries(farmJobSpec(b,action).input)[0];
 const waiting=(s.operations||[]).filter(o=>!o.done&&o.waitingSeeds).reduce((sum,o)=>sum+(o.input[id]||0),0);
 const shortage=Math.max(0,n+waiting-(materialCount(s,id)||0)-incomingSeeds(s,id));
 const item=MATERIALS[id],batches=Math.ceil(shortage/item.quantity),cost=batches*item.price;
 if(!shortage)return {cost:0,error:''};
 if(!farmAutoBuy(s,p))return {cost,error:`Auto-buy is off. Buy ${inputText(id)} in Resources first.`};
 const error=supplierError(s,{[id]:batches*item.quantity},MATERIALS);
 const total=cost+batches*transportCost(s)+(s.expansionReserve??0);
 return {cost,error:error||(!Number.isFinite(s.money)||total>spendableMoney(s)?`Not enough shared savings for ${id==='compost'?'compost':'seeds'} and collection while keeping the essentials reserve.`:'')};
}
function arrangePlantingSeeds(s) {
 const attempted=new Set();
 for(const op of s.operations||[]) {
  if(op.done||!op.waitingSeeds)continue;
  const [id,n]=Object.entries(op.input)[0];
  if((materialCount(s,id)||0)>=n){
   changeMaterial(s,id,-n,undefined,'cultivation input');delete op.waitingSeeds;
   op.status=id==='compost'?'Compost collected; waiting for a resident to apply it':'Seeds collected; waiting for a resident to plant';continue;
  }
  const what=inputText(id),autoBuy=farmAutoBuy(s,s.projects.find(p=>p.id===op.site));
  op.status=incomingSeeds(s,id)>0?`Waiting for ${what} to arrive`:!autoBuy?`Waiting for ${what} · Auto-buy is off`:`Waiting for a ${id==='compost'?'compost':'seed'} purchase and collection`;
  if(!autoBuy||incomingSeeds(s,id)>0||attempted.has(id))continue;
  attempted.add(id);
  const item=MATERIALS[id];
  if(spendableMoney(s)<item.price+transportCost(s)+(s.expansionReserve??0)) {op.status=`Waiting for savings to buy ${id==='compost'?'compost':'seeds'} and pay for collection`;continue;}
  if(supplyRun(s,id))op.status=`${id==='compost'?'Compost':'Seed packets'} purchased; waiting for collection`;
 }
}
function prepareOperationQueue(s) {
  s.operations??=[];
  if(s.operations.length>128)s.operations=[...s.operations.filter(o=>!o.done),...s.operations.filter(o=>o.done).slice(-32)];
}
export function queueBedJob(s,site,id,action) {
  const p=s.projects.find(p=>p.id===site);
  if(!p||p.removal||p.work<PROJECTS[p.key].work)return 'Choose a completed cultivation site.';
  const b=ensureCultivation(s,p)?.beds[id],error=farmJobError(s,p,b,action);if(error)return error;
  const spec=farmJobSpec(b,action);
  // Planting always quotes a purchase so the refusal explains Auto-buy; compost only orders when it is on.
  const waitingSeeds=(action==='plant'||farmAutoBuy(s,p))&&Object.entries(spec.input).some(([item,n])=>(materialCount(s,item)||0)<n);
  if(waitingSeeds){const purchase=plantingPurchase(s,b,p,action);if(purchase.error)return purchase.error;}
  else {
   for(const [item,n]of Object.entries(spec.input))if(materialCount(s,item)<n)return `Missing ${quantityText(item,n)} ${MATERIALS[item].name}.`;
   for(const [item,n]of Object.entries(spec.input))changeMaterial(s,item,-n,undefined,'cultivation input');
  }
  prepareOperationQueue(s);
  s.operations.push({id:s.nextOperation=(s.nextOperation||0)+1,site,recipe:`farm_${action}`,farm:{bed:id,action,work:spec.work,crop:b.crop,density:b.density},input:spec.input,...(waitingSeeds?{waitingSeeds:true,status:`Waiting for ${action==='amend'?'compost':'seed'} purchase and collection`}:{}),work:0,phase:'pickup',done:false});
  wakeHelpers(s);return '';
}
export function fieldPlacementError(s,x,z,size,rotation=0,ignore=null){
  if(!fieldSizeValid(size))return 'Fields must be 2–32 cells on each side.';
  return placementError(s,'field',x,z,ignore,rotation,{fieldSize:size});
}
export function planField(s,x,z,size,rotation=0){
  if(s.stage!=='playing')return 'Choose a campsite first.';
  const error=fieldPlacementError(s,x,z,size,rotation);if(error)return error;
  const p={id:s.nextId++,key:'field',x,z,rotation,fieldSize:[...size],work:1,delivered:0,billOfMaterials:{}};
  numberProject(s,p,PROJECTS);s.projects.push(p);ensureCultivation(s,p);syncInfrastructure(s,PROJECTS);invalidateNavigation(s);return '';
}
export function resizeField(s,id,size){
  const p=s.projects.find(p=>p.id===id&&p.key==='field');if(!p)return 'Choose a field.';
  const error=fieldPlacementError(s,p.x,p.z,size,p.rotation||0,id);if(error)return error;
  if((s.operations||[]).some(o=>o.site===id&&!o.done))return 'Finish this field’s jobs before resizing.';
  const old=ensureCultivation(s,p).beds,layout=bedLayout({...p,fieldSize:size});
  // Anchor beds to their ground positions when the east/south boundaries change.
  const oldSize=footprint(p),newSize=(p.rotation||0)%2?[size[1],size[0]]:size;
  const a=(p.rotation||0)*Math.PI/2,wx=newSize[0]-oldSize[0],wz=newSize[1]-oldSize[1];
  const dx=Math.round(Math.cos(a)*wx-Math.sin(a)*wz),dz=Math.round(Math.sin(a)*wx+Math.cos(a)*wz);
  const find=g=>old.find(b=>b.x-dx===g.x&&b.z-dz===g.z&&b.w===g.w&&b.d===g.d);
  if(old.some(b=>!layout.some(g=>find(g)===b)&&(!['unprepared','prepared','harvested'].includes(b.stage)||b.residueKg>=1||b.amendmentKg>=1)))return 'Clear crops and collect residues before shrinking occupied beds.';
  const removedBeds=old.filter(b=>!layout.some(g=>find(g)===b));
  s.operations=(s.operations||[]).filter(o=>o.site!==id||!o.done);
  p.fieldSize=[...size];delete p.cultivation;const farm=ensureCultivation(s,p);
  farm.beds=farm.beds.map((b,i)=>({...find(b),...b,...(find(b)||{}),x:b.x,z:b.z,id:i}));
  for(const b of removedBeds){farm.beds[0].residueKg+=b.residueKg;farm.beds[0].amendmentKg+=b.amendmentKg;}
  invalidateNavigation(s);return '';
}
export function productionBlocker(s, site, recipe) {
  const p = s.projects.find((p) => p.id === Number(site) && !p.felled),
    def = PROCESSES[recipe];
  if(def?.bedAction)return 'Choose a cultivation bed for this job.';
  if (
    !p || p.removal ||
    !def ||
    p.work < PROJECTS[p.key].work ||
    PROJECTS[p.key].kind !== def.kind
  )
    return "Choose a completed compatible building.";
  if(def.craft && s.infrastructure.nodes[p.id]?.enabled === false)return 'Workspace is switched off. Switch it on to start work.';
  if(recipe==='cold_storage'&&p.coldStorage)return 'Cold storage is already installed.';
  if(p.cultivation&&['baby_greens','vegetables','greenhouse'].includes(recipe))return 'Use the cultivation beds to plant crops.';
  const craftError=craftingBlocker(s,def);
  if(craftError)return craftError;
  if(def.equipmentRepair && s.operations?.some(o=>!o.done && PROCESSES[o.recipe]?.equipmentRepair===def.equipmentRepair))return 'This equipment already has a repair queued.';
  if(def.equipmentRepair && equipmentSummary(s,def.equipmentRepair).borrowers.length>0)return 'Return borrowed equipment before repairing it.';
  if(def.equipmentRepair && equipmentSummary(s,def.equipmentRepair).wear<=0)return 'This equipment does not need repair.';
  if(recipe==='solar_upgrade' && p.solarUpgrade)return 'Rooftop solar is already installed.';
  if ((s.operations || []).some((o) => o.site === p.id && !o.done && !o.water))
    return "This site already has a job.";
  if ((p.noAccessUntil || 0) > s.time)
    return "Nobody can reach this site on foot. Residents will look again tomorrow.";
  if ((p.readyAt || 0) > s.time)
    return def.gathering ? gatheringStatus(s,p) : `Growing: ready in ${Math.ceil((p.readyAt-s.time)*.45)} game minutes.`;
  if(def.gatherLimit&&(p.extracted||0)>=def.gatherLimit)return 'This patch has been gathered out.';
  if (def.deposit && (p.extracted || 0) >= depositCapacity(s.landSeed,p,def))
    return "This deposit is exhausted.";
  const input={...def.input,...(recipe==='wood'&&p.harvestCount?{tree_starts:4}:{})};
  const starterSeeds=['baby_greens','vegetables','greenhouse'].includes(recipe)&&!p.starterSeedlingsUsed&&!p.harvestCount?Math.min(input.seedlings||0,projectMaterials(p,PROJECTS).seedlings||0):0;
  for (const [id, n] of Object.entries(input))
    if (materialCount(s, id) < n-(id==='seedlings'?starterSeeds:0)) return `Missing ${n} ${id}.`;
  if (p.key === "goat-pasture-empty" && !p.stocked) {
    if (materialCount(s, "goats") < 2)
      return "Bring 2 goats to stock this pasture.";
  }
  return '';
}
// Walking distance from the village stores to a site's work position; Infinity when unreachable.
const walkCache=new WeakMap();
function walkFromStores(s,p){
  const cached=walkCache.get(p);
  if(cached&&cached.until>s.time&&cached.x===s.stock.x&&cached.z===s.stock.z)return cached.length;
  const resident=s.people.find(r=>r.action!=='town'&&!atTownJob(r))||s.people[0];
  const start=supplySpot(s,resident,0)||s.stock,from={...resident,x:start.x,z:start.z,needTask:null},node=ensureInfrastructure(s).nodes[p.id];
  const spot=node&&utilitySpot(s,node,from),path=spot&&route(s,from,spot);
  let length=Infinity;
  if(path){length=0;let a=from;for(const b of path){length+=Math.hypot(b.x-a.x,b.z-a.z);a=b;}}
  walkCache.set(p,{until:s.time+600,x:s.stock.x,z:s.stock.z,length});
  return length;
}
const autonomyApi={blocker:productionBlocker,queue:(s,site,recipe)=>{const error=queueProduction(s,site,recipe);if(!error)s.operations.at(-1).auto=true;return error;},stored:storedMaterials,capacity:storageCapacity,count:materialCount,walk:walkFromStores};
export function residentWorkPlan(s,p){return autonomousWorkPlan(s,p,PROCESSES,PROJECTS,autonomyApi);}
export function queueProduction(s, site, recipe) {
  const error=productionBlocker(s,site,recipe);
  if(error)return error;
  const p=s.projects.find(p=>p.id===Number(site)),def=PROCESSES[recipe];
  const input={...def.input,...(recipe==='wood'&&p.harvestCount?{tree_starts:4}:{})};
  const starterSeeds=['baby_greens','vegetables','greenhouse'].includes(recipe)&&!p.starterSeedlingsUsed&&!p.harvestCount?Math.min(input.seedlings||0,projectMaterials(p,PROJECTS).seedlings||0):0;
  prepareOperationQueue(s);
  if(p.key==='goat-pasture-empty'&&!p.stocked) {
    changeMaterial(s, "goats", -2);
    p.stocked = true;
  }
  const foodInput={};
  for (const [id,n] of Object.entries(input)){const lots=changeMaterial(s,id,-(n-(id==='seedlings'?starterSeeds:0)),undefined,'production input');if(FOOD_DAYS[id])foodInput[id]=lots;}
  if(starterSeeds)p.starterSeedlingsUsed=true;
  s.operations.push({
    id: (s.nextOperation = (s.nextOperation || 0) + 1),
    site: p.id,
    recipe,
    foodInput,
    input,
    work: 0,
    phase: "pickup",
    done: false,
  });
  wakeHelpers(s);
  return "";
}
// Derived from live simulation state; never persisted as a second source of truth.
export function buildingOperatingStatus(s,p) {
  const def=PROJECTS[p.key],node=s.infrastructure?.nodes[p.id];
  const result=(state,reason)=>({state,reason});
  if(p.work<def.work)return result('Under construction',`${Math.floor(100*p.work/def.work)}% built. Residents must finish construction before use.`);
  const op=s.operations?.find(o=>o.site===p.id&&!o.done);
  if(op?.phase==='return')return result('Delivering',op.status||'Finished output is being carried to storage.');
  if(node?.enabled===false)return result('Switched off','Switch this building on to resume its service.');
  if(op?.phase==='growing')return result(biologyLabel(op.recipe),op.status||'Developing naturally; no resident needs to wait here.');
  if(op) {
    const recipe=PROCESSES[op.recipe];
    const assigned=s.people.find(r=>r.operation===op.id);
    const craft=recipe&&craftingBlocker(s,recipe,assigned);
    if(craft)return result('Waiting for requirements',craft);
    const worker=s.people.find(r=>r.operation===op.id&&!r.needTask&&!r.tentPhase&&r.energy>=25);
    if(!worker)return result('Waiting for a resident','No resident is currently attending this job. Residents may be resting or doing other work.');
    if(worker.action==='blocked')return result('Blocked',op.status||'The resident cannot continue this job.');
    return result(worker.action==='produce'?'Working':'Preparing',op.status||'A resident is collecting supplies or walking to the workspace.');
  }
  if(gatheringStatus(s,p))return result(gatheringState(s,p),gatheringStatus(s,p));
  if(p.readyAt>s.time)return result('Growing',`Ready in about ${Math.ceil((p.readyAt-s.time)*.45)} game minutes.`);
  if(def.kind==='home')return result('Ready','Ready for residents to rest in.');
  const next=residentWorkPlan(s,p).reason;
  return result('Ready',Object.values(PROCESSES).some(r=>r.kind===def.kind)?(next?`No batch in progress. ${next}`:'No batch is currently in progress.'):'Built and ready to use.');
}
export function moveCraftJob(s,operation,site) {
  const op=s.operations?.find(o=>o.id===operation&&!o.done&&o.phase!=='return');
  const p=s.projects.find(p=>p.id===site),recipe=PROCESSES[op?.recipe];
  if(!recipe?.craft || !p || PROJECTS[p.key].kind!==recipe.kind || p.work<PROJECTS[p.key].work)return 'Choose a completed compatible workspace.';
  if(s.operations.some(o=>o!==op&&!o.done&&!o.water&&o.site===site))return 'This workspace already has a job.';
  for(const r of s.people)if(r.operation===op.id){r.operation=null;r.cargo=false;r.walk=[];r.target=null;r.action='idle';}
  op.site=site;op.phase='pickup';op.status='Moving materials and unfinished work to the new workspace.';
  releaseEquipment(s);wakeHelpers(s);return '';
}
export function queueWater(s, from, to, kind = "fresh") {
  const sys = syncInfrastructure(s, PROJECTS);
  from = Number(from);
  to = Number(to);
  if (
    !LIQUIDS.includes(kind) ||
    !sys.nodes[to] ||
    (from !== -1 && !sys.nodes[from]) ||
    from === to
  )
    return "Choose valid water endpoints.";
  const i = liquidIndex(kind),
    target = sys.nodes[to];
  if (!target.capacity[i])
    return "The destination cannot store that water class.";
  if (target.capacity[i] - target.water[i] < 0.1) return "Destination is full.";
  if (from !== -1 && sys.nodes[from].water[i] < 0.1) return "Source is empty.";
  s.operations ??= [];
  if (s.operations.some((o) => !o.done && o.water && o.water.to === to))
    return "A water delivery is already queued here.";
  s.operations.push({
    id: (s.nextOperation = (s.nextOperation || 0) + 1),
    site: to,
    water: { from, to, kind, amount: 0 },
    work: 0,
    phase: "pickup",
    done: false,
  });
  wakeHelpers(s);
  return "";
}
export function queueSanitation(s,site) {
  const n=ensureInfrastructure(s).nodes[site];
  if(!n || n.water[2]+n.water[3]<1)return 'No waste to service.';
  s.operations??=[];
  if(s.operations.some(o=>!o.done && o.water && o.site===site))return 'A service job is already queued here.';
  s.operations.push({id:s.nextOperation=(s.nextOperation||0)+1,site,water:{from:site,to:site,kind:'sewage',amount:0,service:true},work:0,phase:'process',done:false});
  wakeHelpers(s);return '';
}
// Enough for a full night plus the next collection trip; bounded by the tank.
export const drinkingReserve=(s,node)=>Math.min(node.capacity[0],Math.max(24,s.people.length*10));
export function nearestRiverAccess(s,origin) {
  const points=[];
  for(let z=CELL_MIN+2;z<CELL_MAX-2;z++) {
    const worldZ=(z-32)*2,center=32+riverCenter(worldZ,s.landSeed)/2;
    const distance=(riverWidth(worldZ,s.landSeed)+4)/2;
    points.push({x:Math.floor(center-distance),z},{x:Math.ceil(center+distance),z});
  }
  points.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
  return points.find(p=>p.x>CELL_MIN&&p.x<CELL_MAX&&!occupied(s,p.x,p.z)&&route(s,origin,p))||null;
}
const farmProducts = {orchard:'fruit', grove:'bananas', apiary:'honey', coop:'eggs', goat_pasture:'milk'};

function scheduleFarmWork(s) {
  if (s.stage !== 'playing') return;
  const pending = (s.operations || []).filter(op => !op.done);
  // A forage patch nobody can reach must not stop gathering from the others.
  let needsForage = !pending.some(op => op.recipe === 'gather-wild-forage' && !op.accessRetryAt) &&
    s.upkeep?.jobs.some(job => !job.done && job.care && !job.partsPaid &&
      materialCount(s,'fodder') < ANIMAL_CARE[job.care].fodder);
  const bedJobs = [];
  let bedSlots = s.people.length - pending.filter(op => op.farm && !op.waitingSeeds && !op.accessRetryAt && op.phase !== 'return').length;
  for (const p of s.projects) {
    const def = PROJECTS[p.key];
    if (p.removal || p.work < def.work || s.infrastructure.nodes[p.id]?.enabled === false) continue;
    if (needsForage && p.key === 'wild-forage' && !queueProduction(s,p.id,'gather-wild-forage')) needsForage = false;
    const product = farmProducts[def.kind];
    if (product && !pending.some(op => op.site === p.id && !op.water) &&
        (p.key !== 'goat-pasture-empty' || p.stocked) &&
        (!ANIMAL_CARE[def.kind] || s.mode === 'sandbox' || animalAvailable(p))) {
      queueProduction(s, p.id, product);
    }
    if (!p.cultivation || bedSlots <= 0) continue;
    for (const b of p.cultivation.beds) {
      if (pending.some(op => op.site === p.id && op.farm?.bed === b.id)) continue;
      let action;
      if (b.stage === 'harvestable') action = harvestExpired(b,s.time) ? 'clear' : 'harvest';
      else if (b.stage === 'failed') action = 'clear';
      else if (b.stage === 'unprepared' || b.stage === 'harvested') action = 'prepare';
      else if (b.stage === 'prepared') action = 'plant';
      // Tired soil gets one dressing of mature compost while nothing else is due.
      else if (b.fertility < .7 && !(b.amendmentKg > 0) && materialCount(s,'compost') >= farmJobSpec(b,'amend').input.compost) action = 'amend';
      if (action) bedJobs.push({site:p.id, autoBuy:farmAutoBuy(s,p), bed:b, action});
    }
  }
  const priority = {harvest:0, plant:1, clear:2, prepare:3, amend:4};
  bedJobs.sort((a,b) => priority[a.action] - priority[b.action]);
  let seedOrderPending = pending.some(op => op.waitingSeeds);
  for (const job of bedJobs) {
    const needsSeeds = job.action === 'plant' && !Object.entries(farmJobSpec(job.bed,'plant').input)
        .every(([id,n]) => materialCount(s,id) >= n);
    if (needsSeeds && (s.mode === 'sandbox' || !job.autoBuy || seedOrderPending)) continue;
    if (queueBedJob(s,job.site,job.bed.id,job.action)) continue;
    if (needsSeeds) seedOrderPending = true;
    else if (--bedSlots <= 0) break;
  }
}

function restockUpkeep(s) {
  const u = s.upkeep;
  if (s.stage !== 'playing' || s.mode === 'sandbox' || !u?.restockBudget) return;
  const remaining = u.restockBudget - (u.restockSpent || 0);
  const incoming = [...activeTrips(s),s.delivery].filter(t => t && !t.project && !t.shipments && !t.saleOnly);
  const jobs = u.jobs.filter(j => !j.done && !j.partsPaid && (j.care || (u.automatic && !j.soil)));
  jobs.sort((a,b) => Number(!!b.care) - Number(!!a.care));
  for (const job of jobs) {
    for (const [id,needed] of Object.entries(serviceParts(job))) {
      const item = MATERIALS[id];
      if (!item?.quantity || materialCount(s,id) >= needed || incoming.some(t=>t.material===id)) continue;
      const localBatch = s.operations?.some(op => !op.done && !op.water && !op.waitingSeeds &&
        !op.accessRetryAt && PROCESSES[op.recipe]?.output[id] > 0);
      if (localBatch) continue;
      const cost = Math.round((item.price + pickupFare(s)) * 100) / 100;
      if (cost > remaining || !supplyRun(s,id)) continue;
      u.restockSpent = Math.round(((u.restockSpent || 0) + cost) * 100) / 100;
      return;
    }
  }
}

function isFarmWork(s,op) {
  if (op.water) {
    const site = s.projects.find(p => p.id === op.site);
    return site && (site.cultivation || farmProducts[PROJECTS[site.key].kind]);
  }
  return op.farm || Object.hasOwn(CROP_CARE,op.recipe) || ['eggs','milk','honey','gather-wild-forage'].includes(op.recipe);
}

const foodRecipesByKind = new Map();
for (const [id, recipe] of Object.entries(PROCESSES)) {
  if (!foodRecipesByKind.has(recipe.kind) && Object.keys(recipe.output).some(id => FOOD_SERVINGS[id])) {
    foodRecipesByKind.set(recipe.kind, id);
  }
}

function maintainFood(s) {
  if(s.time<(s.nextFoodCheck||0))return;
  s.nextFoodCheck=s.time+10;
  const incoming=[...activeTrips(s),s.delivery].filter(t=>t&&!t.foodSpoiled&&!t.saleOnly&&!t.project&&FOOD_SERVINGS[t.material]).reduce((n,t)=>n+Math.floor((t.foodLots?.reduce((q,l)=>q+(l.expires>s.time?l.n:0),0)??MATERIALS[t.material].quantity)/FOOD_SERVINGS[t.material]),0);
  const food=pantryForecast(s).served+incoming;
  const target=Math.ceil(s.people.length*3*(s.foodReserveDays??1.5));
  if(food>=target)return;
  // Harvest existing food plots before construction or nonessential production.
  for(const p of s.projects) {
    const recipe=foodRecipesByKind.get(PROJECTS[p.key].kind);
    if(recipe&&!(PROJECTS[p.key].kind==='kitchen'&&(p.repeat||foodPolicy(s).automatic))&&!s.operations?.some(o=>!o.done&&o.site===p.id&&!o.water)&&!(PROCESSES[recipe].gathering&&!productionBlocker(s,p.id,recipe)&&walkFromStores(s,p)===Infinity))queueProduction(s,p.id,recipe);
  }
  // Old saves retain the cooldown for their last purchase.
  if (s.emergencyFood === false || s.time < (s.nextFoodTrip || 0)) return;
  const day = Math.floor((540 + s.time * .45) / 1440);
  const spent = s.foodPurchases?.day === day ? s.foodPurchases.spent : 0;
  const cost = MATERIALS.food.price + pickupFare(s);
  if (spendableMoney(s) < cost) {
    // Going hungry for want of money should not pass in silence.
    const broke='Food reserve is low, but savings cannot cover an emergency food run.';
    if(!s.log.includes(broke))say(s,broke);
    return;
  }
  if (Math.round((spent + cost) * 100) <= Math.round((s.foodPurchaseBudget ?? 150) * 100) && supplyRun(s,'food')) {
    s.foodPurchases = {day, spent: Math.round((spent + cost) * 100) / 100};
    // The trip itself is logged on departure and return. Every run is still
    // recorded for the day recap, but the policy hint is only repeated in the
    // log once it has scrolled out of the recent lines.
    const hint='Food reserve is low: the community bought emergency ingredients. Change this policy in Resources.';
    if(s.log.includes(hint))recordEvent(s,hint,null);else say(s,hint);
  }
}
// The nearest built source holding water; otherwise the river.
function waterSource(sys,n){
  return Object.values(sys.nodes).filter(a=>a.id!==n.id&&['groundwater-well','rain-barrel','water-pump'].includes(a.kind)&&a.enabled&&a.water[0]>=1)
    .sort((a,b)=>Math.hypot(a.x-n.x,a.z-n.z)-Math.hypot(b.x-n.x,b.z-n.z))[0]?.id??-1;
}
export function maintainWater(s) {
  const sys=ensureInfrastructure(s);
  for(const op of [...(s.operations||[])]) {
    const recipe=PROCESSES[op.recipe],n=sys.nodes[op.site];
    if(op.done||(op.waterPaid&&op.phase!=="growing")||!recipe?.water||!n||s.operations.some(o=>!o.done&&o.water&&o.site===n.id))continue;
    if(n.water[0]>=recipe.water)continue;
    if(n.capacity[0])queueWater(s,waterSource(sys,n),n.id);
  }
  for(const p of s.projects){
    const n=sys.nodes[p.id];if(!n||!n.enabled||!n.capacity[0]||n.water[0]>=Math.min(12,n.capacity[0]*.5)||s.operations?.some(o=>!o.done&&o.water&&o.site===p.id))continue;
    const growing=p.cultivation?.beds.some(b=>b.irrigation&&['growing','harvestable'].includes(b.stage)&&!harvestExpired(b,s.time))||s.operations?.some(o=>!o.done&&o.site===p.id&&CROP_CARE[o.recipe]&&['growing','process'].includes(o.phase)&&p.irrigationPolicy!=='rainfed');
    if(growing)queueWater(s,waterSource(sys,n),p.id);
  }
  for(const job of s.upkeep?.jobs||[]){const care=ANIMAL_CARE[job.care],n=sys.nodes[job.target];if(!care||job.done||!n||n.water[0]>=care.water||s.operations?.some(o=>!o.done&&o.water&&o.site===n.id))continue;
    const source=Object.values(sys.nodes).filter(a=>a.id!==n.id&&a.water[0]>=1).sort((a,b)=>Math.hypot(a.x-n.x,a.z-n.z)-Math.hypot(b.x-n.x,b.z-n.z))[0];if(source)queueWater(s,source.id,n.id,'fresh');
  }
  for(const n of Object.values(sys.nodes)) {
    if(n.maintainFresh && n.capacity[0] && n.water[0]<drinkingReserve(s,n)-Math.min(12,drinkingReserve(s,n)*.25) &&
      !s.operations?.some(o=>!o.done && o.water && o.site===n.id)) queueWater(s,waterSource(sys,n),n.id);
    if(n.maintainSanitation && [2,3].some(i=>n.capacity[i]>0 && n.water[i]>=n.capacity[i]*.5))queueSanitation(s,n.id);
  }
}
export function utilitySpot(s, node, r) {
  if (node.id === -1) return { x: node.x, z: node.z };
  const p = s.projects.find((p) => p.id === node.id);
  if(!p){
    // Existing layouts may cover the original camp service corner after a
    // footprint update. Keep the sealed carrier moving to reachable stores.
    const spots=[{x:s.stock.x-1,z:s.stock.z+1},{...s.stock}];
    for(let radius=1;radius<=2;radius++)for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)
      if(Math.max(Math.abs(dx),Math.abs(dz))===radius)spots.push({x:s.stock.x+dx,z:s.stock.z+dz});
    return spots.find(spot=>!occupied(s,spot.x,spot.z)&&route(s,r,spot));
  }
  const spots=accessGeometry(p,PROJECTS[p.key],footprint(p)).work;
  return spots.find(spot=>!occupied(s,spot.x,spot.z)&&!s.people.some(other=>other!==r&&!atTownJob(other)&&!other.needTask&&!other.tentPhase&&(
    Math.hypot(other.x-spot.x,other.z-spot.z)<.55 ||
    (other.target&&Math.hypot(other.target.x-spot.x,other.target.z-spot.z)<.55)
  ))&&route(s,r,spot));
}
function nearestOpenGround(s, p, r) {
  const spots=[];
  for(let dz=-6;dz<=6;dz++)for(let dx=-6;dx<=6;dx++)if(dx||dz)spots.push({x:p.x+dx,z:p.z+dz});
  return spots.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))
    .find(spot=>!occupied(s,spot.x,spot.z)&&route(s,r,spot));
}
function operationalWork(s, r, i, dt, waterOnly = false, group = null) {
  const sys = ensureInfrastructure(s);
  const reserved = (op) =>
    s.people.some(
      (other) =>
        other !== r &&
        other.operation === op.id &&
        !["rest", "town"].includes(other.action),
    );
  const eligible = (op) => {
    if ((op.accessRetryAt?.[r.id]||0)>s.time) return false;
    if (op.done || op.waitingSeeds || op.phase==='growing' || reserved(op) || (waterOnly && !op.water) || (group === 'farm' ? !isFarmWork(s,op) : group && workGroup(op,PROCESSES)!==group)) return false;
    if(op.water?.stagedAt){
      const destination=sys.nodes[op.site],index=liquidIndex(op.water.kind);
      if(!destination||destination.capacity[index]-destination.water[index]<=.00001)return false;
    }
    if (op.water || op.phase === "return") return true;
    if(s.mode!=='sandbox'&&['eggs','milk'].includes(op.recipe)){const p=s.projects.find(p=>p.id===op.site);if(p&&!animalAvailable(p)){op.status=animalWaitText(p,op.recipe);return false;}}
    const node = sys.nodes[op.site],
      recipe = farmRecipe(op,PROCESSES);
    if(recipe.craft && PROJECTS[s.projects.find(p=>p.id===op.site)?.key]?.kind!==recipe.kind) {op.status='Needs a compatible crafting workspace.';return false;}
    const craftError=craftingBlocker(s,recipe,r);
    if(craftError) {op.status=craftingBlocker(s,recipe)||'Waiting for a qualified resident.';return false;}
    if (!node?.enabled) {
      op.status = "Building switched off";
      return false;
    }
    if (
      recipe.water &&
      !op.waterPaid &&
      node.water[0] < recipe.water
    ) {
      op.status = "Waiting for usable water";
      return false;
    }
    return true;
  };
  let op = (s.operations || []).find(
    (o) => o.id === r.operation && eligible(o),
  );
  if (!op) op = (s.operations || []).filter(o=>!o.done).sort((a,b)=>{
    const priority=o=>o.water?0:(Object.keys(PROCESSES[o.recipe]?.output||{}).some(id=>FOOD_SERVINGS[id])&&s.infrastructure.hungry?1:2);
    // Orders from the player come before work residents started themselves.
    return priority(a)-priority(b) || Number(!!a.auto)-Number(!!b.auto) || workPreference(r,s.projects.find(p=>p.id===b.site)?.key)-workPreference(r,s.projects.find(p=>p.id===a.site)?.key);
  }).find(eligible);
  if ((waterOnly || group) && !op) return false;
  if (
    !group && sys.links.some(
      (l) =>
        l.work < l.required &&
        !s.people.some(
          (other) =>
            other !== r &&
            other.linkJob === l.id &&
            !["rest", "town"].includes(other.action),
        ),
    )
  ) {
    op = null;
    r.operation = null;
  }

  if (!op) {
    const link = sys.links.find(
      (l) =>
        l.work < l.required &&
        !s.people.some(
          (other) =>
            other !== r &&
            other.linkJob === l.id &&
            !["rest", "town"].includes(other.action),
        ),
    );
    if (!link) {
      r.operation = null;
      r.linkJob = null;
      return false;
    }
    r.linkJob = link.id;
    const dest = utilitySpot(s, sys.nodes[link.from], r);
    if (!dest) return false;
    r.action = "install";
    if (go(s, r, dest)) {
      link.work = Math.min(link.required, link.work + dt);
      r.work += dt;
      r.energy = Math.max(0, r.energy - dt * 0.1);
    }
    return true;
  }
  r.linkJob = null;
  r.job=null;r.workSpot=null;r.supplyGoal=null;
  if(r.operation!==op.id){r.walk=[];r.target=null;}
  r.operation = op.id;
  const node = sys.nodes[op.site],
    p = s.projects.find((p) => p.id === op.site);
  if (!node) {
    op.done = true;
    return false;
  }
  if (op.water) {
    const w = op.water,
      index = liquidIndex(w.kind);
    if(w.service) {
      const dest=utilitySpot(s,node,r);r.action='produce';op.status='Servicing sealed waste tanks';
      if(!dest || !go(s,r,dest))return true;
      op.work+=dt*useEquipment(s,r,'cleaning-kit',`op:${op.id}`,dt);r.energy=Math.max(0,r.energy-dt*.06);
      if(op.work>=45){const amount=node.water[2]+node.water[3];node.water[2]=0;node.water[3]=0;sys.account.wasteRemoved=(sys.account.wasteRemoved||0)+amount;op.done=true;r.operation=null;say(s,`${r.name} serviced the sealed waste tanks for off-site treatment.`);}
      return true;
    }
    if (op.phase === "pickup") {
      let start;
      if (w.from === -1) {
        start = w.sourcePoint || (w.sourcePoint=nearestRiverAccess(s,r));
      } else start = utilitySpot(s, sys.nodes[w.from], r);
      if (!start) return false;
      op.status = "Walking to collect water";
      r.action = "fetch-water";
      if (!go(s, r, start)) return true;
      const dest = sys.nodes[w.to];
      w.amount = Math.min(
        12,
        dest.capacity[index] - dest.water[index],
        w.from === -1 ? 12 : sys.nodes[w.from].water[index],
      );
      if (w.from === -1){w.amount=extractWater(s,"river",w.amount);sys.account.waterReceived += w.amount;if(w.amount<=1e-8){op.status="River reserve is low; waiting for flow";return true;}}
      else sys.nodes[w.from].water[index] -= w.amount;
      useEquipment(s,r,"bucket",`op:${op.id}`,0);
      op.phase = "deliver";
      r.target = null;
    }
    if(w.stagedAt){
      r.cargo=false;r.action='fetch-water';op.status='Collecting the sealed carrier beside the reservoir';
      if(!go(s,r,w.stagedAt))return true;
      delete w.stagedAt;
    }
    useEquipment(s,r,"bucket",`op:${op.id}`,0);
    op.status = "Carrying water to the reservoir";
    r.action = "carry";
    r.cargo = true;
    const dest = utilitySpot(s, node, r);
    if (!dest) {op.status="Waiting for an accessible work position";r.action="blocked";return true;}
  if (!go(s, r, dest)) return true;
    const n = Math.min(w.amount, node.capacity[index] - node.water[index]);
    node.water[index] += n;
    w.amount -= n;
    if (w.amount > 0.00001) {
      // Keep the undelivered water physically at the destination without
      // forcing its carrier to wait through meals, sleep and bathroom breaks.
      w.stagedAt={x:r.x,z:r.z};
      r.cargo=false;r.operation=null;r.target=null;
      op.status = "Destination full; sealed water waits beside the reservoir.";
      return true;
    }
    r.cargo = false;
    op.done = true;
    r.operation = null;
    return true;
  }
  const recipe = farmRecipe(op,PROCESSES);
  if (op.phase === "return") {
    r.action = "carry";
    r.cargo = true;
    op.status = op.returnItems ? "Returning usable remains after spoilage" : op.recipe === "solar_upgrade" ? "Returning after installing solar" : "Carrying output to storage";
    const output=op.returnItems||op.harvestOutput||recipe.output;
    if(output.wheelbarrow)op.status="Moving the assembled wheelbarrow to storage";
    const bulk=true;
    if(bulk){
      op.haulRemaining??={...output};op.returningToSite??=false;
      if(op.returningToSite){
        r.cargo=false;r.action="walk";op.status="Returning for the next production load";
        // A building may now stand over a felled tree. The cut logs stay
        // reachable from the nearest open ground beside it.
        const source=utilitySpot(s,node,r)||(p?.felled&&nearestOpenGround(s,p,r));
        if(!source){
          op.status="Waiting for an accessible route to the remaining output";
          (op.accessRetryAt??={})[r.id]=s.time+30;
          r.operation=null;r.target=null;r.walk=[];r.action='idle';
          return false;
        }
        if(!go(s,r,source))return true;
        op.returningToSite=false;r.target=null;
      }
    }
    if (!go(s, r, supplySpot(s, r, i))) return true;
    const returned=bulk?productionLoad(op.haulRemaining):output;
    if(bulk&&!Object.keys(returned).length&&Object.values(op.haulRemaining).some(n=>n>0)){
      op.status="Output exceeds hand-carry capacity";return true;
    }
    const total = Object.entries(returned).reduce((a, [id, n]) => a + (id === 'scraps' ? 0 : n), 0);
    if (storedMaterials(s) + total > storageCapacity(s)) {
      // Set the load down beside the stores. A carrier who kept hold of it
      // could not eat, drink or rest for as long as the stores stayed full.
      op.status = "Storage full; the load waits beside the stores";
      (op.accessRetryAt??={})[r.id]=s.time+30;
      r.cargo=false;r.operation=null;r.target=null;r.walk=[];r.action='idle';
      return true;
    }
    for (const [id, n] of Object.entries(returned))
      changeMaterial(s,id,n,op.foodOutput?.[id]?takeFoodLots(op.foodOutput[id],n):undefined,'production delivery');
    if(bulk){
      for(const [id,n]of Object.entries(returned))op.haulRemaining[id]-=n;
      if(Object.values(op.haulRemaining).some(n=>n>0)){
        op.returningToSite=true;r.cargo=false;r.target=null;return true;
      }
    }
    op.done = true;
    r.operation = null;
    r.cargo = false;
    if(recipe.equipmentRepair)repairEquipment(s,recipe.equipmentRepair);
    say(s, op.recipe === "solar_upgrade" ? `Solar upgrade installed at ${projectLabel(p,PROJECTS)}.` : op.farm ? `${projectLabel(p,PROJECTS)}: ${op.farm.action==='harvest'?'harvest':'residues'} from bed ${op.farm.bed+1} delivered to storage.` : `${recipe.name}: supplies delivered to storage from ${projectLabel(p,PROJECTS)}.`);
    return true;
  }

  if(recipe.craft && craftingBlocker(s,recipe,r)) {op.status=craftingBlocker(s,recipe,r);r.action='blocked';return false;}
  if (op.phase === "pickup") {
    if(recipe.craft)op.status="Collecting reserved crafting materials";
    r.action = "collect";
    if (!go(s, r, supplySpot(s, r, i))) return true;
    op.phase = "process";
    r.target = null;
  }
  // Walking to a no-input job carries nothing. A blocked gathering/bed job
  // must not suppress hunger, toilet or rest breaks through phantom cargo.
  r.cargo = op.work===0 && Object.values(op.input||recipe.input).some(n=>n>0);
  r.action = r.cargo ? "carry" : "walk";
  const bed=op.farm&&p.cultivation.beds[op.farm.bed];
  const center=bed&&bedWorld(p,bed,footprint(p));
  const a=(p.rotation||0)*Math.PI/2;
  const dest = bed ? [{x:center.x+Math.cos(a)*.5,z:center.z-Math.sin(a)*.5},{x:center.x-Math.cos(a)*.5,z:center.z+Math.sin(a)*.5}].find(point=>!occupied(s,point.x,point.z)&&route(s,r,point)) : utilitySpot(s, node, r);
  if(recipe.craft)op.status="Taking materials to the crafting workspace";
  if (!dest) {
    op.status="Waiting for an accessible work position; residents can do other work";
    // Keep reserved materials with the operation, not a worker waiting forever.
    // Retry per resident because another resident may be on the accessible side.
    (op.accessRetryAt??={})[r.id]=s.time+30;
    r.operation=null;r.cargo=false;r.target=null;r.walk=[];r.action='idle';
    // Once everyone at home has tried and failed, a job with nothing reserved
    // is dropped instead of waiting forever. The site is left alone for a day
    // so the land can change (a bridge, a cleared path) before anyone retries.
    if(!op.farm&&op.work===0&&!Object.values(op.input||{}).some(n=>n>0)&&
       s.people.every(person=>person.outsideWork||atTownJob(person)||op.accessRetryAt[person.id]!==undefined)){
      op.done=true;
      if(p.noAccessUntil===undefined)say(s,`${projectLabel(p,PROJECTS)}: nobody can reach it on foot, so residents leave it be and look again each day.`);
      p.noAccessUntil=s.time+3200;
    }
    return false;
  }
  if(op.accessRetryAt)delete op.accessRetryAt[r.id];
  if (!go(s, r, dest)) return true;
  r.cargo = false;
  if (!node.enabled) {
    op.status = "Building switched off";
    r.action = "blocked";
    return true;
  }
  if (recipe.water && !op.waterPaid) {
    if (
      !useWater(
        s,
        p.id,
        recipe.water,
        !["kitchen", "goat_pasture", "coop"].includes(recipe.kind),
      )
    ) {
      // Water may be on hand while the used-water tank has no room left.
      op.status = node.capacity[2] - node.water[2] < recipe.water * .8 && node.water[0] >= recipe.water
        ? "Greywater tank is full; waiting for it to be emptied" : "Waiting for usable water";
      r.action = "blocked";
      return true;
    }
    op.waterPaid = true;
  }
  if (
    !recipe.installation && recipe.kind === "kitchen" &&
    node.power < 0.99 &&
    !op.biogas &&
    sys.biogas >= (recipe.biogas || .2)
  ) {
    sys.biogas -= recipe.biogas || .2;
    op.biogas = true;
  }
  if (
    !recipe.installation && ["workshop", "kitchen"].includes(recipe.kind) && !recipe.craft &&
    node.power < 0.99 &&
    !op.biogas
  ) {
    op.status = "Waiting for power";
    r.action = "blocked";
    return true;
  }
  const output = Object.values(recipe.output).reduce((a, b) => a + b, 0);
  const expectedOutput = s.mode!=="sandbox" && ["eggs","milk"].includes(op.recipe) ? Math.min(output,animalAvailable(p)) : output;
  if (storedMaterials(s) + expectedOutput > storageCapacity(s)) {
    op.status = "Storage full";
    r.action = "blocked";
    return true;
  }
  op.status = recipe.gathering ? "Gathering local resources" : recipe.craft ? craftStage(recipe,op.work) : "Working";
  if (r.energy < 25) { r.action = "idle"; r.operation = null; return true; }
  r.action = "produce";
  const toolBonus=useEquipment(s,r,recipe.craft?.tool || productionEquipment(recipe),`op:${op.id}`,dt);
  if(recipe.craft) {
    op.crafter=r.id;
    op.work+=dt*practiceCraft(r,recipe,dt)*hydrationWorkFactor(r);
  } else op.work += dt * toolBonus * workMultiplier(r,p.key) * (node.power > 0.99 && recipe.kind === "workshop" ? 2 : 1);
  r.work += dt;
  r.energy = Math.max(0, r.energy - dt * 0.12);
  if(op.work>=recipe.work*(BIOLOGY[op.recipe]?.plantingFraction??.5) && beginBiology(s,op,r))return true;
  if(op.farm?.action==='plant'&&op.work<recipe.work)p.cultivation.beds[op.farm.bed].stage='planted';
  if (op.work >= recipe.work) {
    if(op.farm)finishFarmJob(s,p,op);
    let animalCollection;
    if(s.mode!=='sandbox'&&['eggs','milk'].includes(op.recipe))animalCollection=collectAnimal(s,p,op.recipe,recipe.output[op.recipe]);
    if(animalCollection)op.harvestOutput=animalCollection.output;
    else if(BIOLOGY[op.recipe]){op.harvestOutput=harvestOutput(s,op,recipe);p.harvestCount=(p.harvestCount||0)+1;}
    recordProduction(s,op.recipe,recipe);
    op.foodOutput=Object.fromEntries(Object.entries(op.harvestOutput||recipe.output).filter(([id,n])=>FOOD_DAYS[id]&&n>0).map(([id,n])=>[id,freshLots(s,id,n,recipe)]));
    if(animalCollection)op.foodOutput[op.recipe]=animalCollection.lots;
    if(recipe.kind==='wild-tree'){p.felled=true;p.felledAt=s.time;invalidateNavigation(s);}
    if(op.recipe==='cold_storage'){p.coldStorage=true;p.coolingEnabled=true;}
    if(op.recipe==='solar_upgrade')p.solarUpgrade=true;
    op.phase = "return";
    r.target = null;
    p.readyAt = s.time + (BIOLOGY[op.recipe] ? 0 : recipe.renew || 0);
    p.extracted = (p.extracted || 0) + output;
    op.work = recipe.work;
    // Preparing, planting or amending a bed leaves nothing to carry back, so
    // the job ends at the bed instead of with an empty-handed walk to storage.
    if(op.farm&&!Object.values(op.harvestOutput||{}).some(n=>n>0)){
      op.done=true;r.operation=null;r.cargo=false;
      const result={prepare:'prepared',plant:`planted with ${CROPS[op.farm.crop]?.name||'a crop'}`,amend:'amended with compost',collect:'had no residues worth collecting',clear:'cleared',harvest:'gave nothing worth carrying'}[op.farm.action];
      say(s,`${projectLabel(p,PROJECTS)}: bed ${op.farm.bed+1} ${result}.`);
    }
  }
  return true;
}
export function materialText(id, n) {
  return `${quantityText(id,n)} ${MATERIALS[id].name.replace(/ pieces| packs| bundles/g, "")}`;
}
export function recipeText(key) {
  return Object.entries(PROJECTS[key].materials)
    .map(([id, n]) => materialText(id, n))
    .join(" · ");
}
export function materialCount(s, id) {
  return id === "wood" ? s.wood : s.materials[id];
}
export function missingMaterials(s, key) {
  if (s.mode === "sandbox") return [];
  return Object.entries(PROJECTS[key].materials)
    .filter(([id, n]) => materialCount(s, id) < n)
    .map(([id, n]) => materialText(id, n - materialCount(s, id)));
}
export function blueprintPurchase(s, key, count = 1) {
  const items = {};
  let cost = 0;
  if (s.mode !== "sandbox") for (const [id, required] of Object.entries(PROJECTS[key].materials)) {
    const missing = Math.max(0, required * count - materialCount(s, id));
    if (!missing) continue;
    if(s.autoBuy===false)return {items:{},cost:0,error:'Auto-buy is off. Gather or purchase the missing materials first.'};
    const item = MATERIALS[id];
    if (!item.quantity || !Number.isFinite(item.price)) return {items, cost: 0, error: `Produce ${item.name} locally first.`};
    items[id] = missing;
    cost += missing * item.price / item.quantity;
  }
  const supplierIssue=supplierError(s,items,MATERIALS);
  if(supplierIssue)return {items,cost,transport:0,error:supplierIssue};
  cost = Math.ceil(cost * 100) / 100;
  const budget=collectionBudget(s,items), transport=budget.cost, reserve=s.expansionReserve??0;
  return {items, cost, transport, error: cost > 0 && cost + transport + reserve > s.money ? `Not enough savings: the missing materials cost ${brl(cost)}, plus ${brl(transport)} for ${budget.truck?'supplier truck delivery':`${budget.trips} ${budget.trips===1?'trip':'trips'} to collect them`}${reserve?`, and ${brl(reserve)} is kept in reserve`:''}.` : ""};
}
function dispatchBlueprintPickup(s) {
  if(!dispatchReady(s))return;
  if(!s.deliveryOnly)for(const trip of activeTrips(s))if(trip.phase==='boarding'&&trip.shipments){
    trip.shipments=blueprintManifest(uncollectedProjects(s,trip));trip.projects=trip.shipments.map(p=>p.project);
  }
  // Whatever no boarding car will carry goes by truck when it exceeds one car load.
  const pending=uncollectedProjects(s);
  if(pending.length&&projectFreight(s,pending).truck){
    if(orderDelivery(s,Object.keys(pending[0].pendingMaterials)[0],pending[0],MATERIALS,storedMaterials(s),storageCapacity(s))&&!s.deliveryOnly)
      say(s,`A supplier truck will deliver the materials for ${s.delivery.shipments.length===1?projectLabel(s.projects.find(p=>p.id===s.delivery.shipments[0].project),PROJECTS):`${s.delivery.shipments.length} projects`}. The order is too large for one car load.`);
    return;
  }
  if(activeTrips(s).length>=2)return;
  const shipments=blueprintManifest(uncollectedProjects(s));if(!shipments.length)return;
  const first=s.projects.find(p=>p.id===shipments[0].project);
  if(supplyRun(s,Object.keys(shipments[0].items)[0],first)){
    const trip=s.secondTrip||s.trip;trip.shipments=shipments;trip.projects=shipments.map(p=>p.project);
  }
}
export function requiredLoads(key) {
  return Object.entries(typeof key==='string'?PROJECTS[key].materials:projectMaterials(key,PROJECTS)).reduce(
    (sum, [id, n]) => sum + Math.ceil(n / MATERIALS[id].batch),
    0,
  );
}
export const NAMES = ["Iara", "Bento", "Luz", "Cauã", "Nina"];
export function beginArrival(s) {
  s.arrivalAnimating=true;
  s.arrivalElapsed=0;
  return s;
}
// Skipping lands on exactly the state the animation ends in: the clock is the
// only thing the arrival advances.
export function skipArrival(s) {
  if (!s.arrivalAnimating) return false;
  s.arrivalElapsed = ARRIVAL_DURATION;
  s.arrivalAnimating = false;
  return true;
}
export function createWeekend(landSeed = 0) {
  return {
    version: 2,
    autonomy: 1,
    expansionReserve:100,
    materialBillVersion:2,
    constructionLaborVersion: CONSTRUCTION_LABOR_VERSION,
    biologyVersion:2,
    homeEnergyVersion: 1,
    landSeed,
    elevationSeed: landSeed,
    terrainPads: [],
    livestockUnits: 1,
    opening: { version: 1, townTrips: 0 },
    stage: "arrival",
    arrivalElapsed: ARRIVAL_DURATION,
    camp: null,
    time: 0,
    money: STARTING_CAPITAL.modest,
    wood: 36,
    materials: {
      ...Object.fromEntries(
        Object.keys(MATERIALS)
          .filter((k) => k !== "wood")
          .map((k) => [k, 0]),
      ),
      tools: 4,
      meals: 20,
      food: 12,
      hardware: 7,
      roofing: 8,
      tarp: 1,
      tank: 1,
      plumbing: 1,
      sanitation: 1,
    },
    stock: { x: 32, z: 23 - ROAD_SHIFT / 2 },
    projects: [],
    people: NAMES.map((name, i) => ({
      name,
      id: ["iara", "bento", "luz", "caua", "nina"][i],
      x: ARRIVAL_SPOTS[i][0],
      z: ARRIVAL_SPOTS[i][1],
      energy: 85 + i * 3,
      needs: ensureNeeds({},i),
      action: "idle",
      job: null,
      cargo: false,
      target: null,
      walk: [],
      work: 0,
    })),
    trip: null,
    rain: false,
    rainSeen: false,
    rainResolved: false,
    meal: false,
    log: [
      "Five friends, one plot of land. Let’s make somewhere we can stay together.",
    ],
    nextId: 1,
  };
}
export function createSandbox(landSeed = 0) {
  const s = createWeekend(landSeed);
  delete s.opening;
  s.mode = "sandbox";
  s.instantBuild = true;
  s.arrivalElapsed = ARRIVAL_DURATION;
  chooseCamp(s, "entrance");
  sandboxSupplies(s);
  delete s.events;
  s.log = [
    "Your land, your pace. All buildings are available; construction is free. Toggle Instant build to let residents do the work.",
  ];
  return s;
}
function sandboxSupplies(s) {
  s.money = 999999;
  s.wood = 9999;
  for (const id of Object.keys(MATERIALS))
    if (id !== "wood") s.materials[id] = 9999;
  refreshSandboxFood(s);
}
export function say(s, text, key = null) {
  recordEvent(s, text, key);
  if (key === "water-purified") return;
  s.log.unshift(text);
  s.log = s.log.slice(0, 12);
}
export function campLocation(s) {
  return s.camp === "custom" ? s.campSite : CAMPS.find((c) => c.id === s.camp);
}
const samePad = (a, b) => !!a && !!b && ["left", "right", "top", "bottom", "height"].every((k) => a[k] === b[k]);
// The land as it is with no camp on it. While the camp can still be moved its
// own tents and levelled pad must not count against the next site.
// Hovering asks about many sites in a row, so the camp-less view keeps one
// navigation cache for as long as the land itself is unchanged.
const camplessViews = new WeakMap();
function camplessState(s) {
  const pad = canRepitchCamp(s) ? s.unpack.pad : null;
  const key = JSON.stringify([s.camp, s.campSite, pad, s.stock, s.projects.length, s.terrainPads?.length]);
  const cached = camplessViews.get(s);
  if (cached?.key === key && cached.land.projects === s.projects) return cached.land;
  const land = { ...s, camp: null, campSite: undefined, terrainPads: pad ? s.terrainPads.filter((p) => !samePad(p, pad)) : s.terrainPads };
  enableFastNavigation(land);
  camplessViews.set(s, { key, land });
  return land;
}
export function campPlacementError(s, x, z, rotation = 0) {
  if (!Number.isInteger(x) || !Number.isInteger(z) || ![0, 1, 2, 3].includes(rotation))
    return "Keep the tents inside the plot.";
  const site = { x, z, rotation }, rect = campRect(site);
  if (
    rect.x < CELL_MIN + 3 ||
    rect.z < CELL_MIN + 3 ||
    rect.x + rect.w - 1 > CELL_MAX - 3 ||
    rect.z + rect.d - 1 > CELL_MAX - 5
  )
    return "Keep the tents inside the plot.";
  const land = camplessState(s);
  if (
    !foundationPad(rect.x, rect.z, rect.w, rect.d, s.elevationSeed, land.terrainPads)
  )
    return "Leave space between foundations at different heights.";
  const taken = blockedCamp(land);
  for (const cell of campSiteCells(site)) {
      if (riverBankAt(cell.x, cell.z, 2, s.landSeed))
        return "Keep the tents back from the river.";
      if (
        accessRoadAt(cell.x, cell.z, 1) ||
        taken.some((p) => p.x === cell.x && p.z === cell.z)
      )
        return "Leave the road, trees and supplies clear.";
    }
  if (land.projects.some((p) => !p.felled && !["road", "bridge"].includes(p.key) && (() => {
    const [w, d] = footprint(p);
    return rect.x < p.x + w && rect.x + rect.w > p.x && rect.z < p.z + d && rect.z + rect.d > p.z;
  })()))
    return "A tree or outcrop stands on this ground.";
  if (!route(land, s.stock, campApproach(site)))
    return "Choose somewhere reachable from the supplies.";
  return null;
}
const pathMetres = (from, path) => {
  let metres = 0, at = from;
  for (const p of path) { metres += Math.hypot(p.x - at.x, p.z - at.z) * 2; at = p; }
  return Math.round(metres);
};
// Plain measurements of a possible camp site; nothing here rates the site.
export function campSiteFacts(s, x, z, rotation = 0) {
  const site = { x, z, rotation }, rect = campRect(site), land = camplessState(s);
  const approach = campApproach(site);
  const centre = { x: rect.x + (rect.w - 1) / 2, z: rect.z + (rect.d - 1) / 2 };
  let low = Infinity, high = -Infinity;
  for (let cx = rect.x - 0.5; cx <= rect.x + rect.w - 0.5; cx++)
    for (let cz = rect.z - 0.5; cz <= rect.z + rect.d - 0.5; cz++) {
      const h = elevationAt((cx - 32) * 2, (cz - 32) * 2, s.elevationSeed, land.terrainPads);
      low = Math.min(low, h); high = Math.max(high, h);
    }
  const toCars = route(land, s.stock, approach);
  const access = toCars && nearestRiverAccess(land, approach);
  const toRiver = access && route(land, approach, access);
  const trees = s.projects.filter((p) => !p.felled && PROJECTS[p.key]?.kind === "wild-tree" &&
    Math.hypot(p.x - centre.x, p.z - centre.z) <= 6 + Math.max(rect.w, rect.d) / 2).length;
  return {
    carsMetres: toCars ? pathMetres(s.stock, toCars) : null,
    carsPath: toCars ? [{ ...s.stock }, ...toCars] : null,
    riverMetres: toRiver ? pathMetres(approach, toRiver) : null,
    riverAccess: access || null,
    fallMetres: Math.round((high - low) * 10) / 10,
    // Height of the ground once the site has been levelled for the tents.
    height: foundationPad(rect.x, rect.z, rect.w, rect.d, s.elevationSeed, land.terrainPads)?.height ??
      elevationAt((centre.x - 32) * 2, (centre.z - 32) * 2, s.elevationSeed, land.terrainPads),
    trees,
  };
}
// The camp may move until the first load has been set down and nothing else
// depends on where it stands.
export function canRepitchCamp(s) {
  return s.stage === "playing" && s.camp === "custom" && !!s.unpack && !s.unpack.delivered.length &&
    !s.trip && !s.projects.some((p) => !p.natural) && !s.operations?.some((o) => !o.done);
}
export function repitchCamp(s, site) {
  const rotation = site.rotation || 0;
  if (!canRepitchCamp(s) || campPlacementError(s, site.x, site.z, rotation)) return false;
  s.terrainPads = camplessState(s).terrainPads;
  s.camp = null;
  delete s.campSite;
  s.stage = "arrival";
  return chooseCamp(s, { x: site.x, z: site.z, rotation }, { unpack: true, moved: true });
}
// `unpack` leaves the tents and gear in the cars for the residents to carry
// over. Without it the camp stands complete at once, as it always has.
export function chooseCamp(s, id, { unpack = false, moved = false } = {}) {
  if (s.stage !== "arrival" || s.arrivalElapsed < ARRIVAL_DURATION)
    return false;
  const custom = typeof id === "object" && id !== null;
  if (custom && campPlacementError(s, id.x, id.z, id.rotation || 0)) return false;
  const c = custom
    ? {
        id: "custom",
        name: "Your camp",
        x: id.x,
        z: id.z,
        ...(id.rotation ? { rotation: id.rotation } : {}),
        shade: false,
        wet: false,
      }
    : CAMPS.find((c) => c.id === id);
  if (!c) return false;
  if (custom) s.campSite = c;
  s.camp = c.id;
  const rect = campRect(c);
  const campPad = foundationPad(
    rect.x,
    rect.z,
    rect.w,
    rect.d,
    s.elevationSeed,
    s.terrainPads,
  );
  if (campPad) (s.terrainPads ??= []).push(campPad);
  if (unpack) s.unpack = { delivered: [], pad: campPad ? { ...campPad } : null };
  else delete s.unpack;
  for (const r of s.people) {
    if (!unpack || !moved) delete r.unpack;
    else { r.walk = []; r.target = null; }
  }
  // Unpacking tents is an instantaneous setup step; keep the group beside them.
  for (const r of s.people) {
    if (walkSegmentClear(s, r, r)) continue;
    const spots = [];
    for (let x = 20; x <= 45; x++)
      for (let z = 20; z <= 45; z++) {
        const p = { x, z };
        if (
          walkSegmentClear(s, p, p) &&
          s.people.every((o) => o === r || Math.hypot(o.x - x, o.z - z) > 0.7)
        )
          spots.push(p);
      }
    spots.sort(
      (a, b) =>
        Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
    );
    if (spots[0]) Object.assign(r, spots[0]);
  }
  s.stage = "playing";
  if (moved) {
    say(s, "The camp moves. Nothing has been set down yet, so everyone simply carries it to the new site.");
    return true;
  }
  if (s.opening)
    say(
      s,
      "Iara: We have tents, meals and drinking water. There’s a spare tarp in the supplies if the weather turns.",
    );
  say(s, unpack ? "The site is marked. The tents and camping gear are still in the cars; everyone starts carrying them over." : `${c.name}: unpack first, then choose what matters most.`);
  return true;
}
export function finished(s, key) {
  return s.projects.some((p) => p.key === key && p.work >= PROJECTS[key].work);
}
export function placementError(s, key, x, z, ignore = null, rotation = 0, details = null) {
  if(ignore===null && s.projects.length>=128*128)return 'This village has reached the project limit.';
  const def = PROJECTS[key];
  if (!def || !Number.isInteger(x) || !Number.isInteger(z))
    return "Choose a grid square.";
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3)
    return "Choose a valid orientation.";
  const previous = ignore === null ? null : s.projects.find(p => p.id === ignore);
  const candidate = { ...previous, key, x, z, rotation, ...(key==='field'?{fieldSize:details?.fieldSize||previous?.fieldSize||[2,2]}:{}) };
  const [w, d] = footprint(candidate);
  // The car shelter has one possible site: the cells the parked cars already fill.
  const overParking = def.fixedSite;
  if (overParking && (x !== PARKING_SITE.x || z !== PARKING_SITE.z || rotation !== PARKING_SITE.rotation))
    return "The car shelter is built over the parking clearing, where the cars stand.";
  if (
    !["road", "bridge", "field"].includes(key) &&
    !foundationPad(x, z, w, d, s.elevationSeed, s.terrainPads)
  )
    return "Leave a little space between foundations at different heights.";
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (key !== "road" && !overParking && accessRoadAt(x + dx, z + dz, 1))
        return "Keep the access road and parking clearing open.";
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++)
      if (
        !["hydro", "bridge", "water-pump"].includes(def.kind) &&
        riverBankAt(x + dx, z + dz, 1, s.landSeed)
      )
        return "Keep projects back from the riverbank.";
  if (
    x < CELL_MIN + 2 ||
    z < CELL_MIN + 2 ||
    x + w > CELL_MAX - 2 ||
    z + d > CELL_MAX - 2
  )
    return "Keep buildings inside the plot boundary.";
  if(def.kind==='water-pump' && !riverBankAt(x+.5,z+.5,3,s.landSeed) &&
    !s.projects.some(p=>PROJECTS[p.key].kind==='groundwater-well'&&p.work>=PROJECTS[p.key].work&&Math.hypot(p.x-x,p.z-z)<=6))
    return 'Place the pump beside the river or within 6 cells of a completed water well.';
  if (def.kind === "hydro" && !riverBankAt(x + w / 2, z + d / 2, 3, s.landSeed))
    return "Place the river generator beside the river.";
  if (key === "bridge") {
    const ends = bridgeEnds(candidate);
    if (
      !riverBankAt(x + (w - 1) / 2, z + (d - 1) / 2, 0, s.landSeed) ||
      ends.some((e) => riverBankAt(e.x, e.z, 0.7, s.landSeed))
    )
      return "Span the river with both bridge ends on dry land.";
    if (!ends.some((e) => route(s, s.stock, e)))
      return "Keep one bridge end reachable from the village.";
  }
  if (
    x <= s.stock.x &&
    x + w > s.stock.x &&
    z <= s.stock.z &&
    z + d > s.stock.z
  )
    return "Leave the supplies accessible.";
  if (
    s.projects.some(
      (p) =>
        !p.felled && p.id !== ignore &&
        x < p.x + footprint(p)[0] &&
        x + w > p.x &&
        z < p.z + footprint(p)[1] &&
        z + d > p.z,
    )
  )
    return "Another project occupies that space.";
  if(s.projects.some(p=>p.id!==ignore&&p.removal?.target&&(()=>{const t=p.removal.target,[rw,rd]=footprint({...p,rotation:t.rotation});return x<t.x+rw&&x+w>t.x&&z<t.z+rd&&z+d>t.z;})()))return "That space is reserved for a building relocation.";
  if (
    !overParking &&
    blockedCamp(s).some(
      (c) => c.x >= x && c.x < x + w && c.z >= z && c.z < z + d,
    )
  )
    return "Leave the tents, trees and arrival area clear.";
  // Roads neither block walking nor grade terrain, so they cannot close an
  // existing entrance. Keep the site checks above, without rerouting the village
  // for every tile in a road stroke (or every hover preview).
  if (key === "road") return "";
  const proposed = {
    ...s,
    projects: [
      ...s.projects.filter((p) => p.id !== ignore),
      { ...candidate, id: ignore || -1 },
    ],
  };
  enableFastNavigation(proposed);
  if(campLocation(s)&&[0,1].some(i=>route(s,s.stock,tentDoor(s,i))&&!route(proposed,s.stock,tentDoor(proposed,i))))return "Keep the camp tent entrances reachable from the supplies.";
  // Old saves may already contain inaccessible sites. Only reject a new
  // obstruction; require the new/moved project itself to be accessible.
  const alreadyBlocked = (p, spots, completed = false) => {
    if (p.id === (ignore || -1)) return false;
    const old = s.projects.find(item => item.id === p.id);
    if (!old) return false;
    const baseline = completed ? {...s,projects:s.projects.map(item=>item===old?{...old,work:PROJECTS[old.key].work}:item)} : s;
    enableFastNavigation(baseline);
    return !spots.some(spot=>route(baseline,s.stock,spot,true));
  };
  for (const p of proposed.projects.filter(p=>!p.natural&&!p.felled&&!['road','bridge'].includes(p.key))) {
    const [pw,pd]=footprint(p),edges=[];
    for(let dz=0;dz<pd;dz++)edges.push({x:p.x-1,z:p.z+dz},{x:p.x+pw,z:p.z+dz});
    for(let dx=0;dx<pw;dx++)edges.push({x:p.x+dx,z:p.z-1},{x:p.x+dx,z:p.z+pd});
    if(!edges.some(spot=>!occupied(proposed,spot.x,spot.z)&&route(proposed,s.stock,spot,true)) && !alreadyBlocked(p,edges))
      return `${PROJECTS[p.key].name} at (${p.x}, ${p.z}) would have no reachable side. Leave a one-cell walking gap.`;
  }
  for (const p of proposed.projects) {
    if(!p.natural&&!p.felled&&!['road','bridge'].includes(p.key)) {
      const complete={...p,work:PROJECTS[p.key].work};
      const spots=accessGeometry(complete,PROJECTS[p.key],footprint(p)).work;
      const accessible=p.work>=PROJECTS[p.key].work?proposed:{...proposed,projects:proposed.projects.map(item=>item===p?complete:item)};
      enableFastNavigation(accessible);
      if(!spots.some(spot=>route(accessible,s.stock,spot,true)) && !alreadyBlocked(p,spots,true)){
        const doorway=accessGeometry(complete,PROJECTS[p.key],footprint(p)).entrances[0];
        if(details)details.entrance=doorway||spots[0];
        return `${PROJECTS[p.key].name} ${doorway?'entrance':'work access'} is blocked. Leave its front clear or rotate it.`;
      }
    }
    if (
      (["home", "workshop", "kitchen", "wash-station", "eco_toilet"].includes(
        PROJECTS[p.key].kind,
      ) || p.key.startsWith("canvas-tent")) &&
      !route(proposed, s.stock, buildingFront(p),true) && !alreadyBlocked(p,[buildingFront(p)])
    ) {
      if (details) details.entrance = buildingFront(p);
      return `${PROJECTS[p.key].name} entrance at (${buildingFront(p).x}, ${buildingFront(p).z}) is blocked. Rotate it or leave a walking gap.`;
    }
  }
  const completedSite = {...proposed, projects:proposed.projects.map(p =>
    p.id === (ignore || -1) ? {...p, work:def.work} : p)};
  enableFastNavigation(completedSite);
  const waterSources = Object.values(s.infrastructure?.nodes || {}).filter(n =>
    n.enabled && n.water[0] >= .5 && !['coop','goat_pasture'].includes(n.kind));
  function canEat(layout, resident) {
    for (let ring=1; ring<=3; ring++) for (let j=0; j<12; j++) {
      const angle = j * Math.PI / 6;
      const spot = {x:Math.round(layout.stock.x + Math.cos(angle)*ring), z:Math.round(layout.stock.z + Math.sin(angle)*ring)};
      if (route(layout,resident,spot,true)) return true;
    }
    return false;
  }
  function canDrink(layout, resident) {
    return waterSources.some(node => {
      const spot = utilitySpot(layout,node,resident);
      return spot && route(layout,resident,spot,true);
    });
  }
  for (const resident of s.people) {
    if (atTownJob(resident) || resident.action === 'town') continue;
    for (const [available, destination] of [[canEat,'food stores'],[canDrink,'drinking water']]) {
      if ((!available(proposed,resident) || !available(completedSite,resident)) && available(s,resident))
        return `Leave a walking route for ${resident.name} to reach ${destination}.`;
    }
  }
  return "";
}
function gradeFoundation(s, key, x, z, rotation = 0) {
  if (["road", "bridge", "field"].includes(key)) return;
  const [w, d] = footprint({ key, rotation });
  const pad = foundationPad(x, z, w, d, s.elevationSeed, s.terrainPads);
  s.terrainPads ??= [];
  if (
    pad &&
    !s.terrainPads.some((p) => Object.keys(pad).every((k) => p[k] === pad[k]))
  )
    s.terrainPads.push(pad);
}
export function plan(s, key, x, z, rotation = 0) {
  if(key==='field')return planField(s,x,z,[2,2],rotation);
  if(PROJECTS[key]?.natural)return 'Natural resources are found on the land, not built.';
  if (s.stage !== "playing") return "Choose your campsite first.";
  const def = PROJECTS[key];
  if (!def) return "Unknown project.";
  if (
    s.mode !== "sandbox" &&
    s.projects.some((p) => p.key === key) &&
    !def.repeatable
  )
    return "Already planned. Select it to change priority or move it.";
  const error = placementError(s, key, x, z, null, rotation);
  if (error) return error;
  const purchase = blueprintPurchase(s, key);
  if (purchase.error) return purchase.error;
  if(!reserveSupplier(s,purchase.items,MATERIALS))return supplierError(s,purchase.items,MATERIALS);
  for (const r of s.people)
    if (
      [
        "relax",
        "idle",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
      ].includes(r.action)
    ) {
      r.walk = [];
      r.target = null;
    }
  for (const [id, n] of Object.entries(
    s.mode === "sandbox" ? {} : def.materials,
  )) {
    const reserved = n - (purchase.items[id] || 0);
    changeMaterial(s,id,-reserved,undefined,'construction reservation');
  }
  transact(s,-purchase.cost,"construction",`Materials for ${def.name}`);
  gradeFoundation(s, key, x, z, rotation);
  const instant = key !== "road" && s.mode === "sandbox" && s.instantBuild !== false;
  s.projects.push({
    id: s.nextId++,
    number: numberProject(s, {key}, PROJECTS).number,
    key,
    x,
    z,
    rotation,
    ...(key === "bridge" ? {siteVersion: 1} : {}),
    billOfMaterials:{...def.materials},
    work: instant ? def.work : 0,
    delivered: s.mode === "sandbox" ? requiredLoads(key) : 0,
    ...(Object.keys(purchase.items).length ? {pendingMaterials: purchase.items,supplierDay:Math.floor((540+s.time*.45)/1440)} : {}),
  });
  for (const r of s.people) {
    r.walk = [];
    r.target = null;
  }
  say(
    s,
    s.mode === "sandbox"
      ? `${def.name} ${instant ? "built" : "queued for resident construction"}. No materials spent.`
      : purchase.cost ? `${def.name} planned. Missing materials purchased for ${brl(purchase.cost)}; pickup ${s.trip ? "queued after the current trip" : "being arranged"}.`
      : `${def.name} planned. Materials reserved; friends will bring them over.`,
  );
  dispatchBlueprintPickup(s);
  for(const trip of activeTrips(s))if(trip.phase==='boarding')loadExports(s,trip);
  if(activeTrips(s).length<2 && pendingExports(s).some(o=>!o.holdForPickup) && dispatchReady(s,true) && s.time>=(s.trade?.dispatchAt||0)) supplyRun(s,pendingExports(s)[0].material,null,true);
  return "";
}
export function planRoadLine(s, from, to) {
  const cells = roadLine(from, to);
  if (!cells) return "Extend roads in a straight row or column.";
  const draft = structuredClone(s);
  let added = 0;
  for (const c of cells) {
    if (
      draft.projects.some((p) => p.key === "road" && p.x === c.x && p.z === c.z)
    )
      continue;
    const error = plan(draft, "road", c.x, c.z);
    if (error) return `Road not placed: ${error}`;
    added++;
  }
  if (!added) return "These road tiles are already planned.";
  Object.assign(s, draft);
  say(
    s,
    `${added} road tiles planned. Shift-click along the same row or column to extend.`,
  );
  return "";
}
export function removeProject(s,id,mode){return requestRemoval(s,id,mode,PROJECTS,PROCESSES);}
export function moveProject(s, id, x, z, rotation = undefined) {
  if(s.projects.find(p=>p.id===id)?.natural)return 'Natural resources cannot be moved.';
  const p = s.projects.find((p) => p.id === id);
  if (!p || p.removal || s.stage !== "playing") return "Cannot move that now.";
  if(p.cultivation)return 'Cultivated soil stays on its land. Designate a new field instead.';
  if(PROJECTS[p.key].fixedSite)return 'The car shelter stands where the cars park and cannot be moved.';
  if (
    s.people.some(
      (r) => r.restSite === id && (r.tentPhase || r.action === "rest"),
    )
  )
    return "Wait until residents have finished resting here.";
  if (
    s.infrastructure?.links.some(
      (l) => !l.automatic && (l.from === id || l.to === id),
    )
  )
    return "Disconnect utility lines before relocating this building.";
  rotation ??= p.rotation || 0;
  const error = placementError(s, p.key, x, z, id, rotation);
  if (error) return error;
  if(s.operations?.some(o=>!o.done&&o.site===id))return "Finish the active batch or water job before moving.";
  if(s.people.some(r=>r.job===id&&r.cargo))return "Wait for the current material delivery to finish.";
  p.removal={mode:'move',target:{x,z,rotation},work:0,required:Math.max(30,PROJECTS[p.key].work*.2),status:'Waiting for residents to relocate the structure'};
  for(const r of s.people)if(r.job===id){r.job=null;r.workSpot=null;r.target=null;r.walk=[];}
  say(s,`${PROJECTS[p.key].name} relocation queued. Residents will do the work; the destination is reserved.`);
  return "";
}
export function cancelProjectError(s, id) {
  const p = s.projects.find(p => p.id === id);
  if (!p || PROJECTS[p.key].natural || s.stage !== 'playing') return 'This project cannot be cancelled.';
  if (p.work > 0) return 'Construction has already started.';
  const contains = trip => trip.shipments?.some(part => part.project === id) || (trip.projects || [trip.project]).includes(id);
  if (activeTrips(s).some(trip => contains(trip) && trip.phase !== 'boarding') || (s.delivery && contains(s.delivery))) return 'Materials are on their way. Cancel after delivery.';
  return '';
}

export function cancelProject(s, id) {
  const error = cancelProjectError(s, id);
  if (error) return error;
  const p = s.projects.find(p => p.id === id);
  if (s.mode !== 'sandbox') {
    let refund = 0;
    for (const [material, count] of Object.entries(projectMaterials(p,PROJECTS))) {
      const pending = p.pendingMaterials?.[material] || 0;
      changeMaterial(s, material, count - pending);
      if(pending && p.supplierDay===s.suppliers?.[material]?.day && p.supplierDay!==undefined)s.suppliers[material].units=Math.max(0,s.suppliers[material].units-pending);
      if (pending) refund += pending * MATERIALS[material].price / MATERIALS[material].quantity;
    }
    refund = Math.ceil(refund * 100) / 100;
    if (refund) { s.money += refund; recordMoney(s, refund, 'construction', `Cancelled materials for ${PROJECTS[p.key].name}`); }
  }
  for (const key of ['trip', 'secondTrip']) {
    const trip = s[key];
    if (!trip || !(trip.shipments?.some(part => part.project === id) || (trip.projects || [trip.project]).includes(id))) continue;
    if (trip.shipments) trip.shipments = trip.shipments.filter(part => part.project !== id);
    const orders = trip.shipments ? trip.shipments.map(part => part.project) : (trip.projects || [trip.project]).filter(order => order !== id);
    if (orders.length) { trip.projects = orders; trip.project = orders[0]; }
    else if (trip.exports?.length) {
      delete trip.project; delete trip.projects; delete trip.shipments;
      trip.saleOnly = true;
    } else {
      const driver = s.people.find(r => r.id === trip.person);
      if(trip.boardingFare>0)transact(s,trip.boardingFare,'transport','Unused pickup fuel refunded');
      if (driver) { driver.action = 'idle'; driver.target = null; driver.walk = []; }
      s[key] = null;
    }
  }
  s.projects = s.projects.filter(project => project.id !== id);
  for (const r of s.people) {
    if(r.removalJob===id){delete r.removalJob;r.action="idle";}
    r.walk = []; r.target = null;
    if (r.job === id) {
      r.job = null; r.workSpot = null; r.supplyGoal = null;
      r.cargo = false; r.haulLoads = 0; r.haulStage = null;
      if (!r.needTask && !r.tentPhase) r.action = 'idle';
    }
  }
  invalidateNavigation(s);
  say(s, `${projectLabel(p,PROJECTS)} plan cancelled. Reserved supplies returned${p.pendingMaterials ? ' and pending purchases refunded' : ''}.`);
  return '';
}

export function prioritize(s, id) {
  const i = s.projects.findIndex((p) => p.id === id);
  if (i < 0) return;
  for(const project of s.projects)project.prioritized=project.id===id;
  s.projects.unshift(...s.projects.splice(i, 1));
  for (const r of s.people) if (r.job && !r.cargo && !r.needTask) {
    r.job = null; r.workSpot = null; r.supplyGoal = null; r.walk = []; r.target = null;
  }
  say(
    s,
    "The group will pick up this project next. Current carrying trips finish first.",
  );
}
function inboundStock(s){return [...activeTrips(s),s.delivery].filter(t=>t&&!t.saleOnly&&!t.project&&!t.shipments).reduce((n,t)=>n+(t.quantity??MATERIALS[t.material]?.quantity??0),0);}
export function supplyRun(s,material="wood",project=null,saleOnly=false){
 const hour=((540+s.time*.45)/60)%24;
 if(hour<7||hour>=18)return false;
 if(s.deliveryOnly&&!saleOnly)return orderDelivery(s,material,project,MATERIALS,storedMaterials(s),storageCapacity(s));
 // A car already taking sales to town can bring supplies home for the same fare.
 if(!project&&!saleOnly){
  const trip=returnPickup(s);
  const item=MATERIALS[material];
  if(trip&&item?.quantity&&fitsCargo({[material]:item.quantity})&&storedMaterials(s)+inboundStock(s)+item.quantity<=storageCapacity(s)&&spendableMoney(s)>=item.price&&reserveSupplier(s,{[material]:item.quantity},MATERIALS)){
   transact(s,-item.price,purchaseCategory(material),`Bought ${item.quantity} ${item.name} on the existing town trip`);
   trip.material=material;trip.saleOnly=false;
   if(FOOD_DAYS[material])trip.foodLots=freshLots(s,material,item.quantity);
   say(s,`Added ${item.name} to the existing town trip. No extra fuel charge.`);return true;
  }
 }
 if(s.trip&&s.secondTrip)return false;
 if(!s.trip)return startSupplyRun(s,material,project,saleOnly);
 const first=s.trip;s.trip=null;s.secondTrip=first;let second=null,result=false;
 try{result=startSupplyRun(s,material,project,saleOnly);second=s.trip;}
 finally{s.trip=first;s.secondTrip=second;}
 return result;
}
function startSupplyRun(s, material = "wood", project = null, saleOnly = false) {
  const item = MATERIALS[material],fare=transportCost({...s,deliveryOnly:false});
  if (
    !item ||
    !item.quantity ||
    (!project && !saleOnly && !fitsCargo({[material]:item.quantity})) ||
    (!project && !saleOnly && storedMaterials(s) + inboundStock(s) + item.quantity > storageCapacity(s)) ||
    s.stage !== "playing" ||
    s.trip ||
    (project ? s.money : spendableMoney(s)) < (project || saleOnly ? 0 : item.price) + fare
  )
    return false;
  const vehicles=[s.nextTripVehicle||0,1-(s.nextTripVehicle||0)].filter(i=>s.secondTrip?.vehicle!==i&&(s.upkeep?.vehicles[i]?.condition??100)>10);
  const drivers = s.people
    .filter((r) => r.energy > 35 && r.action!=='town' && !r.outsideWork && !dayShiftDue(s,r) && !r.cargo && !r.tentPhase && !r.needTask && Object.entries(ensureNeeds(r)).every(([key,value])=>["food","meals"].includes(material)?(!['bladder','bowels','hygiene'].includes(key)||value>10):value>25))
    .sort((a, b) => b.energy - a.energy);
  let vehicle,r;
  for(const candidate of vehicles){const driver=drivers.find(person=>route(s,person,carDoor(candidate)));if(driver){vehicle=candidate;r=driver;break;}}
  if (!r) return false;
  const drinkingAllowance=Math.max(.5,5*townDuration(s.worldSettings?.town)/3200);
  const tanks=ensureInfrastructure(s).nodes;
  const canFill=n=>n.enabled && n.water[0]+(r.drinkingWater||0)>=drinkingAllowance;
  const source=canFill(tanks[0])?tanks[0]:Object.values(tanks).find(n=>canFill(n)&&!['coop','goat_pasture'].includes(n.kind)&&utilitySpot(s,n,r));
  if(!source)return false;
  if(!project&&!saleOnly&&!reserveSupplier(s,{[material]:item.quantity},MATERIALS))return false;
  if (!project && !saleOnly) transact(s,-item.price,purchaseCategory(material),`Bought ${item.quantity} ${item.name}`);
  transact(s,-fare,"transport","Town trip fuel");

  packDrinkingWater(s,r,drinkingAllowance,source);
  s.nextTripVehicle = 1 - vehicle;
  s.trip = {
    person: r.id,
    left: townDuration(s.worldSettings?.town),
    duration: townDuration(s.worldSettings?.town),
    material,
    saleOnly,
    ...(project ? {project: project.id} : {}),
    vehicle,
    phase: "boarding",
    boardingFare:fare,
  };
  if(!project&&!saleOnly&&FOOD_DAYS[material])s.trip.foodLots=freshLots(s,material,item.quantity);
  loadExports(s,s.trip);
  r.job = null;
  r.target = null;
  r.walk = [];
  r.action = "town";
  r.toiletSite = null;
  r.toiletTime = 0;
  r.washSite = null;

  say(
    s,
    saleOnly ? `${r.name} is taking reserved surplus to town. Payment arrives after trading.` : project ? `${r.name} is heading to town to collect the prepaid materials for ${PROJECTS[project.key].name}.` : `${r.name} is heading to the car for town: ${item.quantity} ${item.name} for ${brl(item.price)}. Travel time depends on the distance to town.`,
  );
  return true;
}
export function resolveRain(s, choice) {
  if (!s.rainSeen || s.rainResolved) return false;
  if (choice === "boards") {
    if (s.wood < 2) return false;
    changeMaterial(s,'wood',-2,undefined,'storm repairs');
  } else if (choice !== "move") return false;
  s.rainResolved = true;
  s.rain = false;
  if (choice === "move") {
    s.stock = { x: 31, z: 24 };
    for (const r of s.people) {
      r.target = null;
      r.walk = [];
    }
  }
  say(
    s,
    choice === "boards"
      ? "Spare boards keep the supplies above the puddles."
      : "The group shifts supplies to higher ground. The carrying route is a little longer.",
  );
  return true;
}
function blockedCamp(s) {
  const c = campLocation(s);
  const cells = [
    ...[31, 32, 33, 34].flatMap((x) => [20, 21, 22].map((z) => ({ x, z: z - ROAD_SHIFT / 2 }))),
    { x: 30, z: 24 - ROAD_SHIFT / 2 },

  ];
  if (c) cells.push(...campCells(c));
  return cells;
}
// The lab reuses static obstacle queries between routes. No movement or need rules change.
const fastNavigationStates=new WeakSet(), navigationCaches=new WeakMap();
let activeNavigation=null;
export function enableFastNavigation(s){fastNavigationStates.add(s);}
function prepareNavigation(s){
  const campSignature=JSON.stringify([s.landSeed,s.worldSettings,s.camp,s.campSite]);
  let cache=navigationCaches.get(s);
  let same=cache?.campSignature===campSignature&&cache.projects.length===s.projects.length;
  if(same)for(let i=0;i<s.projects.length;i++){
    const p=s.projects[i],old=cache.projects[i],size=projectSiteSize(p);
    if(old.id!==p.id||old.key!==p.key||old.x!==p.x||old.z!==p.z||old.rotation!==p.rotation||old.felled!==p.felled||old.cultivated!==!!p.cultivation||old.complete!==(p.work>=PROJECTS[p.key].work)||old.w!==size[0]||old.d!==size[1]){same=false;break;}
  }
  if(!same){
    const obstacles=new Map();
    for(const p of s.projects){
      if(p.felled||p.key==='road'||(p.key==='bridge'&&p.work>=PROJECTS[p.key].work))continue;
      for(const rect of accessGeometry(p,PROJECTS[p.key],footprint(p)).solids){
        for(let x=Math.floor(rect.x-rect.w/2-BODY_RADIUS);x<=Math.floor(rect.x+rect.w/2+BODY_RADIUS);x++)
          for(let z=Math.floor(rect.z-rect.d/2-BODY_RADIUS);z<=Math.floor(rect.z+rect.d/2+BODY_RADIUS);z++){
            const key=`${x},${z}`;if(!obstacles.has(key))obstacles.set(key,[]);obstacles.get(key).push(rect);
          }
      }
    }
    cache={campSignature,projects:s.projects.map(p=>{const [w,d]=projectSiteSize(p);return {id:p.id,key:p.key,x:p.x,z:p.z,rotation:p.rotation,felled:p.felled,cultivated:!!p.cultivation,complete:p.work>=PROJECTS[p.key].work,w,d};}),state:s,cells:new Map(),terrain:new Map(),routes:new Map(),roads:new Map(),obstacles,camp:blockedCamp(s)};navigationCaches.set(s,cache);
  }
  return cache;
}
function invalidateNavigation(s){navigationCaches.delete(s);if(activeNavigation?.state===s)activeNavigation=null;}
function occupied(s,x,z){
  if(activeNavigation?.state!==s)return occupiedUncached(s,x,z);
  const key=`${x},${z}`,cache=activeNavigation.cells;
  if(!cache.has(key))cache.set(key,occupiedUncached(s,x,z));
  return cache.get(key);
}
function terrainBlocked(s,x,z,cache){
  const key=`${x},${z}`;
  if(cache?.terrain.has(key))return cache.terrain.get(key);
  const blocked=(riverBankAt(x,z,.5,s.landSeed)&&!crossingAt(s,x,z))||(cache?.camp||blockedCamp(s)).some(c=>c.x===x&&c.z===z);
  cache?.terrain.set(key,blocked);
  return blocked;
}
function occupiedUncached(s, x, z) {
  if(activeNavigation?.state===s)return terrainBlocked(s,x,z,activeNavigation) ||
    (activeNavigation.obstacles.get(`${Math.floor(x)},${Math.floor(z)}`)||[]).some(rect=>insideSolid({x,z},rect,BODY_RADIUS));
  return (
    (riverBankAt(x, z, 0.5, s.landSeed) && !crossingAt(s, x, z)) ||
    blockedCamp(s).some((c) => c.x === x && c.z === z) ||
    s.projects.some(
      (p) =>
        !(
          p.felled || p.key === "road" || (p.key === "bridge" && p.work >= PROJECTS[p.key].work)
        ) &&
        !(
          p.work >= PROJECTS[p.key].work &&
          (["shed", "rain-shelter"].includes(PROJECTS[p.key].kind) ||
            (COMMUNITY[PROJECTS[p.key].kind]?.sheltered &&
              shelteredFrontCell(p, x, z)))
        ) &&
        accessGeometry(p,PROJECTS[p.key],footprint(p)).solids.some(rect=>insideSolid({x,z},rect,BODY_RADIUS)),
    )
  );
}
// Test the whole swept body, not just waypoint cells. Expanded cell rectangles
// leave shoulders clear of tents, construction sites and the riverbank.
export function walkSegmentClear(s, from, to) {
  // Terrain and camp obstacles retain their cell geometry; buildings use physical solids.
  const minX=Math.floor(Math.min(from.x,to.x)-1),maxX=Math.ceil(Math.max(from.x,to.x)+1);
  const minZ=Math.floor(Math.min(from.z,to.z)-1),maxZ=Math.ceil(Math.max(from.z,to.z)+1);
  const cached=activeNavigation?.state===s?activeNavigation:null;
  const nearby=new Set();
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    if(cached)for(const rect of cached.obstacles.get(`${x},${z}`)||[])nearby.add(rect);
    if(terrainBlocked(s,x,z,cached)&&segmentHitsSolid(from,to,{x,z,w:1,d:1}))return false;
  }
  if(cached)return ![...nearby].some(rect=>segmentHitsSolid(from,to,rect));
  for(const p of s.projects){
    if(p.felled||p.key==='road'||(p.key==='bridge'&&p.work>=PROJECTS[p.key].work))continue;
    for(const rect of accessGeometry(p,PROJECTS[p.key],footprint(p)).solids){
      if(rect.x+rect.w/2<minX||rect.x-rect.w/2>maxX||rect.z+rect.d/2<minZ||rect.z-rect.d/2>maxZ)continue;
      if(segmentHitsSolid(from,to,rect))return false;
    }
  }
  return true;
}

function naturalPath(s, from, path) {
  const keepRoad =
    pathAt(s, from.x, from.z) && path.every((p) => pathAt(s, p.x, p.z));
  const roadClear = (a, b) => {
    if (!keepRoad) return true;
    const steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) * 3);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (!pathAt(s, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t))
        return false;
    }
    return true;
  };
  const direct = [from];
  for (let i = 0; i < path.length; ) {
    let far = path.length - 1;
    while (
      far > i &&
      (!walkSegmentClear(s, direct.at(-1), path[far]) ||
        !roadClear(direct.at(-1), path[far]))
    )
      far--;
    direct.push(path[far]);
    i = far + 1;
  }
  const curved = [from];
  for (let i = 1; i < direct.length - 1; i++) {
    const a = direct[i - 1],
      b = direct[i],
      c = direct[i + 1];
    const trim = Math.min(
      0.4,
      Math.hypot(b.x - a.x, b.z - a.z) / 3,
      Math.hypot(c.x - b.x, c.z - b.z) / 3,
    );
    const toward = (p) => {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      return {
        x: b.x + ((p.x - b.x) * trim) / d,
        z: b.z + ((p.z - b.z) * trim) / d,
      };
    };
    const entry = toward(a),
      exit = toward(c),
      bend = [entry];
    for (let j = 1; j <= 4; j++) {
      const t = j / 4,
        u = 1 - t;
      bend.push({
        x: u * u * entry.x + 2 * u * t * b.x + t * t * exit.x,
        z: u * u * entry.z + 2 * u * t * b.z + t * t * exit.z,
      });
    }
    const points = [curved.at(-1), ...bend, c];
    if (points.slice(1).every((p, j) => walkSegmentClear(s, points[j], p)))
      curved.push(...bend);
    else curved.push(b);
  }
  if (direct.length > 1) curved.push(direct.at(-1));
  return curved.slice(1);
}
// The grid finds a safe corridor; residents follow continuous shortcuts and bends.
export function route(s,from,to,reachOnly=false){
  if(!fastNavigationStates.has(s))return routeUncached(s,from,to,1,reachOnly)||routeUncached(s,from,to,.5,reachOnly);
  const previous=activeNavigation;activeNavigation=prepareNavigation(s);
  try{
    const cache=activeNavigation.routes,key=`${from.x},${from.z}:${to.x},${to.z}:${reachOnly}`;
    if(cache.has(key)){const result=cache.get(key);return result?.map(p=>({...p}))??null;}
    const result=routeUncached(s,from,to,1,reachOnly)||routeUncached(s,from,to,.5,reachOnly);
    // Walk queues consume their arrays, so cached paths must never be shared.
    cache.set(key,result?.map(p=>({...p}))??null);
    if(cache.size>512)cache.delete(cache.keys().next().value);
    return result;
  }finally{activeNavigation=previous;}
}
// Search from the destination only after a long forward search. This check
// ignores swept-body collisions, so exhausting its open cells proves that
// even a point-sized walker cannot reach the start from this pocket.
function isolatedDestination(s, start, end, step) {
  const queue = [end];
  const seen = new Set([`${end[0]},${end[1]}`]);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, nz = z + dz;
      // A resident can start inside an obstacle and step out of it.
      if (nx === start[0] && nz === start[1]) return false;
      if (nx < CELL_MIN + 1 || nx > CELL_MAX - 2 || nz < CELL_MIN + 1 || nz > CELL_MAX - 2) continue;
      const key = `${nx},${nz}`;
      if (seen.has(key) || occupied(s, nx, nz)) continue;
      seen.add(key);
      queue.push([nx, nz]);
      if (queue.length >= 64) return false;
    }
  }
  if (activeNavigation?.state === s) {
    // A rounded start on the boundary can step out of an obstacle into the pocket.
    const possibleStarts = new Set(seen);
    for (const [x, z] of queue) {
      possibleStarts.add(`${x + step},${z}`);
      possibleStarts.add(`${x - step},${z}`);
      possibleStarts.add(`${x},${z + step}`);
      possibleStarts.add(`${x},${z - step}`);
    }
    const pockets = activeNavigation.pockets ??= new Map();
    for (const cell of seen) pockets.set(`${step}:${cell}`, possibleStarts);
  }
  return true;
}
function routeUncached(s, from, to, step=1,reachOnly=false) {
  // Start outside an overlapping obstacle before rounding onto the path grid.
  // An endpoint-only escape can look valid yet move deeper into the obstacle
  // on its first tiny animation step, trapping a resident indefinitely.
  if(!walkSegmentClear(s,from,from)){
    const escapes=[];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      let prior=from;
      for(let distance=.1;distance<=6;distance+=.1){
        const point={x:from.x+dx*distance,z:from.z+dz*distance};
        if(!walkSegmentClear(s,prior,point))break;
        if(walkSegmentClear(s,point,point)){escapes.push(point);break;}
        prior=point;
      }
    }
    escapes.sort((a,b)=>Math.hypot(a.x-to.x,a.z-to.z)-Math.hypot(b.x-to.x,b.z-to.z));
    for(const point of escapes){const onward=routeUncached(s,point,to,step,reachOnly);if(onward)return [point,...onward];}
    return null;
  }
  // This river runs across the whole plot. Without a completed crossing,
  // searching thousands of cells on the opposite bank cannot find a route.
  const bank = point => Math.sign((point.x-32)*2 - riverCenter((point.z-32)*2,s.landSeed));
  if (bank(from) !== bank(to) && !s.projects.some(p=>p.key === "bridge" && p.work >= PROJECTS[p.key].work)) return null;
  const snap=n=>Math.round(n/step)*step;
  const start = [snap(from.x), snap(from.z)],
    end = [snap(to.x), snap(to.z)];
  if(occupied(s,...end)||!walkSegmentClear(s,to,to))return null;
  const key = (x, z) => `${x},${z}`;
  if (start[0] === end[0] && start[1] === end[1])
    return walkSegmentClear(s, from, to)
      ? Math.hypot(from.x - to.x, from.z - to.z) > 0.001
        ? [{ x: to.x, z: to.z }]
        : []
      : null;
  // A* cannot enter a blocked destination cell. Reject it before searching
  // the entire connected bank, especially for repeatedly checked work/need spots.
  if(occupied(s,end[0],end[1])||end[0]<CELL_MIN+1||end[0]>CELL_MAX-2||end[1]<CELL_MIN+1||end[1]>CELL_MAX-2)return null;
  if(reachOnly&&step===1&&activeNavigation?.state===s){
    // All placement targets share one flood from stores; stop as soon as this target is found.
    const origin=`${from.x},${from.z}`;
    activeNavigation.reach ??= new Map();
    let flood=activeNavigation.reach.get(origin);
    if(!flood){flood={queue:[start],head:0,seen:new Set([key(...start)])};activeNavigation.reach.set(origin,flood);}
    const goal=key(...end);
    while(!flood.seen.has(goal)&&flood.head<flood.queue.length){
      const [x,z]=flood.queue[flood.head++];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,nz=z+dz,k=key(nx,nz);
        if(nx<CELL_MIN+1||nx>CELL_MAX-2||nz<CELL_MIN+1||nz>CELL_MAX-2||flood.seen.has(k)||occupied(s,nx,nz))continue;
        if(x===start[0]&&z===start[1]&&!walkSegmentClear(s,from,{x:nx,z:nz}))continue;
        flood.seen.add(k);flood.queue.push([nx,nz]);
      }
    }
    return flood.seen.has(goal)&&walkSegmentClear(s,{x:end[0],z:end[1]},to)?[]:null;
  }
  if (activeNavigation?.state === s && activeNavigation.pockets) {
    const possibleStarts = activeNavigation.pockets.get(`${step}:${key(...end)}`);
    if (possibleStarts && !possibleStarts.has(key(...start))) return null;
  }
  const queue = new PathQueue(),
    parent = new Map([[key(...start), null]]),
    costs = new Map([[key(...start), 0]]);
  queue.push({ x: start[0], z: start[1], cost: 0, priority: 0 });
  let checkedDestination = false;
  while (queue.length) {
    if (!checkedDestination && costs.size >= 1024) {
      checkedDestination = true;
      if (isolatedDestination(s, start, end, step)) return null;
    }
    const { x, z, cost } = queue.pop();
    if (cost > costs.get(key(x, z))) continue;
    if (x === end[0] && z === end[1]) {
      if(reachOnly)return walkSegmentClear(s,{x,z},to)?[]:null;
      const path = [];
      let k = key(x, z);
      while (parent.get(k) !== null) {
        const [px, pz] = k.split(",").map(Number);
        path.unshift({ x: px, z: pz });
        k = parent.get(k);
      }
      if (path.length && (to.x !== end[0] || to.z !== end[1]))
        path.push({ x: to.x, z: to.z });
      if(path.length&&!walkSegmentClear(s,path.at(-2)||from,path.at(-1)))return null;
      const result = [];
      let anchor = from,
        chunk = [],
        onRoad = pathAt(s, from.x, from.z);
      for (const point of path) {
        const nextRoad = pathAt(s, point.x, point.z);
        if (nextRoad !== onRoad && chunk.length) {
          result.push(...naturalPath(s, anchor, chunk));
          anchor = chunk.at(-1);
          chunk = [];
        }
        chunk.push(point);
        onRoad = nextRoad;
      }
      result.push(...naturalPath(s, anchor, chunk));
      if(!result.every((point,index)=>walkSegmentClear(s,index?result[index-1]:from,point)))return null;
      return result;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx*step,
        nz = z + dz*step,
        k = key(nx, nz);
      if (
        nx < CELL_MIN + 1 ||
        nx > CELL_MAX - 2 ||
        nz < CELL_MIN + 1 ||
        nz > CELL_MAX - 2 ||
        occupied(s, nx, nz) || (step<1&&!walkSegmentClear(s,{x,z},{x:nx,z:nz})) ||
        (x===start[0]&&z===start[1]&&!walkSegmentClear(s,from,{x:nx,z:nz}))
      )
        continue;
      // Walkers favour made roads, then tracks others have already worn.
      const nextCost = cost + step*(roadAt(s, nx, nz) ? 0.65 : trodden(s, nx, nz) ? 0.8 : 1);
      if (nextCost >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k, nextCost);
      parent.set(k, key(x, z));
      queue.push({
        x: nx,
        z: nz,
        cost: nextCost,
        priority:
          nextCost + 0.65 * (Math.abs(nx - end[0]) + Math.abs(nz - end[1])),
      });
    }
  }
  return null;
}
function go(s, r, target) {
  if (Math.hypot(r.x - target.x, r.z - target.z) < 0.01) {
    r.target = null;
    r.walk = [];
    return true;
  }
  if (!r.target || r.target.x !== target.x || r.target.z !== target.z) {
    r.target = target;
    r.walk = route(s, r, target) || [];
  }
  if (!r.walk.length) {
    r.target = null;
    const reached=Math.hypot(r.x-target.x,r.z-target.z)<.05;
    if(!reached){r.action="blocked";const op=s.operations?.find(o=>o.id===r.operation&&!o.done);if(op)op.status="No reachable route to the work destination";}
    return reached;
  }
  return false;
}
// Carrying the camp over from the cars: one load per walk, set down on the
// apron in front of the tents. The store of building supplies stays where the
// cars unloaded it.
function unpackStep(s, r, dt) {
  const u = s.unpack;
  if (!u) { if (r.unpack) delete r.unpack; return false; }
  if (r.unpack && u.delivered.includes(r.unpack.load)) delete r.unpack;
  if (!r.unpack) {
    if (r.energy < 25 || r.cargo || r.operation || r.outsideWork) return false;
    const held = s.people.filter((p) => p.unpack && !p.sleepUntil && !p.tentPhase && p.action !== "rest").map((p) => p.unpack.load);
    const load = CAMP_LOADS.findIndex((_, k) => !u.delivered.includes(k) && !held.includes(k));
    if (load < 0) return false;
    for (const other of s.people) if (other.unpack?.load === load) delete other.unpack;
    r.unpack = { load, phase: "fetch", wait: 0 };
    r.job = null; r.workSpot = null; r.supplyGoal = null;
    clearDowntime(r);
  }
  const job = r.unpack, carrying = job.phase === "carry";
  const door = carDoor(CAMP_LOADS[job.load].car);
  const target = carrying
    ? campDropSpot(campLocation(s), job.load)
    : { x: door.x, z: door.z + ((job.load >> 1) % 3) * 0.6 };
  r.action = "unpack";
  const arrived = go(s, r, target);
  if (!arrived && r.walk.length) return true;
  // A boxed-in spot must not stall the whole camp: hand the load on instead.
  r.action = "unpack";
  job.wait += dt;
  if (arrived && job.wait < (carrying ? 0.8 : 1.2)) return true;
  if (!carrying) { r.unpack = { load: job.load, phase: "carry", wait: 0 }; return true; }
  u.delivered.push(job.load);
  delete r.unpack;
  r.action = "idle";
  if (CAMP_LOADS[job.load].id === "tent-a") say(s, `${r.name} sets down the first tent and it goes up.`);
  if (u.delivered.length >= CAMP_LOADS.length) {
    delete s.unpack;
    say(s, "The camp is unpacked: two tents, bedrolls, the cooler, water, a camp kitchen and chairs.");
  }
  return true;
}
const restingPlaces = new WeakMap(),campRestEntrances=new WeakMap();
export function tentDoor(s, i) {
  return campDoor(campLocation(s), i);
}
export function restingDoor(s, i) {
  const r = s.people[i];
  const p = s.projects.find((p) => p.id === r.restSite);
  if (!p) return campRestEntrances.get(r)||tentDoor(s,i);
  return buildingFront(p);
}
export function availableHomes(s) {
  return s.projects.filter(p => !p.removal && PROJECTS[p.key]?.kind === 'home' && p.work >= PROJECTS[p.key].work);
}
export function homeResidents(s, id) {
  return s.people.filter(r => r.home === id);
}
export function assignHome(s, residentId, homeId) {
  const r = s.people.find(r => r.id === residentId);
  if (!r || s.stage !== 'playing') return 'Cannot assign a home now.';
  if (homeId != null) {
    const home = availableHomes(s).find(p => p.id === homeId);
    if (!home) return 'Choose a completed home.';
    if (s.infrastructure?.nodes[homeId]?.enabled === false) return 'Reopen this home before assigning residents.';
    if (homeResidents(s, homeId).filter(other => other !== r).length >= (PROJECTS[home.key].beds || 2)) return 'This home has no free beds.';
  }
  r.home = homeId ?? null;
  return '';
}
function restoreHomeAssignments(s) {
  const counts = new Map(), homes = new Map(availableHomes(s).map(p => [p.id, p]));
  for (const r of s.people) {
    const home = homes.get(r.home), count = counts.get(r.home) || 0;
    if (!home || count >= (PROJECTS[home.key].beds || 2)) r.home = null;
    else counts.set(r.home, count + 1);
  }
}
function recoveryEnergy(s, r, constructionPending) {
  // A short construction nap must leave an outside worker rested enough to
  // accept the next shift (which requires 65 energy).
  if (r.outsideJobEnabled || r.dayShiftBooked || !constructionPending) return 80;
  return s.projects.some(p => p.work < PROJECTS[p.key].work) ? 60 : 80;
}
function chooseRestingPlace(s, r, i) {
  if (r.restSite && s.projects.some((p) => p.id === r.restSite&&!p.removal)) return;
  r.restSite=null;
  const choices = s.projects.filter(
    (p) =>
      !p.removal && p.work >= PROJECTS[p.key].work &&
      (PROJECTS[p.key].kind === "home" || p.key.startsWith("canvas-tent")) &&
      s.infrastructure.nodes[p.id]?.enabled !== false &&
      s.people.filter((other) => other !== r && (other.restSite === p.id || other.home === p.id))
        .length < (PROJECTS[p.key].beds || 2),
  );
  choices.sort(
    (a, b) =>
      (b.id === r.home) - (a.id === r.home) ||
      (PROJECTS[b.key].kind === "home") - (PROJECTS[a.key].kind === "home") ||
      Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z),
  );
  for (const p of choices) {
    r.restSite = p.id;
    if (route(s, r, restingDoor(s, i))) return;
  }
  r.restSite = null;
    const front=tentDoor(s,i);if(route(s,r,front)){campRestEntrances.set(r,front);return;}
    // Older layouts could block the camp doors. Try another edge of the same
    // tents, rather than leaving exhausted residents stuck in a walking loop.
    const c=campLocation(s),edges=campEdges(c);
    edges.sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z));
    campRestEntrances.set(r,edges.find(edge=>route(s,r,edge))||front);
}
function restSpot(s, i) {
  const layout = JSON.stringify([
    s.camp, s.campSite,
    s.projects.map((p) => [p.id, p.x, p.z, finished(s, p.key)]),
  ]);
  let cache = restingPlaces.get(s);
  if (!cache || cache.layout !== layout) {
    cache = { layout, spots: [] };
    restingPlaces.set(s, cache);
  }
  if (cache.spots[i]) return cache.spots[i];
  const c = campLocation(s);
  const p = s.projects.find(
    (p) => PROJECTS[p.key].kind === "square" && p.work >= PROJECTS[p.key].work,
  );
  const origin = p || c;
  const offsets = [
    [-1, 0],
    [-1, 1],
    [2, 0],
    [2, 1],
    [0, 2],
    [-2, 2],
    [2, 2],
    [-2, 0],
    [0, 3],
  ];
  for (let j = 0; j < offsets.length; j++) {
    const [x, z] = offsets[(i + j) % offsets.length],
      target = p ? { x: origin.x + x, z: origin.z + z } : campPoint(c, x, z);
    if (
      !occupied(s, target.x, target.z) &&
      !cache.spots.some(
        (spot) => spot && spot.x === target.x && spot.z === target.z,
      ) &&
      route(s, s.people[i], target)
    ) {
      cache.spots[i] = target;
      return target;
    }
  }
  return { x: 31, z: 24 };
}
function supplySpot(s, r, i) {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, 1],
    [1, 1],
    [-2, 0],
    [2, 0],
  ];
  for (let n = 0; n < offsets.length; n++) {
    const [dx, dz] = offsets[(n + i) % offsets.length],
      goal = { x: s.stock.x + dx, z: s.stock.z + dz };
    if (
      occupied(s, goal.x, goal.z) ||
      s.people.some(
        (other) =>
          other !== r && !atTownJob(other) &&
          ((other.target &&
            other.target.x === goal.x &&
            other.target.z === goal.z) ||
            Math.hypot(other.x - goal.x, other.z - goal.z) < 0.6),
      )
    )
      continue;
    if (route(s, r, goal)) return goal;
  }
  return { x: s.stock.x - 2, z: s.stock.z + 1 };
}
function workSpot(s, r, p) {
  const reserved = s.people
    .filter((other) => other !== r && other.job === p.id && other.workSpot)
    .map((other) => other.workSpot);
  const [w, d] = footprint(p);
  const offsets = [];
  for (let z = 0; z < d; z++) {
    offsets.push([-1, z], [w, z]);
  }
  for (let x = 0; x < w; x++) {
    offsets.push([x, d], [x, -1]);
  }
  return offsets
    .map(([x, z]) => ({ x: p.x + x, z: p.z + z }))
    .sort((a,b) => Math.hypot(a.x-r.x,a.z-r.z) - Math.hypot(b.x-r.x,b.z-r.z))
    .find(
      (spot) =>
        !occupied(s, spot.x, spot.z) &&
        !s.people.some(
          (other) =>
            other !== r &&
            !other.tentPhase && !atTownJob(other) &&
            (Math.hypot(other.x - spot.x, other.z - spot.z) < 0.55 ||
              (other.target?.x === spot.x && other.target?.z === spot.z)),
        ) &&
        !reserved.some((other) => other.x === spot.x && other.z === spot.z) &&
        route(s, r, spot),
    );
}
function leisureSpot(s,r,p) {
  const kind=PROJECTS[p.key].kind;
  if(!['shed','rain-shelter'].includes(kind) && !COMMUNITY[kind]?.sheltered)return workSpot(s,r,p);
  const [w,d]=footprint(p);
  return Array.from({length:w*d},(_,i)=>({x:p.x+i%w,z:p.z+Math.floor(i/w)}))
    .filter(spot=>shelteredFrontCell(p,spot.x,spot.z))
    // Leave a body-width margin beneath the roof rather than stopping at its drip edge.
    .map(spot=>({x:Math.max(p.x+Math.min(.2,(w-1)/2),Math.min(p.x+w-1-Math.min(.2,(w-1)/2),spot.x)),
      z:Math.max(p.z+Math.min(.2,(d-1)/2),Math.min(p.z+d-1-Math.min(.2,(d-1)/2),spot.z))}))
    .sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z))
    .find(spot=>!s.people.some(other=>other!==r && !atTownJob(other) && (
      (!other.tentPhase && Math.hypot(other.x-spot.x,other.z-spot.z)<.7) ||
      (other.downtime && Math.hypot(other.downtime.target.x-spot.x,other.downtime.target.z-spot.z)<.8)
    )) && route(s,r,spot));
}
function availableProject(s, r) {
  return s.projects.filter(p=>!p.removal && !p.pendingMaterials && p.work<PROJECTS[p.key].work)
    .sort((a,b)=>Number(!!b.prioritized)-Number(!!a.prioritized)||workPreference(r,b.key)-workPreference(r,a.key)).find(
    (p) =>
      s.people.filter(other => other !== r && other.job === p.id).length < crewLimit(PROJECTS[p.key]) && workSpot(s, r, p),
  );
}
export function canFinish(s) {
  if (s.mode === "sandbox") return false;
  if (s.opening && !s.opening.complete)
    return openingProgress(s, PROJECTS).ready;
  return (
    finished(s, "gathering") &&
    s.projects.some((p) => p.key !== "gathering" && finished(s, p.key)) &&
    !s.trip &&
    (!s.rainSeen || s.rainResolved)
  );
}
export function endWeekend(s) {
  if (!canFinish(s) || s.stage !== "playing") return false;
  if (s.opening) s.opening.complete = true;
  s.stage = "evening";
  s.meal = true;
  for (const r of s.people) {
    r.job = null;
    r.target = null;
    r.walk = [];
    r.cargo = false;
  }
  say(s, "Tools down. Our first meal on our own land.");
  return true;
}
export function tick(s,dt){
  // Nobody has set foot on the land until the arrival is over.
  const before=s.stage==='arrival'||s.arrivalAnimating?null:footfallBefore(s);
  try { return tickWithNavigation(s,dt); } finally { releaseEquipment(s); if(before&&dt>0)recordFootfall(s,before,dt); }
}
function tickWithNavigation(s,dt){
  if(!fastNavigationStates.has(s))return tickUncached(s,dt);
  const previous=activeNavigation;activeNavigation=prepareNavigation(s);
  try{return tickUncached(s,dt);}finally{activeNavigation=previous;}
}
function tickUncached(s, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if(s.arrivalAnimating){
    s.arrivalElapsed=Math.min(ARRIVAL_DURATION,s.arrivalElapsed+Math.min(dt,1));
    if(s.arrivalElapsed>=ARRIVAL_DURATION)s.arrivalAnimating=false;
    return;
  }
  if (s.stage === "arrival") {
    s.arrivalElapsed = ARRIVAL_DURATION;
    return;
  }
  dt = Math.min(dt, 1);
  ensureNaturalLand(s,PROJECTS);
  ensureFinances(s);
  if (s.mode === "sandbox") sandboxSupplies(s);
  s.time += dt;
  weatherStep(s,dt);
  const sys = autoConnectUtilities(s, PROJECTS);
  // Upkeep can reduce battery capacity and service quality before power is allocated.
  const herds=s.projects.filter(p=>p.animalCare).map(p=>[p,p.animalHealth??100]);
  upkeepStep(s, PROJECTS, dt, project => syncProjectNode(sys, project, PROJECTS));
  // Animals going without feed or water are easy to miss; say so as it happens.
  for(const [p,before] of herds){
    const now=p.animalHealth??100;
    if(before>=50&&now<50)say(s,`${projectLabel(p,PROJECTS)}: the animals are going hungry. They need fodder and drinking water every day.`);
    else if(before>0&&now<=0)say(s,`${projectLabel(p,PROJECTS)}: the animals are starving and have stopped producing.`);
  }
  infrastructureStep(s, PROJECTS, dt, sys);
  biologicalStep(s,dt,useWater);
  cultivationStep(s,dt,useWater,PROJECTS);
  for(const p of s.projects){
    const beds=p.cultivation?.beds;
    if(!beds)continue;
    const warning=beds.some(b=>b.stage==='failed')?'failed':beds.some(b=>harvestExpired(b,s.time))?'expired':beds.some(b=>['growing','harvestable'].includes(b.stage)&&(b.droughtDamage||0)>0)?'damaged':beds.some(b=>['growing','harvestable'].includes(b.stage)&&b.moisture<.2)?'wilting':'healthy';
    if(warning!==p.cropWarning){
      if(warning!=='healthy')say(s,`${projectLabel(p,PROJECTS)}: crops ${warning}. ${warning==='failed'?'Clear failed beds before replanting.':warning==='expired'?'The harvest window has closed. Clear expired crops before replanting.':'Restore irrigation; earlier damage cannot be reversed.'}`,`crop-condition-${p.id}-${warning}`);
      p.cropWarning=warning;
    }
  }
  coolStoredFood(s,dt);
  const spoiledBefore={...s.foodStorage?.spoiled};
  foodStorageStep(s,PROCESSES,MATERIALS);
  for(const [id,n] of Object.entries(s.foodStorage?.spoiled||{})){
    const lost=n-(spoiledBefore[id]||0);
    if(lost>0)say(s,`${materialText(id,lost)} spoiled before it could be used.`);
  }
  if (s.delivery || s.truckLeaving) {
    const freight = s.delivery || {};
    deliveryStep(s, dt, MATERIALS, changeMaterial, storedMaterials(s), storageCapacity(s));
    if (!s.delivery && freight.shipments) say(s, "The supplier truck unloaded the ordered building materials.");
  }
  if(s.time>=(s.nextAutomaticSale||0)){automaticSales(s);sellFoodSurplus(s);s.nextAutomaticSale=s.time+1;}
  arrangePlantingSeeds(s);
  const checkSupplies = s.time >= (s.nextFoodCheck || 0);
  if (checkSupplies) scheduleFarmWork(s);
  maintainFood(s);
  if (checkSupplies) restockUpkeep(s);
  maintainWater(s);
  manageKitchens(s,PROJECTS,PROCESSES,{blocker:productionBlocker,queue:queueProduction,stored:storedMaterials,capacity:storageCapacity});
  if (checkSupplies) startAutonomousWork(s,PROCESSES,PROJECTS,autonomyApi);
  for (const [i,r] of s.people.entries()) {
    if(atTownJob(r))continue;
    decayNeeds(s,r,i,dt);
    noticeAspiration(s,r,PROJECTS);
    // Being awake is tiring even when no construction is underway.
    if(r.tentPhase !== 'inside') r.energy=Math.max(0,r.energy-dt*.035);
    const hours=9+s.time*.45/60, hour=hours%24, bedtime=profileFor(r).temperament.bedtime;
    const sleepNight=Math.floor((hours-5)/24);
    if(!r.sleepUntil && !r.needTask && Math.min(r.needs.bladder,r.needs.bowels,r.needs.hydration)>20 && (r.needs.hunger>20 || !(foodPortions(s))) && r.sleepNight!==sleepNight && (hour>=bedtime || hour<5) && !r.cargo && r.action!=='town' && !r.outsideWork) {
      r.sleepNight=sleepNight;
      r.sleepUntil=s.time+(7.5+1.5*(1-r.energy/100))*60/.45;
      r.job=null;r.operation=null;r.walk=[];r.target=null;r.action='rest';
      cancelNeed(s,r);
    }
  }
  s.infrastructure.hungry = s.people.some(r=>r.needs.hunger<15);
  const needApi = {
    route: (r,point)=>route(s,r,point),
    go: (r,point)=>go(s,r,point),
    serviceSpot: (node,r)=>utilitySpot(s,node,r),
    camp: ()=>campLocation(s)||s.stock,
    river: (r)=>nearestRiverAccess(s,r),
    groundSpot: (r,center,index,privateBreak=false)=>{
      const radius=privateBreak?6:1;
      for(let ring=radius;ring<=radius+2;ring++)for(let j=0;j<12;j++) {
        const angle=(j+index)*Math.PI/6;
        const point={x:Math.round(center.x+Math.cos(angle)*ring),z:Math.round(center.z+Math.sin(angle)*ring)};
        if(point.x<CELL_MIN+2 || point.x>CELL_MAX-2 || point.z<CELL_MIN+2 || point.z>CELL_MAX-2 || occupied(s,point.x,point.z))continue;
        if(privateBreak && (riverBankAt(point.x,point.z,5,s.landSeed) || Math.hypot(point.x-s.stock.x,point.z-s.stock.z)<5))continue;
        if(s.people.some(p=>p!==r && !atTownJob(p) && ((p.needTask && Math.hypot(p.needTask.target.x-point.x,p.needTask.target.z-point.z)<.8) || Math.hypot(p.x-point.x,p.z-point.z)<.7)))continue;
        if(route(s,r,point))return point;
      }
      return null;
    },
  };
  dispatchBlueprintPickup(s);
  for(const trip of activeTrips(s))if(trip.phase==='boarding')loadExports(s,trip);
  if(activeTrips(s).length<2 && pendingExports(s).some(o=>!o.holdForPickup) && dispatchReady(s,true) && s.time>=(s.trade?.dispatchAt||0)) supplyRun(s,pendingExports(s)[0].material,null,true);
  for (const trip of activeTrips(s)) {
    const r = s.people.find((r) => r.id === trip.person);
    if (trip.phase === "boarding" || trip.phase === "unloading") {
      const target =
        trip.phase === "boarding"
          ? carDoor(trip.vehicle)
          : { x: s.stock.x, z: s.stock.z };
      r.target = target;
      if (!r.walk.length) r.walk = route(s, r, target) || [];
      const next = r.walk[0];
      if (next) {
        const distance = Math.hypot(next.x - r.x, next.z - r.z);
        r.moveSpeed = Math.min(0.95, (r.moveSpeed || 0) + dt * 1.8);
        const step = Math.min(distance, dt * r.moveSpeed);
        const candidate = {
          x: r.x + (distance ? ((next.x - r.x) / distance) * step : 0),
          z: r.z + (distance ? ((next.z - r.z) / distance) * step : 0),
        };
        if (walkSegmentClear(s, r, candidate)) {
          r.x = candidate.x;
          r.z = candidate.z;
          if (distance <= step + 0.001) r.walk.shift();
        } else r.walk = [];
      }
      if (Math.hypot(r.x - target.x, r.z - target.z) < 0.025) {
        r.walk = [];
        r.target = null;
        r.moveSpeed = 0;
        if (trip.phase === "boarding") {
          if(trip.boardingFare!==undefined){
            recordVehicleDistance(s,trip.vehicle,tripEstimate(s.worldSettings?.town).km);
            if(s.opening)s.opening.townTrips++;
            delete trip.boardingFare;
          }
          trip.phase="outbound";
        }
        else {
          const id = trip.material,
            item = MATERIALS[id];
          const project = s.projects.find(p => p.id === trip.project);
          const orders = trip.projects || [trip.project];
          if(trip.shipments) receiveBlueprintShipment(s,trip);
          else if (project) for (const p of s.projects.filter(p=>orders.includes(p.id))) delete p.pendingMaterials;
          else if(!trip.saleOnly && storedMaterials(s)+(trip.foodLots?.reduce((n,l)=>n+l.n,0)??item.quantity)>storageCapacity(s))continue;
          else if (!trip.saleOnly) changeMaterial(s,id,trip.foodSpoiled?trip.foodLots.reduce((n,l)=>n+l.n,0):item.quantity,trip.foodLots);
          returnUnsoldFood(s,trip);
          r.action = "idle";
          r.cargo = false;
          if(s.trip===trip)s.trip=null;else s.secondTrip=null;
          say(
            s,
            trip.foodSpoiled ? `${r.name} returned; the purchased food spoiled during the trip.` : trip.saleOnly ? `${r.name} returned from selling the village surplus.` : project ? `${r.name} unloaded reserved materials for ${orders.length === 1 ? PROJECTS[project.key].name : `${orders.length} projects`}. Any remaining materials will follow on another trip.` : `${r.name} unloaded ${item.quantity} ${item.name} from the car.`,
          );
        }
      }
    } else {
      trip.left = Math.max(0, trip.left - dt);
      trip.phase =
        trip.left > (trip.duration||TRIP_DURATION) - DRIVE_DURATION
          ? "outbound"
          : trip.left > DRIVE_DURATION
            ? "away"
            : trip.left > 0
              ? "inbound"
              : "unloading";
      if (["inbound","unloading"].includes(trip.phase)) settleExports(s,trip,transact);
      if (trip.phase === "unloading") {
        Object.assign(r, carDoor(trip.vehicle));
        r.walk = [];
        r.target = null;
        r.cargo = true;
      }
    }
  }
  if(!s.trip&&s.secondTrip){s.trip=s.secondTrip;s.secondTrip=null;}
  // Residents can finish orders during this pass. Skip absent categories and recheck live orders before assigning them.
  const removalsPending = s.projects.some(p => p.removal);
  const constructionPending = removalsPending || s.projects.some(p => p.work < PROJECTS[p.key].work);
  const operationsPending = s.operations?.some(o => !o.done);
  const animalCarePending = s.upkeep?.jobs.some(job => job.care && !job.done);
  const farmJobsPending = operationsPending && s.operations.some(op => !op.done && !op.waitingSeeds && op.phase !== 'growing' && isFarmWork(s,op));
  for (const [i, r] of s.people.entries()) {
    if(downtimeInvalid(s,r,PROJECTS)){clearDowntime(r);r.walk=[];r.target=null;}
    if(r.downtime && (r.job!=null || r.operation!=null || r.linkJob!=null || r.needTask || r.cargo || r.tentPhase || r.sleepUntil || r.outsideWork || r.action==='town'))clearDowntime(r);
    if (r.action === "town") continue;
    if(atTownJob(r)){outsideWorkStep(s,r,dt,go,say);continue;}
    const canDrink=r.needs.hydration<10&&Object.values(s.infrastructure.nodes).some(n=>{
      if(!n.enabled||n.water[0]<.5||['coop','goat_pasture'].includes(n.kind))return false;
      const spot=utilitySpot(s,n,r);return spot&&route(s,r,spot);
    });
    const urgent=Math.min(r.needs.bladder,r.needs.bowels)<10 || canDrink || (r.needs.hunger<15 && foodPortions(s)>=1);
    if((r.sleepUntil || r.tentPhase==='inside') && urgent) {
      if(r.sleepUntil)r.resumeSleepUntil=r.sleepUntil;
      r.sleepUntil=null;
      if(r.tentPhase){r.tentPhase='exit';r.tentAt=s.time;}
      else {r.action='idle';r.walk=[];r.target=null;}
    }
    if(r.resumeSleepUntil && !r.needTask && !r.tentPhase && !r.cargo && !urgent && Math.min(r.needs.bladder,r.needs.bowels,r.needs.hydration)>30 && (r.needs.hunger>30 || foodPortions(s)<1)) {
      if(r.resumeSleepUntil>s.time){r.sleepUntil=r.resumeSleepUntil;r.action='rest';r.walk=[];r.target=null;}
      r.resumeSleepUntil=null;
    }
    if (!r.sleepUntil) chooseNeed(s,r,i,needApi);
    if (r.tentPhase) {
      r.action = "rest";
      if (r.tentPhase === "enter" && s.time - r.tentAt >= 1.5)
        r.tentPhase = "inside";
      if (r.tentPhase === "inside") {
        r.energy = Math.min(100, r.energy + dt * (r.sleepUntil ? .13 : .45));
        const recovered = recoveryEnergy(s, r, constructionPending);
        if ((r.sleepUntil ? s.time >= r.sleepUntil : r.energy >= recovered) || s.stage === "evening") {
          r.sleepUntil=null;
          r.tentPhase = "exit";
          r.tentAt = s.time;
        }
      }
      if (r.tentPhase === "exit" && s.time - r.tentAt >= 1.5) {
        r.tentPhase = null;
        r.restSite = null;
        r.action = "idle";
      }
      continue;
    }
    // Leisure is interruptible: a newly available task beats finishing a stroll.
    if (
      s.stage === "playing" &&
      !r.job &&
      r.operation == null &&
      r.linkJob == null &&
      !r.needTask &&
      r.energy >= 25 &&
      [
        "idle",
        "relax",
        "look",
        "stretch",
        "chat",
        "stroll",
        "breathe",
      ].includes(r.action) &&
      constructionPending && availableProject(s, r)
    ) {
      r.walk = [];
      r.target = null;
      clearDowntime(r);
    }
    if (r.energy < 25 && r.job && !r.cargo && !r.needTask) {
      r.walk=[]; r.target=null; r.job=null; r.supplyGoal=null;
    }
    if (r.dayShiftBooked) startOutsideWork(s,r,route);
    if (r.walk.length) {
      const next = r.walk[0],
        dx = next.x - r.x,
        dz = next.z - r.z,
        d = Math.hypot(dx, dz),
        desiredSpeed =
          (r.cargo ? 0.72 : 0.95) *
          (r.cargo && s.equipment?.loans[r.id]?.item === "bucket" ? useEquipment(s,r,"bucket",s.equipment.loans[r.id].task,dt) : 1) *
          (0.92 + i * 0.035) *
          (r.energy < 35 ? 0.8 : 1),
        braking = r.walk.length === 1 ? Math.max(0.25, Math.min(1, d * 2)) : 1;
      r.moveSpeed = Math.min(
        desiredSpeed * braking,
        (r.moveSpeed || 0) + dt * 1.8,
      );
      const nearby = s.people.filter(
        (other) =>
          other !== r &&
          other.action !== "town" && !atTownJob(other) &&
          Math.hypot(other.x - r.x, other.z - r.z) < 0.75,
      );
      const step = dt * r.moveSpeed * (nearby.length ? 0.65 : 1);
      const travel = Math.min(step, d);
      const candidate = {
        x: r.x + (d ? (dx / d) * travel : 0),
        z: r.z + (d ? (dz / d) * travel : 0),
      };
      // A step that reaches the waypoint lands on it; sidestepping there orbits forever at large steps.
      if (d > 0.1 && travel < d && nearby.length) {
        const sidestep = {
          x: candidate.x + (dz / d) * dt * 0.18,
          z: candidate.z - (dx / d) * dt * 0.18,
        };
        if (
          walkSegmentClear(s, r, sidestep) &&
          walkSegmentClear(s, sidestep, next)
        ) {
          candidate.x = sidestep.x;
          candidate.z = sidestep.z;
        }
      }
      if (walkSegmentClear(s, r, candidate)) {
        r.x = candidate.x;
        r.z = candidate.z;
        if (Math.hypot(r.x - next.x, r.z - next.z) < 0.015) r.walk.shift();
      } else {
        r.walk = route(s, r, r.target || next) || [];
      }
      r.energy = Math.max(0, r.energy - dt * 0.025);
      continue;
    }
    r.moveSpeed = 0;
    if (r.outsideWork) {
      if (!advanceNeed(s,r,dt,needApi)) outsideWorkStep(s,r,dt,go,say);
      continue;
    }
    if (s.stage === "evening") {
      r.action = "meal";
      go(s, r, restSpot(s, i));
      continue;
    }
    if (advanceNeed(s,r,dt,needApi)) continue;
    if (
      !r.cargo && (r.sleepUntil || r.energy < 25 ||
      (r.action === "rest" &&
        r.energy <
          recoveryEnergy(s, r, constructionPending)))
    ) {
      r.action = "rest";
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      chooseRestingPlace(s, r, i);
      if (go(s, r, restingDoor(s, i))) {
        r.tentPhase = "enter";
        r.tentAt = s.time;
        r.walk = [];
        r.target = null;
      }
      continue;
    }
    if (s.unpack && unpackStep(s, r, dt)) continue;
    if (
      r.operation &&
      s.operations?.some(
        (o) =>
          o.id === r.operation &&
          !o.done &&
          (o.phase === "return" || (o.water && o.phase === "deliver")),
      )
    ) {
      if (operationalWork(s, r, i, dt)) continue;
    }
    if (!r.cargo && !r.operation && !r.outsideWork && !r.removalJob && r.action !== 'service') {
      if (animalCarePending && performUpkeep(s,r,dt,go,changeMaterial,MATERIALS,carDoor,useWater,workSpot,true)) continue;
      if (farmJobsPending && operationalWork(s,r,i,dt,false,'farm')) continue;
    }
    // Finish an assigned batch before reconsidering work categories. Otherwise
    // changing availability can shuffle the reserved slots on every tick.
    if (removalsPending && r.energy >= 25 && removalStep(s,r,dt,{defs:PROJECTS,recipes:PROCESSES,workSpot,go,stored:storedMaterials,capacity:storageCapacity,change:changeMaterial,invalidate:invalidateNavigation,say,placement:placementError,grade:gradeFoundation})) continue;
    if (r.outsideJobEnabled && !r.dayShiftBooked && startOutsideWork(s,r,route)) {
      outsideWorkStep(s,r,dt,go,say);
      continue;
    }
    if(r.energy>=25&&performUpkeep(s,r,dt,go,changeMaterial,MATERIALS,carDoor,useWater,workSpot))continue;
    const activeOperation = operationsPending && s.operations.find(o => o.id === r.operation && !o.done);
    if(activeOperation && !r.job && operationalWork(s,r,i,dt,false,workGroup(activeOperation,PROCESSES))) continue;
    // Needs and completed carrying trips always win. Reserve available people,
    // not fixed residents who might be asleep, for essential and income work.
    const priorities = economyPolicies(s).work;
    if (operationsPending) {
      const ready = s.people.filter(a => a.energy >= 25 && !a.tentPhase && !a.sleepUntil && !a.needTask && !a.cargo && a.action !== 'town' && !a.outsideWork);
      const slot = ready.indexOf(r);
      const essentialSlots = priorities.essentialWorkers ?? 1;
      const essential = slot >= 0 && slot < essentialSlots;
      const producer = slot >= 0 && slot >= essentialSlots && slot < essentialSlots + (priorities.productionWorkers ?? 1);
      const groups = ['food', 'maintenance', 'production'].sort((a,b) => (priorities[b] ?? 2) - (priorities[a] ?? 2));
      let serviced = false;
      for (const group of groups) {
        const urgent = group === 'food' && (s.infrastructure.hungry || s.infrastructure.thirst);
        const reserved = group === 'production' ? producer : essential;
        if (!r.cargo && (urgent || reserved || (priorities[group] ?? 2) > (priorities.construction ?? 2)) && operationalWork(s, r, i, dt, false, group)) {
          serviced = true;
          break;
        }
      }
      if (serviced) continue;
    }
    let p = r.job != null && s.projects.find(
      (p) => !p.removal && p.id === r.job && !p.pendingMaterials && p.work < PROJECTS[p.key].work,
    );
    if (!p) {
      r.job = null;
      r.workSpot = null;
      r.cargo = false;
      p = constructionPending && availableProject(s, r);
      if (p) {
        r.operation=null;
        r.workSpot = workSpot(s, r, p);
        r.job = p.id;
        clearDowntime(r);
        r.lookAt = null;
        r.supplyGoal = null;
        r.target = null;
      }
    }
    if (!p) {
      if (operationalWork(s, r, i, dt)) continue;
      idleActivity(s, r, i, dt, {
        ...needApi,catalog:PROJECTS,
        projectSpot:(p,resident)=>leisureSpot(s,resident,p),
        center:p=>({x:p.x+(footprint(p)[0]-1)/2,z:p.z+(footprint(p)[1]-1)/2}),
        sheltered:kind=>['shed','rain-shelter'].includes(kind)||!!COMMUNITY[kind]?.sheltered,
      });
      // Leisure restores fun and social needs; it does not substitute for sleep.
      continue;
    }
    if (!r.workSpot || occupied(s, r.workSpot.x, r.workSpot.z))
      r.workSpot = workSpot(s, r, p);
    if (!r.workSpot) {
      r.job = null;
      continue;
    }
    const dest = r.workSpot;
    const loads = requiredLoads(p);
    // Reserved supplies begin at the receiving stockpile. Storage only helps
    // after a resident physically stages a larger batch there.
    const transit = s.people.filter(other => other.job === p.id && other.cargo);
    const inTransit = transit.reduce((n,other) => n + carriedLoads(other), 0);
    const remaining = Math.max(0, loads - p.delivered - (p.staged || 0) - inTransit);
    let depot = s.projects.find(other => other.id === p.depot && other.work >= PROJECTS[other.key].work);
    if (!depot && !(p.staged > 0)) {
      depot = s.projects.filter(other => other.id !== p.id && STORAGE_KINDS.includes(PROJECTS[other.key].kind) && other.work >= PROJECTS[other.key].work &&
        Math.hypot(other.x-p.x,other.z-p.z) < 8 &&
        Math.hypot(other.x-s.stock.x,other.z-s.stock.z)+Math.hypot(other.x-p.x,other.z-p.z) < Math.hypot(p.x-s.stock.x,p.z-s.stock.z)*1.35)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))
        .find(other=>workSpot(s,r,other));
      p.depot = depot?.id;
    }
    if (!r.cargo && p.delivered < loads) {
      const staged = (p.staged || 0) > 0 && depot;
      if (!staged && !remaining) {
        r.job=null; r.workSpot=null; r.action='idle'; r.target=null;
        continue;
      }
      r.action = 'collect';
      const source = staged ? workSpot(s,r,depot) : supplySpot(s,r,i);
      if (!source) { r.job=null; continue; }
      const sourceId=staged ? depot.id : 0;
      if(r.supplySource!==sourceId){r.supplyGoal=null;r.walk=[];r.target=null;}
      r.supplySource=sourceId;
      if (!r.supplyGoal) r.supplyGoal=source;
      if (go(s,r,r.supplyGoal)) {
        r.haulLoads = Math.min(staged ? 2 : depot ? 4 : 1, staged ? p.staged : remaining);
        r.haulStage = staged || !depot ? 'site' : 'storage';
        if(staged) p.staged-=r.haulLoads;
        r.supplyGoal=null; r.cargo=true; r.target=null;
      }
      continue;
    }
    r.action = r.cargo ? 'carry' : 'walk';
    const delivery = r.cargo && r.haulStage==='storage' && depot ? workSpot(s,r,depot) : dest;
    if(!delivery || !go(s,r,delivery)) continue;
    if(r.cargo) {
      if(r.haulStage==='storage' && depot) p.staged=(p.staged||0)+carriedLoads(r);
      else p.delivered=Math.min(loads,p.delivered+carriedLoads(r));
      r.cargo=false; r.haulLoads=0; r.haulStage=null;
      r.target=null;
      if(p.delivered<loads) continue;
    }
    if (p.delivered < loads || r.energy < 25) continue;
    r.action = "build";
    const before = p.work;
    p.work = Math.min(
      PROJECTS[p.key].work,
      p.work +
        dt *
          workMultiplier(r,p.key) *
          crewEfficiency(s.people.filter(other=>other.job===p.id&&other.action==='build').length) *
          useEquipment(s,r,"carpentry-tools",`job:${p.id}`,dt,PROJECTS[p.key].work) *
          (s.opening &&
          !s.opening.complete &&
          s.rain &&
          !openingProgress(s, PROJECTS).shelter
            ? 0.8
            : 1) *
          (r.needs.hunger<15 ? 0.65 : 1),
    );
    r.work += dt;
    r.energy = Math.max(0, r.energy - dt * 0.16);
    if (before < PROJECTS[p.key].work && p.work >= PROJECTS[p.key].work) {
      invalidateNavigation(s);
      if (s.opening && !s.opening.complete) {
        const progress = openingProgress(s, PROJECTS);
        for (const [key, line] of Object.entries({
          gathering:
            "Luz: Somewhere to sit together. This is starting to feel like our place.",
          shelter:
            "Nina: A dry place to take a break. We can stop rushing when the rain comes.",
          supplies:
            "Bento: Tools and supplies are protected. We can save the rest of our money for tomorrow.",
        })) {
          if (progress[key] && !s.opening[key]) {
            s.opening[key] = true;
            say(s, line);
          }
        }
      }
      say(
        s,
        `${PROJECTS[p.key].name} is ready. ${p.key === "gathering" ? "Somewhere to sit together at last." : p.key === "shelter" ? "A roof for our first night." : p.key === "water" ? "Water close at hand." : PROJECTS[p.key].kind === "eco_toilet" ? "A little privacy goes a long way." : "Ready for the community to use."}`,
      );
    }
  }
}
export function save(s) {
  return JSON.stringify(s);
}
export function restore(text) {
  try {
    const s = JSON.parse(text);
    if (
      s.version !== 2 ||
      !["arrival", "playing", "evening"].includes(s.stage) ||
      !Array.isArray(s.people) ||
      s.people.length !== 5 ||
      !Array.isArray(s.projects) ||
      s.projects.length > 128 * 128
    )
      return null;
    for(const r of s.people)if(r?.removalJob!==undefined&&!s.projects.some(p=>p?.id===r.removalJob))delete r.removalJob;
    if(Array.isArray(s.operations)&&s.infrastructure?.nodes){
      s.operations=s.operations.filter(op=>{
        if(!op?.water||op.water.from===-1||s.infrastructure.nodes[op.water.from])return true;
        if(op.phase==='deliver'){op.water.from=-1;return true;}
        for(const r of s.people)if(r.operation===op.id){r.operation=null;r.cargo=false;r.action='idle';}
        return false;
      });
    }
    if(activeTrips(s).some(t=>t.boardingFare!==undefined && (t.phase!=='boarding'||t.boardingFare!==transportCost({...s,deliveryOnly:false}))))return null;
    if(!validWeather(s)||!validHydrology(s)||!validAnimalCare(s,PROJECTS))return null;
    ensureHydrology(s);
    if(s.weather===undefined)weatherStep(s);
    if(!validGathering(s))return null;
    restoreHomeAssignments(s);
    repairFootfall(s);
    retireUntreatedWater(s);
    numberProjects(s, PROJECTS);
    // Saves predating narrow footbridges retain their exact 8×2 occupancy,
    // centre, rotations and deck width. New plans explicitly write version 1.
    for (const project of s.projects) {
      if (!project || !validSiteVersion(project)) return null;
      if (project.key === 'bridge') project.siteVersion ??= 0;
    }
    // Retired reclaimed-parts economy: remove obsolete stock, sites and jobs.
    delete s.materials?.salvage;
    const retiredSites=new Set(s.projects.filter(p=>p.key==='supply-4').map(p=>p.id));
    s.projects=s.projects.filter(p=>!retiredSites.has(p.id));
    if(Array.isArray(s.operations))s.operations=s.operations.filter(o=>!retiredSites.has(o.site)&&!['salvage','hardware','tools'].includes(o.recipe));
    if(s.infrastructure?.nodes){
      for(const id of retiredSites)delete s.infrastructure.nodes[id];
      if(Array.isArray(s.infrastructure.links))s.infrastructure.links=s.infrastructure.links.filter(l=>!retiredSites.has(l.from)&&!retiredSites.has(l.to));
    }
    if(s.trip?.material==='salvage'){
      s.money+=30; // Refund the retired shop batch already paid for.
      const traveler=s.people.find(r=>r.id===s.trip.person);
      if(traveler){traveler.action='idle';traveler.x=s.stock.x;traveler.z=s.stock.z;}
      s.trip=null;
    }
    if (
      s.opening &&
      (s.opening.version !== 1 ||
        !Number.isInteger(s.opening.townTrips) ||
        s.opening.townTrips < 0 ||
        (s.opening.complete !== undefined &&
          typeof s.opening.complete !== "boolean"))
    )
      return null;
    if (s.mode !== undefined && s.mode !== "sandbox" && s.mode !== "story")
      return null;
    if (s.instantBuild !== undefined && typeof s.instantBuild !== "boolean")
      return null;
    s.terrainPads ??= [];
    if (
      !Array.isArray(s.terrainPads) ||
      s.terrainPads.length > 4096 ||
      s.terrainPads.filter(p => p?.terraform).length > 1 ||
      s.terrainPads.some(
        (p) =>
          !p || (p.terraform !== undefined ? !validTerrainVertices(p) : (
          ![p.left, p.right, p.top, p.bottom, p.height].every(
            Number.isFinite,
          ) ||
          p.left < -128 ||
          p.right > 128 ||
          p.top < -128 ||
          p.bottom > 128 ||
          p.left >= p.right ||
          p.top >= p.bottom ||
          p.height < 0 ||
          p.height > 12 ||
          [p.left, p.right, p.top, p.bottom].some((n) => n % 2 !== 0))),
      )
    )
      return null;
    s.elevationSeed ??= 0;
    if (
      !Number.isInteger(s.elevationSeed) ||
      s.elevationSeed < 0 ||
      s.elevationSeed > 0xffffffff
    )
      return null;
    s.landSeed ??= 0;
    if (
      !Number.isInteger(s.landSeed) ||
      s.landSeed < 0 ||
      s.landSeed > 0xffffffff
    )
      return null;
    if(s.worldSettings!==undefined){if(!validSettings(s.worldSettings))return null;registerWorld(s.landSeed,s.worldSettings);}
    const fresh = createWeekend();
    s.arrivalElapsed ??= ARRIVAL_DURATION;
    if (
      !Number.isFinite(s.arrivalElapsed) ||
      s.arrivalElapsed < 0 ||
      s.arrivalElapsed > ARRIVAL_DURATION
    )
      return null;
    if(s.arrivalAnimating!==undefined && typeof s.arrivalAnimating!=="boolean") return null;
    if (s.stage === "arrival" && !s.arrivalAnimating) s.arrivalElapsed = ARRIVAL_DURATION;
    if (
      ["rain", "rainSeen", "rainResolved", "meal"].some(
        (k) => typeof s[k] !== "boolean",
      )
    )
      return null;
    if (
      s.stage === "arrival" &&
      (s.projects.some(p=>!p.natural) || s.camp !== null || s.trip)
    )
      return null;
    if (
      !Number.isInteger(s.nextId) ||
      s.nextId <= Math.max(0, ...s.projects.map((p) => p.id))
    )
      return null;
    if (s.stage !== 'arrival' && !(s.camp === 'custom'
      ? s.campSite && [s.campSite.x,s.campSite.z].every(v=>Number.isInteger(v)&&v>=CELL_MIN&&v<=CELL_MAX) &&
        (s.campSite.rotation===undefined || [0,1,2,3].includes(s.campSite.rotation))
      : CAMPS.some(c=>c.id===s.camp))) return null;
    if (s.unpack !== undefined) {
      const u = s.unpack, pad = u?.pad;
      if (!u || s.stage === 'arrival' || !s.camp || !Array.isArray(u.delivered) || u.delivered.length >= CAMP_LOADS.length ||
        new Set(u.delivered).size !== u.delivered.length || u.delivered.some(k=>!Number.isInteger(k)||k<0||k>=CAMP_LOADS.length) ||
        (pad !== null && (!pad || typeof pad !== 'object' || ['left','right','top','bottom','height'].some(k=>!Number.isFinite(pad[k])))))
        return null;
    }
    if (s.materials)
      for (const id of Object.keys(MATERIALS))
        if (id !== "wood" && s.materials[id] === undefined) s.materials[id] = 0;
    if (
      !s.materials ||
      Object.keys(MATERIALS)
        .filter((id) => id !== "wood")
        .some((id) => !Number.isInteger(s.materials[id]) || s.materials[id] < 0)
    )
      return null;
    for (const k of ["time", "money", "wood", "nextId"])
      if (!Number.isFinite(s[k]) || s[k] < 0) return null;
    if (
      !s.stock ||
      !Number.isInteger(s.stock.x) ||
      !Number.isInteger(s.stock.z) ||
      s.stock.x < CELL_MIN ||
      s.stock.x > CELL_MAX ||
      s.stock.z < CELL_MIN ||
      s.stock.z > CELL_MAX
    )
      return null;
    migrateItemProjects(s);
    if(s.biologyVersion===undefined){for(const p of s.projects)if(PROJECTS[p.key]?.kind==='orchard')p.orchardEstablished=true;s.biologyVersion=2;}
    if(s.biologyVersion!==2)return null;
    if(!captureProjectMaterials(s,PROJECTS,MATERIALS))return null;
    // Older saves counted a pair/trio as one item; preserve the actual animals.
    if (s.livestockUnits === undefined) {
      s.materials.goats *= 2;
      s.materials.hens *= 3;
      for (const p of s.projects) {
        if (p.key === "goat_pasture")
          p.delivered = Math.min(requiredLoads(p), p.delivered + 1);
        if (p.key === "coop")
          p.delivered = Math.min(requiredLoads(p), p.delivered + 2);
      }
      s.livestockUnits = 1;
    }
    if (s.livestockUnits !== 1) return null;
    for(const op of s.operations||[]) {
      if(PROCESSES[op.recipe]?.craft && op.work>PROCESSES[op.recipe].work)op.work=PROCESSES[op.recipe].work;
    }
    if(!validEquipment(s))return null;
    // Restore releases tools to shared storage; continuing jobs borrow again.
    equipmentState(s).loans={};
    // Homes in older saves already paid for their rooftop equipment.
    if (!s.homeEnergyVersion) {
      for (const p of s.projects) if (PROJECTS[p.key]?.kind === 'home') {
        p.solarUpgrade = true;
        const loads = requiredLoads(p), units=Math.ceil(PROJECTS[p.key].size[0]/2);
        const extra=['panels','batteries','electrical'].reduce((sum,id)=>sum+Math.ceil(units/MATERIALS[id].batch),0);
        if (p.delivered > loads && p.delivered <= loads + extra) p.delivered = loads;
        if (p.staged && p.delivered + p.staged <= loads + extra) p.staged = Math.min(p.staged, loads - p.delivered);
      }
      s.homeEnergyVersion = 1;
    }
    if(!migrateConstructionLabor(s,PROJECTS))return null;
    for (const p of s.projects) {
      if((p.coldStorage!==undefined&&typeof p.coldStorage!=='boolean')||(p.coolingEnabled!==undefined&&typeof p.coolingEnabled!=='boolean')||(p.coldStorage&&PROJECTS[p.key]?.kind!=='kitchen'))return null;
      const recipe = {...projectMaterials(p,PROJECTS), ...(p.solarUpgrade ? Object.fromEntries(['panels','batteries','electrical'].map(id=>[id,Math.ceil(PROJECTS[p.key].size[0]/2)])) : {})};
      if (p.pendingMaterials && (p.work !== 0 || p.delivered !== 0 ||
          !Object.keys(p.pendingMaterials).length || Object.entries(p.pendingMaterials).some(([id,n]) =>
            !Number.isInteger(n) || n <= 0 || !recipe[id] || n > recipe[id]))) return null;
    }
    for(const trip of activeTrips(s)){
    if (trip?.project !== undefined && !s.projects.some(p => p.id === trip.project && p.pendingMaterials)) return null;
    if (trip?.projects !== undefined && (!Array.isArray(trip.projects) ||
        !trip.projects.includes(trip.project) || new Set(trip.projects).size !== trip.projects.length ||
        trip.projects.some(id=>!s.projects.some(p=>p.id===id && p.pendingMaterials)))) return null;
    }
    const ids = new Set(),
      keys = new Set();
    for (const p of s.projects) {
      if (
        (p.rotation !== undefined &&
          (!Number.isInteger(p.rotation) ||
            p.rotation < 0 ||
            p.rotation > 3)) ||
        (p.prioritized !== undefined && typeof p.prioritized !== 'boolean') ||
        !PROJECTS[p.key] ||
        (s.mode !== "sandbox" &&
          !PROJECTS[p.key]?.repeatable &&
          keys.has(p.key)) ||
        ids.has(p.id) ||
        !Number.isInteger(p.id) ||
        p.id < 1 ||
        !Number.isFinite(p.work) ||
        p.work < 0 ||
        p.work > PROJECTS[p.key].work ||
        !Number.isInteger(p.delivered) ||
        p.delivered < 0 ||
        (p.staged !== undefined && (!Number.isInteger(p.staged) || p.staged < 0 || p.staged + p.delivered > requiredLoads(p))) ||
        (p.depot !== undefined && (!Number.isInteger(p.depot) || !s.projects.some(other => other.id === p.depot && STORAGE_KINDS.includes(PROJECTS[other.key].kind)))) ||
        p.delivered > requiredLoads(p)
      )
        return null;
      ids.add(p.id);
      keys.add(p.key);
      // Existing buildings are not new blueprints: later neighbours, roads and
      // terraforming must not invalidate an otherwise well-formed saved village.
      if (![p.x,p.z].every(Number.isInteger) || p.x<CELL_MIN || p.z<CELL_MIN ||
          p.x+footprint(p)[0]>CELL_MAX+1 || p.z+footprint(p)[1]>CELL_MAX+1) return null;
    }
    for(const p of s.projects)ensureAnimalCare(s,p,PROJECTS[p.key].kind);
    for (let i = 0; i < 5; i++) {
      const r = s.people[i];
      if (
        r.id !== fresh.people[i].id ||
        !["x", "z", "energy", "work"].every((k) => Number.isFinite(r[k])) ||
        r.x < CELL_MIN ||
        r.x > CELL_MAX ||
        r.z < CELL_MIN ||
        r.z > CELL_MAX ||
        r.energy < 0 ||
        r.energy > 100
      )
        return null;
      if (r.work < 0 || (r.drinkingWater!==undefined&&(!Number.isFinite(r.drinkingWater)||r.drinkingWater<0||r.drinkingWater>10))) return null;
      for (const k of ["washTime", "cleanedAtWork", "toiletAt", "toiletTime"])
        if (r[k] !== undefined && (!Number.isFinite(r[k]) || r[k] < 0))
          return null;
      if (r.lastMealAt!==undefined && (!Number.isFinite(r.lastMealAt) || r.lastMealAt<0 || r.lastMealAt>s.time)) return null;
      if (!validNeeds(r) || !validCraftSkills(r) || !validMind(r,fresh.people,s.time)) return null;
      if(r.friendships!==undefined && (!r.friendships || typeof r.friendships!=='object' || Array.isArray(r.friendships) || Object.entries(r.friendships).some(([id,value])=>id===r.id || !fresh.people.some(p=>p.id===id) || !Number.isFinite(value) || value<0 || value>100))) return null;
      ensureNeeds(r,i);
      if (r.cargo && r.haulStage === 'site' && r.haulLoads && r.job) {
        const project=s.projects.find(p=>p.id===r.job);
        if(project?.depot) project.staged=(project.staged||0)+r.haulLoads;
      }
      r.haulLoads=0; r.haulStage=null;
      r.downtime = null;
      r.leisureRecent = [];
      r.needTask = null;
      r.needRetryAt = 0;
      r.needBlocked = null;
      clearDowntime(r);
      r.lookAt = null;
      r.supplyGoal = null;
      r.target = null;
      r.walk = [];
      r.job = null;
      r.workSpot = null;
      r.operation = null;
      r.linkJob = null;
      r.cargo = false;
      if (r.unpack !== undefined) {
        const job = r.unpack;
        if (!job || !Number.isInteger(job.load) || job.load < 0 || job.load >= CAMP_LOADS.length ||
          !["fetch", "carry"].includes(job.phase) || !Number.isFinite(job.wait) || job.wait < 0) return null;
        if (!s.unpack || s.unpack.delivered.includes(job.load) ||
          s.people.some((other, j) => j < i && other.unpack?.load === job.load)) delete r.unpack;
      }
      if (
        r.tentPhase &&
        (!["enter", "inside", "exit"].includes(r.tentPhase) ||
          !Number.isFinite(r.tentAt) ||
          r.tentAt > s.time ||
          !s.camp)
      )
        return null;
      if (
        r.restSite != null &&
        !s.projects.some(
          (p) =>
            p.id === r.restSite &&
            p.work >= PROJECTS[p.key].work &&
            (PROJECTS[p.key].kind === "home" ||
              p.key.startsWith("canvas-tent")),
        )
      )
        return null;
      r.washSite = null;
      r.toiletSite = null;
      r.toiletTime = 0;
      r.action =
        activeTrips(s).some(t=>t.person===r.id) ? "town" : r.tentPhase ? "rest" : "idle";
      r.name = fresh.people[i].name;
    }
    if(s.secondTrip&&(!s.trip||s.secondTrip.person===s.trip.person||s.secondTrip.vehicle===s.trip.vehicle))return null;
    if (s.nextTripVehicle !== undefined && ![0, 1].includes(s.nextTripVehicle)) return null;
    for(const trip of activeTrips(s)) {
    if (
      trip &&
      (!Object.hasOwn(MATERIALS, trip.material) ||
        !s.people.some((r) => r.id === trip.person) ||
        !Number.isFinite(trip.left) ||
        trip.left < 0 ||
        trip.left > (trip.duration||TRIP_DURATION) ||
        (trip.duration!==undefined && ![45,55,110,...['nearby','drive','remote'].map(townDuration)].includes(trip.duration)))
    )
      return null;
    if (trip) {
      trip.vehicle ??= 0;
      trip.phase ??= trip.left > DRIVE_DURATION ? "away" : "inbound";
      if (
        ![0, 1].includes(trip.vehicle) ||
        !["boarding", "outbound", "away", "inbound", "unloading"].includes(
          trip.phase,
        )
      )
        return null;
      const r = s.people.find((r) => r.id === trip.person);
      r.cargo = trip.phase === "unloading";
    }
    }
    if(s.expansionReserve!==undefined&&(!Number.isFinite(s.expansionReserve)||s.expansionReserve<0||s.expansionReserve>100000))return null;
    if(s.foodReserveDays!==undefined&&(!Number.isFinite(s.foodReserveDays)||s.foodReserveDays<0||s.foodReserveDays>7))return null;
    if(s.foodPurchases!==undefined && (!s.foodPurchases || !Number.isSafeInteger(s.foodPurchases.day) || s.foodPurchases.day<0 ||
      !Number.isFinite(s.foodPurchases.spent) || s.foodPurchases.spent<0 || s.foodPurchases.spent>100000))return null;
    if(s.foodPurchaseBudget!==undefined&&(!Number.isFinite(s.foodPurchaseBudget)||s.foodPurchaseBudget<0||s.foodPurchaseBudget>100000))return null;
    if(s.foodStorage?.lots)for(const id of ['greens','beans','corn'])if(s.foodStorage.lots[id]===undefined&&s.materials[id]===0)s.foodStorage.lots[id]=[];
    refreshSandboxFood(s);
    if (!validFoodPolicy(s) || !validAnimalCare(s,PROJECTS) || !validHydrology(s) || !validWeather(s) || !validCultivation(s) || !validSuppliers(s,MATERIALS) || !validMaterialLedger(s,MATERIALS) || !validProductionHauling(s,PROCESSES) || !validLogisticsPolicy(s) || !validRemovals(s,PROJECTS,MATERIALS) || !validDelivery(s,MATERIALS) || !validUpkeep(s) || !validBiology(s,PROCESSES) || !validOutsideWork(s) || !validFoodStorage(s,PROCESSES,MATERIALS) || !validProductionAccounting(s,PROCESSES) || !validInfrastructure(s) || !validatePolicies(s,MATERIALS) || !validTrade(s,MATERIALS) || !validFinances(s)) return null;
    if (
      s.infrastructure &&
      Object.values(s.infrastructure.nodes).some(
        (n) =>
          n.id !== 0 &&
          n.id !== -1 &&
          !s.projects.some(
            (p) =>
              p.id === n.id &&
              p.work >= PROJECTS[p.key].work &&
              PROJECTS[p.key].kind === n.kind,
          ),
      )
    )
      return null;
    if (
      s.operations &&
      (!Array.isArray(s.operations) ||
        s.operations.some(
          (o) =>
            !s.infrastructure?.nodes[o.site] ||
            !["pickup", "process", "growing", "deliver", "return"].includes(o.phase) ||
            (o.water &&
              o.water.from !== -1 &&
              !s.infrastructure?.nodes[o.water.from]) ||
            (o.accessRetryAt!==undefined&&(!o.accessRetryAt||Array.isArray(o.accessRetryAt)||typeof o.accessRetryAt!=='object'||Object.entries(o.accessRetryAt).some(([id,t])=>!s.people.some(r=>r.id===id)||!Number.isFinite(t)||t<0||t>s.time+30.0001))) ||
            !Number.isFinite(o.work) ||
            o.work < 0 ||
            (!o.water && !PROCESSES[o.recipe]) ||
            (o.input!==undefined&&(!o.input||Object.entries(o.input).some(([id,n])=>!Number.isInteger(n)||n<0||n>((PROCESSES[o.recipe]?.input[id]||0)+(o.recipe==='wood'&&id==='tree_starts'?4:0))))) ||
            (o.water &&
              (!LIQUIDS.includes(o.water.kind) ||
                !Number.isFinite(o.water.amount) ||
                o.water.amount < 0 ||
                o.water.amount > 12 ||
                (o.water.stagedAt!==undefined&&(!o.water.stagedAt||!Number.isFinite(o.water.stagedAt.x)||!Number.isFinite(o.water.stagedAt.z)||o.phase!=='deliver')))),
        ))
    )
      return null;
    // Retire old repeat policies without cancelling paid or in-flight work.
    for(const p of s.projects){if(p.repeat)delete p.productionStatus;delete p.repeat;delete p.stockTarget;}
    // Residents cook for themselves by default; a later player choice is kept.
    if(!s.autonomy){if(s.foodPolicy)s.foodPolicy.automatic=true;s.autonomy=1;}
    s.log = Array.isArray(s.log)
      ? s.log.filter((t) => typeof t === "string").slice(0, 12)
      : [];
    if (Array.isArray(s.events)) s.events = s.events.filter(event => event && typeof event.text === 'string' &&
      (event.time === null || Number.isFinite(event.time) && event.time >= 0) && Number.isInteger(event.count) && event.count > 0).slice(0,48);
    else delete s.events;
    return s;
  } catch {
    return null;
  }
}
