import { equipmentSummary } from './equipment.js';
export const CRAFT_SKILLS = {woodworking:'Woodworking',basketry:'Basketry',repair:'Equipment repair'};
const thresholds=[0,2400,14400,48000];
const starting={iara:{basketry:14400},bento:{woodworking:14400,repair:14400},luz:{basketry:2400},caua:{repair:14400,woodworking:2400},nina:{woodworking:2400,repair:2400}};
export function craftSkills(resident) {
 if(!resident.craftSkills)resident.craftSkills=Object.fromEntries(Object.keys(CRAFT_SKILLS).map(id=>[id,starting[resident.id]?.[id]||0]));
 if(!resident.craftSkillVersion) {
  for(const id of Object.keys(CRAFT_SKILLS))resident.craftSkills[id]=Math.max(resident.craftSkills[id],starting[resident.id]?.[id]||0);
  resident.craftSkillVersion=1;
 }
 return resident.craftSkills;
}
export function skillLevel(resident,skill) {
 const xp=craftSkills(resident)[skill]||0;
 return thresholds.filter(n=>xp>=n).length-1;
}
export function validCraftSkills(resident) {
 return resident.craftSkills===undefined || resident.craftSkills && !Array.isArray(resident.craftSkills) && Object.keys(CRAFT_SKILLS).every(id=>Number.isFinite(resident.craftSkills[id])&&resident.craftSkills[id]>=0&&resident.craftSkills[id]<=100000);
}
export const CRAFT_RULES={
 'craft_garden-tools':{skill:'woodworking',level:1,kind:'supply-5',tool:'carpentry-tools',work:180,stages:['Shape wooden handles','Fit purchased tool heads','Secure and inspect']},
 'craft_harvest-basket':{skill:'basketry',level:0,kind:'supply-5',tool:'carpentry-tools',work:240,stages:['Split and prepare bamboo','Weave body and base','Bind rim and handles']},
 'craft_produce-crates':{skill:'woodworking',level:0,kind:'supply-5',tool:'carpentry-tools',work:120,stages:['Cut planks to length','Assemble and fasten','Smooth and inspect']},
 'craft_wheelbarrow':{skill:'woodworking',level:2,kind:'workshop',tool:'carpentry-tools',work:360,stages:['Build frame and tray','Fit purchased axle and wheel','Balance and load-test']},
};
export function craftingRule(id,recipe) {
 if(CRAFT_RULES[id])return CRAFT_RULES[id];
 if(recipe?.equipmentRepair) {
  const woven=recipe.equipmentRepair==='harvest-basket';
  return {skill:woven?'basketry':'repair',level:1,kind:'supply-5',tool:recipe.equipmentRepair==='carpentry-tools'?null:'carpentry-tools',work:120,stages:woven?['Inspect damaged weave','Replace and bind fibers','Check handles']:['Inspect wear','Replace worn parts from repair kit','Test and service']};
 }
 return null;
}
export function craftStage(recipe,work) {
 const stages=recipe.craft.stages;
 return stages[Math.min(stages.length-1,Math.floor(work/recipe.work*stages.length))];
}
export function craftingBlocker(s,recipe,resident=null) {
 const rule=recipe.craft;
 if(!rule)return '';
 const workers=resident?[resident]:s.people;
 if(!workers.some(r=>skillLevel(r,rule.skill)>=rule.level))return `Needs ${CRAFT_SKILLS[rule.skill]} level ${rule.level}.`;
 if(rule.tool) {
  const tool=equipmentSummary(s,rule.tool);
  const held=resident && s.equipment?.loans[resident.id]?.item===rule.tool;
  if(!tool.available&&!held)return tool.broken>=tool.owned&&tool.owned>0?'Required hand tools need repair.':'Waiting for shared carpentry tools.';
 }
 return '';
}
export function practiceCraft(resident,recipe,dt) {
 const skills=craftSkills(resident),level=skillLevel(resident,recipe.craft.skill);
 skills[recipe.craft.skill]=Math.min(100000,skills[recipe.craft.skill]+dt);
 return .75+level*.15;
}
