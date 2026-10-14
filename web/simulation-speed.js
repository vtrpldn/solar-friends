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
