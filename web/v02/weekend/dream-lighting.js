// Preview lighting is independent of the simulation's weather and power supply.
export const DREAM_LIGHTS = {
  dawn: {label: 'Peach dawn', hour: 6, sun: '#ffd29e', sky: '#f2c6ca', ground: '#897aa9',
    fog: '#d5a8b5', direct: 2.2, ambient: 1.45, shadow: .65, angle: [-.75, .48, .46], bloom: .22, paint: 1.1},
  opal: {label: 'Opal afternoon', hour: 13, sun: '#fff0bc', sky: '#e2f6ff', ground: '#6d9eae',
    fog: '#add3df', direct: 2.5, ambient: 1.6, shadow: .74, angle: [-.46, .79, .4], bloom: .12, paint: 1.65},
  blue: {label: 'Blue hour', hour: 19.5, sun: '#a5afff', sky: '#aebcfc', ground: '#4a6291',
    fog: '#637eac', direct: .65, ambient: 1.25, shadow: .64, angle: [-.66, .44, .61], bloom: .57, paint: 1.2},
};
