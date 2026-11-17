// Conversation participants alternate speaking and listening as their visit progresses.
// Supportive conversations do not use the lighthearted laughter variation.
export function conversationMotion(r) {
 const task=r.needTask;
 if(task?.kind!=='social')return null;
 if(!task.elapsed)return 'look';
 if(task.elapsed<1.6)return 'wave';
 const turn=Math.floor((task.elapsed-1.6)/3.5)%2;
 const speaking=(r.id<task.partner?0:1)===turn;
 if(!speaking)return 'listen';
 return task.conversation?.kind==='interest' && task.elapsed>=12 && task.elapsed<14 ? 'laugh' : 'chat';
}
