import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

export async function checkSkillControls({page,saved,capture}){
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('[data-dev-tab="simulation"]').click();
  await page.locator('#dev-scenario').selectOption('learning');await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='learning');await page.locator('#dev-close').click();
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  await page.locator('#resident-strip [data-citizen="0"]').click();
  await page.locator('.resident-learning summary').click();
  assert.equal(await page.locator('.skill-entry').count(),6);
  assert.match(await page.locator('.skill-entry').nth(2).textContent(),/Experienced · 12% faster work/);
  assert.equal(await page.locator('.skill-pips').nth(2).getAttribute('aria-label'),'Growing level 4 of 5');
  assert.equal(await page.locator('.skill-entry progress').nth(2).getAttribute('value'),'100');
  assert(!await page.locator('.sandbox-learning').isVisible(),'Story learning is part of its ordinary simulation');
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    await page.locator('.skill-journal>small').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#person').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
    await capture(`Resident field notes show earned experience at ${viewport.width}px`,`learning-${viewport.width}.png`);
  }
  await page.locator('.close-person').click();await page.locator('#resident-strip [data-citizen="2"]').click();
  await page.locator('.resident-learning summary').click();
  assert.match(await page.locator('.skill-entry').nth(3).textContent(),/Confident · 9% faster work/);
  assert.match(await page.locator('.skill-entry').nth(0).textContent(),/Starting out · Usual pace/);
  const mutations=await page.locator('.skill-journal').evaluate(el=>new Promise(resolve=>{
    let count=0;const observer=new MutationObserver(records=>{count+=records.length;});
    observer.observe(el,{subtree:true,childList:true,characterData:true,attributes:true});
    setTimeout(()=>{observer.disconnect();resolve(count);},600);
  }));
  assert.equal(mutations,0,'Paused field notes remain stable');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before,'Inspecting skills never grants experience or changes the world');
  await page.locator('.close-person').click();await page.locator('#dev-button').click();
  const earned=JSON.parse(await readFile('artifacts/skills/earned.json','utf8'));
  await page.locator('#dev-import-file').setInputFiles('artifacts/skills/earned.json');
  await page.waitForFunction(minutes=>window.solarDev.snapshot().village.minutes===minutes,earned.village.minutes);
  await page.locator('#dev-close').click();await page.locator('#resident-strip [data-citizen="0"]').click();
  await page.locator('.resident-learning summary').click();
  for(let i=0;i<6;i++)assert.equal(Number(await page.locator('.skill-entry progress').nth(i).getAttribute('value')),earned.village.skills.people[0].experience[i]);
  await page.locator('.skill-journal>small').scrollIntoViewIfNeeded();
  await capture('Field notes replay experience earned through fourteen days of useful work','learning-earned.png');
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Learning fixtures protect the saved village');
  await page.locator('.close-person').click();await page.locator('#dev-button').click();
}

export async function checkSkillSandboxSave({browser,base,output,screenshots,errors}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  async function open(){await page.locator('#resident-strip [data-citizen="0"]').click();await page.locator('.resident-learning summary').click();}
  async function reload(){await page.reload();await page.locator('[data-continue="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await open();}
  try{
    await page.goto(base);await page.waitForFunction(()=>window.solarDev);
    await page.locator('[data-new-mode="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();await open();
    assert(!await page.locator('.learning-toggle').isChecked());assert.match(await page.locator('.skill-journal').textContent(),/benefits are paused/);
    await page.locator('.learning-toggle').check();
    assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('solar-friends-v3-sandbox')).village.skills.enabled));
    await reload();assert(await page.locator('.learning-toggle').isChecked());assert.match(await page.locator('.skill-journal').textContent(),/Learning is active/);
    await page.locator('.sandbox-learning').scrollIntoViewIfNeeded();
    const file='learning-sandbox-reload.png';await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push({label:'Sandbox learning survives Continue sandbox',file});
    await page.locator('.learning-toggle').uncheck();await reload();assert(!await page.locator('.learning-toggle').isChecked());
    assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),null,'Sandbox learning never creates a Story save');
  }finally{await context.close();}
}
