/**
 * Layout do grafo justificado como ÁRVORE (Hillier & Hanson 1984).
 *
 * A raiz fica na base (profundidade 0) e cada nível acima é um passo a mais. A árvore de busca
 * em largura define a hierarquia: cada filho fica acima do pai, e o pai fica centrado sobre
 * os seus filhos (layout "tidy"). Uma cadeia de filhos únicos forma um eixo vertical. Não se
 * tenta distribuir cada nível pela largura toda nem centralizar níveis entre si: a árvore
 * pode se espraiar para os lados, mas a descendência fica legível.
 * As demais ligações (que fecham anéis) não entram no layout; ficam em `rings` (tracejadas na tela).
 */

export interface JGraphOptions {
  gapX: number;
  gapY: number;
  padX: number;
  padTop: number;
  padBottom: number;
  /** Largura mínima do desenho; árvores estreitas ficam centradas nela. */
  minWidth: number;
}

export interface JGraphLayout {
  pos: Record<string, { x: number; y: number }>;
  /** Chaves (pares sem ordem) das ligações da árvore de busca em largura. */
  tree: Set<string>;
  depth: Record<string, number | null>;
  maxDepth: number;
  width: number;
  height: number;
  /** y de cada nível de profundidade (índice = profundidade). */
  levelY: number[];
  /** Espaços que a raiz não alcança (desenhados numa faixa no topo). */
  unreachable: string[];
}

const DEFAULTS: JGraphOptions = { gapX: 58, gapY: 76, padX: 48, padTop: 44, padBottom: 52, minWidth: 760 };
export const pairKey = (a: string, b: string) => (a < b ? a + '\u0000' + b : b + '\u0000' + a);

export function jgraphLayout(nodes: { id: string }[], edges: [string, string][], root: string | null, opts: Partial<JGraphOptions> = {}): JGraphLayout {
  const o = { ...DEFAULTS, ...opts };
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const [a, b] of edges) { if (adj.has(a) && adj.has(b) && a !== b) { adj.get(a)!.push(b); adj.get(b)!.push(a); } }
  for (const list of adj.values()) list.sort((x, y) => order.get(x)! - order.get(y)!); // ordem estável: a dos espaços

  // árvore de busca em largura a partir da raiz
  const depth: Record<string, number | null> = Object.fromEntries(nodes.map(n => [n.id, null]));
  const children = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  const tree = new Set<string>();
  let maxDepth = 0;
  if (root && adj.has(root)) {
    depth[root] = 0;
    const q = [root];
    for (let h = 0; h < q.length; h++) {
      const v = q[h];
      for (const w of adj.get(v)!) {
        if (depth[w] !== null) continue;
        depth[w] = depth[v]! + 1;
        maxDepth = Math.max(maxDepth, depth[w]!);
        children.get(v)!.push(w);
        tree.add(pairKey(v, w));
        q.push(w);
      }
    }
  }

  // x em "fendas": folhas em sequência (ordem de busca em profundidade); pai no meio dos filhos
  const slot: Record<string, number> = {};
  let leaves = 0;
  if (root && depth[root] === 0) {
    // pós-ordem iterativa (sem recursão: árvores profundas não estouram a pilha)
    const stack: [string, number][] = [[root, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], [v, i] = top, kids = children.get(v)!;
      if (i < kids.length) { top[1]++; stack.push([kids[i], 0]); continue; }
      stack.pop();
      slot[v] = kids.length ? (slot[kids[0]] + slot[kids[kids.length - 1]]) / 2 : leaves++;
    }
  }
  const unreachable = nodes.filter(n => depth[n.id] === null).map(n => n.id);
  const cols = Math.max(leaves, unreachable.length, 1);
  const width = Math.max(o.minWidth, 2 * o.padX + (cols - 1) * o.gapX);
  const offset = (width - (cols - 1) * o.gapX) / 2; // centra o bloco inteiro (não cada nível)
  const extraRow = unreachable.length ? 1 : 0;
  const height = o.padTop + o.padBottom + (maxDepth + extraRow) * o.gapY;
  const levelY = Array.from({ length: maxDepth + 1 }, (_, d) => height - o.padBottom - d * o.gapY);
  const pos: JGraphLayout['pos'] = {};
  for (const id of Object.keys(slot)) pos[id] = { x: offset + slot[id] * o.gapX, y: levelY[depth[id]!] };
  unreachable.forEach((id, i) => { pos[id] = { x: offset + i * o.gapX, y: o.padTop - (extraRow ? 0 : o.gapY) }; });
  return { pos, tree, depth, maxDepth, width, height, levelY, unreachable };
}
