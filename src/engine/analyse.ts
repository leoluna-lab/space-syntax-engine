/**
 * Análise configuracional de um modelo convexo.
 *
 * Fórmulas e convenções: ver .claude/skills/space-syntax-teoria/references/medidas.md.
 * Padrão = compatível com depthmapX 0.9.1 (salalib/axialmodules/axialintegration.cpp).
 */
import type { Model } from './model';
import { biconnectedBlocks, bfs, brandes, buildGraph, countComponents, degree, pearson } from './graph';

export type SpaceType = 'a' | 'b' | 'c' | 'd';

export interface AnalysisOptions {
  /** Raio topológico; 0 = global (Rn). */
  radius: number;
  /**
   * Entropia de profundidade:
   * - 'depthmapx': p_d = n_d / k, incluindo o próprio nó em d=0 (axialintegration.cpp:429);
   * - 'excludeSelf': p_d = n_d / (k−1), sem d=0 (convenção do engine v1 e do VGA do depthmapX).
   */
  entropy: 'depthmapx' | 'excludeSelf';
  /**
   * Base da tripla (máx, média, mín) do fator de diferença:
   * - 'ra': formulação original (Hillier, Hanson & Graham 1987) — idêntico a usar RRA no global;
   * - 'integration': integração HH (convenção do engine v1).
   */
  differenceFactor: 'ra' | 'integration';
}

export const DEFAULT_OPTIONS: AnalysisOptions = { radius: 0, entropy: 'depthmapx', differenceFactor: 'ra' };

export interface NodeResult {
  conn: number;
  ctrl: number;
  controllability: number;
  within2: number;
  /** nº de espaços alcançados (dentro do raio), sem contar o próprio */
  reach: number;
  td: number;
  md: number | null;
  ra: number | null;
  rra: number | null;
  integ: number | null;
  ent: number | null;
  choice: number;
  depth: number | null;
  type: SpaceType;
  orphan: boolean;
  unreachable: boolean;
}

export interface AnalysisResult {
  options: AnalysisOptions;
  ids: string[];
  k: number;
  L: number;
  per: Record<string, NodeResult>;
  comp: number;
  circuit: number;
  ringiness: number;
  meanConn: number;
  meanMD: number | null;
  meanInt: number | null;
  meanRRA: number | null;
  diameter: number;
  /** Fator de diferença (sempre com valores globais). */
  H: number | null;
  Hs: number | null;
  /** R² conectividade × integração global (nunca local — Hillier 1996). */
  intelligibility: number | null;
  typeCounts: Record<SpaceType, string[]>;
  /** Profundidade topológica entre dois espaços; null se desconexos ou inexistentes. */
  distance(a: string, b: string): number | null;
}

/** Valor "diamante" D_k (genlib/pafmath.h `dvalue`). */
export function diamond(k: number): number | null {
  if (k < 3) return null;
  return (2 * (k * (Math.log2((k + 2) / 3) - 1) + 1)) / ((k - 1) * (k - 2));
}

interface DepthStats {
  reach: number;
  td: number;
  md: number | null;
  ra: number | null;
  rra: number | null;
  integ: number | null;
  ent: number | null;
}

function depthStats(row: Int32Array, self: number, radius: number, entropy: AnalysisOptions['entropy']): DepthStats {
  const counts: number[] = [];
  let reach = 0, td = 0;
  for (let j = 0; j < row.length; j++) {
    const d = row[j];
    if (j === self || d < 0 || (radius > 0 && d > radius)) continue;
    reach++;
    td += d;
    counts[d] = (counts[d] ?? 0) + 1;
  }
  const k = reach + 1; // node_count do depthmapX: inclui o próprio nó
  const md = reach > 0 ? td / reach : null;
  let ra: number | null = null, rra: number | null = null, integ: number | null = null;
  // depthmapX só define RA se k > 2 e MD > 1 (nó ligado a todos não tem RA)
  if (md !== null && k > 2 && md > 1) {
    ra = (2 * (md - 1)) / (k - 2);
    rra = ra / diamond(k)!;
    integ = 1 / rra;
  }
  let ent: number | null = null;
  if (reach > 0) {
    if (entropy === 'depthmapx') counts[0] = 1;
    const denom = entropy === 'depthmapx' ? k : reach;
    ent = 0;
    for (const c of counts) {
      if (!c) continue;
      const p = c / denom;
      ent -= p * Math.log2(p);
    }
  }
  return { reach, td, md, ra, rra, integ, ent };
}

/** Fator de diferença sobre a tripla (máx, média, mín); H* = (H − ln2)/(ln3 − ln2). */
export function differenceFactor(values: number[]): { H: number; Hs: number } | null {
  if (values.length < 3) return null;
  const mx = Math.max(...values), mn = Math.min(...values);
  const me = values.reduce((a, b) => a + b, 0) / values.length;
  const t = mx + me + mn;
  if (!(t > 0)) return null;
  let H = 0;
  for (const v of [mx, me, mn]) {
    const p = v / t;
    if (p > 0) H -= p * Math.log(p);
  }
  return { H, Hs: (H - Math.LN2) / (Math.log(3) - Math.LN2) };
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const nonNull = (xs: (number | null)[]): number[] => xs.filter((v): v is number => v !== null);

export function analyse(model: Pick<Model, 'nodes' | 'edges' | 'root'>, opts: Partial<AnalysisOptions> = {}): AnalysisResult {
  const options: AnalysisOptions = { ...DEFAULT_OPTIONS, ...opts };
  const radius = Math.max(0, Math.floor(options.radius || 0));
  const ids = model.nodes.map(n => n.id);
  const g = buildGraph(ids, model.edges);
  const n = g.n;
  const comp = countComponents(g);
  const dist: Int32Array[] = [];
  for (let s = 0; s < n; s++) dist.push(bfs(g, s));

  const local: DepthStats[] = [], global: DepthStats[] = [];
  for (let i = 0; i < n; i++) {
    local.push(depthStats(dist[i], i, radius, options.entropy));
    global.push(radius > 0 ? depthStats(dist[i], i, 0, options.entropy) : local[i]);
  }
  const choice = brandes(g, radius);

  // anéis: blocos biconexos com posto de ciclo ≥ 1
  const ringBlocks = new Int32Array(n), maxRank = new Int32Array(n);
  for (const b of biconnectedBlocks(g)) {
    const rank = b.edgeCount - b.nodes.length + 1;
    if (rank < 1) continue;
    for (const v of b.nodes) { ringBlocks[v]++; if (rank > maxRank[v]) maxRank[v] = rank; }
  }

  const rootIdx = model.root != null ? g.index.get(model.root) : undefined;
  const per: Record<string, NodeResult> = {};
  for (let i = 0; i < n; i++) {
    const conn = degree(g, i);
    let ctrl = 0, within2 = 0;
    for (let p = g.offsets[i]; p < g.offsets[i + 1]; p++) ctrl += 1 / degree(g, g.targets[p]);
    for (let j = 0; j < n; j++) if (j !== i && dist[i][j] > 0 && dist[i][j] <= 2) within2++;
    // Tipos (Hillier 1996, cap. 8): a = 1 ligação; b = fora de anéis; c = em 1 anel;
    // d = ≥3 ligações e em ≥2 anéis (2 blocos cíclicos, ou bloco com posto ≥ 2).
    let type: SpaceType;
    if (conn <= 1) type = 'a';
    else if (ringBlocks[i] === 0) type = 'b';
    else if (conn >= 3 && (ringBlocks[i] > 1 || maxRank[i] > 1)) type = 'd';
    else type = 'c';
    const depth = rootIdx !== undefined && dist[rootIdx][i] >= 0 ? dist[rootIdx][i] : null;
    const s = local[i];
    per[ids[i]] = {
      conn, ctrl, within2,
      controllability: within2 > 0 ? conn / within2 : 0,
      reach: s.reach, td: s.td, md: s.md, ra: s.ra, rra: s.rra, integ: s.integ, ent: s.ent,
      choice: choice[i],
      depth,
      type,
      orphan: conn === 0,
      unreachable: rootIdx !== undefined && i !== rootIdx && depth === null,
    };
  }

  const L = g.m;
  const circuit = L - n + comp;
  const ringiness = comp === 1 && 2 * n - 5 > 0 ? (L - n + 1) / (2 * n - 5) : 0;
  let diameter = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (dist[i][j] > diameter) diameter = dist[i][j];

  const hf = differenceFactor(nonNull(global.map(s => (options.differenceFactor === 'ra' ? s.ra : s.integ))));
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) { const v = global[i].integ; if (v !== null) pairs.push([degree(g, i), v]); }
  const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));

  const typeCounts: Record<SpaceType, string[]> = { a: [], b: [], c: [], d: [] };
  ids.forEach(id => typeCounts[per[id].type].push(id));

  return {
    options: { ...options, radius },
    ids, k: n, L, per, comp, circuit, ringiness,
    meanConn: n ? (2 * L) / n : 0,
    meanMD: mean(nonNull(local.map(s => s.md))),
    meanInt: mean(nonNull(local.map(s => s.integ))),
    meanRRA: mean(nonNull(local.map(s => s.rra))),
    diameter,
    H: hf ? hf.H : null,
    Hs: hf ? hf.Hs : null,
    intelligibility: r === null ? null : r * r,
    typeCounts,
    distance(a, b) {
      const i = g.index.get(a), j = g.index.get(b);
      if (i === undefined || j === undefined || dist[i][j] < 0) return null;
      return dist[i][j];
    },
  };
}
