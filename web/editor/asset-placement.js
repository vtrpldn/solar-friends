// The preview worker and committed transaction use the same owned-object edit.
export function applyAssetPlacement(definition,{collection,asset,replace=false,copyFrom=null},x,y){
 if(!['batteries','resource_sites'].includes(collection))throw Error('Choose a supported starting asset.');
 const placed={...structuredClone(asset),x,y},items=definition.start[collection]??=[];
 if(replace){const original=items.find(item=>item.id===placed.id);if(!original)throw Error('This starting asset is missing.');Object.assign(original,placed);}
 else{
  items.push(placed);
  if(collection==='batteries'&&copyFrom){
   const condition=definition.start.equipment?.find(entry=>entry.asset.kind==='battery'&&entry.asset.id===copyFrom);
   if(condition)(definition.start.equipment??=[]).push({...structuredClone(condition),asset:{kind:'battery',id:placed.id}});
  }
 }
}
