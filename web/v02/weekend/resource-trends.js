const HOUR=60/.45;
export function resourceSnapshot(s){return {
 money:s.money,wood:s.wood,meals:(s.materials.meals||0)+(s.materials.food||0),
 power:Object.values(s.infrastructure?.nodes||{}).reduce((sum,n)=>sum+(n.charge||0),0),
 water:Object.values(s.infrastructure?.nodes||{}).reduce((sum,n)=>sum+(n.water[0]||0),0),
};}
// Observed stock change, not a forecast. Keep one sample before the window
// boundary so an irregular UI update can interpolate the baseline accurately.
export function createResourceTrends(){
 let samples=[];
 return (time,values)=>{
  if(samples.length&&time<samples.at(-1).time)samples=[];
  if(!samples.length||time>samples.at(-1).time)samples.push({time,values:{...values}});
  else if(samples.length>1)samples.at(-1).values={...values};
  const cutoff=time-HOUR;
  while(samples.length>2&&samples[1].time<=cutoff)samples.shift();
  const first=samples[0],second=samples[1];
  const start=Math.max(first.time,cutoff),elapsed=time-start;
  if(elapsed<5/.45)return null;
  const fraction=second&&first.time<start?(start-first.time)/(second.time-first.time):0;
  return Object.fromEntries(Object.entries(values).map(([key,value])=>{
   const baseline=first.values[key]+(second?(second.values[key]-first.values[key])*fraction:0);
   return [key,(value-baseline)*HOUR/elapsed];
  }));
 };
}
export function formatTrend(value,money=false){
 if(value===null)return '— /h';
 const rounded=Math.round(value*10)/10;
 return `${rounded>0?'+':rounded<0?'−':''}${money?'R$':''}${Math.abs(rounded).toLocaleString('en-US',{maximumFractionDigits:1})}/h`;
}
