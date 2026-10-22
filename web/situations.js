const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function situationView(v, residents) {
  const s = v.situations.active;
  if (!s) return {
    label: 'Situations',
    markup: `<span class="eyebrow">LIFE TOGETHER</span><h2 id="situation-title">Room to listen.</h2>
      <p>Small stories grow from the way we live together.</p>
      <div class="situation-quiet">For now, no one has raised a concern.</div>
      <p class="hint">When one neighbour repeatedly carries most of the cooking, they may ask the collective for help. Share the work and make room for rest.</p>
      <p class="situation-memory">${v.situations.resolved_count} situation${v.situations.resolved_count === 1 ? "" : "s"} cared for together</p>`,
  };
  const name = escape(residents.find(r => r.id === s.resident)?.name || 'Our neighbour');
  const resolved = s.resolved !== null;
  const agreed = s.response !== null;
  const helpers = residents.filter(r => s.helpers.includes(r.id)).map(r => escape(r.name));
  const solo=residents.length===1,others=Math.max(0,residents.length-1);
  const needed = Math.min(s.response === 'day_off' ? 1 : 2,others);
  const shared=Math.min(2,others);
  const day = Math.min(100, Math.floor((v.minutes - (s.agreed ?? s.opened)) / 1440 * 100));
  return {
    label: resolved ? 'Situations · settled' : agreed ? 'Situations · caring' : 'Situations · 1 concern',
    markup: `<span class="eyebrow">${resolved ? 'A NEW RHYTHM' : agreed ? 'OUR AGREEMENT' : 'A NEIGHBOUR SPEAKS'}</span>
      <h2 id="situation-title">${s.story_check_in ? "A day for ourselves." : "More than the cook."}</h2>
      <p class="situation-byline">A situation with ${name}</p>
      <blockquote>“${resolved ? solo?'Time away from cooking made room for my own interests.':'Having others take a turn made a difference. There is room for me at the table, too.' : agreed ? 'Thank you for hearing me. Let’s give this a little time and see how it feels.' : s.story_check_in ? 'We have built so much together. I would love a day for my own interests. Could we cover the kitchen and make room for that?' : solo?'Cooking has taken over my days. I would like time for my own interests, too.':'I like feeding everyone. But lately, most of the cooking falls to me. I’d like some time to just be here with you.'}”<cite>${name}</cite></blockquote>
      ${resolved ? `<p>${solo?`${name} had time away from cooking, and the routine had a full day to settle.`:`The kitchen was covered, ${name} had time back, and the collective kept it up for a full day.`}</p><p class="situation-memory">${v.situations.resolved_count} situation${v.situations.resolved_count === 1 ? "" : "s"} cared for together · we’ll leave room to settle before another concern.</p>` : `
      <p class="situation-feeling">${s.worry >= 8 ? 'Feeling overlooked' : s.worry > 2 ? 'Feeling a little stretched' : 'Feeling heard'} · ${s.worry > 0 ? `${name}’s wellbeing is ${Math.ceil(s.worry)} ${Math.ceil(s.worry) === 1 ? "point" : "points"} lower while this weighs on them.` : "Time back is easing the concern."}</p>
      ${agreed ? `<h3>${s.response === 'day_off' ? 'Protect a day off' : solo?'Ease the kitchen routine':'Share kitchen shifts'}</h3><p>${solo?`Use stored meals or town supplies while ${name} takes a break. Cooking resumes after the agreement is fulfilled.`:s.response === 'day_off' ? `${name} takes a break from work until the agreement is fulfilled. Others cover meals; projects lose a pair of hands.` : `${name} steps away from cooking. Other neighbours put meals before their usual projects, and make space for a break.`}</p>` : `<h3>What could we try together?</h3>
      <div class="situation-choices"><button data-situation-response="share_shifts"><b>${solo?'Ease the kitchen routine':'Share kitchen shifts'}</b><span>${solo?'Use stored meals or town supplies and make time away from cooking.':`${shared===1?'One other neighbour takes':'Two other neighbours take'} a turn. Keep projects moving, with time for a break.`}</span></button>
      <button data-situation-response="day_off"><b>Protect a day off</b><span>${solo?'Pause work and make room for rest. Use stored meals or town supplies.':'Cover meals and pause this neighbour’s work. A fuller rest, with slower projects.'}</span></button></div>
      <p class="hint">${solo?'You can also leave this undecided and make time away from cooking.':'You can also leave this undecided and share tasks yourself.'} A promise alone won’t settle it.</p>`}
      <div class="situation-progress"><h3>Change we can feel</h3>
      <p>${solo?'No other residents to cover cooking; recovery needs time away from the kitchen.':`${helpers.length >= needed ? '✓' : '○'} ${Math.min(helpers.length, needed)}/${needed} ${needed===1?'neighbour':'neighbours'} cooked${helpers.length ? ` · ${helpers.join(', ')}` : ''}`}</p>
      <p>${s.recovery >= 72 ? '✓' : '○'} ${Math.min(72, Math.floor(s.recovery))}/72 minutes of rest or company</p>
      <p>${day >= 100 ? '✓' : '○'} A full day to settle · ${day}%</p></div>
      <p class="hint">Rest and company ease the concern. More cooking by ${name} takes away some of that recovery. Sleep alone doesn’t replace free time.</p>`}`,
  };
}
