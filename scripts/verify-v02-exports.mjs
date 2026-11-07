import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {ASSETS} from '../web/v02/workshop/models.js';
// Decode the browser's non-interlaced 8-bit RGBA PNGs without a new dependency.
function png(file){const raw=readFileSync(file),chunks=[];let width,height;assert.equal(raw.subarray(1,4).toString(),'PNG');
 for(let p=8;p<raw.length;){const n=raw.readUInt32BE(p),type=raw.toString('ascii',p+4,p+8),data=raw.subarray(p+8,p+8+n);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);assert.equal(data[12],0);}if(type==='IDAT')chunks.push(data);p+=n+12;}
 const packed=inflateSync(Buffer.concat(chunks)),stride=width*4,pixels=Buffer.alloc(stride*height);let p=0;
 for(let y=0;y<height;y++){const filter=packed[p++];assert.ok(filter<=4);for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;let prediction=0;
  if(filter===1)prediction=a;if(filter===2)prediction=b;if(filter===3)prediction=Math.floor((a+b)/2);if(filter===4){const q=a+b-c,da=Math.abs(q-a),db=Math.abs(q-b),dc=Math.abs(q-c);prediction=da<=db&&da<=dc?a:db<=dc?b:c;}pixels[i]=(packed[p++]+prediction)&255;
 }}return {width,height,pixels};}
for(const asset of ASSETS){let alpha;
 for(const light of ['day','night']){const root=new URL(`../web/v02/workshop/exports/${asset.id}-${light}-r01`,import.meta.url),im=png(root.href.replace('file://','')+'.png');const meta=JSON.parse(readFileSync(root.href.replace('file://','')+'.json'));
 assert.equal(im.width,2048);assert.equal(im.height,512);assert.equal(meta.asset,asset.id);assert.equal(meta.light,light);const current=Buffer.alloc(2048*512);
 for(let n=0;n<current.length;n++)current[n]=im.pixels[n*4+3];if(alpha)assert.deepEqual(current,alpha,`${asset.id}: day/night registration differs`);alpha=current;
 for(let i=0;i<4;i++){const frame=meta.frames[i];assert.equal(frame.rotation,i*90);assert.deepEqual(frame.anchor,[256,384]);assert.deepEqual(frame.footprint,i%2?[...asset.footprint].reverse():asset.footprint);let count=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const a=current[y*2048+i*512+x];if(a){count++;assert.ok(x>0&&x<511&&y>0&&y<511,`${asset.id} ${light} ${i*90}: clipped alpha`);}}
 assert.ok(count>100,`${asset.id}: empty export`);
 }
 }console.log(`${asset.id}: four unclipped day/night PNGs, identical alpha, correct anchors and footprints`);
}
