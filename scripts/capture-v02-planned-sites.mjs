// Captures planned-site screenshots at near/far zoom, in day, night and rain.
// Usage: node scripts/capture-v02-planned-sites.mjs <output-dir> [prefix]
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {createWeekend,chooseCamp,plan,moveProject,placementError,planRoadLine,requiredLoads,footprint,campLocation,save,PROJECTS} from '../web/v02/weekend/simulation.js';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
import {HOUR,calendar,weatherAt,weatherStep} from '../web/v02/weekend/weather.js';

const out=path.resolve(process.argv[2]||'planned-sites'),prefix=process.argv[3]||'after';
await mkdir(out,{recursive:true});

export function plannedVillage(){
  const s=createWeekend(1);chooseCamp(s,'entrance');
  s.money=200000;s.wood=80;s.rain=false;s.rainSeen=true;s.rainResolved=true;
  s.weather={version:1,hour:9,rainMmPerHour:0,cloudCover:.2,temperatureC:22};
  const taken=[],placed={},camp=campLocation(s),cx=camp.x+5,cz=camp.z+7;
  // Spread the blueprints on open ground beside the camp, nearest first.
  const place=(key,rotation=0)=>{
    const spots=[];
    for(let x=cx-14;x<=cx+14;x++)for(let z=cz-13;z<=cz+13;z++)spots.push({x,z});
    spots.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
    for(const {x,z} of spots){
      const [w,d]=footprint({key,rotation});
      if(taken.some(t=>x<t.x+t.w+2&&x+w+2>t.x&&z<t.z+t.d+2&&z+d+2>t.z))continue;
      if(placementError(s,key,x,z,null,rotation))continue;
      const error=plan(s,key,x,z,rotation);
      if(error)continue;
      taken.push({x,z,w,d});placed[key]=s.projects.at(-1);return placed[key];
    }
    throw new Error(`No site for ${key}`);
  };
  // Three states: waiting for materials, materials on site, under construction.
  place('gathering');                       // materials reserved, none delivered yet
  const shelter=place('shelter',1);shelter.delivered=requiredLoads(shelter);
  const toilet=place('toilet');toilet.delivered=requiredLoads(toilet);toilet.work=PROJECTS.toilet.work*.3;
  place('home-studio',1);                    // purchased, waiting for town pickup
  const barrel=place('rain-barrel');barrel.delivered=Math.min(1,requiredLoads(barrel));
  place('garden-bench');place('streetlight');place('field');place('goat-pasture-empty',1);
  const road=place('road');
  planRoadLine(s,{x:road.x,z:road.z},{x:road.x+5,z:road.z});
  // A relocation reserves and marks its destination too.
  const sign=place('wayfinding-sign');
  for(const [dx,dz] of [[0,3],[3,0],[0,-3],[-3,0],[3,3]])if(!moveProject(s,sign.id,sign.x+dx,sign.z+dz,1))break;
  return s;
}

const hourTime=hour=>((hour+24-9)%24)*60/.45;
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const server=await serve(),browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.platform==='darwin'?['--use-angle=metal']:[])]});
  try{
    for(const [name,hour,rain] of [['day',11,false],['night',22,false],['rain',15,true]]){
      const s=plannedVillage();
      s.time=hourTime(hour);
      // Weather is derived from the seed and clock, so find a real rainy afternoon.
      if(rain)for(let h=24;h<24*400;h++){const time=h*HOUR;if(calendar(time).hour>=11&&calendar(time).hour<=15&&weatherAt(s,time).rainMmPerHour>.05){s.time=time;break;}}
      weatherStep(s);
      s.view={paused:true};
      const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,value:save(s)});
      await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
      await page.waitForSelector('#world');await page.waitForTimeout(2500);
      // Centre the planned area, then capture default, near and far zoom.
      const box=await page.locator('#world').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.keyboard.down('KeyS');await page.waitForTimeout(500);await page.keyboard.up('KeyS');await page.waitForTimeout(400);
      await page.screenshot({path:path.join(out,`${prefix}-${name}-default.jpg`),quality:88});
      await page.mouse.wheel(0,-360);
      await page.waitForTimeout(600);
      await page.screenshot({path:path.join(out,`${prefix}-${name}-near.jpg`),quality:88});
      await page.mouse.wheel(0,1100);
      await page.waitForTimeout(600);
      await page.screenshot({path:path.join(out,`${prefix}-${name}-far.jpg`),quality:88});
      if(errors.length)throw new Error(errors.join('\n'));
      await page.close();
    }
    // A bridge site spans water: ghost and corner stakes only.
    {
      const s=plannedVillage();let bridge=null;
      for(let x=4;x<120&&!bridge;x++)for(let z=4;z<120&&!bridge;z++)for(const rotation of [0,1])
        if(!placementError(s,'bridge',x,z,null,rotation)&&!plan(s,'bridge',x,z,rotation)){bridge=s.projects.at(-1);break;}
      if(bridge){
        const [w,d]=footprint(bridge),tx=(bridge.x+(w-1)/2-32)*2,tz=(bridge.z+(d-1)/2-32)*2;
        s.time=hourTime(11);weatherStep(s);s.view={paused:true,speed:1,position:[tx+32,35,tz+32],target:[tx,0,tz],zoom:1};
        const page=await browser.newPage({viewport:{width:1280,height:720}});
        await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,value:save(s)});
        await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story`);
        await page.waitForSelector('#world');await page.waitForTimeout(2500);
        await page.screenshot({path:path.join(out,`${prefix}-bridge.jpg`),quality:88});
        await page.close();
      }else console.log('No bridge site on this seed.');
    }
    console.log(`Saved planned-site captures to ${out}`);
  }finally{await browser.close();server.close();}
}
