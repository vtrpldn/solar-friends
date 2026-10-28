// Hand landmarks measured on the normalized source/mask review boards.
// These are contact drafts, not fitted equipment acceptance.
import {readFile,writeFile} from 'node:fs/promises';
import {validateAttachmentRig,AttachmentRigDocument} from '../web/character-attachments.js';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const rig=JSON.parse(await readFile(`${root}/attachment-rig-draft-v1.json`));
// Near hand is the arm on the viewer's left in the unmirrored art.
// Crossing arms retain that anatomical ownership rather than screen ordering.
const hands={
 base:[[[79,139],[182,115]],[[85,136],[173,114]],[[146,110],[75,119]],[[86,138],[174,115]],[[82,166],[166,164]],[[110,91],[137,102]],[[90,72],[90,72]],[[178,182],[166,185]],[[85,154],[174,150]],[[85,154],[174,150]],[[85,154],[174,150]],[[85,154],[174,150]],[[106,177],[181,172]],[[126,183],[163,172]],[[106,179],[181,172]],[[133,143],[38,155]]],
 idle:[[[82,171],[176,163]],[[82,171],[174,164]],[[81,174],[177,165]],[[80,173],[174,163]],[[83,165],[171,161]],[[107,85],[158,86]],[[89,21],[157,14]],[[83,165],[173,159]],[[82,170],[174,167]],[[88,79],[177,164]],[[81,56],[176,169]],[[105,151],[171,168]],[[82,172],[176,169]],[[105,147],[166,146]],[[106,147],[166,146]],[[82,170],[174,167]]],
 activities:[[[142,108],[194,138]],[[139,134],[185,137]],[[149,138],[195,146]],[[140,92],[194,141]],[[147,134],[181,136]],[[147,141],[185,140]],[[165,160],[205,147]],[[170,163],[207,148]],[[135,218],[163,170]],[[160,218],[160,174]],[[143,223],[170,167]],[[188,220],[169,169]],[[123,130],[175,145]],[[122,128],[210,128]],[[125,130],[211,130]],[[125,129],[211,129]]]
};
for(const [sheet,pairs]of Object.entries(hands))for(let index=0;index<16;index++)for(const [i,socket]of ['nearHand','farHand'].entries())rig.poses[sheet][index][socket]={visibility:'visible',position:pairs[index][i]};
// The raised crossed-arm work pose hides the far grip behind the near hand.
rig.poses.base[6].farHand={visibility:'occluded',position:null};
validateAttachmentRig(rig,rig.body);const document=new AttachmentRigDocument(rig.body);document.import(rig);document.requireComplete();
await writeFile(`${root}/attachment-rig-draft-v2.json`,JSON.stringify(rig,null,2)+'\n');
console.log('48 complete coordinate drafts validated; visual fitting remains required.');
