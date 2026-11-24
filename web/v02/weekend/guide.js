import {guideFacts} from './guide-facts.js';
export function installGuide({button,isPaused,savePauseState=isPaused,setPaused}) {
 const dialog=document.createElement('dialog');dialog.id='village-guide';dialog.setAttribute('aria-labelledby','guide-title');
 dialog.innerHTML=`<div class="guide-heading"><div><small>LEARN THE VILLAGE</small><h2 id="guide-title">Village guide</h2></div><span>Ⅱ Paused while you read</span><button id="guide-close" aria-label="Close Guide">×</button></div><div class="guide-layout"><nav aria-label="Guide systems"><label for="guide-search">Find a system</label><input id="guide-search" type="search" placeholder="Water, food, tools…"><div id="guide-topics"></div></nav><article id="guide-article" aria-live="polite"><p>Loading the Guide…</p></article></div>`;
 document.body.append(dialog);
 let resumePaused=false,savePaused=false,topics=null,current='autonomy',loading=null;
 const article=dialog.querySelector('#guide-article'),list=dialog.querySelector('#guide-topics'),search=dialog.querySelector('#guide-search');
 const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e;};
 function renderTopic(id){
  const topic=topics.find(t=>t.id===id);if(!topic)return;current=id;
  for(const b of list.querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.topic===id));
  const title=text('h3',topic.title),intro=text('p',topic.description,'guide-intro');
  const frame=document.createElement('div');frame.className='guide-diagram';frame.tabIndex=0;frame.setAttribute('aria-label',`${topic.title} flow chart; scroll to explore`);
  const img=document.createElement('img');img.src=new URL(`./guide/${topic.id}.svg`,import.meta.url).href;img.alt=`${topic.title}. ${topic.description}`;img.draggable=false;img.onerror=()=>{frame.replaceChildren(text('p','This diagram could not load. Reopen the Guide to try again.'));};frame.append(img);
  const controls=document.createElement('div');controls.className='guide-chart-controls';let zoom=1;
  const fit=()=>{zoom=1;img.style.width='100%';img.style.maxWidth=img.naturalWidth?`${img.naturalWidth}px`:'100%';};img.onload=fit;
  for(const [label,action]of [['Fit width',fit],['Zoom in',()=>{zoom=Math.min(4,zoom+.25);img.style.width=`${zoom*100}%`;img.style.maxWidth='none';}],['Zoom out',()=>{zoom=Math.max(.5,zoom-.25);img.style.width=`${zoom*100}%`;img.style.maxWidth='none';}]]){const b=text('button',label);b.type='button';b.onclick=action;controls.append(b);}
  const tip=document.createElement('aside');tip.className='guide-tip';tip.append(text('h4','More autonomy'),text('p',topic.tip));
  article.replaceChildren(title,intro,frame,controls,tip);
  const facts=guideFacts(topic.facts);if(facts.length){const ul=document.createElement('ul');ul.className='guide-facts';for(const fact of facts)ul.append(text('li',fact));article.append(ul);}
  if(topic.boundary)article.append(text('p',topic.boundary,'guide-boundary'));
  article.scrollTop=0;
 }
 function renderList(){
  const query=search.value.trim().toLowerCase();list.replaceChildren();
  const matches=topics.filter(t=>`${t.title} ${t.description} ${t.tip}`.toLowerCase().includes(query));
  for(const topic of matches){const b=text('button',topic.title);b.type='button';b.dataset.topic=topic.id;b.setAttribute('aria-current',String(topic.id===current));b.onclick=()=>renderTopic(topic.id);list.append(b);}
  if(!matches.length)list.append(text('p','No matching systems. Try water, crops or tools.'));
 }
 async function load(){
  if(!loading)loading=fetch(new URL('./guide/topics.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Guide unavailable');return r.json();}).then(data=>{topics=data;renderList();renderTopic(current);focusTopic();}).catch(()=>{loading=null;article.replaceChildren(text('p','The Guide could not load. Close it and try again.'));});
  return loading;
 }
 // Open on the topic being read, so arrows browse topics straight away.
 function focusTopic(){if(dialog.open&&(dialog.querySelector('#guide-close')===document.activeElement||!dialog.contains(document.activeElement)))list.querySelector('[aria-current="true"]')?.focus({preventScroll:true});}
 button.onclick=()=>{if(dialog.open)return;resumePaused=isPaused();savePaused=savePauseState();setPaused(true);dialog.showModal();load().then(focusTopic);};
 dialog.querySelector('#guide-close').onclick=()=>dialog.close();
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dialog.close();}});
 dialog.addEventListener('close',()=>{setPaused(resumePaused);button.focus({preventScroll:true});});
 search.oninput=()=>{if(topics)renderList();};
 return {get isOpen(){return dialog.open;},get resumePaused(){return savePaused;}};
}
