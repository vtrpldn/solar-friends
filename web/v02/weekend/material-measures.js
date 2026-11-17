// Approximate mass/volume of one existing catalog unit, not an inventory-unit
// conversion or a measured supplier specification. Shared by cargo and recipes.
const measures={cooling:[35,.35],wood:[4,.012],logs:[6,.015],planks:[1.5,.005],bamboo:[3,.018],earth:[20,.015],stone:[20,.012],frames:[4,.04],walls:[18,.025],tiles:[12,.012],roofing:[8,.035],tank:[12,.35],batteries:[30,.05],panels:[20,.12],goats:[40,.4],hens:[2,.025],bees:[15,.08]};
export function materialMeasure(id){const [kg,m3]=measures[id]||(['food','meals','eggs','milk','honey','fodder','compost','scraps'].includes(id)?[1,.002]:[2,.01]);return {kg,m3};}
export function materialMass(items){return Object.entries(items).reduce((sum,[id,n])=>sum+materialMeasure(id).kg*n,0);}
