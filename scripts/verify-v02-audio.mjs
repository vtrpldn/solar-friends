import assert from 'node:assert/strict';
import {installAudio,CHORDS} from '../web/v02/weekend/audio.js';
const events={},inputs={},storage=new Map();let context,timers=0,notes=0;
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v;}});
const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(){notes++;},stop(){}});
class AudioContext{
 constructor(){context=this;this.currentTime=0;this.sampleRate=44100;this.state='suspended';}
 createGain(){return node();}createDynamicsCompressor(){return node();}createOscillator(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}
 createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}
 async resume(){this.state='running';}async suspend(){this.state='suspended';}
}
globalThis.window={AudioContext};globalThis.document={hidden:false,addEventListener:(k,fn)=>events[k]=fn,querySelector:id=>inputs[id]??=( {addEventListener(k,fn){this[k]=fn;}})};
globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
globalThis.setInterval=()=>++timers;globalThis.clearInterval=()=>timers--;
installAudio();assert.equal(context,undefined,'audio waits for user gesture');
assert.equal(CHORDS.length,16);events.pointerdown();await Promise.resolve();assert.equal(context.state,'running');assert(notes>0);assert.equal(timers,1);
events.pointerdown();await Promise.resolve();assert.equal(timers,1,'no duplicate soundtrack timers');
inputs['#audio-music'].value='0';inputs['#audio-music'].input();assert.equal(JSON.parse(storage.get('solar-friends-audio')).music,0);
document.hidden=true;events.visibilitychange();assert.equal(context.state,'suspended');assert.equal(timers,0);
document.hidden=false;events.visibilitychange();await Promise.resolve();assert.equal(timers,1);
console.log('PASS: gesture startup, music scheduling, single timer, saved mute and hidden-tab suspension/resume.');
