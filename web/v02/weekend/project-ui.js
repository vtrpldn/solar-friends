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
