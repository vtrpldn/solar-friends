import assert from 'node:assert/strict';
export async function checkHelpingControls({page,saved,capture}){
  // Helping with water needs a real empty receiver and a reachable supply.
  // The replenished village used for the trade checks already has full buffers.
  if(!await page.locator('#dev-dialog').isVisible())await page.locator('#dev-button').click();
  await page.locator('#dev-import-file').setInputFiles('artifacts/water/before.json');
  await page.waitForFunction(()=>{const v=window.solarDev.snapshot().village;return v.buildings.length===5&&v.water===24&&v.water_supply.trips.length===0;});
  await page.locator('#dev-close').click();
  await page.getByRole('button',{name:'People',exact:true}).click();
  await page.getByRole('button',{name:'Meet Iara',exact:true}).click();
  await page.getByRole('button',{name:'Help build',exact:true}).click();
  assert((await page.locator('#person .response').textContent()).includes('No stage is ready'),'Refusals must be visible in the resident panel');
  await page.getByRole('button',{name:'Water & sanitation',exact:true}).click();
  assert((await page.locator('#person .response').textContent()).includes('Happy'));
  assert(await page.locator('#person .response').isVisible());
  const requested=await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0));
  assert(await page.getByRole('button',{name:`Resume time · let ${requested.name} continue`,exact:true}).isVisible());
  assert.equal(await page.locator('#person .help-order .resume-request').count(),1,'The time action belongs beside the active request');
  assert.equal(requested.task,'water');assert(requested.requested,'A real click must assign the task');
  await capture('Accepted helping request with paused-time guidance','helping-request.png');
  assert(requested.help?.id);assert(['travelling','working'].includes(requested.help.phase));
  assert.equal(await page.locator('#person .help-phase').textContent(),`${requested.name} is on the way`);
  await page.getByRole('button',{name:`Resume time · let ${requested.name} continue`,exact:true}).click();
  assert.equal(await page.locator('#person .resume-request').isVisible(),false);
  assert.equal(await page.locator('#person .help-order').evaluate(el=>document.activeElement===el),true,'Resuming focuses the saved request status');
  await page.locator('#pause').click();
  await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('120');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  for(let minute=0;minute<60 && !(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.finished!=null));minute++){
    await page.locator('#dev-button').click();await page.locator('#dev-minutes').fill('1');await page.locator('#dev-advance').click();await page.locator('#dev-close').click();
  }
  assert.equal(await page.locator('#person .help-phase').textContent(),'Request completed');
  assert.equal(await page.locator('#person .response').isVisible(),false,'Old acceptance and waiting feedback must disappear when the live request changes');
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.id),requested.help.id);
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.phase),'complete');
  await capture('Helping request finishes through real resident work','helping-request-complete.png');
  await page.getByRole('button',{name:'Forage food',exact:true}).click();
  await page.getByRole('button',{name:'Cancel this request',exact:true}).click();
  assert.equal(await page.locator('#person .help-phase').textContent(),'Request cancelled');
  assert.equal(await page.evaluate(()=>window.solarDev.snapshot().residents.find(r=>r.id===0).help.phase),'cancelled');

  await page.getByRole('button',{name:'Close resident details',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'Helping experiments preserve the saved Story village');
}
