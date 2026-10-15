import assert from 'node:assert/strict';

// Check the player's navigation and real layouts, rather than style snapshots.
export async function checkInterfaceControls({page,saved,capture}){
  const size=page.viewportSize();
  if(!await page.locator('#dev-dialog').isVisible()){
    if(await page.locator('#dev-button').isVisible())await page.locator('#dev-button').click();
    else{await page.locator('#help').click();if(!await page.locator('#help-dialog .dev-tools').evaluate(el=>el.open))await page.locator('#help-dialog .dev-tools summary').click();await page.locator('#help-open-dev').click();}
  }
  await page.locator('#dev-scenario').selectOption('climate-wet');
  await page.locator('#dev-load').click();
  await page.waitForFunction(()=>window.solarDev.scenario()==='climate-wet');
  await page.locator('#dev-close').click();
  const before=await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot()));
  for(const [resource,tab]of [['food','Pantry'],['materials','Stores'],['water','Water']]){
    await page.locator(`[data-hud-resource="${resource}"]`).click();
    assert.equal(await page.getByRole('tab',{name:tab,exact:true}).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.supply-page:visible').count(),1);
  }
  await page.getByRole('tab',{name:'Water',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Ecology',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab',{name:'Pantry',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('tab',{name:'Ecology',exact:true}).getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-supply-tab][tabindex="0"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.solarDev.snapshot())),before,'Reading and keyboard navigation cannot change the village');
  async function fit(selector){
    const issues=await page.locator(selector).evaluate(el=>{
      const r=el.getBoundingClientRect(),result=[];
      if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)result.push('frame outside viewport');
      if(el.scrollWidth>el.clientWidth+2)result.push(`content wider than frame: ${el.scrollWidth}/${el.clientWidth}`);
      for(const b of el.querySelectorAll('button,input,select')){
        if(!b.getClientRects().length||b.type==='hidden')continue;
        const q=b.getBoundingClientRect();
        if(q.width<16||q.height<16)result.push(`undersized control: ${b.ariaLabel||b.textContent}`);
      }
      return result;
    });
    assert.deepEqual(issues,[],`${selector} should keep readable, contained controls`);
  }
  for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    const key=viewport.width;
    await page.locator('[data-hud-resource="food"]').click();
    for(const name of ['Pantry','Stores','Water','Ecology']){
      await page.getByRole('tab',{name,exact:true}).click();
      await fit('#supplies-panel');
      await capture(`${name} field-book page at ${key} desktop width`,`interface-${key}-${name.toLowerCase()}.png`);
    }
    for(const [name,id]of [['Trade','town-panel'],['Construction','projects-panel'],['Power','power-panel']]){
      await page.getByRole('button',{name,exact:true}).click();await fit('#'+id);
      await capture(`${name} shares the village control spacing at ${key}`,`interface-${key}-${id}.png`);
      if(id==='town-panel'){const orders=page.getByText('Orders & deliveries',{exact:true});await orders.click();assert(await orders.evaluate(el=>el.parentElement.open));await orders.click();}
    }
    await page.getByRole('button',{name:'People',exact:true}).click();await fit('#community-panel');
    await capture(`Resident roster and gathering action at ${key}`,`interface-${key}-residents.png`);
    await page.getByRole('button',{name:'Meet Iara',exact:true}).click();await fit('#person');
    assert(await page.locator('#person .stat').first().isVisible());
    assert(await page.locator('#person .requests').isVisible());
    await capture(`Iara’s needs and illustrated actions precede work settings at ${key}`,`interface-${key}-character.png`);
    await page.getByRole('button',{name:'Close resident details',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();await fit('#settings-dialog');
    const toggle=page.getByRole('switch',{name:'Placement grid',exact:true}),was=await toggle.isChecked();
    await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.isChecked(),!was);
    await page.keyboard.press('Space');assert.equal(await toggle.isChecked(),was);
    await capture(`Game settings retain keyboard-operable toggles at ${key}`,`interface-${key}-settings.png`);
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    await page.getByRole('button',{name:'How to play',exact:true}).click();await fit('#help-dialog');
    assert(await page.locator('#help-title').evaluate(el=>{const r=el.getBoundingClientRect(),d=el.closest('dialog').getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom;}),'The field guide should open at its title');
    await capture(`Field guide and key bindings at ${key}`,`interface-${key}-help.png`);
    await page.getByRole('button',{name:'Close help',exact:true}).click();
    await page.locator('#dev-button').click();await fit('#dev-dialog');
    await capture(`Parchment development workbench at ${key}`,`interface-${key}-workbench.png`);
    await page.locator('#dev-close').click();
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('solar-friends-v3-story')),saved,'The interface review preserves the saved Story');
  await page.setViewportSize(size);
  await page.locator('#dev-button').click();await page.locator('#dev-return').click();
}

export async function checkArtworkInterface({browser,base,output,screenshots,errors}){
  const context=await browser.newContext({viewport:{width:1600,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  async function capture(label,file){await page.screenshot({path:output+'/'+file,fullPage:false});screenshots.push({label,file});console.log('Browser capture: '+label);}
  async function fits(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Artwork controls should fit the desktop viewport');}
  try{
    for(const viewport of [{width:1600,height:900},{width:1280,height:800}]){
      await page.setViewportSize(viewport);const width=viewport.width;
      await page.goto(new URL('/artwork/',base).href);await page.locator('#cards .pick').first().waitFor();
      assert(await page.locator('#art-library').isVisible());assert(!await page.locator('#art-workbench').isVisible());await fits();
      await page.locator('#search').fill('coop');assert(await page.locator('#cards .pick').count()>0);await page.locator('#cards .pick').first().click();assert.match(await page.locator('#selected-name').textContent(),/Chicken coop/);
      await capture(`Framed sprite inventory with its own scroll area at ${width}`,`interface-${width}-sprite-library.png`);
      await page.getByRole('button',{name:'Editing bench',exact:true}).click();
      assert(!await page.locator('#art-library').isVisible());await page.locator('#workbench-sprite').selectOption('coop');await fits();
      for(const [tab,name]of [['calibration','Calibrate'],['replacement','Review replacement'],['recipe','Recipe card']]){
        await page.getByRole('button',{name,exact:true}).click();assert(await page.locator(`[data-art-page="${tab}"]`).isVisible());
        await capture(`Artwork ${tab} uses the game workbench at ${width}`,`interface-${width}-art-${tab}.png`);
      }
      await page.getByRole('button',{name:'Sprite library',exact:true}).click();assert.equal(await page.locator('#search').inputValue(),'coop');
      await page.goto(new URL('/artwork/?tool=recipe',base).href);await page.locator('[data-art-page="recipe"]').waitFor({state:'visible'});assert(!await page.locator('#art-library').isVisible());
      for(const [route,label]of [['checks.html','Live sprite checks'],['projection.html','Building projection'],['grid-fit.html','Sprite grid fit']]){
        await page.goto(new URL('/artwork/'+route,base).href);
        await page.waitForFunction(()=>{const s=document.querySelector('#status');return s&&!s.textContent.startsWith('Loading');});await fits();
        await capture(`${label} shares the artwork tool frame at ${width}`,`interface-${width}-${route.replace('.html','')}.png`);
      }
    }
  }finally{await context.close();}
}
