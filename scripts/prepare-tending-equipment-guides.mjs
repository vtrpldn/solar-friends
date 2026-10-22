import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const rig=JSON.parse(await readFile('web/art/characters/prototype-v1/body-attachments-draft.json','utf8'));
const revision=Number(process.argv[2]??1);if(![1,2].includes(revision))throw Error('Choose guide revision 1 or 2.');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const [index,angle]of revision===1?[[8,18],[9,15],[10,7],[11,12]]:[[8,42],[9,30],[10,25]]){
  const grip=rig.poses.activities[index].nearHand.position.map(n=>n*1254/256),[x,y]=grip;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#f1f1e7"/><g transform="translate(${x} ${y}) rotate(${angle})"><path d="M -42 0 H 94" stroke="#b98625" stroke-width="30" stroke-linecap="round"/><path d="M 80 -24 Q 135 -50 240 0 Q 135 50 80 24 Z" fill="#c9dbe7" stroke="#2376a8" stroke-width="4"/></g><g fill="none" stroke="#c43e37" stroke-width="4"><circle cx="${x}" cy="${y}" r="12"/><path d="M ${x-22} ${y} H ${x+22} M ${x} ${y-22} V ${y+22}"/></g></svg>`;
  const png=await page.evaluate(async svg=>{const i=new Image();i.src='data:image/svg+xml;base64,'+btoa(svg);await i.decode();const c=document.createElement('canvas');c.width=c.height=1254;c.getContext('2d').drawImage(i,0,0);return c.toDataURL('image/png').split(',')[1];},svg);
  const root=`assets/art-direction/character-prototype-v1/tend-equipment-guide-${index}${revision===1?'':'-v'+revision}`;
  await writeFile(root+'.svg',svg+'\n');await writeFile(root+'.png',Buffer.from(png,'base64'));
  await writeFile(root+'.json',JSON.stringify({schema:1,purpose:'Geometry guide only; never finished sprite artwork',index,size:1254,body:rig.body,grip,angle,handle:[-42,94],bladeTip:240},null,2)+'\n');
 }
 console.log('Prepared trowel placement guides from source-bound tending hands.');
}finally{await browser.close();}
