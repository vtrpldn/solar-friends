// Derivative cache only. Work yields between rows and owns no running game.
export async function hydrateLibraryPreviews({library,dialog,records,makePreview}){
 const slots=[...dialog.querySelectorAll('[data-preview-id]')];
 const active=slot=>dialog.open&&slot.isConnected;
 const getters={project:'getProject',run:'getRun',release:'getRelease',map:'getMap'};
 for(const slot of slots){
  if(!active(slot))return;
  const {previewKind:kind,previewId:id}=slot.dataset,head=records.get(kind+':'+id);
  try{
   let image=await library.getPreview(kind,id);
   if(!image&&head&&getters[kind]){
    const record=await library[getters[kind]](id);
    if(!active(slot))return;
    if(record?.revision!==head.revision)continue;
    image=await makePreview(kind,record);
    if(image&&!await library.savePreviewIfCurrent(kind,id,head.revision,image))image=null;
   }
   if(image&&active(slot)){
    const img=new Image();img.alt='';img.loading='lazy';img.width=120;img.height=75;img.src=image;slot.replaceChildren(img);slot.title='Opening landscape';
   }
  }catch{/* Unsupported or damaged content keeps its original placeholder. */}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
}
