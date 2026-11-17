import {quantityText} from './material-measures.js';
// Authored local trading terms, not a claimed live commodity-price feed.
export const BUYERS={
 produce:{name:'Town produce stall',batches:8,fullPriceBatches:4,ratio:.5,bulkRatio:.4},
 meals:{name:'Local café',batches:4,fullPriceBatches:2,ratio:.5,bulkRatio:.4},
 materials:{name:'Builders’ cooperative',batches:8,fullPriceBatches:4,ratio:.5,bulkRatio:.4},
 livestock:{name:'Smallholders’ cooperative',batches:2,fullPriceBatches:1,ratio:.5,bulkRatio:.4},
 equipment:{name:'Hardware resale counter',batches:2,fullPriceBatches:1,ratio:.4,bulkRatio:.3},
};
export function buyerFor(id){
 const key=['food','eggs','milk','honey'].includes(id)?'produce':id==='meals'?'meals':['goats','hens','bees','fodder','seedlings','tree_starts','bamboo_starts','compost'].includes(id)?'livestock':['panels','batteries','pumps','cooling','tools','tank','sanitation','electrical','plumbing'].includes(id)?'equipment':'materials';
 return {id:key,...BUYERS[key]};
}
export function buyerQuote(id,item,sold=0){
 const buyer=buyerFor(id),batches=Math.floor(sold/item.quantity);
 return {buyer:buyer.id,buyerName:buyer.name,capacity:item.quantity*buyer.batches,remaining:Math.max(0,item.quantity*buyer.batches-sold),cents:Math.floor(item.price*(batches<buyer.fullPriceBatches?buyer.ratio:buyer.bulkRatio))*100};
}
export function supplierFor(id){const buyer=buyerFor(id);return buyer.id==='produce'||buyer.id==='meals'?'Town food market':buyer.id==='livestock'?'Agricultural supply store':'Hardware store';}
export function marketTerms(id,item){if(!item?.quantity||!item.price)return 'Used within the village; no town buyer or supplier.';const b=buyerFor(id);return `${supplierFor(id)} supplies this resource. ${b.name} buys up to ${quantityText(id,b.batches*item.quantity)} per game day: first ${quantityText(id,b.fullPriceBatches*item.quantity)} at ${Math.round(b.ratio*100)}% of retail, then ${Math.round(b.bulkRatio*100)}%. Quotes lock when reserved; demand renews the next day. Delivery costs are separate.`;}
