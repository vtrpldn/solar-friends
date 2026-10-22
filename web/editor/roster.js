// Cast edits only affect the draft. Running villages retain their frozen cast.
export function addResident(d,presets,maximum,{source=null,id=`resident-${crypto.randomUUID()}`}={}){
 const people=d.start.residents??=structuredClone(presets);
 if(people.length>=maximum)throw Error(`This village supports up to ${maximum} residents.`);
 if(people.some(p=>p.id===id))throw Error('This resident identity is already in use.');
 const original=source?people.find(p=>p.id===source):null;
 if(source&&!original)throw Error('Choose a resident who is still in this cast.');
 const person=structuredClone(original??presets[0]);
 person.id=id;
 if(original)person.name=Array.from(`${original.name} copy`).slice(0,80).join('');
 else Object.assign(person,{name:'New neighbour',pronouns:'',biography:'',occupation:'none',outside_shifts:false,personality:{social_style:'balanced',work_interest:'gardening'},experience:{background:'newcomer',levels:{}},work_preferences:{}});
 people.push(person);
 // Duplicating a person does not duplicate their friendships or identity.
 return id;
}
export function removeResident(d,presets,id){
 const people=d.start.residents??=structuredClone(presets);
 if(!people.some(p=>p.id===id))return false;
 d.start.residents=people.filter(p=>p.id!==id);
 d.start.relationships=(d.start.relationships??[]).filter(b=>b.from!==id&&b.to!==id);
 return true;
}
