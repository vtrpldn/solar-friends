import {readFile,writeFile} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
import {GUIDE_DIR,guideSnapshot,verifyGuide} from './guide-content.mjs';
if(process.argv.includes('--check')){console.log(`PASS Guide is current: ${await verifyGuide()} topics`);process.exit(0);}
if(!process.argv.includes('--reviewed'))throw Error('Review Guide content against changed mechanics first; pass --reviewed to record that review.');
const root=path.resolve(import.meta.dirname,'..'),topics=JSON.parse(await readFile(path.join(root,GUIDE_DIR,'topics.json'),'utf8'));
const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html lang="en"><body></body></html>');return;}const target=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(root+path.sep)){res.statusCode=403;res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(target)?'text/javascript':'text/plain');res.end(await readFile(target));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--mute-audio']});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(async()=>{globalThis.mermaid=(await import('/node_modules/mermaid/dist/mermaid.esm.min.mjs')).default;mermaid.initialize({startOnLoad:false,theme:'base',securityLevel:'strict',deterministicIds:true,deterministicIDSeed:'solar-guide',fontFamily:'Arial, sans-serif',themeVariables:{primaryColor:'#edf2dc',primaryTextColor:'#30462f',primaryBorderColor:'#84976a',lineColor:'#687b55',secondaryColor:'#fff5dc',tertiaryColor:'#f7f9ef'},flowchart:{htmlLabels:false,curve:'linear'}});});
 for(const [i,t]of topics.entries()){
  const svg=await page.evaluate(async({t,i})=>{await mermaid.parse(t.diagram);const {svg}=await mermaid.render('guide'+i,t.diagram);const parsed=new DOMParser().parseFromString(svg,'text/html').querySelector('svg');const box=parsed.getAttribute('viewBox').split(/\s+/).map(Number);parsed.setAttribute('width',box[2]);parsed.setAttribute('height',box[3]);return new XMLSerializer().serializeToString(parsed);},{t,i});
  await writeFile(path.join(root,GUIDE_DIR,t.id+'.svg'),svg);
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile(path.join(root,GUIDE_DIR,'reviewed.json'),JSON.stringify(await guideSnapshot(),null,2)+'\n');
console.log(`Rendered and recorded review of ${topics.length} Guide topics.`);
