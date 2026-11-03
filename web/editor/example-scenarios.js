export const exampleScenarios=Object.freeze([
 Object.freeze({id:'first-clearing',title:'First clearing',biome:'Mata Atlântica',summary:'A gentle arrival: plan homes, buy missing parts, share a kitchen and grow a healthy pantry.',file:'first-clearing.solar-scenario'}),
 Object.freeze({id:'before-the-dry-season',title:'Before the dry season',biome:'Cerrado',summary:'The friends prepare reachable water reserves and a small garden before the wet season ends.',file:'before-the-dry-season.solar-scenario'}),
 Object.freeze({id:'an-inherited-village',title:'An inherited village',biome:'Caatinga',summary:'Repair failed equipment and restore water, sanitation and evening light with the founding friends.',file:'an-inherited-village.solar-scenario'}),
]);
export async function loadExampleScenario(id,validate){
 const example=exampleScenarios.find(e=>e.id===id);if(!example)throw Error('Choose an available example scenario.');
 const response=await fetch(new URL('../examples/'+example.file,import.meta.url));if(!response.ok)throw Error('This example could not load. Your saved creations are unchanged.');
 const raw=await response.text();if(new TextEncoder().encode(raw).length>2*1024*1024)throw Error('This example is too large to open.');
 const result=validate(raw);if(!result?.ok)throw Error('This example needs another game version. Your saved creations are unchanged.');
 return JSON.parse(raw);
}
