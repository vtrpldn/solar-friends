// Keep the player's chosen speed while automatically skipping unavailable hours.
export const simulationSpeed = (game, preferred) => game.fast_forward_ready() ? 16 : preferred;
export function advanceSimulation(game, realSeconds, preferred) {
  let remaining = realSeconds, elapsed = 0;
  while (remaining > 1e-9) {
    const speed = simulationSpeed(game, preferred);
    const step = Math.min(remaining * speed, .1);
    game.tick(step);
    elapsed += step;
    remaining -= step / speed;
  }
  return elapsed;
}

// The interactive loop must yield even when the requested speed exceeds the
// machine's capacity. Retain a short catch-up window, never an ever-growing
// backlog after a slow tick, debugger stop or OS scheduling interruption.
// Offline verification continues to use advanceSimulation without a budget.
export function createSimulationClock({now=()=>performance.now(),budgetMs=8,maxPendingSeconds=.25}={}){
  if(typeof now!=='function'||!Number.isFinite(budgetMs)||budgetMs<=0||!Number.isFinite(maxPendingSeconds)||maxPendingSeconds<=0)throw Error('Choose a positive simulation frame budget.');
  let pending=0,dropped=0;
  return Object.freeze({
    advance(game,realSeconds,preferred){
      if(!Number.isFinite(realSeconds)||realSeconds<0||![1,2,4,8,16].includes(preferred))throw Error('Choose valid elapsed time and simulation speed.');
      const incoming=pending+realSeconds;pending=Math.min(incoming,maxPendingSeconds);dropped+=incoming-pending;
      const began=now();let elapsed=0;
      while(pending>1e-9){const speed=simulationSpeed(game,preferred),step=Math.min(pending*speed,.1);game.tick(step);elapsed+=step;pending=Math.max(0,pending-step/speed);if(now()-began>=budgetMs)break;}
      return elapsed;
    },
    reset(){pending=0;},
    status:()=>({pendingSeconds:pending,droppedSeconds:dropped,budgetMs,maxPendingSeconds}),
  });
}
