// Shared URL rewriting for packaged deployment and the live source server.
export function rewriteSiteText(text, relativePath) {
  if (!relativePath.startsWith('v2/') || relativePath.includes('/vendor/')) return text;
  text = text.replaceAll('/v02/weekend/', '/v2/').replaceAll('/v02/', '/v2/');
  if (!relativePath.slice(3).includes('/'))
    text = text.replace(/\.\.\/(library|residents|workshop|land)\//g, './$1/');
  return text.replaceAll('../weekend/', '../').replaceAll('../../fonts/', '/fonts/');
}
export function localSiteRoute(pathname) {
  if (pathname === '/') return {redirect:'/v2/menu.html'};
  if (pathname === '/v2') return {redirect:'/v2/'};
  // The first version of the game was retired; old links land on the current one.
  if (/^\/v(1|0\.1)(\/|$)/.test(pathname)) return {redirect:'/v2/'};
  for (const [oldPath, newPath] of [['/v02/weekend','/v2'], ['/v2/weekend','/v2'], ['/weekend','/v2'], ['/v0.2','/v2'], ['/v02','/v2']]) {
    if (pathname === oldPath || pathname.startsWith(oldPath+'/'))
      return {redirect:newPath+pathname.slice(oldPath.length)+(pathname===oldPath?'/':'')};
  }
  if (pathname.startsWith('/v2/')) {
    const rest = pathname.slice(4);
    const asset = /^(library|residents|workshop|land)\//.test(rest) || /^navigation\.(js|css)$/.test(rest);
    return {source:'/v02/'+(asset?'':'weekend/')+rest, relative:pathname.slice(1)};
  }
  // Shared files outside the game folder, such as /fonts/.
  return {source:pathname, relative:pathname.slice(1)};
}
