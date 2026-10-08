import { occupies } from './building-footprints.js';
import { MAP_SIZE, riverBank } from './terrain.js';

export function placementReason(village, kind, x, y, cost) {
  if (x < 1 || x > MAP_SIZE - 2 || y < 1 || y > MAP_SIZE - 2) return 'Choose a clearing inside the village.';
  if (kind === 'road') {
    if (riverBank(x, y)) return 'Keep the riverbank clear.';
    if (village.roads.some(([rx, ry]) => rx === x && ry === y)) return '';
    return village.buildings.some(b => occupies(b,x,y)) ? 'A building occupies this spot.' : '';
  }
  const radius = ['square','solar_farm'].includes(kind) ? 2 : 1;
  if (x - radius < 0 || y - radius < 0 || x + radius >= MAP_SIZE || y + radius >= MAP_SIZE || riverBank(x + radius - 1, y)) return 'Keep the riverbank clear. Move farther inland.';
  if (Math.abs(x - 10) < radius + 0.5 && Math.abs(y - 13) < radius + 0.5) return 'Leave the arrival clearing open for everyone.';
  if (village.buildings.some(b => Math.abs(b.x - x) < radius + (['square','solar_farm'].includes(b.kind) ? 2 : 1) && Math.abs(b.y - y) < radius + (['square','solar_farm'].includes(b.kind) ? 2 : 1))) return 'Leave a little room between buildings.';
  if (village.roads.some(([rx,ry])=>occupies({kind,x,y},rx,ry))) return 'Keep roads clear. Choose a plot beside the road.';
  if (village.wood < cost) return `Need ${Math.ceil(cost - village.wood)} more timber. Ask a neighbour to gather.`;
  return '';
}

export function milestones(before, after) {
  if (!before) return [];
  const messages = [];
  for (const b of after.buildings) {
    if (b.progress >= 100 && before.buildings.some(old => old.id === b.id && old.progress < 100)) messages.push({ kind: 'building', building: b.kind, x: b.x, y: b.y });
  }
  if (after.harvests > before.harvests) messages.push({ kind: 'harvest' });
  after.progress.completed.forEach((done, i) => {
    if (done && !before.progress.completed[i]) messages.push({ kind: 'quest', quest: i });
  });
  if (after.progress.friendships.some((value, i) => value > 0 && !before.progress.friendships[i])) messages.push({ kind: 'friendship' });
  return messages;
}
