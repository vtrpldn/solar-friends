// Terrain grids are immutable between document transactions/native snapshots.
// Compare their contents once per new grid, never stringify 4096 cells per frame.
const revisions=new WeakMap();let lastRaw='',lastRevision=0,nextRevision=0;
export function terrainRevision(map){
  const cells=map?.terrain;if(!cells)return 0;
  if(revisions.has(cells))return revisions.get(cells);
  const raw=JSON.stringify(cells);
  if(raw!==lastRaw){lastRaw=raw;lastRevision=++nextRevision;}
  revisions.set(cells,lastRevision);return lastRevision;
}
