import {
  MATERIALS,
  PROJECTS,
  PROCESSES,
  materialCount,
  storedMaterials,
  storageCapacity,
  queueProduction,
  repeatProduction,
} from "./simulation.js";
import { LIQUIDS, POWER_LOAD } from "./infrastructure.js";
import { illustrate } from "./ui-art.js";
const $ = (id) => document.getElementById(id);
const titles = {
  resources: "Our shared supplies",
  water: "Every drop counts",
  power: "A little village energy",
};
const intros = {
  resources:
    "Keep the essentials close, turn local materials into something useful, and plan the next trip to town.",
  water:
    "Follow water from the river to storage, through daily life, and back into the land safely.",
  power:
    "Balance generation, batteries and the buildings that depend on them. Cables need resident work before they carry power.",
};
export function createManagement({
  state,
  refresh,
  inspect,
  notify,
  isPaused,
  setPaused,
}) {
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
      "Changes are planned now. Residents get to work when you return to the village.";
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
    if (p) {
      const img = document.createElement("img");
      illustrate(img, PROJECTS[p.key].asset);
      el.append(img);
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
          line.textContent = `${k} · ${n.water[i].toFixed(1)} / ${n.capacity[i]}`;
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
        n.enabled = !n.enabled;
        notify(
          `${label(n)} ${n.enabled ? "switched on" : "switched off"}. Network supply updates when the village resumes.`,
        );
        refresh();
      };
      actions.append(inspectButton, toggle);
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
    $("resource-screen").hidden = view !== "resources";
    $("pantry-panel").hidden = view !== "resources";
    $("network-screen").hidden = view === "resources";
    $("utility-panel").hidden = view === "resources";
    $("haul-water").hidden = view === "power";
    $("connection-title").textContent =
      view === "power" ? "Lay a power cable" : "Move water safely";
    $("connection-hint").textContent =
      view === "power"
        ? "Cables connect two buildings and cost electrical parts. Residents install them before power can flow. Batteries cover demand when generation drops."
        : "Pipes need a pump and power at the source. River water must be filtered by a powered cistern. Greywater goes to reed beds; sewage goes to a biodigester or banana bed.";
    $("network-title").textContent =
      view === "power"
        ? "Generation, storage & demand"
        : "Sources, tanks & treatment";
    let stats;
    if (view === "resources")
      stats = [
        ["Shared savings", `R$${s.money}`],
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
        [
          "Generation",
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
        k,
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
      for (const [id, item] of Object.entries(MATERIALS)) {
        if (!item.name.toLowerCase().includes(search)) continue;
        const b = document.createElement("button");
        b.className = "stock-card";
        b.innerHTML = `<strong>${Math.floor(materialCount(s, id))}</strong><span>${item.name}</span><small>${item.quantity ? "Trade in town" : "Made in the village"}</small>`;
        b.disabled = !item.quantity;
        b.classList.toggle("active", $("purchase").value === id);
        b.onclick = () => {
          $("purchase").value = id;
          refresh();
        };
        $("resource-grid").append(b);
      }
      if (!$("resource-grid").children.length)
        $("resource-grid").textContent =
          "No matching supplies. Try another name.";
      $("production-sites").replaceChildren();
      for (const p of s.projects) {
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
            : n.battery ||
              POWER_LOAD[n.kind] ||
              n.kind === "river" ||
              n.kind === "camp" ||
              s.infrastructure.links.some(
                (l) => l.from === n.id && l.kind !== "power",
              );
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
