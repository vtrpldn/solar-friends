// UI snapshot harness for behaviour-preserving refactors of game.js and the HUD modules.
// Loads fixed paused villages, opens every panel, management screen and resident tab, and
// records the HUD markup after each step. Nothing advances while paused, so a refactor that
// changes nothing produces the same snapshots.
//
//   node scripts/ui-snapshot.mjs --record artifacts/ui-snapshot.json   before the refactor
//   node scripts/ui-snapshot.mjs --compare artifacts/ui-snapshot.json  after each step
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {launchBrowser} from './browser.mjs';
import {serve} from './serve.mjs';
import {village, seedSave} from './fixtures.mjs';
import {BINDINGS} from '../web/v02/weekend/keyboard-shortcuts.js';

const args = process.argv.slice(2), option = name => {const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1];};
const view = {speed: 1, paused: true, position: [20, 35, 20], target: [1, 2, 3], zoom: 1};
const weather = {version: 1, hour: 9, rainMmPerHour: 0, cloudCover: .2, temperatureC: 22};
function story() {
  const {s} = village({buildings: ['kitchen', 'compost', 'shelter'], materials: {food: 20}});
  Object.assign(s, {weather, rain: false, view});
  return s;
}
function sandbox() {
  const {s} = village({sandbox: true, buildings: ['kitchen', 'shelter']});
  Object.assign(s, {weather, rain: false, view});
  return s;
}
const REGIONS = ['header', '#supplies', '#tasks', '#completed-tasks', '#roster', '#resident-detail', '#selection', '#management', '#build-list', '#town', '#log', 'nav', 'dialog[open]', '[data-panel-toggle][aria-expanded="true"]'];

async function snapshots(page) {
  return page.evaluate(regions => {
    const clean = html => html
      .replace(/\s(style)="[^"]*"/g, '')
      .replace(/\b\d{1,2}:\d{2}\b/g, 'HH:MM');
    const out = {};
    for (const selector of regions) {
      const found = [...document.querySelectorAll(selector)].filter(e => !e.hidden && e.getClientRects().length);
      out[selector] = found.map(e => clean(e.outerHTML)).join('\n');
    }
    out.focus = document.activeElement?.id || document.activeElement?.tagName || '';
    return out;
  }, REGIONS);
}

const server = await serve(), browser = await launchBrowser(), result = {};
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [];
try {
  for (const [name, build, mode] of [['story', story, 'story'], ['sandbox', sandbox, 'sandbox']]) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await seedSave(page, build(), {mode});
    await page.goto(`${origin}/v2/?mode=${mode}`);
    await page.locator('#supplies [data-need]').first().waitFor();
    await page.waitForTimeout(1200);
    const capture = async step => {await page.waitForTimeout(600); result[`${name} ${step}`] = await snapshots(page);};
    const close = async () => {for (let i = 0; i < 3; i++) await page.keyboard.press('Escape'); await page.locator('#world').focus();};
    await capture('loaded');
    for (const b of BINDINGS.filter(b => b.key && (b.panel || b.screen || b.modal))) {
      await close();
      await page.keyboard.press(b.key[0].length === 1 ? b.key[0] : b.key[0]);
      await capture(`key ${b.id}`);
    }
    await close();
    await page.locator('[data-panel-toggle="people"]').click();
    for (const tab of await page.locator('#resident-detail [role="tab"], #resident-detail .tabs button').all()) {await tab.click(); await capture(`resident tab ${await tab.innerText()}`);}
    for (const [index, resident] of (await page.locator('#roster button').all()).entries()) {await resident.click(); await capture(`resident ${index}`);}
    await close();
    await page.locator('[data-panel-toggle="projects-panel"]').click();
    const completed = page.locator('#completed-title');
    if (await completed.count()) {await completed.click(); await capture('projects completed');}
    const buildings = await page.locator('#completed-tasks button').count();
    for (let index = 0; index < buildings; index++) {
      const button = page.locator('#completed-tasks button').nth(index);
      if (!await button.isVisible()) {await close(); await page.locator('[data-panel-toggle="projects-panel"]').click(); if (!await button.isVisible()) await completed.click();}
      await button.click({timeout: 5000}); await capture(`select building ${index}`);
    }
    await close();
    await page.locator('[data-panel-toggle="build"]').click();
    await page.locator('#build-search').fill('shelter');
    await capture('build search');
    await page.close();
  }
} finally {await browser.close(); server.close();}

const record = option('--record'), compare = option('--compare');
if (errors.length) console.log(`Page errors:\n${errors.join('\n')}`);
if (record) {
  mkdirSync(path.dirname(path.resolve(record)), {recursive: true});
  writeFileSync(record, JSON.stringify(result, null, 1));
  console.log(`Recorded ${Object.keys(result).length} snapshots → ${record}`);
} else if (compare) {
  const base = JSON.parse(readFileSync(compare, 'utf8')), diffs = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(result)])) {
    if (!base[key] || !result[key]) {diffs.push(`${key}: ${base[key] ? 'missing now' : 'new'}`); continue;}
    for (const region of Object.keys(base[key])) if (base[key][region] !== result[key][region]) {
      const a = base[key][region], b = result[key][region];
      let i = 0; while (i < a.length && a[i] === b[i]) i++;
      diffs.push(`${key} ${region}: …${a.slice(Math.max(0, i - 60), i + 80)}… → …${b.slice(Math.max(0, i - 60), i + 80)}…`);
    }
  }
  for (const d of diffs.slice(0, 20)) console.log(`DIFF ${d}`);
  console.log(`${diffs.length || errors.length ? 'FAIL' : 'PASS'} ${Object.keys(result).length} snapshots, ${diffs.length} differences`);
  process.exitCode = diffs.length || errors.length ? 1 : 0;
} else console.log(Object.keys(result).join('\n'));
