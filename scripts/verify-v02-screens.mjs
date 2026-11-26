// A management screen is declared in management.js (SCREENS), both data-manage button rows of
// index.html and the keyboard bindings. This check fails when one of them is missed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BINDINGS} from '../web/v02/weekend/keyboard-shortcuts.js';
const source = readFileSync('web/v02/weekend/management.js', 'utf8');
const screens = Object.keys(Function(`return ${source.match(/export const SCREENS = (\{[\s\S]*?\n\});/)[1]}`)());
const html = readFileSync('web/v02/weekend/index.html', 'utf8');
const rows = [...html.matchAll(/<nav[^>]*>[\s\S]*?<\/nav>|<div[^>]*class="management-tabs"[^>]*>[\s\S]*?<\/div>/g)].map(m => [...m[0].matchAll(/data-manage="([\w-]+)"/g)].map(x => x[1])).filter(r => r.length);
assert(rows.length >= 2, 'both button rows found');
for (const row of rows) assert.deepEqual([...row].sort(), [...screens].sort(), 'each data-manage row lists every screen');
assert.deepEqual(BINDINGS.filter(b => b.screen).map(b => b.screen).sort(), [...screens].sort(), 'every screen has a keyboard binding');
console.log(`PASS ${screens.length} management screens agree across management.js, index.html and the key bindings`);
