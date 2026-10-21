const fields=[
  ['season_days','Days per wet or dry season',7,90,1],
  ['wet_rain_chance','Wet season · chance of rain (%)',0,100,1],
  ['dry_rain_chance','Dry season · chance of rain (%)',0,100,1],
  ['wet_evaporation','Wet season · drying factor',0.5,2,0.05],
  ['dry_evaporation','Dry season · drying factor',0.5,2,0.05],
  ['intro_days','Beginner afternoon weather · days',0,14,1],
];
export class WeatherEditor{
  constructor(host,{defaults,change}){
    this.defaults=defaults;this.host=host;
    host.innerHTML='<p>A compressed game calendar. Rain chances apply per day; drying factors affect soil water loss. Beginner weather applies only to Story rules.</p>'+fields.map(([key,label,min,max,step])=>`<div class="creator-field"><label for="creator-weather-${key}">${label}</label><input id="creator-weather-${key}" data-weather="${key}" type="number" min="${min}" max="${max}" step="${step}"></div>`).join('')+'<button type="button" data-weather-reset>Use familiar village weather</button><p data-weather-note></p>';
    host.onchange=e=>{const key=e.target.dataset.weather;if(!key)return;const value=Number(e.target.value);change('Change weather conditions',d=>{d.rules.weather??=structuredClone(defaults);d.rules.weather[key]=value;});};
    host.querySelector('[data-weather-reset]').onclick=()=>change('Restore familiar village weather',d=>{delete d.rules.weather;});
  }
  render(definition){
    const p=definition.rules.weather??this.defaults;
    for(const [key]of fields){const input=this.host.querySelector(`[data-weather="${key}"]`);if(document.activeElement!==input)input.value=p[key];input.disabled=!definition.rules.climate;}
    this.host.querySelector('[data-weather-note]').textContent=definition.rules.climate?'Weather is shared by forecasts, crops, rain collection and power.':'Seasonal weather is off. Enable it in village rules to apply these settings.';
  }
}
