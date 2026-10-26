import { POIESIS13_WEIGHTS, weightedInput, analyse as runAnalysis, migrateModel, migrateModelWithReport, edgeKey, EDGE_KINDS, layerInput, layerKinds, orientation, FACES, SYNTACTIC_LAYER, syntacticInput, jgraphLayout, diagnose, CONJUNTOS, exemplarChecklist, manifestCSV, exemplarFileName, migrateProject, newScenarioId, matchSpaces, functionalSummary, ranks, MAX_SCENARIOS, DEFAULT_OPTIONS } from './engine/index.ts';
import { escapeHtml as esc } from './util/html.ts';
import { t, getLang, setLang, applyI18n } from './i18n.js';
import { GLOSSARY } from './glossary.js';
import { niceTicks, linearFit, groupCoincident, categoryColors, OTHER_COLOR, toCSV } from './util/chart.ts';
import pkg from '../package.json';
import { snapPoint, sharedWall } from './geometry/snap.ts';
import { detectAdjacency, closeGaps } from './geometry/adjacency.ts';
import { exteriorPieces, suggestFaces } from './geometry/exterior.ts';

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
// snap: onde o próximo ponto vai grudar (ímã); wall: lado vizinho tocado no 1º ponto (parede compartilhada)
const poly = { pts: [], cursor: null, snap: null, wall: null };
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
// Modo Poiesis13 (liga também researchMode): sem opaco; relações ponderadas acesso=1, aberto=1,5, janela(vista)=0,5,
// cada passo custa 1/peso. Mostra lado a lado a integração tradicional (acesso=aberto=1, janela=0).
let poiesis = false;
// Detecção de vizinhança (F4.3.3): tolerâncias em cm, convertidas pela escala do desenho (geo).
let tolCm = 15, minContactCm = 30;
let review = null; // { cands, sel: Set<chave do par>, focus } enquanto a revisão está aberta
let faceRev = null; // { items, extra, sel: Set<'id|F'>, focus } enquanto a revisão de faces está aberta
let linkKind = 'acesso'; // categoria das ligações criadas no modo Ligar (Pesquisa)
/**
 * Traço de cada categoria no modo Pesquisa: cor E padrão distintos (daltonismo, impressão P&B).
 * opaco = pontilhado cinza · vista = tracejado azul · acesso = contínuo · aberto = linha dupla espessa.
 */
const KIND_STYLE = {
  opaco: { stroke: '#8c8679', width: 1.6, dash: '1 4', cap: 'round' },
  vista: { stroke: '#2f5d8a', width: 1.8, dash: '7 4' },
  acesso: { stroke: '#2a2824', width: 2 },
  aberto: { stroke: '#2a2824', width: 6, inner: '#faf8f2', innerWidth: 2.2 },
};
/** Linha(s) SVG de uma categoria entre dois pontos (usada no mapa, na legenda e nos botões). */
function kindLines(kind, x1, y1, x2, y2, opacity = 1, extraClass = '') {
  const s = KIND_STYLE[kind], out = [];
  const base = { x1, y1, x2, y2, stroke: s.stroke, 'stroke-width': s.width, 'stroke-opacity': opacity, 'stroke-linecap': s.cap || 'butt', class: ('edge-r ' + extraClass).trim() };
  if (s.dash) base['stroke-dasharray'] = s.dash;
  out.push(Eo('line', base));
  if (s.inner) out.push(Eo('line', { x1, y1, x2, y2, stroke: s.inner, 'stroke-width': s.innerWidth, 'stroke-opacity': opacity, class: 'edge-inner' }));
  return out;
}
const kindSwatch = k => `<svg class="kindsw" viewBox="0 0 44 12" aria-hidden="true">${kindLines(k, 3, 6, 41, 6).map(el => el.outerHTML).join('')}</svg>`;
// Medidas sintáticas usam SÓ as ligações de passagem (acesso e aberto), como na literatura.
// opaco e vista ficam registradas (e na orientação), mas fora do cálculo — ver syntacticInput no motor.
const PASSAGE = layerKinds(SYNTACTIC_LAYER);
const inLayer = e => PASSAGE.has(e.kind);
const inputOf = m => (poiesis ? weightedInput(m) : syntacticInput(m));
const pairsOf = m => inputOf(m).edges;
function analyse(m, r = radius) { return runAnalysis(inputOf(m), { ...conv, radius: r }); }
const analyseTrad = m => runAnalysis(syntacticInput(m), { ...conv, radius });
/** Ligação aparece na tela? Simples: só passagens; Pesquisa: todas; Poiesis13: todas menos opaco. */
const shownEdge = e => (poiesis ? POIESIS13_WEIGHTS[e.kind] > 0 : researchMode || inLayer(e));
/** Ligação entra no cálculo? (traço forte no mapa) */
const counted = e => (poiesis ? POIESIS13_WEIGHTS[e.kind] > 0 : inLayer(e));
const kindsShown = () => (poiesis ? EDGE_KINDS.filter(k => POIESIS13_WEIGHTS[k] > 0) : EDGE_KINDS);
let RT = null; // análise tradicional, só no Poiesis13
/** O modelo tem informação que só o modo Pesquisa mostra? (o exterior marcado sozinho não conta) */
const hasResearchData = m => m.edges.some(e => e.kind !== 'acesso' || e.face);
const modeName = () => (poiesis ? 'poiesis' : researchMode ? 'research' : 'simple');
function paintMode() {
  document.body.classList.toggle('research', researchMode);
  document.body.classList.toggle('poiesis', poiesis);
  // selo e legenda do j-graph mudam no Poiesis13 (data-i18n mantém a troca de idioma)
  [['modeBadge', poiesis ? 'mode.poiesis' : 'mode.research'], ['jFoot', poiesis ? 'help.jgraphP' : 'help.jgraph']].forEach(([id, k]) => { $(id).dataset.i18n = k; $(id).textContent = t(k); });
  document.querySelectorAll('[data-mode-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === modeName())));
}
function setResearchMode(on, p = false) {
  researchMode = !!on || p; poiesis = p;
  if (!kindsShown().includes(linkKind)) linkKind = 'acesso';
  paintMode();
  if (selEdge && !shownEdge(findEdge(selEdge) || {})) selEdge = null;
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
      currentMeasure, showValues, snap, radius, conv, projector, researchMode, poiesis, tolCm, minContactCm, scatterX, scatterY, scatterColor,
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
      researchMode = !!o.researchMode; poiesis = !!o.poiesis;
      if (SCATTER_KEYS.includes(o.scatterX)) scatterX = o.scatterX;
      if (SCATTER_KEYS.includes(o.scatterY)) scatterY = o.scatterY;
      if (['single', 'label', 'type'].includes(o.scatterColor)) scatterColor = o.scatterColor;
      if (o.tolCm > 0) tolCm = o.tolCm;
      if (o.minContactCm > 0) minContactCm = o.minContactCm;
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
/** Profundidade: inteira no modelo topológico; com 2 casas no Poiesis13 (custos fracionários). */
const fmtDepth = v => (v == null || !isFinite(v) ? '—' : Number.isInteger(v) ? String(v) : (+v).toFixed(2));
const fmtDelta = v => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (+v).toFixed(3));
const FMT = { integ: fmt3, integT: fmt3, dInteg: fmtDelta, choice: fmt1, ctrl: fmt3, controllability: fmt3, conn: fmtInt, focus: fmtInt, depth: fmtDepth, md: fmt3, rra: fmt3, ra: fmt3, td: fmtDepth, ent: fmt3 };
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
  RT = poiesis ? analyseTrad(model) : null;
  if (review) refreshReview();
  if (faceRev) refreshFaces();
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
  const shown = model.edges.map((e, i) => [e, i]).filter(([e]) => shownEdge(e));
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
  ss.innerHTML = cols().map(k => `<option value="${k}">${esc(colLabelLong(k))}</option>`).join('');
  ss.value = sortKey;
  $('sortDir').textContent = dirBtn(sortDir); $('sortDir').title = $('sortDir').ariaLabel = dirLabel(sortDir);
  $('optSnap').checked = snap; $('optValues').checked = showValues; $('optRadius').value = radius;
  $('optEntropy').value = conv.entropy; $('optHFactor').value = conv.differenceFactor;
  const sc = model.geo && model.geo.escala_m_por_unidade;
  $('scaleTxt').textContent = sc ? t('scale.value', { n: (1 / sc).toFixed(1) }) : t('scale.none');
  $('optTol').value = tolCm; $('optMinContact').value = minContactCm;
  const ext = model.nodes.find(x => x.exterior), north = northDeg();
  $('extTxt').textContent = ext ? `${ext.id} · ${ext.name}` : t('ext.none');
  $('btnExt').hidden = !!ext;
  if (document.activeElement !== $('northNum')) $('northNum').value = Math.round(north);
  $('northRange').value = Math.round(north);
  renderExemplar();
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
    if (!shownEdge(e)) return;
    const pa = byId.get(e.a), pb = byId.get(e.b), key = edgeKey(e), sel = selEdge === key;
    // Simples: o traço de sempre. Pesquisa: traço da categoria; fora da camada analisada fica claro.
    const lines = researchMode
      ? kindLines(e.kind, pa.x, pa.y, pb.x, pb.y, counted(e) ? 0.85 : 0.3, sel ? 'seledge' : '')
      : [Eo('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: C.wall, 'stroke-width': 1.6, 'stroke-opacity': 0.55, class: 'edge' + (sel ? ' seledge' : '') })];
    const hit = Eo('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: 'transparent', 'stroke-width': 12, class: 'edgehit' });
    hit.dataset.key = key;
    lines.forEach(l => svgG.appendChild(l)); svgG.appendChild(hit);
    edgeEls.push({ a: e.a, b: e.b, ln: lines[0], extra: lines.slice(1), hit });
  });
  renderKindLegend();
  if (review) drawReviewOverlay();
  if (faceRev) drawFacesOverlay();
  renderCompass();
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
  if ((mode === 'poly' || mode === 'measure') && (poly.pts.length || poly.cursor)) drawPolyPreview();
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
    for (const el of [ed.ln, ...(ed.extra || []), ed.hit]) { el.setAttribute('x1', a.x); el.setAttribute('y1', a.y); el.setAttribute('x2', b.x); el.setAttribute('y2', b.y); }
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
  if (mode === 'poly' || mode === 'measure') { gesture = { ...g, type: 'polyPlace' }; previewSnap(pt); }
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
  if (gesture.type === 'polyPlace') { previewSnap(pt); return; }
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
  if (g.type === 'polyPlace') {
    if (cancelled) { poly.snap = null; poly.cursor = null; drawPolyPreview(); return; }
    polyAddPoint(poly.snap || polySnap(clientToWorld(e.clientX, e.clientY)));
    if (g.touch) { poly.cursor = null; poly.snap = null; drawPolyPreview(); }
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
  if (mode === 'poly' || mode === 'measure') previewSnap(pt);
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
  if (existing) { toast(!shownEdge(existing) ? t('toast.linkHidden', { kind: t('kind.' + existing.kind) }) : t('toast.linkExists')); return; }
  mutate(() => model.edges.push({ a, b, kind: researchMode ? linkKind : 'acesso' }));
}
/** Muda a categoria da ligação (modo Pesquisa). */
function setEdgeKind(key, kind) {
  const e = findEdge(key);
  if (!e || e.kind === kind || !EDGE_KINDS.includes(kind)) return;
  mutate(() => { e.kind = kind; });
}
/** Muda a face de uma ligação com o exterior; respeita "uma por par e por face". */
function setEdgeFace(key, face) {
  const e = findEdge(key);
  if (!e) return;
  const next = face ? { ...e, face } : { a: e.a, b: e.b, kind: e.kind };
  const nk = edgeKey(next);
  if (nk !== key && findEdge(nk)) { toast(t('toast.faceTaken', { face })); renderSheet(); return; }
  mutate(() => { if (face) e.face = face; else delete e.face; });
  selEdge = nk; sheetFor = { kind: 'edge', key: nk }; renderGraph(); renderSheet();
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
function clearSelection() { selSet.clear(); selEdge = null; multi = false; if (!review && !faceRev) closeSheet(); renderGraph(); refreshSel(); }
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
/** Ímã: gruda em vértices e lados dos polígonos existentes; senão, grade (se ligada) ou ponto livre. */
function polySnap(pt) {
  const r = (lastPointerType === 'mouse' ? 10 : 18) / pxPerUnit();
  const targets = model.nodes.filter(n => n.poly && n.poly.length >= 3).map(n => ({ owner: n.id, poly: n.poly }));
  const res = snapPoint([pt.x, pt.y], targets, r);
  if (res.kind === 'none') res.p = [snapV(pt.x), snapV(pt.y)];
  return res;
}
function previewSnap(pt) { poly.snap = polySnap(pt); poly.cursor = poly.snap.p; drawPolyPreview(); }
function polyAddPoint(res) {
  const p = res.p;
  if (mode === 'measure') {
    if (poly.pts.length >= 2) return;
    poly.pts.push([p[0], p[1]]);
    drawPolyPreview(); renderCtx();
    if (poly.pts.length === 2) setTimeout(() => { const i = $('calibM'); if (i) i.focus(); }, 0);
    return;
  }
  if (poly.pts.length >= 3) {
    const f = poly.pts[0], ctm = svgG.getScreenCTM();
    const dx = (f[0] - p[0]) * ctm.a, dy = (f[1] - p[1]) * ctm.d;
    if (Math.hypot(dx, dy) < 22) { finishPoly(); return; }
  }
  // 1º ponto sobre o lado de um vizinho: oferece usar a parede inteira
  poly.wall = !poly.pts.length && res.kind === 'edge' ? res.seg : null;
  poly.pts.push([p[0], p[1]]);
  drawPolyPreview(); renderCtx();
}
/** Parede compartilhada: troca o 1º ponto pelos dois vértices do lado vizinho (na ordem inversa). */
function useSharedWall() {
  if (!poly.wall || poly.pts.length !== 1) return;
  poly.pts = sharedWall(poly.wall);
  poly.wall = null;
  drawPolyPreview(); renderCtx();
}
function drawPolyPreview() {
  if (polyPreview) polyPreview.remove();
  polyPreview = null;
  if ((mode !== 'poly' && mode !== 'measure') || (!poly.pts.length && !poly.cursor)) return;
  const k = pxPerUnit(), g = Eo('g', { 'pointer-events': 'none' });
  const pts = poly.cursor ? [...poly.pts, poly.cursor] : poly.pts;
  // indicador do ímã: círculo = vértice; losango + lado destacado = parede
  const s = poly.snap, blue = '#2f5d8a';
  if (s && s.kind === 'edge') {
    g.appendChild(Eo('line', { x1: s.seg[0][0], y1: s.seg[0][1], x2: s.seg[1][0], y2: s.seg[1][1], stroke: blue, 'stroke-width': 4 / k, 'stroke-opacity': 0.45 }));
    const d = 7 / k;
    g.appendChild(Eo('polygon', { points: `${s.p[0]},${s.p[1] - d} ${s.p[0] + d},${s.p[1]} ${s.p[0]},${s.p[1] + d} ${s.p[0] - d},${s.p[1]}`, fill: '#fff', stroke: blue, 'stroke-width': 2 / k }));
  } else if (s && s.kind === 'vertex') {
    g.appendChild(Eo('circle', { cx: s.p[0], cy: s.p[1], r: 8 / k, fill: 'none', stroke: blue, 'stroke-width': 2.2 / k }));
  }
  if (pts.length > 1) g.appendChild(Eo('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'rgba(178,58,46,.08)', stroke: C.accent, 'stroke-width': 1.6 / k * 1.2 }));
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
  poly.pts = []; poly.cursor = null; poly.snap = null; poly.wall = null;
  mutate(() => model.nodes.push({ id, name: t('newSpace', { n: model.nodes.length + 1 }), x: Math.round(cx), y: Math.round(cy), poly: pts }));
  if (!isConvex(pts)) toast(t('toast.nonconvex'));
}
function cancelPoly() { poly.pts = []; poly.cursor = null; poly.snap = null; poly.wall = null; drawPolyPreview(); renderCtx(); }


/* ---------------- MODO E BARRA DE CONTEXTO ---------------- */
function setMode(m) {
  mode = m; linkFrom = null; poly.pts = []; poly.cursor = null; poly.snap = null; poly.wall = null; multi = false;
  document.querySelectorAll('.modebtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  renderGraph(); renderCtx();
}
function renderCtx() {
  let html = '';
  if (mode === 'add') html = `<span>${t('ctx.add')}</span>`;
  else if (mode === 'link') html = `<span>${linkFrom ? t('ctx.link2', { id: esc(linkFrom) }) : t('ctx.link1')}</span>` +
    (researchMode ? `<div class="kindpick inbar" role="radiogroup" aria-label="${esc(t('edge.kind'))}">${kindsShown().map(k => `<button data-ctx="linkKind" data-k="${k}" role="radio" aria-checked="${k === linkKind}" title="${esc(t('kind.' + k))}">${kindSwatch(k)}<span>${esc(t('kind.' + k))}</span></button>`).join('')}</div>` : '') +
    (linkFrom ? `<button data-ctx="cancelLink">${t('btn.cancel')}</button>` : '');
  else if (mode === 'measure') {
    const n = poly.pts.length;
    html = n < 2
      ? `<span>${t('ctx.measure', { n: n + 1 })}</span><button data-ctx="cancelMeasure">${t('btn.cancel')}</button>`
      : `<span>${t('ctx.measureDist')}</span><input type="number" id="calibM" class="calib" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00"><span>m</span><button class="primary" data-ctx="calibOk">OK</button><button data-ctx="cancelMeasure">${t('btn.cancel')}</button>`;
  }
  else if (mode === 'poly') {
    const n = poly.pts.length;
    html = `<span>${t('ctx.poly')}</span>` +
      (poly.wall && n === 1 ? `<button class="primary" data-ctx="useWall">${t('btn.useWall')}</button>` : '') +
      `<button data-ctx="undoPt" ${n ? '' : 'disabled'}>${t('btn.undoPt')}</button>` +
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
    case 'linkKind': linkKind = b.dataset.k; renderCtx(); break;
    case 'undoPt': poly.pts.pop(); poly.wall = null; drawPolyPreview(); renderCtx(); break;
    case 'closePoly': finishPoly(); break;
    case 'cancelPoly': cancelPoly(); break;
    case 'useWall': useSharedWall(); break;
    case 'calibOk': applyCalibration(); break;
    case 'cancelMeasure': setMode('select'); break;
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
  if ((review || faceRev) && target.kind !== 'review' && target.kind !== 'faces') return; // durante uma revisão, tocar no mapa não troca o painel
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
function closeSheet() {
  if (!sheetFor) return;
  const wasReview = sheetFor.kind === 'review' || sheetFor.kind === 'faces';
  sheetFor = null;
  if (wasReview) { review = null; faceRev = null; }
  renderSheet();
  if (selEdge || wasReview) { selEdge = null; renderGraph(); }
}
/** Editor da ligação no modo Pesquisa: categoria (4 botões) e, com o exterior, a face. */
function edgeEditor(e) {
  const ext = model.nodes.find(n => n.exterior);
  const touchesExt = ext && (e.a === ext.id || e.b === ext.id);
  return `<div class="kindpick" role="radiogroup" aria-label="${esc(t('edge.kind'))}">
      ${kindsShown().map((k, i) => `<button data-act="setKind" data-k="${k}" role="radio" aria-checked="${e.kind === k}" title="${esc(t('kind.' + k))} (${i + 1})">${kindSwatch(k)}<span>${esc(t('kind.' + k))}</span></button>`).join('')}
    </div>
    <button class="linkish" data-info="layer">${esc(t('edge.kindHelp'))} ⓘ</button>
    ${touchesExt ? `<label class="labelrow"><span>${esc(t('edge.face'))}</span><select id="edgeFace">
      <option value="">—</option>${FACES.map(f => `<option value="${f}" ${e.face === f ? 'selected' : ''}>${f} · ${esc(t('face.' + f))}</option>`).join('')}
    </select></label>` : ''}`;
}
/* ---------------- VIZINHANÇA: ESCALA, DETECÇÃO E REVISÃO (F4.3.3) ---------------- */
/** Tolerâncias em unidades do desenho; sem escala, valores provisórios em unidades. */
function adjUnits() {
  const s = model.geo && model.geo.escala_m_por_unidade;
  return s ? { tol: tolCm / 100 / s, min: minContactCm / 100 / s, scaled: true, s } : { tol: 8, min: 20, scaled: false, s: 0 };
}
const fmtLen = v => { const u = adjUnits(); return u.scaled ? `${Math.round(v * u.s * 100)} cm` : `${v.toFixed(1)} u`; };
const pairKey = (a, b) => (a < b ? a + '\u0000' + b : b + '\u0000' + a);
const polyList = () => model.nodes.filter(n => n.poly && n.poly.length >= 3).map(n => ({ id: n.id, poly: n.poly }));
/** Pares que já têm ligação (no modo Simples, só as de passagem contam). */
// conta TODAS as ligações gravadas (inclusive opaco escondido no Poiesis13): a revisão nunca duplica um par
const linkedPairs = () => new Set(model.edges.filter(e => researchMode || inLayer(e)).map(e => pairKey(e.a, e.b)));
function detectNew() {
  const u = adjUnits(), linked = linkedPairs();
  const all = detectAdjacency(polyList(), { tol: u.tol, minContact: u.min });
  return { cands: all.filter(c => !linked.has(pairKey(c.a, c.b))), linked: all.length - all.filter(c => !linked.has(pairKey(c.a, c.b))).length };
}
function openReview() {
  if (polyList().length < 2) { toast(t('toast.needPolys')); return; }
  if (mode !== 'select') setMode('select');
  setView('graph');
  review = null; faceRev = null; closeSheet();
  const { cands, linked } = detectNew();
  // pré-seleciona certas e prováveis; duvidosas só com confirmação
  review = { cands, linked, sel: new Set(cands.filter(c => c.confidence !== 'duvidosa').map(c => pairKey(c.a, c.b))), focus: null };
  sheetFor = { kind: 'review' }; renderSheet(); renderGraph();
}
function refreshReview() {
  const keep = review.sel, { cands, linked } = detectNew();
  review.cands = cands; review.linked = linked;
  review.sel = new Set(cands.map(c => pairKey(c.a, c.b)).filter(k => keep.has(k)));
}
function reviewHTML(closeBtn) {
  const u = adjUnits(), n = review.sel.size, kindNew = t('kind.' + (researchMode && !poiesis ? 'opaco' : 'acesso'));
  const name = id => esc((byId.get(id) || { name: id }).name);
  let h = `<div class="sheet-handle"></div><div class="sheet-head"><h3>${esc(t('rev.title'))}</h3>${closeBtn}</div>
    <p class="hint">${esc(u.scaled ? t('rev.scaleInfo', { tol: tolCm, min: minContactCm }) : t('rev.noScale'))}${review.linked ? ' ' + esc(t('rev.linked', { n: review.linked })) : ''}</p>`;
  if (!review.cands.length) h += `<p>${esc(t('rev.none'))}</p>`;
  for (const conf of ['certa', 'provavel', 'duvidosa']) {
    const list = review.cands.filter(c => c.confidence === conf);
    if (!list.length) continue;
    h += `<h4 class="revh conf-${conf}">${esc(t('rev.' + conf))} (${list.length})</h4>` + list.map(c => {
      const k = pairKey(c.a, c.b);
      return `<div class="revrow conf-${conf}${review.focus === k ? ' focus' : ''}">
        <input type="checkbox" data-rev="${esc(k)}" ${review.sel.has(k) ? 'checked' : ''} aria-label="${esc(c.a)} ↔ ${esc(c.b)}">
        <button class="linkish revname" data-revfocus="${esc(k)}"><b>${esc(c.a)} ↔ ${esc(c.b)}</b> <small>${name(c.a)} ↔ ${name(c.b)}</small></button>
        <span class="mini">${esc(t('rev.contact'))} ${fmtLen(c.contact)} · ${esc(t('rev.gap'))} ${fmtLen(c.gap)}</span>
        <span class="tag">${esc(t('rev.r.' + c.reason))}</span>
      </div>`;
    }).join('');
  }
  h += `<div class="sheet-actions">
      <button class="ghost" data-act="revWeld" ${n ? '' : 'disabled'}>${esc(t('rev.weld', { n }))}</button>
      <button data-act="revCreate" ${n ? '' : 'disabled'}>${esc(t('rev.create', { n, kind: kindNew }))}</button>
    </div>`;
  return h;
}
/** Contatos coloridos no mapa: verde contínuo = certa, âmbar tracejado = provável, vermelho pontilhado = duvidosa. */
function drawReviewOverlay() {
  const k = pxPerUnit(), STY = { certa: ['#2b7a4b', null], provavel: ['#c98a1a', [8, 5]], duvidosa: ['#b23a2e', [2, 5]] };
  review.cands.forEach(c => {
    const key = pairKey(c.a, c.b), on = review.sel.has(key), [col, dash] = STY[c.confidence];
    c.segs.forEach(([p, q]) => {
      const a = { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: col, 'stroke-width': (review.focus === key ? 11 : 6) / k, 'stroke-opacity': on ? 0.85 : 0.3, 'stroke-linecap': 'round', 'pointer-events': 'none' };
      if (dash) a['stroke-dasharray'] = dash.map(d => d / k).join(' ');
      svgG.appendChild(Eo('line', a));
    });
  });
}
function focusPair(key) {
  const c = review && review.cands.find(x => pairKey(x.a, x.b) === key);
  if (!c) return;
  review.focus = key;
  const [p, q] = c.segs[0] || [[byId.get(c.a).x, byId.get(c.a).y], [byId.get(c.b).x, byId.get(c.b).y]];
  const r = svgG.getBoundingClientRect();
  placeCam((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, r.left + r.width / 2, r.top + r.height * 0.35, cam.w);
  renderGraph(); renderSheet();
}
/** Fechar frestas dos pares marcados: solda vértices próximos e encosta vértices nas paredes vizinhas. */
function reviewWeld() {
  const ids = new Set();
  review.sel.forEach(k => k.split('\u0000').forEach(i => ids.add(i)));
  const { polys, moved } = closeGaps(polyList(), ids, adjUnits().tol);
  if (!moved) { toast(t('rev.nothingToWeld')); return; }
  const np = new Map(polys.map(p => [p.id, p.poly]));
  mutate(() => model.nodes.forEach(n => { if (ids.has(n.id) && np.has(n.id)) n.poly = np.get(n.id); }));
  const bad = [...ids].filter(id => { const n = byId.get(id); return n && n.poly && !isConvex(n.poly); });
  toast(t('rev.welded', { n: moved }) + (bad.length ? ' ' + t('rev.nonconvex', { ids: bad.join(', ') }) : ''), t('toast.undo'), undo);
}
/** Cria as ligações dos pares marcados: opaco no modo Pesquisa (para reclassificar), acesso no Simples. */
function reviewCreate() {
  const kind = researchMode && !poiesis ? 'opaco' : 'acesso'; // Poiesis13 não tem opaco
  const add = review.cands.filter(c => review.sel.has(pairKey(c.a, c.b))).map(c => ({ a: c.a, b: c.b, kind }));
  review = null; sheetFor = null;
  mutate(() => model.edges.push(...add));
  toast(t('rev.created', { n: add.length, kind: t('kind.' + kind) }) + (researchMode && !poiesis ? t('rev.createdResearch') : ''), t('toast.undo'), undo);
}
/** Calibração: distância real (m) entre os dois pontos medidos → metros por unidade do desenho. */
function applyCalibration() {
  const inp = $('calibM'), m = inp ? parseFloat(String(inp.value).replace(',', '.')) : NaN;
  if (!(m > 0) || poly.pts.length < 2) { toast(t('toast.calibBad')); return; }
  const [p, q] = poly.pts, units = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (units < 1e-6) { toast(t('toast.calibBad')); return; }
  const s = m / units;
  setMode('select');
  mutate(() => { model.geo = { ...(model.geo || {}), escala_m_por_unidade: s }; });
  toast(t('toast.calibrated', { n: (1 / s).toFixed(1) }));
}
$('sheet').addEventListener('click', e => {
  const f = e.target.closest('[data-revfocus]'); if (f) focusPair(f.dataset.revfocus);
  const g = e.target.closest('[data-facefocus]'); if (g) focusFaceSpace(g.dataset.facefocus);
});

/* ---------------- EXTERIOR, NORTE E FACES (F4.3.4) ---------------- */
const northDeg = () => (model.geo && Number.isFinite(model.geo.norte_graus) ? model.geo.norte_graus : 0);
const extNode = () => model.nodes.find(n => n.exterior);
const FACE_STY = { N: ['#2f5d8a', null], L: ['#2b7a4b', [6, 3]], S: ['#c98a1a', [2, 4]], O: ['#7a3fa0', [10, 3, 2, 3]] };
function setNorth(deg) {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  if (d === northDeg() && model.geo && model.geo.norte_graus !== undefined) return;
  mutate(() => { model.geo = { ...(model.geo || {}), norte_graus: d }; });
}
/** Seta do norte no canto do mapa (modo Pesquisa). */
function renderCompass(preview) {
  const g = $('compassRot');
  if (g) g.setAttribute('transform', `rotate(${preview ?? northDeg()})`);
}
/** Ao tirar a marca de exterior de um espaço, as faces das suas ligações deixam de valer (schema v3). */
function stripFaces(id) {
  let n = 0;
  model.edges.forEach(e => { if ((e.a === id || e.b === id) && e.face) { delete e.face; n++; } });
  return n;
}
function toggleExterior(id) {
  const n = byId.get(id);
  if (!n) return;
  let cleared = 0;
  if (n.exterior) {
    mutate(() => { delete n.exterior; cleared = stripFaces(id); });
    toast(t('toast.extUnset', { id }) + (cleared ? ' ' + t('toast.extFacesCleared', { n: cleared }) : ''), t('toast.undo'), undo);
    return;
  }
  const prev = extNode();
  mutate(() => { if (prev) { delete prev.exterior; cleared = stripFaces(prev.id); } n.exterior = true; });
  toast((prev ? t('toast.extMoved', { a: prev.id, b: id }) : t('toast.extSet', { id })) + (cleared ? ' ' + t('toast.extFacesCleared', { n: cleared }) : ''), t('toast.undo'), undo);
}
/** Cria o nó exterior (portador) acima do desenho e o define como raiz. */
function createExterior() {
  const ex = extNode();
  if (ex) { toast(t('toast.extExists', { id: ex.id })); return; }
  const b = contentBounds(ASPECT, 0, model, false, 0), used = new Set(model.nodes.map(n => n.id));
  const id = used.has('ext') ? nextId() : 'ext';
  mutate(() => {
    model.nodes.push({ id, name: t('scn.exterior'), x: Math.round(b.x + b.w / 2), y: Math.round(b.y - 30), label: t('scn.exterior'), exterior: true });
    model.root = id;
  });
  toast(t('toast.extCreated'), t('toast.undo'), undo);
}
function computeFaces() {
  const ext = extNode(), u = adjUnits();
  const polys = polyList().filter(p => p.id !== ext.id);
  const sugg = suggestFaces(exteriorPieces(polys, northDeg(), u.tol, u.min));
  const other = e => (e.a === ext.id ? e.b : e.a);
  const extEdges = model.edges.filter(e => e.a === ext.id || e.b === ext.id);
  const items = sugg.map(s => {
    const ex = extEdges.find(e => other(e) === s.id && e.face === s.face);
    return { ...s, exists: !!ex, existsKind: ex ? ex.kind : null, faceless: extEdges.some(e => other(e) === s.id && !e.face) };
  });
  const sk = new Set(sugg.map(s => s.id + '|' + s.face));
  // faces já gravadas que a geometria não confirma (para conferir)
  const extra = extEdges.filter(e => e.face && !sk.has(other(e) + '|' + e.face)).map(e => `${other(e)} · ${e.face} (${t('kind.' + e.kind)})`);
  return { items, extra };
}
function openFaceReview() {
  if (!extNode()) { toast(t('toast.needExt'), t('btn.createExt'), createExterior); return; }
  if (!polyList().length) { toast(t('toast.needPolys')); return; }
  if (mode !== 'select') setMode('select');
  setView('graph');
  review = null; faceRev = null; closeSheet();
  const { items, extra } = computeFaces();
  faceRev = { items, extra, sel: new Set(items.filter(i => !i.exists).map(i => i.id + '|' + i.face)), focus: null };
  sheetFor = { kind: 'faces' }; renderSheet(); renderGraph();
}
function refreshFaces() {
  if (!extNode()) { faceRev = null; if (sheetFor && sheetFor.kind === 'faces') sheetFor = null; return; }
  const keep = faceRev.sel, { items, extra } = computeFaces();
  faceRev.items = items; faceRev.extra = extra;
  faceRev.sel = new Set(items.filter(i => !i.exists).map(i => i.id + '|' + i.face).filter(k => keep.has(k)));
}
function facesHTML(closeBtn) {
  const geoN = model.geo && model.geo.norte_graus !== undefined;
  const ids = [...new Set(faceRev.items.map(i => i.id))];
  const n = faceRev.sel.size;
  let h = `<div class="sheet-handle"></div><div class="sheet-head"><h3>${esc(t('faces.title'))}</h3>${closeBtn}</div>
    <p class="hint">${esc(geoN ? t('faces.info', { deg: Math.round(northDeg()) }) : t('faces.noNorth'))} <button class="linkish" data-info="orientation">ⓘ</button></p>`;
  if (!ids.length) h += `<p>${esc(t('faces.none'))}</p>`;
  h += ids.map(id => {
    const items = faceRev.items.filter(i => i.id === id), nd = byId.get(id);
    const chips = items.map(i => {
      const k = i.id + '|' + i.face;
      if (i.exists) return `<span class="facechip done f-${i.face}"><b>${i.face}</b><small>${esc(t('faces.exists', { kind: t('kind.' + i.existsKind) }))}</small></span>`;
      return `<label class="facechip f-${i.face}"><input type="checkbox" data-facesel="${esc(k)}" ${faceRev.sel.has(k) ? 'checked' : ''}><b>${i.face}</b><small>${fmtLen(i.length)}</small></label>`;
    }).join('');
    const firstSel = items.find(i => !i.exists && faceRev.sel.has(i.id + '|' + i.face));
    const note = items[0].faceless && firstSel ? `<p class="hint" style="margin:.2rem 0 0">${esc(t('faces.assign', { face: firstSel.face }))}</p>` : '';
    return `<div class="facegroup${faceRev.focus === id ? ' focus' : ''}"><button class="linkish revname" data-facefocus="${esc(id)}"><b>${esc(id)}</b> <small>${esc(nd ? nd.name : '')}</small></button><div class="facechips">${chips}</div>${note}</div>`;
  }).join('');
  if (faceRev.extra.length) h += `<p class="warn" style="margin-top:.5rem">${esc(t('faces.mismatch', { list: faceRev.extra.join('; ') }))}</p>`;
  h += `<div class="sheet-actions"><button data-act="facesCreate" ${n ? '' : 'disabled'}>${esc(t('faces.create', { n }))}</button></div>`;
  return h;
}
/** Trechos voltados para fora, coloridos por face (cor + traço distintos) e com a letra da face. */
function drawFacesOverlay() {
  const k = pxPerUnit();
  faceRev.items.forEach(i => {
    const on = i.exists || faceRev.sel.has(i.id + '|' + i.face), [col, dash] = FACE_STY[i.face];
    i.segs.forEach(([p, q]) => {
      const a = { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: col, 'stroke-width': (faceRev.focus === i.id ? 10 : 6) / k, 'stroke-opacity': on ? 0.85 : 0.25, 'pointer-events': 'none' };
      if (dash) a['stroke-dasharray'] = dash.map(d => d / k).join(' ');
      svgG.appendChild(Eo('line', a));
      const lb = txt((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 4 / k, i.face, 12 / k, col, '700', 'facelabel');
      lb.setAttribute('pointer-events', 'none'); lb.setAttribute('stroke', '#fff'); lb.setAttribute('stroke-width', 3 / k); lb.setAttribute('paint-order', 'stroke');
      svgG.appendChild(lb);
    });
  });
}
function focusFaceSpace(id) {
  const n = byId.get(id);
  if (!n || !faceRev) return;
  faceRev.focus = id;
  const r = svgG.getBoundingClientRect();
  placeCam(n.x, n.y, r.left + r.width / 2, r.top + r.height * 0.35, cam.w);
  renderGraph(); renderSheet();
}
/** Grava as faces marcadas: ligações novas com o exterior (opaco) ou face atribuída à ligação existente sem face. */
function facesCreate() {
  const ext = extNode();
  if (!ext || !faceRev) return;
  const other = e => (e.a === ext.id ? e.b : e.a);
  const chosen = faceRev.items.filter(i => !i.exists && faceRev.sel.has(i.id + '|' + i.face));
  let made = 0, assigned = 0;
  faceRev = null; sheetFor = null;
  mutate(() => {
    const usedFaceless = new Set();
    for (const i of chosen) {
      const faceless = model.edges.find(e => (e.a === ext.id || e.b === ext.id) && other(e) === i.id && !e.face && !usedFaceless.has(e));
      if (faceless) { faceless.face = i.face; usedFaceless.add(faceless); assigned++; }
      else { model.edges.push({ a: ext.id, b: i.id, kind: 'opaco', face: i.face }); made++; }
    }
  });
  toast(t('faces.created', { n: made, assigned: assigned ? t('faces.assigned', { n: assigned }) : '' }), t('toast.undo'), undo);
}

/* ---------------- EXEMPLAR: METADADOS, CONFERÊNCIA E EXPORTAÇÃO (F4.3/F4.4) ---------------- */
const META_TEXT = ['exemplar_id', 'fonte', 'local', 'data', 'codificador'];
function renderExemplar() {
  const meta = model.meta || {}, geo = model.geo || {};
  for (const k of [...META_TEXT, 'notas']) { const el = $('meta_' + k); if (el && document.activeElement !== el) el.value = meta[k] || ''; }
  const cj = $('meta_conjunto');
  cj.innerHTML = `<option value="">—</option>` + CONJUNTOS.map(c => `<option value="${c}">${esc(t('conj.' + c))}</option>`).join('');
  cj.value = meta.conjunto || '';
  if (document.activeElement !== $('geoModulo')) $('geoModulo').value = geo.modulo_m || '';
  const items = exemplarChecklist(model);
  $('exemplarCheck').innerHTML = items.length
    ? items.map(i => `<li class="${i.level}">${esc(t('chk.' + i.code, { n: i.n ?? '' }))}</li>`).join('')
    : `<li class="ok">${esc(t('chk.ok'))}</li>`;
}
/** Grava um campo de metadados (desfazível); vazio remove o campo. */
function setMeta(key, value) {
  const v = String(value || '').trim().slice(0, key === 'notas' ? 4000 : 300);
  const cur = (model.meta && model.meta[key]) || '';
  if (v === cur) return;
  mutate(() => {
    const m = { ...(model.meta || {}) };
    if (v) m[key] = v; else delete m[key];
    if (Object.keys(m).length) model.meta = m; else delete model.meta;
  });
}
function exportExemplar() {
  const sc = activeScenario(), name = exemplarFileName(model, sc.name) + '.json';
  const j = JSON.stringify(model, null, 2);
  download(j, name, 'application/json');
  putIO(j, name);
  const imp = exemplarChecklist(model).filter(i => i.level === 'importante');
  toast(imp.length ? t('toast.exportedMissing', { name, list: imp.map(i => t('chk.' + i.code, { n: i.n ?? '' })).join('; ') }) : t('toast.exported', { name }));
}
function exportManifest(all) {
  const models = all ? project.scenarios.map(s => s.model) : [model];
  const csv = manifestCSV(models);
  const name = all ? 'manifesto_projeto.csv' : `manifesto_${exemplarFileName(model, activeScenario().name)}.csv`;
  download(csv, name, 'text/csv');
  putIO(csv, name);
}
META_TEXT.concat('notas').forEach(k => $('meta_' + k).addEventListener('change', e => setMeta(k, e.target.value)));
$('meta_conjunto').addEventListener('change', e => setMeta('conjunto', e.target.value));
$('geoModulo').addEventListener('change', e => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  mutate(() => {
    const g = { ...(model.geo || {}) };
    if (v > 0) g.modulo_m = v; else delete g.modulo_m;
    if (Object.keys(g).length) model.geo = g; else delete model.geo;
  });
});
$('btnExportEx').addEventListener('click', exportExemplar);
$('btnManifest').addEventListener('click', () => exportManifest(false));
$('btnManifestAll').addEventListener('click', () => exportManifest(true));
$('exInfo').addEventListener('click', e => { e.preventDefault(); openInfo('exemplar'); });

/** Legenda das categorias sob o mapa (modo Pesquisa). */
function renderKindLegend() {
  const el = $('kindLegend');
  if (!el) return;
  el.innerHTML = researchMode ? kindsShown().map(k => `<button class="kl" data-info="layer">${kindSwatch(k)}<span>${esc(t('kind.' + k))}</span></button>`).join('') : '';
}
$('kindLegend').addEventListener('click', e => { if (e.target.closest('[data-info]')) openInfo('layer'); });
function renderSheet() {
  const s = $('sheet');
  if (sheetFor && sheetFor.kind === 'node' && !byId.has(sheetFor.id)) sheetFor = null;
  if (sheetFor && sheetFor.kind === 'edge' && !findEdge(sheetFor.key)) sheetFor = null;
  if (!sheetFor) { s.hidden = true; s.innerHTML = ''; return; }
  const closeBtn = `<button class="icon" data-act="close" aria-label="${esc(t('close'))}"><svg class="ico"><use href="#i-close"/></svg></button>`;
  if (sheetFor.kind === 'review') { s.innerHTML = reviewHTML(closeBtn); s.hidden = false; return; }
  if (sheetFor.kind === 'faces') { s.innerHTML = facesHTML(closeBtn); s.hidden = false; return; }
  if (sheetFor.kind === 'edge') {
    const e = findEdge(sheetFor.key), na = byId.get(e.a), nb = byId.get(e.b);
    s.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-head"><h3>${esc(t('edge.title'))}: ${esc(e.a)} ↔ ${esc(e.b)}</h3>${closeBtn}</div>
      <p class="hint">${esc(na.name)} ↔ ${esc(nb.name)} · ${esc(t('kind.' + e.kind))}${e.face ? ' · ' + esc(t('edge.face')) + ' ' + e.face : ''}</p>
      ${researchMode ? edgeEditor(e) : ''}
      <div class="sheet-actions"><button class="danger" data-act="removeLink"><svg class="ico"><use href="#i-trash"/></svg>${esc(t('act.removeLink'))}</button></div>`;
  } else {
    const n = byId.get(sheetFor.id), p = R.per[n.id], isRoot = n.id === model.root;
    const rows = sheetRows().map(k => `<button class="mrow${k === currentMeasure ? ' cur' : ''}" data-info="${k}"><span>${esc(t('m.' + k))} <span class="i">ⓘ</span></span><b>${FMT[k](p[k])}</b></button>`).join('');
    s.innerHTML = `<div class="sheet-handle"></div>
      <div class="sheet-head">
        <span class="chip" style="background:${colourOf(n.id)}"></span><span class="idbadge">${esc(n.id)}</span>
        <input type="text" id="sheetName" value="${esc(n.name)}" maxlength="200" aria-label="${esc(t('name'))}">${closeBtn}
      </div>
      <div class="sheet-type">${isRoot ? `<span class="badge">${esc(t('root.badge'))}</span>` : ''}${n.exterior && researchMode ? `<span class="badge ext">${esc(t('badge.ext'))}</span>` : ''}
        <button class="linkish" data-info="type">${esc(t('type'))} <b>${p.type}</b> — ${esc(t('type.' + p.type))}</button></div>
      ${diagLine(n.id)}
      <label class="labelrow"><span>${esc(t('label'))}</span><input type="text" id="sheetLabel" list="labelOptions" value="${esc(n.label || '')}" maxlength="60" placeholder="${esc(t('label.ph'))}" autocomplete="off"></label>
      ${facesLine(n.id)}
      <div class="mgrid">${rows}</div>
      ${narrow.matches ? `<button class="linkish more" data-act="more" aria-expanded="${sheetExpanded}">${esc(t(sheetExpanded ? 'sheet.less' : 'sheet.more'))}</button>` : ''}
      <div class="sheet-actions">
        <button class="ghost" data-act="root" ${isRoot ? 'disabled' : ''}><svg class="ico"><use href="#i-root"/></svg>${esc(t('act.root'))}</button>
        ${researchMode ? `<button class="ghost" data-act="toggleExt">${esc(t(n.exterior ? 'act.unExt' : 'act.setExt'))}</button>` : ''}
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
    case 'setKind': setEdgeKind(target.key, b.dataset.k); break;
    case 'revWeld': reviewWeld(); break;
    case 'revCreate': reviewCreate(); break;
    case 'facesCreate': facesCreate(); break;
    case 'toggleExt': toggleExterior(target.id); break;
  }
});
$('sheet').addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.facesel && faceRev) {
    if (e.target.checked) faceRev.sel.add(e.target.dataset.facesel); else faceRev.sel.delete(e.target.dataset.facesel);
    renderSheet(); renderGraph(); return;
  }
  if (e.target.dataset && e.target.dataset.rev && review) {
    if (e.target.checked) review.sel.add(e.target.dataset.rev); else review.sel.delete(e.target.dataset.rev);
    renderSheet(); renderGraph(); return;
  }
  if (e.target.id === 'edgeFace' && sheetFor && sheetFor.kind === 'edge') { setEdgeFace(sheetFor.key, e.target.value); return; }
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
const J = { gapY: 76, padTop: 44, padBottom: 52 }; // passados ao jgraphLayout: a moldura comum usa os mesmos valores
const jInput = (m, classified) => (classified ? weightedInput(m) : syntacticInput(m));
/**
 * Moldura comum para j-graphs lado a lado: mesma base, mesmo passo entre níveis, mesmas réguas e mesma largura,
 * para que o nível d de um fique na mesma altura do nível d do outro (percepção de profundidade).
 * `list` = [[modelo, classificado?], ...].
 */
function jFrame(list) {
  const lays = list.map(([m, c]) => jgraphLayout(m.nodes, jInput(m, c).edges, m.root, J));
  const levels = Math.max(...lays.map(l => l.maxDepth)), band = lays.some(l => l.unreachable.length) ? 1 : 0;
  return { W: Math.max(...lays.map(l => l.width)), H: J.padTop + J.padBottom + (levels + band) * J.gapY, levels };
}
/**
 * `classified`: grafo das relações classificadas (Poiesis13, traço por classe) ou o clássico; `colour`: cor por indicador;
 * `frame` (de jFrame): alinha os níveis com os outros j-graphs da comparação.
 */
function drawJGraph(svg, m, sel = new Set(), classified = poiesis, colour = null, frame = null) {
  svg.innerHTML = '';
  // Layout em árvore (motor: jgraphLayout): pai centrado sobre os filhos, filho único no mesmo eixo vertical,
  // sem espalhar cada nível pela largura; a árvore pode se espraiar e o desenho cresce com ela.
  // o desenho nunca é ponderado: cada relação = um nível; os pesos só entram nos indicadores
  const I = jInput(m, classified), pairs = I.edges, lay = jgraphLayout(m.nodes, pairs, m.root, J);
  const W = frame ? frame.W : lay.width, H = frame ? frame.H : lay.height, dx = (W - lay.width) / 2, dy = H - lay.height;
  // base comum: níveis contados de baixo; os inalcançáveis ficam na faixa do topo (fora das réguas)
  const pj = Object.fromEntries(Object.entries(lay.pos).map(([id, p]) => [id, { x: p.x + dx, y: lay.depth[id] == null ? p.y : p.y + dy }]));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  Array.from({ length: (frame ? frame.levels : lay.maxDepth) + 1 }, (_, d) => H - J.padBottom - d * J.gapY).forEach((y, d) => {
    svg.appendChild(Eo('line', { x1: 34, y1: y, x2: W - 14, y2: y, stroke: C.rule, 'stroke-width': 1, 'stroke-dasharray': '2 4' }));
    svg.appendChild(txt(16, y + 4, 'd' + d, 11, C.muted, null, 't-name'));
  });
  pairs.forEach(([a, b], i) => {
    if (!pj[a] || !pj[b]) return;
    // Poiesis13: cada relação com o traço da sua classe (vista tracejada, aberto dupla)
    if (classified) { kindLines(I.kinds[i], pj[a].x, pj[a].y, pj[b].x, pj[b].y, 0.9).forEach(el => svg.appendChild(el)); return; }
    // todas as permeabilidades com o mesmo traço (Hillier & Hanson): o anel aparece como circuito,
    // sem eleger arbitrariamente uma ligação "que fecha" — a árvore só define a posição dos nós
    svg.appendChild(Eo('line', { x1: pj[a].x, y1: pj[a].y, x2: pj[b].x, y2: pj[b].y, stroke: C.wall, 'stroke-width': 1.8, 'stroke-opacity': 0.9 }));
  });
  const ramp = ['#e9dcc6', '#dcae82', '#cc7f52', '#b25334', '#8a2d1f', '#6a2016', '#4d170f'];
  m.nodes.forEach(n => {
    const p = pj[n.id];
    if (!p) return;
    const d = lay.depth[n.id], col = colour ? colour(n.id) : d == null ? '#bdb6a6' : ramp[Math.min(d, ramp.length - 1)];
    const g = Eo('g', { class: 'node' + (sel.has(n.id) ? ' selnode' : ''), transform: `translate(${p.x},${p.y})` });
    g.dataset.id = n.id;
    g.appendChild(Eo('circle', { r: 24, fill: 'transparent', class: 'hit' }));
    g.appendChild(Eo('circle', { class: 'halo', r: 21, fill: 'none', stroke: C.accent, 'stroke-width': 2.5 }));
    if (n.id === m.root) {
      g.appendChild(Eo('circle', { r: 16, fill: col, stroke: C.accent, 'stroke-width': 2.4 }));
      g.appendChild(Eo('line', { x1: -16, y1: 0, x2: 16, y2: 0, stroke: C.accent, 'stroke-width': 1.3 }));
      g.appendChild(Eo('line', { x1: 0, y1: -16, x2: 0, y2: 16, stroke: C.accent, 'stroke-width': 1.3 }));
    } else g.appendChild(Eo('circle', { r: 14, fill: col, stroke: C.wall, 'stroke-width': 1.4 }));
    g.appendChild(txt(0, 4.5, n.id, 12, colour ? labelInk(col) : d != null && d >= 2 ? '#fff' : C.ink, '700', 't-id'));
    if (showValues && d != null) g.appendChild(txt(0, -20, 'd' + d, 10, C.ink2, '700', 't-val'));
    svg.appendChild(g);
  });
}
function renderJ() { drawJGraph(svgJ, model, selSet); }
svgJ.addEventListener('click', e => {
  const g = e.target.closest('.node');
  if (!g) { clearSelection(); renderJ(); return; }
  selSet.clear(); selSet.add(g.dataset.id); refreshSel(); renderJ();
  openSheet({ kind: 'node', id: g.dataset.id });
});
svgJ.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') hoverTip(e); });
svgJ.addEventListener('pointerleave', hideTip);

/* ---------------- RESULTADOS ---------------- */
/* Ordenação das tabelas de indicadores: cada tabela guarda o campo (k) e o sentido (dir 1 = crescente, -1 = decrescente). */
const tblSort = { func: { k: 'integ', dir: -1 }, delta: { k: 'absd', dir: -1 }, models: { k: 'absd', dir: -1 }, states: { k: 'pb', dir: 1 } };
const TEXT_SORT = new Set(['id', 'label', 'type', 'name', 'pa', 'pb']); // posições: 1º primeiro
const dirBtn = dir => `${dir > 0 ? '↑' : '↓'}`;
const dirLabel = dir => t(dir > 0 ? 'sort.asc' : 'sort.desc');
/** Barra "Ordenar por" de uma tabela: `opts` = [[campo, rótulo], ...]. */
function sortBarHTML(tbl, opts) {
  const s = tblSort[tbl];
  return `<div class="sortbar"><label><span>${esc(t('sortBy'))}</span><select data-sort="${tbl}">${opts.map(([k, l]) => `<option value="${k}"${k === s.k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label><button class="ghost sortdir" type="button" data-sortdir="${tbl}" title="${esc(dirLabel(s.dir))}" aria-label="${esc(dirLabel(s.dir))}">${dirBtn(s.dir)}</button></div>`;
}
/** Comparador por campo; vazios (—) sempre no fim. */
const byField = (get, dir) => (x, y) => {
  const a = get(x), b = get(y);
  if (a == null || (typeof a === 'number' && !isFinite(a))) return b == null || (typeof b === 'number' && !isFinite(b)) ? 0 : 1;
  if (b == null || (typeof b === 'number' && !isFinite(b))) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * dir;
};
/** Linhas {name, a, b, d} das tabelas de Δ (por espaço e modelos). */
const DELTA_GET = { absd: r => (r.d == null ? null : Math.abs(r.d)), d: r => r.d, a: r => r.a, b: r => r.b, name: r => r.name.toLowerCase() };
const sortDelta = (rows, tbl) => rows.sort(byField(DELTA_GET[tblSort[tbl].k] || DELTA_GET.absd, tblSort[tbl].dir));
document.addEventListener('change', e => {
  const s = e.target.closest('select[data-sort]');
  if (!s) return;
  const st = tblSort[s.dataset.sort];
  st.k = s.value; st.dir = TEXT_SORT.has(st.k) ? 1 : -1;
  s.dataset.sort === 'func' ? renderFunctional() : renderCompare();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sortdir]');
  if (!b) return;
  tblSort[b.dataset.sortdir].dir *= -1;
  b.dataset.sortdir === 'func' ? renderFunctional() : renderCompare();
});
const COLS_BASE = ['id', 'label', 'type', 'conn', 'ctrl', 'controllability', 'choice', 'depth', 'td', 'md', 'ra', 'rra', 'integ', 'ent'];
const cols = () => (poiesis ? [...COLS_BASE.slice(0, -1), 'integT', 'dInteg', 'ent'] : COLS_BASE);
/** Poiesis13: integração tradicional e diferença (proposto − tradicional) por espaço. */
function cmpVal(id, k) {
  const a = R.per[id].integ, b = RT && RT.per[id] ? RT.per[id].integ : null;
  return k === 'integT' ? b : a == null || b == null ? null : a - b;
}
const isTextKey = k => k === 'id' || k === 'type' || k === 'label';
const colLabelLong = k => (isTextKey(k) ? t('col.' + k) : t('m.' + k));
function sortedNodes() {
  const key = n => (sortKey === 'id' ? n.id : sortKey === 'label' ? (n.label || '\uffff').toLowerCase() : sortKey === 'type' ? R.per[n.id].type : sortKey === 'integT' || sortKey === 'dInteg' ? cmpVal(n.id, sortKey) : R.per[n.id][sortKey]);
  return [...model.nodes].sort(byField(key, sortDir)); // sortDir 1 = crescente, -1 = decrescente; vazios no fim
}
function renderResults() {
  const g = R;
  const COLS = cols();
  if (!COLS.includes(sortKey)) sortKey = 'integ';
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
    ['card.k', g.k, 'k'], [researchMode ? 'card.L' : 'card.Lsimple', g.L, 'L'], ['card.rings', g.circuit, 'rings'], ['card.ringiness', g.ringiness.toFixed(3), 'ringiness'],
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
      <td>${p.conn}</td><td>${fmt3(p.ctrl)}</td><td>${fmt3(p.controllability)}</td><td>${fmt1(p.choice)}</td><td>${fmtDepth(p.depth)}</td>
      <td>${fmtDepth(p.td)}</td><td>${fmt3(p.md)}</td><td>${fmt3(p.ra)}</td><td>${fmt3(p.rra)}</td><td><b>${fmt3(p.integ)}</b></td>${poiesis ? `<td>${fmt3(cmpVal(n.id, 'integT'))}</td><td>${fmtDelta(cmpVal(n.id, 'dInteg'))}</td>` : ''}<td>${fmt3(p.ent)}</td></tr>`;
  }).join('');
  const showKey = isTextKey(sortKey) ? currentMeasure : sortKey;
  $('spaceCards').innerHTML = rows.map(n => {
    const p = R.per[n.id], v = showKey === 'focus' ? valOf(n.id, 'focus') : p[showKey];
    return `<button class="scard${selSet.has(n.id) ? ' sel' : ''}" data-id="${esc(n.id)}">
      <span class="chip" style="background:${colourOf(n.id)}"></span>
      <span class="nm">${esc(n.id)} · ${esc(n.name)}</span>
      <span class="big">${(FMT[showKey] || fmt3)(v)}</span>
      <span class="sub">${n.label ? esc(n.label) + ' · ' : ''}${esc(t('type'))} ${p.type} · ${esc(t('col.integ'))} ${fmt3(p.integ)} · ${esc(t('col.choice'))} ${fmt1(p.choice)} · ${esc(t('col.depth'))} ${fmtDepth(p.depth)}</span>
    </button>`;
  }).join('');
  renderDiagnosis();
  renderScatter();
  renderFunctional();
  renderOrientation();
  $('methodFoot').innerHTML = (poiesis ? t('method.poiesis') : researchMode ? t('method.passage') : '') + t('method.base') + t(conv.entropy === 'depthmapx' ? 'method.ent.dm' : 'method.ent.v1') +
    t(conv.differenceFactor === 'ra' ? 'method.h.ra' : 'method.h.int') + t('method.tail');
}
$('resTable').querySelector('thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-k]');
  if (!th) return;
  const k = th.dataset.k;
  if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = isTextKey(k) ? 1 : -1; }
  renderResults(); renderPanel();
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
const FUNC_GET = { label: s => s.label.toLowerCase(), n: s => s.ids.length, integ: s => s.meanInteg, rra: s => s.meanRRA, depth: s => s.meanDepth };
function renderFunctional() {
  const box = $('funcBox');
  const F = functionalSummary(model, globalOf(model, R));
  const f3 = v => (v == null ? '—' : v.toFixed(3));
  if (!F.stats.length) { box.innerHTML = `<h4>${esc(t('func.title'))}</h4><p class="hint" style="margin:0">${esc(t('func.none'))}</p>`; return; }
  box.innerHTML = `<h4>${esc(t('func.title'))} <button class="linkish" data-info="genotype">ⓘ</button></h4>
    <p class="ineq"><span class="k">${esc(t('func.ineq'))}</span> ${esc(F.inequality)}</p>
    ${F.Hs != null ? `<p class="ineq"><span class="k">${esc(t('func.Hs'))}</span> ${f3(F.Hs)}</p>` : ''}
    ${sortBarHTML('func', [['label', t('col.label')], ['n', t('func.n')], ['integ', t('func.integ')], ['rra', t('func.rra')], ['depth', t('func.depth')]])}
    <div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('col.label'))}</th><th>${esc(t('func.n'))}</th><th>${esc(t('func.integ'))}</th><th>${esc(t('func.rra'))}</th><th>${esc(t('func.depth'))}</th></tr></thead><tbody>
    ${[...F.stats].sort(byField(FUNC_GET[tblSort.func.k], tblSort.func.dir)).map(s => `<tr><td class="name">${esc(s.label)} <span class="mini">${esc(s.ids.join(', '))}</span></td><td>${s.ids.length}</td><td><b>${f3(s.meanInteg)}</b></td><td>${f3(s.meanRRA)}</td><td>${s.meanDepth == null ? '—' : s.meanDepth.toFixed(2)}</td></tr>`).join('')}
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
/* ---------------- RELATÓRIO / PRANCHA (PDF pelo "imprimir" do navegador) ---------------- */
/** Ficha metodológica: tudo o que um número reportado precisa declarar (representação, k, portador, raio, convenções, versão). */
function methodSheet() {
  const rootN = model.root && byId.get(model.root), geo = model.geo || {}, meta = model.meta || {};
  const excluded = model.edges.filter(e => !inLayer(e)).length;
  const rows = [
    [t('rep.repr'), t('rep.reprVal') + (researchMode && excluded ? ' ' + t('rep.excluded', { n: excluded }) : '')],
    [t('card.k'), R.k], [t('card.Lsimple'), R.L], [t('card.rings'), R.circuit],
    [t('rep.root'), rootN ? `${rootN.id} · ${rootN.name}${rootN.exterior ? ' (' + t('badge.ext') + ')' : ''} — ${t('rep.rootIncluded')}` : '—'],
    [t('card.radius'), radius === 0 ? t('rep.global') : radius],
    [t('rep.norm'), t('rep.normVal')],
    [t('conv.entropy'), t(conv.entropy === 'depthmapx' ? 'conv.entropy.dm' : 'conv.entropy.v1')],
    [t('conv.h'), t(conv.differenceFactor === 'ra' ? 'conv.h.ra' : 'conv.h.int')],
    [t('card.int'), t('rep.intelVal')],
  ];
  if (geo.escala_m_por_unidade) rows.push([t('scale'), t('scale.value', { n: (1 / geo.escala_m_por_unidade).toFixed(1) })]);
  if (geo.norte_graus !== undefined) rows.push([t('north'), geo.norte_graus + '°']);
  if (geo.modulo_m) rows.push([t('geo.modulo'), geo.modulo_m + ' m']);
  for (const k of ['exemplar_id', 'conjunto', 'fonte', 'local', 'data', 'codificador']) if (meta[k]) rows.push([t('meta.' + k), k === 'conjunto' ? t('conj.' + meta[k]) : meta[k]]);
  rows.push([t('rep.software'), `Space Syntax Engine v${pkg.version} — ${location.origin + location.pathname}`]);
  rows.push([t('rep.date'), new Date().toLocaleString(getLang() === 'pt' ? 'pt-BR' : 'en')]);
  return `<dl class="rep-ficha">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
/** Cópia estática de um trecho da tela para o relatório: sem botões, ids e alvos de toque. */
function staticClone(el) {
  const c = el.cloneNode(true);
  c.removeAttribute('id'); c.removeAttribute('hidden');
  c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
  c.querySelectorAll('.halo, .hit, .edgehit, .scatter-ctrl, select').forEach(x => x.remove());
  c.querySelectorAll('button').forEach(b => b.replaceWith(document.createTextNode(b.textContent.trim() === 'ⓘ' ? '' : b.textContent)));
  return c;
}
function printReport() {
  renderAll(); renderJ();
  const rep = $('report');
  const map = staticClone(svgG), b = contentBounds(ASPECT, 30, model, true, 0);
  map.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  const jg = staticClone(svgJ);
  const m = meta(currentMeasure), [mn, mx] = measureRange(currentMeasure), f = FMT[m.key];
  rep.innerHTML = `<header class="rep-head"><h1>${esc(activeScenario().name)}</h1><p>${esc(t('rep.subtitle'))}</p></header>
    <section><h2>${esc(t('rep.method'))}</h2>${methodSheet()}</section>
    <section class="rep-figs">
      <figure><div class="rep-svg"></div><figcaption>${esc(t('rep.figMap', { m: t('m.' + m.key), lo: f(m.invert ? mx : mn), hi: f(m.invert ? mn : mx) }))}</figcaption></figure>
      <figure><div class="rep-svg"></div><figcaption>${esc(t('rep.figJ', { root: model.root || '—' }))}</figcaption></figure>
    </section>
    <section class="rep-res"><h2>${esc(t('rep.results'))}</h2></section>`;
  const [f1, f2] = rep.querySelectorAll('.rep-svg');
  f1.appendChild(map); f2.appendChild(jg);
  const res = rep.querySelector('.rep-res');
  for (const id of ['globalCards', 'diagBox', 'scatterBox', 'funcBox', 'orientBox']) { const el = $(id); if (el && !el.hidden) res.appendChild(staticClone(el)); }
  res.appendChild(staticClone($('resTable')));
  res.appendChild(staticClone($('methodFoot')));
  document.body.classList.add('printing-report');
  const done = () => { document.body.classList.remove('printing-report'); rep.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 100);
}

/* ---------------- DIAGNÓSTICO CONFIGURACIONAL (H&H 1984, cap. 4) ---------------- */
function renderDiagnosis() {
  const box = $('diagBox'), D = diagnose(inputOf(model), R);
  box.hidden = !D.L;
  if (!D.L) return;
  const pct = n => Math.round((100 * n) / D.L);
  const cell = q => `<td><b>${D.counts[q]}</b> <small>${pct(D.counts[q])}%</small></td>`;
  const rootName = model.root && byId.get(model.root) ? `${model.root} · ${byId.get(model.root).name}` : '—';
  box.innerHTML = `<h4>${esc(t('diag.title'))} <button class="linkish" data-info="diagnosis">ⓘ</button></h4>
    <p class="hint" style="margin:0 0 .3rem">${esc(t('diag.relativeTo', { root: rootName }))}</p>
    <ul class="diag-read">${D.readings.map(r => `<li>${esc(t('diag.r.' + r.code, r))}</li>`).join('')}</ul>
    <table class="diag-q"><thead><tr><th></th>
      <th><button class="linkish" data-info="distribution">${esc(t('diag.dist'))}</button></th><th>${esc(t('diag.nondist'))}</th></tr></thead>
      <tbody><tr><th><button class="linkish" data-info="symmetry">${esc(t('diag.sym'))}</button></th>${cell('sd')}${cell('sn')}</tr>
      <tr><th>${esc(t('diag.asym'))}</th>${cell('ad')}${cell('an')}</tr></tbody></table>
    <p class="hint">${esc(t('diag.links', { n: D.L }))} ${esc(t('diag.interp'))}</p>`;
}
/** Linha do painel do espaço: distribuição e simetria em relação à raiz. */
function diagLine(id) {
  const s = diagnose(inputOf(model), R).spaces[id];
  if (!s || s.distributed === null) return '';
  const sym = s.symmetricWith.length ? t('diag.sSymWith', { ids: s.symmetricWith.join(', ') }) : t('diag.sAsym');
  return `<button class="linkish faces" data-info="diagnosis">${esc(t('diag.space', { dist: t(s.distributed ? 'diag.sDist' : 'diag.sNondist'), sym }))}</button>`;
}
$('diagBox').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('funcBox').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('globalCards').addEventListener('click', e => { const c = e.target.closest('[data-info]'); if (c) openInfo(c.dataset.info); });
$('sortSel').addEventListener('change', e => { sortKey = e.target.value; sortDir = isTextKey(sortKey) ? 1 : -1; renderResults(); renderPanel(); });
$('sortDir').addEventListener('click', () => { sortDir *= -1; renderResults(); renderPanel(); });

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
  $('cvModels').hidden = $('cvStates').hidden = !poiesis;
  cm.closest('label').hidden = cmpView === 'states'; // o gráfico de estados tem eixos próprios
  if (!poiesis && (cmpView === 'models' || cmpView === 'states')) cmpView = 'maps';
  if (cmpView === 'models') { $('cmpChips').innerHTML = ''; renderModels(box); return; }
  if (cmpView === 'states') {
    $('cmpChips').innerHTML = all.map(sc => `<button class="chipbtn" data-chip="${esc(sc.id)}" aria-pressed="${!cmpSel || cmpSel.has(sc.id)}">${esc(sc.name)}</button>`).join('');
    renderStates(box, all.filter(sc => !cmpSel || cmpSel.has(sc.id)));
    return;
  }
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
    const frame = cmpView === 'jgraph' ? jFrame(scs.map(sc => [sc.model, poiesis])) : null;
    box.querySelectorAll('svg.minisvg').forEach(svg => {
      const sc = scs.find(x => x.id === svg.dataset.scn), r = res.get(sc.id);
      if (cmpView === 'maps') drawMiniMap(svg, sc.model, r, colourIn(r)); else drawJGraph(svg, sc.model, new Set(), poiesis, null, frame);
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
      <p class="foot">${researchMode ? esc(t('cmp.passageNote')) + ' ' : ''}${esc(t('cmp.maxMin'))} ${esc(t('cmp.sizeNote'))}</p>`;
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
  const rows = sortDelta(match.pairs
    .map(pr => { const va = RA.per[pr.a][key], vb = RB.per[pr.b][key]; return { pr, va, vb, a: va, b: vb, name: nA.get(pr.a).name, d: va != null && vb != null ? vb - va : null }; }), 'delta');
  if (!rows.length) html += `<div class="valbox">${esc(t('cmp.noMatch'))}</div>`;
  else html += sortBarHTML('delta', [['absd', t('sort.absd')], ['d', 'Δ'], ['a', A.name], ['b', B.name], ['name', t('col.id')]]) + `<div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('col.id'))}</th><th>${esc(A.name)}</th><th>${esc(B.name)}</th><th>Δ</th><th>${esc(t('cmp.rank'))}</th></tr></thead><tbody>
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
/** Rodapé: média, mín e máx de cada modelo (só valores definidos); Δ = estatística classificada − clássica. */
function statRows(rows, f, delta) {
  const nums = k => rows.map(r => r[k]).filter(v => v != null && isFinite(v));
  const st = { mean: v => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null), min: v => (v.length ? Math.min(...v) : null), max: v => (v.length ? Math.max(...v) : null) };
  return Object.entries(st).map(([k, fn]) => {
    const a = fn(nums('a')), b = fn(nums('b')), d = a != null && b != null ? b - a : null;
    return `<tr class="statrow"><th class="name rowh">${esc(t('stat.' + k))}</th><td>${f(a)}</td><td>${f(b)}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${delta(d)}</td><td></td></tr>`;
  }).join('');
}
/**
 * Poiesis13 → Comparar → Modelos: a MESMA instância (cenário ativo) em duas representações —
 * clássica (acesso = aberto = 1, janela fora) e relações classificadas (pesos) — um indicador por vez.
 */
function renderModels(box) {
  const key = cmpKey(), mm = meta(key), f = FMT[key] || fmt3, RC = RT, RP = R;
  const vals = [];
  [RC, RP].forEach(r => r.ids.forEach(id => { const v = r.per[id][key]; if (v != null && isFinite(v)) vals.push(v); }));
  const mn = vals.length ? Math.min(...vals) : 0, mx = vals.length ? Math.max(...vals) : 1;
  const colourIn = r => id => measureColor(r.per[id][key], mn, mx, mm.invert);
  const avg = r => { const v = r.ids.map(id => r.per[id][key]).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const dig = f === fmtInt ? 0 : f === fmt1 ? 1 : f === fmtDepth ? 2 : 3;
  const delta = d => (d == null ? '—' : (d > 0 ? '+' : '') + d.toFixed(dig));
  const fig = (m, r) => `<figure class="mini"><figcaption><span><b>${esc(t('cmpm.' + m))}</b><br><small>${esc(t('cmpm.mean'))} ${f(avg(r))} · ${esc(t('cmpm.depth'))} ${fmtInt(maxDepth(r))} · ${esc(t('cmpm.rings'))} ${r.circuit}</small></span></figcaption>
    <svg class="minisvg" data-model="${m}" viewBox="0 0 ${W0} ${H0}" preserveAspectRatio="xMidYMid meet"></svg></figure>`;
  const rkC = ranks(RC, key), rkP = ranks(RP, key);
  const rows = sortDelta(model.nodes.map(n => { const a = RC.per[n.id][key], b = RP.per[n.id][key]; return { n, a, b, name: n.name, d: a != null && b != null && isFinite(a) && isFinite(b) ? b - a : null }; }), 'models');
  box.innerHTML = `<p class="hint cmp-note">${esc(t('cmpm.intro', { m: t('m.' + key) }))}</p>
    <div class="legend cmp-legend"><span>${esc(t('legend.seg'))} · ${f(mm.invert ? mx : mn)}</span><span class="ramp"></span><span>${f(mm.invert ? mn : mx)} · ${esc(t('legend.int'))}</span></div>
    <div class="mini-grid">${fig('classic', RC)}${fig('poiesis', RP)}</div>
    ${sortBarHTML('models', [['absd', t('sort.absd')], ['d', 'Δ'], ['a', t('cmpm.classic')], ['b', t('cmpm.poiesis')], ['name', t('col.id')]])}
    <div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('m.' + key))}</th><th>${esc(t('cmpm.classic'))}</th><th>${esc(t('cmpm.poiesis'))}</th><th>Δ</th><th>${esc(t('cmp.rank'))}</th></tr></thead><tbody>
    ${rows.map(({ n, a, b, d }) => `<tr><td class="name"><span class="chip" style="background:${colourIn(RP)(n.id)}"></span> ${esc(n.id)} · ${esc(n.name)}</td>
      <td>${f(a)}</td><td>${f(b)}</td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${delta(d)}</td><td>${rkC[n.id] ?? '—'} → ${rkP[n.id] ?? '—'}</td></tr>`).join('')}
    </tbody><tfoot>${statRows(rows, f, delta)}</tfoot></table></div>
    <p class="foot">${esc(t('cmpm.foot'))}</p>`;
  const frame = jFrame([[model, false], [model, true]]);
  box.querySelectorAll('svg.minisvg').forEach(svg => {
    const c = svg.dataset.model === 'poiesis';
    drawJGraph(svg, model, new Set(), c, colourIn(c ? RP : RC), frame);
  });
}
/*
 * Poiesis13 → Comparar → Estados: gráfico de inclinação das POSIÇÕES. Cada cenário é ordenado pelo indicador X
 * (1 = maior) no modelo clássico (esquerda) e no de relações classificadas (direita); cruzamentos = o modelo
 * mede o fenômeno de outro jeito. Cor da linha = direção (vermelho sobe 2+, azul cai 2+, cinza estável).
 * Colunas: Δ do indicador, mudança de posição e — na mesma notação ○ clássico → ● classificado —
 * profundidade do grafo (prof. máxima da raiz, em passos) e anéis.
 */
let stX = 'card.meanInt';
const ST_UP = '#c0271e', ST_DOWN = '#2a78d6', ST_FLAT = '#b4b2a9', ST_MARK = '#888780';
/** Posição por valor decrescente (1 = maior); empates dividem a posição. */
function rankDesc(rows, k) {
  const s = [...rows].sort((a, b) => b[k] - a[k]), out = new Map();
  s.forEach((r, i) => out.set(r, i > 0 && s[i - 1][k] === r[k] ? out.get(s[i - 1]) : i + 1));
  return out;
}
/** Rótulo curto: tira as palavras iniciais comuns a todos ("Cardoso 064 (def., 1960)" → "064" + "def., 1960"). */
function shortNames(names) {
  const words = names.map(n => n.replace(/\s*\(.*\)\s*$/, '').split(/\s+/));
  let c = 0;
  while (words.every(w => w.length > c + 1 && w[c] === words[0][c])) c++;
  return names.map((n, i) => ({ main: words[i].slice(c).join(' '), sub: (/\((.*)\)\s*$/.exec(n) || [])[1] || '' }));
}
function renderStates(box, scs) {
  const ind = CMP_INDICATORS.find(i => i[0] === stX) || CMP_INDICATORS.find(i => i[0] === 'card.meanInt');
  const [xk, fx, dig] = ind, xLabel = t(xk, { basis: t('basis.ra') });
  const fmtX = v => (v == null || !isFinite(v) ? '—' : v.toFixed(dig)), ok = v => v != null && isFinite(v);
  const short = shortNames(scs.map(sc => sc.name));
  const data = scs.map((sc, i) => {
    const C0 = runAnalysis(syntacticInput(sc.model), { ...conv, radius }), P0 = runAnalysis(weightedInput(sc.model), { ...conv, radius });
    return { sc, name: sc.name, ...short[i], xa: fx(C0), xb: fx(P0), ya: maxDepth(C0), yb: maxDepth(P0), ra: C0.circuit, rb: P0.circuit };
  });
  const pts = data.filter(p => ok(p.xa) && ok(p.xb));
  const RA = rankDesc(pts, 'xa'), RB = rankDesc(pts, 'xb');
  data.forEach(p => {
    p.pa = RA.get(p) ?? null; p.pb = RB.get(p) ?? null;
    p.mv = p.pa != null ? p.pa - p.pb : null; p.dx = ok(p.xa) && ok(p.xb) ? p.xb - p.xa : null;
  });
  const rows = [...data].sort(byField(STATES_GET[tblSort.states.k] || STATES_GET.pb, tblSort.states.dir));
  const pair = (a, b) => (a == null ? '—' : `${a} → ${b}`);
  box.innerHTML = `<div class="scatter-ctrl"><label><span>${esc(t('st.ind'))}</span><select id="stXSel">${CMP_INDICATORS.map(([k]) => `<option value="${k}"${k === xk ? ' selected' : ''}>${esc(t(k, { basis: t('basis.ra') }))}</option>`).join('')}</select></label></div>
    <div class="scatter-legend"><span><i style="background:${ST_UP}"></i>${esc(t('st.up'))}</span><span><i style="background:${ST_DOWN}"></i>${esc(t('st.down'))}</span><span><i style="background:${ST_FLAT}"></i>${esc(t('st.flat'))}</span><span>▼ ${esc(t('st.lostLevel'))}</span></div>
    <div class="slopewrap"><svg class="slope" id="statesSvg" role="img" aria-label="${esc(t('cv.states'))}"></svg></div>
    ${sortBarHTML('states', [['pb', t('st.posB')], ['pa', t('st.posA')], ['mv', t('st.move')], ['dx', 'Δ'], ['name', t('st.scn')]])}
    <div class="tablewrap" style="display:block"><table><thead><tr><th class="name">${esc(t('st.scn'))}</th><th>${esc(t('cmpm.classic'))}</th><th>${esc(t('cmpm.poiesis'))}</th><th>Δ</th><th>${esc(t('st.pos'))}</th><th>${esc(t('cmpm.depth'))}</th><th>${esc(t('cmpm.rings'))}</th></tr></thead><tbody>
    ${rows.map(p => `<tr><td class="name">${esc(p.name)}</td><td>${fmtX(p.xa)}</td><td>${fmtX(p.xb)}</td><td>${p.dx == null ? '—' : (p.dx > 0 ? '+' : '') + p.dx.toFixed(dig)}</td><td>${pair(p.pa, p.pb)}</td><td>${pair(p.ya, p.yb)}</td><td>${pair(p.ra, p.rb)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="foot">${esc(t('st.foot', { x: xLabel }))}${data.length > pts.length ? ' ' + esc(t('st.excluded', { n: data.length - pts.length })) : ''}</p>`;
  $('stXSel').addEventListener('change', e => { stX = e.target.value; renderCompare(); });
  const svg = $('statesSvg'), n = pts.length;
  const W = 900, top = 50, rh = 34, H = top + Math.max(n, 1) * rh + 10, XA = 200, XB = 400;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (!n) return;
  const Y = r => top + (r - 1) * rh + rh / 2, put = (p, el) => (p.appendChild(el), el);
  const T = (p, x, y, s, o = {}) => put(p, Object.assign(Eo('text', { x, y, 'font-family': 'inherit', 'font-size': o.size || 12, fill: o.fill || C.ink2, 'font-weight': o.w || 400, 'text-anchor': o.a || 'start' }), { textContent: s }));
  for (let r = 1; r <= n; r += 2) svg.appendChild(Eo('rect', { x: 0, y: top + (r - 1) * rh, width: W, height: rh, fill: C.panel }));
  const head = (x, a, b) => { T(svg, x, 22, a, { a: 'middle', fill: C.ink, w: 600, size: 12.5 }); T(svg, x, 37, b, { a: 'middle', size: 11 }); };
  head(XA, t('cmpm.classic'), xLabel); head(XB, t('cmpm.poiesis'), xLabel);
  head(560, 'Δ', t('st.dHint')); head(626, t('st.pos'), ''); head(718, t('cmpm.depth'), t('st.ab')); head(832, t('cmpm.rings'), t('st.ab'));
  // mesma notação para profundidade e anéis: mini-haltere ○ clássico → ● classificado + "a → b"
  const mini = (g, x0, x1, lo, hi, a, b, y) => {
    if (a == null || b == null) { T(g, x0, y + 4, '—'); return; }
    const X = v => x0 + ((v - lo) / ((hi - lo) || 1)) * (x1 - x0), ch = a !== b;
    g.appendChild(Eo('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: C.rule, 'stroke-width': 1 }));
    if (ch) g.appendChild(Eo('line', { x1: X(a), y1: y, x2: X(b), y2: y, stroke: ST_MARK, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    g.appendChild(Eo('circle', { cx: X(a), cy: y, r: 3.5, fill: '#fff', stroke: ST_MARK, 'stroke-width': 1.5 }));
    g.appendChild(Eo('circle', { cx: X(b), cy: y, r: 3.5, fill: ST_MARK }));
    T(g, x1 + 8, y + 4, `${a} → ${b}`, ch ? { fill: C.ink, w: 600 } : {});
  };
  const ys = pts.flatMap(p => [p.ya, p.yb]).filter(ok), rs = pts.flatMap(p => [p.ra, p.rb]);
  const yLo = Math.min(...ys), yHi = Math.max(...ys), rLo = Math.min(...rs), rHi = Math.max(...rs);
  const groups = [];
  [...pts].sort((a, b) => Math.abs(a.mv) - Math.abs(b.mv)).forEach(p => {
    const g = Eo('g', { class: 'st-case' }), big = Math.abs(p.mv) >= 2, c = p.mv >= 2 ? ST_UP : p.mv <= -2 ? ST_DOWN : ST_FLAT;
    const ya = Y(p.pa), yb = Y(p.pb);
    g.appendChild(Eo('rect', { x: 0, y: ya - rh / 2, width: XA + 8, height: rh, fill: 'transparent' }));
    g.appendChild(Eo('rect', { x: XB - 8, y: yb - rh / 2, width: W - XB + 8, height: rh, fill: 'transparent' }));
    g.appendChild(Eo('line', { x1: XA, y1: ya, x2: XB, y2: yb, stroke: c, 'stroke-width': big ? 3 : 2, 'stroke-linecap': 'round' }));
    g.appendChild(Eo('circle', { cx: XA, cy: ya, r: 5, fill: '#fff', stroke: c, 'stroke-width': 2 }));
    if (ok(p.ya) && ok(p.yb) && p.yb < p.ya) g.appendChild(Eo('path', { d: `M${XB - 7} ${yb - 6} L${XB + 7} ${yb - 6} L${XB} ${yb + 7} Z`, fill: c }));
    else g.appendChild(Eo('circle', { cx: XB, cy: yb, r: 5.5, fill: c }));
    T(g, 12, ya + 4, p.pa + 'º', { size: 11 });
    T(g, XA - 14, ya - 2, p.main, { a: 'end', fill: C.ink, w: 600, size: 13 });
    T(g, XA - 14, ya + 12, [p.sub, fmtX(p.xa)].filter(Boolean).join(' · '), { a: 'end', size: 11 });
    T(g, XB + 14, yb - 2, p.main, { fill: C.ink, w: 600, size: 13 });
    T(g, XB + 14, yb + 12, fmtX(p.xb), { size: 11 });
    T(g, 560, yb + 4, (p.dx > 0 ? '+' : '') + p.dx.toFixed(dig), { a: 'middle', fill: C.ink });
    T(g, 626, yb + 4, p.mv > 0 ? `▲ ${p.mv}` : p.mv < 0 ? `▼ ${-p.mv}` : '=', big ? { a: 'middle', fill: c, w: 600 } : { a: 'middle' });
    mini(g, 676, 716, yLo, yHi, p.ya, p.yb, yb);
    mini(g, 790, 830, rLo, rHi, p.ra, p.rb, yb);
    const tip = Eo('title', {}); tip.textContent = `${p.name}: ${p.pa}º → ${p.pb}º`; g.appendChild(tip);
    svg.appendChild(g); groups.push(g);
  });
  // passar o mouse sobre um caso destaca a linha dele e apaga os outros
  groups.forEach(g => {
    g.addEventListener('pointerenter', () => groups.forEach(o => { o.style.opacity = o === g ? 1 : 0.15; }));
    g.addEventListener('pointerleave', () => groups.forEach(o => { o.style.opacity = 1; }));
  });
}
const STATES_GET = { pb: p => p.pb, pa: p => p.pa, mv: p => p.mv, dx: p => p.dx, name: p => p.name.toLowerCase() };
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

/* ---------------- DISPERSÃO ENTRE MEDIDAS (Resultados) ---------------- */
// Cada ponto é um espaço; o usuário escolhe a medida de cada eixo. Padrão: conectividade × integração,
// o gráfico clássico da inteligibilidade (Hillier 1996). Uma série só: um tom, sem legenda; o título nomeia.
const SCATTER_KEYS = ['conn', 'ctrl', 'controllability', 'choice', 'depth', 'td', 'md', 'ra', 'rra', 'integ', 'ent'];
let scatterX = 'conn', scatterY = 'integ', scatterColor = 'single'; // cor dos pontos: única | função | tipo a/b/c/d
let scatterGroups = []; // grupos desenhados, com posição em tela do SVG, para a seleção por caixa
// área de desenho: menor no celular, para o texto do SVG não encolher demais ao caber na tela
let SC = { w: 640, h: 380, l: 58, r: 18, t: 16, b: 48 };
function renderScatter() {
  const svg = $('scatterSvg');
  SC = narrow.matches ? { w: 380, h: 300, l: 50, r: 12, t: 14, b: 44 } : { w: 640, h: 380, l: 58, r: 18, t: 16, b: 48 };
  svg.setAttribute('viewBox', `0 0 ${SC.w} ${SC.h}`);
  for (const [id, val] of [['scatterXSel', scatterX], ['scatterYSel', scatterY]]) {
    const s = $(id);
    s.innerHTML = SCATTER_KEYS.map(k => `<option value="${k}">${esc(t('m.' + k))}</option>`).join('');
    s.value = val;
  }
  svg.innerHTML = '';
  const kx = scatterX, ky = scatterY, fx = FMT[kx] || fmt3, fy = FMT[ky] || fmt3;
  const pts = model.nodes.map(n => ({ id: n.id, name: n.name, x: R.per[n.id][kx], y: R.per[n.id][ky] }))
    .filter(p => p.x != null && p.y != null && isFinite(p.x) && isFinite(p.y));
  const left = model.nodes.length - pts.length;
  if (!pts.length) { $('scatterNote').textContent = t('scatter.empty'); return; }
  const tx = niceTicks(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)));
  const ty = niceTicks(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y)));
  // margem interna de 4% para os pontos não ficarem colados nos eixos
  const px = (tx[tx.length - 1] - tx[0]) * 0.04, py = (ty[ty.length - 1] - ty[0]) * 0.04;
  const x0 = tx[0] - px, x1 = tx[tx.length - 1] + px, y0 = ty[0] - py, y1 = ty[ty.length - 1] + py;
  const X = v => SC.l + ((v - x0) / (x1 - x0)) * (SC.w - SC.l - SC.r);
  const Y = v => SC.h - SC.b - ((v - y0) / (y1 - y0)) * (SC.h - SC.t - SC.b);
  const ink = C.ink2, rule = C.rule, mono = MONO;
  // grade e eixos recessivos
  tx.forEach(v => {
    svg.appendChild(Eo('line', { x1: X(v), y1: SC.t, x2: X(v), y2: SC.h - SC.b, stroke: rule, 'stroke-width': 1 }));
    svg.appendChild(Object.assign(Eo('text', { x: X(v), y: SC.h - SC.b + 16, 'font-family': mono, 'font-size': 10.5, fill: ink, 'text-anchor': 'middle' }), { textContent: String(v) }));
  });
  ty.forEach(v => {
    svg.appendChild(Eo('line', { x1: SC.l, y1: Y(v), x2: SC.w - SC.r, y2: Y(v), stroke: rule, 'stroke-width': 1 }));
    svg.appendChild(Object.assign(Eo('text', { x: SC.l - 8, y: Y(v) + 3.5, 'font-family': mono, 'font-size': 10.5, fill: ink, 'text-anchor': 'end' }), { textContent: String(v) }));
  });
  svg.appendChild(Object.assign(Eo('text', { x: (SC.l + SC.w - SC.r) / 2, y: SC.h - 8, 'font-family': mono, 'font-size': 11.5, fill: C.ink, 'text-anchor': 'middle' }), { textContent: t('m.' + kx) }));
  svg.appendChild(Object.assign(Eo('text', { x: 14, y: (SC.t + SC.h - SC.b) / 2, 'font-family': mono, 'font-size': 11.5, fill: C.ink, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(SC.t + SC.h - SC.b) / 2})` }), { textContent: t('m.' + ky) }));
  // reta de tendência (mínimos quadrados), recortada à área do gráfico
  const fit = pts.length >= 3 ? linearFit(pts.map(p => p.x), pts.map(p => p.y)) : null;
  if (fit) {
    const clip = Eo('clipPath', { id: 'scClip' });
    clip.appendChild(Eo('rect', { x: SC.l, y: SC.t, width: SC.w - SC.l - SC.r, height: SC.h - SC.t - SC.b }));
    svg.appendChild(clip);
    svg.appendChild(Eo('line', { x1: X(x0), y1: Y(fit.a + fit.b * x0), x2: X(x1), y2: Y(fit.a + fit.b * x1), stroke: C.ink2, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'clip-path': 'url(#scClip)', 'pointer-events': 'none' }));
  }
  // pontos (≥ 10 px, anel da cor do fundo para separar sobreposições) e rótulos agrupados por coordenada
  const groups = groupCoincident(pts), many = pts.length > 24;
  // cor por categoria (paleta validada, ordem fixa; excedentes e vazios em "outros")
  const catOf = id => (scatterColor === 'label' ? byId.get(id).label : scatterColor === 'type' ? R.per[id].type : null);
  const cats = scatterColor === 'single' ? null : categoryColors(model.nodes.map(n => catOf(n.id)));
  const colorOf = id => (!cats ? C.accent : cats.color.get(catOf(id)) || OTHER_COLOR);
  const anySel = pts.some(q => selSet.has(q.id));
  scatterGroups = groups.map(gp => ({ ids: gp.map(q => q.id), sx: X(gp[0].x), sy: Y(gp[0].y) }));
  // rótulos: à direita do ponto; perto da borda direita, à esquerda; pontos vizinhos na mesma coluna alternam o lado
  const side = new Map();
  const byCol = [...groups].sort((a, b) => X(a[0].x) - X(b[0].x) || Y(a[0].y) - Y(b[0].y));
  byCol.forEach((gp, i) => {
    const prev = byCol[i - 1], sx = X(gp[0].x);
    let left = sx > SC.w - SC.r - 50;
    if (prev && Math.abs(X(prev[0].x) - sx) < 4 && Math.abs(Y(prev[0].y) - Y(gp[0].y)) < 13) left = !side.get(prev);
    side.set(gp, left);
  });
  groups.forEach(gp => {
    const p = gp[0], sel = gp.some(q => selSet.has(q.id)), isRoot = gp.some(q => q.id === model.root);
    const g = Eo('g', { class: 'scpt', transform: `translate(${X(p.x)},${Y(p.y)})`, opacity: anySel && !sel ? 0.35 : 1 });
    g.dataset.ids = gp.map(q => q.id).join('\u0000');
    g.appendChild(Eo('circle', { r: 14, fill: 'transparent' }));
    if (sel) g.appendChild(Eo('circle', { r: 10, fill: 'none', stroke: C.accent, 'stroke-width': 2, 'stroke-opacity': 0.6 }));
    g.appendChild(Eo('circle', { r: sel ? 6.5 : 5.5, fill: colorOf(p.id), stroke: C.panel, 'stroke-width': 2 }));
    if (isRoot) g.appendChild(Eo('circle', { r: 8.5, fill: 'none', stroke: C.accent, 'stroke-width': 1.3 }));
    if (!many || sel) {
      const onLeft = side.get(gp);
      const lb = Eo('text', { x: onLeft ? -9 : 9, y: -6, 'font-family': mono, 'font-size': 10.5, fill: C.ink2, 'font-weight': sel ? 700 : 400, 'text-anchor': onLeft ? 'end' : 'start' });
      lb.textContent = gp.map(q => q.id).join(', ');
      g.appendChild(lb);
    }
    svg.appendChild(g);
  });
  // estatística: r, R², n (a inteligibilidade é conectividade × integração global)
  let note = fit ? t('scatter.stats', { r: fit.r.toFixed(3), r2: (fit.r * fit.r).toFixed(3), n: pts.length }) : t('scatter.few', { n: pts.length });
  if (fit && kx === 'conn' && ky === 'integ' && radius === 0) note += ' ' + t('scatter.intel');
  if (left) note += ' ' + t('scatter.excluded', { n: left });
  $('scatterNote').textContent = note;
  svg.dataset.fx = kx; svg.dataset.fy = ky;
  // legenda (só com mais de uma cor): a identidade nunca depende só da cor — os ids continuam rotulados
  const leg = $('scatterLegend');
  leg.innerHTML = cats ? [...cats.color].map(([k, c]) => `<span><i style="background:${c}"></i>${esc(scatterColor === 'type' ? t('type') + ' ' + k : k)}</span>`).join('') +
    (cats.others ? `<span><i style="background:${OTHER_COLOR}"></i>${esc(t(scatterColor === 'label' ? 'scatter.otherLabel' : 'scatter.other'))}</span>` : '') : '';
  $('scatterColorSel').value = scatterColor;
}
function scatterTip(e) {
  const g = e.target.closest('.scpt');
  if (!g || e.pointerType !== 'mouse') { hideTip(); return; }
  const ids = g.dataset.ids.split('\u0000'), p = R.per[ids[0]], fx = FMT[scatterX] || fmt3, fy = FMT[scatterY] || fmt3;
  tip.innerHTML = `<b>${ids.map(id => esc(id) + ' · ' + esc(byId.get(id).name)).join('<br>')}</b><br>${esc(t('m.' + scatterX))}: ${fx(p[scatterX])}<br>${esc(t('m.' + scatterY))}: ${fy(p[scatterY])}`;
  tip.style.opacity = 1; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px';
}
$('scatterSvg').addEventListener('pointermove', scatterTip);
$('scatterSvg').addEventListener('pointerleave', hideTip);
let scBox = null;
const scPoint = e => { const m = $('scatterSvg').getScreenCTM().inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: p.x, y: p.y }; };
/** Aplica a seleção feita no gráfico ao mapa, ao j-graph e à lista (a mesma seleção do app inteiro). */
function scatterSelect(ids, add) {
  if (!add) selSet.clear();
  ids.forEach(id => { if (add && selSet.has(id) && ids.length === 1) selSet.delete(id); else selSet.add(id); });
  refreshSel(); renderGraph(); renderJ();
  if (selSet.size === 1 && !add) openSheet({ kind: 'node', id: [...selSet][0] });
  else closeSheet();
}
$('scatterSvg').addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  scBox = { ...scPoint(e), cx: e.clientX, cy: e.clientY, add: e.shiftKey, hit: e.target.closest('.scpt'), drag: e.pointerType !== 'touch', moved: false, el: null };
  if (scBox.drag) try { $('scatterSvg').setPointerCapture(e.pointerId); } catch (_) { /* ponteiro já liberado */ }
});
$('scatterSvg').addEventListener('pointermove', e => {
  if (!scBox || !scBox.drag) return;
  if (!scBox.moved && Math.hypot(e.clientX - scBox.cx, e.clientY - scBox.cy) > 4) {
    scBox.moved = true;
    scBox.el = Eo('rect', { fill: 'rgba(178,58,46,.08)', stroke: C.accent, 'stroke-width': 1, 'stroke-dasharray': '4 3', 'pointer-events': 'none' });
    $('scatterSvg').appendChild(scBox.el);
  }
  if (scBox.el) {
    const p = scPoint(e);
    scBox.el.setAttribute('x', Math.min(p.x, scBox.x)); scBox.el.setAttribute('y', Math.min(p.y, scBox.y));
    scBox.el.setAttribute('width', Math.abs(p.x - scBox.x)); scBox.el.setAttribute('height', Math.abs(p.y - scBox.y));
  }
});
$('scatterSvg').addEventListener('pointerup', e => {
  const b = scBox; scBox = null;
  if (!b) return;
  if (b.moved) {
    const p = scPoint(e), x0 = Math.min(p.x, b.x), x1 = Math.max(p.x, b.x), y0 = Math.min(p.y, b.y), y1 = Math.max(p.y, b.y);
    scatterSelect(scatterGroups.filter(g => g.sx >= x0 && g.sx <= x1 && g.sy >= y0 && g.sy <= y1).flatMap(g => g.ids), b.add);
  } else if (b.hit) scatterSelect(b.hit.dataset.ids.split('\u0000'), b.add);
  else if (!b.add && selSet.size) scatterSelect([], false);
});
$('scatterColorSel').addEventListener('change', e => { scatterColor = e.target.value; renderScatter(); autosave(); });
$('scatterXSel').addEventListener('change', e => { scatterX = e.target.value; renderScatter(); autosave(); });
$('scatterYSel').addEventListener('change', e => { scatterY = e.target.value; renderScatter(); autosave(); });
$('scatterSwap').addEventListener('click', () => { [scatterX, scatterY] = [scatterY, scatterX]; renderScatter(); autosave(); });
$('scatterInfo').addEventListener('click', () => openInfo('intelligibility'));

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
  const cols = ['id', 'name', 'label', ...(researchMode ? ['camada', 'faces'] : []), 'type', 'conn', 'ctrl', 'controllability', 'choice', 'depth', 'td', 'md', 'ra', 'rra', 'integ', 'ent', ...(poiesis ? ['integ_trad', 'd_integ'] : [])];
  const orient = orientation(model).perSpace;
  let out = cols.join(',') + '\n';
  model.nodes.forEach(n => {
    const p = R.per[n.id];
    const faces = orient[n.id] ? FACES.filter(f => orient[n.id].faces[f]).map(f => f + ':' + orient[n.id].faces[f]).join(';') : '';
    out += [n.id, '"' + n.name.replace(/"/g, '""') + '"', '"' + (n.label || '').replace(/"/g, '""') + '"', ...(researchMode ? [poiesis ? 'poiesis13' : SYNTACTIC_LAYER, faces] : []), p.type, p.conn, p.ctrl, p.controllability, p.choice, p.depth, p.td, p.md, p.ra, p.rra, p.integ, p.ent, ...(poiesis ? [cmpVal(n.id, 'integT'), cmpVal(n.id, 'dInteg')] : [])]
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
narrow.addEventListener('change', () => { if (!narrow.matches && view === 'model') setView('graph'); renderScatter(); });
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
document.querySelectorAll('[data-mode-btn]').forEach(b => b.addEventListener('click', () => setResearchMode(b.dataset.modeBtn !== 'simple', b.dataset.modeBtn === 'poiesis')));
$('btnDerive').addEventListener('click', openReview);
$('btnCalib').addEventListener('click', () => { setView('graph'); setMode('measure'); });
$('btnExt').addEventListener('click', createExterior);
$('btnFaces').addEventListener('click', openFaceReview);
$('northRange').addEventListener('input', e => { $('northNum').value = e.target.value; renderCompass(+e.target.value); });
$('northRange').addEventListener('change', e => setNorth(+e.target.value));
$('northNum').addEventListener('change', e => setNorth(parseFloat(e.target.value) || 0));
$('compass').addEventListener('click', () => {
  if (narrow.matches) setView('model');
  const g = $('grpOrient'); g.open = true; g.scrollIntoView({ block: 'center' }); $('northNum').focus();
});
$('optTol').addEventListener('change', e => { tolCm = clamp(parseFloat(e.target.value) || 15, 0.5, 500); autosave(); if (review) { refreshReview(); renderSheet(); renderGraph(); } renderPanel(); });
$('optMinContact').addEventListener('change', e => { minContactCm = clamp(parseFloat(e.target.value) || 30, 1, 2000); autosave(); if (review) { refreshReview(); renderSheet(); renderGraph(); } renderPanel(); });
$('ctxBar').addEventListener('keydown', e => { if (e.target.id === 'calibM' && e.key === 'Enter') applyCalibration(); });

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
$('exPNGJ').addEventListener('click', () => { const v = svgJ.viewBox.baseVal; exportPNG(svgJ, 'justified-graph.png', { x: v.x, y: v.y, w: v.width, h: v.height }); });
$('exCopy').addEventListener('click', () => {
  const s = tableCSV();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(() => toast(t('toast.copied'))).catch(() => putIO(s, 'CSV'));
  else putIO(s, 'CSV');
});
$('exPrint').addEventListener('click', printReport);
$('cmpExport').addEventListener('click', () => {
  const table = $('compareBox').querySelector('table');
  if (!table) { toast(t('cmp.noTable')); return; }
  const rows = [...table.rows].map(r => [...r.cells].map(c => c.textContent.replace(/[▲▼]/g, '').replace(/\s+/g, ' ').trim()));
  const s = toCSV(rows);
  download(s, `comparacao_${cmpView}.csv`, 'text/csv');
  putIO(s, 'CSV');
});
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
/** Abre um .json do disco (exemplar v1–v3 ou projeto) como cenário(s) novo(s); nada é sobrescrito. */
$('btnOpenFile').addEventListener('click', () => $('fileOpen').click());
$('fileOpen').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const w = $('ioWarn');
  f.text().then(text => {
    try {
      const data = JSON.parse(text);
      w.hidden = true;
      if (data && typeof data === 'object' && 'scenarios' in data) { importScenarios(migrateProject(data)); return; }
      const { model: m, warnings } = migrateModelWithReport(data);
      const id = newScenarioId(project.scenarios.map(s => s.id));
      const name = ((m.meta && m.meta.exemplar_id) || f.name.replace(/\.json$/i, '')).slice(0, 80);
      if (addScenario({ id, name, family: id, model: m })) {
        toast(t('toast.fileOpened', { name }));
        if (warnings.length) { w.hidden = false; w.textContent = '⚠ ' + warnings.join(' '); $('grpIO').open = true; }
        hintResearch(m);
      }
    } catch (err) {
      w.hidden = false; $('grpIO').open = true;
      w.textContent = '⚠ ' + f.name + ': ' + (err instanceof SyntaxError ? t('err.json') : err.message);
    }
  }).finally(() => { e.target.value = ''; });
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
  if (researchMode && selEdge && /^[1-4]$/.test(k) && kindsShown()[+k - 1]) { setEdgeKind(selEdge, kindsShown()[+k - 1]); return; }
  if (k === 'n') addNodeAt(lastMouse.x, lastMouse.y);
  if (k === 'l' && selSet.size === 2) { const [a, b] = [...selSet]; addEdge(a, b); }
  if (k === 'r' && selSet.size === 1) setRoot([...selSet][0]);
  if (e.key === 'Enter' && mode === 'poly') finishPoly();
  if (e.key === 'Escape') {
    if (mode === 'measure') setMode('select');
    else if (mode === 'poly' && poly.pts.length) cancelPoly();
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
paintMode();
$('btnProjector').setAttribute('aria-pressed', String(projector));
$('bgControls').hidden = !bg.img;
Object.entries(BG_INPUTS).forEach(([id, key]) => { $(id).value = bg[key]; });
recompute();
setMode('select');
setView('graph');
fitView();
