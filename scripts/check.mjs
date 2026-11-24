// Fast verification runner: runs verify scripts in parallel, reports every
// failure, and can limit itself to the scripts affected by the files you changed.
//
//   npm run check                 every verify-* script, in parallel
//   npm run check -- --changed    only scripts whose imports reach changed files
//   npm run check -- needs trade  only scripts whose name contains a word
//   options: --jobs N  --fail-fast  --no-browser  --syntax  --base REF  --browser-jobs N  --no-retry
//            --list  --timeout SECONDS  --no-lock
//
// Only one run works at a time on this machine: a run started from another
// worktree waits its turn instead of competing for the same cores.
import {spawn,execFileSync} from 'node:child_process';
import {rmSync} from 'node:fs';
import {mkdir,readFile,readdir,rename,writeFile,rm,stat} from 'node:fs/promises';
import {availableParallelism,tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const words=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--jobs'&&args[i-1]!=='--browser-jobs'&&args[i-1]!=='--base'&&args[i-1]!=='--timeout');
const jobs=Math.max(1,Number(option('--jobs')||process.env.CHECK_JOBS)||(availableParallelism()<=4?availableParallelism():Math.min(8,availableParallelism()-2)));
// Each browser check renders the game in software WebGL; too many at once starve each other into timeouts.
const browserJobs=Math.max(1,Number(option('--browser-jobs'))||Math.min(3,Math.ceil(jobs/2)));
const limit=(Number(option('--timeout'))||1800)*1000;
const output=path.join(root,'artifacts/check');
const timingFile=path.join(root,'artifacts/check-timings.json');

const cache=new Map();
async function facts(file){
  if(cache.has(file))return cache.get(file);
  const result={imports:[],mentions:[],browser:false};cache.set(file,result);
  let source;try{source=await readFile(file,'utf8');}catch{return result;}
  result.browser=/from\s*['"]playwright['"]|import\(\s*['"]playwright['"]\s*\)/.test(source);
  const dir=path.dirname(file);
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g))result.imports.push(path.resolve(dir,match[1]));
  // Files a script reads or serves by path rather than importing.
  for(const match of source.matchAll(/['"`]((?:\.\.\/)?(?:web|scripts|docs|assets|src)\/[^'"`$\s]+\.[a-z]+)['"`]/g)){
    const relative=match[1];result.mentions.push(relative.startsWith('../')?path.resolve(dir,relative):path.resolve(root,relative));
  }
  return result;
}
async function reach(file,seen=new Set()){
  if(seen.has(file))return seen;seen.add(file);
  const own=await facts(file);
  for(const next of own.mentions)seen.add(next);
  for(const next of own.imports)await reach(next,seen);
  return seen;
}
async function usesBrowser(file){
  for(const dependency of await reach(file))if(/\.m?js$/.test(dependency)&&(await facts(dependency)).browser)return true;
  return false;
}
function changedFiles(){
  const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
  const base=option('--base');
  const files=new Set([...git('diff','--name-only','HEAD'),...git('ls-files','--others','--exclude-standard')]);
  if(base)for(const file of git('diff','--name-only',`${base}...HEAD`))files.add(file);
  // A clean tree means the work was just committed: check that commit.
  else if(!files.size)for(const file of git('diff','--name-only','HEAD~1','HEAD'))files.add(file);
  return [...files];
}

const pattern=/^verify-.*\.mjs$/;
let scripts=(await readdir('scripts')).filter(name=>pattern.test(name)).sort();
if(words.length)scripts=scripts.filter(name=>words.some(word=>name.includes(word)));
const browser=new Map();
for(const name of scripts)browser.set(name,await usesBrowser(path.resolve('scripts',name)));
if(flag('--no-browser'))scripts=scripts.filter(name=>!browser.get(name));
if(flag('--changed')){
  const changed=changedFiles();
  const absolute=new Set(changed.map(file=>path.resolve(root,file)));
  // The browser loads the whole game, so any game file can affect a browser check.
  const gameChanged=changed.some(file=>file.startsWith('web/v02/')||file==='scripts/serve.mjs'||file==='scripts/site-routes.mjs');
  const selected=[];
  for(const name of scripts){
    const reached=await reach(path.resolve('scripts',name));
    if((browser.get(name)&&gameChanged)||[...reached].some(file=>absolute.has(file)))selected.push(name);
  }
  console.log(`${changed.length} changed file${changed.length===1?'':'s'} → ${selected.length} of ${scripts.length} checks`);
  scripts=selected;
}
// `--syntax` parses every game and tooling script (only the changed ones with --changed).
async function syntaxFiles(dir){
  const files=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['pkg','dev-report','vendor','node_modules'].includes(entry.name))continue;
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await syntaxFiles(file));else if(/\.m?js$/.test(entry.name))files.push(file);
  }
  return files;
}
async function syntax(){
  let files=[...await syntaxFiles('web'),...await syntaxFiles('scripts')];
  if(flag('--changed')){const changed=new Set(changedFiles());files=files.filter(file=>changed.has(file));}
  const begun=performance.now(),broken=[];let index=0;
  await Promise.all(Array.from({length:jobs*2},async()=>{while(index<files.length){
    const file=files[index++];
    await new Promise(resolve=>{let log='';const child=spawn(process.execPath,['--check',file],{cwd:root,stdio:['ignore','ignore','pipe']});child.stderr.on('data',data=>log+=data);child.on('close',code=>{if(code!==0)broken.push({file,log});resolve();});});
  }}));
  for(const {file,log} of broken)console.log(`\n── Syntax: ${file} ──\n${log.trimEnd()}`);
  console.log(`${broken.length?'FAIL':'PASS'} ${`${((performance.now()-begun)/1000).toFixed(1)}s`.padStart(7)}  syntax of ${files.length} scripts`);
  return broken.length;
}
if(flag('--list')){for(const name of scripts)console.log(`${browser.get(name)?'browser':'node   '} ${name}`);process.exit(0);}
const syntaxErrors=flag('--syntax')?await syntax():0;
if(syntaxErrors)process.exitCode=1;
if(!scripts.length){console.log('No checks to run.');process.exit();}

let timings={};try{timings=JSON.parse(await readFile(timingFile,'utf8'));}catch{}
// Longest first, so the slow checks never end up alone at the tail of the run.
const queue=[...scripts].sort((a,b)=>(timings[b]??(browser.get(b)?60:5))-(timings[a]??(browser.get(a)?60:5)));
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
const results=[],running=new Set();let stopping=false;

// Machine-wide turn-taking. The lock is a directory in the system temp folder
// (creating one is atomic) holding the owner's pid; a lock whose owner has died
// is taken over. --no-lock or CHECK_NO_LOCK=1 skips it, e.g. on CI runners.
const lockDir=process.env.CHECK_LOCK_DIR||path.join(tmpdir(),'solar-friends-check.lock');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function takeTurn(){
  if(flag('--no-lock')||process.env.CHECK_NO_LOCK)return;
  const ownerFile=path.join(lockDir,'owner.json'),began=Date.now();let announced=0;
  for(;;){
    try{await mkdir(lockDir);await writeFile(ownerFile,JSON.stringify({pid:process.pid,cwd:root,since:new Date().toISOString()}));break;}
    catch(error){if(error.code!=='EEXIST')throw error;}
    let owner=null;try{owner=JSON.parse(await readFile(ownerFile,'utf8'));}catch{}
    let alive;
    if(owner){try{process.kill(owner.pid,0);alive=true;}catch(error){alive=error.code==='EPERM';}}
    // Between mkdir and the owner file there is a moment with no owner recorded.
    else alive=Date.now()-((await stat(lockDir).catch(()=>null))?.mtimeMs??Date.now())<10000;
    if(!alive){
      // Claim the dead lock by renaming it, so two waiters cannot both clear it.
      const stale=`${lockDir}.stale-${process.pid}`;
      try{
        await rename(lockDir,stale);
        let moved=null;try{moved=JSON.parse(await readFile(path.join(stale,'owner.json'),'utf8'));}catch{}
        if(moved&&moved.pid!==owner?.pid)await rename(stale,lockDir).catch(()=>{}); // A live run took it in between: give it back.
        else await rm(stale,{recursive:true,force:true});
      }catch{}
      continue;
    }
    if(Date.now()-announced>=60000){
      const waited=Math.round((Date.now()-began)/1000);
      console.log(`Waiting for the check run in ${owner?path.basename(owner.cwd.replace(/\/$/,'')):'another worktree'}${waited?` (${waited}s so far)`:''}; pass --no-lock to run alongside it.`);
      announced=Date.now();
    }
    await pause(2000);
  }
  const release=()=>{try{rmSync(lockDir,{recursive:true,force:true});}catch{}};
  process.on('exit',release);
  for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{stopping=true;for(const child of running)child.kill('SIGTERM');process.exit(130);});
}
await takeTurn();
const started=performance.now();
const seconds=ms=>`${(ms/1000).toFixed(1)}s`.padStart(7);
function run(name){
  return new Promise(resolve=>{
    const begun=performance.now();let log='';
    const child=spawn(process.execPath,[`scripts/${name}`],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],timeout:limit});
    running.add(child);
    child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
    child.on('error',error=>{log+=`\n${error.stack}`;});
    child.on('close',async(code,signal)=>{
      running.delete(child);
      const ms=performance.now()-begun,pass=code===0;
      if(signal&&!stopping)log+=`\nStopped by ${signal} after ${seconds(ms).trim()} (limit ${limit/1000}s).\n`;
      const result={name,pass,ms,log,skipped:stopping&&!pass&&!!signal};results.push(result);
      if(!result.skipped){
        if(pass)timings[name]=Math.round(ms/100)/10;
        else await writeFile(path.join(output,`${name}.log`),log);
        console.log(`${pass?'PASS':'FAIL'} ${seconds(ms)}  ${name}  (${Math.min(results.length,queue.length)}/${queue.length})`);
        if(!pass&&flag('--fail-fast')){stopping=true;for(const other of running)other.kill('SIGTERM');}
      }
      resolve();
    });
  });
}
console.log(`Running ${queue.length} checks, ${jobs} at a time (browser checks ${browserJobs} at a time)`);
const waiting=[...queue];let browsers=0;
await Promise.all(Array.from({length:Math.min(jobs,queue.length)},async()=>{
  while(waiting.length&&!stopping){
    const index=waiting.findIndex(name=>!browser.get(name)||browsers<browserJobs);
    if(index<0)return; // Only browser checks remain and their slots are taken: this worker is done.
    const [name]=waiting.splice(index,1),heavy=browser.get(name);
    if(heavy)browsers++;
    await run(name);
    if(heavy)browsers--;
  }
}));
// A browser check that failed while sharing the machine gets one run on its own before it counts.
const retry=flag('--no-retry')||stopping?[]:results.filter(result=>!result.pass&&browser.get(result.name));
for(const first of retry){
  results.splice(results.indexOf(first),1);
  console.log(`Retrying ${first.name} alone`);
  await run(first.name);
  if(results.at(-1).pass)results.at(-1).flaky=true;
}
await mkdir(path.dirname(timingFile),{recursive:true});await writeFile(timingFile,JSON.stringify(timings,null,1));

const failed=results.filter(result=>!result.pass&&!result.skipped).sort((a,b)=>a.name.localeCompare(b.name));
const tail=text=>{const lines=text.trimEnd().split('\n');return lines.slice(-25).join('\n');};
for(const failure of failed)console.log(`\n── ${failure.name} ──\n${tail(failure.log)}\n   full log: artifacts/check/${failure.name}.log`);
const summary={startedAt:new Date(Date.now()-(performance.now()-started)).toISOString(),seconds:Math.round((performance.now()-started)/100)/10,jobs,results:results.map(({name,pass,ms,skipped,flaky})=>({name,status:skipped?'SKIPPED':pass?(flaky?'PASS_ON_RETRY':'PASS'):'FAIL',seconds:Math.round(ms/100)/10})).sort((a,b)=>a.name.localeCompare(b.name))};
await writeFile(path.join(output,'report.json'),JSON.stringify(summary,null,1));
const flaky=results.filter(result=>result.flaky).map(result=>result.name);
if(flaky.length)console.log(`\nPassed only when run alone (load-sensitive): ${flaky.join(' ')}`);
const total=results.reduce((sum,result)=>sum+result.ms,0);
console.log(`\n${results.length-failed.length} passed, ${failed.length} failed in ${seconds(performance.now()-started).trim()} (${seconds(total).trim()} of work)`);
if(failed.length){console.log(`Failed: ${failed.map(failure=>failure.name).join(' ')}`);process.exitCode=1;}
