// Shared URL rewriting for packaged deployment and the live source server.
export function rewriteSiteText(text, relativePath) {
  if (!relativePath.startsWith('v2/') || relativePath.includes('/vendor/')) return text;
  text = text.replaceAll('/v02/weekend/', '/v2/').replaceAll('/v02/', '/v2/');
  if (!relativePath.slice(3).includes('/'))
    text = text.replace(/\.\.\/(library|residents|workshop|land)\//g, './$1/');
  return text.replaceAll('../weekend/', '../').replaceAll('../../fonts/', '/v1/fonts/');
}
export function localSiteRoute(pathname) {
  if (pathname === '/') return {redirect:'/v2/menu.html'};
  if (['/v1','/v2'].includes(pathname)) return {redirect:pathname+'/'};
  for (const [oldPath, newPath] of [['/v02/weekend','/v2'], ['/v2/weekend','/v2'], ['/weekend','/v2'], ['/v0.2','/v2'], ['/v0.1','/v1'], ['/v02','/v2']]) {
    if (pathname === oldPath || pathname.startsWith(oldPath+'/'))
      return {redirect:newPath+pathname.slice(oldPath.length)+(pathname===oldPath?'/':'')};
  }
  if (pathname.startsWith('/v1/')) return {source:pathname.slice(3), relative:pathname.slice(1)};
  if (pathname.startsWith('/v2/')) {
    const rest = pathname.slice(4);
    const asset = /^(library|residents|workshop|land)\//.test(rest) || /^navigation\.(js|css)$/.test(rest);
    return {source:'/v02/'+(asset?'':'weekend/')+rest, relative:pathname.slice(1)};
  }
  // Retain immutable v1 artwork and legacy developer endpoints.
  return {source:pathname, relative:pathname.slice(1)};
}
