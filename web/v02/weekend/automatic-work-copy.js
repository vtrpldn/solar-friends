import {productionTarget} from './economy-policies.js';
import {quantityText} from './material-measures.js';
export function automaticWorkCopy(site,selected,recipes,materials){
 const active=!!site?.repeat,recipe=recipes[site?.repeat||selected],resource=Object.keys(recipe?.output||{})[0];
 const gathering=!!recipe?.gathering;
 return {active,label:active?(gathering?'Stop automatic gathering':'Stop automatic production'):(gathering?'Gather automatically':'Produce automatically'),
  detail:resource?`${active?'On':'Off'} · Target: ${materials[resource]?.name||resource} · ${quantityText(resource,productionTarget(site||{}))}. Queue another batch when village stock plus queued output is below this target. ${active?'Stopping leaves the current batch running.':''}`.trim():''};
}
