import {financeTime} from './finances.js';

const pages = {
  overview: ['Overview', ['account', 'activity', 'outlook']],
  transactions: ['Transactions', ['statement']],
  spending: ['Income & spending', ['categories', 'assets']],
  payments: ['Payments & reserves', ['reserves', 'costs', 'upkeep']],
};
const money = value => `R$${value.toFixed(2)}`;
export function matchingTransactions(entries, {query = '', direction = 'all', period = 'all'}, time) {
  const day = Math.floor((540 + time * .45) / 1440);
  return entries.filter(entry => {
    const entryDay = Math.floor((540 + entry.time * .45) / 1440);
    return `${entry.description} ${entry.category}`.toLowerCase().includes(query.trim().toLowerCase())
      && (direction === 'all' || (direction === 'in' ? entry.amount > 0 : entry.amount < 0))
      && (period === 'all' || entryDay >= day - (period === 'today' ? 0 : 6));
  });
}

export function mountBanking(screen, summary, state, ui) {
  const element = (tag, text, parent, className) => {
    const el = document.createElement(tag); el.textContent = text;
    if (className) el.className = className;
    parent.append(el); return el;
  };
  const panels = [...screen.children];
  const nav = element('nav', '', screen, 'bank-navigation');
  nav.setAttribute('aria-label', 'Shared account');
  element('span', '✳', nav, 'bank-emblem');
  element('strong', 'Ecovilla', nav, 'bank-brand');
  element('small', 'COMMUNITY BANKING', nav);
  const content = element('div', '', screen, 'bank-content');
  const heading = element('div', '', content, 'bank-page-heading');
  const title = element('h3', '', heading);
  element('span', financeTime(state.time), heading);
  const grid = element('div', '', content, 'bank-page-grid');
  panels.forEach(panel => grid.append(panel));
  const buttons = new Map();
  const selectPage = key => {
    ui.page = key;
    title.textContent = pages[key][0];
    content.dataset.page = key;
    for (const [id, button] of buttons) {
      button.classList.toggle('active', id === key);
      if (id === key) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    panels.forEach(panel => { panel.hidden = !pages[key][1].some(name => panel.classList.contains(`bank-${name}`)); });
  };
  for (const [key, [label]] of Object.entries(pages)) {
    const button = element('button', label, nav); buttons.set(key, button);
    button.onclick = () => selectPage(key);
  }
  element('p', 'Shared account\nBrazilian real · BRL', nav, 'bank-account-label');
  const statement = grid.querySelector('.bank-statement');
  statement.replaceChildren();
  element('h3', 'Account statement', statement);
  element('p', 'Search the latest 100 retained transactions. Totals elsewhere cover all recorded activity.', statement);
  const filters = element('div', '', statement, 'bank-filters');
  const searchLabel = element('label', 'Search transactions', filters);
  const search = element('input', '', searchLabel); search.type = 'search'; search.placeholder = 'Description or category'; search.value = ui.query;
  const select = (label, values, value) => {
    const wrapper = element('label', label, filters), input = element('select', '', wrapper);
    for (const [id, text] of values) { const option = element('option', text, input); option.value = id; }
    input.setAttribute('aria-label', label); input.value = value; return input;
  };
  const direction = select('Cash flow', [['all','All transactions'],['in','Money in'],['out','Money out']], ui.direction);
  const period = select('Period', [['all','All retained'],['today','Today'],['week','Last 7 game days']], ui.period);
  const count = element('p', '', statement); count.setAttribute('role', 'status');
  const results = element('div', '', statement);
  const draw = () => {
    Object.assign(ui, {query: search.value, direction: direction.value, period: period.value});
    const entries = matchingTransactions(summary.entries, ui, state.time);
    count.textContent = `${entries.length} transactions · Filtered net ${money(entries.reduce((sum, entry) => sum + entry.amount, 0))}`;
    results.replaceChildren();
    if (!entries.length) { element('p', summary.entries.length ? 'No matching transactions. Try another search or filter.' : 'No transactions yet. Village income and payments will appear here.', results); return; }
    const table = element('table', '', results, 'finance-ledger');
    const head = element('tr', '', element('thead', '', table));
    for (const label of ['Date', 'Description', 'Amount']) element('th', label, head).scope = 'col';
    const body = element('tbody', '', table);
    for (const entry of entries) {
      const row = element('tr', '', body);
      element('td', financeTime(entry.time), row);
      const details = element('details', '', element('td', '', row));
      element('summary', entry.description, details);
      element('p', `Category: ${entry.category} · ${entry.amount > 0 ? 'Received into' : 'Paid from'} the shared account.`, details);
      element('td', `${entry.amount > 0 ? '+' : '−'}${money(Math.abs(entry.amount))}`, row, entry.amount > 0 ? 'bank-credit' : 'bank-debit');
    }
  };
  search.oninput = draw; direction.onchange = draw; period.onchange = draw;
  const quick = element('div', '', grid.querySelector('.bank-activity'), 'bank-quick-actions');
  for (const key of ['transactions', 'payments']) element('button', pages[key][0] + ' →', quick).onclick = () => selectPage(key);
  draw(); selectPage(ui.page);
}
