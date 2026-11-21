import {tick} from './simulation.js';
import {DAY} from './weather.js';

const resolveYield = () => {};

function createYielder() {
  if (globalThis.scheduler?.postTask) {
    return {yieldControl: () => scheduler.postTask(resolveYield, {priority: 'user-visible'})};
  }
  // Timer nesting clamps setTimeout in browsers, leaving gaps between batches.
  const channel = new MessageChannel();
  return {
    yieldControl: () => new Promise(resolve => {
      channel.port1.onmessage = resolve;
      channel.port2.postMessage(null);
    }),
    close: () => {
      channel.port1.close();
      channel.port2.close();
    },
  };
}

// Use precisely the same fixed step as simulationFrame; larger steps alter
// scheduling, resource consumption and the ordering of resident decisions.
export async function skipDays(state, days, {
  progress = () => {}, cancelled = () => false,
  yieldControl,
  now = () => performance.now(),
} = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new RangeError('Choose 1–365 whole days.');
  if (state.stage === 'arrival' || state.arrivalAnimating) throw new Error('Finish arriving first.');
  const total = Math.round(days * DAY / .1);
  let steps = 0;
  const yielder = yieldControl ? {yieldControl} : createYielder();
  try {
    progress(0);
    while (steps < total) {
      await yielder.yieldControl();
      if (cancelled()) break;
      const started = now();
      do {
        tick(state, .1);
        steps++;
      } while (steps < total && now() - started < 12);
      progress(steps / total);
    }
    return {steps, completed: steps === total};
  } finally {
    yielder.close?.();
  }
}
