import {Game} from '../pkg/solar_friends.js';
// Use the actual free-build commands for a starting layout, then turn on the
// same saved rules available in Settings. No Story progress is granted.
export function sandboxPlanningScene(){
  const game=new Game();
  try{
    if(!game.start_mode('sandbox')||!game.configure_sandbox_rules(false,true,false))throw Error('Could not prepare Sandbox planning rules.');
    for(const [kind,x,y]of [['well',5,5],['home',10,5],['kitchen',13,5],['garden',17,5],['streetlight',5,10],['warehouse',17,10]])if(game.place(kind,x,y)!=='ok')throw Error('No clear starter plot for '+kind);
    for(let tick=0;tick<80;tick++)game.tick(.25);
    if(!game.configure_sandbox_rules(true,true,true))throw Error('Could not enable the Sandbox planning constraints.');
    if(game.place('workshop',17,16)!=='ok')throw Error('No clear workshop project.');
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
