import { illustrate } from "./ui-art.js";
export function resourceIcon(id) {
  return `<img class="resource-icon" data-resource="${id}" alt=""/>`;
}
export function illustrateResources(root) {
  root
    .querySelectorAll("img[data-resource]")
    .forEach((img) => illustrate(img, `resource-${img.dataset.resource}`));
}
