import {resetMaterialLocations} from '../../web/dev/material-fixture.js';
// System tests author an empty worksite; the actual founding property is tested
// separately by verify-modes and verify-landscape through the real mode button API.
export function startEmptySandbox(game){
  if(!game.start_mode('sandbox'))return false;
  const state=JSON.parse(game.snapshot()),v=state.village;
  v.buildings=[];v.building_jobs=[];v.economy.projects=[];v.economy.next_building=0;
  return game.restore(JSON.stringify(resetMaterialLocations(state)));
}
