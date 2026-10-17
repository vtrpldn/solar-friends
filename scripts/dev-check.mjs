import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const output = path.join(root,'artifacts/dev-check');
const results = [], screenshots = [], errors = [];
let server, browser;
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await mkdir(output,{recursive:true});
const startedAt = new Date().toISOString();
const env = {...process.env,PATH:`${homedir()}/.cargo/bin:${process.env.PATH}`};
async function command(label, executable, args) {
  console.log(`→ ${label}`);
  const started=Date.now();let log='';
  const code=await new Promise((resolve,reject)=>{
    const timeout=label==='verify-economy.mjs'?3_600_000:['verify-housing-balance.mjs','verify-seasonal-balance.mjs','verify-utility-balance.mjs'].includes(label)?1_800_000:600_000;
    const child=spawn(executable,args,{env,cwd:root,stdio:['ignore','pipe','pipe'],timeout});
    const append=data=>{log+=data;process.stdout.write(data);};
    child.stdout.on('data',append);child.stderr.on('data',append);
    child.on('error',reject);child.on('close',(exitCode,signal)=>{if(signal)append(`\nStopped by ${signal}; command limit ${timeout/1000} seconds.\n`);resolve(exitCode);});
  });
  const filename=`check-${results.length+1}.txt`;await writeFile(path.join(output,filename),log);
  results.push({label,status:code===0?'PASS':'FAIL',seconds:(Date.now()-started)/1000,log:filename});
  if(code!==0)throw new Error(`${label} failed (exit ${code}).`);
}
async function jsFiles(dir) {
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(['pkg','dev-report'].includes(entry.name))continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await jsFiles(file));else if(/\.(mjs|js)$/.test(entry.name))files.push(file);
  }
  return files;
}
try {
  if(!process.argv.includes('--browser-only')) {
    await command('Rust formatting','cargo',['fmt','--check']);
    await command('Rust behavior','cargo',['test','--locked']);
    await command('Rust lint','cargo',['clippy','--locked','--all-targets','--','-D','warnings']);
    await command('Build WebAssembly','bash',['scripts/build.sh']);
    for(const file of [...await jsFiles('web'), ...await jsFiles('scripts')]) await command(`Syntax: ${file}`,process.execPath,['--check',file]);
    for(const file of (await readdir('scripts')).filter(s=>/^verify-.*\.mjs$/.test(s)).sort()) await command(file,process.execPath,[`scripts/${file}`]);
  }
  const { chromium } = await import('playwright');
  const { checkBrowser } = await import('./browser-checks.mjs');
  server=await serve(); const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
  let browserDeadline;
  try {
    await Promise.race([
      checkBrowser({browser,base,output,screenshots,errors}),
      new Promise((_,reject)=>{browserDeadline=setTimeout(()=>reject(new Error('Desktop browser checks exceeded twenty minutes. Inspect the last capture and browser errors.')),1200000);}),
    ]);
  } finally { clearTimeout(browserDeadline); }
  results.push({label:'Desktop interactions, save isolation, artwork tools and captures',status:'PASS'});
} catch(error) {
  console.error(error);
  results.push({label:error.message,status:'FAIL'});process.exitCode=1;
} finally {
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  const sources = [...await jsFiles('web'), ...await jsFiles('scripts'), ...(await readdir('src')).filter(f=>f.endsWith('.rs')).map(f=>`src/${f}`), 'Cargo.lock','rust-toolchain.toml'];
  const identity=createHash('sha256');
  for(const file of sources.sort())identity.update(file).update(await readFile(file));
  try{identity.update(await readFile('web/pkg/solar_friends_bg.wasm'));}catch{}
  const report={startedAt,finishedAt:new Date().toISOString(),sourceAndBuildHash:identity.digest('hex'),scope:process.argv.includes('--browser-only')?'Browser only':'Full development check',results,screenshots,errors};
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Solar Friends · Development check</title><style>body{max-width:1100px;margin:50px auto;padding:0 24px;background:#f5f0e4;color:#294033;font:15px 'Trebuchet MS',sans-serif}h1{font:40px Georgia}li{margin:12px 0}a{color:#345b48}img{width:100%;border:1px solid #b4bba5}code{overflow-wrap:anywhere}pre{white-space:pre-wrap}</style><h1>Development check</h1><p>${esc(report.scope)} · ${esc(startedAt)}</p><p>Source and build fingerprint: <code>${report.sourceAndBuildHash}</code></p><ul>${results.map(r=>`<li><b>${r.status}</b> · ${esc(r.label)} ${r.log?`<a href="${r.log}">Log</a>`:''}</li>`).join('')}</ul><h2>Browser errors</h2><pre>${esc(errors.join('\n')||'None observed.')}</pre>${screenshots.map(s=>`<h2>${esc(s.label)}</h2><a href="${s.file}"><img src="${s.file}" alt="${esc(s.label)}"></a>`).join('')}<p><a href="report.json">Machine-readable report</a></p></html>`;
  await writeFile(path.join(output,'index.html'),html);
  await rm('web/dev-report',{recursive:true,force:true});
  await cp(output,'web/dev-report',{recursive:true});
  console.log(`Report: ${path.join(output,'index.html')}`);
}
