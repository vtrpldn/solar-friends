const classes={fresh:'Fresh water',irrigation:'Reclaimed irrigation',greywater:'Greywater',sewage:'Sealed sewage',electricity:'Electricity'};
const names={battery:'Recovered battery',pump:'Water pump',source_timber:'Timber plantation',source_bamboo:'Bamboo patch',camp:'Arrival barrels',well:'Cistern',garden:'Garden',greenhouse:'Greenhouse',kitchen:'Kitchen',home:'Home',eco_toilet:'Ecological toilet',coop:'Chicken coop',workshop:'Workshop',wetland:'Reed bed',banana_treatment:'Banana treatment bed',biodigester:'Biodigester',solar_farm:'Solar farm',hydro:'River generator',streetlight:'Street light',warehouse:'Storage house',square:'Square'};
export function installUtilityPlanner(api,root){
  root.innerHTML=`<div class="dev-grid"><section class="dev-card"><h3>Utility route planner</h3><p>Preview only. These routes do not install pipes or cables, reserve supplies, or change utility service. Install liquid lines through Supplies → Where water is → Pipes &amp; pumps. Install electrical circuits through Village → Power.</p><label for="dev-utility-kind">Utility class</label><select id="dev-utility-kind">${Object.entries(classes).map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}</select><label for="dev-utility-from">Supply or waste outlet</label><select id="dev-utility-from"></select><label for="dev-utility-to">Destination</label><select id="dev-utility-to"></select><p id="dev-utility-status" role="status"></p><p>Choose endpoints from the current scene. Unfinished buildings and buildings being moved are unavailable until their work finishes. Reading plans leaves your village untouched.</p><button id="dev-utility-refresh">Refresh route plan</button></section><section class="dev-card"><h3>Clear corridors</h3><svg id="dev-utility-map" role="img" aria-label="Utility route planning diagram" viewBox="0 0 28 28"></svg><p>Top-down grid · brown squares are roads; grey cells are unavailable. Blue marks supply ports and orange marks receiving ports. The dashed line is a proposed route between exact footprint edges.</p><p>A river generator has a short integral lead to the safe bank. Ordinary routes stay on land. Fresh water, irrigation, greywater, sewage and electricity remain separate.</p></section></div>`;
  const $=id=>root.querySelector('#'+id),kind=$('dev-utility-kind'),from=$('dev-utility-from'),to=$('dev-utility-to'),status=$('dev-utility-status'),map=$('dev-utility-map');
  let layout=null;
  function populate(select,options){
    const value=select.value;
    select.replaceChildren(...options.map(e=>new Option(`${names[e.kind]||e.kind}${e.id===-1?'':e.id< -1?` #${-2-e.id}`:` #${e.id}`} · ${e.x}, ${e.y}${e.ready?'':' · building work'}`,e.id)));
    if(options.some(e=>String(e.id)===value))select.value=value;
    select.disabled=!options.length;
  }
  function draw(result){
    const svg=[];
    svg.push('<rect width="28" height="28" fill="#8d9386"/>');
    for(const [x,y] of layout.corridors)svg.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#ece2c4" stroke="#d5c8a5" stroke-width=".04"/>`);
    for(const [x,y] of layout.roads)svg.push(`<rect x="${x+.12}" y="${y+.12}" width=".76" height=".76" fill="#b38a56"/>`);
    const supply=from.options.length?Number(from.value):null,destination=to.options.length?Number(to.value):null;
    const selected=layout.endpoints.filter(e=>e.id===supply||e.id===destination);
    for(const e of selected){
      const color=e.id===supply?'#18668c':'#9c4921',x=e.x-Math.floor(e.size/2),y=e.y-Math.floor(e.size/2);
      svg.push(`<rect data-utility-endpoint="${e.id}" x="${x}" y="${y}" width="${e.size}" height="${e.size}" fill="${color}" opacity="${e.ready?'.75':'.35'}"/><text x="${x+e.size/2}" y="${y+e.size/2+.23}" text-anchor="middle" font-size=".7" fill="white">${e.id===-1?'C':e.id< -1?'P'+(-2-e.id):e.id}</text>`);
      for(const p of e.ports)svg.push(`<circle cx="${p.edge[0]+.5}" cy="${p.edge[1]+.5}" r=".11" fill="${color}"/>`);
    }
    if(result.allowed){
      const p=result.plan,points=[p.start.edge,...p.cells,p.end.edge].map(([x,y])=>`${x+.5},${y+.5}`).join(' ');
      svg.push(`<polyline data-utility-route points="${points}" fill="none" stroke="#faf7e9" stroke-width=".33" stroke-linejoin="round"/><polyline points="${points}" fill="none" stroke="#2f5272" stroke-width=".16" stroke-dasharray=".3 .16" stroke-linejoin="round"/>`);
    }
    map.innerHTML=svg.join('');
    map.setAttribute('aria-label',`${classes[kind.value]} planning diagram${result.allowed?` · ${result.plan.cells.length} corridor cells`:' · no proposed route'}`);
  }
  function route(){
    if(!layout)return;
    const result=!from.options.length||!to.options.length?{allowed:false,reason:'This scene needs a compatible supply or outlet and destination.'}:api.utilityPreview(kind.value,Number(from.value),Number(to.value));
    status.textContent=result.allowed?`${classes[kind.value]} · ${result.plan.cells.length} corridor cells · ${result.plan.road_cells} along roads.${result.plan.start.bank_lead?' Includes the generator’s integral bank lead.':''} Proposal only; nothing installed.`:result.reason;
    draw(result);
  }
  function refresh(){layout=api.utilityEndpoints(kind.value);populate(from,layout.endpoints.filter(e=>e.supply));populate(to,layout.endpoints.filter(e=>e.receive));route();}
  kind.onchange=refresh;from.onchange=route;to.onchange=route;$('dev-utility-refresh').onclick=refresh;
  return {refresh};
}
