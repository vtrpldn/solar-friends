// These are views of one draft, never wizard steps or separate documents.
export const workspaceNames={land:'Land',people:'Friends',village:'Village',story:'Journal',review:'Check & share'};
const sections={
 land:['creator-ground','creator-biome-setting','creator-weather','creator-geology'],
 people:['creator-residents','creator-relationships'],
 village:['creator-routes','creator-starting-conditions','creator-supplies','creator-equipment','creator-liquids'],
 story:['creator-regions','creator-journal'],
 review:['creator-opening-setup','creator-outlook','creator-validation','creator-save-copy'],
};
const guidance={land:'Shape the property, choose its plants and inspect the ground.',people:'Create the friends, their routines and their shared history.',village:'Place buildings and paths, then choose supplies and utilities.',story:'Write the journal, draw goal regions and set up events.',review:'Review the opening, test village life and prepare a creation to share.'};
let activeNavigation;
export function revealWorkspaceSection(element){activeNavigation?.reveal(element);}
export class Workspaces {
 constructor({change=()=>{}}={}){
  activeNavigation=this;this.change=change;this.key=null;this.scroll=new Map();this.inspector=document.querySelector('.creator-inspector');this.tools=document.querySelector('.creator-tools');
  const nav=document.createElement('nav');nav.className='creator-workspace-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Creation workspace');
  nav.innerHTML=Object.entries(workspaceNames).map(([key,label])=>`<button type="button" role="tab" id="creator-tab-${key}" data-workspace="${key}" aria-controls="creator-workspace-${key}" aria-selected="false" tabindex="-1">${label}</button>`).join('');document.querySelector('.creator-top').after(nav);this.nav=nav;
  for(const [key,ids]of Object.entries(sections)){
   const panel=document.createElement('section');panel.id='creator-workspace-'+key;panel.dataset.workspacePanel=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','creator-tab-'+key);panel.hidden=true;
   const heading=document.createElement('h2');heading.textContent=workspaceNames[key];panel.append(heading);for(const id of ids){const element=document.getElementById(id);if(!element)throw Error('Missing creation section: '+id);panel.append(element);}this.inspector.append(panel);
  }
  const note=document.createElement('p');note.className='creator-workspace-guidance';this.tools.querySelector('h2').after(note);this.note=note;
  const landFields=['creator-brush-size','creator-habitat','creator-species','creator-nature-size'];for(const id of landFields)document.getElementById(id).closest('.creator-field').dataset.workspaceTools='land';
  const river=document.getElementById('creator-river-enabled').closest('label');river.dataset.workspaceTools='land';river.nextElementSibling.dataset.workspaceTools='land';
  for(const id of ['creator-sites','creator-buildings']){const el=document.getElementById(id);el.dataset.workspaceTools='village';el.previousElementSibling.dataset.workspaceTools='village';}document.getElementById('creator-route-tools').dataset.workspaceTools='village';
  for(const tool of ['road','region','camp','camera','habitat','nature','thin-nature','river','meadow']){const button=this.tools.querySelector(`[data-tool="${tool}"]`);button.dataset.workspaceTools=tool==='road'?'village':tool==='region'?'story':'land';}
  nav.onclick=e=>{const button=e.target.closest('[data-workspace]');if(button)this.select(button.dataset.workspace,{focus:true});};
  nav.onkeydown=e=>{const keys=Object.keys(workspaceNames),current=keys.indexOf(e.target.dataset.workspace);if(current<0||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?keys.length-1:(current+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length;this.select(keys[index],{focus:true});};
  // Existing contextual links open their actual details. Reveal its workspace
  // synchronously before scrolling; no caller needs to know tab structure.
  for(const [key,ids]of Object.entries(sections))for(const id of ids){const section=document.getElementById(id);if(section.tagName==='DETAILS')section.addEventListener('toggle',()=>{if(section.open&&section.closest('[data-workspace-panel]').hidden)this.select(key);});}
  this.select('land',{notify:false});
 }
 select(key,{notify=true,focus=false}={}){
  if(!Object.hasOwn(workspaceNames,key))key='land';
  if(this.key!==key){if(this.key)this.scroll.set(this.key,{tools:this.tools.scrollTop,inspector:this.inspector.scrollTop});this.key=key;document.getElementById('creator-selection').hidden=key!=='village'&&!this.hasSelection;
   for(const panel of this.inspector.querySelectorAll('[data-workspace-panel]'))panel.hidden=panel.dataset.workspacePanel!==key;
   for(const el of this.tools.querySelectorAll('[data-workspace-tools]'))el.hidden=el.dataset.workspaceTools!==key;
   for(const tab of this.nav.querySelectorAll('[role=tab]')){const selected=tab.dataset.workspace===key;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
   this.tools.querySelector('h2').textContent=workspaceNames[key];this.note.textContent=guidance[key];const scroll=this.scroll.get(key);this.tools.scrollTop=scroll?.tools??0;this.inspector.scrollTop=scroll?.inspector??0;if(notify)this.change(key);
  }
  if(focus)document.getElementById('creator-tab-'+key).focus();
 }
 review(report){const count=report.issues.filter(issue=>issue.severity==='error').length,tab=document.getElementById('creator-tab-review');tab.textContent=workspaceNames.review+(count?' · '+count:'');tab.dataset.errorCount=String(count);tab.title=count?`${count} blocking ${count===1?'issue':'issues'} · review before testing`:'Review the opening, test and share this creation';}
 context(visible){this.hasSelection=!!visible;document.getElementById('creator-selection').hidden=this.key!=='village'&&!visible;}
 reveal(element){const panel=element?.closest('[data-workspace-panel]');if(panel)this.select(panel.dataset.workspacePanel);}
}
