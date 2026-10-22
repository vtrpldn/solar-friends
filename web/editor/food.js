// Authoring transforms retain explicit aged units; unspecified units are fresh.
export const foodBatches=inventory=>inventory.food_lots??[];
export function setStartingQuantity(inventory,material,value){
 if(value===0)delete inventory.items[material];else inventory.items[material]=value;
 if(!Number.isInteger(value)||value<0)return;
 let excess=Math.max(0,foodBatches(inventory).filter(l=>l.material===material).reduce((n,l)=>n+l.amount,0)-value);
 for(const lot of [...foodBatches(inventory)].filter(l=>l.material===material).sort((a,b)=>b.age_minutes-a.age_minutes)){const remove=Math.min(excess,lot.amount);lot.amount-=remove;excess-=remove;}
 inventory.food_lots=foodBatches(inventory).filter(l=>l.amount>0);if(!inventory.food_lots.length)delete inventory.food_lots;
}
export function mergeStartingSupplies(destination,source){
 for(const [material,n]of Object.entries(source.items))destination.items[material]=(destination.items[material]??0)+n;
 const lots=[...foodBatches(destination),...foodBatches(source)].map(l=>({...l}));if(lots.length)destination.food_lots=lots;
}
export function addFoodBatch(inventory,material){
 const fresh=(inventory.items[material]??0)-foodBatches(inventory).filter(l=>l.material===material).reduce((n,l)=>n+l.amount,0);
 if(fresh>0)(inventory.food_lots??=[]).push({material,amount:fresh,age_minutes:0});
}
export function freshenBatch(inventory,index){inventory.food_lots.splice(index,1);if(!inventory.food_lots.length)delete inventory.food_lots;}
