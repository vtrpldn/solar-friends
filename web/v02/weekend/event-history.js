export function eventTime(time) {
  if (!Number.isFinite(time)) return 'Earlier';
  const minutes = 9 * 60 + Math.floor(time * .45);
  return `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}

export function recordEvent(state, text, key = null) {
  state.events ??= (state.log || []).map(text => ({text, time:null, count:1}));
  const previous = state.events[0];
  if (key && previous?.key === key && eventTime(previous.time).split(' · ')[0] === eventTime(state.time).split(' · ')[0]) {
    previous.text = text;
    previous.time = state.time;
    previous.count++;
  } else state.events.unshift({text, time:state.time, count:1, key});
  state.events = state.events.slice(0,48);
}

export function eventHistory(state) {
  return state.events || (state.log || []).map(text => ({text,time:null,count:1}));
}
