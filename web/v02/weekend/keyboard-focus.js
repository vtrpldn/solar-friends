const directions = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const controls = 'button:not(:disabled), summary, a[href]';

document.addEventListener('keydown', event => {
  const direction = directions[event.key];
  const current = event.target.closest?.(controls);
  if (!direction || !current || event.defaultPrevented || event.isComposing ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const scope = current.closest('dialog[open]') || document;
  const origin = current.getBoundingClientRect();
  const [x, y] = direction;
  let nearest, distance = Infinity;
  for (const candidate of scope.querySelectorAll(controls)) {
    if (candidate === current || candidate.tabIndex < 0 ||
        candidate.closest('[inert],[aria-hidden="true"]') ||
        !candidate.checkVisibility({visibilityProperty: true})) continue;
    const rect = candidate.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - origin.left - origin.width / 2;
    const dy = rect.top + rect.height / 2 - origin.top - origin.height / 2;
    const forward = dx * x + dy * y;
    if (forward < 1) continue;
    const sideways = Math.abs(dx * y - dy * x);
    const score = forward + 3 * sideways;
    if (score < distance) {
      nearest = candidate;
      distance = score;
    }
  }
  event.preventDefault();
  nearest?.focus();
});
