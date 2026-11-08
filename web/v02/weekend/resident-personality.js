// Authored friends share the same needs, but bring different strengths and rhythms.
export const PROFILES={
 iara:{role:'Grower & naturalist',bio:'Keeps seeds in her pockets and notices which plants thrive in the shade. Wants the village to feed itself.',traits:['Observant','Outdoorsy'],hobby:'Time in the garden',favorites:['garden-bench','square','picnic-table'],rates:{fun:.8,hygiene:.8},strengths:['garden','grove','orchard','greenhouse','compost','supply-0','supply-1'],effect:'Gets dirty more slowly and needs recreation less often.'},
 bento:{role:'Carpenter & practical problem-solver',bio:'Would rather repair a wobbly chair than replace it. Dreams of building comfortable homes with his own hands.',traits:['Patient','Hands-on'],hobby:'Quiet reading',favorites:['reading-room','hammock','garden-bench'],rates:{social:.75,fun:.9},strengths:['shelter','shed','house','workshop','warehouse','bridge'],effect:'Comfortable with longer stretches of quiet work.'},
 luz:{role:'Cook & community host',bio:'Turns whatever is in the pantry into a meal worth sharing. Sees a good gathering place as the heart of the village.',traits:['Sociable','Playful'],hobby:'Gathering with friends',favorites:['community-hall','fire-circle','picnic-table','square'],rates:{social:1.3,fun:1.15},strengths:['gathering','kitchen','community-hall','picnic-table'],effect:'Seeks conversation and recreation more often.'},
 caua:{role:'Water & energy tinkerer',bio:'Likes tracing a problem back to its source. Wants to hear the river and know the village is running on clean energy.',traits:['Independent','Curious'],hobby:'Outdoor exercise',favorites:['exercise-garden','volleyball-court','outdoor-classroom'],rates:{social:.85,hunger:1.1},strengths:['water','well','hydro','solar_farm','streetlight','rain-barrel'],effect:'Needs less social time, but gets hungry a little faster.'},
 nina:{role:'Ecological builder & organizer',bio:'Thinks about where everything goes after we use it. Wants a healthy village where useful things never become waste.',traits:['Meticulous','Bookish'],hobby:'Reading and learning',favorites:['reading-room','outdoor-classroom','garden-bench'],rates:{hygiene:1.2,fun:.9},strengths:['toilet','eco_toilet','banana_treatment','wetland','biodigester'],effect:'Notices the need to wash sooner and enjoys quiet leisure.'},
};
export const profileFor=r=>PROFILES[r.id]||PROFILES.iara;
export function workMultiplier(r,key){return (profileFor(r).strengths.includes(key)?1.25:1)*(1+Math.min(.15,Math.max(0,r.work||0)/10000));}
export function recordConversation(a,b){
 for(const [resident,friend] of [[a,b],[b,a]]){
  resident.friendships??={};
  resident.friendships[friend.id]=Math.min(100,(resident.friendships[friend.id]||0)+8);
 }
}
export function friendshipLabel(score){return score>=64?'Close friends':score>=24?'Growing closer':'Getting to know each other';}
