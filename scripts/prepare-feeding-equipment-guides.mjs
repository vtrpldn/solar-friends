import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const rig=JSON.parse(await readFile('web/art/characters/prototype-v1/body-attachments-draft.json','utf8'));
const revision=Number(process.argv[2]??1);if(![1,2].includes(revision))throw Error('Choose guide revision 1 or 2.');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const index of [12,13,14,15]){
  const pose=rig.poses.activities[index],near=pose.nearHand.position.map(n=>n*1254/256),far=pose.farHand.position.map(n=>n*1254/256);
  const [cx,cy]=index===12?[far[0]-90,far[1]-65]:[near[0]+85,near[1]-65],rx=130,ry=32;
  const seeds=index===12?[]:index===15?[[far[0]-8,far[1]-18],[far[0]+22,far[1]+14],[far[0]+41,far[1]+48],[far[0]+61,far[1]+83]]:[[far[0]-20,far[1]-22],[far[0]-5,far[1]-27],[far[0]+10,far[1]-22],[far[0]+23,far[1]-16]];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#f1f1e7"/><path d="M ${cx-rx} ${cy} L ${cx-rx+20} ${cy+128} Q ${cx} ${cy+190} ${cx+rx-20} ${cy+128} L ${cx+rx} ${cy}" fill="#c9dbe7" stroke="#2376a8" stroke-width="4"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e4c66e" stroke="#2376a8" stroke-width="5"/>${seeds.map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="${revision===1?7:3.5}" ry="${revision===1?4:2}" fill="#d6a629"/>`).join('')}<g stroke="#c43e37" stroke-width="4" fill="none">${[near,far].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="11"/><path d="M ${x-19} ${y} H ${x+19} M ${x} ${y-19} V ${y+19}"/>`).join('')}</g></svg>`;
  const png=await page.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();const c=document.createElement('canvas');c.width=c.height=1254;c.getContext('2d').drawImage(image,0,0);return c.toDataURL('image/png').split(',')[1];},svg);
  const root=`assets/art-direction/character-prototype-v1/feed-equipment-guide-${index}${revision===1?'':'-v2'}`;
  await writeFile(root+'.svg',svg+'\n');await writeFile(root+'.png',Buffer.from(png,'base64'));
  await writeFile(root+'.json',JSON.stringify({schema:1,purpose:'Geometry only; not finished artwork',index,size:1254,body:rig.body,nearHand:near,farHand:far,basket:{cx,cy,rx,ry},seeds},null,2)+'\n');
 }
 console.log('Prepared four source-bound feeding basket/grain geometry guides.');
}finally{await browser.close();}
