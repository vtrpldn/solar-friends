import {saveKey} from './modes.js';
export const SLOT_KEY='solar-friends-v2-named-saves-1';
export function saveSlots(storage){
 const read=()=>{const raw=storage.getItem(SLOT_KEY);return raw?JSON.parse(raw):{slots:[],active:{}};};
 const write=data=>storage.setItem(SLOT_KEY,JSON.stringify(data));
 const name=value=>{value=String(value).trim().slice(0,60);if(!value)throw Error('Give your village a name.');return value;};
 return {
  active:mode=>read().active[mode] || null,
  list:()=>read().slots.sort((a,b)=>b.updated-a.updated),
  create(label,mode,data){const db=read(),slot={id:crypto.randomUUID(),name:name(label),mode,data,updated:Date.now()};db.slots.push(slot);db.active[mode]=slot.id;write(db);return slot;},
  autosave(mode,data,expected){const db=read();if(expected!==undefined && (db.active[mode]||null)!==expected)return;const slot=db.slots.find(s=>s.id===db.active[mode]);if(slot){slot.data=data;slot.updated=Date.now();write(db);}storage.setItem(saveKey(mode),data);},
  detach(mode){const db=read();delete db.active[mode];write(db);},
  load(id){const db=read(),slot=db.slots.find(s=>s.id===id);if(!slot)throw Error('Save not found.');storage.setItem(saveKey(slot.mode),slot.data);db.active[slot.mode]=id;write(db);return slot;},
  rename(id,label){const db=read(),slot=db.slots.find(s=>s.id===id);if(!slot)throw Error('Save not found.');slot.name=name(label);write(db);},
  remove(id){const db=read();db.slots=db.slots.filter(s=>s.id!==id);for(const mode of Object.keys(db.active))if(db.active[mode]===id)delete db.active[mode];write(db);},
 };
}
