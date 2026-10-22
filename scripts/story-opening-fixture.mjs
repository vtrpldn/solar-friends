// Authored starting assets, never fabricated harvests, meals or chapter receipts.
export function storyOpeningScenario(engine){
 const d=JSON.parse(engine.scenario_template('story')),base=d.start.buildings[0];d.map.nature=[];
 for(const [id,kind,x,y]of [['first-cistern','well',20,29],['first-home','home',20,25],['first-kitchen','kitchen',25,29],['first-garden','garden',25,25]])d.start.buildings.push({...base,id,kind,x,y,...(kind==='garden'?{crop:{crop:'beans',next_crop:'lettuce',stage:'mature',replant:false,soil_wetness:1}}:{})});
 return d;
}
