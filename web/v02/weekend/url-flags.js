// Every URL flag the game reads, in one place. The page URL never changes after load, so it is
// parsed once. Preview scenes open the game without the menu (index.html redirects every other
// URL without ?mode to the menu); add a new preview to PREVIEWS and to dev-tools.js's links.
export const query = new URLSearchParams(globalThis.location?.search || '');

export const PREVIEWS = [
  'arrival-preview',   // first arrival on a fixed plot
  'wildlife-preview',  // animals around the fixed plot
  'utilities-preview', // water, power and waste in a built camp (&interactions, &lighting-hour=H, &lighting-rain)
  'needs-preview',     // residents with varied needs (built on the utilities camp)
  'downtime-preview',  // leisure when no work calls (built on the utilities camp)
  'rest-preview',      // sleep and rest
  'truck-preview',     // the supplier truck arriving, unloading and leaving
  'scale-preview',     // buildings side by side (=dream|lived|homes|new-homes|sites|farm; &look=x,z)
  'nature-preview',    // groves, deposits and natural land (=deposits|…; &land-seed=N, &nature=plain)
];
// Other flags: mode=story|sandbox, performance, load-error (menu), land-seed, look.
