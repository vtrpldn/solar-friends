// Display the shortest decimal that represents the same native float. This
// removes binary noise without rounding a distinct supported profile value.
export function weatherDisplayValue(value){
  if(!Number.isFinite(value)||Object.is(value,-0))return value;
  const native=Math.fround(value);
  if(!Number.isFinite(native))return value;
  for(let precision=1;precision<=9;precision++){
    const candidate=Number(native.toPrecision(precision));
    if(Math.fround(candidate)===native)return candidate;
  }
  return value;
}
const MINUTES_PER_DAY = 1440;
const MAX_OPENING_MINUTES = 5_000_000;
const MAX_OPENING_DAY = Math.floor(MAX_OPENING_MINUTES / MINUTES_PER_DAY) + 1;

const fields=[
  ['season_days','Days per wet or dry season',7,90,1],
  ['wet_rain_chance','Wet season · chance of rain (%)',0,100,1],
  ['dry_rain_chance','Dry season · chance of rain (%)',0,100,1],
  ['wet_evaporation','Wet season · drying factor',0.5,2,0.05],
  ['dry_evaporation','Dry season · drying factor',0.5,2,0.05],
  ['intro_days','Beginner afternoon weather · days',0,14,1],
];
export class WeatherEditor{
  constructor(host,{defaults,biomes=[],change}){
    this.defaults=defaults;this.biomes=biomes;this.effective=defaults;this.host=host;
    host.innerHTML='<p>A compressed game calendar. Rain chances apply per day; drying factors affect soil water loss. Beginner weather applies only to Story rules.</p>'+fields.map(([key,label,min,max,step])=>`<div class="creator-field"><label for="creator-weather-${key}">${label}</label><input id="creator-weather-${key}" data-weather="${key}" type="number" min="${min}" max="${max}" step="${step}"></div>`).join('')+'<button type="button" data-weather-reset>Use landscape weather</button><p data-weather-note></p>';
    const opening = document.createElement('fieldset');
    opening.className = 'creator-opening-date';
    opening.innerHTML = `<legend>Opening date</legend>
      <div class="creator-coordinates">
        <label class="creator-field">Day<input data-opening-day type="number" min="1" max="${MAX_OPENING_DAY}" step="1"></label>
        <label class="creator-field">Time<input data-opening-time type="time" step="60"></label>
      </div>
      <button type="button" data-opening-apply>Set opening date</button>
      <p data-opening-status role="status"></p>`;
    host.prepend(opening);
    this.day = opening.querySelector('[data-opening-day]');
    this.time = opening.querySelector('[data-opening-time]');
    this.openingStatus = opening.querySelector('[data-opening-status]');
    opening.querySelector('[data-opening-apply]').onclick = async () => {
      const day = this.day.valueAsNumber;
      const time = this.time.valueAsNumber / 60000;
      const minutes = (day - 1) * MINUTES_PER_DAY + time;
      if (!Number.isInteger(day) || day < 1 || day > MAX_OPENING_DAY ||
          !Number.isInteger(time) || minutes > MAX_OPENING_MINUTES) {
        this.openingStatus.textContent = 'Choose Day 1 at 00:00 through Day 3473 at 05:20.';
        return;
      }
      await change('Set opening date', draft => { draft.start.minutes = minutes; });
      this.render(this.definition, true, this.openingWeather);
    };
    host.onchange=async e=>{const key=e.target.dataset.weather;if(!key)return;const value=Number(e.target.value);if(!await change('Change weather conditions',d=>{d.rules.weather??=structuredClone(this.effective);d.rules.weather[key]=value;}))this.render(this.definition,true);};
    host.querySelector('[data-weather-reset]').onclick=async()=>{if(!await change('Restore familiar village weather',d=>{delete d.rules.weather;}))this.render(this.definition,true);};
  }
  render(definition,force=false,openingWeather=this.openingWeather){
    const minutes = definition.start.minutes;
    if (force || definition.id !== this.definition?.id || minutes !== this.definition?.start.minutes) {
      const time = Math.floor(minutes % MINUTES_PER_DAY);
      this.day.value = Math.floor(minutes / MINUTES_PER_DAY) + 1;
      this.time.value = [Math.floor(time / 60), time % 60].map(n => String(n).padStart(2, '0')).join(':');
    }
    this.openingWeather = openingWeather;
    this.openingStatus.textContent = openingWeather
      ? `${openingWeather.season === 'wet' ? 'Wet' : 'Dry'} season · day ${openingWeather.season_day} of ${definition.rules.weather?.season_days ?? this.biomes.find(b => b.id === definition.map.biome?.id)?.weather.season_days ?? this.defaults.season_days}`
      : 'Resolve the draft’s blocking issues to see its opening season.';
    this.definition=definition;
    this.effective=this.biomes.find(b=>b.id===definition.map.biome?.id)?.weather??this.defaults;
    const p=definition.rules.weather??this.effective;
    for(const [key]of fields){const input=this.host.querySelector(`[data-weather="${key}"]`);if(force||document.activeElement!==input)input.value=weatherDisplayValue(p[key]);input.disabled=!definition.rules.climate;}
    this.host.querySelector('[data-weather-note]').textContent=definition.rules.climate?'Weather is shared by forecasts, crops, rain collection and power.':'Seasonal weather is off. Enable it in village rules to apply these settings.';
  }
}
