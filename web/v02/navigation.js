const modes = [
  ['library', 'Collection', '/v02/library/', 'Browse every model'],
  ['workshop', '3D inspector', '/v02/workshop/', 'Orbit a model and inspect its sprite proof'],
  ['land', 'Scene editor', '/v02/land/', 'Place, move and rotate props'],
  ['biomes', 'Biome landscapes', '/v02/land/?biome=mata-atlantica', 'Explore elevated Brazilian terrain'],
  ['residents', 'Resident animations', '/v02/residents/', 'Compare residents and motion'],
];
const current = location.pathname.includes('/land/') && new URLSearchParams(location.search).has('biome')
  ? 'biomes' : location.pathname.split('/')[2];
document.body.dataset.artView = current;
const nav = document.createElement('nav');
nav.className = 'art-navigation';
nav.setAttribute('aria-label', 'Art preview views');
const brand = document.createElement('span');
brand.className = 'art-navigation-brand';brand.textContent = 'SF · ART PREVIEW';nav.append(brand);
for (const [id, label, url, hint] of modes) {
  const link = document.createElement('a');
  link.href = url;link.textContent = label;link.title = hint;
  if (id === current) {
    link.setAttribute('aria-current', 'page');
    link.addEventListener('click', event => event.preventDefault());
  }
  if (id === 'workshop') {
    try { const asset = sessionStorage.getItem('sf-art-last-asset');
      if(asset) link.href = `/v02/workshop/?asset=${encodeURIComponent(asset)}`;
    } catch { /* Browsing still works when session storage is unavailable. */ }
  }
  nav.append(link);
}
document.body.prepend(nav);
