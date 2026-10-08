// Hand-traced structural edges, in a 1280 px reference view (640 for atlas
// cells). Roof pitches, foliage, bunting and curved tank rims are not axes.
// Each direction contains two independently traced, nominally parallel edges.
// Keep these landmarks visible in the projection review; do not infer a pass
// merely from the requested camera in an image-generation prompt.
export const buildingProjection = {
  solar_farm: { size:1280, right:[[101,778,595,1030],[595,321,910,476]], left:[[595,1030,1160,713],[1042,500,1111,461]], upright:[804,668,804,749] },
  streetlight: { size:1280, right:[[533,1002,609,1038],[561,167,608,190]], left:[[609,1038,685,1000],[608,190,653,167]], upright:[610,400,610,950] },
  home: { size:640, right:[[75,440,289,542],[182,326,222,348]], left:[[289,542,527,422],[161,237,358,135]], upright:[283,382,283,522] },
  kitchen: { size:640, right:[[64,429,329,572],[181,411,311,481]], left:[[329,572,541,452],[493,290,370,360]], upright:[358,381,358,536] },
  garden: { size:1280, right:[[178,659,627,906],[636,416,1080,654]], left:[[178,643,623,403],[639,905,1084,668]], upright:[627,912,627,939] },
  greenhouse: { size:1280, right:[[241,770,604,1025],[299,542,584,729]], left:[[605,1025,1056,813],[725,669,978,570]], upright:[603,770,603,925] },
  well: { size:1280, right:[[337,950,505,1040],[218,944,475,1086]], left:[[785,1001,1026,869],[790,1091,1040,953]], upright:[961,343,961,684] },
  compost: { size:1280, right:[[550,307,747,415],[538,657,735,773]], left:[[247,441,484,299],[540,598,754,464]], upright:[781,805,781,1075] },
  square: { size:1280, right:[[625,160,1090,411],[199,383,699,605]], left:[[199,383,625,160],[699,605,1090,411]], upright:[1092,478,1092,817] },
  workshop: { size:1280, right:[[116,894,588,1141],[173,511,503,684]], left:[[591,1141,1149,930],[602,651,1025,505]], upright:[554,714,554,990] },
  coop: { size:1280, right:[[355,753,591,884],[277,486,579,657]], left:[[665,648,921,547],[661,886,746,853]], upright:[634,709,634,994] },
  'home-veranda': { size:1280, right:[[100,852,574,1098],[350,612,445,658]], left:[[574,1098,1156,852],[636,699,1102,503]], upright:[571,731,571,1065] },
  'home-gable': { size:1280, right:[[151,797,650,1061],[200,484,603,699]], left:[[650,1061,1140,841],[897,757,970,724]], upright:[674,719,674,1020] },
  'home-courtyard': { size:1280, right:[[84,852,584,1097],[277,604,416,673]], left:[[584,1097,1173,853],[600,720,1100,510]], upright:[550,745,550,1029] },
};

function slope(edges) {
  const sums=edges.reduce((s,[x1,y1,x2,y2])=>{
    const dx=x2-x1,dy=y2-y1;
    return [s[0]+dx*dy,s[1]+dx*dx];
  },[0,0]);
  return sums[0]/sums[1];
}
export function measuredAxes(key) {
  const measurement=buildingProjection[key];
  return measurement ? [slope(measurement.right),slope(measurement.left)] : undefined;
}
