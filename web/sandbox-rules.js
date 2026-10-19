// Old Sandbox exports modelled land and utilities while construction was free.
export function constrained(v,key){return v.mode!=='sandbox'||(v.sandbox_rules?.[key]??key!=='logistics');}
export const usesLogistics=v=>constrained(v,'logistics');
export const usesLand=v=>constrained(v,'land');
export const usesUtilities=v=>constrained(v,'utilities');
export function installSandboxRulesUI({snapshot,game,changed,notify}){
  const $=id=>document.getElementById(id),keys=['logistics','land','utilities'];
  for(const key of keys)$('sandbox-'+key).onchange=()=>{
    const values=keys.map(k=>$('sandbox-'+k).checked);
    if(!game().configure_sandbox_rules(...values)){notify('These options belong to Sandbox.');update();return;}
    changed();
  };
  function update(){
    const v=snapshot().village;$('sandbox-rules').hidden=v.mode!=='sandbox';
    for(const key of keys)$('sandbox-'+key).checked=constrained(v,key);
    const active=keys.filter(k=>constrained(v,k)).map(k=>({logistics:'materials & resident work',land:'living land',utilities:'local utilities'}[k]));
    $('sandbox-rule-status').textContent=(active.length?'Active: '+active.join(' · ')+'.':'Free instant buildings · comfortable pantry, water & power · neutral growing conditions.')+(v.sandbox_rules?.supplied_energy?` Free operating power supplied: ${v.sandbox_rules.supplied_energy.toFixed(1)} energy; owned batteries remain separate.`:'');
  }
  update();return{update};
}
