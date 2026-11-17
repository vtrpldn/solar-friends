import {HOME_DESIGNS,HOME_DESIGN_BY_ID} from './home-designs.js';
import { FUNCTIONAL_PROGRAM } from './functional-program.js';
// Exterior dimensions only. Occupancy remains a design assumption; no rooms
// or furnishings are generated and the site is not a usable-floor measurement.
export const FUNCTIONAL_LAYOUTS = Object.fromEntries(
  Object.entries(FUNCTIONAL_PROGRAM).filter(([,p])=>p.capacity.residents).map(([id,p])=>[id,{
    occupants:p.capacity.residents,site:[...p.site],shell:p.shell,wall:.2,
    targetUsableArea:p.targetUsableArea,
    ...(!HOME_DESIGN_BY_ID[id]&&id.includes('veranda')?{site:[5,6],verandaDepth:2}:{}),
    ...(id==='home-courtyard'?{site:[6,5],terrace:[2,8]}:{}),
    ...(HOME_DESIGN_BY_ID[id]?.verandaDepth?{verandaDepth:HOME_DESIGN_BY_ID[id].verandaDepth}:{}),
    ...(HOME_DESIGN_BY_ID[id]?.terrace?{terrace:HOME_DESIGN_BY_ID[id].terrace}:{}),
  }])
);
export const HOME_CHARACTER = {
  ...Object.fromEntries(HOME_DESIGNS.map(d=>[d.id,d])),
  'home-cottage':{roof:'hip',doorX:.45,wall:'#eee1c2',shutters:'timber'},
  'home-longhouse':{roof:'side-gable',doorX:-.7,wall:'#d2d6ba',shutters:'teal'},
  house:{roof:'hip',doorX:-.65,wall:'#e8d8ab',shutters:'teal'},
  'home-gable':{roof:'front-gable',doorX:.65,wall:'#e5ceb1',shutters:'timber'},
  'adobe-gable':{roof:'side-gable',doorX:-.8,wall:'#c89970',shutters:'timber'},
  'home-veranda':{roof:'hip',doorX:0,wall:'#d6dfc7',shutters:'teal'},
  'adobe-veranda':{roof:'side-gable',doorX:0,wall:'#c49365',shutters:'timberLight'},
  'home-courtyard':{roof:'hip',doorX:-.6,wall:'#e8dec7',shutters:'teal'},
  'home-family':{roof:'twin-gable',doorX:.6,wall:'#e4c49b',shutters:'teal'},
  'home-shared':{roof:'hip-porch',doorX:0,wall:'#cf9f85',shutters:'timber'},
};
