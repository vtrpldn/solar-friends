import assert from 'node:assert/strict';
import {brl, brlWhole} from '../web/v02/weekend/money.js';
import {projectLabel, numberProject, numberProjects} from '../web/v02/weekend/project-names.js';
import {plan, placementError, restore, save, PROJECTS} from '../web/v02/weekend/simulation.js';
import {village} from './fixtures.mjs';

const plain = text => text.replace(/ /g, ' ');
assert.equal(plain(brl(10000)), 'R$ 10.000,00');
assert.equal(plain(brl(7.756)), 'R$ 7,76');
assert.equal(plain(brl(undefined)), 'R$ 0,00');
assert.equal(plain(brlWhole(20000)), 'R$ 20.000');

const defs = {hut: {name: 'Hut'}, tree: {name: 'Mango tree', natural: true}};
const s = {projects: [{id: 9, key: 'tree'}, {id: 40, key: 'hut'}, {id: 12, key: 'hut'}]};
numberProjects(s, defs);
assert.equal(projectLabel(s.projects[2], defs), 'Hut 1', 'older saves number by construction order');
assert.equal(projectLabel(s.projects[1], defs), 'Hut 2');
assert.equal(projectLabel(s.projects[0], defs), 'Mango tree', 'natural features stay unnumbered');
s.projects.splice(2, 1);
assert.equal(numberProject(s, {key: 'hut'}, defs).number, 3, 'a removed building does not free its number');

const game = village({fast: false}).s;
let placed = 0;
for (let x = 30; x < 60 && placed < 2; x += 5) for (let z = -10; z < 20 && placed < 2; z += 5)
  if (!placementError(game, 'gathering', x, z) && plan(game, 'gathering', x, z) === '') placed++;
const built = game.projects.filter(p => p.key === 'gathering');
assert(built.length >= 1, 'placed a gathering place through the normal plan command');
assert.equal(projectLabel(built[0], PROJECTS), `${PROJECTS.gathering.name} 1`);
const reloaded = restore(save(game));
assert.equal(reloaded.projects.find(p => p.id === built[0].id).number, 1, 'numbers survive a save');
assert(!game.log.some(line => /#\d/.test(line)), 'village log does not expose save ids');
console.log('PASS pt-BR money formatting and per-kind building names');
