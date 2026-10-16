// A real 3D construction model. Only its material swatches are generated art;
// posts, beams and roof geometry share the map's fixed orthographic camera.
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const mul=(a,s)=>a.map(n=>n*s);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/Math.hypot(...a));
const mean=points=>mul(points.reduce(add,[0,0,0]),1/points.length);
export const shedDimensions={x:2.5,y:2.5,postHeight:1.65,roofRise:1.0,roofSeatOffset:.15,overhang:.18};
export const shedCamera={width:1280,height:1280,origin:[640,700],halfWidth:160,halfHeight:80};
export function projectPoint(p,camera=shedCamera){return[camera.origin[0]+(p[0]-p[1])*camera.halfWidth,camera.origin[1]+(p[0]+p[1])*camera.halfHeight-p[2]*camera.halfWidth];}

export function buildShedModel(){
 const faces=[],{x:sx,y:sy,postHeight:height,roofRise:rise,overhang:over}=shedDimensions;
 function face(points,material,axis=null,shade=1,center=null,uv=null,normals=null){
  let normal=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
  if(center&&dot(normal,sub(mean(points),center))<0){points=[...points].reverse();uv=uv&&[...uv].reverse();normals=normals&&[...normals].reverse();normal=mul(normal,-1);}
  if(dot(normal,[1,1,1])<=1e-7)return;
  faces.push({points,material,axis,shade,normal,uv,normals,depth:dot(mean(points),[1,1,1])});
 }
 function beam(a,b,width,material='wood',thickness=width){
  const direction=unit(sub(b,a)),u=unit(cross(direction,Math.abs(direction[2])>.9?[1,0,0]:[0,0,1])),v=cross(direction,u),r=width/2,t=thickness/2,bevel=Math.min(width,thickness)*.12;
  const section=[[-r+bevel,-t],[r-bevel,-t],[r,-t+bevel],[r,t-bevel],[r-bevel,t],[-r+bevel,t],[-r,t-bevel],[-r,-t+bevel]];
  const ring=p=>section.map(([U,V])=>add(p,add(mul(u,U),mul(v,V)))),A=ring(a),B=ring(b),center=mul(add(a,b),.5);
  for(let i=0;i<8;i++){const next=(i+1)%8;face([A[i],A[next],B[next],B[i]],material,direction,1,center);}
  face(A,material,direction,.9,center);face(B,material,direction,1,center);
 }
 const feet=[[0,0,0],[sx,0,0],[sx,sy,0],[0,sy,0]];
 for(const p of feet)beam(p,add(p,[0,0,height]),.14);
 for(const y of [0,sy])beam([-.05,y,height],[sx+.05,y,height],.15);
 for(const x of [0,sx]){
  beam([x,-.04,height],[x,sy+.04,height],.15);
  beam([x,0,height+.05],[x,sy/2,height+rise+.10],.12);
  beam([x,sy/2,height+rise+.10],[x,sy,height+.05],.12);
  beam([x,sy/2,height],[x,sy/2,height+rise+.10],.11);
 }
 // Short knee braces share the same rigid coordinate system as the posts.
 for(const [x,y]of [[0,0],[sx,0],[sx,sy],[0,sy]]){
  beam([x,y,height-.36],[x+(x===0?.36:-.36),y,height-.02],.09);
  beam([x,y,height-.36],[x,y+(y===0?.36:-.36),height-.02],.09);
 }
 // A supported seat, low enough for the resident sprites' proportions.
 for(const x of [.43,2.02])beam([x,1.76,0],[x,1.76,.24],.075);
 for(const y of [1.66,1.74,1.82])beam([.26,y,.245],[2.18,y,.245],.075,'wood',.035);
 for(const x of [.43,2.02])beam([x,1.59,.22],[x,1.59,.58],.06);
 for(const z of [.39,.52])beam([.26,1.59,z],[2.18,1.59,z],.035,'wood',.10);
 const roofSeat=height+shedDimensions.roofSeatOffset;
 const roofHeight=y=>roofSeat+rise*(1-Math.abs(y-sy/2)/(sy/2));
 // Dark fascia lies under the individual curved clay tiles, without a base slab.
 for(const [y0,y1]of [[-over,sy/2],[sy/2,sy+over]]){
  const points=[[-over,y0,roofHeight(y0)],[sx+over,y0,roofHeight(y0)],[sx+over,y1,roofHeight(y1)],[-over,y1,roofHeight(y1)]];
  face(points,'clay',null,.67);
  for(const x of [-over,sx+over])beam([x,y0,roofHeight(y0)-.035],[x,y1,roofHeight(y1)-.035],.075,'wood');
 }
 function barrel(a,b,r,normal,variation){
  const axis=unit(sub(b,a)),widthAxis=unit(cross(axis,normal));
  const arc=(p,radius)=>Array.from({length:9},(_,i)=>{const t=-Math.PI/2+i*Math.PI/8;return add(p,add(mul(widthAxis,Math.sin(t)*radius),mul(normal,Math.cos(t)*radius)));});
  const A=arc(a,r*.8),B=arc(b,r*1.12);
  for(let i=0;i<8;i++){
   const points=[A[i],B[i],B[i+1],A[i+1]],radial=j=>add(mul(widthAxis,Math.sin(-Math.PI/2+j*Math.PI/8)),mul(normal,Math.cos(-Math.PI/2+j*Math.PI/8)));
   face(points,'clay',axis,variation,mul(add(a,b),.5),[[0,i/8],[1,i/8],[1,(i+1)/8],[0,(i+1)/8]],[radial(i),radial(i),radial(i+1),radial(i+1)]);
  }
  if(dot(axis,[1,1,1])>0)face([b,...B],'clay-end',axis,variation*.66);
 }
 const columns=16,rows=8,column=(sx+2*over)/columns;
 for(const direction of [-1,1]){
  const slope=-direction*rise/(sy/2),normal=unit([0,-slope,1]),run=sy/2+over;
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
   const x=-over+(col+.5)*column,y0=sy/2+direction*row*run/rows,y1=sy/2+direction*Math.min(run,(row+1)*run/rows+.045),lift=.025;
   const a=add([x,y0,roofHeight(y0)],mul(normal,lift)),b=add([x,y1,roofHeight(y1)],mul(normal,lift));
   barrel(a,b,column*.505,normal,.94+((col*13+row*7+(direction+1)*3)%11)*.012);
  }
 }
 // Ridge caps run along exactly the same X axis as the long eaves.
 for(let col=0;col<columns;col++){
  const x=-over+col*column;
  barrel([x,sy/2,roofSeat+rise+.025],[Math.min(sx+over,x+column+.045),sy/2,roofSeat+rise+.025],.115,[0,0,1],1.04);
 }
 return{faces:faces.sort((a,b)=>a.depth-b.depth),feet,features:{ridge:[[-over,sy/2,roofSeat+rise],[sx+over,sy/2,roofSeat+rise]],nearEave:[[-over,sy+over,roofHeight(sy+over)],[sx+over,sy+over,roofHeight(sy+over)]],farEave:[[-over,-over,roofHeight(-over)],[sx+over,-over,roofHeight(-over)]],frontBeam:[[sx,0,height],[sx,sy,height]],frontPeak:[sx,sy/2,height+rise+.10]}};
}

// Depth-buffered orthographic rendering prevents large roof faces from painting
// over their own tiles or exposing beams through the roof. Supersampling keeps
// the final transparent sprite's painted edges smooth.
export function renderShed(ctx,atlas,model=buildShedModel(),camera=shedCamera,{night=false,plants=null}={}){
 const resolution=2,width=camera.width*resolution,height=camera.height*resolution,pixels=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height);depth.fill(-Infinity);
 const cells={clay:[.015,.015,.47,.47],wood:[.515,.015,.47,.47],plaster:[.015,.515,.47,.47],endgrain:[.515,.515,.47,.47]},materials={};
 for(const [key,cell]of Object.entries(cells)){
  const c=document.createElement('canvas');c.width=c.height=256;const local=c.getContext('2d',{willReadFrequently:true});local.drawImage(atlas,cell[0]*atlas.width,cell[1]*atlas.height,cell[2]*atlas.width,cell[3]*atlas.height,0,0,256,256);materials[key]=local.getImageData(0,0,256,256).data;
 }
 const sun=unit([-3,5,8]),half=unit(add(sun,unit([1,1,1])));
 for(const face of model.faces){
  let vertices=face.points.map((point,i)=>({point,normal:face.normals?.[i]||face.normal,uv:face.uv?.[i]})),material=face.material;
  if(material==='wood'&&face.axis&&Math.abs(dot(face.normal,face.axis))>.9)material='endgrain';
  if(vertices.length===4&&material==='wood'&&Math.hypot(...sub(vertices[3].point,vertices[0].point))>Math.hypot(...sub(vertices[1].point,vertices[0].point)))vertices=[vertices[0],vertices[3],vertices[2],vertices[1]];
  if(!face.uv){
   if(vertices.length===4){for(const [i,uv]of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]])vertices[i].uv=uv;}
   else{const U=unit(sub(vertices[1].point,vertices[0].point)),V=cross(face.normal,U),plane=vertices.map(v=>[dot(v.point,U),dot(v.point,V)]),low=[0,1].map(i=>Math.min(...plane.map(p=>p[i]))),span=[0,1].map(i=>Math.max(...plane.map(p=>p[i]))-low[i]);vertices.forEach((v,i)=>v.uv=plane[i].map((n,j)=>(n-low[j])/span[j]));}
  }
  const texture=materials[material]||materials.clay;
  for(const vertex of vertices){
   vertex.screen=projectPoint(vertex.point,camera).map(n=>n*resolution);vertex.depth=dot(vertex.point,[1,1,1]);
   const rounded=face.normals?Math.sqrt(Math.max(0,1-Math.pow(vertex.uv[1]*2-1,2))):1,occlusion=material==='wood'?.92+.08*Math.max(0,1-vertex.point[2]/shedDimensions.postHeight):1;
   vertex.light=(.75+.30*Math.max(0,dot(vertex.normal,sun)))*face.shade*occlusion*(.82+.18*rounded);
   vertex.spec=Math.pow(Math.max(0,dot(vertex.normal,half)),material==='clay'?16:12)*(material==='clay'?.35:.05);
  }
  for(let i=1;i<vertices.length-1;i++){
   const triangle=[vertices[0],vertices[i],vertices[i+1]],[a,b,c]=triangle.map(v=>v.screen),denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(denominator)<1e-8)continue;
   const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
   for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
    const X=x+.5,Y=y+.5,u=((b[1]-c[1])*(X-c[0])+(c[0]-b[0])*(Y-c[1]))/denominator,v=((c[1]-a[1])*(X-c[0])+(a[0]-c[0])*(Y-c[1]))/denominator,w=1-u-v;
    if(u<0||v<0||w<0)continue;
    const weights=[u,v,w],z=weights.reduce((sum,n,j)=>sum+n*triangle[j].depth,0),index=y*width+x;if(z<=depth[index])continue;depth[index]=z;
    const U=weights.reduce((sum,n,j)=>sum+n*triangle[j].uv[0],0),V=weights.reduce((sum,n,j)=>sum+n*triangle[j].uv[1],0),tx=Math.max(0,Math.min(255,Math.round(U*255))),ty=Math.max(0,Math.min(255,Math.round((material==='wood'?V*.3:V)*255))),source=(ty*256+tx)*4,target=index*4;
    const light=weights.reduce((sum,n,j)=>sum+n*triangle[j].light,0),spec=weights.reduce((sum,n,j)=>sum+n*triangle[j].spec,0);
    const color=[0,1,2].map(channel=>{const pigment=texture[source+channel]*(material.startsWith('clay')?[.98,1.12,1][channel]:1)+(material.startsWith('clay')?[0,10,10][channel]:0),value=pigment*light;return value+([255,227,156][channel]-value)*spec;});
    const luminance=color[0]*.2126+color[1]*.7152+color[2]*.0722;
    for(let channel=0;channel<3;channel++)pixels[target+channel]=!night?color[channel]:material.startsWith('clay')?luminance*[.37,.48,.78][channel]:color[channel]*.25+luminance*[.15,.26,.42][channel];
    pixels[target+3]=255;
   }
  }
 }
 ctx.clearRect(0,0,camera.width,camera.height);
 const center=projectPoint([shedDimensions.x/2,shedDimensions.y/2,0],camera);ctx.save();ctx.translate(...center);ctx.scale(320,160);const shade=ctx.createRadialGradient(0,0,0,0,0,1);shade.addColorStop(0,night?'#13202a24':'#2f3e2624');shade.addColorStop(.4,night?'#13202a18':'#2f3e2618');shade.addColorStop(1,'#2f3e2600');ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
 for(const foot of model.feet){const p=projectPoint(foot,camera);ctx.save();ctx.translate(...p);ctx.scale(28,14);const shadow=ctx.createRadialGradient(0,0,.15,0,0,1);shadow.addColorStop(0,night?'#14202832':'#34462d32');shadow.addColorStop(1,'#34462d00');ctx.fillStyle=shadow;ctx.fillRect(-1,-1,2,2);ctx.restore();}
 const surface=document.createElement('canvas');surface.width=width;surface.height=height;surface.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);ctx.drawImage(surface,0,0,camera.width,camera.height);
 if(plants)for(const foot of model.feet.filter(p=>p[0]+p[1]>0)){const p=projectPoint(foot,camera),w=44,h=w*330/334;ctx.save();ctx.filter=night?'brightness(.4) saturate(.65)':'none';ctx.drawImage(plants,0,300,334,330,p[0]-w/2,p[1]-3-h*.93,w,h);ctx.restore();}
}
