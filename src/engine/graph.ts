/**
 * Grafo não-direcionado simples em CSR (compressed sparse row) com índices inteiros.
 * Todos os algoritmos trabalham sobre índices 0..n-1; os ids de texto ficam em `ids`.
 */

export interface Graph {
  n: number;
  ids: string[];
  index: Map<string, number>;
  /** vizinhos de v: targets[offsets[v] .. offsets[v+1]) */
  offsets: Int32Array;
  targets: Int32Array;
  /** nº de arestas (sem laços nem duplicatas) */
  m: number;
  /** custo de cada ligação, paralelo a `targets`; ausente = todas valem 1 passo (grafo topológico) */
  cost?: Float64Array;
}

/** `costs` (paralelo a `edges`): custo de cada passo; em par repetido vale o menor. Sem `costs` = grafo topológico. */
export function buildGraph(ids: string[], edges: [string, string][], costs?: number[]): Graph {
  const n = ids.length;
  const index = new Map<string, number>();
  ids.forEach((id, i) => index.set(id, i));
  const adj: Map<number, number>[] = ids.map(() => new Map<number, number>());
  edges.forEach(([a, b], e) => {
    const i = index.get(a), j = index.get(b);
    if (i === undefined || j === undefined || i === j) return;
    const c = Math.min(costs ? costs[e] : 1, adj[i].get(j) ?? Infinity);
    adj[i].set(j, c);
    adj[j].set(i, c);
  });
  const offsets = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) offsets[v + 1] = offsets[v] + adj[v].size;
  const targets = new Int32Array(offsets[n]);
  const cost = costs ? new Float64Array(offsets[n]) : undefined;
  for (let v = 0; v < n; v++) {
    let p = offsets[v];
    for (const [w, c] of adj[v]) { if (cost) cost[p] = c; targets[p++] = w; }
  }
  return { n, ids, index, offsets, targets, m: offsets[n] / 2, cost };
}

export const degree = (g: Graph, v: number): number => g.offsets[v + 1] - g.offsets[v];

/** Profundidades topológicas a partir de s; -1 = inalcançável. */
export function bfs(g: Graph, s: number): Int32Array {
  const d = new Int32Array(g.n).fill(-1);
  const q = new Int32Array(g.n);
  let head = 0, tail = 0;
  d[s] = 0;
  q[tail++] = s;
  while (head < tail) {
    const v = q[head++];
    for (let p = g.offsets[v]; p < g.offsets[v + 1]; p++) {
      const w = g.targets[p];
      if (d[w] < 0) {
        d[w] = d[v] + 1;
        q[tail++] = w;
      }
    }
  }
  return d;
}

/** Distâncias ponderadas (Dijkstra, O(n²) — basta para mapas convexos) a partir de s; -1 = inalcançável. */
export function dijkstra(g: Graph, s: number): Float64Array {
  const d = new Float64Array(g.n).fill(Infinity), done = new Uint8Array(g.n);
  d[s] = 0;
  for (;;) {
    let v = -1;
    for (let u = 0; u < g.n; u++) if (!done[u] && d[u] < Infinity && (v < 0 || d[u] < d[v])) v = u;
    if (v < 0) break;
    done[v] = 1;
    for (let p = g.offsets[v]; p < g.offsets[v + 1]; p++) {
      const w = g.targets[p], nd = d[v] + (g.cost ? g.cost[p] : 1);
      if (nd < d[w]) d[w] = nd;
    }
  }
  for (let u = 0; u < g.n; u++) if (d[u] === Infinity) d[u] = -1;
  return d;
}

export function countComponents(g: Graph): number {
  const seen = new Uint8Array(g.n);
  const q = new Int32Array(g.n);
  let c = 0;
  for (let s = 0; s < g.n; s++) {
    if (seen[s]) continue;
    c++;
    let head = 0, tail = 0;
    q[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const v = q[head++];
      for (let p = g.offsets[v]; p < g.offsets[v + 1]; p++) {
        const w = g.targets[p];
        if (!seen[w]) { seen[w] = 1; q[tail++] = w; }
      }
    }
  }
  return c;
}

/**
 * Choice = betweenness de Brandes (2001), pares não-ordenados (divide por 2), sem contar extremos.
 * radius > 0: só caminhos mínimos de comprimento ≤ radius (a busca a partir de cada origem
 * não expande além da profundidade `radius`).
 */
export function brandes(g: Graph, radius = 0): Float64Array {
  const { n, offsets, targets } = g;
  const CB = new Float64Array(n);
  const S = new Int32Array(n), Q = new Int32Array(n);
  const sigma = new Float64Array(n), delta = new Float64Array(n);
  const dist = new Int32Array(n);
  const preds: number[][] = Array.from({ length: n }, () => []);
  for (let s = 0; s < n; s++) {
    let sp = 0, head = 0, tail = 0;
    for (let t = 0; t < n; t++) { preds[t].length = 0; sigma[t] = 0; dist[t] = -1; delta[t] = 0; }
    sigma[s] = 1; dist[s] = 0; Q[tail++] = s;
    while (head < tail) {
      const v = Q[head++];
      S[sp++] = v;
      if (radius > 0 && dist[v] >= radius) continue;
      for (let p = offsets[v]; p < offsets[v + 1]; p++) {
        const w = targets[p];
        if (dist[w] < 0) { dist[w] = dist[v] + 1; Q[tail++] = w; }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; preds[w].push(v); }
      }
    }
    while (sp > 0) {
      const w = S[--sp];
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) CB[w] += delta[w];
    }
  }
  for (let v = 0; v < n; v++) CB[v] /= 2;
  return CB;
}

const EPS = 1e-9;
/** Choice ponderado: Brandes sobre caminhos mínimos de custo (Dijkstra). radius > 0 limita o custo do caminho. */
export function brandesWeighted(g: Graph, radius = 0): Float64Array {
  const { n, offsets, targets } = g;
  const CB = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const d = dijkstra(g, s), sigma = new Float64Array(n), delta = new Float64Array(n);
    const preds: number[][] = Array.from({ length: n }, () => []);
    const order = [...Array(n).keys()].filter(v => d[v] >= 0 && (radius <= 0 || d[v] <= radius + EPS)).sort((a, b) => d[a] - d[b]);
    sigma[s] = 1;
    for (const v of order) for (let p = offsets[v]; p < offsets[v + 1]; p++) {
      const w = targets[p];
      if (Math.abs(d[v] + g.cost![p] - d[w]) < EPS && (radius <= 0 || d[w] <= radius + EPS)) { sigma[w] += sigma[v]; preds[w].push(v); }
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) CB[w] += delta[w];
    }
  }
  for (let v = 0; v < n; v++) CB[v] /= 2;
  return CB;
}

export interface Block {
  nodes: number[];
  edgeCount: number;
}

/**
 * Componentes biconexos (Tarjan, versão iterativa — sem risco de estouro de pilha).
 * Cada bloco traz seus nós e nº de arestas; posto do ciclo = arestas − nós + 1.
 */
export function biconnectedBlocks(g: Graph): Block[] {
  const { n, offsets, targets } = g;
  const disc = new Int32Array(n).fill(-1), low = new Int32Array(n);
  const fv: number[] = [], fp: number[] = [], fi: number[] = []; // pilha de quadros: vértice, pai, ponteiro
  const es: number[] = []; // pilha de arestas (pares achatados)
  const out: Block[] = [];
  let time = 0;
  for (let r = 0; r < n; r++) {
    if (disc[r] !== -1) continue;
    disc[r] = low[r] = time++;
    fv.push(r); fp.push(-1); fi.push(offsets[r]);
    while (fv.length) {
      const top = fv.length - 1, v = fv[top];
      if (fi[top] < offsets[v + 1]) {
        const w = targets[fi[top]++];
        if (w === fp[top]) continue; // grafo simples: pular a aresta de volta ao pai
        if (disc[w] === -1) {
          es.push(v, w);
          disc[w] = low[w] = time++;
          fv.push(w); fp.push(v); fi.push(offsets[w]);
        } else if (disc[w] < disc[v]) {
          es.push(v, w);
          if (disc[w] < low[v]) low[v] = disc[w];
        }
      } else {
        fv.pop(); fp.pop(); fi.pop();
        if (!fv.length) break;
        const u = fv[fv.length - 1];
        if (low[v] < low[u]) low[u] = low[v];
        if (low[v] >= disc[u]) {
          const ns = new Set<number>();
          let edgeCount = 0;
          for (;;) {
            const b = es.pop()!, a = es.pop()!;
            ns.add(a); ns.add(b); edgeCount++;
            if (a === u && b === v) break;
          }
          out.push({ nodes: [...ns], edgeCount });
        }
      }
    }
  }
  return out;
}

export function pearson(xs: ArrayLike<number>, ys: ArrayLike<number>): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
