export const STORAGE_KINDS = ['warehouse', 'covered-storage', 'supply-5'];
export function crewLimit(definition) {
  return Math.max(2, Math.min(3, Math.max(Math.ceil(definition.work / 350), Math.ceil(definition.size[0] * definition.size[1] / 2))));
}
export function carriedLoads(person) { return person.cargo ? person.haulLoads || 1 : 0; }
export function constructionProgress(state, project, definition, loads) {
  const done = project.work >= definition.work;
  const delivering = project.delivered < loads;
  const phase = done ? 'Ready to use' : project.pendingMaterials ? 'Collecting materials'
    : delivering ? 'Delivering supplies' : 'Building';
  const value = done ? 1 : project.pendingMaterials ? 0 : delivering
    ? project.delivered / loads : project.work / definition.work;
  const crew = state.people.filter(r => r.job === project.id);
  return {
    phase, value: Math.max(0, Math.min(1, value)),
    detail: done ? 'Construction complete' : `${!project.pendingMaterials && !delivering ? `${Math.floor(value * 100)}% built · ` : ''}${constructionStatus(state, project, definition, loads)}`,
    workers: done ? '' : crew.length ? `Assigned: ${crew.map(r => r.name).join(', ')}` : 'No crew assigned yet',
  };
}
export function constructionStatus(state, project, definition, loads) {
  const crew = state.people.filter(r => r.job === project.id);
  if (project.pendingMaterials) return (state.trip?.projects || [state.trip?.project]).includes(project.id) ? 'Materials purchased · resident collecting in town' : 'Materials purchased · waiting for town pickup';
  if (project.delivered < loads) {
    const moving = crew.reduce((n,r) => n + carriedLoads(r), 0);
    return `Supplies ${project.delivered}/${loads} · ${moving} in transit${project.staged ? ` · ${project.staged} at nearby storage` : ''}`;
  }
  const building = crew.filter(r => r.action === 'build').length;
  if (building) return `${building}/${crewLimit(definition)} builders · supplies ready`;
  if (state.people.every(r => r.energy < 25 || r.tentPhase || r.needTask || r.action === 'town')) return 'Supplies ready · residents resting or meeting needs';
  return 'Supplies ready · crew finishing other work';
}
