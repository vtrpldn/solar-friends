// Appearance-only choices exercised through the same creator controls as players.
export const exampleResidentLooks={
 'before-the-dry-season':{
  Marina:{body:'relaxed-v1',top:'resident-parts-v6',hair:'short-curls-v1',hairColour:'chestnut',hat:'none',skin:'warm',shirt:'teal',shorts:'sage',shoes:'brown'},
  Davi:{body:'broad-v1',hair:'side-part-v1',hairColour:'chestnut',hat:'straw-v1',skin:'copper',shirt:'terracotta',shorts:'umber',shoes:'graphite'},
  Joana:{body:'neutral-v1',hair:'side-part-v1',hairColour:'chestnut',hat:'none',skin:'copper',shirt:'cream',shorts:'umber',shoes:'brown'},
  Ravi:{body:'relaxed-v1',hair:'short-curls-v1',hairColour:'chestnut',hat:'none',facialHair:'short-chestnut-v1',skin:'sunlit',shirt:'indigo',shorts:'cream',shoes:'graphite'},
  'Cecília':{body:'relaxed-v1',top:'resident-parts-v6',hair:'side-part-v1',hairColour:'silver',hat:'none',skin:'sunlit',shirt:'terracotta',shorts:'sage',shoes:'brown'},
 },
 'an-inherited-village':{
  Sueli:{body:'neutral-v1',hair:'short-curls-v1',hairColour:'chestnut',hat:'straw-v1',skin:'copper',shirt:'terracotta',shorts:'cream',shoes:'brown'},
  'Otávio':{body:'broad-v1',hair:'side-part-v1',hairColour:'chestnut',hat:'none',skin:'sunlit',shirt:'indigo',shorts:'umber',shoes:'graphite'},
 },
};

export async function applyExampleResidentLooks(page,id,{capture=async()=>{}}={}){
 const looks=exampleResidentLooks[id];if(!looks)return;
 await page.locator('[data-workspace=people]').click();const roster=page.locator('#creator-residents');if(!await roster.evaluate(el=>el.open))await roster.locator(':scope > summary').click();
 for(const [name,choices]of Object.entries(looks)){
  const row=page.locator('details[data-resident]').filter({has:page.locator(':scope > summary',{hasText:name})});if(!await row.evaluate(el=>el.open))await row.locator(':scope > summary').click();await row.locator('[data-open-character]').click();
  const dialog=page.locator('#character-creator');await dialog.getByRole('tab',{name:'Appearance',exact:true}).click();
  const ready=()=>page.waitForFunction(()=>document.querySelector('#creator-map').getAttribute('aria-busy')==='false'&&document.querySelector('#creator-art-retry').hidden&&document.querySelector('[data-character-preview-status]').textContent.startsWith('Preview only'));
  await dialog.locator('[data-resident-field="appearance"]').selectOption('custom');await ready();
  for(const [field,value]of Object.entries(choices)){const input=dialog.locator(`[data-resident-field="appearance:${field}"]`);if(await input.inputValue()!==value){await input.selectOption(value);await ready();}}
  await capture(name,page);await dialog.getByRole('button',{name:'Done',exact:true}).click();console.log(`${id}: authored modular look for ${name}`);
 }
}
