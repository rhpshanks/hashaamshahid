(() => {
'use strict';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TYPES = {
  source:    { name: 'Faucet',    hint: 'Creates resources out of nothing every step. Set how much on its outgoing connections.' },
  pool:      { name: 'Pool',      hint: 'Holds resources and pushes them along its outgoing connections. If it runs short, every output gets a fair share.' },
  drain:     { name: 'Sink',      hint: 'Removes resources from the economy and keeps a running total you can use in formulas.' },
  converter: { name: 'Converter', hint: 'Fires only when every input can pay its cost in full, then emits each of its outputs.' },
  gate:      { name: 'Gate',      hint: 'Lets flow through only while its condition holds, or by a percentage chance per unit.' }
};
const FN = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round,
             sqrt: Math.sqrt, pow: Math.pow, log: Math.log, abs: Math.abs };

const TPL = {
  idle: { name: 'Idle tycoon', log: true, warm: 90,
    nodes: [
      { id: 'a', type: 'source', label: 'Tap', x: 100, y: 110 },
      { id: 'b', type: 'source', label: 'Production', x: 100, y: 340 },
      { id: 'c', type: 'pool', label: 'Gold', x: 330, y: 225, start: '0', cap: '' },
      { id: 'd', type: 'converter', label: 'Buy generator', x: 560, y: 110, fires: '1' },
      { id: 'e', type: 'pool', label: 'Generators', x: 790, y: 110, start: '0', cap: '' },
      { id: 'f', type: 'converter', label: 'Buy upgrade', x: 560, y: 340, fires: '1' },
      { id: 'g', type: 'pool', label: 'Upgrades', x: 790, y: 340, start: '0', cap: '' }
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'c', rate: '1' },
      { id: 'e2', from: 'b', to: 'c', rate: 'generators * (1 + 0.5 * upgrades)' },
      { id: 'e3', from: 'c', to: 'd', rate: '10 * pow(1.15, generators)' },
      { id: 'e4', from: 'd', to: 'e', rate: '1' },
      { id: 'e5', from: 'c', to: 'f', rate: '60 * pow(2.2, upgrades)' },
      { id: 'e6', from: 'f', to: 'g', rate: '1' }
    ] },
  energy: { name: 'Energy & levels', log: false, warm: 80,
    nodes: [
      { id: 'a', type: 'source', label: 'Regen', x: 100, y: 120 },
      { id: 'b', type: 'pool', label: 'Energy', x: 320, y: 120, start: '30', cap: '30' },
      { id: 'c', type: 'converter', label: 'Play level', x: 540, y: 120, fires: '1' },
      { id: 'd', type: 'pool', label: 'Levels', x: 770, y: 40, start: '0', cap: '' },
      { id: 'e', type: 'pool', label: 'Coins', x: 770, y: 215, start: '0', cap: '' },
      { id: 'f', type: 'drain', label: 'Shop', x: 990, y: 215 },
      { id: 'g', type: 'source', label: 'Boss chest', x: 320, y: 380 },
      { id: 'h', type: 'gate', label: 'Boss unlocked', x: 540, y: 380, mode: 'cond', cond: 'levels >= 10', chance: '50' },
      { id: 'i', type: 'pool', label: 'Gems', x: 770, y: 380, start: '0', cap: '' }
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', rate: '1' },
      { id: 'e2', from: 'b', to: 'c', rate: '6' },
      { id: 'e3', from: 'c', to: 'd', rate: '1' },
      { id: 'e4', from: 'c', to: 'e', rate: '20 + 2 * levels' },
      { id: 'e5', from: 'e', to: 'f', rate: 'coins >= 100 ? 40 : 0' },
      { id: 'e6', from: 'g', to: 'h', rate: '5' },
      { id: 'e7', from: 'h', to: 'i', rate: '1' }
    ] },
  gacha: { name: 'Gacha pulls', log: true, warm: 70,
    nodes: [
      { id: 'a', type: 'source', label: 'Daily gems', x: 100, y: 210 },
      { id: 'b', type: 'pool', label: 'Gems', x: 320, y: 210, start: '0', cap: '' },
      { id: 'c', type: 'converter', label: 'Pull', x: 540, y: 210, fires: '10' },
      { id: 'd', type: 'pool', label: 'Pulls', x: 780, y: 90, start: '0', cap: '' },
      { id: 'e', type: 'gate', label: 'Rare roll', x: 780, y: 330, mode: 'chance', cond: 'step > 0', chance: '5' },
      { id: 'f', type: 'pool', label: 'Rares', x: 1000, y: 330, start: '0', cap: '' }
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', rate: '100' },
      { id: 'e2', from: 'b', to: 'c', rate: '160' },
      { id: 'e3', from: 'c', to: 'd', rate: '1' },
      { id: 'e4', from: 'c', to: 'e', rate: '1' },
      { id: 'e5', from: 'e', to: 'f', rate: '1' }
    ] },
  blank: { name: 'Blank canvas', log: false, warm: 0, nodes: [], edges: [] }
};

// ---------------------------------------------------------------- state
let G = { nodes: [], edges: [] };
let vars = {};
let S = null;
let sel = null;
let view = { x: 40, y: 40, k: 1 };
let running = false, timer = null, speed = 6;
let logScale = false;
let uid = 1000;
let connectMode = false, connectFrom = null;
let lastFocused = null;

const nodeById = id => G.nodes.find(n => n.id === id);
const edgeById = id => G.edges.find(e => e.id === id);
const outE = id => G.edges.filter(e => e.from === id);
const inE = id => G.edges.filter(e => e.to === id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function slug(s) {
  let v = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!v) v = 'node';
  if (/^\d/.test(v)) v = 'n_' + v;
  return v;
}
function rebuildVars() {
  vars = {};
  const used = new Set(Object.keys(FN).concat(['step']));
  for (const n of G.nodes) {
    const base = slug(n.label);
    let v = base, i = 2;
    while (used.has(v)) v = base + '_' + (i++);
    used.add(v);
    vars[n.id] = v;
  }
}
function varOwner(name) {
  for (const id in vars) if (vars[id] === name) return id;
  return null;
}

// ---------------------------------------------------------------- formulas
const cache = new Map();
function compile(src) {
  src = String(src == null ? '' : src).trim();
  if (!src) src = '0';
  if (cache.has(src)) return cache.get(src);
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(>=|<=|==|!=|&&|\|\||[-+*/%(),<>!?:]))/y;
  let out = '', err = null;
  const ids = [];
  while (!/^\s*$/.test(src.slice(re.lastIndex))) {
    const m = re.exec(src);
    if (!m) { err = 'This formula has a character it can’t read.'; break; }
    if (m[1] !== undefined) out += m[1];
    else if (m[2] !== undefined) {
      const id = m[2];
      if (FN[id]) out += 'F.' + id;
      else if (id === 'step') out += 'V.__step';
      else { ids.push(id); out += 'V["' + id + '"]'; }
    } else out += m[3];
    out += ' ';
  }
  let fn = null;
  if (!err) {
    try { fn = new Function('V', 'F', 'return (' + out + ');'); }
    catch (e) { err = 'This formula isn’t finished — check brackets and operators.'; }
  }
  const r = { fn, ids, err };
  cache.set(src, r);
  return r;
}
function evalx(src, V) {
  const c = compile(src);
  if (c.err) return { v: 0, err: c.err };
  for (const id of c.ids) if (!(id in V)) return { v: 0, err: 'Nothing is called “' + id + '”.' };
  let v;
  try { v = c.fn(V, FN); } catch (e) { return { v: 0, err: 'This formula isn’t finished.' }; }
  if (typeof v === 'boolean') v = v ? 1 : 0;
  if (typeof v !== 'number' || !isFinite(v)) return { v: 0, err: 'This formula doesn’t come out as a number.' };
  return { v };
}
function formulaIds(src) { const c = compile(src); return c.err ? [] : c.ids; }

// ---------------------------------------------------------------- simulation
function emptyScope() { const V = Object.create(null); V.__step = 0; return V; }
function startVal(n) { return Math.max(0, evalx(n.start || '0', emptyScope()).v); }
function capOf(n, V) {
  if (n.cap == null || !String(n.cap).trim()) return Infinity;
  const r = evalx(n.cap, V);
  return r.err ? Infinity : Math.max(0, r.v);
}
function resetSim() {
  S = { step: 0, val: {}, drained: {}, fired: {}, hist: [], flows: {}, errs: {} };
  for (const n of G.nodes) if (n.type === 'pool') S.val[n.id] = startVal(n);
  record();
}
function ensureVals() {
  for (const n of G.nodes) if (n.type === 'pool' && S.val[n.id] === undefined) S.val[n.id] = startVal(n);
}
function scope() {
  const V = Object.create(null);
  V.__step = S.step;
  for (const n of G.nodes) {
    const k = vars[n.id];
    if (n.type === 'pool') V[k] = S.val[n.id] || 0;
    else if (n.type === 'drain') V[k] = S.drained[n.id] || 0;
    else if (n.type === 'converter') V[k] = S.fired[n.id] || 0;
    else V[k] = 0;
  }
  return V;
}
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function roll(amt, p) {
  const n = Math.floor(amt), frac = amt - n;
  let hits = 0;
  if (n <= 500) { for (let i = 0; i < n; i++) if (Math.random() < p) hits++; }
  else hits = Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss()));
  if (frac > 0 && Math.random() < frac && Math.random() < p) hits++;
  return hits;
}

function stepSim() {
  ensureVals();
  const V = scope(), val = S.val, flows = {};
  const rate = e => Math.max(0, evalx(e.rate, V).v);
  const condOpen = g => !!evalx(g.cond, V).v;
  const pending = [];

  function arrive(e, amt, depth) {
    if (!(amt > 0)) return;
    const t = nodeById(e.to);
    if (!t || t.type === 'source' || t.type === 'converter') return;
    if (t.type === 'gate') {
      if (depth > 8) return;
      let pass = amt;
      if (t.mode === 'chance') pass = roll(amt, Math.min(1, Math.max(0, evalx(t.chance, V).v / 100)));
      else if (!condOpen(t)) return;
      flows[e.id] = (flows[e.id] || 0) + amt;
      const outs = outE(t.id);
      if (pass > 0 && outs.length) for (const o of outs) arrive(o, pass / outs.length, depth + 1);
      return;
    }
    flows[e.id] = (flows[e.id] || 0) + amt;
    if (t.type === 'pool') val[t.id] = Math.min(capOf(t, V), (val[t.id] || 0) + amt);
    else if (t.type === 'drain') S.drained[t.id] = (S.drained[t.id] || 0) + amt;
  }

  // 1. converters pay from the start-of-step balances
  for (const n of G.nodes) {
    if (n.type !== 'converter') continue;
    const ins = inE(n.id).filter(e => { const s = nodeById(e.from); return s && (s.type === 'pool' || s.type === 'source'); });
    if (!ins.length) continue;
    const outs = outE(n.id);
    const maxF = Math.min(1000, Math.max(0, Math.floor(evalx(n.fires || '1', V).v)));
    let fired = 0;
    for (let k = 0; k < maxF; k++) {
      const costs = ins.map(e => ({ e, s: nodeById(e.from), c: rate(e) }));
      if (!costs.every(x => x.s.type === 'source' || (val[x.s.id] || 0) + 1e-9 >= x.c)) break;
      for (const x of costs) {
        if (x.s.type === 'pool') val[x.s.id] = Math.max(0, (val[x.s.id] || 0) - x.c);
        flows[x.e.id] = (flows[x.e.id] || 0) + x.c;
      }
      for (const o of outs) pending.push([o, rate(o)]);
      fired++;
    }
    if (fired) S.fired[n.id] = (S.fired[n.id] || 0) + fired;
  }
  // 2. faucets create
  for (const n of G.nodes) {
    if (n.type !== 'source') continue;
    for (const e of outE(n.id)) {
      const t = nodeById(e.to);
      if (t && t.type !== 'converter') pending.push([e, rate(e)]);
    }
  }
  // 3. pools push, shared fairly when short
  for (const n of G.nodes) {
    if (n.type !== 'pool') continue;
    const outs = outE(n.id).filter(e => {
      const t = nodeById(e.to);
      return t && t.type !== 'converter' && t.type !== 'source' && !(t.type === 'gate' && t.mode !== 'chance' && !condOpen(t));
    });
    if (!outs.length) continue;
    const req = outs.map(e => [e, rate(e)]);
    const tot = req.reduce((a, x) => a + x[1], 0);
    if (tot <= 0) continue;
    const k = Math.min(1, Math.max(0, val[n.id] || 0) / tot);
    for (const [e, r] of req) {
      const a = r * k;
      if (a > 0) { val[n.id] = Math.max(0, val[n.id] - a); pending.push([e, a]); }
    }
  }
  // 4. deliver
  for (const [e, a] of pending) arrive(e, a, 0);

  S.step++;
  S.flows = flows;
  record();
}

const HIST_MAX = 1500;
function record() {
  const snap = { s: S.step, v: {} };
  for (const n of G.nodes) {
    if (n.type === 'pool') snap.v[n.id] = S.val[n.id] || 0;
    else if (n.type === 'drain') snap.v[n.id] = S.drained[n.id] || 0;
  }
  S.hist.push(snap);
  if (S.hist.length > HIST_MAX) S.hist.shift();
}

function lint() {
  const V = scope(), errs = {};
  for (const e of G.edges) {
    const a = nodeById(e.from);
    if (a && a.type === 'gate') continue;
    const r = evalx(e.rate, V);
    if (r.err) errs[e.id] = r.err;
  }
  for (const n of G.nodes) {
    let f = null;
    if (n.type === 'pool') {
      const r0 = evalx(n.start || '0', emptyScope());
      if (r0.err) { errs[n.id] = 'Starting amount must be a number, not a formula that uses other nodes.'; continue; }
      if (n.cap && String(n.cap).trim()) f = n.cap;
    } else if (n.type === 'converter') f = n.fires || '1';
    else if (n.type === 'gate') f = n.mode === 'chance' ? n.chance : n.cond;
    if (f != null) { const r = evalx(f, V); if (r.err) errs[n.id] = r.err; }
  }
  return errs;
}

// ---------------------------------------------------------------- formatting
function fmt(n) {
  if (n === Infinity) return '∞';
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) {
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
    let x = n, i = 0;
    while (Math.abs(x) >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    const ax = Math.abs(x);
    return (ax < 10 ? x.toFixed(2) : ax < 100 ? x.toFixed(1) : x.toFixed(0)) + u[i];
  }
  if (Number.isInteger(n)) return String(n);
  if (a < 10) return n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(1).replace(/\.0$/, '');
}

// ---------------------------------------------------------------- canvas
const svg = $('canvas'), world = $('world'), gRefs = $('refs'), gEdges = $('edges'),
      gNodes = $('nodes'), gParts = $('parts'), ghost = $('ghost'), stage = $('stage');

function mk(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function geom(e, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const rev = G.edges.some(x => x.from === e.to && x.to === e.from);
  const ox = rev ? -uy * 9 : 0, oy = rev ? ux * 9 : 0;
  const x1 = a.x + ux * 40 + ox, y1 = a.y + uy * 40 + oy, x2 = b.x - ux * 44 + ox, y2 = b.y - uy * 44 + oy;
  return { x1, y1, x2, y2, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 };
}
function shape(n, g) {
  const j = { class: 'body', 'stroke-linejoin': 'round' };
  switch (n.type) {
    case 'pool': mk('circle', { r: 30, class: 'body' }, g); break;
    case 'source': mk('path', Object.assign({ d: 'M0 -34 L33 23 L-33 23 Z' }, j), g); break;
    case 'drain': mk('path', Object.assign({ d: 'M0 34 L33 -23 L-33 -23 Z' }, j), g); break;
    case 'converter': mk('path', Object.assign({ d: 'M-22 -30 L32 0 L-22 30 Z' }, j), g);
      mk('line', { x1: -31, y1: -30, x2: -31, y2: 30, class: 'bar' }, g); break;
    case 'gate': mk('path', Object.assign({ d: 'M0 -34 L34 0 L0 34 L-34 0 Z' }, j), g); break;
  }
}
function badge(n, V) {
  switch (n.type) {
    case 'pool': return fmt(S.val[n.id] !== undefined ? S.val[n.id] : startVal(n));
    case 'drain': return fmt(S.drained[n.id] || 0);
    case 'converter': return '×' + fmt(S.fired[n.id] || 0);
    case 'gate': return n.mode === 'chance' ? fmt(evalx(n.chance, V).v) + '%' : (evalx(n.cond, V).v ? 'open' : 'shut');
    case 'source': return '+' + fmt(outE(n.id).reduce((a, e) => a + Math.max(0, evalx(e.rate, V).v), 0));
  }
  return '';
}
function trunc(s, n) { s = String(s).trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function renderCanvas() {
  world.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
  stage.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
  stage.style.backgroundSize = (22 * view.k) + 'px ' + (22 * view.k) + 'px';
  gRefs.textContent = ''; gEdges.textContent = ''; gNodes.textContent = '';
  const V = scope();
  const refTo = (src, x, y) => {
    for (const id of formulaIds(src)) {
      const owner = nodeById(varOwner(id));
      if (owner) mk('line', { x1: owner.x, y1: owner.y, x2: x, y2: y, class: 'ref' }, gRefs);
    }
  };

  for (const e of G.edges) {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) continue;
    const p = geom(e, a, b);
    const isSel = sel && sel.kind === 'edge' && sel.id === e.id;
    const live = (S.flows[e.id] || 0) > 0;
    const g = mk('g', { class: 'edge' + (isSel ? ' sel' : '') + (live ? ' live' : ''), 'data-eid': e.id }, gEdges);
    mk('line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, class: 'hit' }, g);
    mk('line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, class: 'ln',
      'marker-end': 'url(#' + (isSel ? 'mkSel' : live ? 'mkLive' : 'mkEdge') + ')' }, g);
    if (a.type === 'gate') continue;
    refTo(e.rate, p.lx, p.ly);
    const plain = /^\s*\d*\.?\d+\s*$/.test(e.rate);
    let text = trunc(e.rate, 22);
    if (!plain && !S.errs[e.id]) text += ' = ' + fmt(Math.max(0, evalx(e.rate, V).v));
    const tg = mk('g', { transform: 'translate(' + p.lx + ' ' + p.ly + ')', class: 'elabel' + (S.errs[e.id] ? ' err' : '') }, g);
    const t = mk('text', { 'text-anchor': 'middle', y: 4 }, tg);
    t.textContent = text;
    let bb;
    try { bb = t.getBBox(); } catch (err) { bb = null; }
    if (bb && bb.width) tg.insertBefore(mk('rect', { x: bb.x - 6, y: bb.y - 3, width: bb.width + 12, height: bb.height + 6, rx: 5 }), t);
  }

  for (const n of G.nodes) {
    if (n.type === 'converter') refTo(n.fires || '1', n.x, n.y);
    if (n.type === 'gate') refTo(n.mode === 'chance' ? n.chance : n.cond, n.x, n.y);
    if (n.type === 'pool' && n.cap) refTo(n.cap, n.x, n.y);
    const isSel = sel && sel.kind === 'node' && sel.id === n.id;
    const g = mk('g', { class: 'node t-' + n.type + (isSel ? ' sel' : '') + (connectFrom === n.id ? ' from' : '') + (S.errs[n.id] ? ' err' : ''),
      transform: 'translate(' + n.x + ' ' + n.y + ')', 'data-id': n.id, tabindex: 0, role: 'button',
      'aria-label': TYPES[n.type].name + ': ' + n.label }, gNodes);
    shape(n, g);
    const by = n.type === 'source' ? 11 : n.type === 'drain' ? -5 : n.type === 'converter' ? 4 : 4;
    const bx = n.type === 'converter' ? -6 : 0;
    const bt = mk('text', { class: 'val', 'text-anchor': 'middle', x: bx, y: by }, g);
    bt.textContent = badge(n, V);
    const lt = mk('text', { class: 'lbl', 'text-anchor': 'middle', y: 56 }, g);
    lt.textContent = n.label;
    mk('circle', { class: 'port', cx: 46, cy: 0, r: 7, 'data-port': n.id }, g);
  }
  $('empty').hidden = G.nodes.length > 0;
}

// particles along live connections
let parts = [], rafOn = false;
function spawnParticles() {
  if (reduceMotion) return;
  const now = performance.now(), dur = Math.max(180, Math.min(700, 900 / speed));
  for (const e of G.edges) if ((S.flows[e.id] || 0) > 0) parts.push({ eid: e.id, t0: now, dur });
  if (parts.length > 160) parts = parts.slice(-160);
  if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
}
function tick(now) {
  gParts.textContent = '';
  parts = parts.filter(p => now - p.t0 < p.dur);
  for (const p of parts) {
    const e = edgeById(p.eid); if (!e) continue;
    const a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) continue;
    const q = geom(e, a, b), t = Math.max(0, (now - p.t0) / p.dur);
    const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    mk('circle', { cx: q.x1 + (q.x2 - q.x1) * k, cy: q.y1 + (q.y2 - q.y1) * k, r: 4, class: 'part' }, gParts);
  }
  if (parts.length) requestAnimationFrame(tick); else { rafOn = false; gParts.textContent = ''; }
}

function fitView() {
  const r = svg.getBoundingClientRect();
  if (!G.nodes.length || !r.width || !r.height) { view = { x: 40, y: 40, k: 1 }; return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of G.nodes) { x0 = Math.min(x0, n.x - 70); y0 = Math.min(y0, n.y - 60); x1 = Math.max(x1, n.x + 70); y1 = Math.max(y1, n.y + 80); }
  const k = Math.min(1.2, Math.max(0.3, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
  view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
}
function zoomBy(f) {
  const r = svg.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
  const k = Math.min(2.5, Math.max(0.3, view.k * f));
  view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k;
  renderCanvas();
}

// ---------------------------------------------------------------- editing
function select(s) {
  sel = s;
  renderInspector();
  renderCanvas();
}
function addNode(type) {
  const r = svg.getBoundingClientRect();
  const c = { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
  const base = TYPES[type].name;
  let label = base, i = 2;
  while (G.nodes.some(n => n.label === label)) label = base + ' ' + (i++);
  const off = (G.nodes.length % 6) * 22 - 55;
  const n = { id: 'n' + (uid++), type, label, x: Math.round(c.x + off), y: Math.round(c.y + off) };
  if (type === 'pool') { n.start = '0'; n.cap = ''; }
  if (type === 'converter') n.fires = '1';
  if (type === 'gate') { n.mode = 'cond'; n.cond = 'step > 10'; n.chance = '50'; }
  G.nodes.push(n);
  rebuildVars(); ensureVals(); record(); S.hist.pop();
  S.errs = lint();
  select({ kind: 'node', id: n.id });
  save(); scheduleChart();
}
function addEdge(from, to) {
  if (from === to) return;
  const a = nodeById(from), b = nodeById(to);
  if (!a || !b) return;
  if (b.type === 'source') { toast('A faucet can’t receive anything. Connect into a pool, sink, converter or gate.'); return; }
  if (a.type === 'drain') { toast('A sink only removes resources, so it can’t send any onward.'); return; }
  if (G.edges.some(e => e.from === from && e.to === to)) { toast('Those two are already connected.'); return; }
  const e = { id: 'e' + (uid++), from, to, rate: '1' };
  G.edges.push(e);
  S.errs = lint();
  select({ kind: 'edge', id: e.id });
  save();
}
function deleteSel() {
  if (!sel) return;
  if (sel.kind === 'node') {
    const id = sel.id;
    G.nodes = G.nodes.filter(n => n.id !== id);
    G.edges = G.edges.filter(e => e.from !== id && e.to !== id);
    delete S.val[id];
    if (connectFrom === id) connectFrom = null;
    rebuildVars();
  } else {
    G.edges = G.edges.filter(e => e.id !== sel.id);
  }
  S.errs = lint();
  select(null);
  save(); scheduleChart();
}
function setConnect(on) {
  connectMode = on; connectFrom = null;
  $('connect').setAttribute('aria-pressed', String(on));
  stage.classList.toggle('connecting', on);
  $('modehint').hidden = !on;
  $('modehint').textContent = 'Connect mode — tap the node resources come from';
  renderCanvas();
}

function toWorld(ev) {
  const r = svg.getBoundingClientRect();
  return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
}
let drag = null;
svg.addEventListener('pointerdown', ev => {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  const port = ev.target.closest('[data-port]');
  const nodeEl = ev.target.closest('.node');
  const edgeEl = ev.target.closest('.edge');
  const w = toWorld(ev);
  try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  if (port && !connectMode) {
    const n = nodeById(port.dataset.port);
    drag = { kind: 'link', from: n.id };
    ghost.setAttribute('x1', n.x); ghost.setAttribute('y1', n.y);
    ghost.setAttribute('x2', w.x); ghost.setAttribute('y2', w.y);
    ghost.setAttribute('visibility', 'visible');
    return;
  }
  if (nodeEl) {
    const id = nodeEl.dataset.id, n = nodeById(id);
    if (connectMode) {
      if (!connectFrom) {
        connectFrom = id;
        $('modehint').textContent = 'Now tap where the resources go';
        select({ kind: 'node', id });
      } else {
        const from = connectFrom;
        connectFrom = null;
        $('modehint').textContent = 'Connect mode — tap the node resources come from';
        addEdge(from, id);
      }
      drag = null;
      return;
    }
    if (!(sel && sel.kind === 'node' && sel.id === id)) select({ kind: 'node', id });
    drag = { kind: 'move', id, dx: w.x - n.x, dy: w.y - n.y, moved: false };
    return;
  }
  if (edgeEl) { select({ kind: 'edge', id: edgeEl.dataset.eid }); drag = null; return; }
  if (connectMode && connectFrom) { connectFrom = null; $('modehint').textContent = 'Connect mode — tap the node resources come from'; }
  if (sel) select(null);
  drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y };
});
svg.addEventListener('pointermove', ev => {
  if (!drag) return;
  if (drag.kind === 'move') {
    const w = toWorld(ev), n = nodeById(drag.id);
    if (!n) { drag = null; return; }
    n.x = Math.round(w.x - drag.dx); n.y = Math.round(w.y - drag.dy); drag.moved = true;
    renderCanvas();
  } else if (drag.kind === 'pan') {
    view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy;
    renderCanvas();
  } else if (drag.kind === 'link') {
    const w = toWorld(ev);
    ghost.setAttribute('x2', w.x); ghost.setAttribute('y2', w.y);
  }
});
function endDrag(ev) {
  if (!drag) return;
  if (drag.kind === 'link') {
    ghost.setAttribute('visibility', 'hidden');
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    const tn = hit && hit.closest ? hit.closest('.node') : null;
    if (tn && tn.dataset.id !== drag.from) addEdge(drag.from, tn.dataset.id);
  }
  if (drag.kind === 'move' && drag.moved) save();
  drag = null;
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', () => { ghost.setAttribute('visibility', 'hidden'); drag = null; });
svg.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const k = Math.min(2.5, Math.max(0.3, view.k * Math.exp(-ev.deltaY * 0.0015)));
  view.x = mx - (mx - view.x) * (k / view.k); view.y = my - (my - view.y) * (k / view.k); view.k = k;
  renderCanvas();
}, { passive: false });
svg.addEventListener('keydown', ev => {
  const nodeEl = ev.target.closest && ev.target.closest('.node');
  if (nodeEl && (ev.key === 'Enter')) { ev.preventDefault(); select({ kind: 'node', id: nodeEl.dataset.id }); }
});

// ---------------------------------------------------------------- inspector
function rateMeaning(e) {
  const a = nodeById(e.from), b = nodeById(e.to);
  if (b.type === 'converter') return a.type === 'source'
    ? 'Cost per firing. A faucet always covers it.'
    : 'Cost per firing, paid from ' + a.label + '. The converter waits until it can pay in full.';
  if (a.type === 'converter') return 'Amount sent each time ' + a.label + ' fires.';
  if (a.type === 'pool') return 'Amount pushed each step. If ' + a.label + ' runs short, its outputs share what’s there.';
  return 'Amount created each step.';
}
function namesHTML() {
  const names = G.nodes.map(n => vars[n.id]).concat(['step']);
  return '<h4>Names you can use</h4><div class="names">' +
    names.map(v => '<button type="button" data-ins="' + esc(v) + '">' + esc(v) + '</button>').join('') +
    '</div><p class="hint" style="margin-top:8px">Also min, max, floor, ceil, round, sqrt, pow, log, abs, comparisons and <code>a ? b : c</code>.</p>';
}
function renderInspector() {
  const box = $('inspector');
  if (!sel) {
    box.innerHTML =
      '<h3>Build an economy</h3>' +
      '<ol class="steps">' +
      '<li>Add nodes from the left rail.</li>' +
      '<li>Drag from the small handle on a node’s right edge onto another node to connect them. On touch, use <b>Connect</b>.</li>' +
      '<li>Select a connection and give it a rate — a number, or a formula like <code>10 * pow(1.15, generators)</code>.</li>' +
      '<li>Press <b>Play</b> and watch the pools below.</li></ol>' +
      '<h4>How a step runs</h4>' +
      '<p>Converters pay and fire first, then faucets create, then pools push. Everything lands at the end of the step, so order on the canvas never matters.</p>' +
      '<p>Dashed lines show which nodes a formula reads from.</p>' +
      '<h4>Shortcuts</h4>' +
      '<p><span class="kbd">Space</span> play or pause &nbsp; <span class="kbd">→</span> step<br><span class="kbd">Delete</span> remove selected &nbsp; <span class="kbd">Esc</span> deselect</p>';
    return;
  }
  if (sel.kind === 'node') {
    const n = nodeById(sel.id);
    if (!n) { sel = null; renderInspector(); return; }
    let h = '<div class="ins-head"><span class="chip t-' + n.type + '">' + TYPES[n.type].name + '</span>' +
      '<button type="button" class="del" data-act="del">Delete</button></div>' +
      '<p class="hint">' + TYPES[n.type].hint + '</p>' +
      '<label class="f"><span>Name</span><input id="f-label" value="' + esc(n.label) + '" autocomplete="off"></label>' +
      '<p class="hint">In formulas: <code id="f-var">' + esc(vars[n.id]) + '</code></p>' +
      '<div class="live"><span>' + ({ pool: 'Holding', drain: 'Removed so far', converter: 'Times fired', gate: 'Right now', source: 'Creating per step' }[n.type]) + '</span><b id="live-val"></b></div>';
    if (n.type === 'pool') {
      h += '<label class="f"><span>Starting amount</span><input id="f-start" class="mono" value="' + esc(n.start || '0') + '" autocomplete="off"></label>' +
        '<label class="f"><span>Capacity</span><input id="f-cap" class="mono" value="' + esc(n.cap || '') + '" placeholder="No limit" autocomplete="off"></label>' +
        '<p class="hint">Starting amount takes effect when you reset. Anything above capacity is lost.</p>';
    } else if (n.type === 'converter') {
      h += '<label class="f"><span>Most firings per step</span><input id="f-fires" class="mono" value="' + esc(n.fires || '1') + '" autocomplete="off"></label>';
    } else if (n.type === 'gate') {
      const chance = n.mode === 'chance';
      h += '<div class="seg" role="group" aria-label="Gate mode">' +
        '<button type="button" data-mode="cond" aria-pressed="' + (!chance) + '">Condition</button>' +
        '<button type="button" data-mode="chance" aria-pressed="' + chance + '">Chance</button></div>' +
        (chance
          ? '<label class="f"><span>Chance each unit passes (%)</span><input id="f-chance" class="mono" value="' + esc(n.chance) + '" autocomplete="off"></label>'
          : '<label class="f"><span>Open while</span><input id="f-cond" class="mono" value="' + esc(n.cond) + '" autocomplete="off"></label>') +
        '<p class="hint">What passes is split evenly across this gate’s outputs.</p>';
    }
    h += '<p class="err" id="err-node"></p>';
    const outs = outE(n.id), ins = inE(n.id);
    if (n.type !== 'gate' && n.type !== 'drain') {
      h += '<h4>' + (n.type === 'converter' ? 'Outputs per firing' : 'Outputs') + '</h4>';
      if (!outs.length) h += '<p class="hint">None yet. Drag from this node’s handle to add one.</p>';
      for (const e of outs) {
        const t = nodeById(e.to);
        const isConvIn = t.type === 'converter';
        h += '<div class="conn"><label for="r-' + e.id + '">→ ' + esc(t.label) + (isConvIn ? ' <span class="hint">(cost per firing)</span>' : '') + '</label>' +
          '<input id="r-' + e.id + '" data-eid="' + e.id + '" value="' + esc(e.rate) + '" autocomplete="off"><p class="err" data-err="' + e.id + '"></p></div>';
      }
    }
    if (n.type === 'converter') {
      h += '<h4>Cost per firing</h4>';
      if (!ins.length) h += '<p class="hint">Connect a pool into this converter to give it a cost.</p>';
      for (const e of ins) {
        const s = nodeById(e.from);
        h += '<div class="conn"><label for="r-' + e.id + '">' + esc(s.label) + ' →</label>' +
          '<input id="r-' + e.id + '" data-eid="' + e.id + '" value="' + esc(e.rate) + '" autocomplete="off"><p class="err" data-err="' + e.id + '"></p></div>';
      }
    }
    box.innerHTML = h + namesHTML();
  } else {
    const e = edgeById(sel.id);
    if (!e) { sel = null; renderInspector(); return; }
    const a = nodeById(e.from), b = nodeById(e.to);
    let h = '<div class="ins-head"><span class="chip">Connection</span><button type="button" class="del" data-act="del">Delete</button></div>' +
      '<h3>' + esc(a.label) + ' → ' + esc(b.label) + '</h3>';
    if (a.type === 'gate') {
      h += '<p>' + esc(a.label) + ' splits whatever it lets through evenly across its outputs, so this connection has no rate of its own.</p>';
    } else {
      h += '<label class="f"><span>Rate</span><input id="f-rate" class="mono" value="' + esc(e.rate) + '" autocomplete="off"></label>' +
        '<p class="hint">' + esc(rateMeaning(e)) + '</p><p class="err" id="err-edge"></p>';
    }
    h += '<div class="live"><span>Moved last step</span><b id="live-flow"></b></div>';
    box.innerHTML = h + (a.type === 'gate' ? '' : namesHTML());
  }
  updateErrors();
  updateLive();
}
function updateErrors() {
  const ne = $('err-node'); if (ne && sel) ne.textContent = S.errs[sel.id] || '';
  const ee = $('err-edge'); if (ee && sel) ee.textContent = S.errs[sel.id] || '';
  document.querySelectorAll('[data-err]').forEach(p => { p.textContent = S.errs[p.dataset.err] || ''; });
}
function updateLive() {
  $('stepN').textContent = S.step.toLocaleString();
  if (!sel) return;
  const lv = $('live-val'), lf = $('live-flow');
  if (lv && sel.kind === 'node') {
    const n = nodeById(sel.id);
    if (n) lv.textContent = badge(n, scope()).replace(/^×/, '');
  }
  if (lf && sel.kind === 'edge') lf.textContent = fmt(S.flows[sel.id] || 0);
}

const ins = $('inspector');
ins.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.eid) {
    const e = edgeById(t.dataset.eid);
    if (e) { e.rate = t.value; afterEdit(); }
    return;
  }
  if (!sel) return;
  if (sel.kind === 'edge' && t.id === 'f-rate') { const e = edgeById(sel.id); if (e) { e.rate = t.value; afterEdit(); } return; }
  const n = sel.kind === 'node' ? nodeById(sel.id) : null;
  if (!n) return;
  if (t.id === 'f-label') {
    n.label = t.value.trim() || TYPES[n.type].name;
    rebuildVars();
    const fv = $('f-var'); if (fv) fv.textContent = vars[n.id];
    const names = ins.querySelector('.names');
    if (names) names.innerHTML = G.nodes.map(x => vars[x.id]).concat(['step']).map(v => '<button type="button" data-ins="' + esc(v) + '">' + esc(v) + '</button>').join('');
  } else if (t.id === 'f-start') {
    n.start = t.value;
    if (S.step === 0) { S.val[n.id] = startVal(n); S.hist = []; record(); }
  } else if (t.id === 'f-cap') n.cap = t.value;
  else if (t.id === 'f-fires') n.fires = t.value;
  else if (t.id === 'f-cond') n.cond = t.value;
  else if (t.id === 'f-chance') n.chance = t.value;
  afterEdit();
});
ins.addEventListener('focusin', ev => { if (ev.target.matches('input')) lastFocused = ev.target; });
ins.addEventListener('mousedown', ev => { if (ev.target.closest('[data-ins]')) ev.preventDefault(); });
ins.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'del') { deleteSel(); return; }
  if (b.dataset.mode && sel && sel.kind === 'node') {
    const n = nodeById(sel.id);
    n.mode = b.dataset.mode;
    renderInspector(); afterEdit();
    return;
  }
  if (b.dataset.ins) {
    let inp = lastFocused && document.body.contains(lastFocused) && lastFocused.id !== 'f-label' ? lastFocused : null;
    if (!inp) inp = $('f-rate') || ins.querySelector('input[data-eid]') || ins.querySelector('#f-cond, #f-chance, #f-fires, #f-cap');
    if (!inp) return;
    const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    const e2 = inp.selectionEnd != null ? inp.selectionEnd : s;
    inp.value = inp.value.slice(0, s) + b.dataset.ins + inp.value.slice(e2);
    inp.focus();
    const pos = s + b.dataset.ins.length;
    try { inp.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
function afterEdit() {
  S.errs = lint();
  renderCanvas(); updateErrors(); updateLive(); save(); scheduleChart();
}

// ---------------------------------------------------------------- run controls
function setPlayUI() {
  $('play').setAttribute('aria-pressed', String(running));
  $('playLbl').textContent = running ? 'Pause' : 'Play';
  $('playIco').innerHTML = running
    ? '<rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/>'
    : '<path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor"/>';
}
function play() { if (running) return; running = true; setPlayUI(); loop(); }
function pause() { running = false; clearTimeout(timer); setPlayUI(); }
function loop() { if (!running) return; doStep(); if (running) timer = setTimeout(loop, 1000 / speed); }
function doStep() {
  stepSim();
  S.errs = lint();
  renderCanvas(); spawnParticles(); updateLive(); updateErrors(); scheduleChart();
  if (S.step >= 20000) { pause(); toast('Paused at step 20,000. Reset to run again.'); }
}
function doReset() {
  pause(); resetSim(); S.errs = lint();
  renderCanvas(); updateLive(); updateErrors(); scheduleChart();
}
$('play').addEventListener('click', () => running ? pause() : play());
$('step').addEventListener('click', () => { pause(); doStep(); });
$('reset').addEventListener('click', doReset);
$('speed').addEventListener('input', ev => { speed = +ev.target.value; $('speedV').textContent = speed + '/s'; });
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { if (connectMode) setConnect(false); addNode(b.dataset.add); }));
$('connect').addEventListener('click', () => setConnect(!connectMode));
$('zin').addEventListener('click', () => zoomBy(1.2));
$('zout').addEventListener('click', () => zoomBy(1 / 1.2));
$('fit').addEventListener('click', () => { fitView(); renderCanvas(); });
$('logScale').addEventListener('change', ev => { logScale = ev.target.checked; save(); scheduleChart(); });

document.addEventListener('keydown', ev => {
  if (ev.target.closest && ev.target.closest('input, textarea, select, dialog')) {
    if (ev.key === 'Escape' && ev.target.blur) ev.target.blur();
    return;
  }
  if (ev.key === ' ' && !(ev.target.closest && ev.target.closest('button'))) { ev.preventDefault(); running ? pause() : play(); }
  else if (ev.key === 'ArrowRight') { ev.preventDefault(); pause(); doStep(); }
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) { ev.preventDefault(); deleteSel(); }
  else if (ev.key === 'Escape') { if (connectMode) setConnect(false); select(null); }
});

// ---------------------------------------------------------------- templates, save, toast
function toast(msg, actLabel, act) {
  const t = $('toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (actLabel ? '<button type="button">' + esc(actLabel) + '</button>' : '');
  t.hidden = false;
  if (act) t.querySelector('button').addEventListener('click', () => { act(); t.hidden = true; });
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 6000);
}
function bumpUid() {
  for (const x of G.nodes.concat(G.edges)) {
    const m = /^[ne](\d+)$/.exec(x.id);
    if (m) uid = Math.max(uid, +m[1] + 1);
  }
}
function boot(warm) {
  rebuildVars(); cache.clear(); pause();
  if (connectMode) setConnect(false);
  sel = null;
  resetSim();
  for (let i = 0; i < warm && G.nodes.length; i++) stepSim();
  S.flows = {};
  S.errs = lint();
  $('logScale').checked = logScale;
  fitView();
  renderCanvas(); renderInspector(); updateLive(); scheduleChart();
}
function loadTemplate(key, withUndo) {
  const t = TPL[key];
  if (!t) return;
  const prev = withUndo ? JSON.stringify({ G, logScale }) : null;
  G = JSON.parse(JSON.stringify({ nodes: t.nodes, edges: t.edges }));
  logScale = t.log;
  bumpUid();
  boot(t.warm);
  save();
  if (prev) toast('Opened “' + t.name + '”.', 'Undo', () => { const d = JSON.parse(prev); G = d.G; logScale = d.logScale; bumpUid(); boot(0); save(); });
}
const KEY = 'faucet-sink-model-v1';
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ G, logScale })); } catch (e) { /* storage unavailable */ }
}
function validModel(d) {
  if (!d || !d.G || !Array.isArray(d.G.nodes) || !Array.isArray(d.G.edges)) return false;
  const ids = new Set();
  for (const n of d.G.nodes) {
    if (!n || typeof n.id !== 'string' || !TYPES[n.type] || typeof n.x !== 'number' || typeof n.y !== 'number') return false;
    n.label = String(n.label || TYPES[n.type].name);
    ids.add(n.id);
  }
  d.G.edges = d.G.edges.filter(e => e && typeof e.id === 'string' && ids.has(e.from) && ids.has(e.to));
  d.G.edges.forEach(e => { e.rate = String(e.rate == null ? '1' : e.rate); });
  return true;
}
function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!validModel(d) || !d.G.nodes.length) return false;
    G = d.G; logScale = !!d.logScale;
    return true;
  } catch (e) { return false; }
}
$('tpl').addEventListener('change', ev => {
  const key = ev.target.value;
  ev.target.value = '';
  if (key) loadTemplate(key, true);
});
$('ioBtn').addEventListener('click', () => {
  $('ioText').value = JSON.stringify({ G, logScale }, null, 1);
  $('ioErr').textContent = '';
  $('io').showModal();
  $('ioText').select();
});
$('ioOpen').addEventListener('click', () => {
  let d;
  try { d = JSON.parse($('ioText').value); } catch (e) { $('ioErr').textContent = 'That text isn’t a model. Paste the full text you copied from here, including the outer braces.'; return; }
  if (!validModel(d)) { $('ioErr').textContent = 'That text is missing nodes or connections this tool needs.'; return; }
  const prev = JSON.stringify({ G, logScale });
  G = d.G; logScale = !!d.logScale;
  bumpUid(); boot(0); save();
  $('io').close();
  toast('Opened your model.', 'Undo', () => { const p = JSON.parse(prev); G = p.G; logScale = p.logScale; bumpUid(); boot(0); save(); });
});

// ---------------------------------------------------------------- chart
let chartQueued = false, chartGeo = null;
function scheduleChart() {
  if (chartQueued) return;
  chartQueued = true;
  requestAnimationFrame(() => { chartQueued = false; renderChart(); });
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function renderChart() {
  const c = $('chart'), wrap = $('chartWrap');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  c.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  c.textContent = '';
  chartGeo = null;
  const all = G.nodes.filter(n => n.type === 'pool' || n.type === 'drain');
  const series = all.slice(0, 8);
  $('chartNote').textContent = all.length > 8 ? 'Showing the first 8 of ' + all.length + ' pools and sinks.' : '';
  $('legend').innerHTML = series.map((n, i) =>
    '<span class="lg"><i style="background:var(--s' + (i + 1) + ')"></i>' + esc(n.label) + (n.type === 'drain' ? ' <em>removed</em>' : '') + '</span>').join('');
  const hist = S.hist;
  if (!series.length || hist.length < 2) {
    const t = mk('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, c);
    t.textContent = series.length ? 'Press Play or Step to see pools change.' : 'Add a pool to chart it here.';
    return;
  }
  const direct = series.length <= 4 && W > 520;
  const L = 50, R = direct ? 130 : 14, T = 8, B = 22;
  const pw = Math.max(40, W - L - R), ph = Math.max(30, H - T - B);
  const s0 = hist[0].s, s1 = hist[hist.length - 1].s;
  let ymax = 0;
  for (const h of hist) for (const n of series) { const v = h.v[n.id]; if (v > ymax) ymax = v; }
  const tf = v => logScale ? Math.log10(1 + Math.max(0, v || 0)) : Math.max(0, v || 0);
  let top, ticks = [];
  if (logScale) {
    const pmax = Math.max(1, Math.ceil(Math.log10(1 + ymax)));
    top = pmax;
    const stepP = Math.max(1, Math.ceil(pmax / 4));
    for (let p = 0; p <= pmax; p += stepP) ticks.push({ y: p, label: p === 0 ? '0' : fmt(Math.pow(10, p)) });
  } else {
    top = niceMax(ymax);
    for (let i = 0; i <= 4; i++) ticks.push({ y: top * i / 4, label: fmt(top * i / 4) });
  }
  const X = s => L + (s1 === s0 ? 0 : (s - s0) / (s1 - s0)) * pw;
  const Y = v => T + ph - (tf(v) / top) * ph;
  const Yt = t => T + ph - (t / top) * ph;
  for (const tk of ticks) {
    const y = Yt(tk.y);
    mk('line', { x1: L, x2: L + pw, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1 }, c);
    const t = mk('text', { x: L - 8, y: y + 3.5, 'text-anchor': 'end' }, c);
    t.textContent = tk.label;
  }
  const xt = 5;
  for (let i = 0; i <= xt; i++) {
    const s = Math.round(s0 + (s1 - s0) * i / xt);
    const t = mk('text', { x: X(s), y: T + ph + 16, 'text-anchor': i === 0 ? 'start' : i === xt ? 'end' : 'middle' }, c);
    t.textContent = i === xt ? 'step ' + s : String(s);
  }
  mk('line', { x1: L, x2: L + pw, y1: T + ph, y2: T + ph, stroke: 'var(--edge)', 'stroke-width': 1 }, c);

  const every = Math.max(1, Math.ceil(hist.length / pw));
  const sample = [];
  for (let i = 0; i < hist.length; i += every) sample.push(hist[i]);
  if (sample[sample.length - 1] !== hist[hist.length - 1]) sample.push(hist[hist.length - 1]);

  const ends = [];
  series.forEach((n, i) => {
    let d = '';
    sample.forEach((h, j) => { d += (j ? 'L' : 'M') + X(h.s).toFixed(1) + ' ' + Y(h.v[n.id]).toFixed(1); });
    mk('path', { d, fill: 'none', stroke: 'var(--s' + (i + 1) + ')', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, c);
    const last = hist[hist.length - 1], v = last.v[n.id] || 0;
    mk('circle', { cx: X(last.s), cy: Y(v), r: 3.5, fill: 'var(--s' + (i + 1) + ')', stroke: 'var(--surface)', 'stroke-width': 2 }, c);
    ends.push({ n, i, v, y: Y(v) });
  });
  if (direct) {
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    const over = ends.length ? ends[ends.length - 1].y - (T + ph) : 0;
    if (over > 0) ends.forEach(e => { e.y -= over; });
    for (const e of ends) {
      const x = L + pw + 10;
      mk('line', { x1: x, x2: x + 8, y1: e.y, y2: e.y, stroke: 'var(--s' + (e.i + 1) + ')', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, c);
      const t = mk('text', { x: x + 13, y: e.y + 4, class: 'dl' }, c);
      const tv = mk('tspan', { class: 'v' }, t); tv.textContent = fmt(e.v) + ' ';
      const tn = mk('tspan', {}, t); tn.textContent = trunc(e.n.label, 12);
    }
  }
  const cross = mk('line', { x1: 0, x2: 0, y1: T, y2: T + ph, stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' }, c);
  const hit = mk('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' }, c);
  chartGeo = { L, pw, s0, s1, series, cross, X };
  hit.addEventListener('pointermove', chartHover);
  hit.addEventListener('pointerleave', () => { $('ctip').hidden = true; cross.setAttribute('visibility', 'hidden'); });
}
function chartHover(ev) {
  if (!chartGeo) return;
  const g = chartGeo, wrap = $('chartWrap'), r = wrap.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const s = Math.round(g.s0 + Math.min(1, Math.max(0, (x - g.L) / g.pw)) * (g.s1 - g.s0));
  const h = S.hist.find(q => q.s === s) || S.hist[S.hist.length - 1];
  const cx = g.X(h.s);
  g.cross.setAttribute('x1', cx); g.cross.setAttribute('x2', cx); g.cross.setAttribute('visibility', 'visible');
  const tip = $('ctip');
  tip.innerHTML = '<b>Step ' + h.s + '</b>' + g.series.map((n, i) =>
    '<br><i style="background:var(--s' + (i + 1) + ')"></i>' + esc(n.label) + '<span class="n">' + fmt(h.v[n.id] || 0) + '</span>').join('');
  tip.hidden = false;
  const tw = tip.offsetWidth;
  tip.style.left = (cx + 14 + tw > r.width ? cx - 14 - tw : cx + 14) + 'px';
  tip.style.top = '6px';
}
if (window.ResizeObserver) new ResizeObserver(() => scheduleChart()).observe($('chartWrap'));
else window.addEventListener('resize', scheduleChart);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderCanvas(); scheduleChart(); });

// ---------------------------------------------------------------- start
if (restore()) { bumpUid(); boot(40); }
else loadTemplate('idle', false);
})();
