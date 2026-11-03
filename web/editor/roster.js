// Cast edits only affect the draft. Running villages retain their frozen cast.
export function removeResident(d,presets,id){
 const people=d.start.residents??=structuredClone(presets);
 if(!people.some(p=>p.id===id))return false;
 d.start.residents=people.filter(p=>p.id!==id);
 d.start.resident_setup=(d.start.resident_setup??[]).filter(s=>s.resident!==id);
 d.start.relationships=(d.start.relationships??[]).filter(b=>b.from!==id&&b.to!==id);
 return true;
}
