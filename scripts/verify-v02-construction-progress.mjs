import assert from 'node:assert/strict';
import {constructionProgress} from '../web/v02/weekend/construction-logistics.js';

const definition = {work: 100, size: [2, 2]};
const project = {id: 1, work: 0, delivered: 2};
const state = {people: [{name: 'Iara', job: 1, action: 'haul', cargo: true, haulLoads: 2}]};
const progress = () => constructionProgress(state, project, definition, 8);
assert.equal(progress().phase, 'Delivering supplies');
assert.equal(progress().value, .25);
assert.match(progress().detail, /2 of 8 loads on site · 2 being carried/);
assert.equal(progress().workers, 'Assigned: Iara');

project.pendingMaterials = true;
assert.equal(progress().phase, 'Collecting materials');
assert.equal(progress().value, 0);
assert.match(progress().detail, /waiting for town pickup/);
state.trip = {projects: [1]};
assert.match(progress().detail, /collecting in town/);

project.pendingMaterials = false;
project.delivered = 8;
project.work = 35;
state.people[0].action = 'build';
assert.equal(progress().phase, 'Building');
assert.equal(progress().value, .35);
assert.match(progress().detail, /35% built/);
state.people = [];
assert.equal(progress().workers, 'No crew assigned yet');

project.work = 100;
assert.equal(progress().phase, 'Ready to use');
assert.equal(progress().value, 1);
assert.equal(progress().workers, '');
assert.equal(constructionProgress(state, {...project, id: 2, work: 0, delivered: 0}, definition, 8).phase, 'Delivering supplies');
console.log('PASS construction pickup, hauling, building, completion, assigned crew, and individual project state');
