// Render samples retain static land and the last full reports. All actions and
// saves still read the authoritative engine snapshot; this is never persisted.
export function sampleFrame(game, previous, full = false) {
  if(full){
    if(!previous||!game.report_state)return JSON.parse(game.snapshot());
    const report=JSON.parse(game.report_state()),origin=previous.village.scenario,ref=report.scenario_ref;
    if(ref){
      const d=origin?.definition;
      if(!d||d.id!==ref.id||d.revision!==ref.revision||d.map.id!==ref.map||d.map.revision!==ref.map_revision)return JSON.parse(game.snapshot());
      report.village.scenario=origin;
    }else if(origin)return JSON.parse(game.snapshot());
    return report;
  }
  const frame = JSON.parse(game.frame_state());
  return {
    ...previous,
    residents: frame.residents,
    village: {...previous.village, ...frame.village,
      economy: {...previous.village.economy, ...frame.village.economy}},
    environment: {...previous.environment, ...frame.environment,
      weather: {...previous.environment.weather, ...frame.environment.weather}},
  };
}
