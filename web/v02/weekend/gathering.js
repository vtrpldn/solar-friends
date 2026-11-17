// Wild resources use ordinary resident production and physical return hauling.
// Quantities and recovery periods are authored gameplay estimates.
export const GATHERING={
 'wild-fruit':{name:'Wild fruit thicket',asset:'forage-fruit',size:[2,2],output:{food:4},work:55,renew:30*3200,biomes:['mata-atlantica','cerrado'],description:'Gather ripe fruit without felling the shrubs. Four kilograms of ingredients; fruit returns after 30 game days.'},
 'fallen-wood':{name:'Fallen branches',asset:'forage-wood',size:[2,1],output:{logs:3},work:45,gatherLimit:6,biomes:['mata-atlantica','cerrado','caatinga'],description:'Collect fallen wood without cutting a living tree. Two loads of 18 kg; this patch is finite. Process the raw wood at a timber workbench.'},
 'wild-bamboo':{name:'Wild bamboo stand',asset:'forage-bamboo',size:[2,2],output:{bamboo:3},work:90,renew:365*3200,biomes:['mata-atlantica'],description:'Selectively cut mature culms while leaving young shoots. Three poles per gathering; allow one game year for recovery.'},
 'wild-forage':{name:'Wild forage grasses',asset:'forage-grass',size:[2,1],output:{fodder:6},work:55,renew:14*3200,biomes:['mata-atlantica','cerrado','caatinga'],description:'Cut and dry six kilograms of grass for animal fodder. Leave the roots; this patch recovers after 14 game days.'},
 'loose-stone':{name:'Loose surface stones',asset:'forage-stone',size:[2,1],output:{stone:2},work:65,gatherLimit:6,biomes:['mata-atlantica','cerrado','caatinga'],description:'Gather loose surface stones in three 40 kg batches. No quarry required; residents carry several small loads and this patch is finite.'},
};
export function registerGathering(defs,recipes){
 for(const [key,d] of Object.entries(GATHERING)){
  defs[key]={name:d.name,asset:d.asset,size:d.size,kind:key,materials:{},work:1,repeatable:true,natural:true,description:d.description};
  recipes[`gather-${key}`]={name:`Gather ${d.name.toLowerCase()}`,kind:key,input:{},output:d.output,work:d.work,renew:d.renew||0,gatherLimit:d.gatherLimit,gathering:true};
 }
}
export function gatheringStatus(s,p){
 const d=GATHERING[p.key];if(!d)return null;
 if(d.gatherLimit&&(p.extracted||0)>=d.gatherLimit)return 'Gathered out · this finite patch does not replenish';
 if(p.readyAt>s.time)return `Recovering · ${((p.readyAt-s.time)/3200).toFixed(1)} game days until gathering`;
 return 'Ready to gather · a resident will collect and carry the materials to stores';
}
