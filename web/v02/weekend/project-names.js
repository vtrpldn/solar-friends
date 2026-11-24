// Player-facing building names count each kind from 1 ("Basic shelter 2")
// instead of exposing save ids, which the land's trees and deposits use first.
export function projectLabel(project, definitions) {
  const name = definitions[project.key]?.name || project.key;
  return project.number ? `${name} ${project.number}` : name;
}
const numbered = (project, definitions) =>
  !project.natural && !definitions[project.key]?.natural;
export function numberProject(s, project, definitions) {
  if (project.number || !numbered(project, definitions)) return project;
  let highest = 0;
  for (const other of s.projects)
    if (other !== project && other.key === project.key && other.number > highest) highest = other.number;
  project.number = highest + 1;
  return project;
}
// Saves made before names were numbered keep their order of construction.
export function numberProjects(s, definitions) {
  const missing = s.projects.filter((p) => p && !p.number && definitions[p.key] && numbered(p, definitions));
  for (const project of missing.sort((a, b) => a.id - b.id)) numberProject(s, project, definitions);
}
