// Run from the repository root. Preserve valid checks after correcting the
// utility verifier's food definition; never reuse evidence after a game change.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,copyFile,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {serve} from '../../scripts/serve.mjs';

const root=process.cwd(),output=path.join(root,'artifacts/dev-check');
const archive=path.join(root,'artifacts/story-food-measurement-baseline');
const baseline='ccb0486',changed='scripts/verify-utility-balance.mjs';
const wasmSha='de542a74d0189688063e6c8cb6b4a71430755bc75dbe307fa9f7f17a9586df52';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function jsFiles(dir){
 const files=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(['pkg','dev-report'].includes(e.name))continue;
  const file=path.join(dir,e.name);
  if(e.isDirectory())files.push(...await jsFiles(file));else if(/\.(mjs|js)$/.test(e.name))files.push(file);
 }
 return files;
}
assert.equal(sha(await readFile('web/pkg/solar_friends_bg.wasm')),wasmSha);
const delta=execFileSync('git',['diff','--name-only',baseline,'--','src','web','scripts','Cargo.toml','Cargo.lock','rust-toolchain.toml'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.deepEqual(delta,[changed],'A changed game requires new game evidence');
const prior=JSON.parse(await readFile(path.join(output,'report.json'),'utf8'));
assert.equal(prior.scope,'Full development check');
assert.deepEqual(prior.results.filter(r=>r.status==='FAIL').map(r=>r.label),[changed.split('/').at(-1),'verify-utility-balance.mjs failed (exit 1).']);
const scripts=[...await jsFiles('web'),...await jsFiles('scripts')];
const identityFiles=[...scripts,...(await readdir('src')).filter(f=>f.endsWith('.rs')).map(f=>'src/'+f),'Cargo.lock','rust-toolchain.toml'].sort();
const oldHash=createHash('sha256');
for(const file of identityFiles)oldHash.update(file).update(file===changed?execFileSync('git',['show',baseline+':'+file]):await readFile(file));
oldHash.update(await readFile('web/pkg/solar_friends_bg.wasm'));
assert.equal(oldHash.digest('hex'),prior.sourceAndBuildHash,'Confirm the exact source of the carried evidence');
await mkdir(archive,{recursive:true});
await writeFile(path.join(archive,'report.json'),JSON.stringify(prior,null,2));
await copyFile('/private/tmp/solar-story-final-check.txt',path.join(archive,'runner.txt'));
await copyFile('artifacts/utility-balance/report.json',path.join(archive,'utility-report.json'));
await copyFile(path.join(output,prior.results.find(r=>r.label==='verify-utility-balance.mjs').log),path.join(archive,'failure.txt'));

const native=prior.results.filter(r=>!r.label.startsWith('Syntax:')&&!r.label.startsWith('verify-'));
assert.equal(native.length,4);assert(native.every(r=>r.status==='PASS'));
const carried=prior.results.filter(r=>r.label.startsWith('verify-')&&r.status==='PASS');
assert.equal(carried.length,61);
const results=[...native],screenshots=[],errors=[];
const env={...process.env,PATH:`${homedir()}/.cargo/bin:${process.env.PATH}`};
let server,browser;
async function command(label,executable,args,overrides={}){
 console.log('→ '+label);const start=Date.now();let log='';
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd:root,env:{...env,...overrides},timeout:label==='verify-utility-balance.mjs'?1800000:600000,stdio:['ignore','pipe','pipe']});
  const append=data=>{log+=data;process.stdout.write(data);};child.stdout.on('data',append);child.stderr.on('data',append);
  child.on('error',reject);child.on('close',resolve);
 });
 const file=`continuation-${results.length+1}.txt`;await writeFile(path.join(output,file),log);
 results.push({label,status:code===0?'PASS':'FAIL',seconds:(Date.now()-start)/1000,log:file});
 assert.equal(code,0,label+' must finish successfully');
}
const continuation={resumedAt:new Date().toISOString(),baselineCommit:baseline,engineWasmSha256:wasmSha,priorSourceAndBuildHash:prior.sourceAndBuildHash,priorFailure:'Utility reserve measurement excluded directly edible milk and honey. The reproduced moment held four milk and nine honey, and a real meal request claimed milk.',priorReport:'artifacts/story-food-measurement-baseline/report.json',changedSources:delta,carriedNativeChecks:4,carriedPublicChecks:61,repeated:'Every script syntax check, both 24-day utility cases from exact earned installation checkpoints, remaining public verifiers and the complete desktop suite'};
try{
 for(const file of scripts)await command('Syntax: '+file,process.execPath,['--check',file]);
 results.push(...carried);
 const pending=(await readdir('scripts')).filter(f=>/^verify-.*\.mjs$/.test(f)).sort().filter(f=>!carried.some(r=>r.label===f));
 assert.equal(pending[0],'verify-utility-balance.mjs');assert.equal(pending.length,6);
 for(const file of pending)await command(file,process.execPath,['scripts/'+file],file==='verify-utility-balance.mjs'?{SOLAR_UTILITY_REPLAY:'1'}:{});
 const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
 const {checkBrowser}=await import('../../scripts/browser-checks.mjs');
 server=await serve();browser=await chromium.launch({headless:true});let timer;
 try{await Promise.race([checkBrowser({browser,base:`http://127.0.0.1:${server.address().port}`,output,screenshots,errors}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Desktop checks exceeded twenty minutes')),1200000);})]);}finally{clearTimeout(timer);}
 results.push({label:'Desktop interactions, save isolation, artwork tools and captures',status:'PASS'});
 assert.deepEqual(errors,[]);
}catch(error){console.error(error);results.push({label:error.message,status:'FAIL'});process.exitCode=1;}
finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
 const identity=createHash('sha256');for(const file of identityFiles)identity.update(file).update(await readFile(file));identity.update(await readFile('web/pkg/solar_friends_bg.wasm'));
 const report={startedAt:prior.startedAt,finishedAt:new Date().toISOString(),sourceAndBuildHash:identity.digest('hex'),scope:'Full development check with corrected-verifier continuation',continuation,results,screenshots,errors};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Solar Friends · Development check</title><style>body{max-width:1100px;margin:50px auto;padding:0 24px;background:#f5f0e4;color:#294033;font:15px 'Trebuchet MS',sans-serif}li{margin:12px 0}img{width:100%}pre{white-space:pre-wrap}</style><h1>Development check</h1><p>${esc(report.scope)}</p><p>Identical native engine; a stale food measurement was corrected. Both utility cases and all desktop checks were replayed. <a href="report.json">Full provenance and results</a></p><ul>${results.map(r=>`<li>${r.status} · ${esc(r.label)} ${r.log?`<a href="${r.log}">Log</a>`:''}</li>`).join('')}</ul><h2>Browser errors</h2><pre>${esc(errors.join('\n')||'None observed.')}</pre>${screenshots.map(s=>`<h2>${esc(s.label)}</h2><img src="${s.file}" alt="${esc(s.label)}">`).join('')}</html>`;
 await writeFile(path.join(output,'index.html'),html);await rm('web/dev-report',{recursive:true,force:true});await cp(output,'web/dev-report',{recursive:true});
 console.log('Report: '+path.join(output,'index.html'));
}
