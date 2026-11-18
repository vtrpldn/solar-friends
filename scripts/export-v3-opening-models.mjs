// Regenerate the standalone desktop game's opening models from the V2 artwork.
import { writeFile } from "node:fs/promises";
import { MeshBasicMaterial, Scene } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { createTent } from "../web/v02/library/camping.js";
import { createJimny } from "../web/v02/library/vehicles.js";
import { createResident, RESIDENT_IDS } from "../web/v02/residents/rig.js";

// GLTFExporter uses FileReader for binary buffers that already exist in memory.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const models = [
  ...RESIDENT_IDS.filter((id) => id !== "resident").map((id) => [id, createResident(id)]),
  ...[0, 1].flatMap((variant) => [
    [`tent-${variant}`, createTent(variant)],
    [`car-${variant}`, createJimny(variant)],
  ]),
];
const scenes = models.map(([name, model]) => {
  model.traverse((node) => {
    node.userData = {};
    if (node.isLine) node.material = new MeshBasicMaterial({ color: node.material.color });
  });
  const scene = new Scene();
  scene.name = name;
  scene.add(model);
  return scene;
});
const bytes = await new GLTFExporter().parseAsync(scenes, { binary: true });
await writeFile(new URL("../bevy-v3/src/opening.glb", import.meta.url), Buffer.from(bytes));
