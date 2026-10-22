import assert from 'node:assert/strict';
import {situationView} from '../web/situations.js';
// These exercise presentation contracts; arbitrary cast compilation remains separate.
for(const [population,shared]of [[1,0],[2,1],[5,2],[12,2]]){
 const people=Array.from({length:population},(_,i)=>({id:900+i*101,name:i?`Helper ${i}`:'<cook>'}));
 const v={minutes:720,situations:{resolved_count:0,active:{resident:900,opened:0,response:null,agreed:null,helpers:[],recovery:36,worry:4,resolved:null,story_check_in:false}}};
 const choices=situationView(v,people).markup;
 assert(choices.includes('&lt;cook&gt;'));assert.doesNotMatch(choices,/<cook>/);
 if(population===1){assert.match(choices,/Ease the kitchen routine/);assert.doesNotMatch(choices,/Two other|One other|0\/0/);}
 else assert(choices.includes(shared===1?'One other neighbour takes':'Two other neighbours take'));
 for(const response of ['share_shifts','day_off']){
  Object.assign(v.situations.active,{response,agreed:0});const view=situationView(v,people).markup;
  assert.match(view,/36\/72/);assert.match(view,/50%/);
  const required=response==='day_off'?Math.min(1,population-1):shared;
  if(!required){assert.match(view,/No other residents/);assert.doesNotMatch(view,/0\/0|Other neighbours put/);}
  else assert(view.includes(`0/${required} ${required===1?'neighbour':'neighbours'} cooked`));
 }
 v.situations.active.resolved=720;v.situations.resolved_count=1;
 if(population===1)assert.doesNotMatch(situationView(v,people).markup,/Having others take a turn|collective kept/);
}
console.log('PASS one/two/five/twelve-person Situation choices and progress, solo recovery wording, available-helper counts and escaped custom names.');
