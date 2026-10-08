// Registered to the taller greenhouse's 1280-pixel reference canvas.
// Crops span two side beds; the middle third stays a walking aisle.
const fraction = points => points.map(([x,y]) => [x / 1280, y / 1280]);
const backLeft = [280,771], across = [359,-174], along = [320,225];
const floor = (u,v) => [(backLeft[0]+across[0]*u+along[0]*v)/1280,
  (backLeft[1]+across[1]*u+along[1]*v)/1280];
export const greenhouseBeds = [[.05,.30],[.70,.95]].map(([a,b]) =>
  [floor(a,.04),floor(b,.04),floor(b,.94),floor(a,.94)]);
export const greenhousePlants = [.18,.82].flatMap(u => [.12,.36,.60,.84].map(v => floor(u,v)));
// Glass-only apertures leave the original painted posts, roof bars, raised-bed
// edges and foundation in front of the crops. The doorway has its own pass.
export const greenhouseGlass = [
  [[269,452],[335,493],[335,827],[269,777]],
  [[366,508],[459,574],[459,916],[366,850]],
  [[490,596],[580,664],[580,1001],[490,937]],
  [[632,682],[688,655],[688,987],[632,1011]],
  [[946,544],[1005,516],[1005,825],[947,854]],
  [[280,390],[486,174],[560,225],[340,460]],
  [[370,477],[590,246],[677,313],[461,551]],
  [[494,573],[704,339],[795,408],[585,631]],
].map(fraction);
export const greenhouseDoor = fraction([[735,648],[892,573],[892,942],[735,1014]]);
