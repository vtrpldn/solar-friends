// Bed crops. This table is the only place a crop is defined: stock items,
// seed stock, shelf life, cooking recipes, trade and models all read it.
// Durations, yields and water demand are simulation estimates, not agronomic
// prescriptions; sources and assumptions are in docs/farming.md.
//
// days      favourable growth days to harvest
// window    days a ripe crop holds in the bed before losses begin
// plants    plants per m² at standard spacing
// yieldKg   potential fresh harvest, kg/m²
// water     dry-weather demand, L/m²/day
// residue   crop residues left after harvest, kg/m²
// shelf     days in ordinary stores before spoiling
// price     town retail price of 10 kg, R$
// start     what is planted: [stock name, kg per unit, R$ for 5 units]
// dry       [days of dry soil before damage, further days to total loss]
// season    lowest seasonal growth factor; drought-adapted crops keep growing
//           through the dry season that slows the others
export const CROPS={
 greens:{name:'Leafy greens',local:'couve e alface',days:45,window:4,plants:12,yieldKg:2,water:3,residue:.3,height:.28,shelf:3,price:30,start:['seed packets',.02,10],measure:['kg leafy greens',.004],
  note:'Quick and productive, but thirsty and gone in three days.'},
 beans:{name:'Bush beans',local:'feijão',days:60,window:7,plants:8,yieldKg:1.2,water:3,residue:.6,height:.65,shelf:5,price:30,start:['seed packets',.1,10],measure:['kg fresh beans',.002],
  note:'A dependable two-month crop for the wetter months.'},
 corn:{name:'Sweet corn',local:'milho verde',days:85,window:5,plants:4,yieldKg:1.5,water:4,residue:1,height:2,shelf:3,price:30,start:['seed packets',.1,10],measure:['kg sweet corn',.003],
  note:'Tall and thirsty; spare ears can be dried into animal feed.'},
 cassava:{name:'Cassava',local:'mandioca',days:270,window:60,plants:1,yieldKg:2,water:1.5,residue:1.2,height:1.9,shelf:3,price:45,start:['cutting bundles',.5,8],measure:['kg cassava roots',.002],dry:[8,24],season:.7,
  note:'Slow, but shrugs off dry spells and waits in the ground for months once ripe.'},
 sweet_potato:{name:'Sweet potato',local:'batata-doce',days:120,window:21,plants:4,yieldKg:1.5,water:2.5,residue:.8,height:.3,shelf:14,price:45,start:['slip bundles',.25,12],measure:['kg sweet potatoes',.002],dry:[3,10],season:.6,
  note:'Covers the soil with vines, tolerates dry weather and keeps for two weeks.'},
 pumpkin:{name:'Pumpkin',local:'abóbora',days:100,window:14,plants:1,yieldKg:1.5,water:3.5,residue:.7,height:.45,shelf:30,price:35,start:['seed packets',.05,10],measure:['kg pumpkin',.002],
  note:'Thirsty and sprawling, but a whole pumpkin keeps for a month.'},
 cowpea:{name:'Cowpeas',local:'feijão-de-corda',days:70,window:7,plants:6,yieldKg:.5,water:2,residue:.5,height:.7,shelf:4,price:80,start:['seed packets',.1,10],measure:['kg fresh cowpeas',.002],dry:[3,10],season:.6,
  note:'A small harvest that still comes in when the dry season stalls other beans.'},
};
// English name with the name the friends would use.
export const cropLabel=id=>`${CROPS[id].name} · ${CROPS[id].local}`;
// One line of facts for the crop pickers, read from the same table as the simulation.
export const cropFacts=id=>{const c=CROPS[id];return `${c.days} growing days · up to ${c.yieldKg} kg/m² · ${c.water} L/m² a day in dry weather · keeps ${c.shelf} days. ${c.note}`;};
export const seedId=id=>`${id}_seed`;
export const SEED_IDS=Object.keys(CROPS).map(seedId);
