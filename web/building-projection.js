// Hand-traced structural edges, in a 1280 px reference view (640 for atlas
// cells, or the actual source size for replaced sprites). Sloping roof pitches,
// foliage, bunting and curved tank rims are not ground axes; roof ridges and
// horizontal eaves are, and must agree with the walls and foundation.
// Each direction contains two independently traced, nominally parallel edges.
// Keep these landmarks visible in the projection review; do not infer a pass
// merely from the requested camera in an image-generation prompt.
export const buildingProjection = {
  shed:{"size":1254,"right":[[193,865,635,1082],[155,558,625,800]],"left":[[635,1082,1061,884],[650,760,1068,553]],"upright":[635,802,635,1082],"rightLabels":["Post feet","Near eave beam"],"leftLabels":["Post feet","Front crossbeam"],"heldOut":{"right":[[390,216,879,461]],"left":[]}},
  goat_pasture:{size:1280,right:[[156,704,505,899],[518,372,854,555]],left:[[749,918,1107,743],[906,548,1075,461]],upright:[855,580,855,730]},
  apiary:{size:1280,right:[[273,312,692,538],[461,176,889,404]],left:[[697,834,850,754],[414,591,535,529]],upright:[704,854,704,1036]},
  hydro:{size:1280,right:[[304,744,566,873],[359,685,629,819]],left:[[563,872,740,792],[650,787,826,707]],upright:[620,584,620,818]},
  eco_toilet:{"size":1254,"right":[[215,974,607,1175],[500,482,598,532]],"left":[[607,1175,1070,1000],[615,1142,1062,972]],"upright":[615,520,615,1080],"rightLabels":["Plinth edge","Door lintel"],"leftLabels":["Plinth edge","Upper plinth edge"],"heldOut":{"right":[[500,101,786,263],[300,347,610,510]],"left":[[659,495,904,414]]}},
  banana_treatment:{size:1280,right:[[92,743,630,1137],[92,667,630,1063]],left:[[630,1137,1173,754],[630,1063,1173,677]],upright:[632,1062,632,1128]},
  wetland:{size:1254,right:[[120,815,580,1078],[160,717,550,926]],left:[[730,1084,1150,840],[750,939,950,832]],upright:[621,260,621,300],rightLabels:['Masonry foot edge','Cap edge'],leftLabels:['Masonry foot edge','Cap edge'],heldOut:{right:[[160,758,550,972]],left:[[750,987,950,872]]}},
  biodigester:{size:1280,right:[[868,899,961,937],[880,752,971,789]],left:[[961,937,1164,858],[973,867,1172,789]],upright:[956,690,956,888]},
  warehouse:{size:1280,right:[[107,848,741,1133],[274,741,700,933]],left:[[741,1133,1188,936],[742,1055,1014,935]],upright:[733,792,733,1051]},
  'adobe-gable':{size:1280,right:[[122,882,643,1138],[273,918,457,1007]],left:[[643,1138,1198,917],[777,753,966,678]],upright:[624,793,624,1068]},
  'adobe-veranda':{size:1280,right:[[103,876,656,1162],[317,900,581,1037]],left:[[656,1162,1185,911],[785,849,967,763]],upright:[630,747,630,1064]},
  solar_farm: { size:1280, right:[[101,778,595,1030],[595,321,910,476]], left:[[595,1030,1160,713],[1042,500,1111,461]], upright:[804,668,804,749] },
  streetlight: { size:1280, right:[[533,1002,609,1038],[561,167,608,190]], left:[[609,1038,685,1000],[608,190,653,167]], upright:[610,400,610,950] },
  home: { size:640, right:[[75,440,289,542],[182,326,222,348]], left:[[289,542,527,422],[161,237,358,135]], upright:[283,382,283,522] },
  kitchen: { size:640, right:[[64,429,329,572],[181,411,311,481]], left:[[329,572,541,452],[493,290,370,360]], upright:[358,381,358,536] },
  garden: { size:1280, right:[[178,659,627,906],[636,416,1080,654]], left:[[178,643,623,403],[639,905,1084,668]], upright:[627,912,627,939] },
  greenhouse: { size:1280, right:[[211,843,592,1132],[269,428,588,653]], left:[[595,1135,1059,909],[733,615,1005,481]], upright:[607,704,607,1033] },
  well: { size:1280, right:[[337,950,505,1040],[218,944,475,1086]], left:[[785,1001,1026,869],[790,1091,1040,953]], upright:[961,343,961,684] },
  compost: { size:1280, right:[[550,307,747,415],[538,657,735,773]], left:[[247,441,484,299],[540,598,754,464]], upright:[781,805,781,1075] },
  square: { size:1280, right:[[460,851,598,911],[649,752,786,810]], left:[[310,733,541,611],[752,898,994,764]], upright:[599,919,599,966] },
  workshop: { size:1254, right:[[118,917,548,1145],[152,522,505,708],[471,185,828,374]], left:[[553,1145,1131,981],[594,640,1007,531],[637,867,876,806]], upright:[558,746,558,1002], rightLabels:['Side foundation','Side eave','Roof ridge'], leftLabels:['Front foundation','Front lintel','Workbench front'] },
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
