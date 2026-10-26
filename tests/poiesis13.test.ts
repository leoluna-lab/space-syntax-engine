import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyse, jgraphLayout, migrateModel, POIESIS13_WEIGHTS, syntacticInput, TRADITIONAL_WEIGHTS, weightedInput, type EdgeKind } from '../src/engine';
import { VALIDATED } from './fixtures';

const model = (edges: [string, string, EdgeKind][], root = 'E') => ({
  nodes: [...new Set(edges.flatMap(([a, b]) => [a, b]))].map(id => ({ id, name: id, x: 0, y: 0 })),
  edges: edges.map(([a, b, kind]) => ({ a, b, kind })),
  root,
});

describe('Poiesis13: relações ponderadas (custo = 1/peso)', () => {
  it('pesos tradicionais (1, 1, 0) reproduzem a análise clássica; vista e opaco ficam fora', () => {
    const m = model([...VALIDATED.edges.map(([a, b]) => [a, b, 'acesso'] as [string, string, EdgeKind]), ['A', 'J', 'vista'], ['B', 'J', 'opaco']], VALIDATED.root!);
    const W = analyse(weightedInput(m, TRADITIONAL_WEIGHTS)), C = analyse(VALIDATED);
    for (const id of C.ids) {
      expect(W.per[id].depth).toBe(C.per[id].depth);
      expect(W.per[id].md).toBeCloseTo(C.per[id].md!, 12);
      expect(W.per[id].integ).toBeCloseTo(C.per[id].integ!, 12);
      expect(W.per[id].choice).toBeCloseTo(C.per[id].choice, 12);
      expect(W.per[id].ent).toBeCloseTo(C.per[id].ent!, 12);
    }
  });

  // E =aberto= S –porta– Q ; S ~janela~ C ; E ·opaco· Q
  const m = model([['E', 'S', 'aberto'], ['S', 'Q', 'acesso'], ['S', 'C', 'vista'], ['E', 'Q', 'opaco']]);

  it('profundidade do grafo em passos (janela conta como relação); Prof.T/MD com custo (aberto 2/3, janela 2)', () => {
    const R = analyse(weightedInput(m));
    expect([R.per.S.depth, R.per.Q.depth, R.per.C.depth, R.diameter]).toEqual([1, 2, 2, 2]);
    expect(R.distance('E', 'C')).toBe(2);
    expect(R.per.E.td).toBeCloseTo(2 / 3 + 5 / 3 + 8 / 3, 12);
    expect(R.per.S.choice).toBe(3); // S está entre todos os outros
    expect(R.per.E.conn).toBe(1); // a ligação opaca não conta
    expect(R.per.S.md).toBeCloseTo((2 / 3 + 1 + 2) / 3, 12);
  });

  it('MD < 1 (ligado a todos por aberto): RA negativo registrado, integração indefinida', () => {
    const R = analyse(weightedInput(model([['X', 'A', 'aberto'], ['X', 'B', 'aberto'], ['X', 'E', 'aberto']])));
    expect(R.per.X.md).toBeCloseTo(2 / 3, 12);
    expect(R.per.X.ra!).toBeLessThan(0);
    expect(R.per.X.integ).toBeNull();
  });

  it('par repetido vale a relação mais forte; peso 0 some', () => {
    const I = weightedInput(model([['E', 'S', 'vista'], ['E', 'S', 'acesso'], ['S', 'Q', 'opaco']]));
    expect(I.edges).toEqual([['E', 'S']]);
    expect(I.kinds).toEqual(['acesso']);
    expect(POIESIS13_WEIGHTS.opaco).toBe(0);
  });

  it('j-graph classificado: desenho topológico (níveis inteiros), janela entra como relação', () => {
    const I = weightedInput(m), L = jgraphLayout(I.nodes, I.edges, 'E');
    expect(L.depth).toEqual({ E: 0, S: 1, Q: 2, C: 2 });
  });
});

// Compatibilidade: o Poiesis13 lê os mesmos arquivos v3 (com opaco, vista etc.) sem alterar nada neles.
describe('Poiesis13 e arquivos já gravados', () => {
  const dir = fileURLToPath(new URL('../public/schema/examples/', import.meta.url));
  it.each(readdirSync(dir).filter(f => f.endsWith('.json')))('%s: analisa sem modificar o modelo; tradicional inalterado', f => {
    const m = migrateModel(JSON.parse(readFileSync(dir + f, 'utf-8')));
    const before = JSON.stringify(m);
    const P = analyse(weightedInput(m)), T = analyse(syntacticInput(m)), W = analyse(weightedInput(m, TRADITIONAL_WEIGHTS));
    expect(JSON.stringify(m)).toBe(before);
    expect(P.ids).toEqual(T.ids);
    for (const id of T.ids) {
      expect(W.per[id].depth).toBe(T.per[id].depth);
      expect(W.per[id].choice).toBeCloseTo(T.per[id].choice, 12);
      if (T.per[id].integ !== null) expect(W.per[id].integ).toBeCloseTo(T.per[id].integ!, 12);
    }
  });
});
