/**
 * Comparação entre cenários e leitura por função (rótulos).
 */
import type { Model } from './model';
import { differenceFactor, type AnalysisResult } from './analyse';

/** Nome normalizado para comparação: sem acentos, minúsculo, espaços simples. */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Nomes automáticos ("Espaço 3", "Space 12", "Ambiente 4") não identificam nada entre projetos. */
const GENERIC = /^(espaco|space|ambiente|room|sala)\s*\d+$/;
const isGeneric = (n: string) => GENERIC.test(normName(n));

export interface SpaceMatch {
  a: string;
  b: string;
  by: 'id' | 'name' | 'label';
}

export interface MatchResult {
  pairs: SpaceMatch[];
  onlyA: string[];
  onlyB: string[];
}

type Lite = Pick<Model, 'nodes'>;

/**
 * Casa os espaços de dois cenários.
 * - Mesma família (cenário duplicado): primeiro pelo id — sobrevive a renomeações.
 * - Depois pelo nome (só nomes não automáticos e únicos nos dois lados).
 * - Por fim pelo rótulo funcional, se único nos dois lados entre os que sobraram.
 * Projetos diferentes (outra família) nunca são casados pelo id: ali "A" não quer dizer nada.
 */
export function matchSpaces(A: Lite, B: Lite, sameFamily: boolean): MatchResult {
  const restA = new Map(A.nodes.map(n => [n.id, n])), restB = new Map(B.nodes.map(n => [n.id, n]));
  const pairs: SpaceMatch[] = [];
  const take = (a: string, b: string, by: SpaceMatch['by']) => { pairs.push({ a, b, by }); restA.delete(a); restB.delete(b); };

  if (sameFamily) for (const id of [...restA.keys()]) if (restB.has(id)) take(id, id, 'id');

  const uniqueBy = (m: Map<string, Lite['nodes'][number]>, key: (n: Lite['nodes'][number]) => string | null) => {
    const groups = new Map<string, string[]>();
    for (const n of m.values()) { const k = key(n); if (k) groups.set(k, [...(groups.get(k) ?? []), n.id]); }
    return new Map([...groups].filter(([, ids]) => ids.length === 1).map(([k, ids]) => [k, ids[0]]));
  };
  const byName = (n: Lite['nodes'][number]) => (isGeneric(n.name) ? null : normName(n.name));
  const nA = uniqueBy(restA, byName), nB = uniqueBy(restB, byName);
  for (const [k, a] of nA) { const b = nB.get(k); if (b) take(a, b, 'name'); }

  const byLabel = (n: Lite['nodes'][number]) => (n.label ? normName(n.label) : null);
  const lA = uniqueBy(restA, byLabel), lB = uniqueBy(restB, byLabel);
  for (const [k, a] of lA) { const b = lB.get(k); if (b) take(a, b, 'label'); }

  return { pairs, onlyA: [...restA.keys()], onlyB: [...restB.keys()] };
}

export interface LabelStat {
  label: string;
  ids: string[];
  meanInteg: number | null;
  meanRA: number | null;
  meanRRA: number | null;
  meanDepth: number | null;
}

export interface FunctionalSummary {
  stats: LabelStat[];
  /** Desigualdade de integração entre funções, p.ex. "estar > cozinha > quarto" (Hanson 1998). */
  inequality: string;
  /** Fator de diferença sobre o RA médio de cada função (≥ 3 funções). */
  Hs: number | null;
}

const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Resumo por rótulo funcional. Use um resultado GLOBAL (raio 0): o genótipo é uma
 * propriedade da configuração inteira. Espaços sem rótulo ficam de fora.
 */
export function functionalSummary(model: Lite, R: Pick<AnalysisResult, 'per'>): FunctionalSummary {
  const groups = new Map<string, { label: string; ids: string[] }>();
  for (const n of model.nodes) {
    if (!n.label) continue;
    const k = normName(n.label);
    if (!groups.has(k)) groups.set(k, { label: n.label, ids: [] });
    groups.get(k)!.ids.push(n.id);
  }
  const stats: LabelStat[] = [...groups.values()].map(g => ({
    label: g.label,
    ids: g.ids,
    meanInteg: avg(g.ids.map(id => R.per[id]?.integ ?? null)),
    meanRA: avg(g.ids.map(id => R.per[id]?.ra ?? null)),
    meanRRA: avg(g.ids.map(id => R.per[id]?.rra ?? null)),
    meanDepth: avg(g.ids.map(id => R.per[id]?.depth ?? null)),
  }));
  stats.sort((x, y) => (y.meanInteg ?? -Infinity) - (x.meanInteg ?? -Infinity));
  const ranked = stats.filter(s => s.meanInteg !== null);
  let inequality = '';
  ranked.forEach((s, i) => {
    if (i > 0) inequality += ranked[i - 1].meanInteg!.toFixed(3) === s.meanInteg!.toFixed(3) ? ' = ' : ' > ';
    inequality += s.label;
  });
  const ras = stats.map(s => s.meanRA).filter((v): v is number => v !== null);
  const hf = ras.length >= 3 ? differenceFactor(ras) : null;
  return { stats, inequality, Hs: hf ? hf.Hs : null };
}

/** Posição (1 = maior) de cada espaço segundo `key`; empates recebem a mesma posição. */
export function ranks(R: Pick<AnalysisResult, 'per' | 'ids'>, key: string): Record<string, number> {
  const val = (id: string) => (R.per[id] as unknown as Record<string, number | null>)[key];
  const ids = R.ids.filter(id => val(id) != null).sort((a, b) => (val(b) as number) - (val(a) as number));
  const out: Record<string, number> = {};
  ids.forEach((id, i) => { out[id] = i > 0 && val(id) === val(ids[i - 1]) ? out[ids[i - 1]] : i + 1; });
  return out;
}
