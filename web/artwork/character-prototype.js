import {characterBodyLayout,auditCharacterPart,drawRegisteredCharacterFrame} from '../character-parts.js';
import {preparedFrames} from '../sprite-frames.js';
const root='../art/characters/prototype-v1/';
const image=async path=>{const value=new Image();value.src=path;await value.decode();return value;};
const pixels=image=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height);};
try{
 const registration=await (await fetch(root+'registration.json')).json();
 const [body,reference,...hair]=await Promise.all([image(root+registration.body),image(root+registration.reference),...registration.parts.map(file=>image(root+file))]);
 const layout=characterBodyLayout(pixels(body)),audits=hair.map(image=>auditCharacterPart(pixels(image),registration.headBoxes));
 const host=document.querySelector('.prototype-poses');
 for(let i=0;i<16;i++){const card=document.createElement('article');card.innerHTML=`<b>Row ${Math.floor(i/4)+1} · pose ${i%4+1}</b><div>${['Reference','Body','Rejected overlay'].map(name=>`<canvas width="256" height="256" aria-label="${name}"></canvas>`).join('')}</div><small></small>`;host.append(card);}
 function draw(){
  const selected=Number(document.querySelector('select').value)-1,audit=audits[selected];
  for(const [index,card]of [...host.children].entries()){
   const [ref,neutral,composite]=card.querySelectorAll('canvas');ref.getContext('2d').drawImage(preparedFrames(reference,{referenceRow:2})[index],0,0);
   drawRegisteredCharacterFrame(neutral.getContext('2d'),{body,layout,index});
   drawRegisteredCharacterFrame(composite.getContext('2d'),{body,layout,index,parts:[{image:hair[selected],audit}],diagnostic:true});
   card.querySelector('small').textContent=`Hair pixels in authored region: ${(audit.poses[index].coverage*100).toFixed(1)}% · ${audit.poses[index].ok?'region passes':'rejected'}`;
  }
  document.querySelector('#prototype-verdict').textContent=audit.ok?'Region passes; visual approval is still required.':'Rejected: hair is outside the authored head regions. The guided attempt also contains unwanted skin/ear pixels.';
  document.querySelector('#prototype-report').textContent=JSON.stringify({body:{width:layout.width,height:layout.height,frames:layout.frames.length,uniformScale:layout.scale},audits},null,2);
 }
 document.querySelector('select').onchange=draw;draw();document.body.dataset.prototypeReady='true';
}catch(error){document.querySelector('#prototype-verdict').textContent=error.message;throw error;}
