// Immutable WASM builds keep an in-flight page's JS/WASM pair together.
import {spawn} from 'node:child_process';
import {watch} from 'node:fs';
import {mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const env={...process.env,PATH:`${homedir()}/.cargo/bin:${process.env.PATH}`};
const buildRoot=path.join(root,'target/dev-web');
const clients=new Set();let current,building=false,pending=false,timer,child,revision=0,queuedRust=false,lastFingerprint;
const send=value=>{for(const res of clients)res.write(`data: ${JSON.stringify(value)}\n\n`);};
function run(command,args){return new Promise((resolve,reject)=>{child=spawn(command,args,{cwd:root,env,stdio:'inherit'});child.once('error',reject);child.once('close',code=>{child=null;code===0?resolve():reject(new Error(`${command} exited ${code}`));});});}
async function fingerprint(){
 const hash=createHash('sha256');
 async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(file.endsWith('.rs'))hash.update(file).update(await readFile(file));}}
 await visit('src');for(const file of ['Cargo.toml','Cargo.lock'])hash.update(await readFile(file));return hash.digest('hex');
}
async function build(){
 if(building){pending=true;return;}
 building=true;const identity=await fingerprint();
 if(identity===lastFingerprint){building=false;return;}
 const started=performance.now(),id=randomUUID(),out=path.join(buildRoot,id);
 send({status:'building'});
 try{
  await run('cargo',['build','--locked','--profile','iteration','--target','wasm32-unknown-unknown']);
  await mkdir(out,{recursive:true});
  await run('wasm-bindgen',['--target','web','--out-dir',out,'target/wasm32-unknown-unknown/iteration/solar_friends.wasm']);
  current=id;revision++;lastFingerprint=identity;
  console.log(`Ready ${revision}: ${((performance.now()-started)/1000).toFixed(2)}s`);
  send({status:'ready',revision:id});
 }catch(error){console.error(error.message);send({status:'error',message:error.message});await rm(out,{recursive:true,force:true});}
 finally{building=false;if(pending){pending=false;await build();}}
}
const watchers=[];
function schedule(rust){queuedRust ||= rust;clearTimeout(timer);timer=setTimeout(()=>{const compile=queuedRust;queuedRust=false;if(compile)build();else if(building)pending=true;else send({status:'ready',revision:current,asset:Date.now()});},150);}
for(const dir of ['src','web'])watchers.push(watch(dir,{recursive:true},(_,file)=>{
 if(!file||/^(pkg|dev-report)\//.test(file)||! /\.(rs|js|css|html|png|json|svg)$/.test(file))return;
 schedule(dir==='src');
}));
for(const file of ['Cargo.toml','Cargo.lock'])watchers.push(watch(file,()=>schedule(true)));
await build();
if(!current)process.exit(1);
const client=await readFile('scripts/dev-reload.js','utf8');
const server=await serve(Number(process.env.PORT||4173),{handle:async(req,res,pathname)=>{
 if(pathname==='/__dev/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({status:'connected',revision:current})}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return true;
 }
 if(pathname==='/__dev/client.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(client);return true;}
 if(pathname.startsWith('/pkg/')){res.writeHead(307,{Location:`/__dev/build/${current}/${path.basename(pathname)}`,'Cache-Control':'no-store'}).end();return true;}
 const match=pathname.match(/^\/__dev\/build\/([0-9a-f-]{36})\/(solar_friends(?:_bg\.wasm|\.js))$/);
 if(match){const bytes=await readFile(path.join(buildRoot,match[1],match[2]));res.writeHead(200,{'Content-Type':match[2].endsWith('.wasm')?'application/wasm':'text/javascript','Cache-Control':'no-store'}).end(bytes);return true;}
 return false;
},html:body=>body.replace('</body>','<script type="module" src="/__dev/client.js"></script></body>')});
console.log(`Live game: http://127.0.0.1:${server.address().port} (Rust + artwork + UI watch)`);
function stop(){clearTimeout(timer);for(const w of watchers)w.close();child?.kill('SIGTERM');for(const res of clients)res.end();server.close(()=>process.exit(0));}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
