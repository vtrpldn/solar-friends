import {installActivityEquipmentReview} from './character-activity-equipment-review.js';
export function installEquipmentReview(options){
 return installActivityEquipmentReview({...options,clip:'water',registrations:Object.fromEntries([4,5,6,7].map(i=>[i,`water-equipment-pose-${i}-v${i===7?3:1}.json`])),prefix:'equipment',sectionId:'equipment-pose-review',title:'Watering can · equipment poses',note:'Draft activity layers. Original body, painted colours, hair and foreground hands keep their own pixels. All four watering poses are drafts; other activity poses fail explicitly. Whole painted poses avoid doubled silhouettes. The comparison crossfade still ghosts; hand contact is checked, while cadence and final material style remain under review. Excluded from player choices.'});
}
export function installCookingEquipmentReview(options){
 return installActivityEquipmentReview({...options,clip:'cook',registrations:{0:'cook-equipment-pose-0-v3.json'},prefix:'cook-equipment',sectionId:'cook-equipment-review',title:'Cooking · first equipment pose',note:'First pot-and-spoon equipment draft only. The remaining cooking poses, stirring continuity and material review are unfinished. No complete cycle or player appearance is implied.'});
}
