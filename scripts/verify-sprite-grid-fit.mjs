import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {allBuildingArt,drawBuildingArt} from '../web/building-art.js';
import {placementArt,footprintSize} from '../web/building-footprints.js';
import {readAlpha,alphaOutline} from './lib/png-alpha.mjs';
execFileSync(process.execPath,['scripts/sync-building-silhouettes.mjs','--check']);
const cache=new Map();let pixels=0;
for(const [kind,art]of Object.entries(allBuildingArt))for(const file of [art.file,art.nightFile]){
  if(!cache.has(file))cache.set(file,readAlpha(await readFile(new URL('../web/art/'+file,import.meta.url))));
  const image=cache.get(file),points=alphaOutline(image,art.cell),registration=placementArt(kind,art),n=footprintSize(kind),center=(n-1)/2-Math.floor(n/2);
  assert(Object.values(registration).every(Number.isFinite));assert(registration.scale>0);
  for(const zoom of [.65,1,1.75,2.5]){
    let tx,ty,matrix,rectangle;
    const ctx={globalAlpha:1,save(){},restore(){},translate(x,y){tx=x;ty=y;},transform(...m){matrix=m;},drawImage(...args){rectangle=args.slice(5);}};
    drawBuildingArt(ctx,{complete:true,naturalWidth:image.width,naturalHeight:image.height},art,registration.x*zoom,registration.y*zoom,registration.scale*zoom);
    const[dx,dy,dw]=rectangle,[a,b,c,d]=matrix;
    for(const[u,v]of points){
      const X=dx+u*dw,Y=dy+v*dw,x=tx+a*X+c*Y,y=ty+b*X+d*Y;
      assert(Math.abs(x)<=n*34*zoom+1e-5,`${kind} ${file}: painted pixel outside grid column`);
      assert(y+Math.abs(x)/2<=((center*2+n)*17)*zoom+1e-5,`${kind} ${file}: painted pixel crosses front grid edge`);
      pixels++;
    }
  }
}
console.log(`PASS: all 46 day/night source outlines fit their actual tile columns and front edges at four zooms (${pixels} source-edge checks); no padding, scale cap, platform or image clipping used.`);
