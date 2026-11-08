import { ASSETS } from "../library/catalog.js";
import { MAP_CELLS } from "./layout.js";
const defs = new Map(ASSETS.map((a) => [a.id, a]));
export function footprint(record) {
  const f = defs.get(record.asset)?.footprint;
  if (!f) throw Error("Unknown asset");
  return record.rotation % 180 ? [...f].reverse() : [...f];
}
export function validate(records) {
  if (!Array.isArray(records) || records.length > 1000)
    throw Error("A scene must contain at most 1,000 props.");
  const ids = new Set();
  return records.map((r) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      r.id.length > 100 ||
      ids.has(r.id) ||
      !defs.has(r.asset)
    )
      throw Error("Invalid or duplicate prop.");
    ids.add(r.id);
    if (
      ![0, 90, 180, 270].includes(r.rotation) ||
      !Number.isInteger(r.column) ||
      !Number.isInteger(r.row)
    )
      throw Error("Props must snap to cells and quarter turns.");
    const [w, d] = footprint(r);
    if (
      r.column < 0 ||
      r.row < 0 ||
      r.column + w > MAP_CELLS ||
      r.row + d > MAP_CELLS
    )
      throw Error("Keep the full footprint inside the plot.");
    return {
      id: r.id,
      asset: r.asset,
      column: r.column,
      row: r.row,
      rotation: r.rotation,
      label: defs.get(r.asset).name,
    };
  });
}
export function gallery() {
  const occupied = new Set();
  const placements = new Map();
  // Pack actual footprints, with a cell of breathing room between exhibits.
  for (const asset of [...ASSETS].sort((a,b)=>b.footprint[1]-a.footprint[1] || b.footprint[0]-a.footprint[0])) {
    const [w,d] = asset.footprint;
    let spot;
    for (let row=0; row<=MAP_CELLS-d && !spot; row++) {
      for (let column=0; column<=MAP_CELLS-w && !spot; column++) {
        let free=true;
        for(let z=row; z<row+d && free; z++)
          for(let x=column; x<column+w; x++) if(occupied.has(`${x},${z}`)) {free=false; break;}
        if(free) spot={column,row};
      }
    }
    if(!spot) throw Error(`Gallery is full: ${asset.name}`);
    for(let z=spot.row-1; z<=spot.row+d; z++)
      for(let x=spot.column-1; x<=spot.column+w; x++) occupied.add(`${x},${z}`);
    placements.set(asset.id,{id:`gallery-${asset.id}`,asset:asset.id,...spot,rotation:0,label:asset.name});
  }
  return ASSETS.map(asset=>placements.get(asset.id));
}
export function decode(text) {
  const data = JSON.parse(text);
  if (data?.format !== "solar-friends-scene" || data.version !== 1)
    throw Error("Not a v2 scene file.");
  return validate(data.props);
}
export function decodeBiome(text) {
  const biome = JSON.parse(text).biome || "flat";
  if (!["flat", "mata-atlantica", "cerrado", "caatinga"].includes(biome)) throw Error("Unknown terrain biome.");
  return biome;
}
export function encode(records, biome = "flat") {
  return JSON.stringify(
    { format: "solar-friends-scene", version: 1, biome, props: validate(records) },
    null,
    2,
  );
}
export function createEditor(initial = gallery()) {
  let records = validate(initial),
    past = [],
    future = [];
  function commit(next) {
    const checked = validate(next);
    if (JSON.stringify(checked) === JSON.stringify(records)) return false;
    past.push(records);
    if (past.length > 100) past.shift();
    records = checked;
    future = [];
    return true;
  }
  return {
    get records() {
      return structuredClone(records);
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    replace: commit,
    add(record) {
      return commit([...records, record]);
    },
    update(id, patch) {
      if (!records.some((r) => r.id === id))
        throw Error("Select a prop first.");
      return commit(
        records.map((r) => (r.id === id ? { ...r, ...patch, id } : r)),
      );
    },
    remove(id) {
      return commit(records.filter((r) => r.id !== id));
    },
    undo() {
      if (!past.length) return false;
      future.push(records);
      records = past.pop();
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(records);
      records = future.pop();
      return true;
    },
  };
}
