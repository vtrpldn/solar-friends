import {weatherAt} from './weather.js';
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
  const current=state.weather||weatherAt(state);
  const raining=state.weather?current.rainMmPerHour>.05:state.rain;
  const weather=raining?'Rain':current.cloudCover>.5?'Cloudy':night?'Clear night':'Sunny';
  const temperature=Math.round(current.temperatureC);
  return {date:`${day+1} ${MONTHS[month]}`,year:Math.floor((304+elapsedDays)/365)+1,season,weather,
    icon:raining?'☂':current.cloudCover>.5?'☁':night?'☾':'☀',temperature};
}
