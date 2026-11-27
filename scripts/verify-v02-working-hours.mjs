// Residents stop taking new work after dusk and in rain, except while the arrival camp is being raised.
import assert from 'node:assert/strict';
import {plan, planField, offDuty, WORKDAY_START, WORKDAY_END, PROJECTS} from '../web/v02/weekend/simulation.js';
import {village, advance} from './fixtures.mjs';

const hourOf = s => (9 + s.time * .45 / 60) % 24, at = hour => (hour - 9) * 60 / .45;

// The rule itself.
const {s: story} = village();
story.time = at(20); story.rain = false;
assert.equal(offDuty(story), null, 'the arrival crew keeps going');
story.opening.shelter = true;
assert.equal(offDuty(story), null, 'a roof alone does not end the arrival');
story.opening.gathering = story.opening.supplies = true;
assert.equal(offDuty(story), 'evening');
story.time = at(WORKDAY_END - .1); assert.equal(offDuty(story), null);
story.time = at(24 + WORKDAY_START - .1); assert.equal(offDuty(story), 'evening', 'the small hours are off duty too');
story.time = at(12); assert.equal(offDuty(story), null);
story.rain = true; assert.equal(offDuty(story), 'rain');
console.log('PASS off duty after dusk, before dawn and in rain; not while the camp is being raised');

// A village with plenty to do stops in the evening and starts again in the morning.
const {s} = village({sandbox: true});
assert.equal(planField(s, 50, 50, [6, 6]), '');
s.instantBuild = false; s.materials.greens_seed = 200;
let site = false;
for (let z = 40; z <= 64 && !site; z++) for (let x = 40; x <= 64 && !site; x++) site = plan(s, 'shed', x, z) === '';
assert(site, 'a building site');
const STARTING = ['build', 'produce', 'collect', 'fetch-water', 'install'];
const starting = () => s.people.filter(r => STARTING.includes(r.action)).map(r => `${r.name} ${r.action}`);
advance(s, {seconds: 3200, until: () => hourOf(s) >= 15 && hourOf(s) < 16});
let worked = 0;
advance(s, {seconds: at(16) - at(15), until: () => (worked = Math.max(worked, starting().length), false)});
assert(worked >= 2, `residents work in the afternoon (saw ${worked})`);
advance(s, {seconds: 3200, until: () => hourOf(s) >= WORKDAY_END + .5});
let late = [], relaxed = 0;
advance(s, {seconds: at(21) - at(WORKDAY_END + .5), until: () => (late.push(...starting()), relaxed = Math.max(relaxed, s.people.filter(r => r.downtime).length), false)});
assert.deepEqual([...new Set(late)], [], 'nobody starts work after dusk');
assert(relaxed >= 2, `residents spend the evening at leisure (saw ${relaxed})`);
assert(s.projects.some(p => p.work < PROJECTS[p.key].work) || s.operations.some(op => !op.done), 'there was still work waiting');
advance(s, {seconds: 3200, until: () => hourOf(s) >= 9 && hourOf(s) < 10});
worked = 0;
advance(s, {seconds: at(10) - at(9), until: () => (worked = Math.max(worked, starting().length), false)});
assert(worked >= 2, `work resumes the next morning (saw ${worked})`);
console.log('PASS a busy village rests in the evening and resumes in the morning');
