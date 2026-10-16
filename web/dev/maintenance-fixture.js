import {Game} from '../pkg/solar_friends.js';
import {withAuthoredElectricalCircuits} from './electrical-fixture.js';
import {stageFixtureWater} from './material-fixture.js';
// Authored hardware and wear establish a protected test scene. After loading,
// purchases, carriage, service and operating consequences use normal commands.
export function withMaintenanceScene(state,{outage=false}={}){
  const game=new Game();
  try{
    if(!game.restore(JSON.stringify(state)))throw Error('Maintenance needs a valid staged village.');
    const quote=JSON.parse(game.water_connection_quote('fresh',0,3));if(!quote.allowed)throw Error(quote.reason);
    if(game.queue_water_connection('fresh',0,3)!=='ok')throw Error('Could not author the pump corridor.');
    const authored=JSON.parse(game.snapshot()),v=authored.village,p=v.pipes.lines.at(-1),a=v.simulation.materials;
    p.phase='active';p.work=quote.labour_minutes;p.spent=p.kit.map((n,i)=>{if(!n)return[0,0];const before=a.spent[i];a.opening[i]+=n;a.spent[i]+=n;return[before,a.spent[i]];});
    stageFixtureWater(authored,{kind:'building',id:0},'fresh',30);
    if(!game.restore(JSON.stringify(withAuthoredElectricalCircuits(authored))))throw Error('Maintenance circuit authoring failed.');
    game.set_equipment_condition(true);game.set_automatic_service(false);
    const worn=JSON.parse(game.snapshot());
    for(const r of worn.village.maintenance.records){
      if(r.equipment.kind==='truck')r.condition=outage?5:42;
      if(r.equipment.kind==='workshop')r.condition=outage?5:38;
      if(r.equipment.kind==='pump')r.condition=outage?5:45;
      if(r.equipment.kind==='battery'&&worn.village.power.network.nodes.some(n=>n.id===r.equipment.id&&n.kind==='solar'))r.condition=outage?5:52;
    }
    if(!game.restore(JSON.stringify(worn)))throw Error('Authored equipment condition failed validation.');
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
