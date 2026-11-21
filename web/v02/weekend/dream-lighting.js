import { sunlightAt } from './sunlight.js';

// Art direction follows the village clock. The simulation keeps its own solar rules.
export const DREAM_LIGHTS = {
  dawn: {label: 'Peach dawn', hour: 6, sun: '#ffd29e', sky: '#f2c6ca', ground: '#897aa9',
    fog: '#d5a8b5', direct: 2.2, ambient: 1.45, shadow: .65, angle: [-.75, .48, .46], bloom: .22, lamps: .55, paint: 1.1},
  opal: {label: 'Opal afternoon', hour: 13, sun: '#fff0bc', sky: '#e2f6ff', ground: '#6d9eae',
    fog: '#add3df', direct: 2.5, ambient: 1.6, shadow: .74, angle: [-.46, .79, .4], bloom: .12, lamps: 0, paint: 1.65},
  blue: {label: 'Blue hour', hour: 19.5, sun: '#a5afff', sky: '#aebcfc', ground: '#4a6291',
    fog: '#637eac', direct: .65, ambient: 1.25, shadow: .64, angle: [-.66, .44, .61], bloom: .57, lamps: 1, paint: 1.2},
};

const midnight = {
  hour: 24, sun: '#8494e3', sky: '#8899de', ground: '#344767',
  fog: '#43567b', direct: .28, ambient: .85, shadow: .42, bloom: .54, lamps: 1, paint: 1.2,
};
const cycle = [{...midnight, hour: 0}, DREAM_LIGHTS.dawn, DREAM_LIGHTS.opal, DREAM_LIGHTS.blue, midnight];

export function lightingAt(time) {
  const sun = sunlightAt(time);
  const end = cycle.findIndex(preset => preset.hour > sun.hour);
  const from = cycle[end - 1], to = cycle[end];
  const phase = (sun.hour - from.hour) / (to.hour - from.hour);
  const blend = phase * phase * (3 - 2 * phase);
  return {sun, from, to, blend};
}
