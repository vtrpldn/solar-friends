export const activeTrips=s=>[s.trip,s.secondTrip].filter(Boolean);
export function uncollectedProjects(s,except=null){
 const pending=s.projects.filter(p=>p.pendingMaterials).map(p=>({...p,pendingMaterials:{...p.pendingMaterials}}));
 for(const trip of [...activeTrips(s),s.delivery].filter(Boolean))if(trip!==except){
  if(trip.shipments)for(const shipment of trip.shipments){const p=pending.find(p=>p.id===shipment.project);if(p)for(const [id,n]of Object.entries(shipment.items))p.pendingMaterials[id]=Math.max(0,(p.pendingMaterials[id]||0)-n);}
  else if(trip.project!==undefined)for(const p of pending)if((trip.projects||[trip.project]).includes(p.id))p.pendingMaterials={};
 }
 return pending.filter(p=>Object.values(p.pendingMaterials).some(n=>n>0));
}
