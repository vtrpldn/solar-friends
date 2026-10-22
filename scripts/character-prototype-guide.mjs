// Geometry reference only. This is not painted character artwork.
import {chromium} from 'playwright';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
const {headBoxes}=JSON.parse(await readFile('web/art/characters/prototype-v1/registration.json','utf8'));
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#f3f0e5"/>${headBoxes.map(([x,y,w,h],i)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#4b884e"/><text x="${x}" y="${y+h+18}" font-size="14" fill="#333">${Math.floor(i/4)+1}:${i%4+1}</text>`).join('')}</svg>`;
await mkdir('assets/art-direction/character-prototype-v1',{recursive:true});
await writeFile('assets/art-direction/character-prototype-v1/head-position-guide.svg',svg);
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage({viewport:{width:1254,height:1254}});await page.setContent(`<style>body{margin:0}</style>${svg}`);await page.screenshot({path:'web/art/characters/prototype-v1/head-position-guide.png'});}finally{await browser.close();}
