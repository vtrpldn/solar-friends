import {Game} from '../pkg/solar_friends.js';
import {resetMaterialLocations} from './material-fixture.js';

// Protected scene authoring only. Choose weather from Rust's actual forecast,
// then stage fresh opening inventories at that date; never age a playable save.
export function withSeasonalWeather(state,{dry=false}={}){
  const game=new Game();
  try{
    if(typeof game.weather_report!=='function')throw Error('Rebuild the simulation to use seasonal weather scenes.');
    const staged=structuredClone(state),v=staged.village;
    v.climate={enabled:true};v.minutes=(dry?21:14)*1440+600;
    resetMaterialLocations(staged);
    if(!game.restore(JSON.stringify(staged)))throw Error('The seasonal preview needs a valid starting scene.');
    const chosen=JSON.parse(game.weather_report()).forecast.find(d=>d.season===(dry?'dry':'wet')&&d.rain_expected!==dry);
    if(!chosen)throw Error('No matching seasonal weather in this preview week.');
    v.minutes=chosen.day*1440+(dry?900:chosen.rain_start+30);
    resetMaterialLocations(staged);
    if(!game.restore(JSON.stringify(staged)))throw Error('The seasonal preview failed inventory validation.');
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
