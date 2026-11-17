// Portable possessions live in shared inventory, never on a building footprint.
export const ITEMS = {
  bucket: {name:'Bucket',price:30,art:'resource-tank',durable:true,description:'Shared water carrier. Helps residents carry water 25% faster; returned after delivery.'},
  'garden-tools': {name:'Garden tools',price:95,art:'resource-tools',durable:true,description:'Shared hoe and shovel. Garden and compost work is 25% faster. Fit purchased heads to wooden handles at the timber workbench.',recipe:{input:{wood:2,tool_heads:1},work:45}},
  'carpentry-tools': {name:'Carpentry tools',price:120,art:'resource-tools',durable:true,description:'Shared hand saw and hammer. Construction and timber work is 25% faster. Buy specialist metal tools in town.'},
  'harvest-basket': {name:'Harvest basket',price:25,art:'produce-crates',durable:true,description:'Shared woven basket. Orchard and banana harvesting is 25% faster. Residents can weave one from split bamboo.',recipe:{input:{bamboo:2},work:45}},
  'cleaning-kit': {name:'Cleaning kit',price:55,art:'resource-sanitation',durable:true,description:'Shared brushes and cleaning equipment. Waste servicing is 25% faster with soap. One soap refill lasts 10 game hours of active cleaning.'},
  'watering-can': {name:'Watering can', price:45, description:'Portable watering equipment. Bought in town; metal fabrication is not available in the village.'},
  wheelbarrow: {name:'Wheelbarrow', price:180, description:'Buy in town or assemble at a workshop with planks, fasteners and a wheel-and-axle kit.', recipe:{input:{planks:4,hardware:1,wheel_kit:1},work:75}},
  bicycle: {name:'Bicycle', price:450, description:'Bought in town. Frames, brakes and drivetrain require specialist manufacturing.'},
  'produce-crates': {name:'Produce crate', price:25, description:'Buy in town or make at the timber workbench with planks and fasteners.', recipe:{input:{planks:2,hardware:1},work:30}},
};

export function migrateItemProjects(s) {
  const old = s.projects.filter(p => ['watering-can','wheelbarrow','bicycle','produce-crates'].includes(p.key));
  if (!old.length) return;
  const removed = new Set(old.map(p => p.id));
  for (const p of old) {
    // Old props all used four timber pieces and one fastener pack (110 work).
    if (p.work >= 110) s.materials[p.key] = (s.materials[p.key] || 0) + 1;
    else if (s.mode !== 'sandbox') {
      // Return both reserved and prepaid supplies for unfinished legacy projects.
      s.wood += 4;
      s.materials.hardware += 1;
    }
  }
  s.projects = s.projects.filter(p => !removed.has(p.id));
  s.operations = (s.operations || []).filter(o => !removed.has(o.site));
  if (s.infrastructure?.nodes) for (const id of removed) delete s.infrastructure.nodes[id];
  if (s.infrastructure?.links) s.infrastructure.links = s.infrastructure.links.filter(l => !removed.has(l.from) && !removed.has(l.to));
  if (s.trip?.project != null) {
    const orders = (s.trip.projects || [s.trip.project]).filter(id => !removed.has(id));
    if (orders.length) { s.trip.project = orders[0]; s.trip.projects = orders; }
    else {
      const traveler = s.people.find(r => r.id === s.trip.person);
      if (traveler) { traveler.x = s.stock.x; traveler.z = s.stock.z; traveler.action = 'idle'; }
      s.trip = null;
    }
  }
  for (const p of s.projects) if (removed.has(p.depot)) delete p.depot;
}
