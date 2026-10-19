// Ground equipment and its live destination reserve the same cells as Rust.
export function batteryCells(v){
  return [...(v.power?.network?.nodes||[]).filter(n=>n.owner.kind==='ground').map(n=>[n.x,n.y]),
    ...(v.power?.battery_jobs||[]).filter(j=>!['complete','cancelled'].includes(j.phase)&&j.destination).map(j=>j.destination)];
}
export const batteryReserved=(v,x,y)=>batteryCells(v).some(([a,b])=>a===x&&b===y);
