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
 const fontCss=`@font-face{font-family:Outfit;src:url(data:font/ttf;base64,${(await readFile(path.join(root,'web/fonts/Outfit-VariableFont_wght.ttf'))).toString('base64')}) format('truetype');font-weight:100 900;}`;
 await page.addStyleTag({content:fontCss});
 await page.evaluate(async()=>{
  await document.fonts.load('500 18px Outfit');
  globalThis.mermaid=(await import('/node_modules/mermaid/dist/mermaid.esm.min.mjs')).default;
  mermaid.initialize({startOnLoad:false,theme:'base',securityLevel:'strict',deterministicIds:true,deterministicIDSeed:'solar-guide',fontFamily:'Outfit, sans-serif',fontSize:18,
   themeVariables:{fontFamily:'Outfit, sans-serif',fontSize:'18px',primaryColor:'#fffaf0',primaryTextColor:'#304a3d',primaryBorderColor:'#bdc9ae',lineColor:'#79917b',secondaryColor:'#e3eee5',tertiaryColor:'#f6edda',clusterBkg:'#f3f3e8',clusterBorder:'#d9dfcd',edgeLabelBackground:'#fbf9ef',titleColor:'#34533f',noteBkgColor:'#f8ebcb',noteTextColor:'#645338',noteBorderColor:'#dfcea4'},
   themeCSS:'.node rect,.node polygon,.node path{stroke-width:1.5px}.nodeLabel{font-weight:500}.edgeLabel{font-size:14px}.cluster-label{font-weight:650;letter-spacing:.3px}.flowchart-link{stroke-width:2px}.label text{fill:#304a3d}',
   flowchart:{htmlLabels:false,curve:'basis',nodeSpacing:32,rankSpacing:52,padding:18,wrappingWidth:190},state:{padding:18,nodeSpacing:32,rankSpacing:50}
  });
 });
 for(const [i,t]of topics.entries()){
  const svg=await page.evaluate(async({t,i,fontCss})=>{
   await mermaid.parse(t.diagram);
   const {svg}=await mermaid.render('guide'+i,t.diagram);
   const parsed=new DOMParser().parseFromString(svg,'text/html').querySelector('svg');
   // SVG images are isolated documents: embed the same font used for layout.
   const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=fontCss;parsed.prepend(style);
   for(const rect of parsed.querySelectorAll('.node rect,.statediagram-state rect')){rect.setAttribute('rx','12');rect.setAttribute('ry','12');}
   for(const rect of parsed.querySelectorAll('.cluster rect')){rect.setAttribute('rx','18');rect.setAttribute('ry','18');}
   const box=parsed.getAttribute('viewBox').split(/\s+/).map(Number);
   parsed.setAttribute('width',box[2]);parsed.setAttribute('height',box[3]);
   return new XMLSerializer().serializeToString(parsed);
  },{t,i,fontCss});
  await writeFile(path.join(root,GUIDE_DIR,t.id+'.svg'),svg);
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile(path.join(root,GUIDE_DIR,'reviewed.json'),JSON.stringify(await guideSnapshot(),null,2)+'\n');
console.log(`Rendered and recorded review of ${topics.length} Guide topics.`);
