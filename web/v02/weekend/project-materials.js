// Preserve a building's paid bill when future catalog calibration changes recipes.
export function projectMaterials(project,definitions){return project.billOfMaterials||definitions[project.key].materials;}
export function captureProjectMaterials(s,definitions,materials){
 if(s.materialBillVersion!==undefined&&s.materialBillVersion!==2)return false;
 const legacy=s.materialBillVersion===undefined;
 for(const p of s.projects){
  const def=definitions[p.key];if(!def)return false;
  if(p.billOfMaterials===undefined)p.billOfMaterials={...(legacy?(def.legacyMaterials||def.materials):def.materials)};
  if(!p.billOfMaterials||typeof p.billOfMaterials!=='object'||Array.isArray(p.billOfMaterials)||Object.entries(p.billOfMaterials).some(([id,n])=>!materials[id]||!Number.isInteger(n)||n<0||n>100000))return false;
 }
 s.materialBillVersion=2;return true;
}
