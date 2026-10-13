/**
 * Camadas de análise (roteiro F4, seção 2): qual grafo se analisa a partir das ligações v3.
 * - acesso     = {acesso, aberto}               — por onde se passa;
 * - visual     = {vista, aberto} + acesso (porta aberta, configurável);
 * - adjacencia = todas as categorias            — quem encosta em quem.
 * O motor (`analyse`) não conhece categorias: recebe só os pares já filtrados.
 */
import type { Edge, EdgeKind, Model } from './model';
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
