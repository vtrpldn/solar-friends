import assert from 'node:assert/strict';
import {inventoryOwnership} from '../web/v02/weekend/economy-inventory.js';
const materials={wood:{price:10,quantity:1},stone:{price:2,quantity:1}};
const projects={shed:{work:100,materials:{wood:10}}};
const s={wood:4,materials:{stone:2},projects:[{id:1,key:'shed',work:0,pendingMaterials:{wood:6}}],trip:{project:1,shipments:[{project:1,items:{wood:6}}]},secondTrip:{material:'stone'},trade:{orders:[{material:'wood',quantity:3,status:'queued'}]}};
let a=inventoryOwnership(s,projects,{},materials);assert.equal(a.rows.wood.reserved,13);assert.equal(a.rows.wood.transit,0,'manifest is not duplicate ownership');assert.equal(a.rows.stone.transit,1);
s.projects[0].work=100;a=inventoryOwnership(s,projects,{},materials);assert.equal(a.rows.wood.installed,10);assert.equal(a.rows.wood.reserved,3);
s.trade.orders[0].status='loaded';a=inventoryOwnership(s,projects,{},materials);assert.equal(a.rows.wood.transit,3);assert.equal(a.rows.wood.reserved,0);
assert.equal(a.values.installed,100);console.log('PASS project ownership, no manifest duplication, individual car purchases, export reservations and replacement values');
