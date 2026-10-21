import {Game} from '../pkg/solar_friends.js';
// The estate is authored through the player-content compiler. Subsequent ticks
// and the workshop order use the same commands as an ordinary playthrough.
export function sandboxPlanningScene(){
  const game=new Game();
  try{
    const definition=JSON.parse(game.scenario_template('sandbox'));
    definition.id='sandbox-planning';definition.title='Planning our village';
    definition.rules.land=true;
    for(const [kind,x,y]of [['well',5,5],['home',10,5],['kitchen',13,5],['garden',17,5],['streetlight',5,10],['warehouse',17,10]])definition.start.buildings.push({id:'planning-'+kind,kind,x:x+22,y:y+19,state:'completed',recipe:'standard',appearance:null});
    const result=JSON.parse(game.load_scenario(JSON.stringify(definition)));
    if(!result.ok)throw Error(result.issues.map(i=>i.message).join(' '));
    for(let tick=0;tick<80;tick++)game.tick(.25);
    if(!game.configure_sandbox_rules(true,true,true))throw Error('Could not enable the Sandbox planning constraints.');
    if(game.place('workshop',39,35)!=='ok')throw Error('No clear workshop project.');
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
