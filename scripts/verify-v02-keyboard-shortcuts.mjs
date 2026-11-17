import assert from 'node:assert/strict';
import {ignoreGameShortcut, PANEL_SHORTCUTS, MANAGEMENT_SHORTCUTS, SPEED_SHORTCUTS} from '../web/v02/weekend/keyboard-shortcuts.js';
assert.equal(ignoreGameShortcut({}), false);
assert.equal(ignoreGameShortcut({}, true), true, 'all modal dialogs isolate game shortcuts');
for (const key of ['repeat', 'isComposing', 'ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
  assert.equal(ignoreGameShortcut({[key]: true}), true, key);
}
assert.equal(ignoreGameShortcut({target: {closest: () => ({})}}), true, 'typing never triggers game actions');
const codes = [...Object.keys(PANEL_SHORTCUTS), ...Object.keys(MANAGEMENT_SHORTCUTS), ...Object.keys(SPEED_SHORTCUTS)];
assert.equal(new Set(codes).size, codes.length);
for (const code of ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyR','KeyF','KeyG']) assert(!codes.includes(code), `${code} retains its camera or placement action`);
assert.deepEqual(Object.values(SPEED_SHORTCUTS), [1,4,8,16]);
console.log('PASS keyboard typing, modal, modifier, composition, repetition, and shortcut collision guards');
