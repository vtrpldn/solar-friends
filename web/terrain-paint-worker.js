import {paintTerrain} from './terrain.js';

self.onmessage=async({data})=>{
 const images=[];
 try{
  const load=async file=>{
   const response=await fetch(new URL('./art/'+file,import.meta.url));
   if(!response.ok)throw Error('Landscape artwork could not be loaded.');
   const image=await createImageBitmap(await response.blob());images.push(image);return image;
  };
  const id=data.map?.biome?.id,row=id==='cerrado'?0:id==='caatinga'?1:null;
  const [texture,regionalImage]=await Promise.all([load('terrain-atlas.png'),row===null?null:load('regional-ground-v1.png')]);
  const canvas=paintTerrain(texture,data.roads,[],data.soil,data.seed,data.map,{surface:size=>new OffscreenCanvas(size,size),regional:regionalImage?{image:regionalImage,row}:null});
  // Finish raster work in this worker before handing ownership to the editor.
  const bitmap=await createImageBitmap(canvas);
  self.postMessage({bitmap},[bitmap]);
 }catch(error){self.postMessage({error:error.message||'The landscape could not be painted.'});}
 finally{for(const image of images)image.close();}
};
