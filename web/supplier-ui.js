import {itemIcon,materialIcons} from './game-ui.js';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:n%100?2:0,maximumFractionDigits:2}).format(n/100);
const day=n=>`Day ${n+1}`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installSupplierUI({snapshot,game,changed,addOffer}){
  const root=document.querySelector('#supplier-board');let key='',artMaterial=null;
  root.innerHTML=`<div id="supplier-heading" class="supplier-heading"><h3>Town notice board</h3><p id="supplier-notice"></p><label id="supplier-option" hidden><input id="supplier-variation" type="checkbox"> Seasonal suppliers</label></div><div id="supplier-offer" hidden><div id="supplier-offer-art"></div><div><b id="supplier-offer-name"></b><small id="supplier-offer-price"></small><small id="supplier-offer-stock"></small></div><button id="supplier-add-offer">Add offer</button></div><small id="supplier-assurance"></small><details id="supplier-future"><summary>Upcoming trade & freight</summary><div id="supplier-next"></div><p class="supplier-calendar-note">Delivery dates below are for orders placed after 08:00. Confirming a basket locks its displayed date.</p><ol id="supplier-calendar"></ol><div id="supplier-price-watch"></div></details>`;
  const $=id=>root.querySelector('#'+id);
  const text=(id,value)=>{const node=$(id);if(node.textContent!==value)node.textContent=value;};
  $('supplier-variation').onchange=event=>{game().set_supplier_variation(event.target.checked);changed();};
  $('supplier-add-offer').onclick=()=>{const offer=snapshot().environment.economy.market.current.offer;if(offer?.remaining)addOffer(offer.material,offer.remaining);};
  function update(s){
    const e=s.environment.economy,m=e.market;if(!m)return;
    const nextKey=JSON.stringify([m,s.village.mode]);if(key===nextKey)return;key=nextKey;
    $('supplier-option').hidden=s.village.mode!=='sandbox';$('supplier-variation').checked=m.enabled;$('supplier-heading').hidden=m.active&&s.village.mode!=='sandbox';$('supplier-notice').hidden=m.active;
    $('supplier-offer').hidden=!m.active;$('supplier-future').hidden=!m.active;$('supplier-assurance').hidden=m.active;
    text('supplier-notice',!m.enabled?'Steady town prices and the usual delivery calendar.':!m.active?`Prices stay steady while we settle in. Seasonal trade begins on ${day(m.starts_day)}.`:`${m.current.season==='wet'?'Wet':'Dry'} season trade · this offer runs through ${day(m.restock_day-1)}.`);
    text('supplier-assurance',m.active?'Regular supplies remain available after an offer sells out. Confirmed prices and delivery dates stay agreed.':'Confirmed orders keep their agreed price and delivery date.');
    if(!m.active)return;
    const offer=m.current.offer,material=e.materials[offer.material],next=m.next.offer;
    if(artMaterial!==offer.material){$('supplier-offer-art').innerHTML=itemIcon(materialIcons[offer.material]);artMaterial=offer.material;}
    text('supplier-offer-name',material.name);text('supplier-offer-price',`${money(offer.unit_price)} each · 10% below this week’s ${money(material.price)}`);
    text('supplier-offer-stock',offer.remaining?`${offer.remaining} of ${offer.stock} offer units left through ${day(m.restock_day-1)} · extra units use the regular price`:`This offer is taken · regular supplies are still available`);
    $('supplier-add-offer').disabled=offer.remaining===0;
    $('supplier-next').innerHTML=next?`<b>Next restock · ${day(m.next.day)}</b><p>${next.stock} ${escape(e.materials[next.material].name.toLowerCase())} at ${money(next.unit_price)} each.</p>`:`<p>Next restock · ${day(m.next.day)}</p>`;
    $('supplier-calendar').innerHTML=m.calendar.map(d=>`<li><b>${day(d.day)}</b><span>Delivery ${day(Math.floor(d.delivery/1440))} · 10:00${Math.floor(d.delivery/1440)-d.day>1?' · extra freight day':''}</span></li>`).join('');
    const watch=[...new Set([offer.material,next?.material,8,9,10,16])].filter(i=>i!=null);
    $('supplier-price-watch').innerHTML=`<b>Regular prices at the next restock</b>${watch.map(i=>`<p><span>${escape(e.materials[i].name)}</span><span>${money(m.current.prices[i])} → ${money(m.next.prices[i])}</span></p>`).join('')}`;
  }
  return {update};
}
