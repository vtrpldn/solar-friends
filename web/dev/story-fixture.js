import {centerLayout} from './center-layout.js';
import {Game} from '../pkg/solar_friends.js';
import {resetMaterialLocations} from './material-fixture.js';
// An explicitly authored teaching scene; only subsequent ticks earn observed time.
export function storyPlanningScene(){
 const game=new Game();
 try{
  if(!game.start_mode('sandbox'))throw Error('Could not prepare Story teaching scene.');
  const initial=JSON.parse(game.snapshot());initial.village.buildings=[];initial.village.economy.next_building=0;
  if(!game.restore(JSON.stringify(resetMaterialLocations(initial))))throw Error('Could not author the teaching layout.');
  for(const [kind,x,y] of [['well',7,12],['home',8,8],['home',12,7],['garden',13,10],['kitchen',10,10],['grove',6,14]]){
   if(game.place(kind,x,y)!=='ok')throw Error('Story scene needs a clear '+kind+' plot.');
  }
  if(game.place_source(1,4,18)!=='ok')throw Error('Story scene needs a renewable bamboo plot.');
  const state=JSON.parse(game.snapshot()),v=state.village;
  v.mode='story';v.climate.enabled=true;v.minutes=570;v.arrived=true;v.harvests=1;v.meals_served=1;
  v.food=32;v.meals=12;v.progress.completed[0]=true;v.progress.tracked=1;
  v.progress.outcomes={schema:1};v.economy.outside_jobs[4]=true;
  for(const r of state.residents)Object.assign(r,{task:'idle',trip:null,remaining:0,requested:false,help:null,energy:90,hunger:20,social:85,x:10+(r.id-2)*.8,y:13,target_x:10+(r.id-2)*.8,target_y:13,last_meal_slot:0,walking:{},activity_batch:null,activity_store:null,activity_material:null,activity_building:null});
  if(!game.restore(JSON.stringify(resetMaterialLocations(centerLayout(state)))))throw Error('Invalid Story teaching fixture.');
  return JSON.parse(game.snapshot());
 }finally{game.free();}
}
