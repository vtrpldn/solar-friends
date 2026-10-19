import {Game} from '../pkg/solar_friends.js';
// Authored needs only; after loading, ordinary resident decisions do the work.
export function withAutonomyScene(state){
  const staged=structuredClone(state),v=staged.village;
  v.minutes=1440+570;
  v.economy.outside_jobs.fill(false);v.economy.outside_jobs[4]=true;
  for(const r of staged.residents){
    Object.assign(r,{remaining:0,task:'idle',requested:false,help:null,work_check_at:0});
    r.energy=r.id===0?20:90;
    r.hunger=r.id===1?80:10;
    r.social=r.id===2?20:90;
    r.reason='Choosing between my needs and our village plans.';
  }
  const game=new Game();
  try{
    if(!game.restore(JSON.stringify(staged)))throw Error('Resident autonomy needs a valid staged village.');
    if(game.place('garden',20,15)!=='ok')throw Error('The autonomy project needs a clear plot.');
    const project=JSON.parse(game.snapshot()).village.buildings.at(-1).id;
    if(game.configure_project(project,3,false,'standard')!=='ok')throw Error('Could not prioritize the autonomy project.');
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
