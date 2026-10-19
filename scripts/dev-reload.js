// Loaded only by the iteration server. A failed build leaves the game running.
const events=new EventSource('/__dev/events');let revision;
events.onmessage=event=>{
 const update=JSON.parse(event.data);
 if(update.status==='connected'){if(revision&&revision!==update.revision)reload();revision=update.revision;}
 if(update.status==='error')console.error('Rebuild failed. Game kept running:',update.message);
 if(update.status==='ready')reload();
};
function reload(){
 // During boot, keep the checkpoint from the last working page untouched.
 // This also lets a fixed JS syntax error recover without a working Game API.
 if(!window.solarDevReloadReady){location.reload();return;}
 const event=new Event('solar:dev-reload',{cancelable:true});
 if(window.dispatchEvent(event))location.reload();
}
