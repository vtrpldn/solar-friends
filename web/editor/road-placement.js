// Preview and commit preserve existing order and add each painted cell once.
export function applyRoadStroke(definition,stroke){
 const cells=new Map(definition.start.roads.map(p=>[p.join(','),p]));
 for(const cell of stroke)cells.set(cell.join(','),cell);
 definition.start.roads=[...cells.values()];
}
