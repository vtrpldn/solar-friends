// Deterministic, grid-connected L route; preview and construction share this list.
export function roadLine(from,to) {
  if(!from)return null;
  const dx=to.x-from.x,dz=to.z-from.z,length=Math.abs(dx)+Math.abs(dz);
  if(length>127)return null;
  return Array.from({length:length+1},(_,i)=>({
    x:from.x+Math.sign(dx)*Math.min(i,Math.abs(dx)),
    z:from.z+Math.sign(dz)*Math.max(0,i-Math.abs(dx)),
  }));
}
