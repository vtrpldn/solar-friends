// Loaded only by the development server.
const events=new EventSource('/__dev/events');let connected=false;
events.onmessage=event=>{
 const update=JSON.parse(event.data);
 // A reconnect means the server restarted: pick up whatever changed meanwhile.
 if(update.status==='connected'){if(connected)location.reload();connected=true;}
 if(update.status==='ready')location.reload();
 if(update.status==='styles')restyle();
};
function restyle(){
 // Swap each stylesheet for a fresh copy; remove the old one only once the new one has loaded.
 for(const link of [...document.querySelectorAll('link[rel="stylesheet"]')]){
  if(link.dataset.devStale)continue;
  const url=new URL(link.href);if(url.origin!==location.origin)continue;
  url.searchParams.set('dev',Date.now());
  const fresh=link.cloneNode();fresh.href=url;link.dataset.devStale='1';
  fresh.onload=fresh.onerror=()=>link.remove();link.after(fresh);
 }
}
