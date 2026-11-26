const directions = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const controls = 'button:not(:disabled), summary, a[href]';
const groups = '[role="group"], [role="toolbar"], nav, #build-list, #roster, #resource-grid, #lens-list, .menu-actions';
const panels = 'dialog[open], #build, aside, #selection, #map-lenses, footer, header, .view-menu';

document.addEventListener('keydown', event => {
  const direction = directions[event.key];
  const current = event.target.closest?.(controls);
  if (!direction || !current || event.defaultPrevented || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const origin = current.getBoundingClientRect();
  const [x, y] = direction;
  const usable = candidate => candidate !== current && candidate.tabIndex >= 0 &&
    !candidate.closest('[inert],[aria-hidden="true"]') && candidate.checkVisibility({visibilityProperty: true});
  const nearestIn = (scope, cone) => {
    let nearest, distance = Infinity;
    for (const candidate of scope.querySelectorAll(controls)) {
      if (!usable(candidate)) continue;
      const rect = candidate.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - origin.left - origin.width / 2;
      const dy = rect.top + rect.height / 2 - origin.top - origin.height / 2;
      const forward = dx * x + dy * y;
      if (forward < 1) continue;
      const sideways = Math.abs(dx * y - dy * x);
      if (cone && sideways > 2 * forward) continue;
      const score = forward + 3 * sideways;
      if (score < distance) {
        nearest = candidate;
        distance = score;
      }
    }
    return nearest;
  };
  // Prefer a neighbour in the same list, then the same panel, then anywhere a
  // modal allows: arrows walk a grid without leaking into the toolbar behind it.
  // Leaving a list only goes roughly straight on, never diagonally backwards.
  const modal = current.closest('dialog[open]'), group = current.closest(groups);
  let nearest;
  for (const scope of [group, current.closest(panels), modal || document]) {
    if (scope && (nearest = nearestIn(scope, group && scope !== group))) break;
  }
  event.preventDefault();
  nearest?.focus();
});

// A modal dialog keeps Tab inside it: past the last control it wraps to the
// first instead of leaving for the browser's own toolbar.
const tabbable = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
  const dialog = [...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')).at(-1);
  if (!dialog) return;
  const stops = [...dialog.querySelectorAll(tabbable)].filter(el => !el.disabled && el.tabIndex >= 0 &&
    !el.closest('[inert]') && el.checkVisibility({visibilityProperty: true}));
  const active = document.activeElement, inside = dialog.contains(active) && active !== dialog;
  const edge = event.shiftKey ? stops[0] : stops.at(-1);
  if (inside && active !== edge) return;
  event.preventDefault();
  (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
});
