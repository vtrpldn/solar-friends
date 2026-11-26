// Browser keyboard check. Only key presses are sent: no pointer input.
// Fails when a hint or the help dialog drifts from the binding table, when a
// shortcut fires while typing or with a modifier, or when focus is lost.
import {launchBrowser} from './browser.mjs';
import assert from 'node:assert/strict';
import {serve} from './serve.mjs';
import {BINDINGS, helpGroups, hintTargets} from '../web/v02/weekend/keyboard-shortcuts.js';
const server=await serve(0);
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const k=page.keyboard,settle=()=>page.waitForTimeout(250);
const press=async key=>{if(process.env.KB_TRACE)console.log('press',key);await k.press(key);await settle();};
const focused=()=>page.evaluate(()=>{const e=document.activeElement;return e?.id||e?.className||e?.tagName;});
const openDialog=()=>page.evaluate(()=>document.querySelector('dialog[open]')?.id||null);
const paused=async()=>await page.locator('#pause').getAttribute('aria-label')==='Resume simulation';
const visible=selector=>page.locator(selector).isVisible();
try {
await page.goto(`http://127.0.0.1:${server.address().port}/v2/?utilities-preview&interactions&lighting-hour=12`);
await page.waitForSelector('#lens-toggle');await page.waitForSelector('#supplies button');
assert.equal(await focused(),'world','the land has focus when the game loads');
// The preview starts paused and stays paused: a running village competes with the checks for the CPU.
assert.equal(await paused(),true);

// Hints: every control the table names shows its key, and nothing else shows one.
const expected=[...hintTargets(),...hintTargets(BINDINGS,'quiet')];
const hints=await page.evaluate(targets=>{
  const seen=new Map(),problems=[];
  for(const [selector,label,quiet] of targets){
    const elements=[...document.querySelectorAll(selector)];
    if(!elements.length)problems.push(`${selector} matches nothing`);
    for(const el of elements){
      seen.set(el,label);
      const shown=el.matches('input')?el.placeholder.endsWith(label)&&label:quiet?label:el.dataset.shortcut;
      if(shown!==label)problems.push(`${selector} shows ${shown}, table says ${label}`);
      if(!el.getAttribute('aria-keyshortcuts'))problems.push(`${selector} has no aria-keyshortcuts`);
    }
  }
  for(const el of document.querySelectorAll('[data-shortcut],[aria-keyshortcuts]'))
    if(!seen.has(el))problems.push(`${el.id||el.outerHTML.slice(0,60)} shows a key the table does not give it`);
  return problems;
},[...hintTargets().map(t=>[...t,false]),...hintTargets(BINDINGS,'quiet').map(t=>[...t,true])]);
assert.deepEqual(hints,[],'hint drift');
assert(expected.length>=25);
const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.checkVisibility()&&!(b.getAttribute('aria-label')||b.textContent.trim()||b.title)).map(b=>b.id||b.outerHTML.slice(0,80)));
assert.deepEqual(unnamed,[],'every visible button has an accessible name');

// Help: ? opens the generated list, which is exactly the table; ? or Esc closes it and restores pause and focus.
await press('?');
assert.equal(await openDialog(),'controls-dialog');
const shown=await page.evaluate(()=>[...document.querySelectorAll('#controls-list section')].map(section=>({name:section.querySelector('h3').textContent,
  rows:[...section.querySelectorAll('dt')].map(dt=>({id:dt.dataset.binding,keys:[...dt.querySelectorAll('kbd')].map(kbd=>kbd.textContent),text:dt.nextElementSibling.textContent}))})));
assert.deepEqual(shown,helpGroups(),'help drift');
assert.equal(await page.evaluate(()=>document.querySelectorAll('kbd').length),await page.evaluate(()=>document.querySelectorAll('#controls-list kbd').length),'keys are only named in the generated help');
assert(await page.evaluate(()=>document.querySelector('#controls-dialog').contains(document.activeElement)));
await press('?');assert.equal(await openDialog(),null,'? toggles help');
await press('?');await press('Escape');
assert.equal(await openDialog(),null);assert.equal(await paused(),true,'help leaves a paused village paused');assert.equal(await focused(),'world');

// Each destination: its key opens it with focus inside, modal dialogs trap Tab, Esc closes and returns focus.
const trays={build:'#build',projects:'#projects-panel',terrain:'#terrain-panel'};
for(const b of BINDINGS.filter(b=>b.panel&&trays[b.id])){
  await press(b.key[0]);assert(await visible(trays[b.id]),`${b.label} opens ${b.text}`);
  assert.equal(await page.locator(b.hint).getAttribute('aria-expanded'),'true');
  if(b.id!=='terrain')assert(await page.evaluate(sel=>document.querySelector(sel).contains(document.activeElement),trays[b.id]),`${b.text} takes focus`);
  await press(b.key[0]);assert(!await visible(trays[b.id]),`${b.label} closes ${b.text}`);
  await press(b.key[0]);await press('Escape');assert(!await visible(trays[b.id]),`Esc closes ${b.text}`);
  assert.equal(await focused(),'world',`focus returns to the land after ${b.text}`);
}
const modals=[...BINDINGS.filter(b=>b.screen).map(b=>[b,'management']),[BINDINGS.find(b=>b.id==='residents'),'people'],[BINDINGS.find(b=>b.id==='advance-days'),'time-skip-dialog']];
for(const [b,id] of modals){
  await press(b.key[0]);assert.equal(await openDialog(),id,`${b.label} opens ${b.text}`);
  if(b.screen)assert.equal(await page.locator(`.management-tabs [data-manage="${b.screen}"]`).getAttribute('aria-pressed'),'true');
  assert(await page.evaluate(id=>{const a=document.activeElement;return document.getElementById(id).contains(a)&&a.id!==id;},id),`${b.text} opens with a control focused`);
  // Tab wraps at both ends of the dialog instead of leaving for the browser toolbar.
  const ends=await page.evaluate(id=>{const stops=[...document.getElementById(id).querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.checkVisibility({visibilityProperty:true}));stops.at(-1).focus();return stops.length;},id);
  assert(ends>1);
  for(const key of ['Tab','Tab','Shift+Tab','Shift+Tab','Shift+Tab']){await k.press(key);assert(await page.evaluate(id=>{const a=document.activeElement;return document.getElementById(id).contains(a)&&a.id!==id;},id),`${key} stays inside ${b.text}`);}
  await press('b');assert.equal(await openDialog(),id,'other shortcuts wait behind a modal');assert(!await visible('#build'));
  await press('Escape');assert.equal(await openDialog(),null,`Esc closes ${b.text}`);
  assert.equal(await paused(),true,`${b.text} leaves a paused village paused`);
  if(b.modal){await press(b.key[0]);await page.locator(`#${id} button`).first().focus();await press(b.key[0]);assert.equal(await openDialog(),null,`${b.label} also closes ${b.text}`);}
  await page.locator('#world').focus();
}
// Almanac keys switch screens in place; / reaches the resource search only on Resources.
const screen=()=>page.evaluate(()=>document.querySelector('.management-tabs [aria-pressed="true"]').dataset.manage);
await press('m');await press('u');assert.equal(await screen(),'water');
await press('i');await press('/');assert.equal(await focused(),'resource-search');
await k.type('mup');assert.equal(await screen(),'resources','typing letters never switches screens');
await press('Escape');if(await openDialog())await press('Escape');
assert.equal(await openDialog(),null);

// Typing and modifiers: letters go to the field, Ctrl/Cmd/Alt combinations stay with the browser.
await press('/');assert.equal(await focused(),'build-search');
await k.type('jnt?x1 ');assert.equal(await page.locator('#build-search').inputValue(),'jnt?x1 ');
assert.equal(await openDialog(),null);assert(await visible('#build'));assert.equal(await page.locator('#speed').textContent(),'1×','digits typed in a field do not change speed');
await press('Escape');assert.equal(await page.locator('#build-search').inputValue(),'','Esc first clears the search');assert(await visible('#build'));
await press('Escape');assert(!await visible('#build'),'then closes the catalog');
for(const combo of ['Control+b','Meta+b','Alt+b','Control+m','Meta+l','Alt+h','Control+/']){await press(combo);assert.equal(await openDialog(),null,combo);assert(!await visible('#build'),combo);assert(!await visible('#lens-panel'),combo);}

// Time: Space and the number row.
await page.locator('#world').focus();
await press('3');assert.equal(await page.locator('#speed').textContent(),'8×');await press('1');


// Build catalog: arrows walk categories and cards, Enter picks, placement works from the reticle.
await press('b');
assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-pressed')),'true','catalog opens on the current category');
const firstCategory=await page.evaluate(()=>document.activeElement.textContent);
await press('ArrowDown');assert.notEqual(await page.evaluate(()=>document.activeElement.textContent),firstCategory);
assert(await page.evaluate(()=>!!document.activeElement.closest('#build-categories')));
await press('Enter');await press('ArrowRight');
assert(await page.evaluate(()=>!!document.activeElement.closest('#build-list')),'Right moves from categories into the cards');
const card=await focused();await press('ArrowRight');assert.notEqual(await focused(),card,'arrows move between cards');
assert(await page.evaluate(()=>!!document.activeElement.closest('#build-list')));
await press('Escape');
await press('/');await k.type('garden bench');await press('ArrowDown');
assert.equal(await focused(),'build-garden-bench','Down steps from the search into the results');
await press('Enter');
assert(await visible('#cancel'),'Enter on a card starts placement');assert.equal(await focused(),'world');
assert(await visible('#map-reticle'),'keyboard placement shows the reticle before anything is placed');
assert.match(await page.locator('#rotate-placement').textContent(),/0°/);
await press('r');assert.match(await page.locator('#rotate-placement').textContent(),/90°/);
await press('Shift+R');assert.match(await page.locator('#rotate-placement').textContent(),/ 0°/);
// Esc order with a lens on: the lens menu, then placement, then the lens itself.
await press('l');assert(await visible('#lens-panel'));assert(await page.evaluate(()=>!!document.activeElement.closest('.lens-choices')),'lens menu takes focus');
await press('ArrowDown');await press('Enter');
const lens=await page.locator('body').getAttribute('data-lens');assert(lens,'Enter chooses the focused lens');
await press('l');await press('Escape');assert(!await visible('#lens-panel'),'Esc closes the lens menu first');assert(await visible('#cancel'));
await press('Escape');assert(!await visible('#cancel'),'then cancels placement');assert.equal(await page.locator('body').getAttribute('data-lens'),lens);
await press('Escape');assert.equal(await page.locator('body').getAttribute('data-lens'),'','then clears the lens');
// Place with Shift+Enter (repeat), then Enter, panning with the arrow keys until a site is free.
await page.locator('#world').focus();
await press('/');await press('ArrowDown');await press('Enter');assert(await visible('#cancel'));
let placed=0;
for(let i=0;i<40&&placed<1;i++){
  await k.down(i%2?'ArrowUp':'ArrowLeft');await page.waitForTimeout(350);await k.up(i%2?'ArrowUp':'ArrowLeft');await settle();
  await press('Shift+Enter');
  if(/planned|placed|built|ready/i.test(await page.locator('#message').textContent()))placed++;
}
assert.equal(placed,1,'Shift+Enter places at the reticle');assert(await visible('#cancel'),'and keeps placing');
await press('Escape');assert(!await visible('#cancel'));
// The reticle is on the new bench: Enter selects it and hands focus to the selection panel.
await press('Enter');
assert(await visible('#selection'),'Enter selects at the reticle');assert.equal(await focused(),'selection','the selection panel takes focus');
assert.match(await page.locator('#selected-name').textContent(),/bench/i);
await press('f');
await press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#selection')),'Tab enters the selection controls');
await press('Escape');assert(!await visible('#selection'),'Esc clears the selection');assert.equal(await focused(),'world');

// View & options: V opens on its first control, Esc closes and returns to the toggle.
await press('v');assert.equal(await focused(),'show-controls');
await press('Escape');assert.equal(await page.evaluate(()=>document.querySelector('.view-menu').open),false);
assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
// Destructive confirmation defaults to the safe choice.
await press('v');await page.locator('#restart').focus();await press('Enter');
assert.equal(await openDialog(),'reset-dialog');assert.equal(await focused(),'keep');await press('Escape');
// Space toggles the clock, and dialogs put it back the way they found it.
await page.locator('#world').focus();
await press('Space');assert.equal(await paused(),false,'Space resumes');
await press('?');assert.equal(await paused(),true,'help pauses');await press('Escape');assert.equal(await paused(),false,'and resumes on close');
await press('Space');assert.equal(await paused(),true,'Space pauses');
assert.deepEqual(errors,[]);
} finally { await browser.close();server.close(); }
console.log('PASS keyboard-only: hints and help match the binding table, every destination opens/closes with focus handled, modals trap Tab, typing and modifiers are ignored, catalog arrows, reticle placement with rotate/repeat/cancel, Esc layering');
