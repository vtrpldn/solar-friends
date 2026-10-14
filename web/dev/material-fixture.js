// Explicit fixture authoring only. Playable saves retain their located ownership.
export function resetMaterialLocations(state) {
  if(state.village.logistics?.shipments?.length)throw new Error('Finish or interrupt cargo before restaging a material fixture.');
  state.village.version=3;
  state.village.logistics=null;
  if(state.village.simulation)state.village.simulation.materials=null;
  return state;
}
