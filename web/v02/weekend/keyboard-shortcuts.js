// The single source of truth for keyboard bindings. The key handlers in
// game.js and camera-navigation.js, the hint badges on buttons and the
// "Keyboard & camera" help dialog all read this table; nothing else may name a
// key. scripts/verify-v02-keyboard-shortcuts.mjs fails on duplicates and drift.
//
// Matching is deliberate about keyboard layouts:
// - `code` bindings follow the physical key. They are for clusters whose shape
//   matters (W A S D with Q/E beside them, the , . pair, the number row) and
//   for keys that are the same everywhere (Space, Enter, arrows).
// - `key` bindings follow the character the layout prints, so a mnemonic such
//   as B for Build stays on the key labelled B on AZERTY, QWERTZ or Dvorak.
//   Layouts that print no Latin letter (Cyrillic, Greek…) fall back to the US
//   position of the letter.
// A physical `code` binding always wins, so on a layout that prints a mnemonic
// letter on one of the camera keys (Colemak's R and F, Dvorak's O) the camera
// keeps the key and the action stays reachable from its button.
//
// Fields: `label` is what hints and help print. `held` bindings are continuous
// camera movement, grouped by direction. `shift: true` requires Shift,
// `shift: 'any'` ignores it (symbols sit on different levels per layout), and
// by default Shift must be up. `hint` selects the controls that show the key;
// an object maps a selector to the part of the label it shows. `quiet` does the
// same for controls whose face already is the key: they get the accessible
// shortcut and a tooltip but no badge. `modal` lets a
// binding work while that dialog is open, to close it or switch its screens.
// `note` rows are documentation for input no handler in this table owns.
export const BINDINGS = [
  {id: 'pan', group: 'Camera', label: 'W A S D', alt: 'arrow keys', text: 'Move across the land. On the map, arrow keys also aim the reticle.',
    held: {forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight']}},
  {id: 'pan-fast', group: 'Camera', label: 'Shift', text: 'Hold to move faster', held: {fast: ['ShiftLeft', 'ShiftRight']}},
  {id: 'turn', group: 'Camera', label: 'Q / E', text: 'Turn the view', held: {turnLeft: ['KeyQ'], turnRight: ['KeyE']},
    hint: {'#rotate-left': 'Q', '#rotate-right': 'E'}},
  {id: 'tilt', group: 'Camera', label: ', / .', text: 'Tilt the view', held: {tiltUp: ['Comma'], tiltDown: ['Period']}},
  {id: 'zoom', group: 'Camera', label: '+ / −', text: 'Zoom in / out',
    held: {zoomIn: ['NumpadAdd'], zoomOut: ['NumpadSubtract']}, heldKey: {zoomIn: ['+', '='], zoomOut: ['-', '_']},
    quiet: {'#zoom-in': '+', '#zoom-out': '−'}},
  {id: 'home', group: 'Camera', label: 'Home', text: 'Center on camp', code: ['Home'], hint: '#home'},
  {id: 'grid', group: 'Camera', label: 'G', text: 'Show or hide the grid', key: ['g'], hint: '#grid'},
  {id: 'lenses', group: 'Camera', label: 'L', text: 'Map lenses', key: ['l'], hint: '#lens-toggle'},

  {id: 'activate', group: 'Map', label: 'Enter', text: 'Select, place or shape at the center reticle', code: ['Enter', 'NumpadEnter']},
  {id: 'activate-repeat', group: 'Map', label: 'Shift + Enter', text: 'Place and keep building / extend a straight road', code: ['Enter', 'NumpadEnter'], shift: true},
  {id: 'rotate', group: 'Map', label: 'R', text: 'Rotate the building being placed', key: ['r'], hint: '#rotate-placement'},
  {id: 'rotate-back', group: 'Map', label: 'Shift + R', text: 'Rotate it the other way', key: ['r'], shift: true},
  {id: 'find', group: 'Map', label: 'F', text: 'Find the selected building, or the camp', key: ['f'], hint: '#focus-selection'},
  {id: 'back', group: 'Map', label: 'Esc', text: 'Step back: clear a search, cancel placement or finish a road plan, close the open panel, clear the lens, then the selection',
    code: ['Escape'], shift: 'any', hint: '#cancel'},

  {id: 'pause', group: 'Time', label: 'Space', text: 'Pause / resume', code: ['Space'], hint: '#pause'},
  {id: 'speed', group: 'Time', label: '1–4', text: 'Speed: 1× / 4× / 8× / 16×', hint: '#speed',
    values: {Digit1: 1, Digit2: 4, Digit3: 8, Digit4: 16}, code: ['Digit1', 'Digit2', 'Digit3', 'Digit4']},
  {id: 'advance-days', group: 'Time', label: 'X', text: 'Advance days', key: ['x'], hint: '#time-skip'},

  {id: 'build', group: 'Village', label: 'B', text: 'Build catalog', key: ['b'], panel: 'build', hint: '[data-panel-toggle="build"]'},
  {id: 'projects', group: 'Village', label: 'J', text: 'Projects', key: ['j'], panel: 'projects-panel', hint: '[data-panel-toggle="projects-panel"]'},
  {id: 'residents', group: 'Village', label: 'N', text: 'Residents', key: ['n'], panel: 'people', modal: 'people', hint: '[data-panel-toggle="people"]'},
  {id: 'terrain', group: 'Village', label: 'T', text: 'Terrain tools', key: ['t'], panel: 'terrain-panel', hint: '[data-panel-toggle="terrain-panel"]'},
  {id: 'search', group: 'Village', label: '/', text: 'Search buildings, or resources in the almanac', key: ['/'], shift: 'any', modal: 'management',
    hint: '#build-search, #resource-search'},

  {id: 'finances', group: 'Almanac', label: 'M', text: 'Finances', key: ['m'], screen: 'finances', modal: 'management', hint: '[data-manage="finances"], [data-panel="finances"]'},
  {id: 'items', group: 'Almanac', label: 'K', text: 'Items & equipment', key: ['k'], screen: 'items', modal: 'management', hint: '[data-manage="items"]'},
  {id: 'crafting', group: 'Almanac', label: 'C', text: 'Crafting & repairs', key: ['c'], screen: 'crafting', modal: 'management', hint: '[data-manage="crafting"]'},
  {id: 'food', group: 'Almanac', label: 'Y', text: 'Food', key: ['y'], screen: 'food', modal: 'management', hint: '[data-manage="food"]'},
  {id: 'resources', group: 'Almanac', label: 'I', text: 'Resources', key: ['i'], screen: 'resources', modal: 'management', hint: '[data-manage="resources"]'},
  {id: 'water', group: 'Almanac', label: 'U', text: 'Water & sanitation', key: ['u'], screen: 'water', modal: 'management', hint: '[data-manage="water"]'},
  {id: 'power', group: 'Almanac', label: 'P', text: 'Power', key: ['p'], screen: 'power', modal: 'management', hint: '[data-manage="power"]'},

  {id: 'guide', group: 'Help & options', label: 'H', text: 'Village guide', key: ['h'], modal: 'village-guide', hint: '#open-guide'},
  {id: 'view-options', group: 'Help & options', label: 'V', text: 'View & options: camera buttons, saves, sound', key: ['v'], hint: '.view-menu > summary'},
  {id: 'help', group: 'Help & options', label: '?', text: 'This list of keyboard and camera controls', key: ['?'], shift: 'any', modal: 'controls-dialog', quiet: '#show-controls'},

  {id: 'skip-arrival', group: 'Arrival & camp', label: 'Esc', alt: 'Enter or Space', text: 'Skip the drive in', note: true},
  {id: 'rotate-camp', group: 'Arrival & camp', label: 'R', alt: 'Shift + R', text: 'Turn the camp while choosing where to pitch it', note: true},
  {id: 'keep-camp', group: 'Arrival & camp', label: 'Esc', text: 'Keep the camp where it is while moving it', note: true},

  {id: 'tab', group: 'Menus & dialogs', label: 'Tab', alt: 'Shift + Tab', text: 'Move between controls', note: true},
  {id: 'arrows', group: 'Menus & dialogs', label: '↑ ← ↓ →', text: 'Move to the nearest button in that direction; from a search field, ↓ enters the results', note: true},
  {id: 'press', group: 'Menus & dialogs', label: 'Enter', alt: 'Space', text: 'Press the focused button', note: true},
  {id: 'close', group: 'Menus & dialogs', label: 'Esc', text: 'Close the dialog and return to where you were', note: true},

  {id: 'mouse-pan', group: 'Mouse', label: 'Drag', text: 'Move across the land', note: true},
  {id: 'mouse-orbit', group: 'Mouse', label: 'Right-drag', text: 'Turn and tilt the view', note: true},
  {id: 'mouse-zoom', group: 'Mouse', label: 'Scroll', text: 'Zoom', note: true},
  {id: 'mouse-repeat', group: 'Mouse', label: 'Shift-click', text: 'Place and keep building / extend a straight road', note: true},
];

const byId = Object.fromEntries(BINDINGS.map(binding => [binding.id, binding]));
export const binding = id => byId[id];
export const keyLabel = id => byId[id].label;

const shiftMode = b => b.shift === true ? 'shift' : b.shift === 'any' ? 'any' : 'plain';
/** Every physical or printed key a binding claims, as `code:KeyW/plain`. */
export function claims(b) {
  const mode = shiftMode(b);
  return [
    ...(b.code || []).map(code => `code:${code}/${mode}`),
    ...(b.key || []).map(key => `key:${key}/${mode}`),
    ...Object.values(b.held || {}).flat().map(code => `code:${code}/held`),
    ...Object.values(b.heldKey || {}).flat().map(key => `key:${key}/held`),
  ];
}
/** Pairs of bindings that would answer the same key press. */
export function bindingConflicts(bindings = BINDINGS) {
  const seen = new Map(), conflicts = [];
  const overlap = (a, b) => a === b || a === 'any' || b === 'any' || a === 'held' || b === 'held';
  for (const b of bindings) for (const claim of claims(b)) {
    const [key, mode] = claim.split('/');
    for (const other of seen.get(key) || [])
      if (other.id !== b.id && overlap(mode, other.mode)) conflicts.push(`${key}: ${other.id} and ${b.id}`);
    seen.set(key, [...(seen.get(key) || []), {id: b.id, mode}]);
  }
  // A mnemonic letter must not sit on a camera key in the reference US layout.
  for (const b of bindings) for (const key of b.key || [])
    if (/^[a-z]$/.test(key) && seen.has(`code:Key${key.toUpperCase()}`))
      conflicts.push(`key:${key}: ${b.id} is on a camera key`);
  return conflicts;
}

const typing = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
export function ignoreGameShortcut(event, dialogOpen = false) {
  return dialogOpen || event.defaultPrevented || event.repeat || event.isComposing ||
    event.ctrlKey || event.metaKey || event.altKey ||
    !!event.target?.closest?.(typing);
}

const heldCodes = new Map(), heldKeys = new Map(), codes = new Map(), keys = new Map();
for (const b of BINDINGS) {
  for (const [, list] of Object.entries(b.held || {})) for (const code of list) heldCodes.set(code, list[0]);
  for (const [part, list] of Object.entries(b.heldKey || {})) for (const key of list) heldKeys.set(key, b.held[part][0]);
  for (const code of b.code || []) codes.set(code, [...(codes.get(code) || []), b]);
  for (const key of b.key || []) keys.set(key, [...(keys.get(key) || []), b]);
}
const printed = event => typeof event.key === 'string' && event.key.length === 1 ? event.key.toLowerCase() : '';
/**
 * The camera movement a held key drives, as the canonical code that
 * cameraStep reads (the first code listed for that direction), or null.
 */
export function heldCode(event) {
  if (heldCodes.has(event.code)) return heldCodes.get(event.code);
  // Numpad and symbol keys print + and − in different places per layout.
  return codes.has(event.code) ? null : heldKeys.get(printed(event)) ?? null;
}
export const HELD = Object.fromEntries(BINDINGS.flatMap(b => Object.entries(b.held || {})));

/** The discrete binding a key press means, or null. Modifiers other than Shift never match. */
export function bindingFor(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null;
  let candidates = codes.get(event.code);
  if (!candidates && !heldCodes.has(event.code)) {
    const key = printed(event);
    candidates = keys.get(key);
    if (!candidates && key && key.charCodeAt(0) > 127 && /^Key[A-Z]$/.test(event.code || ''))
      candidates = keys.get(event.code.slice(3).toLowerCase());
  }
  return candidates?.find(b => b.shift === 'any' || (b.shift === true) === !!event.shiftKey) || null;
}

/** Rows of the help dialog, grouped in table order. */
export function helpGroups(bindings = BINDINGS) {
  const groups = [];
  for (const b of bindings) {
    let group = groups.find(g => g.name === b.group);
    if (!group) groups.push(group = {name: b.group, rows: []});
    group.rows.push({id: b.id, keys: [b.label, ...(b.alt ? [b.alt] : [])], text: b.text});
  }
  return groups;
}
export function renderShortcutHelp(container) {
  const document = container.ownerDocument;
  const make = (tag, text, parent) => { const el = document.createElement(tag); if (text) el.textContent = text; parent.append(el); return el; };
  container.replaceChildren();
  for (const group of helpGroups()) {
    const section = make('section', '', container);
    make('h3', group.name, section);
    const list = make('dl', '', section);
    for (const row of group.rows) {
      const term = make('dt', '', list);
      term.dataset.binding = row.id;
      row.keys.forEach((key, i) => { if (i) term.append(' or '); make('kbd', key, term); });
      make('dd', row.text, list);
    }
  }
}

/** Every control that shows a key: [selector, label]. */
export function hintTargets(bindings = BINDINGS, field = 'hint') {
  return bindings.flatMap(b => !b[field] ? [] : typeof b[field] === 'string' ? [[b[field], b.label]] : Object.entries(b[field]));
}
const ariaKey = label => label.replace('1–4', '1 2 3 4').replace('−', '-').replace('Esc', 'Escape');
/** Stamp the key badge and aria-keyshortcuts on each control named in the table. Safe to repeat. */
export function applyShortcutHints(root) {
  for (const [selector, label] of hintTargets()) for (const el of root.querySelectorAll(selector)) {
    if (el.matches('input')) {
      const base = el.dataset.placeholder ??= el.placeholder.replace(/\s+\/$/, '');
      el.placeholder = `${base}  ${label}`;
    } else if (el.dataset.shortcut !== label) el.dataset.shortcut = label;
    if (el.getAttribute('aria-keyshortcuts') !== ariaKey(label)) el.setAttribute('aria-keyshortcuts', ariaKey(label));
  }
  for (const [selector, label] of hintTargets(BINDINGS, 'quiet')) for (const el of root.querySelectorAll(selector)) {
    el.setAttribute('aria-keyshortcuts', ariaKey(label));
    el.title ||= `${el.getAttribute('aria-label') || el.textContent.trim()} · ${label}`;
  }
}
