import { ITEMS } from "./items.js";
import { illustrate } from "./ui-art.js";
export function resourceIcon(id) {
  return `<img class="resource-icon" data-resource="${id}" alt=""/>`;
}
export function illustrateResources(root) {
  root
    .querySelectorAll("img[data-resource]")
    .forEach((img) => illustrate(img, ITEMS[img.dataset.resource] ? ITEMS[img.dataset.resource].art || img.dataset.resource : `resource-${["wheel_kit","tool_heads","repair_supplies"].includes(img.dataset.resource) ? "tools" : img.dataset.resource === "soap" ? "sanitation" : img.dataset.resource}`));
}
