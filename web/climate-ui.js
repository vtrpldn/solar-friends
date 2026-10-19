const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(Math.floor(minutes % 60)).padStart(2,'0')}`;
export function weatherSummary(weather, minutes) {
  const today=weather?.forecast?.[0];
  if(!today)return '';
  const minute=((minutes%1440)+1440)%1440;
  if(weather.current.raining)return `Rain until ${time(today.rain_end)} · cisterns are collecting`;
  if(!today.rain_expected)return 'Clear today · keep water in reserve';
  return minute<today.rain_start?`Rain expected ${time(today.rain_start)}–${time(today.rain_end)}`:'Rain has passed · check water stores';
}
export function updateClimateForecast(state) {
  const details=document.querySelector('#weather-forecast'),weather=state.environment.weather;
  details.hidden=!weather;
  document.querySelector('#weather-open').hidden=!weather;
  if(!weather)return;
  const day=weather.forecast[0],season=day.season==='wet'?'Wet':'Dry';
  document.querySelector('#climate-summary').textContent=weather.enabled
    ? `${season} season · day ${day.season_day} of ${weather.season_days}. ${day.days_until_change} ${day.days_until_change===1?'day':'days'} until the ${day.season==='wet'?'dry':'wet'} season.`
    : 'Familiar afternoon weather. Seasonal variation is off for this village.';
  // Preserve focus and scrolling while the live village clock advances.
  const list=document.querySelector('#weather-days'),key=JSON.stringify([weather.enabled,weather.forecast]);
  if(list.dataset.forecast!==key){
    const rows=weather.forecast.map(d=>{
      const row=document.createElement('li');
      const name=document.createElement('strong');name.textContent=`Day ${d.day+1}`;
      const sky=document.createElement('span');sky.textContent=d.rain_expected?`Rain ${time(d.rain_start)}–${time(d.rain_end)}`:'Clear';
      const river=document.createElement('small');river.textContent=`River around ${Math.round(d.river_factor*100)}% of usual flow${weather.enabled?` · ${d.season} season`:''}`;
      row.append(name,sky,river);return row;
    });
    list.replaceChildren(...rows);list.dataset.forecast=key;
  }
  const control=document.querySelector('#season-weather-control');
  control.hidden=state.village.mode!=='sandbox';
  document.querySelector('#season-weather').checked=weather.enabled;
}
