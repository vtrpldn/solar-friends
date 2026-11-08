import {financeSummary,financeTime} from './finances.js';
import { RESOURCE_GROUPS } from "./resource-groups.js";
import { resourceIcon, illustrateResources } from "./resource-icons.js";
import {
  MATERIALS,
  PROJECTS,
  PROCESSES,
  materialCount,
  storedMaterials,
  storageCapacity,
  queueProduction,
  repeatProduction, queueWater, queuePurification,
} from "./simulation.js";
import { LIQUIDS, hasPowerService, canSwitchBuilding, switchBuilding } from "./infrastructure.js";
import { illustrate } from "./ui-art.js";
const $ = (id) => document.getElementById(id);
const titles = {
  finances: "Our shared purse",
  resources: "Our shared supplies",
  water: "Every drop counts",
  power: "A little village energy",
};
const intros = {
  finances: "See what comes in, what goes out, and what keeps the village running. Click Savings at any time to return here.",
  resources:
    "Keep the essentials close, turn local materials into something useful, and plan the next trip to town.",
  water:
    "Carry river water into a reservoir, then assign residents to purify it by hand. Untreated water stays separate. Powered pumps and cisterns automate this later.",
  power:
    "Balance generation, batteries and the buildings that depend on them. Completed buildings join the network automatically.",
};
export function createManagement({
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
  const recipeChoices = new Map();
  const dialog = $("management");
  let view = "resources",
    wasPaused = false;
  const label = (n) =>
    n.id === -1
      ? "River intake"
      : n.id === 0
        ? "Camp stores"
        : `${PROJECTS[state().projects.find((p) => p.id === n.id).key].name} #${n.id}`;
  function open(next) {
    if (state().stage === "arrival") return;
    view = next;
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
    const title = document.createElement("strong");
    title.textContent = label(n);
    if (p || n.id === 0) {
      const img = document.createElement("img");
      illustrate(img, p ? PROJECTS[p.key].asset : "produce-crates");
      el.append(img);
    }
    if (n.id === -1) {
      const symbol = document.createElement("span");
      symbol.className = "node-symbol";
      symbol.textContent = "≈";
      symbol.setAttribute("aria-hidden", "true");
      el.append(symbol);
    }
    el.append(title);
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
      const pending=(state().operations||[]).some(o=>!o.done && o.site===n.id);
      const fetch=document.createElement('button');fetch.textContent='Carry river water';
      fetch.disabled=pending || n.water[1]>=n.capacity[1];
      fetch.onclick=()=>{notify(queueWater(state(),-1,n.id,'irrigation')||'Resident assigned to carry river water.');refresh();render();};actions.append(fetch);
      if(n.capacity[0]) {
        const purify=document.createElement('button');purify.textContent='Purify by hand';
        purify.disabled=pending || n.water[1]<1 || n.capacity[0]-n.water[0]<1;
        purify.onclick=()=>{notify(queuePurification(state(),n.id)||'Resident assigned to purify water.');refresh();render();};actions.append(purify);
      }
      if(pending){const status=document.createElement('small');status.textContent='Resident water job queued or in progress';actions.append(status);}
      el.append(actions);
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
    const grid = s.infrastructure.grid;
    $("grid-power-status").textContent = `${grid.enabled ? (s.money <= 0 ? "No funds for grid power" : "Grid backup connected") : "Off-grid"} · ${grid.importing.toFixed(2)} kW imported now · ${grid.imported.toFixed(2)} kWh purchased · R$${grid.spent.toFixed(2)} spent`;
    $("toggle-grid-power").textContent = grid.enabled ? "Disconnect grid power" : "Connect grid backup";
    $("toggle-grid-power").setAttribute("aria-pressed", String(grid.enabled));
    $("resource-screen").hidden = view !== "resources";
    $("pantry-panel").hidden = view !== "resources";
    $("network-screen").hidden = view === "resources" || view === "finances";
    $("finance-screen").hidden = view !== "finances";
    $("utility-panel").hidden = true;
    $("pantry-panel").parentElement.hidden = view !== "resources";
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
        : "Completed buildings connect to compatible sources and treatment automatically. Pumps still need power; cisterns filter river water. Greywater and sewage stay separate.";
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
      add('h3','Ongoing costs');
      add('p',`Grid power: ${money(f.gridRate)}/hour at the current import rate. Charges change with demand, local generation and available funds.`);
      const power=document.createElement('button');power.textContent='Manage grid power';power.onclick=()=>open('power');screen.append(power);
      add('h3','Where the money goes');
      const groups={sales:'Surplus sales',construction:'Building materials',purchases:'Town purchases',electricity:'Grid electricity'};
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
    else if (view === "resources")
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
          `${nodes.reduce((v, n) => v + n.charge, 0).toFixed(1)} kWh`,
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
    $("management-stats").innerHTML = stats
      .map(
        ([name, value]) =>
          `<div><small>${name}</small><strong>${value}</strong></div>`,
      )
      .join("");
    if (view === "resources") {
      $("resource-grid").replaceChildren();
      const search = $("resource-search").value.toLowerCase();
      for (const group of RESOURCE_GROUPS) {
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
          b.innerHTML = `${resourceIcon(id)}<strong>${Math.floor(materialCount(s, id))}</strong><span>${item.name.charAt(0).toUpperCase() + item.name.slice(1)}</span><small>${item.quantity ? "Trade in town" : "Made in the village"}</small>`;
          illustrateResources(b);
          b.disabled = !item.quantity;
          b.classList.toggle("active", $("purchase").value === id);
          b.onclick = () => {
            $("purchase").value = id;
            refresh();
          };
          $("resource-grid").append(b);
        }
      }
      if (!$("resource-grid").children.length)
        $("resource-grid").textContent =
          "No matching supplies. Try another name.";
      $("production-sites").replaceChildren();
      for (const p of s.projects) {
        if(PROJECTS[p.key].kind==='wild-tree')continue;
        const recipes = Object.entries(PROCESSES).filter(
          ([, d]) => d.kind === PROJECTS[p.key].kind,
        );
        if (!recipes.length || p.work < PROJECTS[p.key].work) continue;
        const el = document.createElement("article");
        el.className = "production-site";
        const img = document.createElement("img");
        illustrate(img, PROJECTS[p.key].asset);
        const name = document.createElement("strong");
        name.textContent = `${PROJECTS[p.key].name} #${p.id}`;
        const choice = document.createElement("select");
        choice.setAttribute("aria-label", `Work at ${name.textContent}`);
        for (const [id, d] of recipes) choice.add(new Option(d.name, id));
        const op = (s.operations || []).find((o) => o.site === p.id && !o.done);
        choice.value = p.repeat || recipeChoices.get(p.id) || recipes[0][0];
        choice.onchange = () => recipeChoices.set(p.id, choice.value);
        const status = document.createElement("p");
        status.textContent =
          (op ? op.status || "Resident job queued" : p.productionStatus) ||
          (p.readyAt > s.time
            ? "Growing before the next harvest"
            : p.repeat
              ? "Keeping 24 in stock"
              : "Ready for a job");
        const start = document.createElement("button");
        start.textContent = "Start batch";
        start.disabled = !!op || s.stage !== "playing";
        start.onclick = () => {
          notify(
            queueProduction(s, p.id, choice.value) ||
              "Job queued. Residents will collect supplies and get to work.",
          );
          refresh();
        };
        const repeat = document.createElement("button");
        repeat.textContent = p.repeat ? "Stop repeating" : "Keep 24 in stock";
        repeat.onclick = () => {
          repeatProduction(s, p.id, p.repeat || choice.value);
          refresh();
        };
        el.append(img, name, status, choice, start, repeat);
        $("production-sites").append(el);
      }
      if (!$("production-sites").children.length)
        $("production-sites").textContent =
          "Build a garden, workshop or other production site to start making supplies here.";
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
    get isOpen() {
      return dialog.open;
    },
  };
}
