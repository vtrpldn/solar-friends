import { MAP_SIZE, riverBank } from './terrain.js';
import { occupies } from './building-footprints.js';

const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const n = clamp(x); return n * n * (3 - 2 * n); };
const seed = n => { const v = Math.sin(n * 127.1 + 43.7) * 43758.5453; return v - Math.floor(v); };
const sites = Array.from({length:480},(_,i)=>({x:1+seed(i*3)*26,y:1+seed(i*3+1)*26,phase:seed(i*3+2)}));

// Only the simulation's raining flag can produce rainfall. The afternoon
// schedule supplies visual buildup, cloud cover, and two hours of drying.
export function weatherConditions(environment, minutes) {
  const minute = ((minutes % 1440) + 1440) % 1440;
  const rain = environment.raining ? .35 + .65 * Math.min(smooth((minute-840)/12),smooth((1020-minute)/18)) : 0;
  const clouds = environment.dry_day ? .06 : .12 + .88 * smooth((minute-810)/30) * (1-smooth((minute-1020)/30));
  const wet = environment.dry_day ? 0 : environment.raining ? smooth((minute-840)/40) : minute>=1020 ? 1-smooth((minute-1020)/120) : 0;
  return { rain, clouds, wet, label:rain?'rain':wet>.01?'after-rain':environment.dry_day?'dry':'clear' };
}

export function weatherSites(buildings) {
  return sites.filter(p=>!buildings.some(b=>occupies(b,p.x,p.y)));
}

export function drawGroundWeather(ctx, {conditions, buildings, project, scale, time, reducedMotion}) {
  const counts={puddles:0,splashes:0,ripples:0};
  if (!conditions.wet && !conditions.rain) return counts;
  const clear=weatherSites(buildings);
  ctx.save();
  // Small shallow pools sit on the ground plane, underneath buildings and
  // residents. The same seeded positions survive panning, zooming and pause.
  for(const [i,site] of clear.slice(0,34).entries()) {
    if(riverBank(site.x,site.y)||conditions.wet<=.01)continue;
    const p=project(site.x,site.y),radius=(10+site.phase*17)*scale;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.5);
    const sheen=ctx.createRadialGradient(0,0,1,0,0,radius);
    sheen.addColorStop(0,`rgba(123,161,160,${conditions.wet*.36})`);
    sheen.addColorStop(.65,`rgba(96,132,130,${conditions.wet*.25})`);
    sheen.addColorStop(1,'rgba(88,120,116,0)');
    ctx.fillStyle=sheen;ctx.beginPath();ctx.ellipse(0,0,radius,radius*(.7+seed(i)*.2),0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=`rgba(211,226,214,${conditions.wet*.28})`;ctx.lineWidth=.8*scale;
    ctx.beginPath();ctx.ellipse(-radius*.15,-radius*.2,radius*.55,radius*.25,-.15,Math.PI,Math.PI*1.8);ctx.stroke();
    ctx.restore();counts.puddles++;
  }
  if(conditions.rain&&!reducedMotion) {
    for(const site of clear.slice(0,160)) {
      const phase=(time*1.6+site.phase)%1;if(phase>.45)continue;
      const p=project(site.x,site.y),water=riverBank(site.x,site.y),r=(1.5+phase*(water?16:8))*scale;
      ctx.strokeStyle=`rgba(213,231,226,${conditions.rain*(1-phase/.45)*(water?.36:.32)})`;
      ctx.lineWidth=.75*scale;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.5,0,0,Math.PI*2);ctx.stroke();
      if(water)counts.ripples++;else counts.splashes++;
    }
  }
  ctx.restore();return counts;
}

export function drawWeatherAir(ctx, {conditions, project, width, height, scale, time, reducedMotion}) {
  const counts={clouds:0,streaks:0};
  ctx.save();
  if(conditions.clouds>.05) {
    // Broad, soft shadows drift over the scenery instead of painting cloud
    // sprites over the roofs. Management windows remain above this canvas.
    for(let i=0;i<4;i++) {
      const x=((time*.12+i*13)% (MAP_SIZE+24))-12,y=5+i*5,p=project(x,y),radius=(200+i*25)*scale;
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.6);
      const shadow=ctx.createRadialGradient(0,0,0,0,0,radius);
      shadow.addColorStop(0,`rgba(49,66,75,${conditions.clouds*.18})`);shadow.addColorStop(1,'rgba(49,66,75,0)');
      ctx.fillStyle=shadow;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();counts.clouds++;
    }
  }
  if(conditions.rain) {
    const veil=ctx.createLinearGradient(0,0,0,height);
    veil.addColorStop(0,`rgba(177,198,200,${conditions.rain*.13})`);veil.addColorStop(1,`rgba(85,113,128,${conditions.rain*.07})`);
    ctx.fillStyle=veil;ctx.fillRect(0,0,width,height);
    if(!reducedMotion) {
      const wind=(12+Math.sin(time*.4)*5)*scale;
      ctx.strokeStyle=`rgba(211,231,232,${conditions.rain*.48})`;ctx.lineWidth=.85*scale;
      ctx.beginPath();
      for(const site of sites) {
        const p=project(site.x,site.y),phase=(time*1.7+site.phase)%1;
        const x=p.x-wind*(1-phase),y=p.y-(1-phase)*165*scale,length=(9+site.phase*9)*scale;
        if(x<0||x>width||y<0||y>height)continue;
        ctx.moveTo(x-wind*.08,y-length);ctx.lineTo(x,y);counts.streaks++;
      }
      ctx.stroke();
    }
  }
  ctx.restore();return counts;
}
