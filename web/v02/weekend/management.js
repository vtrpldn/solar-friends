import {basicNeeds} from './basic-needs.js';
import {animalCareText} from './animal-care.js';
import {foodControls} from './food-controls.js';
import {kitchenPlan} from './food-policy.js';
import {coolingStatus} from './cold-storage.js';
import {pantryForecast} from './food-planning.js';
import {gatheringStatus} from './gathering.js';
import {STARTING_ENDOWMENT} from './economy-reference.js';
import {supplierAvailable} from './supplier-stock.js';
import {materialLedger,materialReconciliation} from './material-ledger.js';
import {marketTerms} from './local-market.js';
import {inventoryOwnership} from './economy-inventory.js';
import {upkeep,upkeepText,serviceParts} from "./asset-upkeep.js";
import {biologyText,CROP_CARE,IRRIGATION_POLICIES} from "./biological-production.js";
import {materialUnitText,quantityText,physicalUnit} from "./material-measures.js";
import {tripEstimateText,GRID_TARIFF,ECONOMY_REFERENCE} from "./economy-reference.js";
import {coolingText} from './cold-storage.js';
import {foodStorageText} from './food-storage.js';
import {recipeLossText,productionSummary} from './production-accounting.js';
import {transportCost} from './physical-trade.js';
import {wasteWarnings, operationalStatus} from './session-ui.js';
import {upgradeAction, productionSearchText, productionActivity} from './project-ui.js';
import {economyControls} from './economy-controls.js';
import {financeSummary,financeTime,financeForecast} from './finances.js';
import { productionBlocker, buildingOperatingStatus } from './simulation.js';
import { disabledReason } from './disabled-info.js';
import { renderCrafting } from './crafting-ui.js';
import { equipmentSummary } from './equipment.js';
import { ITEMS } from './items.js';
import { inventoryGroups, EQUIPMENT_IDS } from "./resource-groups.js";
import { resourceIcon, illustrateResources } from "./resource-icons.js";
import {
  MATERIALS,
  PROJECTS,
  PROCESSES,
  materialCount, committedMaterials,
  storedMaterials,
  storageCapacity,
  queueProduction,
  queueWater, queuePurification, queueSanitation,
} from "./simulation.js";
import { LIQUIDS, hasPowerService, canSwitchBuilding, switchBuilding } from "./infrastructure.js";
import { illustrate } from "./ui-art.js";
const $ = (id) => document.getElementById(id);
const titles = {
  finances: "Finances",
  food: "Food",
  resources: "Resources",
  items: "Items & equipment",
  crafting: "Crafting & repairs",
  water: "Water & sanitation",
  power: "Power",
};
const intros = {
  food: "Feed the village today, keep a reserve for tomorrow, and make the most of every harvest.",
  crafting: "Make useful things, care for shared tools, and follow work around the village.",
  items: "Keep track of shared equipment and buy items from town. Open Crafting for resident-made items and repairs.",
  finances: "See what comes in, what goes out, and what keeps the village running. Click Savings at any time to return here.",
  resources:
    "Keep the essentials close, turn local materials into something useful, and plan the next trip to town.",
  water:
    "Residents maintain drinking reserves and sanitation by default; you can switch either routine off. Wells and rain barrels are manual sources; a placed powered pump supplies pipes. Untreated water stays separate.",
  power:
    "Balance generation, batteries and the buildings that depend on them. Completed buildings join the network automatically.",
};
export function createManagement({
  build,
  beforeOpen = () => {},
  state,
  refresh,
  inspect,
  notify,
  isPaused,
  setPaused,
}) {
  $("toggle-grid-power").onclick = () => {
    const grid = state().infrastructure.grid;
    grid.enabled = !grid.enabled;
    if (!grid.enabled) grid.importing = 0;
    notify(grid.enabled ? "Grid backup connected. You pay only for imported electricity." : "Grid disconnected. The village now relies on its own power.");
    refresh();
    render();
  };
  let purchaseSettingsOpen = false;
  const recipeChoices = new Map();
  const dialog = $("management");
  let view = "resources",
    wasPaused = false;
  const label = (n) =>
    n.id === -1
      ? "River · manual collection source"
      : n.id === 0
        ? "Camp stores"
        : `${PROJECTS[state().projects.find((p) => p.id === n.id).key].name} #${n.id}`;
  function open(next) {
    if (state().stage === "arrival") return;
    beforeOpen();
    const previousView = view;
    view = next;
    if (view === 'resources' || view === 'items' || view === 'food') {
      const purchase = $('purchase'), previous = purchase.value;
      purchase.replaceChildren();
      for (const group of inventoryGroups(view)) {
        const options = document.createElement('optgroup'); options.label = group.name;
        for (const id of group.ids) {
          const item = MATERIALS[id];
          if (item.quantity) options.append(new Option(`${item.quantity} ${item.name} · R$${item.price}`, id));
        }
        if (options.children.length) purchase.append(options);
      }
      if ([...purchase.options].some(o => o.value === previous)) purchase.value = previous;
      if (previousView !== view) $('resource-search').value = '';
    }
    if (!dialog.open) {
      wasPaused = isPaused();
      setPaused(true);
      dialog.showModal();
    }
    $("utility-kind").innerHTML = (view === "power" ? ["power"] : LIQUIDS)
      .map(
        (k) =>
          `<option value="${k}">${k === "power" ? "Power cable" : k === "fresh" ? "Fresh water" : k === "irrigation" ? "Irrigation water" : k === "greywater" ? "Greywater" : "Sealed sewage"}</option>`,
      )
      .join("");
    $("management-message").textContent =
      "Village paused while this screen is open.";
    refresh();
  }
  document
    .querySelectorAll("[data-manage]")
    .forEach((b) => (b.onclick = () => open(b.dataset.manage)));
  $("close-management").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    setPaused(wasPaused);
  });
  $("resource-search").oninput = () => render();
  $("utility-kind").onchange = refresh;
  function card(n) {
    const el = document.createElement("article");
    el.className = "network-node";
    const p = state().projects.find((p) => p.id === n.id);
    const heading = document.createElement("div");
    heading.className = "node-heading";
    const title = document.createElement("strong");
    title.textContent = label(n);
    if (p || n.id === 0) {
      const img = document.createElement("img");
      illustrate(img, p ? PROJECTS[p.key].asset : "produce-crates");
      heading.append(img);
    }
    if (n.id === -1) {
      const symbol = document.createElement("span");
      symbol.className = "node-symbol";
      symbol.textContent = "≈";
      symbol.setAttribute("aria-hidden", "true");
      heading.append(symbol);
    }
    heading.append(title);
    el.append(heading);
    const detail = document.createElement("div");
    detail.className = "node-detail";
    if (view === "power") {
      detail.textContent = !n.enabled
        ? "Switched off"
        : `${(n.generation || 0).toFixed(1)} kW generated · ${(n.demand || 0).toFixed(1)} kW requested${n.demand ? ` · ${n.power > 0.99 ? "Supplied" : "Needs power"}` : ""}`;
      if (n.battery) {
        const line = document.createElement("p");
        line.textContent = `Battery ${n.charge.toFixed(1)} / ${n.battery} kWh`;
        const meter = document.createElement("progress");
        meter.max = n.battery;
        meter.value = n.charge;
        detail.append(line, meter);
      }
    } else {
      for (const [i, k] of LIQUIDS.entries())
        if (n.capacity[i]) {
          const line = document.createElement("div");
          line.className = `water-level ${k}`;
          line.textContent = `${{ fresh: "Drinking water", irrigation: "Irrigation water", greywater: "Greywater", sewage: "Sewage" }[k]} · ${n.water[i].toFixed(1)} / ${n.capacity[i]}`;
          const meter = document.createElement("progress");
          meter.max = n.capacity[i];
          meter.value = n.water[i];
          line.append(meter);
          detail.append(line);
        }
      if (!n.enabled) {
        const off = document.createElement("p");
        off.textContent = "Switched off";
        detail.append(off);
      }
    }
    el.append(detail);
    if (p) {
      const actions = document.createElement("div");
      actions.className = "node-actions";
      const inspectButton = document.createElement("button");
      inspectButton.textContent = "Find in village";
      inspectButton.onclick = () => {
        dialog.close();
        inspect(p.id);
      };
      const toggle = document.createElement("button");
      toggle.textContent = n.enabled ? "Switch off" : "Switch on";
      toggle.onclick = () => {
        if (!switchBuilding(state().infrastructure,n.id)) return;
        notify(
          `${label(n)} ${n.enabled ? "switched on" : "switched off"}. Network supply updates when the village resumes.`,
        );
        refresh();
      };
      actions.append(inspectButton);
      if (canSwitchBuilding(state().infrastructure,n)) actions.append(toggle);
      el.append(actions);
    }
    if(view==='water' && n.id!==-1 && n.capacity[1]) {
      const actions=document.createElement('div');actions.className='node-actions';
      const waterJob=(state().operations||[]).find(o=>!o.done && o.water && o.site===n.id);
      const pending=!!waterJob;
      const fetch=document.createElement('button');fetch.textContent='Carry river water';
      disabledReason(fetch,pending ? "A water job is already queued here. Wait for it to finish." : "The untreated-water storage is full. Use water or add storage first.");
      fetch.disabled=pending || n.water[1]>=n.capacity[1];
      fetch.onclick=()=>{notify(queueWater(state(),-1,n.id,'irrigation')||'Water collection queued for the next available resident.');refresh();render();};actions.append(fetch);
      if(n.capacity[0]) {
        const purify=document.createElement('button');purify.textContent='Purify by hand';
        disabledReason(purify,pending ? "A water job is already queued here. Wait for it to finish." : n.water[1]<1 ? "Collect untreated water before purifying it." : "Drinking-water storage is full. Use water or add storage first.");
        purify.disabled=pending || n.water[1]<1 || n.capacity[0]-n.water[0]<1;
        purify.onclick=()=>{notify(queuePurification(state(),n.id)||'Purification queued for the next available resident.');refresh();render();};actions.append(purify);
      }
      if(n.capacity[0]) {const maintain=document.createElement('button');maintain.textContent=n.maintainFresh?'Maintain drinking reserve: on':'Maintain drinking reserve: off';maintain.setAttribute('aria-pressed',String(!!n.maintainFresh));maintain.onclick=()=>{n.maintainFresh=!n.maintainFresh;refresh();render();};actions.append(maintain);}
      const sources=Object.values(state().infrastructure.nodes).filter(a=>a.id!==n.id && ['groundwater-well','rain-barrel','water-pump'].includes(a.kind) && a.water[1]>=1);
      for(const source of sources){const carry=document.createElement('button');carry.textContent=`Carry from ${label(source)}`;disabledReason(carry,pending ? "Wait for the current water job to finish." : "The receiving reservoir is full.");carry.disabled=pending||n.water[1]>=n.capacity[1];carry.onclick=()=>{notify(queueWater(state(),source.id,n.id,'irrigation')||'Water collection queued.');refresh();render();};actions.append(carry);}
      el.append(actions);
    }
    if(view==='water' && (n.capacity[2] || n.capacity[3]) && !['wetland','biodigester','banana_treatment'].includes(n.kind)) {
      const status=document.createElement('p');status.textContent=wasteWarnings(n).join(' · ') || 'Sealed waste: residents can service tanks; treatment buildings automate disposal.';el.append(status);
      const sanitation=document.createElement('div');sanitation.className='node-actions';el.append(sanitation);
      const service=document.createElement('button');service.textContent='Service waste tanks';disabledReason(service,n.water[2]+n.water[3]<1 ? 'There is no accumulated waste to remove.' : 'A water or sanitation job is already queued here. Wait for it to finish.');service.disabled=n.water[2]+n.water[3]<1 || state().operations?.some(o=>!o.done&&o.water&&o.site===n.id);service.onclick=()=>{notify(queueSanitation(state(),n.id)||'Waste service queued for off-site treatment.');refresh();render();};sanitation.append(service);
      const auto=document.createElement('button');auto.textContent=n.maintainSanitation?'Maintain sanitation: on':'Maintain sanitation: off';auto.setAttribute('aria-pressed',String(!!n.maintainSanitation));auto.onclick=()=>{n.maintainSanitation=!n.maintainSanitation;refresh();render();};sanitation.append(auto);
    }
    if(view==='water'){
      const job=state().operations?.find(o=>!o.done&&o.water&&o.site===n.id);
      if(job){
        const status=document.createElement('p'),worker=state().people.find(r=>r.operation===job.id);
        const duration=job.water.service?45:job.water.purify?30:0;
        status.textContent=`${worker?worker.name:'Awaiting a rested resident'} · ${job.status||'Queued'}${job.water.amount?` · ${job.water.amount.toFixed(0)} water carried`:''}${duration?` · ${Math.min(100,Math.round(job.work/duration*100))}%`:''}`;
        el.append(status);
      }
    }
    return el;
  }
  function render() {
    if (!dialog.open) return;
    const s = state(),
      nodes = Object.values(s.infrastructure.nodes);
    dialog.dataset.screen = view;
    $("management-title").textContent = titles[view];
    $("management-intro").textContent = intros[view];
    document.querySelectorAll(".management-tabs [data-manage]").forEach((b) => {
      b.classList.toggle("active", b.dataset.manage === view);
      b.setAttribute("aria-pressed", String(b.dataset.manage === view));
    });
    $("grid-power-panel").hidden = view !== "power";
    $("grid-tariff-description").textContent=`Your own generation and batteries come first. Grid backup supplies up to ${ECONOMY_REFERENCE.electricity.capacityKw} kW at R$${GRID_TARIFF.toFixed(2)}/kWh. No standing charge. Collection budgets stay protected.`;
    const grid = s.infrastructure.grid;
    $("grid-power-status").textContent = `${grid.enabled ? (s.money <= 0 ? "No funds for grid power" : "Grid backup connected") : "Off-grid"} · ${grid.importing.toFixed(2)} kW imported now · ${grid.imported.toFixed(2)} kWh purchased · R$${grid.spent.toFixed(2)} spent`;
    $("toggle-grid-power").textContent = grid.enabled ? "Disconnect grid power" : "Connect grid backup";
    $("toggle-grid-power").setAttribute("aria-pressed", String(grid.enabled));
    const inventoryView = view === 'resources' || view === 'items' || view === 'food';
    $('inventory-heading').textContent = view === 'items' ? 'Our equipment' : view==='food'?'Our pantry':'In our stores';
    $('production-heading').textContent = view === 'items' ? 'Craft items' : view==='food'?'Our kitchens':'Making things together';
    $('resource-search').placeholder = view === 'items' ? 'Find an item…' : 'Find a resource…';
    $('resource-search').setAttribute('aria-label', view === 'items' ? 'Find an item' : 'Find a resource');
    document.querySelector('label[for="purchase"]').textContent = view === 'items' ? 'Town store · items & equipment' : 'Town store · resources';
    $("resource-screen").hidden = !inventoryView;
    $("pantry-panel").hidden = !inventoryView;
    $("network-screen").hidden = inventoryView || view === "finances" || view === "crafting";
    $("finance-screen").hidden = view !== "finances";
    $('crafting-screen').hidden = view !== 'crafting';
    if(view==='crafting')renderCrafting(s,$('crafting-screen'),notify,refresh);
    $("utility-panel").hidden = true;
    $("pantry-panel").parentElement.hidden = !inventoryView;
    $("haul-water").hidden = true;
    $("connect-utility").hidden = true;
    for (const id of ["utility-from", "utility-to", "utility-kind"]) {
      $(id).hidden = true;
      document.querySelector(`label[for="${id}"]`).hidden = true;
    }
    $("connection-title").textContent =
      view === "power" ? "Automatic power network" : "Automatic water network";
    $("connection-hint").textContent =
      view === "power"
        ? "Completed buildings connect automatically. Generation and battery capacity still determine whether the village has enough power."
        : "Completed buildings connect to compatible sources and treatment automatically. Place a water pump by a river or well for automatic supply; cisterns filter incoming untreated water. Greywater and sewage stay separate.";
    $("network-title").textContent =
      view === "power"
        ? "Generation, storage & demand"
        : "Sources, tanks & treatment";
    let stats;
    if(view === "finances") {
      const f=financeSummary(s), money=n=>`R$${n.toFixed(2)}`;
      stats=[["Shared savings",money(f.balance)],["Income recorded",money(f.income)],["Expenses recorded",money(f.expenses)],["Net change",`${f.net>=0?'+':'−'}${money(Math.abs(f.net))}`]];
      const screen=$("finance-screen");screen.replaceChildren();
      const add=(tag,text,parent=screen)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
      add('p',s.mode==='sandbox'?'Sandbox supplies and funds are unlimited; purchases are not tracked.':`Records begin ${financeTime(f.since)} with ${money(f.opening)}. Earlier purchases in an existing save are not reconstructed.`);
      add('p',`Available to spend: ${money(f.available)}. Reserved for undelivered construction supplies: ${money(f.committed)} in collection costs. This reserve stays in savings until each trip departs.`);
      add('h3','Seven-day outlook');
      const forecast=financeForecast(s);
      add('p',forecast.days?`Available cash could reach ${money(forecast.low)}–${money(forecast.high)} if the best or worst daily operating cash flow from the last ${forecast.days} complete days repeats. Mean operating change: ${money(forecast.mean)}/day. This is a scenario range, not guaranteed income; excludes new construction and assumes the same shopping, work and sales.`:'A forecast needs at least one complete recorded day. Future crops and unpaid exports are not included in available cash.');
      add('p',`Construction investment paid: ${money(Math.abs(f.categories.construction||0))}. Other cash spending: ${money(Math.max(0,f.expenses-Math.abs(f.categories.construction||0)))}. Stored supplies and installed buildings are assets, not spendable savings.`);
      const assets=inventoryOwnership(s,PROJECTS,PROCESSES,MATERIALS).values;
      add('p',`Starting circumstances: the land and ${STARTING_ENDOWMENT.vehicles} cars were already owned. Vehicle starting book value: ${money(STARTING_ENDOWMENT.bookValuePerVehicle)} each (scenario estimate, not a sale offer). Savings are working capital after buying the land; these assets do not pay cash income.`);
      add('h3','Store movements');
      const ledger=materialLedger(s),differences=materialReconciliation(s);
      add('p',Object.keys(differences).length?'Some stock changes predate or bypass the movement record. Current physical stock remains authoritative.':'Recorded opening stock plus arrivals minus use and transfers matches current stores.');
      for(const entry of ledger.entries.slice(-8).reverse())add('p',`${financeTime(entry.time)} · ${entry.quantity>0?'+':''}${quantityText(entry.id,entry.quantity)} ${MATERIALS[entry.id].name} · ${entry.reason}`);
      add('h3','Where our supplies are');
      add('p',`Replacement-cost estimates: stores ${money(assets.available)}; committed to projects or sales ${money(assets.reserved)}; processing inputs ${money(assets.processing)}; goods travelling ${money(assets.transit)}; building materials installed ${money(assets.installed)}. These estimates exclude land, cars, labor and depreciation; they are not resale quotes.`);
      add('h3','Protect everyday supplies');
      add('p','Blueprint auto-buy keeps this much cash for food and other essentials. It is a planning reserve, not a charge; everyday purchases and bills can still use it. Existing paid orders keep their collection budget.');
      const reserve=document.createElement('input');reserve.type='number';reserve.min='0';reserve.max='100000';reserve.value=s.expansionReserve??0;reserve.setAttribute('aria-label','Cash to keep before buying building materials');reserve.oninput=()=>{s.expansionReserve=Math.max(0,Math.min(100000,Number(reserve.value)||0));};screen.append(reserve);
      add('h3','Ongoing costs');
      add('p',`Grid power: ${money(f.gridRate)}/hour at the current import rate. Charges change with demand, local generation and available funds.`);
      const power=document.createElement('button');power.textContent='Manage grid power';power.onclick=()=>open('power');screen.append(power);
      const queued=(s.trade?.orders||[]).filter(o=>['queued','loaded'].includes(o.status));
      add('p',`Exports awaiting payment: ${money(queued.reduce((n,o)=>n+o.cents/100,0))} gross in ${queued.length} batches. This is reserved stock, not cash. Resident export trip costs ${money(transportCost({...s,deliveryOnly:false}))}.`);
      add('p',tripEstimateText(s.worldSettings?.town));
      add('h3','Asset upkeep');add('p',upkeepText(s));
      const service=upkeep(s),toggle=document.createElement('button');toggle.textContent=service.automatic?'Automatic upkeep: on':'Automatic upkeep: off';toggle.setAttribute('aria-pressed',String(service.automatic));toggle.onclick=()=>{service.automatic=!service.automatic;render();};screen.append(toggle);
      const allowance=document.createElement('input');allowance.type='number';allowance.min='0';allowance.max='100000';allowance.value=service.dailyBudget;allowance.setAttribute('aria-label','Daily upkeep materials allowance in reais');allowance.oninput=()=>{service.dailyBudget=Math.max(0,Math.min(100000,Number(allowance.value)||0));};allowance.onchange=()=>render();screen.append(allowance);
      const restockLabel=add('label','Daily feed and repair shopping budget including transport (R$)');
      const restock=document.createElement('input');restock.type='number';restock.min='0';restock.max='100000';restock.value=service.restockBudget??0;
      restock.onchange=()=>{service.restockBudget=Math.max(0,Math.min(100000,Number(restock.value)||0));render();};restockLabel.append(restock);
      add('p',`Spent today: ${money(service.restockSpent??0)}. Set a budget above zero to buy missing supplies for queued jobs. Residents use stores and gather available fodder first.`);
      if(service.jobs.length){
        const jobs=add('details','');add('summary',`Inspect ${service.jobs.length} upkeep jobs`,jobs);
        for(const job of service.jobs){
          const site=s.projects.find(p=>p.id===job.target),row=add('article','',jobs);
          add('strong',site?`${PROJECTS[site.key].name} #${site.id}`:`Car ${(job.vehicle??0)+1}`,row);
          add('p',job.status||'Waiting for an available resident',row);
          add('p',`${job.partsPaid?'Materials already reserved':'Required supplies'}: ${Object.entries(serviceParts(job)).map(([id,n])=>`${quantityText(id,n)} ${MATERIALS[id].name}`).join(' · ')}`,row);
          if(site){const find=add('button','Find in village',row);find.onclick=()=>{dialog.close();inspect(site.id);};}
        }
        const supplies=add('button','Manage service supplies',jobs);supplies.onclick=()=>open('resources');
      }
      add('h3','Where the money goes');
      const groups={outsideWork:'Outside work',commuting:'Commuting',transport:'Transport',sales:'Surplus sales',construction:'Building materials',purchases:'Operating supplies',household:'Household food',electricity:'Grid electricity'};
      for(const [key,label] of Object.entries(groups))add('p',`${label}: ${money(Math.abs(f.categories[key]||0))}`);
      add('h3','Recent transactions');
      if(!f.entries.length)add('p','No transactions recorded yet. Selling surplus brings income; purchases and imported power spend shared savings.');
      else {
        const table=add('table','');table.className='finance-ledger';
        const head=document.createElement('thead');table.append(head);const heading=add('tr','',head);
        for(const title of ['When','Transaction','Amount'])add('th',title,heading).scope='col';
        const body=document.createElement('tbody');table.append(body);
        for(const entry of f.entries.slice(0,30)){
          const row=add('tr','',body);add('td',financeTime(entry.time),row);add('td',entry.description,row);add('td',`${entry.amount>0?'+':'−'}${money(Math.abs(entry.amount))}`,row);
        }
      }
    }
    else if (view === 'crafting')
      stats=[['Craft jobs',s.operations?.filter(o=>!o.done&&PROCESSES[o.recipe]?.craft).length||0],['Residents',s.people.length]];
    else if (view === 'items')
      stats = [
        ['Shared savings', `R$${s.money.toFixed(2)}`],
        ['Items owned', [...EQUIPMENT_IDS].reduce((total, id) => total + materialCount(s, id), 0)],
        ['Crafting jobs', `${(s.operations || []).filter(o => !o.done && (PROCESSES[o.recipe]?.equipmentRepair || Object.keys(PROCESSES[o.recipe]?.output || {}).some(id => EQUIPMENT_IDS.has(id)))).length} queued`],
      ];
    else if(view==='food'){
      const f=pantryForecast(s),c=coolingStatus(s);
      stats=[['Edible portions',f.portions],['Reserve coverage',s.mode==='sandbox'?'Unlimited':`${f.days.toFixed(1)} days`],['At risk of spoilage',s.mode==='sandbox'?'Inactive':`${f.atRisk.toFixed(1)} portions`],['Powered cold storage',`${c.capacity} L`]];
    }
    else if (inventoryView)
      stats = [
        ["Shared savings", `R$${s.money.toFixed(2)}`],
        [
          "Storage used",
          `${Math.round(storedMaterials(s))} / ${storageCapacity(s)}`,
        ],
        [
          "Resident jobs",
          `${(s.operations || []).filter((o) => !o.done).length} queued`,
        ],
      ];
    else if (view === "power")
      stats = [
        ["Local energy share", s.infrastructure.account.consumed > 0
          ? `${Math.max(0, 100 * (1 - grid.imported / s.infrastructure.account.consumed)).toFixed(0)}% since arrival` : "No usage yet"],
        [
          "Local generation",
          `${nodes.reduce((v, n) => v + (n.enabled ? n.generation || 0 : 0), 0).toFixed(1)} kW`,
        ],
        [
          "Demand",
          `${nodes.reduce((v, n) => v + (n.enabled ? n.demand || 0 : 0), 0).toFixed(1)} kW`,
        ],
        [
          "Stored energy",
          `${nodes.reduce((v, n) => v + n.charge, 0).toFixed(1)} kWh · 90% charging efficiency`,
        ],
        [
          "Buildings without power",
          nodes.filter((n) => n.enabled && n.demand > 0 && n.power < 0.99)
            .length,
        ],
      ];
    else
      stats = LIQUIDS.map((k, i) => [
        {
          fresh: "Drinking water",
          irrigation: "Irrigation water",
          greywater: "Greywater",
          sewage: "Sewage",
        }[k],
        `${nodes.reduce((v, n) => v + n.water[i], 0).toFixed(1)} stored`,
      ]);
    if(view==='water'){
      const sanitation=basicNeeds(s).find(row=>row.id==='sanitation');
      stats.push(['Sanitation',sanitation.summary],['Toilets & washing',sanitation.detail]);
    }
    $("management-stats").innerHTML = stats
      .map(
        ([name, value]) =>
          `<div><small>${name}</small><strong>${value}</strong></div>`,
      )
      .join("");
    if (inventoryView) {
      $("resource-grid").replaceChildren();
      if (view === 'resources') {
      const resourceMaterials = Object.fromEntries(Object.entries(MATERIALS).filter(([id]) => !EQUIPMENT_IDS.has(id)));
      economyControls($("resource-grid"),s,resourceMaterials,PROCESSES,materialCount,()=>{refresh();render();});
      const link=document.createElement('button');link.textContent='Manage food in the Food Almanac';link.onclick=()=>open('food');$('resource-grid').append(link);
      }
      if(view==='food'){
      foodControls($('resource-grid'),s,PROJECTS,PROCESSES,MATERIALS,()=>{refresh();render();});
      const purchaseSettings=document.createElement('details');
      purchaseSettings.className='purchase-settings';purchaseSettings.open=purchaseSettingsOpen;
      purchaseSettings.ontoggle=()=>{purchaseSettingsOpen=purchaseSettings.open;};
      const settingsTitle=document.createElement('summary');settingsTitle.textContent='Food reserves & delivery';
      const settingsBody=document.createElement('div');settingsBody.className='purchase-settings-body';
      purchaseSettings.append(settingsTitle,settingsBody);$('resource-grid').append(purchaseSettings);
      const reserve=document.createElement('button');
      reserve.textContent=`Automatic food purchases: ${s.emergencyFood===false?'off':'on'}`;
      reserve.title='Maintain the chosen food reserve with at most one affordable ingredient purchase per day, within the daily food budget. Growing crops cannot replace food needed today.';
      reserve.setAttribute('aria-pressed',String(s.emergencyFood!==false));
      reserve.onclick=()=>{s.emergencyFood=s.emergencyFood===false;refresh();render();};
      settingsBody.append(reserve);
      for(const [key,label,value,max,step] of [['foodReserveDays','Food reserve in days',1.5,7,.5],['foodPurchaseBudget','Daily food purchase budget including transport (R$)',100,100000,1]]){
       const field=document.createElement('label');field.textContent=label;const input=document.createElement('input');input.type='number';input.min=0;input.max=max;input.step=step;input.value=s[key]??value;input.setAttribute('aria-label',label);input.oninput=()=>{s[key]=Math.max(0,Math.min(max,Number(input.value)||0));};input.onchange=()=>{refresh();render();};field.append(input);settingsBody.append(field);
      }
      const forecast=pantryForecast(s);
      const pantry=document.createElement('p');pantry.className='food-forecast';pantry.setAttribute('role','status');pantry.textContent=s.mode==='sandbox'?'Food forecasts are inactive in sandbox.':`Pantry plan · ${forecast.portions} portions in stores · ${forecast.served} of ${forecast.target} planned portions usable before expiry. ${forecast.shortfall?`${forecast.shortfall} portions short: cook, preserve or buy food to cover your reserve.`:'Your chosen reserve is covered.'}`;settingsBody.append(pantry);
      const waste=document.createElement('p');waste.textContent=s.mode==='sandbox'?'Food does not spoil in sandbox.':forecast.atRisk>0?`About ${forecast.atRisk.toFixed(1)} portions may spoil during this reserve period. Cook short-lived ingredients, dry provisions for later, or lower production targets.`:'No stored portions are forecast to spoil during this reserve period.';settingsBody.append(waste);
      const reserveNote=document.createElement('p');reserveNote.textContent='Planning estimate: two evenly spaced portions per resident per day, oldest food first. Includes stored food only; future harvests, deliveries and continued refrigeration can change the outcome. The purchase budget is a spending limit, not reserved cash; drivers, funds or storage may delay replenishment.';settingsBody.append(reserveNote);
      const delivery=document.createElement('button');delivery.textContent=s.deliveryOnly?'Purchases: supplier delivery':'Purchases: resident pickup';delivery.setAttribute('aria-pressed',String(!!s.deliveryOnly));delivery.onclick=()=>{s.deliveryOnly=!s.deliveryOnly;refresh();render();};settingsBody.append(delivery);
      const freight=document.createElement('p');freight.textContent=s.delivery?`${s.delivery.status||'Supplier delivery on its way'} · ${Math.ceil(s.delivery.left*.45)} game minutes remaining`:s.deliveryOnly?`Supplier delivery: R$${transportCost(s).toFixed(2)} freight, up to 5 tonnes / 12 m³. About six hours plus travel; no resident driver needed.`:'Resident pickups use the village cars and their cargo limits.';settingsBody.append(freight);
      }
      const search = $("resource-search").value.trim().toLowerCase(), committed=committedMaterials(s);
      for (const group of inventoryGroups(view)) {
        const matches = group.ids.filter((id) =>
          MATERIALS[id].name.toLowerCase().includes(search),
        );
        if (!matches.length) continue;
        const heading = document.createElement("h4");
        heading.className = "resource-group-title";
        heading.textContent = group.name;
        $("resource-grid").append(heading);
        for (const id of matches) {
          const item = MATERIALS[id];
          const b = document.createElement("button");
          b.className = "stock-card";
          b.title=materialUnitText(id)+" "+marketTerms(id,item)+(item.quantity?` Available from the supplier today: ${quantityText(id,supplierAvailable(s,id,MATERIALS))}.`:"");
          b.innerHTML = `${resourceIcon(id)}<span class="stock-name">${item.name.charAt(0).toUpperCase() + item.name.slice(1)}</span><strong>${quantityText(id,materialCount(s,id))}<small>available</small></strong><small class="stock-detail">${committed[id]?`${quantityText(id,committed[id])} committed to projects/jobs · `:""}${item.quantity ? "Trade in town" : "Made here"}</small>`;
          if (ITEMS[id]?.durable) {
            const status=equipmentSummary(s,id), detail=document.createElement('small');
            detail.className='equipment-status';
            detail.textContent=`${status.available} available · ${status.borrowers.length} in use · ${status.broken} need repair${status.repairing ? ` · ${status.repairing} being repaired` : ""}${status.borrowers.length ? ` · Borrowed by ${status.borrowers.join(', ')}` : ''}${status.wear>0 ? ` · Wear: ${(status.wear/1800*100).toFixed(0)}% of one tool` : ''}`;
            b.append(detail);
          }
          illustrateResources(b);
          b.disabled = !item.quantity;
          disabledReason(b, "This material cannot be bought or sold in town. Residents produce and use it in the village.");
          b.classList.toggle("active", $("purchase").value === id);
          b.onclick = () => {
            $("purchase").value = id;
            refresh();
          };
          $("resource-grid").append(b);
        }
      }
      if (!$("resource-grid").querySelector(".stock-card")) {
        const empty=document.createElement("p");empty.textContent=view === "items" ? "No matching items. Try another name." : "No matching supplies. Try another name.";$("resource-grid").append(empty);
      }
      $('production-heading').hidden=view==='items';
      $('production-sites').hidden=view==='items';
      $("production-sites").replaceChildren();
      const account=productionSummary(s,PROCESSES),accountNote=document.createElement('p');
      accountNote.textContent=s.mode==='sandbox'?'Processing records are disabled in sandbox. Recipe estimates below show the normal production balance.':`Processing record: ${account.batches} batches · approximately ${account.inputKg.toFixed(1)} kg input, ${account.outputKg.toFixed(1)} kg usable output and ${account.lossKg.toFixed(1)} kg process losses. Includes water used in cooking; excludes farming, animals and construction. Output may still be in transit. Earlier batches are not reconstructed.`;
      $("production-sites").append(accountNote);
      const freshnessNote=document.createElement('p');freshnessNote.textContent=foodStorageText(s)+' '+coolingText(s);$("production-sites").append(freshnessNote);
      for (const p of s.projects) {
        if(view==='food'&&PROJECTS[p.key].kind!=='kitchen')continue;
        if(PROJECTS[p.key].kind==='wild-tree')continue;
        if(p.cultivation){
          if(view==='items'||p.work<PROJECTS[p.key].work)continue;
          const beds=p.cultivation.beds,name=`${PROJECTS[p.key].name} #${p.id}`;
          if(search&&!`${name} ${beds.map(b=>b.crop).join(' ')}`.toLowerCase().includes(search))continue;
          const card=document.createElement('article');card.className='production-site';card.dataset.cultivationSite=p.id;
          const img=document.createElement('img');illustrate(img,PROJECTS[p.key].asset);
          const title=document.createElement('strong');title.textContent=name;
          const detail=document.createElement('p');detail.textContent=`${beds.length} beds · ${beds.filter(b=>b.stage==='harvestable').length} ready to harvest · ${(s.operations||[]).filter(o=>o.site===p.id&&!o.done).length} jobs pending. Crop, density, irrigation and residues are managed per bed.`;
          const manage=document.createElement('button');manage.textContent='Manage cultivation beds';manage.onclick=()=>{dialog.close();inspect(p.id);};
          card.append(img,title,detail,manage);$('production-sites').append(card);continue;
        }
        const recipes = Object.entries(PROCESSES).filter(
          ([, d]) => !d.craft && d.kind === PROJECTS[p.key].kind && (view === "items") === (!!d.equipmentRepair || Object.keys(d.output).some(id => EQUIPMENT_IDS.has(id))),
        );
        if (!recipes.length || p.work < PROJECTS[p.key].work) continue;
        const searchTerms = [PROJECTS[p.key].name, ...recipes.flatMap(([, recipe]) => [
          recipe.name, ...Object.keys(recipe.output).map((id) => MATERIALS[id].name),
        ])];
        if (search && !searchTerms.some((text) => text.toLowerCase().includes(search))) continue;
        const el = document.createElement("article");
        el.className = "production-site";
        const img = document.createElement("img");
        illustrate(img, PROJECTS[p.key].asset);
        const name = document.createElement("strong");
        name.textContent = `${PROJECTS[p.key].name} #${p.id} (${p.x}, ${p.z})`;
        if(Object.values(CROP_CARE).some(c=>c.kind===PROJECTS[p.key].kind)){
          const irrigationLabel=document.createElement('label');irrigationLabel.textContent='Crop irrigation ';
          const irrigation=document.createElement('select');irrigation.setAttribute('aria-label',`Irrigation for ${PROJECTS[p.key].name} #${p.id}`);
          for(const [value,text] of Object.entries(IRRIGATION_POLICIES)){const option=document.createElement('option');option.value=value;option.textContent=text;irrigation.append(option);}
          irrigation.value=p.irrigationPolicy||'balanced';irrigation.onchange=()=>{p.irrigationPolicy=irrigation.value;refresh();render();};irrigationLabel.append(irrigation);el.append(irrigationLabel);
          const hint=document.createElement('p');hint.textContent='Change during growth: conserving saves stored water but leaves less drought buffer. Rain-fed crops rely on rain; dry soil slows or stops growth. Residents still handle harvesting.';el.append(hint);
        }
        if(p.soilFertility!==undefined){const soil=document.createElement("p");soil.textContent=`Soil fertility: ${Math.round(p.soilFertility*100)}%. Residents apply stored compost below 70%; each application restores 30 percentage points. ${s.upkeep?.jobs.find(j=>j.target===p.id&&j.soil)?.status||""}`;el.append(soil);}
        if(p.animalHealth!==undefined){const care=document.createElement("p");care.textContent=animalCareText(p);el.append(care);}
        const choice = document.createElement("select");
        choice.setAttribute("aria-label", `Work at ${name.textContent}`);
        for (const [id, d] of recipes) choice.add(new Option(d.name, id));
        const op = (s.operations || []).find((o) => o.site === p.id && !o.done && !o.water);
        const remembered = recipeChoices.get(`${view}:${p.id}`);
        choice.value = recipes.some(([id]) => id === remembered) ? remembered : recipes[0][0];
        choice.onchange = () => recipeChoices.set(`${view}:${p.id}`, choice.value);
        const activity = productionActivity(s, p, PROCESSES);
        const status = document.createElement("p");
        status.textContent =
          (p.readyAt>s.time ? `Growing: ${Math.ceil((p.readyAt-s.time)*.45)} game minutes remaining · faster at higher speed` : op ? op.status || "Resident job queued" : p.productionStatus) ||
          (p.readyAt > s.time
            ? "Growing before the next harvest"
            : "Ready for a job");
        if(op && op.phase!=='growing' && !s.people.some(r=>r.operation===op.id && !r.needTask && !r.tentPhase))status.textContent=`${op.status?.startsWith('Waiting')?op.status:'Waiting for an available resident'} · residents may be resting or doing higher-priority work`;
        if(view==='food'&&!op)status.textContent=kitchenPlan(s,p,PROCESSES,{blocker:productionBlocker,stored:storedMaterials,capacity:storageCapacity}).reason;
        if (activity) status.textContent = activity.detail;
        else if(gatheringStatus(s,p))status.textContent=gatheringStatus(s,p);
        const node = s.infrastructure.nodes[p.id];
        const availability = operationalStatus(p,node,null);
        if (availability !== 'Ready to use') status.textContent = `${availability}${activity ? ' · ' + activity.detail : ''}`;
        const start = document.createElement("button");
        start.textContent = node?.enabled === false ? 'Switch on to produce' : activity?.label || "Start batch";
        start.disabled = node?.enabled === false || !!op || s.stage !== "playing";
        const blocker=s.stage!=="playing"?"Choose a campsite first.":productionBlocker(s,p.id,choice.value);
        disabledReason(start,blocker);
        start.disabled=!!blocker;
        start.onclick = () => {
          notify(
            queueProduction(s, p.id, choice.value) ||
              "Job queued. Residents will collect supplies and get to work.",
          );
          refresh();
        };
        const locate=document.createElement('button');locate.textContent=`Find in village · ${Math.round(Math.hypot(p.x-s.stock.x,p.z-s.stock.z))} cells from stores`;locate.onclick=()=>{dialog.close();inspect(p.id);};
        const recipeInfo=document.createElement('p');
        const describe=()=>{const r=PROCESSES[choice.value];const error=s.stage!=='playing'?'Choose a campsite first.':productionBlocker(s,p.id,choice.value);start.disabled=!!error;disabledReason(start,error);start.textContent=node?.enabled===false?'Switch on to produce':r.installation?(p.coldStorage?'Cold storage installed':'Install cold storage'):activity?.label||(r.gathering?'Gather resources':'Start batch');recipeInfo.textContent=`${Object.entries(r.input).map(([id,n])=>`${quantityText(id,n)} ${MATERIALS[id].name}`).join(' + ')||'No material input'} → ${Object.entries(r.output).map(([id,n])=>`${quantityText(id,n)} ${MATERIALS[id].name}`).join(', ')||(r.equipmentRepair?'Restore one tool worth of condition':'Building upgrade')}${r.water?` · ${r.water} water`:''} · ${Math.ceil(r.work*.45)} game minutes of resident work${recipeLossText(choice.value,r)}${biologyText(choice.value)}${['vegetables','greenhouse'].includes(choice.value)&&!p.starterSeedlingsUsed&&!p.harvestCount?' · First planting seeds included in the building bill.':''}${r.installation?' · 80 L of food, 0.08 kW average cooling load; ages food at one-quarter speed while powered.':''}${r.preservedDays?` · Dried provisions keep for ${r.preservedDays.meals} game days from completion; extra ingredients and work are required.`:''}`;};
        choice.onchange=()=>{recipeChoices.set(`${view}:${p.id}`,choice.value);describe();};describe();
        el.prepend(img,name);el.append(locate,status,choice,recipeInfo,start);
        if (activity) { const bar=document.createElement('progress');bar.max=1;bar.value=activity.progress;bar.setAttribute('aria-label', `Production at ${name.textContent}`);el.append(bar); }
        if(PROJECTS[p.key].kind==='home') {const action=upgradeAction(p,s.operations||[]);start.disabled ||= node?.enabled===false||action.disabled||!!op;start.textContent=action.label;}
        if(p.coldStorage){const cooling=document.createElement('button');cooling.textContent=p.coolingEnabled===false?'Cold storage: off':'Cold storage: on';cooling.setAttribute('aria-pressed',String(p.coolingEnabled!==false));cooling.onclick=()=>{p.coolingEnabled=p.coolingEnabled===false;refresh();render();};el.append(cooling);}
        $("production-sites").append(el);
      }
      if (!$("production-sites").children.length)
        $("production-sites").textContent =
          view === 'food' ? 'Build a community kitchen to cook meals, prepare provisions and install refrigeration.' : view === 'items' ? 'Craft portable equipment at a timber workbench. Buy parts and repair supplies in Resources.' : search
            ? "No completed production sites match this search. Try another resource or building name."
            : "Build a garden, workshop or other production site to start making supplies here.";
      if (search) {
        const producers = Object.entries(PROJECTS).filter(([,d]) => !d.natural &&
          Object.values(PROCESSES).some(recipe => recipe.kind === d.kind) &&
          productionSearchText(d, PROCESSES, MATERIALS).includes(search));
        for (const [key, definition] of producers) {
          const button = document.createElement('button');
          button.textContent = `Build producer · ${definition.name}`;
          button.disabled = s.mode !== 'sandbox' && !definition.repeatable && s.projects.some(p => p.key === key);
          button.onclick = () => { dialog.addEventListener('close', () => build(key), {once:true}); dialog.close(); };
          $("production-sites").append(button);
        }
      }
    } else {
      $("network-nodes").replaceChildren();
      for (const n of nodes) {
        const relevant =
          view === "water"
            ? n.capacity.some((v) => v > 0)
            : hasPowerService(s.infrastructure,n);
        if (relevant) $("network-nodes").append(card(n));
      }
    }
  }
  return {
    open,
    render,
    get view() {
      return view;
    },
    get resumePaused() { return wasPaused; },
    get isOpen() {
      return dialog.open;
    },
  };
}
