// Additional exterior designs. Dimensions are metres; sites are 2 m cells.
// Beds use the existing cottage/standard/family assumptions, not simulated rooms.
export const HOME_DESIGNS = [
  {id:'home-studio',name:'Little limewash studio',site:[3,4],shell:[4.4,6],beds:1,roof:'front-gable',doorX:1,wall:'#eadfc5',shutters:'teal',rise:1.05,hood:1.5,cornerTrim:true},
  {id:'home-lane',name:'Narrow lane house',site:[3,5],shell:[4.4,8],beds:2,roof:'side-gable',rise:2,doorX:1,wall:'#d8c8a1',shutters:'timber',hood:1.5,weatherboard:true},
  {id:'home-garden',name:'Garden cottage',site:[4,3],shell:[6,4],beds:1,roof:'hip',doorX:-.7,wall:'#d9dfc8',shutters:'teal',hood:2,flowerBox:true},
  {id:'home-ochre',name:'Ochre gable house',site:[4,5],shell:[6,8],beds:2,roof:'front-gable',doorX:.6,wall:'#caa075',shutters:'timberLight',rise:1.65,cornerTrim:true,hood:1.8},
  {id:'home-deep-porch',name:'Deep porch house',site:[4,6],shell:[6,8],beds:2,roof:'side-gable',rise:2,doorX:0,wall:'#e3cdb5',shutters:'teal',verandaDepth:2,screen:true},
  {id:'home-blue-gallery',name:'Sage terrace house',site:[5,4],shell:[6,6],beds:2,roof:'front-gable',doorX:-.5,wall:'#c8d1bb',shutters:'timber',rise:1.2,terrace:[2,6],cornerTrim:true},
  {id:'home-paired',name:'Paired roof house',site:[6,4],shell:[10,6],beds:3,roof:'twin-gable',doorX:.6,wall:'#ead6b2',shutters:'timber',weatherboard:true,hood:2.2},
  {id:'home-broad-veranda',name:'Broad veranda house',site:[7,5],shell:[12,6],beds:3,roof:'hip',doorX:0,wall:'#e9dfca',shutters:'teal',verandaDepth:2,cornerTrim:true},
  {id:'home-shaded-retreat',name:'Shaded terrace home',site:[6,7],shell:[8,10],beds:3,roof:'hip',doorX:-.5,wall:'#cea88c',shutters:'timberLight',verandaDepth:2,terrace:[2,10],screen:true},
  {id:'home-ranch',name:'Long clay-roof house',site:[8,4],shell:[14,6],beds:3,roof:'side-gable',rise:1.5,doorX:-.7,wall:'#dbdec8',shutters:'teal',gallery:true,cornerTrim:true},
];
export const HOME_DESIGN_BY_ID=Object.fromEntries(HOME_DESIGNS.map(d=>[d.id,d]));
