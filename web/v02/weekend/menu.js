import {saveSlots} from "./save-slots.js";
import {installSaveDialog} from "./save-dialog.js";
import {DEFAULT_SETTINGS,OPTIONS,PRESETS,BIOMES,applySettings,registerWorld,townDuration} from './world-settings.js';
import {elevationVertex} from './elevation.js';
import {riverCenter,riverWidth} from './river-layout.js';
import { freshLandSeed } from "./land-layout.js";
import { createWeekend, createSandbox, save, restore, beginArrival } from "./simulation.js";
import { saveKey } from "./modes.js";
const $ = (id) => document.getElementById(id);
let pending = null;
installSaveDialog($("saved-villages"));
function existing(mode) {
  try {
    return restore(localStorage.getItem(saveKey(mode)));
  } catch {
    return null;
  }
}
function enter(mode) {
  location.href = `./?mode=${mode}`;
}
const story = existing("story"),
  sandbox = existing("sandbox");
$("continue-game").hidden = !story;
$("continue-sandbox").hidden = !sandbox;
if (!story)
  document.querySelector('[data-start="story"]').classList.add("primary");
const storyProjectCount=story?.projects.filter(p=>!p.natural).length || 0;
if (story)
  $("continue-label").textContent =
    story.stage === "arrival"
      ? "Choose a place for your tents."
      : `${storyProjectCount} ${storyProjectCount === 1 ? "project" : "projects"} · R$${story.money.toFixed(2)} shared savings`;
$("continue-game").onclick = () => enter("story");
$("continue-sandbox").onclick = () => enter("sandbox");
function start(mode) {
  try {
    saveSlots(localStorage).detach(mode);
    localStorage.setItem(
      saveKey(mode),
      save(
        beginArrival(applySettings(mode === "sandbox"
          ? createSandbox(Number($("setup-seed").value))
          : createWeekend(Number($("setup-seed").value)),readSettings())),
      ),
    );
    enter(mode);
  } catch {
    $("menu-status").textContent =
      "This browser could not save your village. Allow local storage and try again.";
  }
}
document.querySelectorAll("[data-start]").forEach(
  (b) =>
    (b.onclick = () => {
      pending = b.dataset.start;
      for(const key of ["savings","supplies"]) $("setup-"+key).disabled=pending==="sandbox";
      $("setup-seed").value=freshLandSeed();
      $("world-setup").showModal();updatePreview();
    }),
);
$("cancel-new").onclick = () => $("replace-save").close();
$("confirm-new").onclick = () => start(pending);

const labels={biome:'Brazilian biome',landscape:'Landscape',water:'Water availability',resources:'Land resources',savings:'Starting savings',supplies:'Starting supplies',town:'Town access'};
const names={'mata-atlantica':'Mata Atlântica',cerrado:'Cerrado',caatinga:'Caatinga',gentle:'Gentle',rolling:'Rolling',rugged:'Rugged',dry:'Dry',seasonal:'Seasonal',abundant:'Abundant',sparse:'Sparse',balanced:'Balanced',rich:'Rich',tight:'Tight · R$100',modest:'Modest · R$220',comfortable:'Comfortable · R$600',essentials:'Bare essentials · 60% supplies',camp:'Weekend camp · standard supplies',prepared:'Well prepared · 170% supplies',nearby:'Nearby · 45 seconds',drive:'A drive away · 55 seconds',remote:'Remote · 110 seconds'};
for(const [key,values] of Object.entries(OPTIONS)){
 const label=document.createElement('label');label.textContent=labels[key];const select=document.createElement('select');select.id='setup-'+key;
 for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=names[value];select.append(option);}
 select.value=DEFAULT_SETTINGS[key];select.onchange=()=>{$('setup-preset').value='custom';updatePreview();};label.append(select);$('setup-fields').append(label);
}
function readSettings(){return Object.fromEntries(Object.keys(OPTIONS).map(key=>[key,$('setup-'+key).value]));}
function updatePreview(){
 const seed=Number($('setup-seed').value),settings=readSettings();if(!Number.isInteger(seed)||seed<1||seed>4294967295)return;
 registerWorld(seed,settings);const canvas=$('land-preview'),ctx=canvas.getContext('2d'),palette=BIOMES[settings.biome].colors;
 for(let px=0;px<400;px+=4)for(let py=0;py<400;py+=4){const x=px/400*256-128,z=py/400*256-128,h=elevationVertex(x,z,seed);
 ctx.fillStyle=palette[0];ctx.fillRect(px,py,4,4);ctx.fillStyle=`rgba(40,60,20,${Math.min(.55,h/20)})`;ctx.fillRect(px,py,4,4);
 if(Math.abs(x-riverCenter(z,seed))<riverWidth(z,seed)+2){ctx.fillStyle='#69aaa0';ctx.fillRect(px,py,4,4);}}
 ctx.fillStyle='#fff4d7';ctx.beginPath();ctx.arc(200,200,5,0,Math.PI*2);ctx.fill();
 $('setup-summary').textContent=pending==='sandbox'?'Sandbox keeps unlimited supplies and money. Landscape, biome, water and resources still shape the plot.':`${names[settings.savings]} · ${names[settings.supplies]} · ${townDuration(settings.town)}s town trip, plus loading and walking.`;
}
$('setup-preset').onchange=()=>{const preset=PRESETS[$('setup-preset').value];if(preset)for(const [key,value] of Object.entries(preset))$('setup-'+key).value=value;updatePreview();};
$('setup-seed').oninput=updatePreview;
$('reroll-land').onclick=()=>{$('setup-seed').value=freshLandSeed();updatePreview();};
$('setup-back').onclick=()=>$('world-setup').close();
$('setup-start').onclick=()=>{
 if(!$('setup-seed').checkValidity()){ $('setup-seed').reportValidity();return; }
 if(existing(pending)){$('replace-copy').textContent=`This replaces your current ${pending} autosave. Named villages and the other mode are kept.`;$('replace-save').showModal();}
 else start(pending);
};

if(new URLSearchParams(location.search).has('load-error')) $('menu-status').textContent='Your village could not be loaded. Its save has been preserved. Open Load village to export it or try the previous save; no fresh village has overwritten it.';
