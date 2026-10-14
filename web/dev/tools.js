import { scenarios } from './scenarios.js';
export function download(data, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = minute => `Day ${Math.floor(minute / 1440) + 1} · ${String(Math.floor(minute % 1440 / 60)).padStart(2,'0')}:${String(Math.floor(minute % 60)).padStart(2,'0')}`;
export function installDevTools(api) {
  const dialog = document.createElement('dialog'); dialog.id = 'dev-dialog'; dialog.setAttribute('aria-labelledby', 'dev-title');
  dialog.innerHTML = `<button class="dialog-close" id="dev-close" aria-label="Close Dev Tools">×</button>
    <span class="eyebrow">SOLAR FRIENDS / WORKBENCH</span><h2 id="dev-title">A little room to experiment.</h2>
    <p id="dev-mode" role="status"></p>
    <nav class="dev-tabs" aria-label="Developer workspaces"><button data-dev-tab="simulation" aria-pressed="true">Simulation</button><button data-dev-tab="art" aria-pressed="false">Artwork</button><button data-dev-tab="checks" aria-pressed="false">Checks & captures</button></nav>
    <section data-dev-page="simulation"><div class="dev-grid"><section class="dev-card"><h3>Scenario launcher</h3>
      <label for="dev-scenario">Start from</label><select id="dev-scenario">${scenarios.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}<option value="copy">Copy of my current village</option><option value="imported" disabled>Imported checkpoint</option></select>
      <p id="dev-scenario-detail"></p><div class="dev-actions"><button id="dev-load">Load test scene</button><button id="dev-return">Return to village</button></div>
      <p>Scenarios are staged test fixtures. Your village stays in memory while you experiment; test scene progress never autosaves.</p>
      <div class="dev-actions"><button data-dev-step="0.75">Single tick · ¼ second</button><button data-dev-step="1">+1 game minute</button><button data-dev-step="60">+1 game hour</button></div>
      <label for="dev-minutes">Game minutes to advance (up to one day)</label><input id="dev-minutes" type="number" min="0.75" max="1440" value="60" step="0.75"><button id="dev-advance">Advance</button>
      <div class="dev-actions"><button id="dev-run">Run test scene in game</button><button id="dev-fixture">Export scenario</button><button id="dev-import">Import test scene checkpoint</button><input id="dev-import-file" type="file" accept="application/json,.json" hidden></div><p>Import a village export into the test scene to replay an earned checkpoint. Your saved village stays protected.</p>
      <p id="dev-clock"></p><p id="dev-message" role="status"></p>
    </section><section class="dev-card"><h3>Resident decisions</h3><label for="dev-resident">Inspect a neighbour</label><select id="dev-resident"></select><div class="dev-actions"><button id="dev-inspect">Refresh</button><button id="dev-follow">Locate in game</button></div><div id="dev-inspection"></div></section></div></section>
    <section data-dev-page="art" hidden><div class="dev-grid"><section class="dev-card"><h3>Artwork workbench</h3>
      <a class="dev-link" href="./artwork/grid-fit.html" target="_blank" rel="noopener"><b>Sprite grid fit ↗</b><span>Every day/night building on its actual tile plot, beside a resident.</span></a>
      <a class="dev-link" href="./artwork/?tool=calibration" target="_blank" rel="noopener"><b>Calibration bench ↗</b><span>Ground anchors, scale, camera axes, and game-size comparisons.</span></a>
      <a class="dev-link" href="./artwork/?tool=replacement" target="_blank" rel="noopener"><b>Replacement review ↗</b><span>Inspect a candidate sprite against the current artwork.</span></a>
      <a class="dev-link" href="./artwork/?tool=recipe" target="_blank" rel="noopener"><b>Art recipe cards ↗</b><span>References, constraints, prompts, and revision notes.</span></a>
      <a class="dev-link" href="./artwork/" target="_blank" rel="noopener"><b>Sprite library ↗</b><span>Browse, animate, compare, and review every asset.</span></a>
    </section><section class="dev-card"><h3>See it in the village</h3><a class="dev-link" href="./artwork/checks.html" target="_blank" rel="noopener">Live sprite checks & all frames ↗</a><p>These previews use the real renderer and separate fixtures.</p><a class="dev-link" href="./?artwork-preview" target="_blank" rel="noopener">All buildings ↗</a><a class="dev-link" href="./?resident-preview" target="_blank" rel="noopener">Resident animations ↗</a><a class="dev-link" href="./?night-preview" target="_blank" rel="noopener">Night lighting ↗</a></section></div></section>
    <section data-dev-page="checks" hidden><div class="dev-grid"><section class="dev-card"><h3>Repeatable development check</h3><p>From the project folder, run:</p><pre>npm ci\nnpx playwright install chromium\nnpm run dev:check</pre><p>Builds the game, runs Rust and JavaScript checks, opens fixed desktop scenarios, and records screenshots and browser errors. The report is written to <code>artifacts/dev-check/index.html</code>.</p><button id="dev-report">Open latest local report</button><p id="dev-report-status" role="status"></p><p>A browser cannot run your terminal commands. Run the command locally, then open its report here.</p></section>
    <section class="dev-card"><h3>Capture this state</h3><p>Fix the camera and freeze the scene before taking comparable screenshots. Captures contain the game canvas; the development check also captures the complete interface.</p><div class="dev-actions"><button id="dev-fixed">Fix camera & pause</button><button id="dev-capture">Download scene PNG</button><button id="dev-bundle">Export diagnostic report</button></div><p>Reports include the current village state, resident decisions, and errors observed in this tab.</p><h4>Browser errors</h4><pre id="dev-errors"></pre></section></div></section>`;
  document.body.append(dialog);
  const $ = id => document.getElementById(id);
  const banner = document.createElement('div'); banner.id = 'dev-banner'; banner.hidden = true;
  banner.innerHTML = 'Development test scene · autosave off <button>Dev Tools</button>'; document.body.append(banner);
  const errors = [];
  let observedScenario;
  const recordError = error => { errors.push(String(error)); if (errors.length > 50) errors.shift(); };
  window.addEventListener('error', e => recordError(e.message));
  window.addEventListener('unhandledrejection', e => recordError(e.reason));
  function refresh() {
    const snapshot = api.snapshot();
    if (observedScenario !== api.scenario()) {
      observedScenario = api.scenario();
      if (scenarios.some(s => s.id === observedScenario)||observedScenario==='imported') {
        $('dev-scenario').value = observedScenario;
        $('dev-scenario').onchange();
      }
    }
    $('dev-mode').textContent = api.isSandbox() ? `Test scene · ${scenarios.find(s => s.id === api.scenario())?.name || (api.scenario()==='imported'?'Imported checkpoint':api.scenario())} · saved village protected` : 'Viewing your village · load a test scene to advance or experiment';
    banner.hidden = !api.isSandbox();
    $('dev-clock').textContent = clock(snapshot.village.minutes);
    $('dev-return').disabled = !api.isSandbox();
    for (const el of dialog.querySelectorAll('[data-dev-step],#dev-advance,#dev-run')) el.disabled = !api.isSandbox();
    $('dev-errors').textContent = errors.join('\n') || 'No errors observed by Dev Tools.';
    if (!$('dev-resident').options.length) for (const r of snapshot.residents) $('dev-resident').add(new Option(r.name, r.id));
    inspect();
  }
  function inspect() {
    const data = api.inspect(), id = Number($('dev-resident').value);
    const entry = data.residents.find(p => p.resident.id === id); if (!entry) return;
    const r = entry.resident;
    $('dev-follow').disabled=r.trip?.phase==='away';
    const sleep=r.sleep;
    const sim=data.simulation, day=sim?.days?.at(-1), times=day?.residents?.[r.id];
    const timeNote=times?`<h4>Observed time · Day ${day.day+1}</h4><p>${times.reduce((n,t)=>n+t,0).toFixed(1)} game minutes observed. This excludes time before observation began.</p><p>${times.map((n,i)=>`${escape(sim.labels[i])}: ${n.toFixed(1)} min`).join(' · ')}</p>`:'';
    const accounting=sim?`<details><summary>Material accounting · seed ${sim.seed}</summary><p>${escape(sim.note)}</p><p>Inventory model: ${escape(sim.inventory_model)}. Cargo remains owned while travelling.</p><table><thead><tr><th>Material</th><th>On hand</th><th>Reserved</th><th>Incoming</th><th>Difference</th></tr></thead><tbody>${sim.materials.map(m=>`<tr><td>${escape(m.material)}</td><td>${m.on_hand}</td><td>${m.reserved}</td><td>${m.incoming}</td><td>${m.difference===null?'Untracked':m.difference}</td></tr>`).join('')}</tbody></table><h4>Located materials</h4>${sim.logistics?.stores?.map(p=>`<p>${escape(p.owner.kind)} ${p.owner.id??''} · (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) · ${p.items.reduce((a,b)=>a+b,0)} / ${p.capacity}${p.blocker?'<br>'+escape(p.blocker):''}</p>`).join('')||''}<p>${sim.logistics?.shipments?.length||0} active resident deliveries</p></details>`:'';

    const sleepNote=sleep?.day>=0 ? `<p><b>Sleep plan:</b> bed at ${clock(sleep.bedtime)}${sleep.started_at!==null ? ` · ${sleep.duration_minutes/60}h target · ${Math.floor(sleep.slept_minutes)} minutes slept${sleep.wake_at!==null ? ' · wakes at '+clock(sleep.wake_at) : ' · interrupted'}` : ' · rest target chosen when asleep'}</p>` : '';

    $('dev-inspection').innerHTML = `<p><b>${escape(r.task)}</b> · ${r.requested ? 'requested' : 'autonomous'}<br>${escape(r.reason)}</p><p>Energy ${r.energy.toFixed(0)} · Hunger ${r.hunger.toFixed(0)} · Social ${r.social.toFixed(0)}<br>Destination (${r.target_x.toFixed(2)}, ${r.target_y.toFixed(2)}) · ${r.trip?'back at '+clock(r.trip.return_at):r.remaining.toFixed(1)+' task seconds left'}</p>${sleepNote}${timeNote}${accounting}<p><b>If choosing now:</b> ${escape(entry.next.task)}<br>${escape(entry.next.reason)}</p><p>This prediction runs the real chooser on a copy. An ongoing task may continue first. The alternatives below show request eligibility, not a priority score.</p><table><thead><tr><th>Alternative request</th><th>Current result</th></tr></thead><tbody>${entry.alternatives.map(a => `<tr><td>${escape(a.task)}</td><td>${escape(a.blocker || 'Available')}${a.blocker && !a.encouraged_blocker ? ' (explanation can overcome this)' : ''}</td></tr>`).join('')}</tbody></table><h4>Recent activity changes</h4><p>Recorded while diagnostics are enabled; latest 150 changes across all residents.</p><ol id="dev-history">${data.history.filter(d => d.resident === id).reverse().map(d => `<li>${clock(d.minute)} · ${escape(d.task)}<br>${escape(d.reason)}</li>`).join('') || '<li>No changes recorded yet. Advance the test scene or let the village run.</li>'}</ol>`;
  }
  async function act(fn) { try { await fn(); $('dev-message').textContent = ''; refresh(); } catch (e) { $('dev-message').textContent = e.message; } }
  function open() { api.observe(); refresh(); if (!dialog.open) dialog.showModal(); }
  $('dev-button').onclick = open; banner.querySelector('button').onclick = open;
  $('dev-close').onclick = () => dialog.close();
  for (const button of dialog.querySelectorAll('[data-dev-tab]')) button.onclick = () => {
    for (const item of dialog.querySelectorAll('[data-dev-tab]')) item.setAttribute('aria-pressed', String(item === button));
    for (const section of dialog.querySelectorAll('[data-dev-page]')) section.hidden = section.dataset.devPage !== button.dataset.devTab;
  };
  $('dev-scenario').onchange = () => { $('dev-load').disabled=$('dev-scenario').value==='imported'; $('dev-scenario-detail').textContent = scenarios.find(s => s.id === $('dev-scenario').value)?.detail || ($('dev-scenario').value==='imported'?'An exported checkpoint, restored in the protected test scene. Select a standard scene to start something else.':'A temporary copy of the village currently on screen.'); };
  $('dev-scenario').onchange();
  $('dev-load').onclick = () => act(() => api.loadScenario($('dev-scenario').value));
  $('dev-return').onclick = () => act(() => api.returnToVillage());
  for (const b of dialog.querySelectorAll('[data-dev-step]')) b.onclick = () => act(() => api.advance(Number(b.dataset.devStep)));
  $('dev-advance').onclick = () => act(() => api.advance(Number($('dev-minutes').value)));
  $('dev-run').onclick = () => { api.run(); dialog.close(); };
  $('dev-fixture').onclick = () => download(api.snapshot(), 'solar-friends-scenario.json');
  $('dev-import').onclick=()=>$('dev-import-file').click();
  $('dev-import-file').onchange=()=>act(async()=>{const file=$('dev-import-file').files[0];if(!file)return;try{if(file.size>5_000_000)throw new Error('Choose a checkpoint smaller than 5 MB.');api.importSandbox(await file.text());}finally{$('dev-import-file').value='';}});
  $('dev-inspect').onclick = inspect; $('dev-resident').onchange = inspect;
  $('dev-follow').onclick = () => { api.locate(Number($('dev-resident').value)); dialog.close(); };
  $('dev-fixed').onclick = () => { api.fixedView(); $('dev-message').textContent = 'Camera fixed and simulation paused.'; };
  $('dev-capture').onclick = () => api.capture();
  $('dev-bundle').onclick = () => download({ version: 1, capturedAt: new Date().toISOString(), scenario: api.scenario(), state: api.snapshot(), diagnostics: api.inspect(), errors }, 'solar-friends-diagnostics.json');
  $('dev-report').onclick = async () => {
    try {
      const response = await fetch('./dev-report/index.html', { cache: 'no-store' });
      if (!response.ok) throw new Error('Run npm run dev:check first.');
      const a = document.createElement('a'); a.href = './dev-report/index.html'; a.target = '_blank'; a.rel = 'noopener'; a.click();
    } catch (e) { $('dev-report-status').textContent = e.message; }
  };
  return { open, refresh };
}
