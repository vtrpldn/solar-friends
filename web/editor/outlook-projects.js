export function projectPlaces(checkpoint,buildings,name){
 const bindings=JSON.parse(checkpoint).village.scenario?.buildings??{},authored=new Map(buildings.map(b=>[b.id,b]));
 return Object.entries(bindings).flatMap(([id,runtime])=>{const b=authored.get(id);return b?[{runtime,id,name:name(b.kind),x:b.x,y:b.y}]:[];});
}
// Native replay decides completion and blockers; authored metadata only names
// and locates the original worksite. No construction rules are duplicated here.
export function projectMarkup(projects,places,{escape,time}){
 if(!projects.length)return '<p>No construction projects were underway at arrival.</p>';
 return `<section data-outlook-projects><h4>Building plans</h4><p>These outcomes follow the current plans and supplies. Completion windows are conditional and rounded to half-hour boundaries.</p>${projects.map(p=>{const place=places.get(String(p.building));return `<div class="creator-outlook-project"><h5>${escape(place?.name??'Construction project')}</h5>${place?`<p>Column ${escape(place.x)} · Row ${escape(place.y)}</p>`:''}<p>${p.window?`Projected completion: ${time(p.window[0])} to ${time(p.window[1])}.`:`At the end of this outlook: ${escape(p.blocker??'Unfinished within this outlook window.')}`}</p>${place?`<button type="button" data-outlook-project="${escape(p.building)}">Show building on map</button>`:''}</div>`;}).join('')}</section>`;
}
