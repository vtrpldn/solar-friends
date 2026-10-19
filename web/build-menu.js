import {economyImage,economyArt,drawEconomySprite} from './economy-art.js';
import {sourceMaterial,sourceKinds} from './resource-sites.js';
import { buildingArt, drawBuildingArt } from './building-art.js';

const groups = [
  {id:'land',name:'Land & materials',kinds:sourceKinds},
  { id: 'village', name: 'Village', kinds: ['home', 'road', 'well', 'warehouse', 'square'] },
  { id: 'food', name: 'Food & growing', kinds: ['garden', 'greenhouse', 'kitchen', 'grove', 'orchard', 'coop', 'goat_pasture', 'apiary'] },
  { id: 'craft', name: 'Craft & reuse', kinds: ['workshop', 'compost'] },
  { id:'circular', name:'Water & waste', kinds:['eco_toilet','wetland','banana_treatment','biodigester'] },
  { id: 'power', name: 'Power', kinds: ['solar_farm', 'hydro', 'streetlight'] },
];

// Icons use the same corrected artwork as the map. Fit painted bounds, rather
// than transparent source cells, into a common thumbnail frame and baseline.
export function paintIcon(canvas, kind, image, art = buildingArt[kind]) {
  const source = document.createElement('canvas');
  source.width = source.height = 320;
  const ctx = source.getContext('2d');
  if(kind.startsWith('source_'))drawEconomySprite(ctx,economyImage,economyArt[sourceMaterial(kind)],160,260,1.6);
  else if (kind === 'road') {
    ctx.fillStyle = '#c29b6c';
    ctx.strokeStyle = '#ab8456';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(160, 170); ctx.lineTo(216, 198);
    ctx.lineTo(160, 226); ctx.lineTo(104, 198);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#dcc098';
    ctx.beginPath(); ctx.moveTo(109, 198); ctx.lineTo(160, 173); ctx.lineTo(211, 198); ctx.stroke();
  } else drawBuildingArt(ctx, image, art, 160, 220);
  const pixels = ctx.getImageData(0, 0, 320, 320).data;
  let left = 320, top = 320, right = 0, bottom = 0;
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    if (pixels[(y * 320 + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return;
  const w = right - left + 1, h = bottom - top + 1;
  const scale = Math.min(80 / w, 58 / h);
  canvas.width = 216; canvas.height = 136;
  const target = canvas.getContext('2d'); target.scale(2, 2);
  target.drawImage(source, left, top, w, h, (108 - w * scale) / 2, 63 - h * scale, w * scale, h * scale);
}

export function installBuildMenu(kinds, images, onGroupChange) {
  const filters = document.getElementById('build-categories');
  const tools = document.getElementById('tools');
  for (const group of groups) {
    const filter = document.createElement('button');
    filter.textContent = group.name; filter.dataset.buildGroup = group.id;
    filter.setAttribute('aria-controls', 'tools');
    filter.onclick = () => { onGroupChange(); showGroup(group.id); };
    filters.append(filter);
    for (const kind of group.kinds) {
      const [name, description] = kinds[kind];
      const button = document.createElement('button');
      button.className = 'build-tool'; button.dataset.kind = kind;
      button.dataset.group = group.id; button.title = description;
      button.setAttribute('aria-label', `Plan ${name}, free blueprint`);
      button.setAttribute('aria-pressed', 'false');
      const canvas = document.createElement('canvas');
      canvas.className = 'tool-art'; canvas.setAttribute('aria-hidden', 'true');
      const label = document.createElement('b'); label.textContent = name;
      const price = document.createElement('small'); price.textContent = kind==='road' ? 'Free' : 'Free blueprint';
      button.append(canvas, label, price); tools.append(button);
      paintIcon(canvas, kind, images[kind]);
    }
  }
  function showGroup(id) {
    document.getElementById('home-method-control').hidden=id!=='village';
    for (const button of filters.children) button.setAttribute('aria-pressed', String(button.dataset.buildGroup === id));
    for (const button of tools.children) button.hidden = button.dataset.group !== id;
  }
  showGroup('village');
  return { reveal(kind) { showGroup(groups.find(group => group.kinds.includes(kind)).id); } };
}
