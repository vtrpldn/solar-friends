// Static keyboard checks: the binding table has no conflicts, every binding
// has a handler, and no hint or help text names a key outside the table.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BINDINGS, bindingConflicts, bindingFor, heldCode, helpGroups, hintTargets, ignoreGameShortcut, binding, claims} from '../web/v02/weekend/keyboard-shortcuts.js';

const read = name => readFile(new URL(`../web/v02/weekend/${name}`, import.meta.url), 'utf8');
const [html, game, camera, lensesSource, menuHtml] = await Promise.all(['index.html', 'game.js', 'camera-navigation.js', 'lenses.js', 'menu.html'].map(read));

// Guards: typing, modals, modifiers, composition and auto-repeat never trigger actions.
assert.equal(ignoreGameShortcut({}), false);
assert.equal(ignoreGameShortcut({}, true), true, 'modal dialogs isolate game shortcuts');
for (const key of ['repeat', 'isComposing', 'ctrlKey', 'metaKey', 'altKey', 'defaultPrevented'])
  assert.equal(ignoreGameShortcut({[key]: true}), true, key);
assert.equal(ignoreGameShortcut({target: {closest: () => ({})}}), true, 'typing never triggers game actions');
for (const modifier of ['ctrlKey', 'metaKey', 'altKey'])
  for (const b of BINDINGS.filter(b => b.key))
    assert.equal(bindingFor({key: b.key[0], code: '', [modifier]: true}), null, `${modifier}+${b.key[0]} stays with the browser`);

// No two bindings answer the same key, and the detector itself works.
assert.deepEqual(bindingConflicts(), [], 'duplicate bindings');
assert.equal(new Set(BINDINGS.map(b => b.id)).size, BINDINGS.length, 'binding ids are unique');
assert.equal(bindingConflicts([...BINDINGS, {id: 'clash', key: ['b']}]).length, 1, 'a second B is reported');
assert.equal(bindingConflicts([...BINDINGS, {id: 'clash', key: ['w']}]).length, 1, 'a mnemonic on a camera key is reported');
assert.equal(bindingConflicts([...BINDINGS, {id: 'clash', code: ['Enter'], shift: 'any'}]).length, 2, 'a Shift-agnostic Enter collides with both Enter bindings');
for (const b of BINDINGS) {
  assert(b.label && b.text && b.group, `${b.id} is documented`);
  assert(b.note ? !claims(b).length : claims(b).length, `${b.id} ${b.note ? 'is a note without keys' : 'claims a key'}`);
}

// Layouts: mnemonics follow the printed letter, camera keys follow position.
assert.equal(bindingFor({key: 'b', code: 'KeyB'}).id, 'build');
assert.equal(bindingFor({key: 'B', code: 'KeyB', shiftKey: true}), null, 'Shift+letter is not the plain binding');
assert.equal(bindingFor({key: 'R', code: 'KeyR', shiftKey: true}).id, 'rotate-back');
assert.equal(bindingFor({key: 'm', code: 'Semicolon'}).id, 'finances', 'AZERTY M');
assert.equal(bindingFor({key: 'a', code: 'KeyQ'}), null, 'AZERTY A is the physical Q camera key');
assert.equal(heldCode({key: 'a', code: 'KeyQ'}), 'KeyQ');
assert.equal(heldCode({key: 'z', code: 'KeyW'}), 'KeyW', 'AZERTY Z pans forward');
assert.equal(bindingFor({key: 'и', code: 'KeyB'}).id, 'build', 'Cyrillic falls back to the US position');
assert.equal(bindingFor({key: ',', code: 'KeyM'}), null, 'a Latin symbol does not fall back');
assert.equal(bindingFor({key: '/', code: 'Digit7', shiftKey: true}).id, 'search', 'QWERTZ slash');
assert.equal(bindingFor({key: '?', code: 'Slash', shiftKey: true}).id, 'help');
assert.equal(bindingFor({key: '/', code: 'Slash'}).id, 'search');
assert.equal(bindingFor({key: '&', code: 'Digit1'}).id, 'speed', 'AZERTY number row works unshifted');
assert.equal(heldCode({key: '+', code: 'BracketRight'}), 'NumpadAdd', 'QWERTZ plus zooms');
assert.equal(heldCode({key: '-', code: 'Slash'}), 'NumpadSubtract');
assert.equal(bindingFor({key: 'Enter', code: 'Enter', shiftKey: true}).id, 'activate-repeat');
assert.deepEqual(Object.values(binding('speed').values), [1, 4, 8, 16]);

// Every discrete binding has exactly one handler entry in game.js (Home lives with the camera).
const actions = game.slice(game.indexOf('const shortcutActions = {'), game.indexOf('addEventListener("keydown"', game.indexOf('const shortcutActions = {')));
const handled = new Set([...actions.matchAll(/^  (?:'([\w-]+)'|([\w]+)):/gm)].map(m => m[1] || m[2]));
const discrete = BINDINGS.filter(b => (b.key || b.code) && b.id !== 'home').map(b => b.id);
assert.deepEqual([...handled].sort(), [...discrete].sort(), 'shortcutActions matches the table');
assert(camera.includes('binding("home")') && camera.includes('heldCode(event)') && camera.includes('HELD[part]'), 'camera movement reads the table');
assert(!/KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|Comma|Period|NumpadAdd/.test(camera), 'camera-navigation names no key itself');

// Handlers may not match keys on their own: only Shift (a modifier, not a binding) is read directly.
for (const [name, source] of [['game.js', game], ['lenses.js', lensesSource]]) {
  const literal = [...source.matchAll(/\b(?:e|event)\.(?:code|key)\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]).filter(k => k !== 'Shift');
  assert.deepEqual(literal, [], `${name} matches keys outside the binding table`);
}

// Hints: every control named by the table exists, and static markup agrees with it.
const targets = [...hintTargets(), ...hintTargets(BINDINGS, 'quiet')];
const dynamic = ['#lens-toggle', '[data-panel="finances"]']; // created by scripts
for (const [selectors] of targets) for (const selector of selectors.split(',').map(s => s.trim())) {
  if (dynamic.includes(selector)) continue;
  const id = selector.match(/^#([\w-]+)$/)?.[1], attribute = selector.match(/^\[([\w-]+)="([^"]+)"\]$/);
  const found = id ? html.includes(`id="${id}"`) : attribute ? html.includes(`${attribute[1]}="${attribute[2]}"`) : selector === '.view-menu > summary' && /class="view-menu">\s*<summary>/.test(html);
  assert(found, `hint target ${selector} exists in index.html`);
}
assert(lensesSource.includes('id="lens-toggle"'));
const labels = new Set(targets.map(([, label]) => label));
for (const [, label] of html.matchAll(/data-shortcut="([^"]+)"/g)) assert(labels.has(label), `static hint ${label} is in the table`);
for (const tag of html.match(/<[^>]+data-shortcut="[^"]+"[^>]*>/g) || []) {
  const label = tag.match(/data-shortcut="([^"]+)"/)[1];
  const expected = targets.find(([selectors, l]) => l === label && selectors.split(',').some(selector => {
    const id = selector.trim().match(/^#([\w-]+)$/)?.[1], attribute = selector.trim().match(/^\[([\w-]+)="([^"]+)"\]$/);
    return id ? tag.includes(`id="${id}"`) : attribute && tag.includes(`${attribute[1]}="${attribute[2]}"`);
  }));
  assert(expected, `static hint ${label} sits on the control the table names: ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
}

// Help: generated only. No hand-written key list survives anywhere in the pages.
assert.equal((html.match(/<kbd/g) || []).length, 0, 'index.html has no hand-written <kbd>');
assert.equal((menuHtml.match(/<kbd/g) || []).length, 0);
assert.equal((lensesSource.match(/<kbd/g) || []).length, 0);
assert(html.includes('id="controls-list"') && game.includes('renderShortcutHelp($("controls-list"))'), 'help dialog is rendered from the table');
const rows = helpGroups().flatMap(g => g.rows);
assert.equal(rows.length, BINDINGS.length, 'help lists every binding once');
assert.deepEqual(helpGroups().map(g => g.name), ['Camera', 'Map', 'Time', 'Village', 'Almanac', 'Help & options', 'Arrival & camp', 'Menus & dialogs', 'Mouse']);
console.log(`PASS ${BINDINGS.length} bindings: no duplicates, layout-aware matching, guards, one handler each, hints and help generated from the table`);
