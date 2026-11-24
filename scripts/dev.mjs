// Live development server: reloads the page when game files change and swaps
// edited stylesheets into the running page without a reload.
import {watch} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const clients=new Set();let timer,stylesOnly=true;
const send=value=>{for(const res of clients)res.write(`data: ${JSON.stringify(value)}\n\n`);};
function schedule(style){stylesOnly &&= style;clearTimeout(timer);timer=setTimeout(()=>{send({status:stylesOnly?'styles':'ready'});stylesOnly=true;},40);}
const watcher=watch('web',{recursive:true},(_,file)=>{
 if(!file||file.startsWith('dev-report/')||!/\.(js|css|html|png|json|svg)$/.test(file))return;
 schedule(file.endsWith('.css'));
});
const client=await readFile('scripts/dev-reload.js','utf8');
const server=await serve(Number(process.env.PORT||4173),{handle:async(req,res,pathname)=>{
 if(pathname==='/__dev/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({status:'connected'})}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return true;
 }
 if(pathname==='/__dev/client.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(client);return true;}
 return false;
},html:body=>body.replace('</body>','<script type="module" src="/__dev/client.js"></script></body>')});
console.log(`Live game: http://127.0.0.1:${server.address().port}/v2/ (reloads on change; styles swap without a reload)`);
function stop(){clearTimeout(timer);watcher.close();for(const res of clients)res.end();server.close(()=>process.exit(0));}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
