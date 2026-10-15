import { describe, expect, it } from 'vitest';
import { jgraphLayout, pairKey } from '../src/engine/jgraph';
import { topo, VALIDATED } from './fixtures';

const L = (m: { nodes: { id: string }[]; edges: [string, string][]; root: string | null }) => jgraphLayout(m.nodes, m.edges, m.root);

describe('grafo justificado em árvore', () => {
  it('caminho: todos no mesmo eixo vertical, raiz na base', () => {
    const r = L(topo([['a', 'b'], ['b', 'c'], ['c', 'd']]));
    const xs = ['a', 'b', 'c', 'd'].map(id => r.pos[id].x);
    expect(new Set(xs).size).toBe(1);
    expect(r.pos.a.y).toBeGreaterThan(r.pos.b.y); // profundidade 0 embaixo
    expect(r.pos.b.y - r.pos.c.y).toBeCloseTo(r.pos.c.y - r.pos.d.y, 9);
  });

  it('pai centrado sobre os filhos; o nível de cima não ocupa a largura toda', () => {
    // X — E; E tem 3 filhos; D (filho de E) tem 2 filhos
    const r = L(topo([['X', 'E'], ['E', 'B'], ['E', 'D'], ['E', 'C'], ['D', 'A'], ['D', 'F']]));
    expect(r.pos.E.x).toBeCloseTo((r.pos.B.x + r.pos.C.x) / 2, 9);
    expect(r.pos.D.x).toBeCloseTo((r.pos.A.x + r.pos.F.x) / 2, 9);
    expect(r.pos.X.x).toBeCloseTo(r.pos.E.x, 9); // cadeia de filho único = eixo vertical
    // netos ficam sobre o próprio pai, não espalhados pela linha
    expect(Math.abs(r.pos.A.x - r.pos.D.x)).toBeLessThan(Math.abs(r.pos.A.x - r.pos.B.x));
  });

  it('modelo validado: profundidades corretas e árvore = todas as ligações (sem anéis)', () => {
    const r = L(VALIDATED);
    expect(r.depth).toMatchObject({ X: 0, E: 1, B: 2, C: 2, D: 2, I: 2, A: 3, F: 3, G: 3, H: 4 });
    expect(r.tree.size).toBe(9);
    expect(r.pos.H.x).toBeCloseTo(r.pos.F.x, 9); // H é filho único de F
    expect(r.pos.G.x).toBeCloseTo(r.pos.I.x, 9);
  });

  it('anel: a ligação que fecha o anel fica fora da árvore', () => {
    const r = L(topo([['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]));
    expect(r.tree.size).toBe(3);
    expect(r.tree.has(pairKey('c', 'd'))).toBe(false);
  });

  it('inalcançáveis numa faixa acima, sem sobrepor a árvore', () => {
    const r = L(topo([['a', 'b'], ['c', 'd']]));
    expect(r.unreachable).toEqual(['c', 'd']);
    expect(r.pos.c.y).toBeLessThan(r.pos.b.y);
    expect(r.pos.c.x).not.toBe(r.pos.d.x);
  });

  it('árvore larga se espraia: largura cresce com o nº de folhas', () => {
    const star = topo(Array.from({ length: 30 }, (_, i) => ['r', 'f' + i] as [string, string]));
    const r = L(star);
    expect(r.width).toBeGreaterThan(760);
    expect(r.pos.r.x).toBeCloseTo((r.pos.f0.x + r.pos.f29.x) / 2, 9);
  });

  it('cadeia longa não estoura a pilha', () => {
    const chain = topo(Array.from({ length: 4000 }, (_, i) => ['n' + i, 'n' + (i + 1)] as [string, string]));
    expect(L(chain).maxDepth).toBe(4000);
  });
});
