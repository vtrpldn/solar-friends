export function projectLabel(project, definitions) {
  return `${definitions[project.key].name} #${project.id}`;
}

export function upgradeAction(project, operations) {
  if (project.solarUpgrade) return {label: 'Solar upgrade installed', disabled: true};
  if (operations.some(op => op.site === project.id && !op.done && op.recipe === 'solar_upgrade'))
    return {label: 'Solar upgrade queued', disabled: true};
  return {label: 'Install solar upgrade', disabled: false};
}

// Only rewind an unchanged, paused planning transaction. Never undo later work.
export function undoRoadPlan(state, entry) {
  if (!entry || JSON.stringify(state) !== entry.after) return false;
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, structuredClone(entry.before));
  return true;
}

export function productionSearchText(definition, processes, materials) {
  return [definition.name, definition.description,
    ...Object.values(processes).filter(recipe => recipe.kind === definition.kind).flatMap(recipe =>
      [recipe.name, ...Object.keys(recipe.output).map(id => materials[id]?.name || id)])
  ].join(' ').toLowerCase();
}

export function productionActivity(state, project, processes) {
  const operation = (state.operations || []).find(op => op.site === project.id && !op.done && !op.water);
  if (!operation) return null;
  const recipe = processes[operation.recipe];
  const workers = state.people.filter(r => r.operation === operation.id && !r.needTask && !r.tentPhase);
  const progress = Math.min(1, operation.work / recipe.work);
  const reportedStatus = operation.status === 'Building switched off' && state.infrastructure?.nodes[project.id]?.enabled ? '' : operation.status;
  const phase = reportedStatus || ({pickup:'Collecting supplies',process:'Working',return:'Returning from the upgrade'}[operation.phase] || 'Job queued');
  return {progress, label: operation.phase === 'return' ? 'Finishing batch' : workers.length ? 'Batch in progress' : 'Batch queued',
    detail: `${recipe.name} · ${phase} · ${Math.round(progress * 100)}% work complete · ${workers.length ? workers.map(r => r.name).join(', ') : 'Waiting for a resident'}`};
}

export function residentProject(state, resident) {
  if (resident.needTask || resident.tentPhase || resident.action === 'rest') return null;
  const operation = (state.operations || []).find(op => op.id === resident.operation && !op.done);
  return state.projects.find(p => p.id === (operation?.site ?? resident.job)) || null;
}
