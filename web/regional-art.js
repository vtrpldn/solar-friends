// New painted sources keep independent registration; vegetation is never stretched
// to fill a cell. Numeric slots extend, rather than reorder, the saved catalog.
export const regionalNatureArt=[
 {name:'Pequi',file:'cerrado-vegetation-v1.png',cell:[0,0,.5,.5],width:117,anchorX:0.576555,anchor:0.971292,aspect:1,shadow:19},
 {name:'Barbatimão',file:'cerrado-vegetation-v1.png',cell:[.5,0,.5,.5],width:109,anchorX:0.511164,anchor:0.977671,aspect:1,shadow:17},
 {name:'Cerrado bunchgrass',file:'cerrado-bunchgrass-v2.png',cell:[0,0,1,1],width:30.697238,anchorX:0.497608,anchor:0.794258,aspect:1,shadow:0},
 {name:'Campo shrub',file:'cerrado-vegetation-v1.png',cell:[.5,.5,.5,.5],width:39,anchorX:0.503987,anchor:0.837321,aspect:1,shadow:5},
 {name:'Umbuzeiro',file:'caatinga-vegetation-v1.png',cell:[0,0,.5,.5],width:122,anchorX:0.57496,anchor:0.945774,aspect:1,shadow:20},
 {name:'Jurema-preta',file:'caatinga-vegetation-v1.png',cell:[.5,0,.5,.5],width:112,anchorX:0.523126,anchor:0.950558,aspect:1,shadow:17},
 {name:'Mandacaru',file:'caatinga-vegetation-v1.png',cell:[0,.5,.5,.5],width:65,anchorX:0.543062,anchor:0.848485,aspect:1,shadow:7},
 {name:'Macambira',file:'caatinga-vegetation-v1.png',cell:[.5,.5,.5,.5],width:36,anchorX:0.527113,anchor:0.838915,aspect:1,shadow:0},
];
export const regionalImages={};let loading;
export function loadRegionalArt(){
 return loading??=Promise.all([...new Set([...regionalNatureArt.map(a=>a.file),'regional-ground-v1.png'])].map(async file=>{
  const image=new Image();image.src=new URL('./art/'+file,import.meta.url);await image.decode();regionalImages[file]=image;
 }));
}
export function regionalGround(map){
 const id=map?.biome?.id,row=id==='cerrado'?0:id==='caatinga'?1:null;
 return row===null?null:{image:regionalImages['regional-ground-v1.png'],row};
}
