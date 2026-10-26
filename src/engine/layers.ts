/**
 * Camadas de análise (roteiro F4, seção 2): qual grafo se analisa a partir das ligações v3.
 * - acesso     = {acesso, aberto}               — por onde se passa;
 * - visual     = {vista, aberto} + acesso (porta aberta, configurável);
 * - adjacencia = todas as categorias            — quem encosta em quem.
 * O motor (`analyse`) não conhece categorias: recebe só os pares já filtrados.
 */
import { FACES, type Edge, type EdgeKind, type Face, type Model } from './model';
import type { AnalysisInput } from './analyse';

export const LAYERS = ['acesso', 'visual', 'adjacencia'] as const;
export type Layer = (typeof LAYERS)[number];

export interface LayerOptions {
  /** Porta (`acesso`) conta como ligação visual? Padrão: sim (porta aberta). Única regra do código sobre isso. */
  doorIsVisual?: boolean;
}

export function layerKinds(layer: Layer, opts: LayerOptions = {}): Set<EdgeKind> {
  if (layer === 'acesso') return new Set<EdgeKind>(['acesso', 'aberto']);
  if (layer === 'visual') return new Set<EdgeKind>(opts.doorIsVisual === false ? ['vista', 'aberto'] : ['vista', 'acesso', 'aberto']);
  return new Set<EdgeKind>(['opaco', 'vista', 'acesso', 'aberto']);
}

/**
 * Pares [a,b] da camada, sem repetição. As várias ligações de um cômodo com o exterior
 * (uma por face) viram **uma** ligação do grafo, presente se qualquer uma pertencer à camada.
 */
export function layerEdges(model: { edges: Edge[] }, layer: Layer = 'acesso', opts: LayerOptions = {}): [string, string][] {
  const kinds = layerKinds(layer, opts), seen = new Set<string>(), out: [string, string][] = [];
  for (const e of model.edges) {
    if (!kinds.has(e.kind)) continue;
    const k = e.a < e.b ? `${e.a}\u0000${e.b}` : `${e.b}\u0000${e.a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([e.a, e.b]);
  }
  return out;
}

/** Entrada pronta para `analyse()` na camada escolhida. */
export function layerInput(model: Pick<Model, 'nodes' | 'edges' | 'root'>, layer: Layer = 'acesso', opts: LayerOptions = {}): AnalysisInput {
  return { nodes: model.nodes, edges: layerEdges(model, layer, opts), root: model.root };
}

export interface SpaceOrientation {
  /** Categoria da ligação com o exterior em cada face (uma por face, pela regra de unicidade). */
  faces: Partial<Record<Face, EdgeKind>>;
  /** Faces para as quais o espaço se abre de algum modo (tudo menos `opaco`). */
  opensTo: Face[];
  /** Faces por onde se entra (`acesso` ou `aberto`). */
  accessFaces: Face[];
}

export interface OrientationSummary {
  /** Só espaços com ao menos uma ligação com face. */
  perSpace: Record<string, SpaceOrientation>;
  /** Contagem de ligações por face e categoria, no modelo inteiro. */
  byFace: Record<Face, Record<EdgeKind, number>>;
  /** Ligações com o exterior que ainda não têm face. */
  noFace: number;
}

/**
 * Orientação (roteiro F4.2): para cada espaço, para quais faces da envoltória ele abre e com que
 * categoria. Só contagem — medidas de orientação mais elaboradas ficam no Python da pesquisa.
 */
export function orientation(model: Pick<Model, 'nodes' | 'edges'>): OrientationSummary {
  const ext = model.nodes.find(n => n.exterior)?.id ?? null;
  const zero = (): Record<EdgeKind, number> => ({ opaco: 0, vista: 0, acesso: 0, aberto: 0 });
  const byFace = { N: zero(), S: zero(), L: zero(), O: zero() } as Record<Face, Record<EdgeKind, number>>;
  const perSpace: Record<string, SpaceOrientation> = {};
  let noFace = 0;
  for (const e of model.edges) {
    if (!ext || (e.a !== ext && e.b !== ext)) continue;
    if (!e.face) { noFace++; continue; }
    const id = e.a === ext ? e.b : e.a;
    byFace[e.face][e.kind]++;
    const o = (perSpace[id] ??= { faces: {}, opensTo: [], accessFaces: [] });
    o.faces[e.face] = e.kind;
  }
  for (const o of Object.values(perSpace)) {
    o.opensTo = FACES.filter(f => o.faces[f] && o.faces[f] !== 'opaco');
    o.accessFaces = FACES.filter(f => o.faces[f] === 'acesso' || o.faces[f] === 'aberto');
  }
  return { perSpace, byFace, noFace };
}

/**
 * Regra do cálculo sintático (decisão de 2026-10-14): integração, choice, profundidade, controle,
 * entropia etc. usam SÓ as ligações de passagem — `acesso` e `aberto` —, como na literatura
 * (grafo de permeabilidade, Hillier & Hanson 1984). `opaco` e `vista` ficam registradas no modelo
 * e na orientação, mas não entram nas medidas: extrair métricas delas é questão de pesquisa em aberto.
 * As camadas `visual` e `adjacencia` continuam disponíveis no motor, sem uso na interface.
 */
export const SYNTACTIC_LAYER: Layer = 'acesso';
export function syntacticInput(model: Pick<Model, 'nodes' | 'edges' | 'root'>): AnalysisInput {
  return layerInput(model, SYNTACTIC_LAYER);
}

/**
 * Modelo Poiesis13 (análise com relações ponderadas, sem a classe opaco).
 * O peso é a FORÇA da relação — quão integrada ela é: opaco não integra (0) < janela/vista < acesso < aberto.
 * Cada passo custa 1/peso: aberto ≈ 0,67, acesso = 1, vista = 2; peso 0 = sem ligação.
 * Com TRADITIONAL_WEIGHTS (1, 1, 0) o resultado é o grafo de permeabilidade clássico.
 */
export type Weights = Record<EdgeKind, number>;
export const POIESIS13_WEIGHTS: Weights = { opaco: 0, vista: 0.5, acesso: 1, aberto: 1.5 };
export const TRADITIONAL_WEIGHTS: Weights = { opaco: 0, vista: 0, acesso: 1, aberto: 1 };

/** Entrada ponderada para `analyse()`; par repetido (faces do exterior) vale a relação mais forte. `kinds` = classe de cada par. */
export function weightedInput(model: Pick<Model, 'nodes' | 'edges' | 'root'>, w: Weights = POIESIS13_WEIGHTS): AnalysisInput & { kinds: EdgeKind[] } {
  const best = new Map<string, Edge>();
  for (const e of model.edges) {
    if (!(w[e.kind] > 0)) continue;
    const k = e.a < e.b ? `${e.a}\u0000${e.b}` : `${e.b}\u0000${e.a}`, cur = best.get(k);
    if (!cur || w[e.kind] > w[cur.kind]) best.set(k, e);
  }
  const es = [...best.values()];
  return { nodes: model.nodes, root: model.root, edges: es.map(e => [e.a, e.b]), costs: es.map(e => 1 / w[e.kind]), kinds: es.map(e => e.kind) };
}
