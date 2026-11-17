import {foodPortions} from './food-storage.js';
import {wasteWarnings} from './session-ui.js';

// Current service and reserve observations, not forecasts of future production.
export function basicNeeds(s) {
 const nodes=Object.values(s.infrastructure?.nodes||{}),enabled=nodes.filter(n=>n.enabled!==false);
 const count=s.people?.length||0,sys=s.infrastructure||{};
 const item=(id,label,status,summary,detail,panel)=>({id,label,status,summary,detail,panel});
 const loads=enabled.filter(n=>n.demand>0),short=loads.filter(n=>(n.power||0)<.99);
 const importing=sys.grid?.importing||0;
 const power=item('power','Power',short.length?'alert':importing>0?'watch':loads.length?'good':'neutral',short.length?'Shortage':importing>0?'Grid backup':loads.length?'Supplied':'No demand',short.length?`${short.length} building${short.length===1?'':'s'} undersupplied`:importing>0?`${importing.toFixed(1)} kW imported now`:`${loads.reduce((n,a)=>n+a.demand,0).toFixed(1)} kW requested`,'power');
 const fresh=Math.max(0,sys.nodes?.[0]?.water?.[0]||0),hours=count?fresh/(count*.6):0;
 const water=item('water','Water',!count?'neutral':fresh<=0?'alert':hours<6?'watch':'good',!count?'No residents':fresh<=0?'Empty at camp':hours<6?'Low reserve':'In reserve',`${fresh.toFixed(0)} L at camp · drinking only`,'water');
 const portions=foodPortions(s),days=count?portions/(count*2):0;
 const food=item('food','Food',!count?'neutral':!portions?'alert':days<1?'watch':'good',!count?'No residents':!portions?'No ready food':days<1?'Low reserve':'In reserve',`${portions} portions · ${days.toFixed(1)} days estimated`,'resources');
 if(s.mode==='sandbox'){food.status='neutral';food.summary='Sandbox';food.detail='Unlimited food supplies';}
 const toilets=enabled.filter(n=>['home','eco_toilet'].includes(n.kind));
 const usable=toilets.filter(n=>n.capacity[3]-n.water[3]>=1.5);
 const tanks=enabled.filter(n=>wasteWarnings(n).length);
 const washing=enabled.some(n=>['home','wash-station','eco_toilet','camp'].includes(n.kind)&&n.water[0]>=1&&n.capacity[2]-n.water[2]>=.8);
 const waiting=(s.people||[]).filter(r=>r.needBlocked&&['bladder','bowels','hygiene'].some(k=>r.needs?.[k]<30));
 const sanitation=item('sanitation','Sanitation',waiting.length?'alert':!usable.length||tanks.length||!washing?'watch':'good',waiting.length?'Residents waiting':!usable.length?'Temporary':tanks.length?'Tanks filling':!washing?'River washing':'Available',waiting.length?`${waiting.length} resident${waiting.length===1?'':'s'} need care`:!usable.length?'Camp latrine fallback':tanks.length?`${tanks.length} tank site${tanks.length===1?'':'s'} at 90%+`:!washing?'No stocked washing facility':`${usable.length} toilet site${usable.length===1?'':'s'} · washing stocked`,'water');
 return [power,water,food,sanitation];
}

export function renderBasicNeeds(root,s) {
 const statuses=basicNeeds(s),marks={good:'✓',watch:'!',alert:'!',neutral:'·'};
 let sanitation=root.querySelector('.need-sanitation');
 if(!sanitation){sanitation=document.createElement('button');sanitation.type='button';sanitation.className='need-sanitation';sanitation.dataset.panel='water';sanitation.textContent='WC';root.append(sanitation);}
 const buttons={food:root.children[1],power:root.children[2],water:root.children[3],sanitation};
 for(const row of statuses){
  const b=buttons[row.id];b.dataset.need=row.id;b.dataset.status=row.status;
  const status=b.querySelector('.resource-trend');
  if(status){status.textContent=`${marks[row.status]} ${row.summary}`;status.classList.add('need-status');}
  b.setAttribute('aria-label',`${row.label}: ${row.summary}. ${row.detail}. Open management.`);
  const explanation=row.id==='food'?'Estimate: two portions per resident per day, before spoilage; excludes uncooked crops and cargo.':row.id==='water'?'Low reserve: under six drinking hours at camp. Washing and irrigation need additional water.':row.id==='sanitation'?'Current stock and observed waiting; access and occupancy may still limit service.':'Current requested loads; future work and nighttime lighting may need more power.';
  b.title=`${row.label}: ${row.summary}. ${row.detail}. ${explanation} Click to manage.`;
 }
}
