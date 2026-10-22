// Incomplete authored worlds are valid editable drafts. Structural/version
// failures cannot safely enter the editor; gameplay constraints remain visible
// in its validation review and keep Play disabled.
const blocked=new Set(['file_too_large','unsupported_format','invalid_json','invalid_definition','unsupported_map','unknown_building','invalid_appearance','invalid_material','too_many_objects','too_many_stores','duplicate_building','invalid_identity','unsupported_resident_preset','unsupported_resident_appearance','invalid_resident_credits']);
export function draftImportIssue(report){
 if(typeof report?.ok!=='boolean'||!Array.isArray(report.issues))return {message:'This draft could not be validated.'};
 return report.issues.find(issue=>blocked.has(issue.code))??null;
}
