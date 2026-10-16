// The original atlas stays untouched; explicit crops preserve each cluster's aspect.
const edges=[0,334,635,945,1254];
export const natureArt= ['Forest ferns','Bromeliads','Meadow wildflowers','Dry grasses','Granite outcrop','Quartz stones','Clay and ironstone','Mossy river stones'].map((name,i)=>{
  const x=edges[i%4],w=edges[i%4+1]-x,y=i<4?300:670,h=i<4?330:350;
  return {name,file:'landscape-details.png',cell:[x/1254,y/1254,w/1254,h/1254],width:[25,22,27,30,43,35,43,36][i],anchor:.93,aspect:h/w};
});
