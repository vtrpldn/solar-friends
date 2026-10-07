// Cell coordinates are fractions of the original image; originals are never rewritten.
export const catalog = [];
function add(id, name, file, group, options = {}) {
  catalog.push({ id, name, file: `../art/${file}`, group, usage: 'Active', cell: [0, 0, 1, 1], width: 152, anchor: .76, ...options });
}
for (const [file, usage] of [['village-atlas-isometric.png', 'Active'], ['village-atlas.png', 'Reference']]) {
  ['Home', 'Kitchen', 'Garden (atlas)', 'Banana grove'].forEach((name, i) => add(`${file}-${i}`, name, file, 'Buildings', { usage: i === 2 ? 'Reference' : usage, cell: [i % 2 / 2, Math.floor(i / 2) / 2, .5, .5], width: (i === 3 ? 105 : 152) * 1.18, anchor: [.7,.7,.59,.74][i] }));
}
for (const [id, name, width, anchor, aspect] of [['garden-simple','Garden',119*1.18,.52,10/11],['cistern','Cistern',77,.82,1],['compost','Compost station',152,.76,1],['square','Community square',152,.76,1],['workshop','Workshop',152,.76,1],['coop','Chicken coop',152,.76,1]]) add(id,name,`${id}-isometric.png`,'Buildings',{width,anchor,aspect});
['Jequitibá-rosa','Juçara','Embaúba','Pau-brasil'].forEach((name,i) => add(`forest-${i}`,name,'mata-atlantica-atlas.png','Vegetation',{cell:[i%2/2,Math.floor(i/2)/2,.5,.5],width:[145,112,113,125][i],anchor:.85}));
for (const file of ['mango-tree.png','mango-tree-isometric.png']) add(file,'Mango tree',file,'Vegetation',{usage:'Reference',anchor:.85});
['Meadow','Red earth'].forEach((name,i) => add(`terrain-${i}`,name,'terrain-atlas.png','Terrain',{cell:[i/2,0,.5,1],anchor:.5}));
['Iara','Bento','Luz','Cauã','Nina','Original cistern'].forEach((name,i) => add(`portrait-${i}`,name,'residents-cistern.png','Portraits',{cell:[i%3/3,Math.floor(i/3)/2,1/3,.5],usage:i===5?'Reference':'Active',width:43,anchor:.97}));
['iara','bento','luz','caua','nina'].forEach((id,i) => add(id,['Iara','Bento','Luz','Cauã','Nina'][i],`animations/${id}.png`,'Animations',{animation:true,width:43,anchor:.97}));
['Cream','Ochre','Brown'].forEach((name,i) => catalog.push({id:`hen-${i}`,name:`${name} chicken`,group:'Animals',usage:'Active',procedural:true,color:['#fff3d6','#c58b51','#62513f'][i],width:26,anchor:1}));
