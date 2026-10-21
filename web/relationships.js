export function relationshipStrength(friendships,from,to){return friendships?.[from]?.[to]??0;}
export function newFriendships(before,after){
 return Object.entries(after??{}).some(([from,row])=>Object.entries(row).some(([to,value])=>value>0&&!relationshipStrength(before,from,to)));
}
