// Draws the "what changed" recap into its dialog. All text arrives from
// time-skip-summary.js; this file only lays it out as a journal page.
export function renderSkipSummary(dialog, summary, {openScreen = () => {}} = {}) {
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  dialog.querySelector('#skip-summary-title').textContent = summary.title;
  dialog.querySelector('#skip-summary-span').textContent =
    [`${summary.from} → ${summary.to}`, summary.date, summary.weather].filter(Boolean).join(' · ');
  const stopped = dialog.querySelector('#skip-summary-stopped');
  stopped.textContent = summary.stopped;
  stopped.hidden = !summary.stopped;
  const body = dialog.querySelector('#skip-summary-body');
  body.replaceChildren();
  body.scrollTop = 0;
  if (summary.quiet) {
    body.append(el('p', summary.days > 0
      ? 'Nothing notable happened. Savings, stores and building sites are just as you left them.'
      : 'Nothing was simulated, so the village is exactly as you left it.', 'skip-summary-quiet'));
  }
  for (const section of summary.sections) {
    const block = el('section');
    const heading = el('div', '', 'skip-summary-head');
    heading.append(el('h3', section.title));
    if (section.total) heading.append(el('strong', section.total));
    if (section.screen) {
      const link = el('button', section.link);
      link.type = 'button';
      link.onclick = () => { dialog.close('screen'); openScreen(section.screen); };
      heading.append(link);
    }
    block.append(heading);
    const list = el('dl');
    for (const row of section.rows) {
      const line = el('div', '', [row.tone, row.quote ? 'quote' : ''].filter(Boolean).join(' '));
      const label = el('dt', row.label);
      if (row.detail) label.append(el('span', row.detail));
      line.append(label, el('dd', row.value));
      list.append(line);
    }
    block.append(list);
    if (section.note) block.append(el('p', section.note, 'skip-summary-note'));
    body.append(block);
  }
}
