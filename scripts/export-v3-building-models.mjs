// Export one scene for each model in the desktop build catalog.
import { compactModel, createAsset } from "../web/v02/library/catalog.js";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { greenhouseShell } from "../web/v02/weekend/greenhouse-model.js";
import { exportModels } from "./v3-model-export.mjs";

import { buildingScenes } from "./v3-building-scene-ids.mjs";

function bareGreenhouse() {
  const shell = new Group();
  greenhouseShell(shell, (root, w, h, d, color, x, y, z, opacity) => {
    const model = new Mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({
      color, opacity, transparent: opacity < 1, roughness: 0.9,
    }));
    model.position.set(x, y, z);
    root.add(model);
    return model;
  });
  return shell;
}

function workshopComparison() {
  const group = new Group();
  const layout = [
    ["house", -5, -3],
    ["shed", 4, -2],
    ["tree", 5, 6],
    ["resident", -3, 4],
    ...Array.from({ length: 8 }, (_, index) => ["road", -8 + 2 * index, 3]),
  ];
  for (const [id, x, z] of layout) {
    const model = compactModel(createAsset(id));
    model.name = id;
    model.position.set(x, 0, z);
    group.add(model);
  }
  return group;
}

const models = buildingScenes.map((id) => {
  if (id === "workshop-comparison") return [id, workshopComparison()];
  if (id === "greenhouse") return [id, bareGreenhouse()];
  const model = createAsset(id);
  model.getObjectByName("optional-rooftop-solar")?.removeFromParent();
  const roof = model.userData.exteriorOnly
    ? null
    : model.getObjectByName("functional-roof");
  let compactRoof;
  if (roof) {
    const holder = new Group();
    holder.name = "functional-roof";
    holder.attach(roof);
    compactRoof = compactModel(holder);
  }
  const compact = compactModel(model);
  if (compactRoof) compact.add(compactRoof);
  let index = 0;
  compact.traverse(node => {
    if (!node.animalRig) return;
    const { kind, head, legs, tail } = node.animalRig;
    const prefix = `livestock-${kind}-${index++}`;
    node.name = `${prefix}-body`;
    head.name = `${prefix}-head`;
    tail.name = `${prefix}-tail`;
    legs.forEach((leg, joint) => { leg.name = `${prefix}-leg-${joint}`; });
  });
  return [id, compact];
});
await exportModels(models, new URL("../bevy-v3/src/buildings.glb", import.meta.url));
