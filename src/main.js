import { analyse as runAnalysis, migrateModel, migrateModelWithReport, edgeKey, layerInput, layerKinds, orientation, FACES, LAYERS, migrateProject, newScenarioId, matchSpaces, functionalSummary, ranks, MAX_SCENARIOS, DEFAULT_OPTIONS } from './engine/index.ts';
import { escapeHtml as esc } from './util/html.ts';
import { t, getLang, setLang, applyI18n } from './i18n.js';
import { GLOSSARY } from './glossary.js';

const $ = id => document.getElementById(id);
const MONO = 'Menlo, Consolas, Courier New, monospace';
const C = { paper: '#f3efe6', panel: '#faf8f2', ink: '#1c1b18', ink2: '#5a564c', muted: '#8c8679', rule: '#d8d2c4', accent: '#b23a2e', wall: '#2a2824' };
const W0 = 760, H0 = 480, ASPECT = W0 / H0;
const SVGNS = 'http://www.w3.org/2000/svg';
const narrow = matchMedia('(max-width: 899px)');
const VALIDATED = {
  nodes: [
    { id: 'X', name: 'Exterior (carrier)', x: 90, y: 235 }, { id: 'E', name: 'Central corridor', x: 250, y: 235 },
    { id: 'B', name: 'Top-middle room', x: 250, y: 95 }, { id: 'C', name: 'Top-right room', x: 400, y: 120 },
    { id: 'D', name: 'Bottom-left room', x: 245, y: 375 }, { id: 'I', name: 'Bottom-right room', x: 470, y: 265 },
    { id: 'A', name: 'Top-left room', x: 110, y: 375 }, { id: 'F', name: 'Bottom-center room', x: 390, y: 390 },
    { id: 'G', name: 'Upper small room', x: 610, y: 255 }, { id: 'H', name: 'Lower small room', x: 470, y: 440 },
  ],
  edges: [['A', 'D'], ['D', 'E'], ['D', 'F'], ['E', 'B'], ['E', 'C'], ['E', 'I'], ['F', 'H'], ['I', 'G'], ['X', 'E']],
  root: 'X',
};

/* ---------------- ESTADO ---------------- */
let project = migrateProject(migrateModel(VALIDATED), t('scn.default', { n: 1 }));
let model = project.scenarios[0].model, R = null;
let cmpView = 'maps', cmpSel = null, cmpRef = null, cmpOther = null; // comparação: visão, cenários incluídos (null = todos), par do Δ
let byId = new Map();
let conv = { entropy: DEFAULT_OPTIONS.entropy, differenceFactor: DEFAULT_OPTIONS.differenceFactor };
let currentMeasure = 'integ', showValues = false, snap = false, radius = 0, projector = false;
const gridSize = 20;
let bg = { img: null, op: 0.5, rot: 0, scale: 1, dx: 0, dy: 0 };
let mode = 'select', view = 'graph';
let selSet = new Set(), selEdge = null, multi = false, sheetFor = null;
let linkFrom = null;
const poly = { pts: [], cursor: null };
let cam = { x: 0, y: 0, w: W0, h: H0 };
let sortKey = 'integ', sortDir = -1;
let lastMouse = { x: W0 / 2, y: H0 / 2 }, lastPointerType = 'mouse';
let hist = { past: [], future: [] };
const histBy = new Map(); // histórico de desfazer por cenário

const svgG = $('svgGraph'), svgJ = $('svgJ'), tip = $('tip');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snapV = v => (snap ? Math.round(v / gridSize) * gridSize : Math.round(v * 10) / 10);
// Ligações v3: {a, b, kind, face?}. A seleção guarda a chave (par + face), única por modelo.
const findEdge = key => model.edges.find(e => edgeKey(e) === key);

// Camada analisada (roteiro F4): acesso = {acesso, aberto}; visual = {vista, aberto} + porta; adjacência = todas.
// Modo Simples (padrão) = o grafo de permeabilidade de sempre: só a camada acesso, sem tipos, faces nem camadas na tela.
// Modo Pesquisa = interfaces tipadas, camadas e orientação NSLO. Os dados são os mesmos; muda o que se vê e se analisa.
let researchMode = false;
let layer = 'acesso', doorIsVisual = true;
const effLayer = () => (researchMode ? layer : 'acesso');
const layerOpts = () => ({ doorIsVisual });
const inLayer = e => layerKinds(effLayer(), layerOpts()).has(e.kind);
const pairsOf = m => layerInput(m, effLayer(), layerOpts()).edges;
function analyse(m, r = radius) { return runAnalysis(layerInput(m, effLayer(), layerOpts()), { ...conv, radius: r }); }
/** O modelo tem informação que só o modo Pesquisa mostra? (o exterior marcado sozinho não conta) */
const hasResearchData = m => m.edges.some(e => e.kind !== 'acesso' || e.face);
function setResearchMode(on) {
  researchMode = !!on;
  document.body.classList.toggle('research', researchMode);
  document.querySelectorAll('[data-mode-btn]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.modeBtn === 'research') === researchMode)));
  if (!researchMode && selEdge && !inLayer(findEdge(selEdge) || {})) selEdge = null;
  recompute();
}
/** No modo Simples, avisa que o modelo tem dados de pesquisa escondidos (nada se perde). */
function hintResearch(m) { if (!researchMode && hasResearchData(m)) toast(t('toast.researchHidden'), t('mode.research'), () => setResearchMode(true)); }
const activeScenario = () => project.scenarios.find(s => s.id === project.activeId);
function setModel(m) { model = m; activeScenario().model = m; }

/* ---------------- HISTÓRICO ---------------- */
const snapshot = () => JSON.stringify(model);
function commit(pre) { hist.past.push(pre); if (hist.past.length > 80) hist.past.shift(); hist.future = []; }
function mutate(fn) { const pre = snapshot(); fn(); commit(pre); recompute(); }
function restore(json) { setModel(migrateModel(JSON.parse(json))); }
function undo() { if (!hist.past.length) return; hist.future.push(snapshot()); restore(hist.past.pop()); recompute(); }
function redo() { if (!hist.future.length) return; hist.past.push(snapshot()); restore(hist.future.pop()); recompute(); }

/* ---------------- PERSISTÊNCIA ---------------- */
function autosave() {
  try {
    localStorage.setItem('ssx_project', JSON.stringify(project));
    localStorage.setItem('ssx_state', JSON.stringify({
      currentMeasure, showValues, snap, radius, conv, projector, layer, doorIsVisual, researchMode,
      bg: { op: bg.op, rot: bg.rot, scale: bg.scale, dx: bg.dx, dy: bg.dy },
    }));
  } catch (_) { /* cota cheia ou armazenamento bloqueado */ }
}
function saveBg() {
  try {
    if (bg.img && bg.img.length < 3500000) localStorage.setItem('ssx_bg', bg.img);
    else localStorage.removeItem('ssx_bg');
  } catch (_) { /* ignore */ }
}
function loadSaved() {
  try {
    const s = localStorage.getItem('ssx_state');
    if (s) {
      const o = JSON.parse(s);
      if (o.model) project = migrateProject(o.model, t('scn.default', { n: 1 })); // estado salvo antes dos cenários
      currentMeasure = o.currentMeasure || 'integ';
      showValues = !!o.showValues; snap = !!o.snap; radius = o.radius || 0; projector = !!o.projector;
      if (o.conv) conv = Object.assign(conv, o.conv);
      if (LAYERS.includes(o.layer)) layer = o.layer;
      researchMode = !!o.researchMode;
      if (o.doorIsVisual === false) doorIsVisual = false;
      if (o.bg) bg = Object.assign(bg, o.bg);
    }
    const pj = localStorage.getItem('ssx_project');
    if (pj) project = migrateProject(JSON.parse(pj));
    const bi = localStorage.getItem('ssx_bg');
    if (bi) bg.img = bi;
  } catch (_) { /* estado corrompido: começa do modelo validado */ }
  model = activeScenario().model;
}

/* ---------------- MEDIDAS ---------------- */
const fmt3 = v => (v == null || !isFinite(v) ? '—' : (+v).toFixed(3));
const fmt1 = v => (v == null || !isFinite(v) ? '—' : (+v).toFixed(1));
const fmtInt = v => (v == null || !isFinite(v) ? '—' : String(v));
const FMT = { integ: fmt3, choice: fmt1, ctrl: fmt3, controllability: fmt3, conn: fmtInt, focus: fmtInt, depth: fmtInt, md: fmt3, rra: fmt3, ra: fmt3, td: fmtInt, ent: fmt3 };
const MEASURES = [
  { key: 'integ' }, { key: 'choice' }, { key: 'ctrl' }, { key: 'controllability' }, { key: 'conn' },
  { key: 'focus', invert: true }, { key: 'depth', invert: true }, { key: 'md', invert: true }, { key: 'rra', invert: true }, { key: 'ent', invert: true },
];
const meta = key => MEASURES.find(m => m.key === key) || MEASURES[0];
const focusId = () => (selSet.size === 1 ? [...selSet][0] : null);
function valOf(id, key) {
  if (key === 'focus') { const f = focusId(); return f ? R.distance(f, id) : null; }
  return R.per[id][key];
}
function measureColor(v, mn, mx, inv) {
  if (v == null || !isFinite(v)) return '#cfc8b8';
  let x = mx === mn ? 0.5 : (v - mn) / (mx - mn);
  if (inv) x = 1 - x;
  x = clamp(x, 0, 1);
  return `hsl(${(240 * (1 - x)).toFixed(0)},62%,52%)`;
}
function measureRange(key) {
  const vals = R.ids.map(i => valOf(i, key)).filter(v => v != null && isFinite(v));
  return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
}
function colourOf(id) {
  const m = meta(currentMeasure), [mn, mx] = measureRange(currentMeasure);
  return measureColor(valOf(id, currentMeasure), mn, mx, m.invert);
}
function labelInk(hsl) { const m = /hsl\((\d+)/.exec(hsl); if (!m) return C.ink; const h = +m[1]; return h >= 55 && h <= 175 ? C.ink : '#fff'; }

/* ---------------- RECÁLCULO ---------------- */
function recompute() {
  byId = new Map(model.nodes.map(n => [n.id, n]));
  const seen = new Set();
  model.edges = model.edges.filter(e => {
    if (e.a === e.b || !byId.has(e.a) || !byId.has(e.b)) return false;
    const k = edgeKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!byId.has(model.root)) model.root = model.nodes.length ? model.nodes[0].id : null;
  [...selSet].forEach(id => { if (!byId.has(id)) selSet.delete(id); });
  if (selEdge && !findEdge(selEdge)) selEdge = null;
  if (linkFrom && !byId.has(linkFrom)) linkFrom = null;
  R = analyse(model);
  renderAll();
  autosave();
}
function renderAll() {
  renderStatus(); renderScenarios(); renderPanel(); renderGraph(); renderJ(); renderResults();
  if (view === 'compare') renderCompare();
  renderSheet(); renderCtx();
}
function renderStatus() {
  const w = $('warnBox');
  w.hidden = R.comp <= 1;
  if (R.comp > 1) w.textContent = t('warn.components', { n: R.comp });
  $('btnUndo').disabled = !hist.past.length;
  $('btnRedo').disabled = !hist.future.length;
}

/* ---------------- PAINEL (modelo) ---------------- */
function renderPanel() {
  $('nodeList').innerHTML = model.nodes.map(n => `
    <div class="li${n.id === model.root ? ' isroot' : ''}${selSet.has(n.id) ? ' sel' : ''}">
      <input type="radio" name="rootpick" class="rootpick" data-root="${esc(n.id)}" ${n.id === model.root ? 'checked' : ''} aria-label="${esc(t('act.root'))}">
      <span class="dot" style="background:${colourOf(n.id)}"></span>
      <button class="nm" data-open="${esc(n.id)}"><b>${esc(n.id)}</b>&nbsp;· ${esc(n.name)}</button>
      <span class="mini">${R.per[n.id].conn}c</span>
      <button class="danger" data-del="${esc(n.id)}" aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`).join('');
  $('nCount').textContent = '(' + model.nodes.length + ')';
  const shown = model.edges.map((e, i) => [e, i]).filter(([e]) => researchMode || inLayer(e));
  $('eCount').textContent = '(' + shown.length + ')';
  $('edgeList').innerHTML = shown.map(([e, i]) => `
    <div class="li${selEdge === edgeKey(e) ? ' sel' : ''}">
      <button class="nm" data-edge="${i}">${esc(e.a)} ↔ ${esc(e.b)}${edgeTag(e)}</button>
      <button class="danger" data-dele="${i}" aria-label="${esc(t('act.removeLink'))}">×</button>
    </div>`).join('');
  fillSel($('rootSel'), model.root); fillSel($('edgeA')); fillSel($('edgeB'));
  const ms = $('measureSel');
  ms.innerHTML = MEASURES.map(m => `<option value="${m.key}">${esc(t('m.' + m.key))}</option>`).join('');
  ms.value = currentMeasure;
  const ss = $('sortSel');
  ss.innerHTML = COLS.map(k => `<option value="${k}">${esc(colLabelLong(k))}</option>`).join('');
  ss.value = sortKey;
  $('optSnap').checked = snap; $('optValues').checked = showValues; $('optRadius').value = radius;
  $('optEntropy').value = conv.entropy; $('optHFactor').value = conv.differenceFactor;
  $('optDoorVisual').checked = doorIsVisual;
  document.querySelectorAll('select.layer-sel').forEach(sel => {
    sel.innerHTML = LAYERS.map(l => `<option value="${l}">${esc(t('layer.' + l))}</option>`).join('');
    sel.value = layer;
  });
  const labs = new Set(t('label.presets').split('|'));
  project.scenarios.forEach(sc => sc.model.nodes.forEach(n => { if (n.label) labs.add(n.label); }));
  $('labelOptions').innerHTML = [...labs].map(l => `<option value="${esc(l)}"></option>`).join('');
}
/** Categoria e face, quando fogem do padrão (acesso, sem face). */
function edgeTag(e) {
  if (!researchMode || (e.kind === 'acesso' && !e.face)) return '';
  return ` <span class="mini">${esc(t('kind.' + e.kind))}${e.face ? ' · ' + e.face : ''}</span>`;
}
function fillSel(sel, val) {
  const keep = sel.value;
  sel.innerHTML = model.nodes.map(n => `<option value="${esc(n.id)}">${esc(n.id)} · ${esc(n.name)}</option>`).join('');
  if (val != null) sel.value = val; else if (keep && byId.has(keep)) sel.value = keep;
}

/* ---------------- CÂMERA (zoom / pan) ---------------- */
function applyCam() {
  svgG.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
  if (mode === 'poly' && poly.pts.length) drawPolyPreview();
}
function clientToWorld(cx, cy) {
  const pt = svgG.createSVGPoint(); pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svgG.getScreenCTM().inverse());
}
const pxPerUnit = () => svgG.getScreenCTM().a;
/** Proporção do canvas na tela: a vista acompanha (no celular em pé o mapa fica alto). */
function viewAspect() { const r = svgG.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r.width / r.height : ASPECT; }
/** Põe o ponto do mundo (wx,wy) sob o ponto de tela (cx,cy) com largura de vista w. */
function placeCam(wx, wy, cx, cy, w) {
  const r = svgG.getBoundingClientRect();
  w = clamp(w, W0 / 15, W0 * 15);
  const h = w / viewAspect(), k = Math.min(r.width / w, r.height / h);
  const offX = (r.width - w * k) / 2, offY = (r.height - h * k) / 2;
  cam = { x: wx - (cx - r.left - offX) / k, y: wy - (cy - r.top - offY) / k, w, h };
  applyCam();
}
function zoomAt(cx, cy, f) { const p = clientToWorld(cx, cy); placeCam(p.x, p.y, cx, cy, cam.w * f); }
function zoomCenter(f) { const r = svgG.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
function panBy(dx, dy) { const k = pxPerUnit(); cam = { ...cam, x: cam.x - dx / k, y: cam.y - dy / k }; applyCam(); }
function contentBounds(aspect = viewAspect(), pad = 30, m = model, withBg = true, top = 40) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  m.nodes.forEach(n => { add(n.x - 30, n.y - 30); add(n.x + 30, n.y + 40); (n.poly || []).forEach(p => add(p[0], p[1])); });
  if (withBg && bg.img) { add(0, 0); add(W0, H0); }
  if (!isFinite(x0)) { add(0, 0); add(W0, H0); }
  x0 -= pad; y0 -= pad + top; x1 += pad; y1 += pad; // top: espaço para a barra de modos
  let w = x1 - x0, h = y1 - y0;
  if (w < 300) { x0 -= (300 - w) / 2; w = 300; }
  if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
  return { x: x0, y: y0, w, h };
}
function fitView() { cam = contentBounds(); applyCam(); }
// ao girar o celular ou redimensionar, mantém o centro e a largura da vista
new ResizeObserver(() => {
  const a = viewAspect(), cy = cam.y + cam.h / 2, h = cam.w / a;
  if (Math.abs(h - cam.h) > 0.5) { cam = { ...cam, y: cy - h / 2, h }; applyCam(); }
}).observe(svgG);

/* ---------------- MAPA (configuração) ---------------- */
function Eo(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function txt(x, y, s, size, fill, weight, cls) {
  const e = Eo('text', { x, y, 'font-family': MONO, 'font-size': size, fill, 'text-anchor': 'middle', class: cls });
  if (weight) e.setAttribute('font-weight', weight);
  e.textContent = s;
  return e;
}
let nodeEls = {}, edgeEls = [], polyEls = {}, guides = [], pendingLine = null, polyPreview = null, boxEl = null;
const nodeRadius = id => 11 + (R.per[id].conn || 0) * 1.5;
function bgTransform() { return `translate(${bg.dx},${bg.dy}) rotate(${bg.rot} ${W0 / 2} ${H0 / 2}) scale(${bg.scale})`; }

function renderGraph() {
  svgG.innerHTML = ''; nodeEls = {}; edgeEls = []; polyEls = {}; guides = []; pendingLine = null; polyPreview = null; boxEl = null;
  applyCam();
  if (bg.img) {
    const im = Eo('image', { x: 0, y: 0, width: W0, height: H0, preserveAspectRatio: 'xMidYMid meet', opacity: bg.op, transform: bgTransform() });
    im.setAttribute('href', bg.img);
    svgG.appendChild(im);
  }
  model.nodes.forEach(n => {
    if (!n.poly || n.poly.length < 3) return;
    const col = colourOf(n.id);
    const pg = Eo('polygon', { points: n.poly.map(p => p.join(',')).join(' '), fill: col, 'fill-opacity': 0.22, stroke: col, 'stroke-width': 1.4, 'stroke-opacity': 0.7 });
    svgG.appendChild(pg); polyEls[n.id] = pg;
  });
  model.edges.forEach(e => {
    if (!researchMode && !inLayer(e)) return;
    const pa = byId.get(e.a), pb = byId.get(e.b), key = edgeKey(e), perm = inLayer(e);
    // ligações fora da camada analisada ficam pontilhadas e claras (não entram no cálculo)
    const ln = Eo('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: C.wall, 'stroke-width': perm ? 1.6 : 1.2, 'stroke-opacity': perm ? 0.55 : 0.35, 'stroke-dasharray': perm ? '' : '2 4', class: 'edge' + (selEdge === key ? ' seledge' : '') });
    const hit = Eo('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: 'transparent', 'stroke-width': 12, class: 'edgehit' });
    hit.dataset.key = key;
    svgG.appendChild(ln); svgG.appendChild(hit);
    edgeEls.push({ a: e.a, b: e.b, ln, hit });
  });
  const m = meta(currentMeasure);
  model.nodes.forEach(n => {
    const p = R.per[n.id], col = colourOf(n.id), rad = nodeRadius(n.id);
    const g = Eo('g', { class: 'node' + (selSet.has(n.id) || n.id === linkFrom ? ' selnode' : ''), transform: `translate(${n.x},${n.y})` });
    g.dataset.id = n.id;
    g.appendChild(Eo('circle', { r: rad + 9, fill: 'transparent', class: 'hit' }));
    g.appendChild(Eo('circle', { class: 'halo', r: rad + 6, fill: 'none', stroke: C.accent, 'stroke-width': 2.5, 'stroke-opacity': 0.75 }));
    if (n.id === model.root) {
      g.appendChild(Eo('circle', { r: rad + 4, fill: 'none', stroke: C.accent, 'stroke-width': 2 }));
      g.appendChild(Eo('line', { x1: -rad - 4, y1: 0, x2: rad + 4, y2: 0, stroke: C.accent, 'stroke-width': 1.3 }));
      g.appendChild(Eo('line', { x1: 0, y1: -rad - 4, x2: 0, y2: rad + 4, stroke: C.accent, 'stroke-width': 1.3 }));
    }
    const circ = Eo('circle', { r: rad, fill: col, stroke: '#fff', 'stroke-width': 2 });
    if (p.orphan || p.unreachable) { circ.setAttribute('stroke', C.accent); circ.setAttribute('stroke-dasharray', '3 2'); }
    g.appendChild(circ);
    g.appendChild(txt(0, 4.5, n.id, 13, labelInk(col), '700', 't-id'));
    g.appendChild(txt(0, rad + 13, n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name, 10, C.ink2, '400', 't-name'));
    if (showValues) g.appendChild(txt(0, -rad - 6, FMT[m.key](valOf(n.id, m.key)), 10, C.accent, '700', 't-val'));
    svgG.appendChild(g); nodeEls[n.id] = g;
  });
  if (mode === 'poly' && poly.pts.length) drawPolyPreview();
  const [mn, mx] = measureRange(currentMeasure), f = FMT[m.key];
  $('legLo').textContent = t('legend.seg') + ' · ' + f(m.invert ? mx : mn);
  $('legHi').textContent = f(m.invert ? mn : mx) + ' · ' + t('legend.int');
}
function updatePositions() {
  model.nodes.forEach(n => {
    if (nodeEls[n.id]) nodeEls[n.id].setAttribute('transform', `translate(${n.x},${n.y})`);
    if (polyEls[n.id] && n.poly) polyEls[n.id].setAttribute('points', n.poly.map(p => p.join(',')).join(' '));
  });
  edgeEls.forEach(ed => {
    const a = byId.get(ed.a), b = byId.get(ed.b);
    for (const el of [ed.ln, ed.hit]) { el.setAttribute('x1', a.x); el.setAttribute('y1', a.y); el.setAttribute('x2', b.x); el.setAttribute('y2', b.y); }
  });
}
function clearGuides() { guides.forEach(g => g.remove()); guides = []; }
function showGuidesFor(id) {
  const n = byId.get(id);
  const line = (x1, y1, x2, y2) => { const l = Eo('line', { x1, y1, x2, y2, stroke: C.accent, 'stroke-width': 0.6, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.6 }); svgG.appendChild(l); guides.push(l); };
  model.nodes.forEach(o => {
    if (o.id === id) return;
    if (Math.abs(o.x - n.x) < 3) { n.x = o.x; line(o.x, cam.y, o.x, cam.y + cam.h); }
    if (Math.abs(o.y - n.y) < 3) { n.y = o.y; line(cam.x, o.y, cam.x + cam.w, o.y); }
  });
}
function refreshSel() {
  Object.keys(nodeEls).forEach(id => nodeEls[id].classList.toggle('selnode', selSet.has(id) || id === linkFrom));
  if (currentMeasure === 'focus') { renderGraph(); renderPanel(); }
  renderResults();
  renderCtx();
}

/* ---------------- GESTOS NO MAPA ---------------- */
// Um único tratador de ponteiros: toque, caneta e mouse.
// 1 dedo: ação do modo (ou mover a vista); 2 dedos: pinça (zoom + pan); mouse: roda = zoom, Alt/botão do meio = pan.
const pointers = new Map();
let gesture = null, pinch = null;

function startPinch() {
  const [p1, p2] = [...pointers.values()];
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  pinch = { d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, w0: cam.w, world: clientToWorld(mid.x, mid.y) };
}
function doPinch() {
  const [p1, p2] = [...pointers.values()];
  const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
  placeCam(pinch.world.x, pinch.world.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, pinch.w0 * pinch.d0 / d);
}
function abortGesture() {
  if (!gesture) return;
  clearTimeout(gesture.lp);
  if (gesture.type === 'drag' && gesture.moved) { commit(gesture.pre); recompute(); }
  if (gesture.type === 'box' && boxEl) { boxEl.remove(); boxEl = null; }
  gesture = null;
}

svgG.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  lastPointerType = e.pointerType;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { svgG.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  hideTip();
  if (pointers.size === 2) { abortGesture(); startPinch(); return; }
  if (pointers.size > 2) return;
  const pt = clientToWorld(e.clientX, e.clientY); lastMouse = pt;
  const nodeEl = e.target.closest('.node'), edgeEl = e.target.closest('.edgehit');
  const id = nodeEl ? nodeEl.dataset.id : null;
  const g = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, touch: e.pointerType !== 'mouse', pt };
  if (e.button === 1 || e.altKey) { gesture = { ...g, type: 'pan' }; return; }
  if (mode === 'select') {
    if (id) { startNodeDrag(g, id, e.shiftKey); return; }
    if (edgeEl) { gesture = { ...g, type: 'edge', key: edgeEl.dataset.key }; return; }
    if (!g.touch) {
      boxEl = Eo('rect', { x: pt.x, y: pt.y, width: 0, height: 0, fill: 'rgba(178,58,46,.08)', stroke: C.accent, 'stroke-width': 0.8, 'stroke-dasharray': '4 3' });
      svgG.appendChild(boxEl);
      gesture = { ...g, type: 'box', add: e.shiftKey };
      return;
    }
    gesture = { ...g, type: 'panTap' };
    return;
  }
  if (mode === 'link') { gesture = { ...g, type: id ? 'linkNode' : 'panTap', id }; return; }
  if (mode === 'add') { gesture = { ...g, type: id ? 'nodeTap' : 'addTap', id }; return; }
  if (mode === 'poly') { gesture = { ...g, type: 'polyTap' }; }
});

function startNodeDrag(g, id, shift) {
  let addedNow = false;
  if (shift || multi) {
    if (!selSet.has(id)) { selSet.add(id); addedNow = true; }
    else if (shift) { selSet.delete(id); refreshSel(); gesture = { ...g, type: 'noop' }; return; }
  } else if (!selSet.has(id) || selSet.size > 1) {
    selSet.clear(); selSet.add(id);
  }
  selEdge = null;
  refreshSel();
  const orig = new Map();
  selSet.forEach(sid => { const nd = byId.get(sid); orig.set(sid, { x: nd.x, y: nd.y, poly: nd.poly ? nd.poly.map(p => [p[0], p[1]]) : null }); });
  gesture = { ...g, type: 'drag', id, pre: snapshot(), orig, addedNow, shift };
  if (g.touch && !multi) {
    gesture.lp = setTimeout(() => {
      if (gesture && gesture.type === 'drag' && !gesture.moved) {
        multi = true; gesture.longPressed = true;
        if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(15);
        closeSheet(); refreshSel();
      }
    }, 450);
  }
}

svgG.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) { if (pointers.size >= 2) doPinch(); return; }
  const pt = clientToWorld(e.clientX, e.clientY); lastMouse = pt;
  if (!gesture) {
    if (e.pointerType === 'mouse') { hoverPreview(pt); hoverTip(e); }
    return;
  }
  const thr = gesture.touch ? 8 : 3;
  if (!gesture.moved && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > thr) { gesture.moved = true; clearTimeout(gesture.lp); }
  if (!gesture.moved) return;
  if (gesture.type === 'drag') dragTo(pt);
  else if (gesture.type === 'box') updateBox(pt);
  else if (gesture.type !== 'noop') panBy(e.clientX - gesture.lx, e.clientY - gesture.ly);
  gesture.lx = e.clientX; gesture.ly = e.clientY;
});

function endPointer(e, cancelled) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  const g = gesture; gesture = null;
  if (!g) return;
  clearTimeout(g.lp);
  if (g.type === 'box') { finishBox(g, clientToWorld(e.clientX, e.clientY)); return; }
  if (g.type === 'drag') {
    clearGuides();
    if (g.moved) { commit(g.pre); recompute(); return; }
    if (cancelled || g.longPressed) return;
    if (multi || g.shift) {
      if (!g.addedNow) selSet.delete(g.id);
      refreshSel();
    } else openSheet({ kind: 'node', id: g.id });
    return;
  }
  if (cancelled || g.moved) return;
  switch (g.type) {
    case 'edge': selectEdge(g.key); break;
    case 'panTap':
      if (mode === 'link') cancelLink();
      else if (mode === 'select' && !multi) clearSelection();
      break;
    case 'addTap': addNodeAt(g.pt.x, g.pt.y); break;
    case 'nodeTap': selSet.clear(); selSet.add(g.id); refreshSel(); openSheet({ kind: 'node', id: g.id }); break;
    case 'linkNode': linkClick(g.id); break;
    case 'polyTap': polyAddPoint(g.pt, g.x0, g.y0); break;
  }
}
svgG.addEventListener('pointerup', e => endPointer(e, false));
svgG.addEventListener('pointercancel', e => endPointer(e, true));
svgG.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hideTip(); if (poly.cursor) { poly.cursor = null; drawPolyPreview(); } } });
svgG.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
svgG.addEventListener('dblclick', e => {
  if (lastPointerType !== 'mouse' || e.target.closest('.node')) return;
  if (mode === 'poly') finishPoly();
  else if (mode === 'select' || mode === 'add') { const pt = clientToWorld(e.clientX, e.clientY); addNodeAt(pt.x, pt.y); }
});
svgG.addEventListener('contextmenu', e => { if (lastPointerType !== 'mouse') e.preventDefault(); });

function dragTo(pt) {
  const g = gesture, dx = pt.x - g.pt.x, dy = pt.y - g.pt.y;
  clearGuides();
  selSet.forEach(id => {
    const o = g.orig.get(id), nd = byId.get(id);
    if (!o || !nd) return;
    nd.x = snapV(o.x + dx); nd.y = snapV(o.y + dy);
    if (o.poly) nd.poly = o.poly.map(p => [snapV(p[0] + dx), snapV(p[1] + dy)]);
  });
  if (selSet.size === 1) showGuidesFor(g.id);
  updatePositions();
}
function updateBox(pt) {
  const g = gesture;
  boxEl.setAttribute('x', Math.min(g.pt.x, pt.x)); boxEl.setAttribute('y', Math.min(g.pt.y, pt.y));
  boxEl.setAttribute('width', Math.abs(pt.x - g.pt.x)); boxEl.setAttribute('height', Math.abs(pt.y - g.pt.y));
}
function finishBox(g, pt) {
  if (boxEl) { boxEl.remove(); boxEl = null; }
  const x0 = Math.min(g.pt.x, pt.x), y0 = Math.min(g.pt.y, pt.y), x1 = Math.max(g.pt.x, pt.x), y1 = Math.max(g.pt.y, pt.y);
  if (!g.moved) { if (!g.add) clearSelection(); return; }
  if (!g.add) selSet.clear();
  model.nodes.forEach(n => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) selSet.add(n.id); });
  selEdge = null; closeSheet(); refreshSel();
}

function hoverPreview(pt) {
  if (mode === 'link' && linkFrom) {
    const a = byId.get(linkFrom);
    if (!pendingLine) { pendingLine = Eo('line', { stroke: C.accent, 'stroke-width': 1.4, 'stroke-dasharray': '4 3', 'pointer-events': 'none' }); svgG.appendChild(pendingLine); }
    pendingLine.setAttribute('x1', a.x); pendingLine.setAttribute('y1', a.y); pendingLine.setAttribute('x2', pt.x); pendingLine.setAttribute('y2', pt.y);
  }
  if (mode === 'poly' && poly.pts.length) { poly.cursor = [pt.x, pt.y]; drawPolyPreview(); }
}

/* ---------------- EDIÇÃO ---------------- */
function nextId() {
  const used = new Set(model.nodes.map(n => n.id));
  for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c; }
  let n = 1; while (used.has('S' + n)) n++;
  return 'S' + n;
}
function addNodeAt(x, y, name) {
  const id = nextId();
  mutate(() => model.nodes.push({ id, name: name || t('newSpace', { n: model.nodes.length + 1 }), x: snapV(x), y: snapV(y) }));
  return id;
}
function addEdge(a, b) {
  if (!a || !b || a === b) return;
  const existing = model.edges.find(e => edgeKey(e) === edgeKey({ a, b }));
  if (existing) { toast(!researchMode && !inLayer(existing) ? t('toast.linkHidden', { kind: t('kind.' + existing.kind) }) : t('toast.linkExists')); return; }
  mutate(() => model.edges.push({ a, b, kind: 'acesso' }));
}
function removeEdge(key) {
  mutate(() => { model.edges = model.edges.filter(e => edgeKey(e) !== key); });
  selEdge = null; closeSheet();
  toast(t('toast.linkRemoved'), t('toast.undo'), undo);
}
function deleteNodes(ids) {
  const set = new Set(ids);
  if (!set.size) return;
  mutate(() => { model.nodes = model.nodes.filter(n => !set.has(n.id)); });
  selSet.clear(); multi = false; closeSheet(); renderCtx();
  toast(t('toast.deleted', { n: set.size }), t('toast.undo'), undo);
}
function setRoot(id) { mutate(() => { model.root = id; }); }
function clearSelection() { selSet.clear(); selEdge = null; multi = false; closeSheet(); renderGraph(); refreshSel(); }
function selectEdge(key) { selSet.clear(); multi = false; selEdge = key; renderGraph(); refreshSel(); openSheet({ kind: 'edge', key }); }

function linkClick(id) {
  if (!linkFrom) { linkFrom = id; refreshSel(); return; }
  if (id === linkFrom) { cancelLink(); return; }
  const a = linkFrom; linkFrom = null;
  if (pendingLine) { pendingLine.remove(); pendingLine = null; }
  addEdge(a, id);
  refreshSel();
}
function cancelLink() { linkFrom = null; if (pendingLine) { pendingLine.remove(); pendingLine = null; } refreshSel(); }

/* polígonos convexos */
function polyAddPoint(pt, cx, cy) {
  if (poly.pts.length >= 3) {
    const f = poly.pts[0], ctm = svgG.getScreenCTM();
    const sx = f[0] * ctm.a + ctm.e, sy = f[1] * ctm.d + ctm.f;
    if (Math.hypot(sx - cx, sy - cy) < 22) { finishPoly(); return; }
  }
  poly.pts.push([snapV(pt.x), snapV(pt.y)]);
  drawPolyPreview(); renderCtx();
}
function drawPolyPreview() {
  if (polyPreview) polyPreview.remove();
  polyPreview = null;
  if (!poly.pts.length) return;
  const k = pxPerUnit(), g = Eo('g', { 'pointer-events': 'none' });
  const pts = poly.cursor ? [...poly.pts, poly.cursor] : poly.pts;
  g.appendChild(Eo('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'rgba(178,58,46,.08)', stroke: C.accent, 'stroke-width': 1.6 / k * 1.2 }));
  poly.pts.forEach((p, i) => g.appendChild(Eo('circle', { cx: p[0], cy: p[1], r: (i === 0 && poly.pts.length >= 3 ? 9 : 4.5) / k, fill: i === 0 ? C.accent : '#fff', stroke: C.accent, 'stroke-width': 1.5 / k })));
  svgG.appendChild(g); polyPreview = g;
}
/** Convexo e simples: todas as viradas com o mesmo sinal e giro total de uma volta. */
function isConvex(pts) {
  const n = pts.length; let sign = 0, turn = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
    turn += Math.atan2(cross, (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]));
  }
  return Math.abs(Math.abs(turn) - 2 * Math.PI) < 1e-6;
}
function finishPoly() {
  if (poly.pts.length < 3) return;
  const pts = poly.pts.slice();
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const id = nextId();
  poly.pts = []; poly.cursor = null;
  mutate(() => model.nodes.push({ id, name: t('newSpace', { n: model.nodes.length + 1 }), x: Math.round(cx), y: Math.round(cy), poly: pts }));
  if (!isConvex(pts)) toast(t('toast.nonconvex'));
}
function cancelPoly() { poly.pts = []; poly.cursor = null; drawPolyPreview(); renderCtx(); }

function segOverlap(a1, a2, b1, b2, tol) {
  const dax = a2[0] - a1[0], day = a2[1] - a1[1], len = Math.hypot(dax, day);
  if (len < 1e-6) return 0;
  const ux = dax / len, uy = day / len;
  const perp = p => Math.abs((p[0] - a1[0]) * -uy + (p[1] - a1[1]) * ux);
  if (perp(b1) > tol || perp(b2) > tol) return 0;
  const proj = p => (p[0] - a1[0]) * ux + (p[1] - a1[1]) * uy;
  let s0 = proj(b1), s1 = proj(b2);
  if (s0 > s1) [s0, s1] = [s1, s0];
  return Math.max(0, Math.min(len, s1) - Math.max(0, s0));
}
function polysShareEdge(pa, pb, tol) {
  for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) {
    if (segOverlap(pa[i], pa[(i + 1) % pa.length], pb[j], pb[(j + 1) % pb.length], tol) > tol) return true;
  }
  return false;
}
function deriveAdjacency() {
  const ps = model.nodes.filter(n => n.poly && n.poly.length >= 3);
  if (ps.length < 2) { toast(t('toast.needPolys')); return; }
  const found = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const A = ps[i], B = ps[j];
    if (polysShareEdge(A.poly, B.poly, 8) && !model.edges.some(e => edgeKey(e) === edgeKey({ a: A.id, b: B.id }))) found.push({ a: A.id, b: B.id, kind: 'acesso' });
  }
  if (found.length) mutate(() => model.edges.push(...found));
  toast(found.length ? t('toast.derived', { n: found.length }) : t('toast.noDerived'));
}

/* ---------------- MODO E BARRA DE CONTEXTO ---------------- */
function setMode(m) {
  mode = m; linkFrom = null; poly.pts = []; poly.cursor = null; multi = false;
  document.querySelectorAll('.modebtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  renderGraph(); renderCtx();
}
function renderCtx() {
  let html = '';
  if (mode === 'add') html = `<span>${t('ctx.add')}</span>`;
  else if (mode === 'link') html = `<span>${linkFrom ? t('ctx.link2', { id: esc(linkFrom) }) : t('ctx.link1')}</span>` + (linkFrom ? `<button data-ctx="cancelLink">${t('btn.cancel')}</button>` : '');
  else if (mode === 'poly') {
    const n = poly.pts.length;
    html = `<span>${t('ctx.poly')}</span><button data-ctx="undoPt" ${n ? '' : 'disabled'}>${t('btn.undoPt')}</button>` +
      `<button class="primary" data-ctx="closePoly" ${n >= 3 ? '' : 'disabled'}>${t('btn.close')}</button>` +
      (n ? `<button data-ctx="cancelPoly">${t('btn.cancel')}</button>` : '');
  } else if (multi || selSet.size > 1) {
    const n = selSet.size;
    html = `<span>${t('ctx.sel', { n })}${multi ? ' · ' + t('ctx.multi') : ''}</span>` +
      (n === 2 ? `<button data-ctx="linkPair">${t('btn.link')}</button>` : '') +
      (n ? `<button data-ctx="delSel">${t('btn.delete')}</button>` : '') +
      `<button class="primary" data-ctx="doneSel">${t('btn.done')}</button>`;
  }
  const bar = $('ctxBar');
  bar.innerHTML = html;
  bar.hidden = !html;
}
$('ctxBar').addEventListener('click', e => {
  const b = e.target.closest('[data-ctx]');
  if (!b) return;
  switch (b.dataset.ctx) {
    case 'cancelLink': cancelLink(); break;
    case 'undoPt': poly.pts.pop(); drawPolyPreview(); renderCtx(); break;
    case 'closePoly': finishPoly(); break;
    case 'cancelPoly': cancelPoly(); break;
    case 'linkPair': { const [a, c] = [...selSet]; addEdge(a, c); break; }
    case 'delSel': armConfirm(b, () => deleteNodes([...selSet])); break;
    case 'doneSel': clearSelection(); break;
  }
});

/* ---------------- PAINEL DESLIZANTE (detalhes) ---------------- */
const SHEET_ROWS = ['integ', 'choice', 'conn', 'ctrl', 'controllability', 'depth', 'md', 'rra', 'ra', 'td', 'ent'];
let sheetExpanded = false;
/** No celular o painel começa compacto: a medida atual + integração, choice e profundidade. */
function sheetRows() {
  if (sheetExpanded || !narrow.matches) return SHEET_ROWS;
  const first = SHEET_ROWS.includes(currentMeasure) ? [currentMeasure] : [];
  return [...new Set([...first, 'integ', 'choice', 'depth', 'conn'])].slice(0, 4);
}
function openSheet(target) {
  sheetFor = target;
  if (target.kind === 'node' && !selSet.has(target.id)) { selSet.clear(); selSet.add(target.id); refreshSel(); }
  renderSheet();
  if (target.kind === 'node' && view === 'graph') keepAboveSheet(target.id);
}
/** No celular o painel cobre a metade de baixo do mapa: rola a vista para o espaço ficar visível acima dele. */
function keepAboveSheet(id) {
  const n = byId.get(id), s = $('sheet');
  if (!n || s.hidden || !narrow.matches) return;
  const ctm = svgG.getScreenCTM(), r = svgG.getBoundingClientRect();
  const sy = n.y * ctm.d + ctm.f, top = r.top + 60, bottom = s.getBoundingClientRect().top - 30;
  if (bottom - top < 40 || (sy >= top && sy <= bottom)) return;
  panBy(0, (top + bottom) / 2 - sy);
}
function closeSheet() { if (!sheetFor) return; sheetFor = null; renderSheet(); if (selEdge) { selEdge = null; renderGraph(); } }
function renderSheet() {
  const s = $('sheet');
  if (sheetFor && sheetFor.kind === 'node' && !byId.has(sheetFor.id)) sheetFor = null;
  if (sheetFor && sheetFor.kind === 'edge' && !findEdge(sheetFor.key)) sheetFor = null;
  if (!sheetFor) { s.hidden = true; s.innerHTML = ''; return; }
  const closeBtn = `<button class="icon" data-act="close" aria-label="${esc(t('close'))}"><svg class="ico"><use href="#i-close"/></svg></button>`;
  if (sheetFor.kind === 'edge') {
    const e = findEdge(sheetFor.key), na = byId.get(e.a), nb = byId.get(e.b);
    s.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-head"><h3>${esc(t('edge.title'))}: ${esc(e.a)} ↔ ${esc(e.b)}</h3>${closeBtn}</div>
      <p class="hint">${esc(na.name)} ↔ ${esc(nb.name)} · ${esc(t('kind.' + e.kind))}${e.face ? ' · ' + esc(t('edge.face')) + ' ' + e.face : ''}</p>
      <div class="sheet-actions"><button class="danger" data-act="removeLink"><svg class="ico"><use href="#i-trash"/></svg>${esc(t('act.removeLink'))}</button></div>`;
  } else {
    const n = byId.get(sheetFor.id), p = R.per[n.id], isRoot = n.id === model.root;
    const rows = sheetRows().map(k => `<button class="mrow${k === currentMeasure ? ' cur' : ''}" data-info="${k}"><span>${esc(t('m.' + k))} <span class="i">ⓘ</span></span><b>${FMT[k](p[k])}</b></button>`).join('');
    s.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-head">
        <span class="chip" style="background:${colourOf(n.id)}"></span><span class="idbadge">${esc(n.id)}</span>
        <input type="text" id="sheetName" value="${esc(n.name)}" maxlength="200" aria-label="${esc(t('name'))}">${closeBtn}
      </div>
      <div class="sheet-type">${isRoot ? `<span class="badge">${esc(t('root.badge'))}</span>` : ''}
        <button class="linkish" data-info="type">${esc(t('type'))} <b>${p.type}</b> — ${esc(t('type.' + p.type))}</button></div>
      <label class="labelrow"><span>${esc(t('label'))}</span><input type="text" id="sheetLabel" list="labelOptions" value="${esc(n.label || '')}" maxlength="60" placeholder="${esc(t('label.ph'))}" autocomplete="off"></label>
      ${facesLine(n.id)}
      <div class="mgrid">${rows}</div>
      ${narrow.matches ? `<button class="linkish more" data-act="more" aria-expanded="${sheetExpanded}">${esc(t(sheetExpanded ? 'sheet.less' : 'sheet.more'))}</button>` : ''}
      <div class="sheet-actions">
        <button class="ghost" data-act="root" ${isRoot ? 'disabled' : ''}><svg class="ico"><use href="#i-root"/></svg>${esc(t('act.root'))}</button>
        <button class="ghost" data-act="link"><svg class="ico"><use href="#i-link"/></svg>${esc(t('act.linkTo'))}</button>
        <button class="danger" data-act="delete"><svg class="ico"><use href="#i-trash"/></svg>${esc(t('act.delete'))}</button>
      </div>`;
  }
  s.hidden = false;
}
$('sheet').addEventListener('click', e => {
  const info = e.target.closest('[data-info]');
  if (info) { openInfo(info.dataset.info); return; }
  const b = e.target.closest('[data-act]');
  if (!b || !sheetFor) return;
  const target = sheetFor;
  switch (b.dataset.act) {
    case 'more': sheetExpanded = !sheetExpanded; renderSheet(); break;
    case 'close': closeSheet(); if (target.kind === 'node') { selSet.clear(); refreshSel(); } break;
    case 'root': setRoot(target.id); break;
    case 'link': setView('graph'); setMode('link'); linkFrom = target.id; closeSheet(); refreshSel(); break;
    case 'delete': armConfirm(b, () => deleteNodes([target.id])); break;
    case 'removeLink': removeEdge(target.key); break;
  }
});
$('sheet').addEventListener('change', e => {
  if (e.target.id === 'sheetLabel' && sheetFor) {
    const lab = e.target.value.trim().slice(0, 60), n = byId.get(sheetFor.id);
    if (n && lab !== (n.label || '')) mutate(() => { if (lab) n.label = lab; else delete n.label; });
    return;
  }
  if (e.target.id !== 'sheetName' || !sheetFor) return;
  const name = e.target.value.trim(), n = byId.get(sheetFor.id);
  if (name && n && name !== n.name) mutate(() => { n.name = name.slice(0, 200); });
});
$('sheet').addEventListener('keydown', e => { if ((e.target.id === 'sheetName' || e.target.id === 'sheetLabel') && e.key === 'Enter') e.target.blur(); });

/* ---------------- AVISOS, CONFIRMAÇÃO, GLOSSÁRIO ---------------- */
let toastTimer = null;
function toast(msg, actLabel, act) {
  $('toastMsg').textContent = msg;
  const b = $('toastAct');
  b.hidden = !actLabel;
  if (actLabel) { b.textContent = actLabel; b.onclick = () => { hideToast(); act(); }; }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actLabel ? 6000 : 3500);
}
function hideToast() { $('toast').hidden = true; }
/** Ações destrutivas pedem um segundo toque em até 3 s. */
function armConfirm(btn, fn) {
  if (btn.dataset.armed) { fn(); return; }
  const old = btn.innerHTML;
  btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = t('confirm');
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = old; } }, 3000);
}
function openInfo(key) {
  const g = GLOSSARY[getLang()][key === 'focus' ? 'focus' : key];
  if (!g) return;
  let convTxt = '';
  if (key === 'ent') convTxt = t('info.conv', { c: t(conv.entropy === 'depthmapx' ? 'conv.entropy.dm' : 'conv.entropy.v1') });
  if (key === 'Hs') convTxt = t('info.conv', { c: t(conv.differenceFactor === 'ra' ? 'conv.h.ra' : 'conv.h.int') });
  const dlg = $('infoDlg');
  dlg.innerHTML = `<header><h2>${esc(g.title)}</h2><button class="icon" data-close aria-label="${esc(t('close'))}"><svg class="ico"><use href="#i-close"/></svg></button></header>
    <p>${esc(g.def)}</p>
    ${g.formula ? `<h3>${esc(t('info.formula'))}</h3><code>${esc(g.formula)}</code>` : ''}
    ${g.read ? `<h3>${esc(t('info.how'))}</h3><p>${esc(g.read)}</p>` : ''}
    ${convTxt ? `<p class="conv">${esc(convTxt)}</p>` : ''}
    ${g.ref ? `<p class="ref">${esc(t('info.ref'))}: ${esc(g.ref)}</p>` : ''}`;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
$('infoDlg').addEventListener('click', e => {
  if (e.target === e.currentTarget || e.target.closest('[data-close]')) e.currentTarget.close();
});

/* ---------------- GRAFO JUSTIFICADO ---------------- */
/** Desenha o grafo justificado de `m` (resultado `Rx`) em `svg`. Usado na aba J-graph e na comparação. */
function drawJGraph(svg, m, Rx, sel = new Set()) {
  svg.innerHTML = '';
  const W = W0, Hh = H0, padB = 56, padT = 40;
  const layers = {}; let maxD = 0, hasNull = false;
  m.nodes.forEach(n => {
    const d = Rx.per[n.id].depth;
    if (d == null) { hasNull = true; return; }
    (layers[d] = layers[d] || []).push(n.id); maxD = Math.max(maxD, d);
  });
  const rows = maxD + (hasNull ? 2 : 1), yFor = d => Hh - padB - d * ((Hh - padB - padT) / Math.max(1, rows - 1));
  const pj = {};
  for (let d = 0; d <= maxD; d++) { const arr = layers[d] || []; arr.forEach((id, i) => { pj[id] = { x: W / (arr.length + 1) * (i + 1), y: yFor(d) }; }); }
  if (hasNull) { const arr = m.nodes.filter(n => Rx.per[n.id].depth == null).map(n => n.id); arr.forEach((id, i) => { pj[id] = { x: W / (arr.length + 1) * (i + 1), y: padT - 16 }; }); }
  for (let d = 0; d <= maxD; d++) {
    svg.appendChild(Eo('line', { x1: 40, y1: yFor(d), x2: W - 14, y2: yFor(d), stroke: C.rule, 'stroke-width': 1, 'stroke-dasharray': '2 4' }));
    svg.appendChild(txt(18, yFor(d) + 4, 'd' + d, 11, C.muted, null, 't-name'));
  }
  // arestas da árvore de busca em largura a partir da raiz; as demais (anéis) tracejadas
  const adj = new Map(m.nodes.map(n => [n.id, []]));
  const pairs = pairsOf(m);
  pairs.forEach(([a, b]) => { adj.get(a).push(b); adj.get(b).push(a); });
  const key = (a, b) => (a < b ? a + '\u0000' + b : b + '\u0000' + a);
  const tree = new Set();
  if (m.root && adj.has(m.root)) {
    const seen = new Set([m.root]), q = [m.root];
    for (let h = 0; h < q.length; h++) for (const w of adj.get(q[h])) if (!seen.has(w)) { seen.add(w); tree.add(key(q[h], w)); q.push(w); }
  }
  pairs.forEach(([a, b]) => {
    if (!pj[a] || !pj[b]) return;
    const isTree = tree.has(key(a, b));
    svg.appendChild(Eo('line', { x1: pj[a].x, y1: pj[a].y, x2: pj[b].x, y2: pj[b].y, stroke: isTree ? C.wall : C.accent, 'stroke-width': isTree ? 1.8 : 1.2, 'stroke-dasharray': isTree ? '' : '5 3', 'stroke-opacity': isTree ? 0.9 : 0.7 }));
  });
  const ramp = ['#e9dcc6', '#dcae82', '#cc7f52', '#b25334', '#8a2d1f', '#6a2016', '#4d170f'];
  m.nodes.forEach(n => {
    const p = pj[n.id];
    if (!p) return;
    const d = Rx.per[n.id].depth, col = d == null ? '#bdb6a6' : ramp[Math.min(d, ramp.length - 1)];
    const g = Eo('g', { class: 'node' + (sel.has(n.id) ? ' selnode' : ''), transform: `translate(${p.x},${p.y})` });
    g.dataset.id = n.id;
    g.appendChild(Eo('circle', { r: 24, fill: 'transparent', class: 'hit' }));
    g.appendChild(Eo('circle', { class: 'halo', r: 21, fill: 'none', stroke: C.accent, 'stroke-width': 2.5 }));
    if (n.id === m.root) {
      g.appendChild(Eo('circle', { r: 16, fill: col, stroke: C.accent, 'stroke-width': 2.4 }));
      g.appendChild(Eo('line', { x1: -16, y1: 0, x2: 16, y2: 0, stroke: C.accent, 'stroke-width': 1.3 }));
      g.appendChild(Eo('line', { x1: 0, y1: -16, x2: 0, y2: 16, stroke: C.accent, 'stroke-width': 1.3 }));
    } else g.appendChild(Eo('circle', { r: 14, fill: col, stroke: C.wall, 'stroke-width': 1.4 }));
    g.appendChild(txt(0, 4.5, n.id, 12, d != null && d >= 2 ? '#fff' : C.ink, '700', 't-id'));
    if (showValues && d != null) g.appendChild(txt(0, -20, 'd' + d, 10, C.ink2, '700', 't-val'));
    svg.appendChild(g);
  });
}
function renderJ() { drawJGraph(svgJ, model, R, selSet); }
svgJ.addEventListener('click', e => {
  const g = e.target.closest('.node');
  if (!g) { clearSelection(); renderJ(); return; }
  selSet.clear(); selSet.add(g.dataset.id); refreshSel(); renderJ();
  openSheet({ kind: 'node', id: g.dataset.id });
});
svgJ.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') hoverTip(e); });
svgJ.addEventListener('pointerleave', hideTip);

/* ---------------- RESULTADOS ---------------- */
const COLS = ['id', 'label', 'type', 'conn', 'ctrl', 'controllability', 'choice', 'depth', 'td', 'md', 'ra', 'rra', 'integ', 'ent'];
const isTextKey = k => k === 'id' || k === 'type' || k === 'label';
const colLabelLong = k => (isTextKey(k) ? t('col.' + k) : t('m.' + k));
function sortedNodes() {
  const key = n => (sortKey === 'id' ? n.id : sortKey === 'label' ? (n.label || '\uffff').toLowerCase() : sortKey === 'type' ? R.per[n.id].type : R.per[n.id][sortKey]);
  return [...model.nodes].sort((a, b) => {
    let va = key(a), vb = key(b);
    if (va == null) va = -Infinity;
    if (vb == null) vb = -Infinity;
    return va < vb ? -sortDir : va > vb ? sortDir : 0; // sortDir 1 = crescente, -1 = decrescente
  });
}
function renderResults() {
  const g = R;
  const issues = [];
  const orphans = g.ids.filter(i => g.per[i].orphan);
  if (orphans.length) issues.push(t('val.orphan', { ids: orphans.join(', ') }));
  if (g.comp > 1) issues.push(t('val.comp', { n: g.comp }));
  const unreach = g.ids.filter(i => g.per[i].unreachable);
  if (unreach.length) issues.push(t('val.unreach', { ids: unreach.join(', ') }));
  $('valBox').innerHTML = `<h4>${esc(t('val.title'))}</h4>` + (issues.length
    ? `<span class="bad">${esc(t('val.issues', { n: issues.length }))}</span><ul>${issues.map(i => '<li>' + esc(i) + '</li>').join('')}</ul>`
    : `<span class="ok">${esc(t('val.ok'))}</span>`);
  const f3 = v => (v == null ? '—' : v.toFixed(3));
  const cards = [
    ['card.k', g.k, 'k'], [researchMode ? 'card.L' : 'card.Lsimple', g.L, 'L'], ...(researchMode ? [['card.layer', t('layer.' + layer), 'layer']] : []), ['card.rings', g.circuit, 'rings'], ['card.ringiness', g.ringiness.toFixed(3), 'ringiness'],
    ['card.meanConn', g.meanConn.toFixed(2), 'meanConn'], ['card.meanMD', f3(g.meanMD), 'md'], ['card.meanInt', f3(g.meanInt), 'integ'],
    ['card.meanRRA', f3(g.meanRRA), 'rra'], ['card.diameter', g.diameter, 'diameter'], ['card.Hs', f3(g.Hs), 'Hs'],
    ['card.int', f3(g.intelligibility), 'intelligibility'],
    ['card.types', `${g.typeCounts.a.length}/${g.typeCounts.b.length}/${g.typeCounts.c.length}/${g.typeCounts.d.length}`, 'type'],
    ['card.radius', radius === 0 ? t('global') : radius, 'radius'],
  ];
  $('globalCards').innerHTML = cards.map(([k, v, info]) =>
    `<button class="card" data-info="${info}"><div class="k">${esc(t(k, { basis: t(conv.differenceFactor === 'ra' ? 'basis.ra' : 'basis.integ') }))}</div><div class="v">${esc(v)}</div></button>`).join('');
  $('resTable').querySelector('thead').innerHTML = '<tr>' + COLS.map(k =>
    `<th class="${isTextKey(k) ? 'name' : ''}" data-k="${k}" ${k === sortKey ? `aria-sort="${sortDir > 0 ? 'ascending' : 'descending'}"` : ''} title="${esc(colLabelLong(k))}">${esc(t('col.' + k))}</th>`).join('') + '</tr>';
  const rows = sortedNodes();
  $('resTable').querySelector('tbody').innerHTML = rows.map(n => {
    const p = R.per[n.id];
    return `<tr data-id="${esc(n.id)}" class="${n.id === model.root ? 'root' : ''}${selSet.has(n.id) ? ' sel' : ''}">
      <td class="name"><span class="chip" style="background:${colourOf(n.id)}"></span> ${esc(n.id)} · ${esc(n.name)}</td><td class="name">${esc(n.label || '—')}</td><td class="name">${p.type}</td>
      <td>${p.conn}</td><td>${fmt3(p.ctrl)}</td><td>${fmt3(p.controllability)}</td><td>${fmt1(p.choice)}</td><td>${fmtInt(p.depth)}</td>
      <td>${p.td}</td><td>${fmt3(p.md)}</td><td>${fmt3(p.ra)}</td><td>${fmt3(p.rra)}</td><td><b>${fmt3(p.integ)}</b></td><td>${fmt3(p.ent)}</td></tr>`;
  }).join('');
  const showKey = isTextKey(sortKey) ? currentMeasure : sortKey;
  $('spaceCards').innerHTML = rows.map(n => {
    const p = R.per[n.id], v = showKey === 'focus' ? valOf(n.id, 'focus') : p[showKey];
    return `<button class="scard${selSet.has(n.id) ? ' sel' : ''}" data-id="${esc(n.id)}">
      <span class="chip" style="background:${colourOf(n.id)}"></span>
      <span class="nm">${esc(n.id)} · ${esc(n.name)}</span>
      <span class="big">${(FMT[showKey] || fmt3)(v)}</span>
      <span class="sub">${n.label ? esc(n.label) + ' · ' : ''}${esc(t('type'))} ${p.type} · ${esc(t('col.integ'))} ${fmt3(p.integ)} · ${esc(t('col.choice'))} ${fmt1(p.choice)} · ${esc(t('col.depth'))} ${fmtInt(p.depth)}</span>
    </button>`;
  }).join('');
  renderFunctional();
  renderOrientation();
  $('methodFoot').innerHTML = (researchMode ? t('method.layer', { layer: t('layer.' + layer), kinds: [...layerKinds(layer, layerOpts())].map(k => t('kind.' + k)).join(', ') }) : '') + t('method.base') + t(conv.entropy === 'depthmapx' ? 'method.ent.dm' : 'method.ent.v1') +
    t(conv.differenceFactor === 'ra' ? 'method.h.ra' : 'method.h.int') + t('method.tail');
}
$('resTable').querySelector('thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (!th) return;
  const k = th.dataset.k;
  if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = isTextKey(k) ? 1 : -1; }
  renderResults(); $('sortSel').value = sortKey;
});
function pickFromResults(e) {
  const el = e.target.closest('[data-id]');
  if (!el) return;
  selSet.clear(); selSet.add(el.dataset.id); refreshSel(); renderGraph(); renderJ();
  openSheet({ kind: 'node', id: el.dataset.id });
}
$('resTable').querySelector('tbody').addEventListener('click', pickFromResults);
$('spaceCards').addEventListener('click', pickFromResults);
/** Resultado global (raio 0) — o genótipo e o H* entre funções são propriedades da configuração inteira. */
const globalOf = (m, Rx) => (radius === 0 ? Rx : analyse(m, 0));
function renderFunctional() {
  const box = $('funcBox');
  const F = functionalSummary(model, globalOf(model, R));
  const f3 = v => (v == null ? '—' : v.toFixed(3));
  if (!F.stats.length) { box.innerHTML = `<h4>${esc(t('func.title'))}</h4><p class="hint" style="margin:0">${esc(t('func.none'))}</p>`; return; }
  box.innerHTML = `<h4>${esc(t('func.title'))} <button class="linkish" data-info="genotype">ⓘ</button></h4>
    <p class="ineq"><span class="k">${esc(t('func.ineq'))}</span> ${esc(F.inequality)}</p>
    ${F.Hs != null ? `<p class="ineq"><span class="k">${esc(t('func.Hs'))}</span> ${f3(F.Hs)}</p>` : ''}
    <div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('col.label'))}</th><th>${esc(t('func.n'))}</th><th>${esc(t('func.integ'))}</th><th>${esc(t('func.rra'))}</th><th>${esc(t('func.depth'))}</th></tr></thead><tbody>
    ${F.stats.map(s => `<tr><td class="name">${esc(s.label)} <span class="mini">${esc(s.ids.join(', '))}</span></td><td>${s.ids.length}</td><td><b>${f3(s.meanInteg)}</b></td><td>${f3(s.meanRRA)}</td><td>${s.meanDepth == null ? '—' : s.meanDepth.toFixed(2)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
/** Faces da envoltória para as quais o espaço abre (só com exterior marcado e faces registradas). */
function facesLine(id) {
  if (!researchMode) return '';
  const o = orientation(model).perSpace[id];
  if (!o) return '';
  const parts = FACES.filter(f => o.faces[f]).map(f => `<b>${f}</b> ${esc(t('kind.' + o.faces[f]))}`);
  return `<button class="linkish faces" data-info="orientation">${esc(t('sheet.faces'))}: ${parts.join(' · ')}</button>`;
}
function renderOrientation() {
  const box = $('orientBox'), O = orientation(model);
  if (!researchMode) { box.hidden = true; return; }
  const spaces = model.nodes.filter(n => O.perSpace[n.id]);
  box.hidden = !spaces.length && !O.noFace;
  if (box.hidden) return;
  const kindCell = k => (k ? `<span class="kind k-${k}">${esc(t('kind.' + k))}</span>` : '—');
  const byFace = FACES.map(f => `<tr><th class="name">${f}</th>${['opaco', 'vista', 'acesso', 'aberto'].map(k => `<td>${O.byFace[f][k] || '—'}</td>`).join('')}</tr>`).join('');
  box.innerHTML = `<h4>${esc(t('orient.title'))} <button class="linkish" data-info="orientation">ⓘ</button></h4>
    ${O.noFace ? `<p class="bad" style="margin:.2rem 0">${esc(t('orient.noFace', { n: O.noFace }))}</p>` : ''}
    ${spaces.length ? `<div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('col.id'))}</th>${FACES.map(f => `<th>${f}</th>`).join('')}</tr></thead><tbody>
      ${spaces.map(n => `<tr><td class="name">${esc(n.id)} · ${esc(n.name)}</td>${FACES.map(f => `<td>${kindCell(O.perSpace[n.id].faces[f])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="tablewrap" style="display:block;margin-top:.5rem"><table><thead><tr><th class="name">${esc(t('orient.byFace'))}</th>${['opaco', 'vista', 'acesso', 'aberto'].map(k => `<th>${esc(t('kind.' + k))}</th>`).join('')}</tr></thead><tbody>${byFace}</tbody></table></div>` : ''}`;
}
$('orientBox').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('funcBox').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('globalCards').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('sortSel').addEventListener('change', e => { sortKey = e.target.value; sortDir = isTextKey(sortKey) ? 1 : -1; renderResults(); });

/* ---------------- CENÁRIOS ---------------- */
function renderScenarios() {
  const sel = $('scnSel');
  sel.innerHTML = project.scenarios.map(sc => `<option value="${esc(sc.id)}">${esc(sc.name)}</option>`).join('');
  sel.value = project.activeId;
  $('sCount').textContent = '(' + project.scenarios.length + ')';
  const nm = $('scnName');
  if (document.activeElement !== nm) nm.value = activeScenario().name;
  const only = project.scenarios.length === 1;
  $('scnList').innerHTML = project.scenarios.map(sc => `
    <div class="li${sc.id === project.activeId ? ' isroot' : ''}">
      <button class="nm" data-scn="${esc(sc.id)}">${esc(sc.name)}</button>
      <span class="mini">${sc.model.nodes.length}e · ${sc.model.edges.length}l</span>
      <button class="danger" data-scndel="${esc(sc.id)}" ${only ? 'disabled' : ''} aria-label="${esc(t('btn.delete'))}">×</button>
    </div>`).join('');
}
function switchScenario(id) {
  if (id === project.activeId || !project.scenarios.some(sc => sc.id === id)) return;
  histBy.set(project.activeId, hist);
  project.activeId = id;
  hist = histBy.get(id) || { past: [], future: [] };
  model = activeScenario().model;
  selSet.clear(); selEdge = null; multi = false; linkFrom = null; poly.pts = []; sheetFor = null;
  recompute(); fitView();
}
function addScenario(sc) {
  if (project.scenarios.length >= MAX_SCENARIOS) { toast(t('toast.maxScn', { n: MAX_SCENARIOS })); return false; }
  const i = project.scenarios.findIndex(x => x.id === project.activeId);
  project.scenarios.splice(i + 1, 0, sc);
  if (cmpSel) cmpSel.add(sc.id);
  switchScenario(sc.id);
  return true;
}
/** Duplicar = variação do mesmo projeto (mesma família): os espaços são comparados pelo id. */
function duplicateScenario() {
  const sc = activeScenario(), id = newScenarioId(project.scenarios.map(x => x.id));
  const copy = { id, name: t('scn.copyOf', { name: sc.name }).slice(0, 80), family: sc.family, model: migrateModel(JSON.parse(JSON.stringify(sc.model))) };
  if (addScenario(copy)) toast(t('toast.dup'));
}
/** Novo cenário em branco = outro projeto (família própria), começa só com o exterior. */
function newScenario() {
  const id = newScenarioId(project.scenarios.map(x => x.id));
  const m = migrateModel({ nodes: [{ id: 'X', name: t('scn.exterior'), x: W0 / 2, y: H0 - 60, label: t('scn.exterior'), exterior: true }], edges: [], root: 'X' });
  addScenario({ id, name: t('scn.default', { n: project.scenarios.length + 1 }), family: id, model: m });
}
function deleteScenario(id) {
  if (project.scenarios.length < 2) return;
  const i = project.scenarios.findIndex(sc => sc.id === id);
  if (i < 0) return;
  const wasActive = project.activeId === id;
  const [removed] = project.scenarios.splice(i, 1);
  const removedHist = wasActive ? hist : histBy.get(id);
  if (cmpSel) cmpSel.delete(id);
  if (wasActive) {
    project.activeId = project.scenarios[Math.min(i, project.scenarios.length - 1)].id;
    hist = histBy.get(project.activeId) || { past: [], future: [] };
    model = activeScenario().model; selSet.clear(); sheetFor = null;
    recompute(); fitView();
  } else recompute();
  toast(t('toast.scnDeleted', { name: removed.name }), t('toast.undo'), () => {
    project.scenarios.splice(i, 0, removed);
    if (removedHist) histBy.set(id, removedHist);
    if (cmpSel) cmpSel.add(id);
    recompute();
  });
}
/** Importa cenários de outro projeto como novos (ids e famílias renomeados, sem sobrescrever nada). */
function importScenarios(pr) {
  const incoming = pr.scenarios.slice(0, MAX_SCENARIOS - project.scenarios.length);
  if (!incoming.length) { toast(t('toast.maxScn', { n: MAX_SCENARIOS })); return; }
  const used = project.scenarios.map(sc => sc.id), idMap = new Map(), famMap = new Map();
  incoming.forEach(sc => { const id = newScenarioId(used); used.push(id); idMap.set(sc.id, id); });
  incoming.forEach(sc => {
    if (!famMap.has(sc.family)) famMap.set(sc.family, idMap.get(sc.family) || idMap.get(sc.id));
    project.scenarios.push({ id: idMap.get(sc.id), name: sc.name, family: famMap.get(sc.family), model: sc.model });
  });
  switchScenario(idMap.get(incoming[0].id));
  if (!researchMode && incoming.some(sc => hasResearchData(sc.model))) hintResearch(incoming.find(sc => hasResearchData(sc.model)).model);
  else toast(t('toast.imported', { n: incoming.length }));
}

/* ---------------- COMPARAR ---------------- */
const maxDepth = r => r.ids.reduce((m, id) => { const d = r.per[id].depth; return d != null && (m == null || d > m) ? d : m; }, null);
const CMP_INDICATORS = [
  ['card.k', r => r.k, 0, 'k'], ['card.L', r => r.L, 0, 'L'], ['card.rings', r => r.circuit, 0, 'rings'],
  ['card.ringiness', r => r.ringiness, 3, 'ringiness'], ['card.meanConn', r => r.meanConn, 2, 'meanConn'],
  ['card.meanInt', r => r.meanInt, 3, 'integ'], ['card.meanRRA', r => r.meanRRA, 3, 'rra'], ['card.meanMD', r => r.meanMD, 3, 'md'],
  ['card.diameter', r => r.diameter, 0, 'diameter'], ['cmp.maxDepth', maxDepth, 0, 'depth'],
  ['card.Hs', r => r.Hs, 3, 'Hs'], ['card.int', r => r.intelligibility, 3, 'intelligibility'],
];
const cmpKey = () => (currentMeasure === 'focus' ? 'integ' : currentMeasure);

/** Mapa reduzido (não interativo) de um cenário; tamanhos compensados para ficarem legíveis. */
function drawMiniMap(svg, m, Rx, colour) {
  svg.innerHTML = '';
  const b = contentBounds(4 / 3, 24, m, false, 0), k = b.w / 360;
  svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  const pos = new Map(m.nodes.map(n => [n.id, n]));
  m.nodes.forEach(n => {
    if (!n.poly || n.poly.length < 3) return;
    const c = colour(n.id);
    svg.appendChild(Eo('polygon', { points: n.poly.map(p => p.join(',')).join(' '), fill: c, 'fill-opacity': 0.22, stroke: c, 'stroke-width': 1.2 * k }));
  });
  pairsOf(m).forEach(([a, b2]) => {
    const A = pos.get(a), B = pos.get(b2);
    svg.appendChild(Eo('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: C.wall, 'stroke-width': 1.4 * k, 'stroke-opacity': 0.55 }));
  });
  m.nodes.forEach(n => {
    const c = colour(n.id), r = (7 + Rx.per[n.id].conn) * k;
    const g = Eo('g', { transform: `translate(${n.x},${n.y})` });
    if (n.id === m.root) g.appendChild(Eo('circle', { r: r + 3.5 * k, fill: 'none', stroke: C.accent, 'stroke-width': 1.8 * k }));
    g.appendChild(Eo('circle', { r, fill: c, stroke: '#fff', 'stroke-width': 1.5 * k }));
    g.appendChild(txt(0, 3.8 * k, n.id, 10.5 * k, labelInk(c), '700', 't-id'));
    svg.appendChild(g);
  });
}

function renderCompare() {
  const box = $('compareBox'), all = project.scenarios;
  $('cmpViews').querySelectorAll('[data-cv]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cv === cmpView)));
  const cm = $('cmpMeasure');
  cm.innerHTML = MEASURES.filter(x => x.key !== 'focus').map(x => `<option value="${x.key}">${esc(t('m.' + x.key))}</option>`).join('');
  cm.value = cmpKey();
  if (all.length < 2) {
    $('cmpChips').innerHTML = '';
    box.innerHTML = `<div class="valbox">${esc(t('cmp.need2'))}<div class="btnrow"><button data-cmd="dup">${esc(t('cmp.dupNow'))}</button><button class="ghost" data-cmd="new">${esc(t('scn.new'))}</button></div></div>`;
    return;
  }
  $('cmpChips').innerHTML = all.map(sc => `<button class="chipbtn" data-chip="${esc(sc.id)}" aria-pressed="${!cmpSel || cmpSel.has(sc.id)}">${esc(sc.name)}</button>`).join('');
  const scs = all.filter(sc => !cmpSel || cmpSel.has(sc.id));
  if (!scs.length) { box.innerHTML = ''; return; }
  const res = new Map(scs.map(sc => [sc.id, sc.id === project.activeId ? R : analyse(sc.model)]));
  const key = cmpKey(), mm = meta(key), f = FMT[key] || fmt3, f3 = v => (v == null ? '—' : v.toFixed(3));
  // escala de cor comum a todos os cenários incluídos
  const vals = [];
  res.forEach(r => r.ids.forEach(id => { const v = r.per[id][key]; if (v != null && isFinite(v)) vals.push(v); }));
  const mn = vals.length ? Math.min(...vals) : 0, mx = vals.length ? Math.max(...vals) : 1;
  const colourIn = r => id => measureColor(r.per[id][key], mn, mx, mm.invert);

  if (cmpView === 'maps' || cmpView === 'jgraph') {
    const legend = cmpView === 'maps'
      ? `<div class="legend cmp-legend"><span>${esc(t('legend.seg'))} · ${f(mm.invert ? mx : mn)}</span><span class="ramp"></span><span>${f(mm.invert ? mn : mx)} · ${esc(t('legend.int'))}</span></div><p class="hint cmp-note">${esc(t('cmp.scale'))}</p>`
      : '';
    box.innerHTML = legend + `<div class="mini-grid">${scs.map(sc => { const r = res.get(sc.id); return `
      <figure class="mini${sc.id === project.activeId ? ' active' : ''}">
        <figcaption><span><b>${esc(sc.name)}</b><br><small>k ${r.k} · ${esc(t('card.meanInt'))} ${f3(r.meanInt)} · ${esc(t('card.rings'))} ${r.circuit}</small></span>
          <button class="ghost" data-edit="${esc(sc.id)}">${esc(t('cmp.edit'))}</button></figcaption>
        <svg class="minisvg" data-scn="${esc(sc.id)}" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="xMidYMid meet"></svg>
      </figure>`; }).join('')}</div>`;
    box.querySelectorAll('svg.minisvg').forEach(svg => {
      const sc = scs.find(x => x.id === svg.dataset.scn), r = res.get(sc.id);
      if (cmpView === 'maps') drawMiniMap(svg, sc.model, r, colourIn(r)); else drawJGraph(svg, sc.model, r);
    });
    return;
  }

  if (cmpView === 'table') {
    const basis = t(conv.differenceFactor === 'ra' ? 'basis.ra' : 'basis.integ');
    let rows = CMP_INDICATORS.map(([lk, fn, dig, info]) => {
      const v = scs.map(sc => fn(res.get(sc.id)));
      const nums = v.filter(x => x != null && isFinite(x));
      const hi = nums.length > 1 ? Math.max(...nums) : null, lo = nums.length > 1 ? Math.min(...nums) : null;
      return `<tr><th class="name rowh"><button class="linkish" data-info="${info}">${esc(t(lk, { basis }))}</button></th>${v.map(x => {
        const mark = hi !== lo && x === hi ? '▲' : hi !== lo && x === lo ? '▼' : '';
        return `<td>${x == null || !isFinite(x) ? '—' : dig ? x.toFixed(dig) : x}<span class="mark">${mark}</span></td>`;
      }).join('')}</tr>`;
    }).join('');
    rows += `<tr><th class="name rowh"><button class="linkish" data-info="type">${esc(t('card.types'))}</button></th>${scs.map(sc => { const c = res.get(sc.id).typeCounts; return `<td>${c.a.length}/${c.b.length}/${c.c.length}/${c.d.length}</td>`; }).join('')}</tr>`;
    if (scs.some(sc => sc.model.nodes.some(n => n.label))) {
      rows += `<tr><th class="name rowh"><button class="linkish" data-info="genotype">${esc(t('cmp.genotype'))}</button></th>${scs.map(sc => `<td class="name wrap">${esc(functionalSummary(sc.model, globalOf(sc.model, res.get(sc.id))).inequality || '—')}</td>`).join('')}</tr>`;
    }
    box.innerHTML = `<div class="tablewrap" style="display:block"><table class="cmp-table"><thead><tr><th class="name">${esc(t('cmp.indicator'))}</th>${scs.map(sc => `<th>${esc(sc.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="foot">${researchMode ? esc(t('cmp.layerNote', { layer: t('layer.' + layer) })) + ' ' : ''}${esc(t('cmp.maxMin'))} ${esc(t('cmp.sizeNote'))}</p>`;
    return;
  }

  // Δ por espaço entre dois cenários
  const ids = scs.map(sc => sc.id);
  if (!ids.includes(cmpRef)) cmpRef = ids[0];
  if (!ids.includes(cmpOther) || cmpOther === cmpRef) cmpOther = ids.find(i => i !== cmpRef) || null;
  const opt = selId => scs.map(sc => `<option value="${esc(sc.id)}" ${sc.id === selId ? 'selected' : ''}>${esc(sc.name)}</option>`).join('');
  let html = `<div class="cmp-pair"><label><span>${esc(t('cmp.ref'))}</span><select id="cmpRef">${opt(cmpRef)}</select></label><span aria-hidden="true">→</span><label><span>${esc(t('cmp.other'))}</span><select id="cmpOther">${opt(cmpOther)}</select></label></div>`;
  if (!cmpOther) { box.innerHTML = html + `<div class="valbox">${esc(t('cmp.need2'))}</div>`; return; }
  const A = scs.find(sc => sc.id === cmpRef), B = scs.find(sc => sc.id === cmpOther), RA = res.get(A.id), RB = res.get(B.id);
  const match = matchSpaces(A.model, B.model, A.family === B.family);
  const rkA = ranks(RA, key), rkB = ranks(RB, key);
  const nA = new Map(A.model.nodes.map(n => [n.id, n])), nB = new Map(B.model.nodes.map(n => [n.id, n]));
  const dfmt = d => (f === fmtInt ? String(d) : d.toFixed(f === fmt1 ? 1 : 3));
  const rows = match.pairs
    .map(pr => { const va = RA.per[pr.a][key], vb = RB.per[pr.b][key]; return { pr, va, vb, d: va != null && vb != null ? vb - va : null }; })
    .sort((x, y) => Math.abs(y.d ?? 0) - Math.abs(x.d ?? 0));
  if (!rows.length) html += `<div class="valbox">${esc(t('cmp.noMatch'))}</div>`;
  else html += `<div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('col.id'))}</th><th>${esc(A.name)}</th><th>${esc(B.name)}</th><th>Δ</th><th>${esc(t('cmp.rank'))}</th></tr></thead><tbody>
    ${rows.map(({ pr, va, vb, d }) => {
      const na = nA.get(pr.a), nb = nB.get(pr.b);
      const name = na.name === nb.name ? esc(na.name) : `${esc(na.name)} → ${esc(nb.name)}`;
      return `<tr><td class="name"><span class="chip" style="background:${colourIn(RB)(pr.b)}"></span> ${name} <span class="tag">${esc(t('cmp.by.' + pr.by))}</span></td>
        <td>${f(va)}</td><td>${f(vb)}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? '—' : (d > 0 ? '+' : '') + dfmt(d)}</td>
        <td>${rkA[pr.a] ?? '—'} → ${rkB[pr.b] ?? '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  const only = (list, names, sc) => (list.length ? `<p class="foot">${esc(t('cmp.only', { s: sc.name, ids: list.map(i => names.get(i).name).join(', ') }))}</p>` : '');
  html += only(match.onlyA, nA, A) + only(match.onlyB, nB, B);
  html += `<p class="foot">${esc(t(A.family === B.family ? 'cmp.matchFamily' : 'cmp.matchOther'))} ${esc(t('cmp.sizeNote'))}</p>`;
  box.innerHTML = html;
}
$('cmpViews').addEventListener('click', e => { const b = e.target.closest('[data-cv]'); if (b) { cmpView = b.dataset.cv; renderCompare(); } });
$('cmpChips').addEventListener('click', e => {
  const b = e.target.closest('[data-chip]');
  if (!b) return;
  if (!cmpSel) cmpSel = new Set(project.scenarios.map(sc => sc.id));
  if (cmpSel.has(b.dataset.chip)) { if (cmpSel.size > 1) cmpSel.delete(b.dataset.chip); } else cmpSel.add(b.dataset.chip);
  renderCompare();
});
$('cmpMeasure').addEventListener('change', e => { currentMeasure = e.target.value; renderAll(); autosave(); });
$('compareBox').addEventListener('click', e => {
  const info = e.target.closest('[data-info]');
  if (info) { openInfo(info.dataset.info); return; }
  const ed = e.target.closest('[data-edit]');
  if (ed) { switchScenario(ed.dataset.edit); setView('graph'); return; }
  const cmd = e.target.closest('[data-cmd]');
  if (cmd) { if (cmd.dataset.cmd === 'dup') duplicateScenario(); else newScenario(); setView('compare'); }
});
$('compareBox').addEventListener('change', e => {
  if (e.target.id === 'cmpRef') cmpRef = e.target.value;
  if (e.target.id === 'cmpOther') cmpOther = e.target.value;
  if (cmpRef === cmpOther) cmpOther = null;
  renderCompare();
});

/* ---------------- TOOLTIP (só mouse) ---------------- */
function hoverTip(e) {
  const g = e.target.closest('.node');
  if (!g) { hideTip(); return; }
  const id = g.dataset.id, p = R.per[id], n = byId.get(id);
  tip.innerHTML = `<b>${esc(id)} · ${esc(n.name)}</b> <i>${esc(t('type'))} ${p.type}</i><br>${esc(t('col.integ'))} ${fmt3(p.integ)} · ${esc(t('col.choice'))} ${fmt1(p.choice)}<br>${esc(t('col.conn'))} ${p.conn} · ${esc(t('col.ctrl'))} ${fmt3(p.ctrl)}<br>${esc(t('col.depth'))} ${fmtInt(p.depth)} · ${esc(t('col.md'))} ${fmt3(p.md)}`;
  tip.style.opacity = 1;
  tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
}
function hideTip() { tip.style.opacity = 0; }

/* ---------------- EXPORTAÇÃO ---------------- */
function download(data, name, type) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) { /* navegador bloqueou */ }
}
function putIO(text, what) {
  const grp = $('grpIO'); grp.open = true;
  const io = $('io'); io.value = text;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
  $('ioNote').textContent = t('io.note', { what }); $('ioNote').hidden = false;
}
function showImageOverlay(url, name) {
  $('ovlImg').src = url; $('ovlDl').href = url; $('ovlDl').download = name;
  $('ovlHint').textContent = t('ovl.hint');
  $('ovl').style.display = 'flex';
}
function tableCSV() {
  // modo Simples: mesmas colunas de antes; modo Pesquisa acrescenta camada e faces
  const cols = ['id', 'name', 'label', ...(researchMode ? ['camada', 'faces'] : []), 'type', 'conn', 'ctrl', 'controllability', 'choice', 'depth', 'td', 'md', 'ra', 'rra', 'integ', 'ent'];
  const orient = orientation(model).perSpace;
  let out = cols.join(',') + '\n';
  model.nodes.forEach(n => {
    const p = R.per[n.id];
    const faces = orient[n.id] ? FACES.filter(f => orient[n.id].faces[f]).map(f => f + ':' + orient[n.id].faces[f]).join(';') : '';
    out += [n.id, '"' + n.name.replace(/"/g, '""') + '"', '"' + (n.label || '').replace(/"/g, '""') + '"', ...(researchMode ? [layer, faces] : []), p.type, p.conn, p.ctrl, p.controllability, p.choice, p.depth, p.td, p.md, p.ra, p.rra, p.integ, p.ent]
      .map(v => (typeof v === 'number' ? (+v).toFixed(4) : v == null ? '' : v)).join(',') + '\n';
  });
  return out;
}
function exportPNG(svg, name, bounds) {
  const cl = svg.cloneNode(true);
  cl.querySelectorAll('.halo, .hit, .edgehit').forEach(el => el.remove());
  const b = bounds || { x: 0, y: 0, w: W0, h: H0 }, W = 1600, H = Math.round(W * b.h / b.w);
  cl.setAttribute('xmlns', SVGNS); cl.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  cl.setAttribute('width', W); cl.setAttribute('height', H);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(cl)], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); cx.fillStyle = C.paper; cx.fillRect(0, 0, W, H); cx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    try { cv.toBlob(bl => { showImageOverlay(URL.createObjectURL(bl), name); download(bl, name); }); }
    catch (_) { showImageOverlay(cv.toDataURL('image/png'), name); }
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast(t('png.fail')); };
  img.src = url;
}

/* ---------------- VISTAS ---------------- */
function setView(v) {
  if (v === 'model' && !narrow.matches) v = 'graph';
  view = v;
  document.body.dataset.view = v;
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  document.querySelectorAll('[role=tab][data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  if (v === 'compare') renderCompare();
  hideTip();
}
narrow.addEventListener('change', () => { if (!narrow.matches && view === 'model') setView('graph'); });
document.querySelectorAll('[role=tab][data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------------- LIGAÇÕES DA INTERFACE ---------------- */
document.querySelectorAll('.modebtn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('zoomIn').addEventListener('click', () => zoomCenter(1 / 1.4));
$('zoomOut').addEventListener('click', () => zoomCenter(1.4));
$('zoomFit').addEventListener('click', fitView);
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);
$('btnProjector').addEventListener('click', () => {
  projector = !projector;
  document.documentElement.classList.toggle('projector', projector);
  $('btnProjector').setAttribute('aria-pressed', String(projector));
  autosave();
});
$('btnLang').addEventListener('click', () => {
  setLang(getLang() === 'pt' ? 'en' : 'pt');
  applyI18n(); $('btnLang').textContent = getLang() === 'pt' ? 'EN' : 'PT';
  renderAll();
});
$('measureInfo').addEventListener('click', () => openInfo(currentMeasure));

$('addNode').addEventListener('click', () => {
  const inp = $('newName'), c = contentBounds();
  addNodeAt(c.x + c.w / 2 + Math.random() * 30 - 15, c.y + c.h / 2 + Math.random() * 30 - 15, inp.value.trim().slice(0, 200));
  inp.value = '';
});
$('newName').addEventListener('keydown', e => { if (e.key === 'Enter') $('addNode').click(); });
$('nodeList').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { armConfirm(del, () => deleteNodes([del.dataset.del])); return; }
  const open = e.target.closest('[data-open]');
  if (open) openSheet({ kind: 'node', id: open.dataset.open });
});
$('nodeList').addEventListener('change', e => { const r = e.target.closest('.rootpick'); if (r) setRoot(r.dataset.root); });
$('edgeList').addEventListener('click', e => {
  const del = e.target.closest('[data-dele]'), open = e.target.closest('[data-edge]');
  const i = del ? +del.dataset.dele : open ? +open.dataset.edge : -1;
  const ed = model.edges[i];
  if (!ed) return;
  if (del) removeEdge(edgeKey(ed)); else selectEdge(edgeKey(ed));
});
$('addEdge').addEventListener('click', () => addEdge($('edgeA').value, $('edgeB').value));
$('rootSel').addEventListener('change', e => setRoot(e.target.value));
$('measureSel').addEventListener('change', e => { currentMeasure = e.target.value; renderAll(); autosave(); });
$('optSnap').addEventListener('change', e => { snap = e.target.checked; autosave(); });
$('optValues').addEventListener('change', e => { showValues = e.target.checked; renderGraph(); renderJ(); autosave(); });
$('optRadius').addEventListener('change', e => { radius = clamp(parseInt(e.target.value, 10) || 0, 0, 99); recompute(); });
$('optEntropy').addEventListener('change', e => { conv.entropy = e.target.value; recompute(); });
$('optHFactor').addEventListener('change', e => { conv.differenceFactor = e.target.value; recompute(); });
document.querySelectorAll('[data-mode-btn]').forEach(b => b.addEventListener('click', () => setResearchMode(b.dataset.modeBtn === 'research')));
$('optDoorVisual').addEventListener('change', e => { doorIsVisual = e.target.checked; recompute(); });
document.addEventListener('change', e => {
  if (!e.target.classList || !e.target.classList.contains('layer-sel')) return;
  layer = e.target.value;
  recompute();
});
$('btnDerive').addEventListener('click', deriveAdjacency);

$('bgFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { bg.img = r.result; $('bgControls').hidden = false; saveBg(); renderGraph(); autosave(); };
  r.readAsDataURL(f);
});
const BG_INPUTS = { bgOp: 'op', bgRot: 'rot', bgScale: 'scale', bgDx: 'dx', bgDy: 'dy' };
Object.entries(BG_INPUTS).forEach(([id, key]) => $(id).addEventListener('input', e => { bg[key] = parseFloat(e.target.value); renderGraph(); autosave(); }));
$('bgClear').addEventListener('click', () => { bg.img = null; $('bgControls').hidden = true; $('bgFile').value = ''; saveBg(); renderGraph(); autosave(); });

$('exCSV').addEventListener('click', () => { const s = tableCSV(); download(s, 'space-syntax-measures.csv', 'text/csv'); putIO(s, 'CSV'); });
$('exPNG').addEventListener('click', () => exportPNG(svgG, 'configuration-graph.png', contentBounds(ASPECT)));
$('exPNGJ').addEventListener('click', () => exportPNG(svgJ, 'justified-graph.png'));
$('exCopy').addEventListener('click', () => {
  const s = tableCSV();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(() => toast(t('toast.copied'))).catch(() => putIO(s, 'CSV'));
  else putIO(s, 'CSV');
});
$('exPrint').addEventListener('click', () => { setView('results'); setTimeout(() => window.print(), 150); });
$('btnExport').addEventListener('click', () => { const j = JSON.stringify(project, null, 2); download(j, 'space-syntax-project.json', 'application/json'); putIO(j, 'JSON'); });
$('btnLoad').addEventListener('click', () => {
  const w = $('ioWarn');
  try {
    const data = JSON.parse($('io').value);
    w.hidden = true;
    if (data && typeof data === 'object' && 'scenarios' in data) { importScenarios(migrateProject(data)); return; }
    const { model: m, warnings } = migrateModelWithReport(data);
    const pre = snapshot(); setModel(m); selSet.clear(); commit(pre); recompute(); fitView();
    if (warnings.length) { w.hidden = false; w.textContent = '⚠ ' + warnings.join(' '); }
    hintResearch(m);
  } catch (err) {
    w.hidden = false;
    w.textContent = '⚠ ' + (err instanceof SyntaxError ? t('err.json') : err.message) + ' ' + t('err.expect');
  }
});
$('btnReset').addEventListener('click', () => { const pre = snapshot(); setModel(migrateModel(VALIDATED)); selSet.clear(); currentMeasure = 'integ'; radius = 0; commit(pre); recompute(); fitView(); });
$('scnSel').addEventListener('change', e => switchScenario(e.target.value));
$('scnName').addEventListener('change', e => { const v = e.target.value.trim().slice(0, 80); if (v) { activeScenario().name = v; renderScenarios(); autosave(); } });
$('scnName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('scnDup').addEventListener('click', duplicateScenario);
$('scnNew').addEventListener('click', newScenario);
$('scnList').addEventListener('click', e => {
  const del = e.target.closest('[data-scndel]');
  if (del) { armConfirm(del, () => deleteScenario(del.dataset.scndel)); return; }
  const sw = e.target.closest('[data-scn]');
  if (sw) switchScenario(sw.dataset.scn);
});
$('ovlClose').addEventListener('click', () => { $('ovl').style.display = 'none'; $('ovlImg').src = ''; });

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('infoDlg').open) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selSet.size) { e.preventDefault(); deleteNodes([...selSet]); }
    else if (selEdge) { e.preventDefault(); removeEdge(selEdge); }
    return;
  }
  if (k === 'n') addNodeAt(lastMouse.x, lastMouse.y);
  if (k === 'l' && selSet.size === 2) { const [a, b] = [...selSet]; addEdge(a, b); }
  if (k === 'r' && selSet.size === 1) setRoot([...selSet][0]);
  if (e.key === 'Enter' && mode === 'poly') finishPoly();
  if (e.key === 'Escape') {
    if (mode === 'poly' && poly.pts.length) cancelPoly();
    else if (linkFrom) cancelLink();
    else clearSelection();
  }
});

/* ---------------- INÍCIO ---------------- */
loadSaved();
setLang(getLang());
applyI18n();
$('btnLang').textContent = getLang() === 'pt' ? 'EN' : 'PT';
document.documentElement.classList.toggle('projector', projector);
document.body.classList.toggle('research', researchMode);
document.querySelectorAll('[data-mode-btn]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.modeBtn === 'research') === researchMode)));
$('btnProjector').setAttribute('aria-pressed', String(projector));
$('bgControls').hidden = !bg.img;
Object.entries(BG_INPUTS).forEach(([id, key]) => { $(id).value = bg[key]; });
recompute();
setMode('select');
setView('graph');
fitView();
