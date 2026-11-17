import {seasonAt} from './biological-production.js';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
// The simulation's seasons use a repeating 365-day calendar starting November 1.
export function environmentInfo(state){
  const minutes=540+Math.floor(state.time*.45),elapsedDays=Math.floor(minutes/1440);
  let day=(304+elapsedDays)%365,month=0;
  while(day>=DAYS[month])day-=DAYS[month++];
  const hour=(minutes%1440)/60,season=seasonAt(state.time);
  const night=hour<6||hour>=18;
  const weather=state.rain?'Rain':night?'Clear night':'Sunny';
  const mean={'mata-atlantica':23,cerrado:26,caatinga:29}[state.worldSettings?.biome]??23;
  // Ambient estimate for the HUD, not a new crop/health simulation input.
  const temperature=Math.round(mean+({Summer:3,Autumn:0,Winter:-4,Spring:1}[season])+
    4*Math.cos((hour-14)*Math.PI/12)-(state.rain?3:0));
  return {date:`${day+1} ${MONTHS[month]}`,year:Math.floor((304+elapsedDays)/365)+1,season,weather,
    icon:state.rain?'☂':night?'☾':'☀',temperature};
}
