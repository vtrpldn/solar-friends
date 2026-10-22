const fold=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
// Header-only discovery: never load or modify maps, releases or village saves.
export function installLibraryDiscovery(){
 const search=document.querySelector('#creator-library-search'),kind=document.querySelector('#creator-library-kind'),order=document.querySelector('#creator-library-order'),status=document.querySelector('#creator-library-results'),clear=document.querySelector('#creator-library-clear');let groups=[];
 const apply=()=>{
  const words=fold(search.value).trim().split(/\s+/).filter(Boolean);let total=0,shown=0;
  for(const group of groups){
   const rows=[...group.rows].sort((a,b)=>order.value==='title'?String(a.record.title??'').localeCompare(String(b.record.title??''),undefined,{numeric:true,sensitivity:'base'})||String(a.record.id).localeCompare(String(b.record.id)):(b.record.updatedAt??0)-(a.record.updatedAt??0)||String(a.record.id).localeCompare(String(b.record.id)));let visible=0;
   for(const row of rows){const text=fold(`${row.record.title} ${row.record.author??''} ${row.record.contentRevision?`version ${row.record.contentRevision}`:''}`),match=(kind.value==='all'||kind.value===group.kind)&&words.every(word=>text.includes(word));row.node.hidden=!match;group.host.append(row.node);total++;if(match){shown++;visible++;}}
   group.host.hidden=visible===0;group.heading.hidden=visible===0;
  }
  status.textContent=total===0?'Your library is empty. Choose a beginning above.':shown===0?'No matches. Clear the search or choose another collection.':`${shown} of ${total} library entries`;
  clear.disabled=!search.value&&kind.value==='all'&&order.value==='recent';
 };
 search.addEventListener('input',apply);kind.addEventListener('change',apply);order.addEventListener('change',apply);const reset=(focus=false)=>{search.value='';kind.value='all';order.value='recent';apply();if(focus)search.focus();};clear.onclick=()=>reset(true);
 return {reset,set(projects,releases,runs,maps=[]){groups=[['draft',projects,'creator-project-list','creator-projects-heading','data-open-project'],['release',releases,'creator-release-list','creator-releases-heading','data-play-release'],['map',maps,'creator-map-list','creator-maps-heading','data-use-map'],['village',runs,'creator-run-list','creator-runs-heading','data-continue-run']].map(([kind,records,host,heading,attribute])=>{const node=document.getElementById(host),nodes=new Map([...node.querySelectorAll('.creator-library-row')].map(row=>[row.querySelector(`[${attribute}]`)?.getAttribute(attribute),row]));return {kind,host:node,heading:document.getElementById(heading),rows:records.map(record=>({record,node:nodes.get(record.id)})).filter(row=>row.node)};});apply();}};
}
