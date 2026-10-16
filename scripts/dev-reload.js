// Loaded only by the iteration server. A failed build leaves the game running.
const events=new EventSource('/__dev/events');let revision;
events.onmessage=event=>{
 const update=JSON.parse(event.data);
 if(update.status==='connected'){if(revision&&revision!==update.revision)reload();revision=update.revision;}
 if(update.status==='error')console.error('Rebuild failed. Game kept running:',update.message);
 if(update.status==='ready')reload();
};
let pending=false;
window.addEventListener('solar:dev-ready',()=>{if(pending)reload();});
function reload(){
 if(!window.solarDevReloadReady&&document.querySelector('#world')){pending=true;return;}
 pending=false;
 const event=new Event('solar:dev-reload',{cancelable:true});
 // The game cancels reload if it cannot preserve the current checkpoint.
 if(window.dispatchEvent(event))location.reload();
}
