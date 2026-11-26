// Shared starting states and time helpers for verify-* checks.
//
//   import {village, addSite, advance, advanceUntil, DAY} from './fixtures.mjs';
//   const {s, sites:[kitchen]} = village({buildings:['kitchen'], materials:{food:20}});
//   advanceUntil(s, () => s.operations?.some(op => op.done), {seconds: DAY, message: 'residents cook'});
//
// village() returns a village past the opening: createWeekend(seed) plus chooseCamp, which sets
// stage 'playing'. Nothing else is skipped or changed unless an option asks for it, so a check
// states exactly what it relies on. Weather sets rainSeen/rainResolved on every tick, so checks
// that tick need not set them. Checks about the arrival, opening or camp choice build their own
// state with createWeekend directly.
import {createWeekend, createSandbox, chooseCamp, enableFastNavigation, PROJECTS, requiredLoads, tick, save} from '../web/v02/weekend/simulation.js';
import {ensureInfrastructure, syncInfrastructure} from '../web/v02/weekend/infrastructure.js';
import {foodChange} from '../web/v02/weekend/food-storage.js';
import {DAY, HOUR} from '../web/v02/weekend/weather.js';
import {STORY_SAVE, SANDBOX_SAVE} from '../web/v02/weekend/modes.js';

export {DAY, HOUR};

/**
 * @param {object} [o]
 * @param {number} [o.seed=42] land seed
 * @param {string|false} [o.camp='entrance'] campsite id ('entrance' | 'clearing' | 'shade'); false leaves the arrival stage
 * @param {boolean} [o.sandbox] start from createSandbox (camps at the entrance, unlimited supplies)
 * @param {boolean} [o.story] with sandbox: switch to story mode so stock stays finite
 * @param {boolean} [o.fast=true] enableFastNavigation (cached routes, same rules)
 * @param {boolean} [o.emergencyFood] set s.emergencyFood (false stops emergency town food runs)
 * @param {boolean} [o.grid] false disconnects the grid
 * @param {boolean} [o.zero] set every material to 0 before applying `materials`
 * @param {Record<string,number>} [o.materials] material amounts to assign
 * @param {Record<string,number|[number,object[]]>} [o.food] foodChange deltas, optionally with lots
 * @param {number} [o.money] @param {number} [o.wood] @param {number} [o.time]
 * @param {(string|{key:string,x?:number,z?:number,rotation?:number,built?:boolean})[]} [o.buildings]
 * @returns {{s:object, sites:object[], sys:object|null}}
 */
export function village({seed = 42, camp = 'entrance', sandbox = false, story = false, fast = true, emergencyFood, grid, zero = false, materials, food, money, wood, time, buildings = []} = {}) {
  const s = sandbox ? createSandbox(seed) : createWeekend(seed);
  if (!sandbox && camp && !chooseCamp(s, camp)) throw Error(`village: camp ${camp} is not available`);
  if (story) s.mode = 'story';
  if (fast) enableFastNavigation(s);
  if (emergencyFood !== undefined) s.emergencyFood = emergencyFood;
  if (grid === false) ensureInfrastructure(s).grid.enabled = false;
  if (zero) for (const id of Object.keys(s.materials)) s.materials[id] = 0;
  if (materials) Object.assign(s.materials, materials);
  for (const [id, change] of Object.entries(food || {})) Array.isArray(change) ? foodChange(s, id, change[0], change[1]) : foodChange(s, id, change);
  if (money !== undefined) s.money = money;
  if (wood !== undefined) s.wood = wood;
  if (time !== undefined) s.time = time;
  const sites = buildings.map((b, i) => typeof b === 'string' ? addSite(s, b, {index: i}) : addSite(s, b.key, {index: i, ...b}));
  const sys = sites.length ? syncInfrastructure(s, PROJECTS) : null;
  return {s, sites, sys};
}

/**
 * Pushes a project straight into s.projects, as most checks do, skipping plan()'s grading,
 * purchases and trips. Built sites have all their work done (complete) and loads delivered.
 * Default position: a row beside the stock pile.
 */
export function addSite(s, key, {x, z, rotation = 0, built = true, index = 0} = {}) {
  if (!PROJECTS[key]) throw Error(`addSite: unknown project ${key}`);
  const p = {id: s.nextId++, key, x: x ?? s.stock.x + 4 + index * 6, z: z ?? s.stock.z + 4, rotation, work: built ? PROJECTS[key].work : 0, delivered: built ? requiredLoads(key) : 0};
  s.projects.push(p);
  return p;
}

/** Ticks until `until()` is true or `seconds` of game time pass. Returns whether `until` held. */
export function advance(s, {seconds = DAY, until = null, dt = .1} = {}) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (until?.()) return true;
    tick(s, dt);
  }
  return until ? !!until() : true;
}

/** advance() that throws with `message` when `until()` never becomes true. */
export function advanceUntil(s, until, {seconds = DAY, dt = .1, message = 'condition'} = {}) {
  if (!advance(s, {seconds, until, dt})) throw Error(`Timed out after ${seconds}s of game time waiting for: ${message}`);
}

/**
 * Seeds the page's save before the game loads; navigate to /v2/?mode=<mode> afterwards.
 * `once` writes it only on the first load, so reloads keep what the game saved.
 */
export async function seedSave(page, s, {mode = 'story', mute = true, once = false} = {}) {
  await page.addInitScript(({key, value, mute, once}) => {
    if (once && sessionStorage.getItem('fixture-seeded')) return;
    localStorage.setItem(key, value);
    if (mute) localStorage.setItem('solar-friends-audio', '{"music":0,"effects":0}');
    if (once) sessionStorage.setItem('fixture-seeded', '1');
  }, {key: mode === 'sandbox' ? SANDBOX_SAVE : STORY_SAVE, value: save(s), mute, once});
}
