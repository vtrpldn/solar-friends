// Export the individual trees, deposits and scenery used by native land generation.
import { compactModel, createAsset } from "../web/v02/library/catalog.js";
import { exportModels } from "./v3-model-export.mjs";

const ids = [
  "jequitiba", "pau_brasil", "jucara", "embauba", "pequi", "barbatimao",
  "umbuzeiro", "jurema", "natural-earth", "natural-stone", "forage-fruit",
  "forage-wood", "forage-bamboo", "forage-grass", "forage-stone",
  "landscape-7", "landscape-0", "bunchgrass", "campo", "mandacaru",
  "macambira", "produce-crates", "garden-bench",
  "forage-fruit-gathered", "forage-wood-gathered", "forage-bamboo-gathered",
  "forage-grass-gathered", "forage-stone-gathered",
];
await exportModels(ids.map((id) => [id, compactModel(createAsset(id))]),
  new URL("../bevy-v3/src/land.glb", import.meta.url));
