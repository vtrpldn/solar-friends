import { catalog } from '../artwork/catalog.js?v=night-1';
// Explicit preview URLs are the only place browser-local art proposals apply.
export function readArtDraft(id, storage = localStorage) {
  const draft = JSON.parse(storage.getItem('solar-friends-art-draft-v1') || 'null');
  const sprite = catalog.find(s => s.id === id);
  if (!sprite || !draft || draft.version !== 1 || draft.asset !== id) throw new Error('This artwork draft is unavailable. Reopen it from the studio.');
  if (draft.candidate && (typeof draft.candidate !== 'string' || !draft.candidate.startsWith('data:image/png;base64,') || draft.candidate.length > 11_000_000)) throw new Error('Invalid candidate PNG.');
  if (draft.config) {
    const {width,anchor,axes} = draft.config;
    if (!sprite.building || !Number.isFinite(width) || width < 8 || width > 400 || !Number.isFinite(anchor) || anchor < 0 || anchor > 1 || (axes && (!Array.isArray(axes) || axes.length !== 2 || !axes.every(Number.isFinite) || axes[0] < .1 || axes[0] > 2 || axes[1] < -2 || axes[1] > -.1))) throw new Error('Invalid calibration proposal.');
  }
  return { ...draft, sprite };
}
