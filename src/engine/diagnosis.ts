/**
 * Diagnóstico configuracional (Hillier & Hanson 1984, cap. 4).
 *
 * Duas propriedades das relações entre espaços, sempre em relação a um terceiro — aqui, a raiz:
 * - simetria: a relação a–b é simétrica se a está para b como b está para a em relação à raiz,
 *   isto é, os dois estão na mesma profundidade; assimétrica se um é mais profundo que o outro;
 * - distribuição: a relação é distribuída se há mais de um caminho independente (está num anel);
 *   não distribuída se tudo passa por um único caminho.
 * Um espaço é "distribuído em relação à raiz" se há ao menos dois caminhos da raiz até ele sem
 * espaço em comum (Menger) — o que equivale a raiz e o espaço estarem no mesmo bloco biconexo com anel.
 *
 * O texto de leitura é INTERPRETAÇÃO (associações de H&H e Hillier 1996), gerada por critérios
 * explícitos (READING_RULES), não uma medida.
 */
import { biconnectedBlocks, buildGraph } from './graph';
import type { AnalysisInput, AnalysisResult, SpaceType } from './analyse';

export interface LinkRelation { a: string; b: string; symmetric: boolean; distributed: boolean }

export interface SpaceRelation {
  depth: number | null;
  /** Há dois caminhos independentes da raiz até o espaço? null para a raiz e para inalcançáveis. */
  distributed: boolean | null;
  /** Vizinhos na mesma profundidade (relações simétricas). */
  symmetricWith: string[];
}

export type Quadrant = 'sd' | 'sn' | 'ad' | 'an';

export interface Reading { code: string; n?: number; pct?: number }

export interface Diagnosis {
  links: LinkRelation[];
  spaces: Record<string, SpaceRelation>;
  /** Ligações por quadrante: simétrica/assimétrica × distribuída/não distribuída. */
  counts: Record<Quadrant, number>;
  /** Ligações consideradas (as duas pontas alcançáveis a partir da raiz). */
  L: number;
  types: Record<SpaceType, number>;
  maxDepth: number;
  readings: Reading[];
}

/** Critérios do texto de leitura (explícitos para poderem ser citados e discutidos). */
export const READING_RULES = {
  /** fração de ligações em anéis abaixo da qual os anéis são "localizados" */
  localRings: 1 / 3,
  /** fração de ligações simétricas: abaixo = assimétrico; acima de `symHigh` = simétrico */
  symLow: 0.2,
  symHigh: 0.5,
  /** fração de espaços a+b acima da qual predomina controle (sequências e becos) */
  controlTypes: 0.75,
} as const;

export function diagnose(input: AnalysisInput, R: Pick<AnalysisResult, 'per' | 'circuit'>): Diagnosis {
  const ids = input.nodes.map(n => n.id);
  const g = buildGraph(ids, input.edges);
  // blocos com anel (posto ≥ 1): conjuntos de espaços que dividem um anel
  const cyclic = biconnectedBlocks(g).filter(b => b.edgeCount - b.nodes.length + 1 >= 1).map(b => new Set(b.nodes.map(i => ids[i])));
  const sameCyclicBlock = (a: string, b: string) => cyclic.some(s => s.has(a) && s.has(b));
  const depth = (id: string) => R.per[id]?.depth ?? null;

  const links: LinkRelation[] = [];
  const counts: Record<Quadrant, number> = { sd: 0, sn: 0, ad: 0, an: 0 };
  const seen = new Set<string>();
  for (const [a, b] of input.edges) {
    const k = a < b ? a + '\u0000' + b : b + '\u0000' + a;
    if (a === b || seen.has(k)) continue;
    seen.add(k);
    const da = depth(a), db = depth(b);
    if (da === null || db === null) continue;
    const rel = { a, b, symmetric: da === db, distributed: sameCyclicBlock(a, b) };
    links.push(rel);
    counts[((rel.symmetric ? 's' : 'a') + (rel.distributed ? 'd' : 'n')) as Quadrant]++;
  }

  const spaces: Record<string, SpaceRelation> = {};
  for (const id of ids) {
    const d = depth(id);
    spaces[id] = {
      depth: d,
      distributed: d === null || d === 0 || input.root === null ? null : sameCyclicBlock(input.root, id),
      symmetricWith: links.filter(l => l.symmetric && (l.a === id || l.b === id)).map(l => (l.a === id ? l.b : l.a)),
    };
  }

  const types: Record<SpaceType, number> = { a: 0, b: 0, c: 0, d: 0 };
  ids.forEach(id => { const tp = R.per[id]?.type; if (tp) types[tp]++; });
  const maxDepth = Math.max(0, ...ids.map(id => depth(id) ?? 0));

  // ---- leitura (interpretação) ----
  const readings: Reading[] = [];
  const L = links.length, pct = (x: number) => Math.round((100 * x) / Math.max(1, L));
  const distLinks = counts.sd + counts.ad, symLinks = counts.sd + counts.sn;
  if (L) {
    if (R.circuit === 0) readings.push({ code: 'tree' });
    else if (distLinks / L < READING_RULES.localRings) readings.push({ code: 'ringsLocal', n: R.circuit, pct: pct(distLinks) });
    else readings.push({ code: 'distributed', n: R.circuit, pct: pct(distLinks) });
    const sym = symLinks / L;
    if (sym < READING_RULES.symLow) readings.push({ code: 'asymmetric', pct: pct(symLinks) });
    else if (sym > READING_RULES.symHigh) readings.push({ code: 'symmetric', pct: pct(symLinks) });
    else readings.push({ code: 'mixedSym', pct: pct(symLinks) });
    readings.push({ code: 'depth', n: maxDepth });
  }
  const k = ids.length;
  if (k) {
    const ab = (types.a + types.b) / k;
    readings.push(ab >= READING_RULES.controlTypes
      ? { code: 'typesControl', pct: Math.round(100 * ab) }
      : { code: 'typesChoice', pct: Math.round(100 * (types.c + types.d) / k) });
  }
  return { links, spaces, counts, L, types, maxDepth, readings };
}
