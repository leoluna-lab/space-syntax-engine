/**
 * Esquema de dados do modelo convexo.
 *
 * v1 (até 2026-10): {nodes:[{id,name,x,y,poly?}], edges:[[a,b]], root} — sem campo `schema`.
 * v2: igual ao v1 + `schema: 2` + `label?` por espaço (rótulo funcional, usado na F3).
 *
 * `migrateModel` aceita qualquer versão conhecida, valida tudo que vem de fora
 * (JSON colado, arquivo, localStorage) e devolve sempre um Model v2 normalizado.
 */

export const SCHEMA_VERSION = 2 as const;

export type Point = [number, number];

export interface SpaceNode {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Polígono convexo desenhado (coordenadas do canvas). */
  poly?: Point[];
  /** Rótulo funcional (sala, circulação, serviço…). */
  label?: string;
}

export interface Model {
  schema: typeof SCHEMA_VERSION;
  nodes: SpaceNode[];
  edges: [string, string][];
  root: string | null;
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

export const LIMITS = { nodes: 5000, edges: 50000, name: 200, label: 60, polyPoints: 500 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function cleanId(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= 40 ? s : null;
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function cleanPoly(v: unknown): Point[] | undefined {
  if (!Array.isArray(v) || v.length < 3 || v.length > LIMITS.polyPoints) return undefined;
  const pts: Point[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) return undefined;
    pts.push([p[0], p[1]]);
  }
  return pts;
}

/** Valida e converte qualquer versão conhecida para Model v2. Lança ModelError se inválido. */
export function migrateModel(input: unknown): Model {
  if (!isObj(input)) throw new ModelError('O modelo deve ser um objeto JSON.');
  const schema = input.schema ?? 1;
  if (!finite(schema) || schema < 1) throw new ModelError('Campo "schema" inválido.');
  if (schema > SCHEMA_VERSION) {
    throw new ModelError(`Modelo criado por uma versão mais nova (schema ${schema}). Atualize o aplicativo.`);
  }
  if (!Array.isArray(input.nodes)) throw new ModelError('Faltam os espaços ("nodes").');
  if (!Array.isArray(input.edges)) throw new ModelError('Faltam as ligações ("edges").');
  if (input.nodes.length > LIMITS.nodes) throw new ModelError(`Modelo grande demais (máx. ${LIMITS.nodes} espaços).`);
  if (input.edges.length > LIMITS.edges) throw new ModelError(`Ligações demais (máx. ${LIMITS.edges}).`);

  const nodes: SpaceNode[] = [];
  const seen = new Set<string>();
  input.nodes.forEach((raw, i) => {
    if (!isObj(raw)) throw new ModelError(`Espaço #${i + 1} não é um objeto.`);
    const id = cleanId(raw.id);
    if (!id) throw new ModelError(`Espaço #${i + 1} sem "id" válido.`);
    if (seen.has(id)) throw new ModelError(`Id de espaço repetido: "${id}".`);
    seen.add(id);
    const node: SpaceNode = {
      id,
      name: cleanText(raw.name, LIMITS.name) ?? id,
      // posição padrão em grade, igual ao comportamento v1
      x: finite(raw.x) ? raw.x : 120 + ((i * 55) % 620),
      y: finite(raw.y) ? raw.y : 120 + ((i * 90) % 320),
    };
    const poly = cleanPoly(raw.poly);
    if (poly) node.poly = poly;
    const label = cleanText(raw.label, LIMITS.label);
    if (label) node.label = label;
    nodes.push(node);
  });

  const edges: [string, string][] = [];
  const pairs = new Set<string>();
  for (const raw of input.edges) {
    if (!Array.isArray(raw) || raw.length !== 2) continue;
    const a = cleanId(raw[0]), b = cleanId(raw[1]);
    if (!a || !b || a === b || !seen.has(a) || !seen.has(b)) continue;
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    edges.push([a, b]);
  }

  const rootId = cleanId(input.root);
  const root = rootId && seen.has(rootId) ? rootId : (nodes[0]?.id ?? null);
  return { schema: SCHEMA_VERSION, nodes, edges, root };
}
