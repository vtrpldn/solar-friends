import {tick} from './simulation.js';
import {DAY} from './weather.js';

// Use precisely the same fixed step as simulationFrame; larger steps alter
// scheduling, resource consumption and the ordering of resident decisions.
export async function skipDays(state, days, {
  progress = () => {}, cancelled = () => false,
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  now = () => performance.now(),
} = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new RangeError('Choose 1–365 whole days.');
  if (state.stage === 'arrival' || state.arrivalAnimating) throw new Error('Finish arriving first.');
  const total = Math.round(days * DAY / .1);
  let steps = 0;
  progress(0);
  await yieldControl();
  while (steps < total && !cancelled()) {
    const started = now();
    do {
      tick(state, .1);
      steps++;
    } while (steps < total && now() - started < 12);
    progress(steps / total);
    await yieldControl();
  }
  return {steps, completed: steps === total};
}
