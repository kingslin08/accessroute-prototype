'use strict';
/* AccessRoute front end. Talks to server.py over /api/*. No libraries needed. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = p => Math.round(p * 100) + '%';
const NS = 'http://www.w3.org/2000/svg';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- icons (24x24 line icons) ---------- */
const DOTS = [[7, 7], [12, 7], [17, 7], [7, 12], [12, 12], [17, 12], [7, 17], [12, 17], [17, 17]]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="currentColor" stroke="none"/>`).join('');
const ICON = {
  stairs: '<path d="M4 20h5v-5h5v-5h6"/>',
  steep_slope: '<path d="M3 19L21 7v12z"/>',
  broken_surface: '<path d="M3 19h18M3 12l4-3 3 5 3-6 3 5 4-2"/>',
  construction: '<path d="M12 4l5 14H7zM5 20h14M9.5 12h5"/>',
  blocked_path: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  narrow_path: '<path d="M4 5v14M20 5v14M8 12h8M11 9l-3 3 3 3M13 9l3 3-3 3"/>',
  missing_curb_ramp: '<path d="M3 17h7v-6h11M3 21h18"/>',
  no_tactile_paving: DOTS,
  wheelchair: '<circle cx="11" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M11 8v6h5l2.5 5M11 11h4.5M7.5 12a5 5 0 1 0 6.5 7.3"/>',
  elderly: '<circle cx="10" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M10 8v6l-2 6M10 14l3 6M10 9.5l3 2M16 20V10a2 2 0 0 1 4 0"/>',
  low_vision: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  injured: '<circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M12 8v6l-3 6M12 14l2 6M12 9l-3 2M6 9l-2 11M4 9h4"/>',
  standard: '<circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M12 8v5l-3 7M12 13l3 7M12 9l-3 3M12 9l3 3"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  bad: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
};
const ico = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name] || ''}</svg>`;

const PROFILE_HINT = {
  wheelchair: 'Stairs, steep slopes, narrow gaps and missing ramps are hard stops.',
  elderly: 'Avoids stairs, rough ground and roadworks where it can.',
  low_vision: 'Needs tactile paving at crossings; avoids roadworks and obstacles.',
  injured: 'On crutches: avoids stairs, slopes and uneven ground.',
  standard: 'No accessibility needs. This is what a normal map shows.',
};
const FEED_KIND = { report: 'Report', camera: 'Camera', alert: 'Route alert', time: 'Clock', system: 'Demo' };

/* ---------- state ---------- */
const state = {
  boot: null, profile: 'wheelchair', start: null, goal: null,
  route: null, selectedEdge: null, inspector: null, compare: true, picking: null,
  tab: 'route', lastRouteSig: '', notice: null,
  prefs: { barrier: 'construction', present: '1', conf: 80, who: 'neha', label: 'construction_barrier', cconf: 90, cam: 0 },
  nodeById: {}, edgeById: {}, lines: new Map(), size: 400, cells: 8, spacing: 50,
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res;
  try { res = await fetch('/api/' + path, opt); }
  catch (e) { throw new Error('Cannot reach the AccessRoute server. Is "py server.py" still running?'); }
  const data = await res.json().catch(() => ({ error: 'The server sent an unreadable answer.' }));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { showBanner([{ message: e.message }]); console.error(e); } };

/* ---------- init ---------- */
async function init() {
  const b = await api('bootstrap');
  state.boot = b;
  state.size = b.size;
  state.cells = Math.round(Math.sqrt(b.nodes.length)) - 1;
  state.spacing = b.size / state.cells;
  b.nodes.forEach(n => { state.nodeById[n.id] = n; });
  b.edges.forEach(e => { state.edgeById[e.id] = e; });
  state.start = b.defaults.start;
  state.goal = b.defaults.goal;
  buildPlates();
  buildSelects();
  buildMapStatic();
  bindEvents();
  setClock(b.clock);
  renderFeed(b.feed);
  await refresh();
}

/* ---------- left panel ---------- */
function buildPlates() {
  const wrap = $('#plates');
  wrap.innerHTML = state.boot.profiles.map(p => `
    <button type="button" class="plate" role="radio" data-key="${p.key}" aria-checked="${p.key === state.profile}" tabindex="${p.key === state.profile ? 0 : -1}">
      ${ico(p.key, 30)}
      <span><b>${esc(p.label)}</b><small>${esc(PROFILE_HINT[p.key] || '')}</small></span>
    </button>`).join('');
}
function selectProfile(key) {
  state.profile = key;
  $$('.plate').forEach(b => {
    const on = b.dataset.key === key;
    b.setAttribute('aria-checked', on);
    b.tabIndex = on ? 0 : -1;
  });
  return refresh();
}
function buildSelects() {
  const opts = state.boot.pois.map(p => `<option value="${p.node}">${esc(p.name)}</option>`).join('');
  $('#from').innerHTML = opts;
  $('#to').innerHTML = opts;
  $('#from').value = state.start;
  $('#to').value = state.goal;
}
function ensureOption(sel, nodeId) {
  if (![...sel.options].some(o => o.value === String(nodeId))) {
    const o = document.createElement('option');
    o.value = nodeId;
    o.textContent = 'Corner of ' + state.nodeById[nodeId].label;
    sel.appendChild(o);
  }
  sel.value = nodeId;
}
const nodeName = id => (state.nodeById[id] || {}).label || 'this place';

/* ---------- map (static layers) ---------- */
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
const SY = y => state.size - y;

function buildMapStatic() {
  const s = state.spacing, n = state.cells;
  const blocks = $('#layer-blocks'), edges = $('#layer-edges'), hit = $('#layer-hit');
  blocks.textContent = edges.textContent = hit.textContent = '';
  // Main Road: the demo city's row of crossings lies between rows 3 and 4.
  el('rect', { x: -22, y: SY(4 * s), width: state.size + 44, height: s, fill: '#CBD3DB' }, blocks);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (j === 3) continue;
    const green = (i === 2 && j === 2) || (i === 5 && j === 5);
    el('rect', { x: i * s + 7, y: SY((j + 1) * s) + 7, width: s - 14, height: s - 14, rx: 5, fill: green ? '#D3E7D8' : '#DCE2E8' }, blocks);
  }
  [[2.5, 2.5, 'Park'], [5.5, 5.5, 'Hill']].forEach(([i, j, t]) => {
    const tx = el('text', { x: i * s, y: SY(j * s) - 14, 'text-anchor': 'middle', class: 'lbl park' }, blocks);
    tx.textContent = t;
  });
  [1.5, 4.5, 7.5].forEach(i => {
    const tx = el('text', { x: i * s, y: SY(3.5 * s) + 3, 'text-anchor': 'middle', class: 'lbl road' }, blocks);
    tx.textContent = 'Main Rd';
  });

  state.lines.clear();
  state.boot.edges.forEach(e => {
    const a = state.nodeById[e.a], b = state.nodeById[e.b];
    const ln = el('line', { x1: a.x, y1: SY(a.y), x2: b.x, y2: SY(b.y), class: `edge k-${e.kind} s-ok`, 'data-kind': e.kind }, edges);
    state.lines.set(e.id, ln);
    const h = el('line', { x1: a.x, y1: SY(a.y), x2: b.x, y2: SY(b.y), class: 'hit', 'data-edge': e.id }, hit);
    el('title', {}, h).textContent = `${e.name}. Click to inspect.`;
  });
  state.boot.nodes.forEach(nd => {
    const c = el('circle', { cx: nd.x, cy: SY(nd.y), r: 9, class: 'node-pick', 'data-node': nd.id }, hit);
    el('title', {}, c).textContent = nd.label;
  });
}

/* ---------- map (dynamic layers) ---------- */
const pathD = nodes => nodes.map((id, i) => {
  const n = state.nodeById[id];
  return `${i ? 'L' : 'M'}${n.x} ${SY(n.y)}`;
}).join(' ');
const edgeMid = id => {
  const e = state.edgeById[id], a = state.nodeById[e.a], b = state.nodeById[e.b];
  return [(a.x + b.x) / 2, SY((a.y + b.y) / 2)];
};
const topIssue = issues => issues.slice().sort((a, b) => (b.blocking - a.blocking) || (b.belief - a.belief))[0];

function renderMap() {
  const d = state.route, st = d.edge_status;
  for (const [id, ln] of state.lines) {
    const s = (st[id] && st[id].state) || 'ok';
    ln.setAttribute('class', `edge k-${ln.dataset.kind} s-${s}`);
  }
  const g = $('#layer-dyn');
  g.textContent = '';

  if (state.selectedEdge) {
    const e = state.edgeById[state.selectedEdge], a = state.nodeById[e.a], b = state.nodeById[e.b];
    el('line', { x1: a.x, y1: SY(a.y), x2: b.x, y2: SY(b.y), class: 'halo' }, g);
  }

  const r = d.route, nv = d.naive;
  if (state.compare && nv.differs) {
    el('path', { d: pathD(nv.nodes), class: 'normal-line' }, g);
    const seen = new Set();
    nv.issues.forEach(i => {
      if (seen.has(i.edge)) return;
      seen.add(i.edge);
      const [x, y] = edgeMid(i.edge);
      el('circle', { cx: x, cy: y, r: 19, class: 'normal-hit' }, g);
    });
  }

  const sig = r.nodes.join(',');
  const fresh = sig !== state.lastRouteSig && !REDUCED;
  state.lastRouteSig = sig;
  el('path', { d: pathD(r.nodes), class: 'route-casing' }, g);
  el('path', { d: pathD(r.nodes), class: 'route-line' + (fresh ? ' draw' : ''), pathLength: 1 }, g);

  // Barrier signs. Ring fill = confidence.
  const R = 15, C = 2 * Math.PI * R;
  Object.entries(st).forEach(([id, info]) => {
    if (!info.issues.length) return;
    const i = topIssue(info.issues);
    const cls = i.blocking ? 'blocked' : (i.uncertain ? 'uncertain' : 'caution');
    const [x, y] = edgeMid(id);
    const sg = el('g', { class: `sign ${cls}`, transform: `translate(${x} ${y})`, 'data-edge': id }, g);
    el('title', {}, sg).textContent = `${i.label} on ${i.street}. ${pct(i.belief)} sure. Click to inspect.`;
    el('circle', { class: 'ring-track', r: R }, sg);
    el('circle', { class: 'ring-arc', r: R, 'stroke-dasharray': `${i.belief * C} ${C}`, transform: 'rotate(-90)' }, sg);
    el('rect', { class: 'plate-bg', x: -10, y: -10, width: 20, height: 20, rx: 4 }, sg);
    const ic = el('g', { transform: 'translate(-7 -7) scale(0.5833)', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, sg);
    ic.innerHTML = ICON[i.barrier];
    if (info.issues.length > 1) {
      el('text', { class: 'badge', x: 11, y: -10 }, sg).textContent = '+' + (info.issues.length - 1);
    }
  });

  // Place names, then start/goal pins on top.
  state.boot.pois.forEach(p => {
    const n = state.nodeById[p.node];
    const right = n.x > state.size * 0.75;
    const t = el('text', { class: 'lbl', x: n.x + (right ? -12 : 12), y: SY(n.y) - 11, 'text-anchor': right ? 'end' : 'start' }, g);
    t.textContent = p.name;
  });
  const pin = (id, cls, letter, dark) => {
    const n = state.nodeById[id];
    el('circle', { cx: n.x, cy: SY(n.y), r: 9, class: cls }, g);
    el('text', { x: n.x, y: SY(n.y) + 3, class: 'pin-text' + (dark ? ' dark' : '') }, g).textContent = letter;
  };
  pin(r.nodes[0], 'pin-start', 'A', false);
  pin(r.nodes[r.nodes.length - 1], 'pin-goal', 'B', true);
}

/* ---------- route result ---------- */
function renderResult() {
  const d = state.route, r = d.route, nv = d.naive;
  let status;
  if (r.status === 'best_effort') {
    status = `<div class="status bad">${ico('bad', 22)}<span>No fully accessible route exists right now. The least-bad option still has ${r.blocking} blocking barrier${r.blocking === 1 ? '' : 's'}.</span></div>`;
  } else if (r.unverified) {
    status = `<div class="status warn">${ico('warn', 22)}<span>Accessible, with ${r.unverified} unverified warning${r.unverified === 1 ? '' : 's'} to watch.</span></div>`;
  } else {
    status = `<div class="status ok">${ico('ok', 22)}<span>Fully accessible. No known blocking barriers.</span></div>`;
  }

  let compare;
  if (nv.differs) {
    const max = Math.max(r.distance_m, nv.distance_m);
    const seen = new Set();
    const hits = nv.issues.filter(i => { const k = i.edge + i.barrier; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6).map(i => `<li><span class="tag ${i.blocking ? '' : 'soft'}">${i.blocking ? 'Stops you' : 'Harder'}</span><span>${esc(i.label)} on ${esc(i.street)}${i.detail ? ' (' + esc(i.detail) + ')' : ''}</span></li>`).join('');
    compare = `
      <div class="compare">
        <h3>Why not the shortest way?</h3>
        <p>A normal map would send you ${Math.round(nv.distance_m)} m through ${nv.issues.length} barrier${nv.issues.length === 1 ? '' : 's'}${nv.blocking ? `, ${nv.blocking} of which would stop you` : ''}.</p>
        <div class="bars">
          <div class="bar"><span>Your route</span><i class="b-you" style="width:${(r.distance_m / max) * 100}%"></i><span>${Math.round(r.distance_m)} m</span></div>
          <div class="bar"><span>Normal map</span><i class="b-normal" style="width:${(nv.distance_m / max) * 100}%"></i><span>${Math.round(nv.distance_m)} m</span></div>
        </div>
        <ul class="hits">${hits}</ul>
      </div>`;
  } else {
    compare = `<div class="compare"><p>The shortest way is already the best way for you, so a normal map would give the same route.</p></div>`;
  }

  const steps = r.steps.map(s => {
    const w = s.warnings.map(t => {
      const cls = t.startsWith('BLOCKED') ? 'blocked' : (t.startsWith('Caution') ? 'caution' : '');
      return `<li class="warning ${cls}">${esc(t)}</li>`;
    }).join('');
    return `<li><span class="txt">${esc(s.text)}</span>${w ? `<ul>${w}</ul>` : ''}</li>`;
  }).join('');

  $('#pane-route').innerHTML = `
    <p class="headline">${Math.round(r.distance_m)} m<small> about ${Math.round(r.minutes)} min for ${esc(d.profile_label.toLowerCase())}</small></p>
    ${status}
    ${compare}
    <h3>Directions</h3>
    <ol class="steps">
      <li><span class="txt">Start at ${esc(nodeName(r.nodes[0]))}</span></li>
      ${steps}
      <li><span class="txt">Arrive at ${esc(nodeName(r.nodes[r.nodes.length - 1]))}</span></li>
    </ol>`;
}

/* ---------- places ---------- */
async function loadPlaces() {
  const d = await api('places?profile=' + state.profile);
  const VERDICT = { accessible: 'Accessible', partial: 'Partly accessible', not_accessible: 'Not accessible' };
  $('#pane-places').innerHTML = `
    <p class="hint" style="margin-bottom:6px">Entrance check for ${esc(state.route ? state.route.profile_label.toLowerCase() : 'you')}. Old information is flagged so nobody is sent somewhere on a guess.</p>` +
    d.places.map(p => `
    <article class="place">
      <h3>${esc(p.poi)}</h3>
      <span class="pill ${p.verdict}">${VERDICT[p.verdict]}</span>
      <ul>${p.reasons.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="${p.confidence === 'low' ? 'stale' : 'hint'}">${p.last_verified_days_ago === 0 ? 'Checked today' : `Last checked ${p.last_verified_days_ago} days ago`}${p.confidence === 'low' ? '. Please re-check before you go.' : '.'}</p>
      <details>
        <summary>Update this entrance</summary>
        <form class="form poi-form" data-poi="${p.id}" style="margin-top:10px">
          <div class="row">
            <div><label class="lbl" for="ps-${p.id}">Entrance steps</label><input id="ps-${p.id}" name="entrance_steps" type="number" min="0" max="30" value="${p.entrance_steps}"></div>
            <div><label class="lbl" for="pd-${p.id}">Door width (m)</label><input id="pd-${p.id}" name="door_width_m" type="number" min="0.3" max="3" step="0.05" value="${p.door_width_m}"></div>
          </div>
          <label class="radio"><span style="display:flex;gap:8px;align-items:center;padding:8px 10px;border:2px solid var(--line);border-radius:8px;width:100%;font-weight:700;font-size:14px"><input type="checkbox" name="ramp" ${p.ramp ? 'checked' : ''}> There is a ramp</span></label>
          <button class="secondary" type="submit">Save changes</button>
        </form>
      </details>
    </article>`).join('');
}

/* ---------- inspector ---------- */
async function loadInspector(id) {
  state.inspector = await api(`edge?id=${encodeURIComponent(id)}&profile=${state.profile}`);
  renderInspector();
}
function sparkline(b) {
  if (!b.forecast.length) return '';
  const W = 144, H = 36;
  const pts = b.forecast.map(([h, p]) => `${(2 + (h / 72) * (W - 4)).toFixed(1)},${(H - 3 - p * (H - 8)).toFixed(1)}`).join(' ');
  const yb = (H - 3 - 0.6 * (H - 8)).toFixed(1);
  const days = b.half_life_days < 1 ? `${Math.round(b.half_life_days * 24)} hours` : `${b.half_life_days} days`;
  return `<div class="spark">If nobody reports again, confidence over the next 3 days (loses half its weight every ${days}):
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Forecast of confidence fading">
      <line x1="0" x2="${W}" y1="${yb}" y2="${yb}" stroke="#C8102E" stroke-dasharray="3 3" stroke-width="1"/>
      <polyline points="${pts}" fill="none" stroke="#10243E" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>
    <span>The red line is where a route is blocked.</span></div>`;
}
function issueList() {
  const st = state.route ? state.route.edge_status : {};
  const rows = Object.entries(st).filter(([, v]) => v.issues.length).map(([id, v]) => [id, topIssue(v.issues)])
    .sort((a, b) => (b[1].blocking - a[1].blocking) || (b[1].belief - a[1].belief)).slice(0, 14);
  if (!rows.length) return `<p class="empty">Nothing on this map affects ${esc(state.route ? state.route.profile_label.toLowerCase() : 'you')}.</p>`;
  return `<ul class="list-issues">${rows.map(([id, i]) => `
    <li><button type="button" data-edge="${id}">${ico(i.barrier, 18)} <b>${esc(i.label)}</b> on ${esc(i.street)}. ${i.blocking ? 'Blocks you' : (i.uncertain ? 'Unverified' : 'Caution')}, ${pct(i.belief)} sure.</button></li>`).join('')}</ul>`;
}
function renderInspector() {
  const box = $('#inspector'), P = state.prefs, B = state.boot;
  const d = state.inspector;
  const list = `<h3>Barriers that affect you on this map</h3>${issueList()}`;
  if (!d) {
    box.innerHTML = `<h2>Street details</h2><p class="empty">Click any street or sign on the map, or choose one from the list, to see what is known about it and to report a problem.</p>${list}`;
    return;
  }
  const e = d.edge, raw = state.edgeById[e.id];
  const kindText = { sidewalk: 'footpath', crossing: 'road crossing', path: 'shortcut path' }[e.kind] || 'footpath';
  const facts = [`${e.length} m ${kindText}`, `${e.width_m} m wide`, `${e.slope_pct}% slope`];
  if (e.steps) facts.push(`${e.steps} steps`);
  if (e.surface === 'broken') facts.push('poor surface');
  const stateText = { confirmed: 'Confirmed', unverified: 'Unverified', unlikely: 'Low confidence' };
  const barriers = d.barriers.length ? d.barriers.map(b => `
    <li class="barrier ${b.state}">
      <div class="b-head">${ico(b.barrier, 22)}<span>${esc(b.label)}</span><span class="pctnum">${pct(b.belief)}</span></div>
      <div class="meter" role="img" aria-label="${pct(b.belief)} sure"><i style="width:${Math.round(b.belief * 100)}%"></i></div>
      <p class="b-sub"><b>${stateText[b.state]}.</b> ${esc(b.support)}${b.detail ? ` (${esc(b.detail)})` : ''}</p>
      <p class="b-sub">${esc(b.impact_text)}.</p>
      ${sparkline(b)}
    </li>`).join('') : `<li class="empty">No barriers known or reported on this stretch.</li>`;

  const bopts = B.barriers.map(b => `<option value="${b.key}" ${b.key === P.barrier ? 'selected' : ''}>${esc(b.label)}</option>`).join('');
  const wopts = B.reporters.map(r => `<option value="${r.id}" ${r.id === P.who ? 'selected' : ''}>${esc(r.name)}, trust ${pct(r.trust)}</option>`).join('');
  const lopts = B.vision_labels.map(l => `<option value="${l.key}" ${l.key === P.label ? 'selected' : ''}>${esc(l.text)}</option>`).join('');
  const copts = B.cameras.map((c, i) => `<option value="${i}" ${i === P.cam ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const notice = k => state.notice && state.notice.form === k ? `<p class="result-line" role="status">${esc(state.notice.text)}</p>` : '';

  box.innerHTML = `
    <h2>${esc(e.name)}</h2>
    <p class="meta">From ${esc(nodeName(raw.a))} to ${esc(nodeName(raw.b))}.</p>
    <p class="meta">${esc(facts.join(', '))}.</p>
    <h3>What we know</h3>
    <ul class="barriers">${barriers}</ul>

    <h3>Report a problem</h3>
    <form id="report-form" class="form" data-edge="${e.id}">
      <div><label class="lbl" for="r-barrier">What is the problem?</label><select id="r-barrier">${bopts}</select></div>
      <div class="radio" role="radiogroup" aria-label="Is it there?">
        <label><input type="radio" name="present" value="1" ${P.present === '1' ? 'checked' : ''}> It is here</label>
        <label><input type="radio" name="present" value="0" ${P.present === '0' ? 'checked' : ''}> It is gone</label>
      </div>
      <div><label class="lbl" for="r-conf">How sure are you?</label>
        <div class="range-line"><input id="r-conf" type="range" min="20" max="100" step="5" value="${P.conf}"><output id="r-conf-o">${P.conf}%</output></div></div>
      <div><label class="lbl" for="r-who">Reporting as</label><select id="r-who">${wopts}</select>
        <p class="hint">Each person counts once, however often they report. Try two different people.</p></div>
      <button class="secondary" type="submit">Send report</button>
      ${notice('report')}
    </form>

    <details>
      <summary>Try the camera pipeline</summary>
      <form id="camera-form" class="form" data-edge="${e.id}" style="margin-top:10px">
        <p class="hint">Simulates a photo from a bus or delivery robot. The detector's label is matched to the nearest street by GPS, then added as evidence.</p>
        <div><label class="lbl" for="c-label">What did the camera see?</label><select id="c-label">${lopts}</select></div>
        <div><label class="lbl" for="c-conf">Detector confidence</label>
          <div class="range-line"><input id="c-conf" type="range" min="30" max="100" step="5" value="${P.cconf}"><output id="c-conf-o">${P.cconf}%</output></div></div>
        <div><label class="lbl" for="c-cam">Which camera?</label><select id="c-cam">${copts}</select></div>
        <div class="row">
          <button class="secondary" type="submit">Analyze frame</button>
          <button class="secondary" type="button" data-action="offmap">Frame off the map</button>
        </div>
        ${notice('camera')}
      </form>
    </details>
    ${list}`;
}
function selectEdge(id) {
  state.selectedEdge = id;
  state.notice = null;
  renderMap();
  return loadInspector(id).then(() => { $('#inspector').scrollTop = 0; });
}

/* ---------- feed, clock, banner ---------- */
function renderFeed(list) {
  $('#feed').innerHTML = list.map(f => `<li class="${f.kind}"><time>${esc(f.time)}</time><div><b>${FEED_KIND[f.kind] || 'Update'}</b>${esc(f.text)}</div></li>`).join('');
}
function setClock(c) { const t = $('#clock'); t.textContent = c.label; t.dateTime = c.iso; }
function showBanner(alerts) {
  if (!alerts.length) return;
  $('#banner-text').textContent = alerts.map(a => a.message).join(' ');
  $('#banner').hidden = false;
}

/* ---------- data flow ---------- */
async function refresh() {
  const q = new URLSearchParams({ profile: state.profile, start: state.start, goal: state.goal });
  state.route = await api('route?' + q);
  renderMap();
  renderResult();
  if (state.selectedEdge) await loadInspector(state.selectedEdge); else renderInspector();
  if (state.tab === 'places') await loadPlaces();
}
async function mutate(path, body) {
  const out = await api(path, body);
  setClock(out.clock);
  renderFeed(out.feed);
  if (out.alerts && out.alerts.length) showBanner(out.alerts);
  await refresh();
  return out;
}

/* ---------- events ---------- */
function setPicking(which) {
  state.picking = state.picking === which ? null : which;
  $('#map').classList.toggle('picking', !!state.picking);
  $('#pick-from').setAttribute('aria-pressed', state.picking === 'from');
  $('#pick-to').setAttribute('aria-pressed', state.picking === 'to');
}
function setTab(name) {
  state.tab = name;
  ['route', 'places'].forEach(t => {
    const on = t === name;
    $('#tab-' + t).setAttribute('aria-selected', on);
    $('#tab-' + t).tabIndex = on ? 0 : -1;
    $('#pane-' + t).hidden = !on;
  });
  if (name === 'places') return loadPlaces();
}

function bindEvents() {
  // profile plates (radio group with arrow keys)
  $('#plates').addEventListener('click', guard(e => { const b = e.target.closest('.plate'); if (b) return selectProfile(b.dataset.key); }));
  $('#plates').addEventListener('keydown', guard(e => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const list = state.boot.profiles.map(p => p.key);
    const i = list.indexOf(state.profile) + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
    const next = list[(i + list.length) % list.length];
    $(`.plate[data-key="${next}"]`).focus();
    return selectProfile(next);
  }));

  $('#from').addEventListener('change', guard(() => { state.start = +$('#from').value; return refresh(); }));
  $('#to').addEventListener('change', guard(() => { state.goal = +$('#to').value; return refresh(); }));
  $('#go').addEventListener('click', guard(async () => {
    state.start = +$('#from').value; state.goal = +$('#to').value; setTab('route');
    await refresh();
    $('#pane-route').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }));
  $('#pick-from').addEventListener('click', () => setPicking('from'));
  $('#pick-to').addEventListener('click', () => setPicking('to'));
  $('#compare').addEventListener('change', e => { state.compare = e.target.checked; renderMap(); });
  $('#banner-close').addEventListener('click', () => { $('#banner').hidden = true; });

  // tabs
  $('#tab-route').addEventListener('click', () => setTab('route'));
  $('#tab-places').addEventListener('click', guard(() => setTab('places')));

  // map clicks: signs, streets, junctions (when picking)
  $('#map').addEventListener('click', guard(e => {
    const node = e.target.closest('[data-node]');
    if (node && state.picking) {
      const id = +node.dataset.node;
      if (state.picking === 'from') { state.start = id; ensureOption($('#from'), id); } else { state.goal = id; ensureOption($('#to'), id); }
      setPicking(state.picking);
      return refresh();
    }
    const t = e.target.closest('[data-edge]');
    if (t && !state.picking) return selectEdge(t.dataset.edge);
  }));

  // clock
  $$('.clock [data-hours]').forEach(b => b.addEventListener('click', guard(() => mutate('time', { hours: +b.dataset.hours }))));
  $('#reset').addEventListener('click', guard(async () => {
    await api('reset', {});
    state.selectedEdge = null; state.inspector = null; state.notice = null; state.lastRouteSig = '';
    $('#banner').hidden = true;
    const b = await api('bootstrap');
    setClock(b.clock); renderFeed(b.feed);
    await refresh();
  }));

  // inspector: delegated, because it is re-rendered often
  const box = $('#inspector');
  box.addEventListener('click', guard(e => {
    const b = e.target.closest('button[data-edge]');
    if (b) return selectEdge(b.dataset.edge);
    if (e.target.closest('[data-action="offmap"]')) return sendFrame(true);
  }));
  box.addEventListener('input', e => {
    const P = state.prefs;
    if (e.target.id === 'r-conf') { P.conf = +e.target.value; $('#r-conf-o').textContent = P.conf + '%'; }
    if (e.target.id === 'c-conf') { P.cconf = +e.target.value; $('#c-conf-o').textContent = P.cconf + '%'; }
  });
  box.addEventListener('change', e => {
    const P = state.prefs;
    if (e.target.id === 'r-barrier') P.barrier = e.target.value;
    if (e.target.id === 'r-who') P.who = e.target.value;
    if (e.target.name === 'present') P.present = e.target.value;
    if (e.target.id === 'c-label') P.label = e.target.value;
    if (e.target.id === 'c-cam') P.cam = +e.target.value;
  });
  box.addEventListener('submit', guard(async e => {
    e.preventDefault();
    if (e.target.id === 'report-form') {
      const P = state.prefs;
      const out = await mutate('report', { edge_id: state.selectedEdge, barrier: P.barrier, present: P.present === '1', confidence: P.conf / 100, reporter: P.who });
      state.notice = { form: 'report', text: `Confidence in this barrier moved from ${pct(out.result.before)} to ${pct(out.result.after)}.` };
      renderInspector();
    }
    if (e.target.id === 'camera-form') return sendFrame(false);
  }));

  // places: update entrance
  $('#pane-places').addEventListener('submit', guard(e => {
    e.preventDefault();
    const f = e.target;
    return mutate('poi', { id: f.dataset.poi, entrance_steps: +f.entrance_steps.value, door_width_m: +f.door_width_m.value, ramp: f.ramp.checked });
  }));
}

async function sendFrame(offmap) {
  const P = state.prefs;
  const out = await mutate('vision', {
    edge_id: state.selectedEdge, label: P.label, confidence: P.cconf / 100,
    source: state.boot.cameras[P.cam], offmap,
  });
  const r = out.result;
  const text = r.accepted.length
    ? `Matched to ${r.accepted[0].street}. Confidence moved from ${pct(r.accepted[0].before)} to ${pct(r.accepted[0].after)}.`
    : `Frame discarded: ${r.rejected[0] ? r.rejected[0].reason : 'nothing detected'}. It could not be trusted, so nothing changed.`;
  state.notice = { form: 'camera', text };
  renderInspector();
  const d = $('#camera-form') && $('#camera-form').closest('details');
  if (d) d.open = true;
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => {
    $('#pane-route').innerHTML = `<div class="status bad"><span>${esc(e.message)}</span></div>`;
    console.error(e);
  });
});
