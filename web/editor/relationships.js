import {paintResidentPortrait} from '../resident-portrait.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class RelationshipsEditor{
 constructor(host,{presets,art,change}){
  this.host=host;this.presets=presets;this.art=art;
  host.addEventListener('change',event=>{
   const from=event.target.dataset.bondFrom,to=event.target.dataset.bondTo;if(!from||!to)return;
   const memories=Number(event.target.value);
   change('Change shared memories',d=>{
    d.start.relationships=(d.start.relationships??[]).filter(b=>!(b.from===from&&b.to===to||b.from===to&&b.to===from));
    if(memories!==0)d.start.relationships.push({from,to,memories});
   });
  });
  host.addEventListener('click',event=>{if(event.target.closest('[data-clear-bonds]'))change('Clear starting friendships',d=>{delete d.start.relationships;});});
 }
 render(d){
  const people=d.start.residents??this.presets,bonds=d.start.relationships??[],signature=JSON.stringify([people.map(p=>[p.id,p.name,p.preset,p.preset_version,p.appearance]),bonds]);
  if(signature===this.signature)return;this.signature=signature;
  this.definition=d;
  const pending=people.map(person=>person.appearance).filter(a=>a?.schema===2&&!this.art.appearances.isReady(a));
  if(pending.length)Promise.all(pending.map(a=>this.art.appearances.prepare(a))).then(()=>{if(this.definition===d){this.signature=null;this.render(d);}},()=>{});
  this.host.innerHTML='<p>Shared memories from before arrival. Gatherings and visits to the square can build new memories during play.</p>'+people.flatMap((from,i)=>people.slice(i+1).map(to=>{
   const bond=bonds.find(b=>b.from===from.id&&b.to===to.id||b.from===to.id&&b.to===from.id);
   const person=p=>`<span class="creator-bond-person"><canvas width="48" height="54" data-bond-portrait="${escape(p.appearance?.preset??p.preset)}" data-bond-resident="${escape(p.id)}" aria-hidden="true"></canvas><span>${escape(p.name)}</span></span>`;
   const named=p=>`${p.name} (${this.presets.find(base=>base.preset===(p.appearance?.preset??p.preset))?.name??p.preset} appearance)`;
   return `<label class="creator-field"><span class="creator-bond-pair">${person(from)} ↔ ${person(to)}</span><input aria-label="Shared memories: ${escape(named(from))} and ${escape(named(to))}" type="number" min="0" max="100" step="1" value="${bond?.memories??0}" data-bond-from="${escape(from.id)}" data-bond-to="${escape(to.id)}"></label>`;
  })).join('')+`<button type="button" data-clear-bonds ${bonds.length?'':'disabled'}>Clear shared history</button>`;
  const byId=new Map(people.map(person=>[person.id,person]));
  for(const canvas of this.host.querySelectorAll('[data-bond-resident]')){
   const person=byId.get(canvas.dataset.bondResident),appearance=person.appearance??{preset:person.preset,version:person.preset_version};
   try{paintResidentPortrait(canvas,appearance,this.art.appearances);}
   catch{const unavailable=document.createElement('span');unavailable.textContent='?';unavailable.setAttribute('aria-label','Resident artwork unavailable');unavailable.title='This appearance or artwork revision is unavailable. Keep the original creation.';canvas.replaceWith(unavailable);}
  }
 }
}
