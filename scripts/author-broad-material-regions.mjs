// Authored source-space region draft. Transforms geometry only, never artwork.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',read=async name=>JSON.parse(await readFile(root+'/'+name));
const binding=await read('body-binding-v1.json'),owner=binding.ownership;
// Each row: head center x/y, shirt start, garment waist, boot start.
// These are source-art landmarks, not inferred silhouette proportions.
const landmarks={
 walk:[[355,165,220,345,470],[970,165,220,350,500],[350,780,835,960,1060],[975,780,835,965,1080]],
 work:[[345,125,190,370,550],[890,125,190,375,550],[380,735,810,980,1140],[985,780,830,990,1130]],
 standing:[[355,165,225,365,535],[912,165,225,365,535],[359,775,835,975,1140],[912,775,835,975,1140]],
 seated:[[340,180,245,400,530],[960,235,295,425,530],[350,755,820,970,1090],[975,765,830,980,1090]],
 look:[[368,177,240,390,575],[892,177,240,390,575],[369,770,835,990,1150],[894,770,835,990,1150]],
 stretch:[[353,151,220,360,530],[901,160,220,360,530],[371,774,840,990,1140],[895,760,830,980,1140]],
 wave:[[354,140,205,355,550],[929,140,205,355,550],[367,765,830,990,1140],[928,765,830,990,1140]],
 'wave-lower':[[354,190,255,405,550],[929,190,255,405,550],[367,750,820,980,1140],[928,750,820,980,1140]],
 relax:[[363,165,235,385,550],[898,165,235,385,550],[376,760,830,980,1130],[895,760,830,980,1130]],
 cook:[[365,150,225,375,545],[890,150,225,375,545],[365,750,825,975,1145],[890,750,825,975,1145]],
 water:[[375,155,220,360,530],[925,155,220,360,530],[410,760,830,970,1100],[950,780,850,990,1100]],
 feed:[[340,130,205,375,550],[900,130,205,375,550],[340,750,825,990,1150],[900,750,825,990,1150]],
};
const seatedBounds=(await read('base-review-seated-v1.json')).measurements.candidate.poses.map(p=>p.bounds);
function affine(source,index){const t=source.transform,r=t.registration,s=r.uniformScale;if(t.method==='waist-v1')return {s,dx:128-r.frames[index].waist[0]*s,dy:.95*256-seatedBounds[index][3]*s};const f=t.method==='contact-v1'?r:r.frames[index];return {s,dx:f.nativeContact[0]-f.sourceContact[0]*s,dy:f.nativeContact[1]-f.sourceContact[1]*s};}
const rect=(l,t,r,b)=>[[l,t],[r,t],[r,b],[l,b]];
function sourceRegion(id,index){
 if(id==='sleep')return {head:[290,430,210,180],garmentAreas:{shirt:[[[420,350],[590,290],[900,370],[1040,500],[960,760],[680,780],[440,600]]],shorts:[[[900,370],[1150,420],[1240,600],[1190,830],[920,800],[960,620]]]},shoeAreas:[]};
 if(id==='tend'){
  const [dx,dy]=[[0,0],[600,10],[20,590],[600,610]][index],shift=p=>p.map(([x,y])=>[x+dx,y+dy]);
  const hands=[[[295,515],[335,515],[375,540],[410,570],[410,615],[385,620],[370,600],[355,620],[325,610],[300,580]],[[360,490],[390,490],[425,515],[470,540],[510,565],[535,590],[525,610],[505,600],[490,615],[470,600],[435,575],[390,550]],[[300,510],[340,510],[380,540],[415,570],[430,615],[400,625],[380,605],[365,625],[330,610],[310,580]],[[365,485],[400,490],[445,515],[485,540],[520,565],[545,590],[535,615],[510,605],[490,620],[465,600],[430,570],[390,545]]][index];
  return {head:[380+dx,180+dy,100,95],garmentAreas:{shirt:[shift([[215,235],[420,245],[460,330],[410,400],[300,455],[160,390]])],shorts:[shift([[170,375],[300,420],[420,320],[520,350],[530,450],[350,500],[310,590],[140,590]])]},shoeAreas:[shift(rect(75,430,195,610)),shift(rect(390,510,590,625))],skinAreas:[shift(hands)]};
 }
 const [x,y,shirtTop,waist,shoes]=landmarks[id][index],region={head:[x,y,90,85],shirtTop,waist,shoes};
 if(id==='work'&&index===3)region.waistLine=[[740,955],[820,995],[910,1020]];
 if(id==='water'&&index>=2)region.waistLine=[[index===2?245:780,waist-30],[index===2?350:880,waist],[index===2?465:1000,waist+20]];
 return region;
}
const sheets={},draft={schema:1,status:'Authored material-region draft; diagnostic visual review required',why:'Fit independent skin and clothing colours to exact broader-body poses',sourceRegions:{}};
for(const sheet of ['base','idle','activities']){sheets[sheet]={regions:[]};for(const pose of owner.poses[sheet]){
 const source=owner.sources[pose.source],a=affine(source,pose.index),point=([x,y])=>[a.dx+x*a.s,a.dy+y*a.s],r=sourceRegion(pose.source,pose.index),head=[...point(r.head.slice(0,2)),r.head[2]*a.s,r.head[3]*a.s];
 draft.sourceRegions[pose.source+':'+pose.index]=r;
 const transformed=r.garmentAreas?{head,garmentAreas:Object.fromEntries(Object.entries(r.garmentAreas).map(([name,polygons])=>[name,polygons.map(p=>p.map(point))])),shoeAreas:r.shoeAreas.map(p=>p.map(point)),...(r.skinAreas?{skinAreas:r.skinAreas.map(p=>p.map(point))}:{})}:{head,shirtTop:a.dy+r.shirtTop*a.s,waist:a.dy+r.waist*a.s,shoes:a.dy+r.shoes*a.s,...(r.waistLine?{waistLine:r.waistLine.map(point)}:{})};
 // Polygons may surround source anatomy loosely; clamp only authored region
 // geometry to the normalized frame, never any painted image pixels.
 if(transformed.garmentAreas)for(const polygons of [...Object.values(transformed.garmentAreas),transformed.shoeAreas])for(const polygon of polygons)for(const p of polygon)for(let i=0;i<2;i++)p[i]=Math.max(0,Math.min(256,p[i]));
 sheets[sheet].regions.push(transformed);
}assert.equal(sheets[sheet].regions.length,16);}
await writeFile(root+'/material-source-regions-v1.json',JSON.stringify(draft,null,2)+'\n');
await writeFile(root+'/body-material-regions-v1.json',JSON.stringify({schema:2,body:binding,sheets},null,2)+'\n');
console.log('Authored 48 exact-body material region candidates; no artwork pixels modified.');
