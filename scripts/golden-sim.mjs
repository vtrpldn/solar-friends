// Golden simulation harness for behaviour-preserving refactors of the simulation.
// The simulation is deterministic (no Math.random or clock reads), so a refactor that changes
// nothing produces byte-identical saves after any number of ticks.
//
//   node scripts/golden-sim.mjs --record artifacts/golden-sim.json   on the commit before the refactor
//   node scripts/golden-sim.mjs --compare artifacts/golden-sim.json  after each step
//   options: --quick (fewer, shorter runs)  --only <word>
//
// Every scenario × navigation mode runs in its own child process, because simulation modules
// keep caches at module level (route caches, registered worlds).
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), option = name => {const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1];};
const EVIDENCE = [
  ...readdirSync(path.join(root, 'docs/balance/evidence')).filter(f => f.endsWith('-save.json')).map(f => `docs/balance/evidence/${f}`),
  'docs/releases/evidence/2026-11-17-production-save.json',
];
const CHECKPOINTS = args.includes('--quick') ? [1, 100, 2000] : [1, 10, 100, 1000, 5000, 20000, 36000];
const SCENARIOS = [
  {name: 'weekend-42', build: 'weekend'},
  {name: 'sandbox-42', build: 'sandbox'},
  {name: 'weekend-42-dt1', build: 'weekend', dt: 1},
  ...EVIDENCE.map(file => ({name: path.basename(file, '.json'), build: 'save', file})),
];

if (process.env.GOLDEN_CHILD) {
  const {scenario, fast, checkpoints} = JSON.parse(process.env.GOLDEN_CHILD);
  const sim = await import('../web/v02/weekend/simulation.js');
  let s;
  if (scenario.build === 'weekend') {s = sim.createWeekend(42); sim.chooseCamp(s, 'entrance');}
  else if (scenario.build === 'sandbox') s = sim.createSandbox(42);
  else {s = sim.restore(readFileSync(path.join(root, scenario.file), 'utf8')); if (!s) throw Error(`${scenario.file} no longer restores`);}
  if (fast) sim.enableFastNavigation(s);
  const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const out = {restored: hash(sim.save(s))}, dt = scenario.dt ?? .1;
  let chain = '', done = 0;
  for (const target of checkpoints) {
    for (; done < target; done++) {
      sim.tick(s, dt);
      if ((done + 1) % 100 === 0) chain = hash(chain + sim.save(s));
    }
    out[target] = hash(sim.save(s));
  }
  out.chain = chain;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const only = option('--only');
const jobs = SCENARIOS.filter(sc => !only || sc.name.includes(only)).flatMap(scenario => [true, false].map(fast => ({scenario, fast})));
const run = ({scenario, fast}) => new Promise((resolve, reject) => {
  let out = '', err = '';
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {cwd: root, env: {...process.env, GOLDEN_CHILD: JSON.stringify({scenario, fast, checkpoints: CHECKPOINTS})}});
  child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
  child.on('close', code => code ? reject(Error(`${scenario.name} ${fast ? 'fast' : 'plain'}: ${err.trim().split('\n').slice(-5).join('\n')}`)) : resolve(JSON.parse(out)));
});
const results = {}, started = Date.now();
let index = 0;
await Promise.all(Array.from({length: Math.max(1, availableParallelism() - 2)}, async () => {
  while (index < jobs.length) {
    const job = jobs[index++];
    results[`${job.scenario.name} ${job.fast ? 'fast' : 'plain'}`] = await run(job);
  }
}));
const sorted = Object.fromEntries(Object.keys(results).sort().map(k => [k, results[k]]));
const record = option('--record'), compare = option('--compare');
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (record) {
  mkdirSync(path.dirname(path.resolve(root, record)), {recursive: true});
  writeFileSync(path.resolve(root, record), JSON.stringify({commit, checkpoints: CHECKPOINTS, results: sorted}, null, 1));
  console.log(`Recorded ${jobs.length} runs at ${commit} in ${((Date.now() - started) / 1000).toFixed(0)}s → ${record}`);
} else if (compare) {
  const base = JSON.parse(readFileSync(path.resolve(root, compare), 'utf8'));
  if (JSON.stringify(base.checkpoints) !== JSON.stringify(CHECKPOINTS)) throw Error('Checkpoints differ from the baseline: use the same --quick setting');
  const diffs = [];
  for (const [key, value] of Object.entries(sorted)) {
    const old = base.results[key];
    if (!old) {diffs.push(`${key}: not in baseline`); continue;}
    const first = ['restored', ...CHECKPOINTS.map(String), 'chain'].find(k => old[k] !== value[k]);
    if (first) diffs.push(`${key}: first differs at ${first === 'restored' ? 'restore' : first === 'chain' ? 'the running chain' : `tick ${first}`}`);
  }
  for (const d of diffs) console.log(`DIFF ${d}`);
  console.log(`${diffs.length ? 'FAIL' : 'PASS'} ${jobs.length - diffs.length}/${jobs.length} runs match ${base.commit} (now ${commit}) in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  process.exitCode = diffs.length ? 1 : 0;
} else console.log(JSON.stringify(sorted, null, 1));
