import { writeFile } from "node:fs/promises";
import { MeshBasicMaterial, Scene } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// GLTFExporter uses FileReader for binary buffers that already exist in memory.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

export async function exportModels(models, path) {
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
  await writeFile(path, Buffer.from(bytes));
}
