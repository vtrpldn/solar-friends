// Same 0.1-second simulation steps as the 3D game. Yield between work slices.
export class LabRunner {
  constructor(state, tick) { this.state=state; this.tick=tick; this.speed=128; this.paused=true; this.debt=0; }
  advance(elapsed, budget=8, clock=()=>performance.now()) {
    if(this.paused) { this.debt=0; return 0; }
    // Do not invent elapsed game time after a suspended computer wakes up.
    this.debt=Math.min(this.debt+Math.min(elapsed,.25)*this.speed,this.speed*2);
    const start=clock();let steps=0;
    while(this.debt>=.1 && clock()-start<budget) { this.tick(this.state,.1);this.debt-=.1;steps++; }
    return steps*.1;
  }
}
