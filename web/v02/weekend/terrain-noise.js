// Smooth seeded value noise: no tiled textures or repeating trigonometric bands.
const fade=t=>t*t*t*(t*(t*6-15)+10);
const mix=(a,b,t)=>a+(b-a)*t;
function lattice(x,z,seed){
 let h=Math.imul(x,374761393)^Math.imul(z,668265263)^seed;
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
}
export function terrainNoise(x,z,seed){
 const ix=Math.floor(x),iz=Math.floor(z),u=fade(x-ix),v=fade(z-iz);
 return mix(mix(lattice(ix,iz,seed),lattice(ix+1,iz,seed),u),mix(lattice(ix,iz+1,seed),lattice(ix+1,iz+1,seed),u),v);
}
export function naturalRelief(x,z,seed){
 const warpX=(terrainNoise(x/95,z/95,seed^0x7ac31)-.5)*50;
 const warpZ=(terrainNoise(x/95,z/95,seed^0x91e47)-.5)*50;
 const a=x+warpX,b=z+warpZ;
 const broad=terrainNoise(a/83,b/83,seed^0x12abd);
 const hills=terrainNoise(a/34,b/34,seed^0x48acf);
 const detail=terrainNoise(a/13,b/13,seed^0x719ec);
 const ruggedness=terrainNoise(x/120,z/120,seed^0x816df);
 return Math.max(0,.2+broad*.9+(hills-.35)*(.5+ruggedness*.5)+(detail-.5)*.14);
}
