import {ContentLibrary,LibraryConflict} from './content-library.js';
self.onmessage=async({data})=>{
 let library;
 try{
  if(typeof data?.name!=='string'||!data.name.length||data.name.length>256||typeof data.raw!=='string'||data.raw.length>96*1024*1024||typeof data.receipt!=='string'||!data.receipt.length||data.receipt.length>96||data.expectedRevision!==null&&(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<0))throw Error('Invalid prepared save request.');
  const input=JSON.parse(data.raw);library=new ContentLibrary(data.name,{broadcast:false});
  const record=await library.saveProject(input,data.expectedRevision,{receipt:data.receipt});
  const {id,revision,updatedAt,title,attribution,saveReceipt}=record;
  self.postMessage({saved:{id,revision,updatedAt,title,attribution,saveReceipt}});
 }catch(error){self.postMessage({error:error.message||'The creation could not be saved.',conflict:error instanceof LibraryConflict});}
 finally{library?.close();}
};
