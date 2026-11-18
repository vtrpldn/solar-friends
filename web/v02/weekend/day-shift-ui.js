import {cancelDayShift, dayShiftOffer, requestDayShift} from './outside-work.js';
import {spendableMoney} from './procurement-budget.js';

export function dayShiftControls(state, resident, refresh, chooseResident) {
  const section = document.createElement('section');
  section.className = 'day-shift';
  const heading = document.createElement('h3');
  heading.textContent = 'Paid work in town';
  section.append(heading);

  if (chooseResident) {
    const label = document.createElement('label');
    label.textContent = 'Resident';
    const picker = document.createElement('select');
    for (const person of state.people) picker.add(new Option(person.name, person.id));
    picker.value = resident.id;
    picker.onchange = () => {
      chooseResident(picker.value);
      document.querySelector('#finance-screen .day-shift select')?.focus();
    };
    label.append(picker);
    section.append(label);
  }

  const offer = dayShiftOffer(state, resident);
  const job = document.createElement('strong');
  job.textContent = `${offer.job} · ${offer.hours}-hour shift`;
  const pay = document.createElement('p');
  pay.textContent = `R$${offer.pay} gross · R$${offer.fare} round-trip bus fare · R$${offer.pay - offer.fare} take-home. Wages go into village savings on return.`;
  if (resident.outsideWork ? resident.outsideWork.fareDue : spendableMoney(state) < offer.fare) {
    pay.append(' The employer covers the bus fare up front and deducts it from pay.');
  }
  const status = document.createElement('p');
  status.textContent = offer.reason;
  section.append(job, pay, status);

  if (offer.available || offer.status === 'queued') {
    const queued = offer.status === 'queued';
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = queued ? 'Cancel day shift' : 'Book one day shift';
    action.onclick = () => {
      if (queued) cancelDayShift(state, resident);
      else requestDayShift(state, resident);
      refresh();
      document.querySelector('dialog[open] .day-shift button')?.focus();
    };
    section.append(action);
  }
  return section;
}
