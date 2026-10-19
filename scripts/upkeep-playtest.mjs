// Test-player action: follow an upkeep warning through the ordinary town API.
// Stock and confirmed deliveries reduce native shortage; never grant test parts.
export function buyServiceParts(game,state){
  const e=state.environment.economy,jobs=JSON.parse(game.maintenance_report()).jobs.filter(j=>j.job.finished==null);
  const parts=e.shortage.map((n,i)=>Math.min(n,jobs.reduce((sum,j)=>sum+j.missing[i],0)));
  const paid=parts.reduce((sum,n,i)=>sum+n*e.materials[i].price,6000);
  if(!parts.some(Boolean)||e.money<paid)return null;
  const result=game.order_supplies(JSON.stringify(parts));
  if(result!=='ok')throw Error('Service parts order failed: '+result);
  return {parts,paid};
}
