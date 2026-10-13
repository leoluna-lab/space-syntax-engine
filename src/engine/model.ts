/**
 * Esquema de dados do modelo convexo.
 *
 * v1 (até 2026-10): {nodes:[{id,name,x,y,poly?}], edges:[[a,b]], root} — sem campo `schema`.
 * v2: igual ao v1 + `schema: 2` + `label?` por espaço (rótulo funcional).
 * v3 (modo pesquisa): ligações viram objetos {a, b, kind, face?}; nó `exterior`; `geo` e `meta`.
 *     Especificação publicável: public/schema/v3.json (mesmo arquivo lido pelo validador Python).
 *
 * `migrateModel` aceita qualquer versão conhecida, valida tudo que vem de fora
 * (JSON colado, arquivo, localStorage) e devolve sempre um Model v3 normalizado.
 */

export const SCHEMA_VERSION = 3 as const;

export type Point = [number, number];

/** Categoria da interface entre dois espaços (roteiro F4, seção 2). */
export const EDGE_KINDS = ['opaco', 'vista', 'acesso', 'aberto'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Face da envoltória, só em ligações com o nó exterior: Norte, Sul, Leste, Oeste. */
export const FACES = ['N', 'S', 'L', 'O'] as const;
export type Face = (typeof FACES)[number];

export const CONJUNTOS = ['definicao', 'validacao', 'sintetico'] as const;
export type Conjunto = (typeof CONJUNTOS)[number];

export interface SpaceNode {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Polígono convexo desenhado (coordenadas do canvas). */
  poly?: Point[];
  /** Rótulo funcional (sala, circulação, serviço…). */
  label?: string;
  /** O portador (exterior). No máximo um por modelo. */
  exterior?: true;
}

/**
 * Uma interface entre dois espaços. Entre espaços interiores há no máximo uma por par;
 * com o exterior, uma por par **e por face** (um cômodo de canto pode abrir para N e para L).
 */
export interface Edge {
  a: string;
  b: string;
  kind: EdgeKind;
  face?: Face;
}

export interface Geo {
  /** Direção do norte em graus, sentido horário a partir do "para cima" da tela. */
  norte_graus?: number;
  escala_m_por_unidade?: number;
  modulo_m?: number;
}

export interface Meta {
  exemplar_id?: string;
  conjunto?: Conjunto;
  fonte?: string;
  local?: string;
  data?: string;
  codificador?: string;
  notas?: string;
}

export interface Model {
  schema: typeof SCHEMA_VERSION;
  nodes: SpaceNode[];
  edges: Edge[];
  root: string | null;
  geo?: Geo;
  meta?: Meta;
}

export interface MigrationReport {
  model: Model;
  /** Problemas que não impedem o uso (o modelo foi corrigido ou ficou incompleto). */
  warnings: string[];
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

export const LIMITS = { nodes: 5000, edges: 50000, name: 200, label: 60, polyPoints: 500, metaText: 300, notes: 4000 } as const;

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

/**
 * Chave de unicidade de uma ligação: o par sem ordem, mais a face quando houver.
 * A face só é aceita em ligações com o exterior, então isto implementa a regra
 * "uma por par entre interiores; uma por par e por face com o exterior".
 */
export function edgeKey(e: { a: string; b: string; face?: string }): string {
  const pair = e.a < e.b ? `${e.a}\u0000${e.b}` : `${e.b}\u0000${e.a}`;
  return e.face ? `${pair}\u0000${e.face}` : pair;
}

function cleanGeo(v: unknown): Geo | undefined {
  if (!isObj(v)) return undefined;
  const g: Geo = {};
  if (finite(v.norte_graus)) g.norte_graus = ((v.norte_graus % 360) + 360) % 360;
  if (finite(v.escala_m_por_unidade) && v.escala_m_por_unidade > 0) g.escala_m_por_unidade = v.escala_m_por_unidade;
  if (finite(v.modulo_m) && v.modulo_m > 0) g.modulo_m = v.modulo_m;
  return Object.keys(g).length ? g : undefined;
}

function cleanMeta(v: unknown, warnings: string[]): Meta | undefined {
  if (!isObj(v)) return undefined;
  const m: Meta = {};
  for (const k of ['exemplar_id', 'fonte', 'local', 'data', 'codificador'] as const) {
    const s = cleanText(v[k], LIMITS.metaText);
    if (s) m[k] = s;
  }
  const notas = cleanText(v.notas, LIMITS.notes);
  if (notas) m.notas = notas;
  if (v.conjunto !== undefined && v.conjunto !== '') {
    if ((CONJUNTOS as readonly unknown[]).includes(v.conjunto)) m.conjunto = v.conjunto as Conjunto;
    else warnings.push(`Conjunto desconhecido "${String(v.conjunto)}" ignorado (use ${CONJUNTOS.join(', ')}).`);
  }
  return Object.keys(m).length ? m : undefined;
}

/** Valida e converte qualquer versão conhecida para Model v3, com a lista de avisos. Lança ModelError se inválido. */
export function migrateModelWithReport(input: unknown): MigrationReport {
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
  const warnings: string[] = [];

  const nodes: SpaceNode[] = [];
  const seen = new Set<string>();
  let exteriorId: string | null = null;
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
    if (raw.exterior === true) {
      if (exteriorId) throw new ModelError(`Mais de um espaço exterior ("${exteriorId}" e "${id}"); o modelo admite um só portador.`);
      exteriorId = id;
      node.exterior = true;
    }
    nodes.push(node);
  });

  const edges: Edge[] = [];
  const keys = new Map<string, EdgeKind>();
  let skipped = 0, legacyInV3 = 0, conflicts = 0, noFace = 0;
  for (const raw of input.edges) {
    let a: string | null, b: string | null, kind: EdgeKind, face: Face | undefined;
    if (Array.isArray(raw)) {
      // v1/v2: toda ligação significava permeabilidade
      if (raw.length !== 2) { skipped++; continue; }
      a = cleanId(raw[0]); b = cleanId(raw[1]); kind = 'acesso';
      if (schema >= 3) legacyInV3++;
    } else if (isObj(raw)) {
      a = cleanId(raw.a); b = cleanId(raw.b);
      if (raw.kind === undefined) throw new ModelError(`Ligação ${String(raw.a)}–${String(raw.b)} sem categoria ("kind").`);
      if (!(EDGE_KINDS as readonly unknown[]).includes(raw.kind)) {
        throw new ModelError(`Categoria de ligação inválida: "${String(raw.kind)}" (use ${EDGE_KINDS.join(', ')}).`);
      }
      kind = raw.kind as EdgeKind;
      if (raw.face !== undefined) {
        if (!(FACES as readonly unknown[]).includes(raw.face)) throw new ModelError(`Face inválida: "${String(raw.face)}" (use ${FACES.join(', ')}).`);
        face = raw.face as Face;
      }
    } else { skipped++; continue; }
    if (!a || !b || a === b || !seen.has(a) || !seen.has(b)) { skipped++; continue; }
    const touchesExterior = a === exteriorId || b === exteriorId;
    if (face && !touchesExterior) throw new ModelError(`Face "${face}" na ligação ${a}–${b}, que não toca o exterior.`);
    if (touchesExterior && !face) noFace++;
    const e: Edge = face ? { a, b, kind, face } : { a, b, kind };
    const k = edgeKey(e), prev = keys.get(k);
    if (prev !== undefined) { if (prev !== kind) conflicts++; continue; }
    keys.set(k, kind);
    edges.push(e);
  }
  if (skipped) warnings.push(`${skipped} ligação(ões) inválida(s) ou com espaço inexistente ignorada(s).`);
  if (legacyInV3) warnings.push(`${legacyInV3} ligação(ões) no formato antigo [a,b] tratada(s) como "acesso".`);
  if (conflicts) warnings.push(`${conflicts} ligação(ões) repetida(s) com outra categoria para o mesmo par (e face); ficou a primeira.`);
  if (noFace) warnings.push(`${noFace} ligação(ões) com o exterior sem face (N, S, L, O).`);

  const rootId = cleanId(input.root);
  const root = rootId && seen.has(rootId) ? rootId : (exteriorId ?? nodes[0]?.id ?? null);
  const model: Model = { schema: SCHEMA_VERSION, nodes, edges, root };
  const geo = cleanGeo(input.geo);
  if (geo) model.geo = geo;
  const meta = cleanMeta(input.meta, warnings);
  if (meta) model.meta = meta;
  return { model, warnings };
}

/** Valida e converte qualquer versão conhecida para Model v3. Lança ModelError se inválido. */
export function migrateModel(input: unknown): Model {
  return migrateModelWithReport(input).model;
}
