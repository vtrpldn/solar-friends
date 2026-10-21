import {habitatColors} from './habitats.js';
export const landLayers={
  habitat:{legend:'Living habitats · inspect a cell for its plants, underlying geology and growing conditions.',color:g=>habitatColors[g.biome]+'88'},
  moisture:{legend:'Pale → deep blue · actual saved root-zone wetness. Rain and watering remain in the ground after harvest or demolition.',color:g=>`rgba(30,104,170,${.08+g.moisture*.55})`},
  shade:{legend:'Purple · shade from visible woodland trees, food forests, timber, bamboo and banana beds. Shade slows drying; heavy shade reduces crop growth and solar output.',color:g=>`rgba(72,51,108,${g.shade*.65})`},
  fertility:{legend:'Brown → green · lower to higher fertility. Building work, roads and extraction leave lasting disturbance.',color:g=>`hsla(${30+g.fertility*80},45%,42%,.42)`},
  retention:{legend:'Pale → deep blue · how slowly this ground dries. This view shows retention, not stored water.',color:g=>`rgba(45,108,156,${.12+(g.retention-.65)/.7*.45})`},
  disturbance:{legend:'Orange · disturbed ground. Darker plots record foundation work, road building or extraction.',color:g=>`rgba(173,88,40,${g.disturbance*.6})`},
  earth:{material:2,name:'earth',legend:'Ochre · local earth patches. Faded patches are exhausted.',color:'#bb8c45'},
  stone:{material:3,name:'stone',legend:'Blue-grey · local stone patches. Faded patches are exhausted.',color:'#677e9a'},
  salvage:{material:4,name:'reclaimed material',legend:'Rust · local reclaimed patches. Faded patches are exhausted.',color:'#a06141'},
};
export function landTiles(report,layer){
  const rule=landLayers[layer];if(!rule)return [];
  return report.cells.flatMap(cell=>{
    if(rule.material==null){const amount=({disturbance:cell.ground.disturbance,moisture:cell.ground.moisture,shade:cell.ground.shade})[layer]||0,stroke=({disturbance:'rgba(147,74,28,.75)',moisture:'rgba(40,100,160,.6)',shade:'rgba(81,57,113,.55)'})[layer];return [{x:cell.x,y:cell.y,fill:rule.color(cell.ground),stroke:amount>.01?stroke:undefined}];}
    const patch=report.deposits.find(d=>d.material===rule.material&&cell.x>=d.x&&cell.x<d.x+d.width&&cell.y>=d.y&&cell.y<d.y+d.height);
    return patch?[{x:cell.x,y:cell.y,fill:rule.color+(patch.remaining?'88':'28'),stroke:rule.color+'66'}]:[];
  });
}
