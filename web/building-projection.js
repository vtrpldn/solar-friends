// Hand-traced structural edges, in a 1280 px reference view (640 for atlas
// cells, or the actual source size for replaced sprites). Sloping roof pitches,
// foliage, bunting and curved tank rims are not ground axes; roof ridges and
// horizontal eaves are, and must agree with the walls and foundation.
// Each direction contains two independently traced, nominally parallel edges.
// Keep these landmarks visible in the projection review; do not infer a pass
// merely from the requested camera in an image-generation prompt.
export const buildingProjection = {
  shed:{size:1254,right:[[210,894,266,920],[526,1035,578,1060]],left:[[578,1060,606,1044],[1070,948,1097,932]],upright:[550,710,550,1030]},
  goat_pasture:{size:1280,right:[[156,704,505,899],[518,372,854,555]],left:[[749,918,1107,743],[906,548,1075,461]],upright:[855,580,855,730]},
  apiary:{size:1280,right:[[273,312,692,538],[461,176,889,404]],left:[[697,834,850,754],[414,591,535,529]],upright:[704,854,704,1036]},
  hydro:{size:1280,right:[[304,744,566,873],[359,685,629,819]],left:[[563,872,740,792],[650,787,826,707]],upright:[620,584,620,818]},
  eco_toilet:{size:1280,right:[[237,975,609,1168],[345,879,614,1014]],left:[[609,1168,1087,974],[664,975,938,864]],upright:[626,725,626,1028]},
  banana_treatment:{size:1280,right:[[92,743,630,1137],[92,667,630,1063]],left:[[630,1137,1173,754],[630,1063,1173,677]],upright:[632,1062,632,1128]},
  wetland:{size:1774,right:[[357,511,989,797],[366,428,990,710]],left:[[989,797,1355,571],[998,710,1343,500]],upright:[990,713,990,789]},
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
  workshop: { size:1254, right:[[118,917,553,1145],[152,522,505,708],[471,185,828,374]], left:[[553,1145,1131,981],[594,640,1007,531],[637,867,876,806]], upright:[558,746,558,1002], rightLabels:['Side foundation','Side eave','Roof ridge'], leftLabels:['Front foundation','Front lintel','Workbench front'] },
  coop: { size:1280, right:[[355,753,591,884],[277,486,579,657]], left:[[665,648,921,547],[661,886,746,853]], upright:[634,709,634,994] },
  'home-veranda': { size:1280, right:[[100,852,574,1098],[350,612,445,658]], left:[[574,1098,1156,852],[636,699,1102,503]], upright:[571,731,571,1065] },
  'home-gable': { size:1280, right:[[151,797,650,1061],[200,484,603,699]], left:[[650,1061,1140,841],[897,757,970,724]], upright:[674,719,674,1020] },
  'home-courtyard': { size:1280, right:[[84,852,584,1097],[277,604,416,673]], left:[[584,1097,1173,853],[600,720,1100,510]], upright:[550,745,550,1029] },
};

// Long roof, frame and ground controls are separate: matching feet alone is
// insufficient. These traces also drive the rectification mesh and review UI.
Object.assign(buildingProjection.shed,{
 right:[[240,890,550,1020],[240,560,550,710],[155,500,495,690],[580,245,850,430],[630,770,970,900]],
 left:[[550,1020,1050,930],[550,710,1050,580]],
 rightLabels:['Left/front feet','Side frame','Side eave','Roof ridge','Bench seat'],leftLabels:['Front/right feet','Front frame'],
 upright:[550,710,550,1020],uprights:[[240,560,240,890],[550,710,550,1020],[1050,580,1050,930]],
 gables:[[[850,430],[495,690],[1170,540]]],equalPosts:true,
});
const roofs={
 goat_pasture:{right:[[665,205,895,350],[540,335,805,480]],left:[[835,505,1010,432]],gables:[[[895,350],[805,480],[1060,405]]]},
 apiary:{right:[[410,230,890,510],[250,415,720,680]],left:[[750,690,1020,570]],gables:[[[890,510],[720,680],[1070,550]]]},
 hydro:{right:[[468,263,773,438],[300,457,580,618]],left:[[628,650,875,539]],gables:[[[773,438],[580,618],[975,502]]]},
 eco_toilet:{right:[[525,204,800,366],[318,446,595,605]],left:[[655,620,927,499]],gables:[[[800,366],[595,605],[1000,462]]]},
 biodigester:{left:[[851,525,1062,427],[984,667,1200,565]],gables:[[[851,525],[800,550],[984,667]]]},
 warehouse:{right:[[400,230,980,510],[150,470,775,710]],left:[[775,710,1180,550]],gables:[[[980,510],[775,710],[1210,550]]]},
 home:{left:[[161,237,358,135],[290,375,530,273]],right:[[110,289,274,371]]},
 kitchen:{right:[[258,132,477,256],[86,257,324,382]],left:[[370,376,517,305]],gables:[[[477,256],[324,382],[548,283]]]},
 greenhouse:{right:[[493,135,826,381],[245,414,599,660]],left:[[610,673,1030,463]],gables:[[[826,381],[599,660],[1030,463]]]},
 workshop:{gables:[[[828,374],[505,708],[1130,496]]]},
 coop:{right:[[492,207,810,410],[240,468,592,684]],left:[[655,700,945,549]],gables:[[[810,410],[592,684],[1050,499]]]},
 'home-veranda':{left:[[318,420,795,170],[600,710,1155,480]],gables:[[[318,420],[145,470],[600,710]]]},
 'home-gable':{right:[[465,180,906,423],[165,473,640,720]],gables:[[[906,423],[640,720],[1100,493]]]},
 'home-courtyard':{left:[[318,420,795,170],[600,710,1155,480]],gables:[[[318,420],[145,470],[600,710]]]},
 'adobe-gable':{right:[[432,143,920,420],[135,460,639,702]],left:[[665,715,1110,502]],gables:[[[920,420],[639,702],[1160,505]]]},
 'adobe-veranda':{right:[[432,143,920,420],[135,460,639,702]],left:[[665,715,1110,502]],gables:[[[920,420],[639,702],[1160,505]]]},
};
for(const [key,roof]of Object.entries(roofs)){
 const m=buildingProjection[key];
 for(const direction of ['right','left']){
  const added=roof[direction]||[];
  m[direction+'Labels']||=m[direction].map((_,i)=>i===0?'Ground/frame':'Independent frame');
  m[direction+'Labels'].push(...added.map((_,i)=>i===0?'Roof ridge / eave':'Parallel eave'));
  m[direction].push(...added);
 }
 if(roof.gables)m.gables=roof.gables;
 m.structure='roofed';
}
for(const [key,m]of Object.entries(buildingProjection)){
 m.structure||=key==='shed'?'roofed':key==='well'?'cylindrical':'open';
 m.rightLabels||=m.right.map((_,i)=>i===0?'Ground contact':'Upper frame');
 m.leftLabels||=m.left.map((_,i)=>i===0?'Ground contact':'Upper frame');
}

// Equal roof spans prevent parallel-but-converging roofs. The back shed foot
// must close the same parallelogram as the other three posts.
buildingProjection.shed.postBands=[
 {axis:[240,560,240,890],bounds:[207,273,590,860]},
 {axis:[550,710,550,1020],bounds:[518,582,735,988]},
 {axis:[1050,580,1050,930],bounds:[1018,1082,610,900]},
 {axis:[660,700,660,820],bounds:[638,682,720,804]},
];
buildingProjection.shed.partialUprights=[[660,700,660,820]];
buildingProjection.shed.parallelograms=[[[240,890],[550,1020],[1050,930],[660,820]]];
buildingProjection.home.gables=[[[161,237],[84,263],[290,375]]];
const roofSpans={
 shed:[[155,500,495,690],[580,245,850,430]],
 goat_pasture:[[665,205,895,350],[540,335,805,480]],
 apiary:[[410,230,890,510],[250,415,720,680]],
 hydro:[[468,263,773,438],[300,457,580,618]],
 eco_toilet:[[525,204,800,366],[318,446,595,605]],
 biodigester:[[851,525,1062,427],[984,667,1200,565]],
 warehouse:[[400,230,980,510],[150,470,775,710]],
 home:[[161,237,358,135],[290,375,530,273]],
 kitchen:[[258,132,477,256],[86,257,324,382]],
 greenhouse:[[493,135,826,381],[245,414,599,660]],
 workshop:[[152,522,505,708],[471,185,828,374]],
 coop:[[492,207,810,410],[240,468,592,684]],
 'home-veranda':[[318,420,795,170],[600,710,1155,480]],
 'home-gable':[[465,180,906,423],[165,473,640,720]],
 'home-courtyard':[[318,420,795,170],[600,710,1155,480]],
 'adobe-gable':[[432,143,920,420],[135,460,639,702]],
 'adobe-veranda':[[432,143,920,420],[135,460,639,702]],
};
for(const [key,spans]of Object.entries(roofSpans))buildingProjection[key].spans=[spans];

// Circular tank lids use the same ground-plane camera, rather than a guessed
// flattened ellipse. Eight rim points also constrain the intervening paint.
buildingProjection.well.circles=[
 {center:[628,268],radius:332,ry:147,hidden:[6]},
 {center:[628,151],radius:84,ry:42},
];
buildingProjection.biodigester.circles=[{center:[429,504],radius:98,ry:40}];

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
