// Original, synthesized instrumental: "Sunday in the village" (92 BPM).
// A 16-bar samba arrangement, kept separate from simulation time and speed.
const KEY='solar-friends-audio';
export const CHORDS=[ [48,55,59,62,64], [48,55,59,62,64], [45,52,55,59,60], [45,52,55,59,60], [50,57,60,64,65], [43,53,57,59,62], [48,55,59,62,64], [48,55,59,62,64], [53,57,60,64,67], [53,57,60,64,67], [52,55,59,62,66], [45,55,59,61,64], [50,57,60,64,65], [43,53,57,59,62], [48,55,59,62,64], [43,53,57,59,62] ];
const hz=n=>440*2**((n-69)/12);
export function installAudio(){
 let saved={};try{saved=JSON.parse(localStorage.getItem(KEY))||{};}catch{}
 const volume=(v,f)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):f;
 const settings={music:volume(saved.music,.3),effects:volume(saved.effects,.45)};
 let ctx,music,effects,timer,next=0,step=0,noise;
 function tone(bus,n,t,length,gain,type='sine'){
  const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=hz(n);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length);
  o.connect(g);g.connect(bus);o.start(t);o.stop(t+length+.03);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 function brush(t,gain,length,frequency){
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();source.buffer=noise;
  filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.6;
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+length);
  source.connect(filter);filter.connect(g);g.connect(music);source.start(t);source.stop(t+length);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};
 }
 function schedule(){
  if(ctx.state!=='running')return;
  // A stalled render thread must not release a backlog of notes at once.
  if(next<ctx.currentTime-.12)next=ctx.currentTime+.02;
  while(next<ctx.currentTime+.12){
   const bar=Math.floor(step/16)%CHORDS.length,s=step%16,c=CHORDS[bar],t=next;
   // Surdo on the second beat; alternating bass and offbeat nylon-like chords.
   if(s===0||s===8){tone(music,c[0]-12,t,.32,.11);tone(music,31,t,.13,s===8?.055:.035);}
   if([0,3,6,10,13].includes(s))c.slice(1).forEach((n,i)=>tone(music,n,t+i*.009,.32,.021,'triangle'));
   if(s%2===0)brush(t,s%4===0?.021:.013,.045,5200);
   if(s===4||s===12)brush(t,.028,.07,1200);
   if(bar%4>=2&&[2,7,14].includes(s))tone(music,c[2+(s%3)]+12,t,.5,.019);
   next+=60/92/4;step++;
  }
 }
 async function unlock(){
  if(!ctx){
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
   ctx=new Audio();music=ctx.createGain();effects=ctx.createGain();
   const master=ctx.createDynamicsCompressor();master.connect(ctx.destination);music.connect(master);effects.connect(master);
   music.gain.value=settings.music;effects.gain.value=settings.effects;
   noise=ctx.createBuffer(1,ctx.sampleRate*.15,ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  }
  if(document.hidden)return;
  await ctx.resume();if(!timer){next=ctx.currentTime+.04;timer=setInterval(schedule,40);schedule();}
 }
 function click(event){
  const target=event.target.closest('button,summary,select');if(!target||target.disabled)return;
  void unlock().then(()=>{if(ctx?.state==='running')tone(effects,target.matches('summary')?76:81,ctx.currentTime,.085,.065,'sine');}).catch(()=>{});
 }
 document.addEventListener('pointerdown',()=>{void unlock().catch(()=>{});});
 document.addEventListener('keydown',()=>{void unlock().catch(()=>{});});
 document.addEventListener('click',click);
 document.addEventListener('visibilitychange',()=>{
  if(!ctx)return;
  if(document.hidden){clearInterval(timer);timer=null;void ctx.suspend();}
  else void unlock().catch(()=>{});
 });
 for(const name of ['music','effects']){
  const input=document.querySelector(`#audio-${name}`);if(!input)continue;
  input.value=String(Math.round(settings[name]*100));
  input.addEventListener('input',()=>{
   settings[name]=Number(input.value)/100;
   if(ctx)(name==='music'?music:effects).gain.setTargetAtTime(settings[name],ctx.currentTime,.04);
   try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}
  });
 }
}
