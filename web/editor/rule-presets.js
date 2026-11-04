export const ruleOptions=Object.freeze([
 {key:'logistics',label:'Materials, hauling and resident work',on:'Construction needs materials, transport and resident work.',off:'Construction is free and instant.'},
 {key:'land',label:'Living soil and finite land resources',on:'Soil, shade and finite reserves affect local production.',off:'Neutral growing conditions; extraction does not deplete finite deposits.'},
 {key:'utilities',label:'Connected local water and power',on:'Water and electricity need usable local supplies and connections.',off:'Local utility constraints are relaxed; owned stock and charge are retained.'},
 {key:'climate',label:'Seasonal weather',on:'The regional climate affects rain, drying and seasonal planning.',off:'Seasonal climate simulation is disabled.'},
 {key:'maintenance',label:'Equipment condition and repairs',on:'Equipment wears and needs service.',off:'Equipment wear and automatic maintenance are disabled.'},
 {key:'learning',label:'Learning through useful work',on:'Useful work can develop residents’ skills.',off:'Learning is disabled; existing skills are retained.'},
 {key:'market',label:'Changing town prices and offers',on:'Town terms can change with the market.',off:'Town prices stay fixed; purchases are still available.'},
].map(Object.freeze));
export const rulePresetDescriptions=Object.freeze({relaxed:'Free, instant construction with relaxed land and utility rules. Seasonal climate, wear, learning and changing town terms are disabled.',simulation:'Manage materials, resident work, land, connected supplies, regional climate, equipment care, learning and changing town terms.',custom:'Choose each switch below. The current settings stay in place until you change them.'});
export function matchingRulePreset(rules){if(ruleOptions.every(({key})=>rules[key]===false))return 'relaxed';if(ruleOptions.every(({key})=>rules[key]===true))return 'simulation';return 'custom';}
export function applyRulePreset(definition,preset){if(!['relaxed','simulation'].includes(preset))throw Error('Choose Relaxed or Simulation, or adjust the individual switches.');for(const {key}of ruleOptions)definition.rules[key]=preset==='simulation';}
export class RuleEditor{
 constructor(host,{change}){
  this.host=host;this.change=change;
  host.innerHTML='<div class="creator-field"><label for="creator-rule-preset">Village rules</label><select id="creator-rule-preset" aria-describedby="creator-rule-preset-note"><option value="relaxed">Relaxed</option><option value="simulation">Simulation</option><option value="custom">Custom</option></select></div><p id="creator-rule-preset-note" class="creator-rule-explanation"></p><p class="creator-map-note">Placement and building access still apply. Building unlocks and journal goals are separate from these rules.</p>'+ruleOptions.map(({key,label})=>`<label class="creator-rule creator-rule-option"><input id="creator-rule-${key}" type="checkbox" data-rule="${key}" aria-label="${label}" aria-describedby="creator-rule-help-${key}"><span><b>${label}</b><small id="creator-rule-help-${key}"></small></span></label>`).join('');
  this.select=host.querySelector('#creator-rule-preset');this.note=host.querySelector('#creator-rule-preset-note');
  host.addEventListener('change',event=>{if(event.target===this.select){const value=event.target.value;if(value==='custom'){this.note.textContent=rulePresetDescriptions.custom;return;}change('Use '+(value==='relaxed'?'Relaxed':'Simulation')+' village rules',d=>applyRulePreset(d,value));return;}const key=event.target.dataset.rule;if(ruleOptions.some(rule=>rule.key===key)){const checked=event.target.checked;change('Change village rules',d=>{d.rules[key]=checked;});}});
 }
 render(definition,{force=false}={}){
  const rules=definition.rules,signature=JSON.stringify([definition.id,...ruleOptions.map(({key})=>rules[key])]);
  if(force||signature!==this.signature){this.select.value=matchingRulePreset(rules);this.note.textContent=rulePresetDescriptions[this.select.value];this.signature=signature;}
  for(const {key,on,off}of ruleOptions){this.host.querySelector('#creator-rule-'+key).checked=rules[key];this.host.querySelector('#creator-rule-help-'+key).textContent=rules[key]?on:off;}
 }
}
