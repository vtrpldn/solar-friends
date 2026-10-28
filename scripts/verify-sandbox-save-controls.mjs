import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {checkClimateSandboxSave} from './climate-browser-checks.mjs';
import {checkMaintenanceSandboxSave} from './maintenance-browser-checks.mjs';
import {checkSkillSandboxSave} from './skills-browser-checks.mjs';
import {checkSupplierSandboxSave} from './supplier-browser-checks.mjs';
import {checkSandboxRules} from './sandbox-browser-checks.mjs';
import {checkArtworkInterface} from './interface-browser-checks.mjs';
const output='artifacts/sandbox-save-controls';await mkdir(output,{recursive:true});
const files=['scripts/verify-sandbox-save-controls.mjs',...['climate','maintenance','skills','supplier','sandbox','interface'].map(name=>'scripts/'+name+'-browser-checks.mjs'),'web/main.js','web/climate-ui.js','web/pkg/solar_friends_bg.wasm'],sha=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await readFile(f))]))),screenshots=[],errors=[],results=[];
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const base=`http://127.0.0.1:${server.address().port}`;
 for(const check of [checkClimateSandboxSave,checkMaintenanceSandboxSave,checkSkillSandboxSave,checkSupplierSandboxSave,checkSandboxRules,checkArtworkInterface]){
  console.log('Checking '+check.name);await check({browser,base,output,screenshots,errors});results.push(check.name);console.log('PASS '+check.name);
 }
 assert.deepEqual(errors,[]);for(const f of files)assert.equal(sha(await readFile(f)),inputs[f]);
 await writeFile(output+'/report.json',JSON.stringify({completed:true,browser:browser.version(),results,screenshots,inputs,scope:'Separate clean desktop contexts: Sandbox climate, maintenance, learning, supplier and rule settings persist through actual saves and reloads; artwork tools remain keyboard-operable. Not complete builder release acceptance.'},null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
