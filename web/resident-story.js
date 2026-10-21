// Replace role names once: a renamed neighbour may share another founder's name.
const founders=['Iara','Bento','Luz','Cauã','Nina'];
export function residentStory(state,text){
 return String(text).replace(/(?<![\p{L}\p{N}_])(?:Iara|Bento|Luz|Cauã|Nina)(?![\p{L}\p{N}_])/gu,name=>state.residents.find(p=>p.id===founders.indexOf(name))?.name??name);
}
