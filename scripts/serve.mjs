import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
export function serve(port = 0, options = {}) {
  const server = http.createServer(async (req,res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if(await options.handle?.(req,res,pathname))return;
      const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      let body = await readFile(file);
      if(path.extname(file)==='.html'&&options.html)body=options.html(body.toString());
      res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  return new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',()=>resolve(server)); });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await serve(Number(process.env.PORT||4173));
  console.log(`Solar Friends: http://127.0.0.1:${server.address().port}`);
}
