/**
 * Exemplar de pesquisa (F4.4): conferência antes de exportar e linha de manifesto.
 * Roteiro F4 §4 (F4.4): um JSON v3 por exemplar + uma linha de manifesto em CSV.
 */
import { EDGE_KINDS, type EdgeKind, type Model } from './model';

export type CheckCode =
  | 'noExemplarId' | 'noConjunto' | 'noCodificador' | 'noFonte'
  | 'noExterior' | 'extNoFace' | 'noScale' | 'noNorth' | 'unlabelled' | 'noPoly' | 'disconnected';

export interface CheckItem {
  code: CheckCode;
  /** importante = compromete o uso do exemplar na amostra; aviso = convém completar. */
  level: 'importante' | 'aviso';
  n?: number;
}

/** O que falta para o exemplar ficar completo. Nada aqui impede a exportação. */
export function exemplarChecklist(model: Pick<Model, 'nodes' | 'edges' | 'geo' | 'meta'>): CheckItem[] {
  const out: CheckItem[] = [];
  const meta = model.meta ?? {}, geo = model.geo ?? {};
  const ext = model.nodes.find(n => n.exterior);
  const interior = model.nodes.filter(n => !n.exterior);
  if (!meta.exemplar_id) out.push({ code: 'noExemplarId', level: 'importante' });
  if (!meta.conjunto) out.push({ code: 'noConjunto', level: 'importante' });
  if (!ext) out.push({ code: 'noExterior', level: 'importante' });
  else {
    const n = model.edges.filter(e => (e.a === ext.id || e.b === ext.id) && !e.face).length;
    if (n) out.push({ code: 'extNoFace', level: 'importante', n });
  }
  if (!meta.codificador) out.push({ code: 'noCodificador', level: 'aviso' });
  if (!meta.fonte) out.push({ code: 'noFonte', level: 'aviso' });
  if (!geo.escala_m_por_unidade) out.push({ code: 'noScale', level: 'aviso' });
  if (geo.norte_graus === undefined) out.push({ code: 'noNorth', level: 'aviso' });
  const unl = interior.filter(n => !n.label).length;
  if (unl) out.push({ code: 'unlabelled', level: 'aviso', n: unl });
  const nop = interior.filter(n => !n.poly).length;
  if (nop) out.push({ code: 'noPoly', level: 'aviso', n: nop });
  // espaços interiores sem nenhuma ligação (de qualquer categoria): provavelmente esquecidos
  const touched = new Set(model.edges.flatMap(e => [e.a, e.b]));
  const iso = interior.filter(n => !touched.has(n.id)).length;
  if (iso && interior.length > 1) out.push({ code: 'disconnected', level: 'aviso', n: iso });
  return out;
}

export const MANIFEST_COLUMNS = [
  'exemplar_id', 'conjunto', 'fonte', 'local', 'data', 'codificador',
  'n_espacos', ...EDGE_KINDS.map(k => `n_${k}`),
] as const;

/** Linha do manifesto: metadados + nº de espaços interiores + nº de ligações por categoria. */
export function manifestRow(model: Pick<Model, 'nodes' | 'edges' | 'meta'>): Record<(typeof MANIFEST_COLUMNS)[number], string | number> {
  const m = model.meta ?? {};
  const byKind = Object.fromEntries(EDGE_KINDS.map(k => [k, 0])) as Record<EdgeKind, number>;
  model.edges.forEach(e => { byKind[e.kind]++; });
  return {
    exemplar_id: m.exemplar_id ?? '', conjunto: m.conjunto ?? '', fonte: m.fonte ?? '', local: m.local ?? '',
    data: m.data ?? '', codificador: m.codificador ?? '',
    n_espacos: model.nodes.filter(n => !n.exterior).length,
    n_opaco: byKind.opaco, n_vista: byKind.vista, n_acesso: byKind.acesso, n_aberto: byKind.aberto,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Manifesto CSV (cabeçalho + uma linha por modelo). */
export function manifestCSV(models: Pick<Model, 'nodes' | 'edges' | 'meta'>[]): string {
  const rows = models.map(manifestRow);
  return [MANIFEST_COLUMNS.join(','), ...rows.map(r => MANIFEST_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}

/** Nome de arquivo seguro a partir do exemplar_id (ou de um nome alternativo). */
export function exemplarFileName(model: Pick<Model, 'meta'>, fallback: string): string {
  const base = (model.meta?.exemplar_id || fallback || 'exemplar').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'exemplar';
}
