import {Game} from '../pkg/solar_friends.js';

// Explicit authoring for completed preview scenes only. Every corridor is planned
// by Rust; its installed kit is recorded as opening property and consumed once.
// Playable imports and newly started villages never call this helper.
export function withAuthoredElectricalCircuits(state){
  const game=new Game();
  try{
    if(typeof game.electrical_connection_quote!=='function')return structuredClone(state);
    if(!game.restore(JSON.stringify(state)))throw new Error('The electrical preview needs a valid starting scene.');
    const initial=JSON.parse(game.electricity_report());
    const generators=initial.endpoints.filter(e=>e.ready&&['solar_farm','hydro'].includes(e.kind));
    const consumers=initial.endpoints.filter(e=>e.ready&&!['solar_farm','hydro','battery'].includes(e.kind));
    for(const consumer of consumers){
      const choices=generators.map(source=>({source,quote:JSON.parse(game.electrical_connection_quote(source.id,consumer.id))})).filter(c=>c.quote.allowed).sort((a,b)=>a.quote.plan.cells.length-b.quote.plan.cells.length||a.source.id-b.source.id);
      if(!choices.length){
        if(!generators.length)continue;
        throw new Error(`No accessible authored electrical route to ${consumer.kind} at ${consumer.x}, ${consumer.y}.`);
      }
      const {source,quote}=choices[0];
      if(game.queue_electrical_connection(source.id,consumer.id)!=='ok')throw new Error('The preview cable plan could not be queued.');
      const authored=JSON.parse(game.snapshot()),v=authored.village,line=v.pipes.lines.at(-1),account=v.simulation.materials;
      line.phase='active';line.work=quote.labour_minutes;
      line.spent=line.kit.map((n,i)=>{
        if(!n)return [0,0];
        const before=account.spent[i];account.opening[i]+=n;account.spent[i]+=n;
        return [before,account.spent[i]];
      });
      const store=v.logistics.stores.find(p=>p.owner.kind==='utility'&&p.owner.id===line.id);store.target.fill(0);
      if(!game.restore(JSON.stringify(authored)))throw new Error('Authored electrical equipment failed ownership validation.');
    }
    return JSON.parse(game.snapshot());
  }finally{game.free();}
}
