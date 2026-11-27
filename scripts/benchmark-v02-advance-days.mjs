// Times Advance days (time-skip.js's skipDays) on a new story village, headless.
//
//   node scripts/benchmark-v02-advance-days.mjs --record artifacts/advance-days.json   before a change
//   node scripts/benchmark-v02-advance-days.mjs --compare artifacts/advance-days.json  after it
//   options: --exact <days> (default 5)  --fast <days> (default 30)  --runs <n> (default 3, best is kept)
//
// Each run also hashes the final save, so a behaviour-preserving optimisation must report "same".
// Timings move with machine load: compare runs taken close together and trust the best of several.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {createWeekend, chooseCamp, enableFastNavigation, tick, save} from '../web/v02/weekend/simulation.js';
import {skipDays} from '../web/v02/weekend/time-skip.js';

const args = process.argv.slice(2), option = (name, fallback) => {const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1];};
const runs = Number(option('--runs', 3));
const MODES = [{name: 'exact', fast: false, days: Number(option('--exact', 5))}, {name: 'fast', fast: true, days: Number(option('--fast', 30))}];

function newVillage() {
  const s = createWeekend(42);
  chooseCamp(s, 'entrance');
  for (let i = 0; s.arrivalAnimating && i < 10000; i++) tick(s, .1);
  enableFastNavigation(s); // as game.js does
  return s;
}

const results = {};
for (const mode of MODES) {
  if (!mode.days) continue;
  let best = Infinity, hash, steps;
  for (let run = 0; run < runs; run++) {
    const s = newVillage(), started = performance.now();
    ({steps} = await skipDays(s, mode.days, {fast: mode.fast, yieldControl: () => {}}));
    best = Math.min(best, performance.now() - started);
    const now = createHash('sha256').update(save(s)).digest('hex').slice(0, 16);
    if (hash && hash !== now) throw Error(`${mode.name}: two runs of the same skip ended in different saves`);
    hash = now;
  }
  results[mode.name] = {days: mode.days, steps, ms: Math.round(best), msPerDay: Math.round(best / mode.days), usPerTick: +(best / steps * 1000).toFixed(1), hash};
}

const record = option('--record'), compare = option('--compare');
const line = (name, r) => `${name.padEnd(5)} ${String(r.days).padStart(3)} days  ${String(r.ms).padStart(6)} ms  ${String(r.msPerDay).padStart(5)} ms/day  ${String(r.usPerTick).padStart(6)} µs/tick`;
if (record) {
  mkdirSync(path.dirname(path.resolve(record)), {recursive: true});
  writeFileSync(path.resolve(record), JSON.stringify(results, null, 1));
}
const base = compare ? JSON.parse(readFileSync(path.resolve(compare), 'utf8')) : null;
for (const [name, r] of Object.entries(results)) {
  const old = base?.[name];
  console.log(line(name, r) + (old && old.days === r.days ? `   ${(old.ms / r.ms).toFixed(2)}× the baseline's speed (${old.msPerDay} ms/day), final save ${old.hash === r.hash ? 'same' : 'DIFFERENT'}` : ''));
  if (old && old.days === r.days && old.hash !== r.hash) process.exitCode = 1;
}
