import { describe, expect, it } from 'vitest';
import { analyse, diamond, differenceFactor } from '../src/engine';
import { REPORT, topo, VALIDATED } from './fixtures';

const close = (actual: number | null, expected: number, digits = 3) => {
  expect(actual).not.toBeNull();
  expect(actual!).toBeCloseTo(expected, digits);
};

describe('modelo validado de 10 nós (relatório space_syntax_analysis)', () => {
  const R = analyse(VALIDATED);

  it.each(Object.keys(REPORT))('espaço %s confere com o relatório', id => {
    const p = R.per[id], e = REPORT[id];
    expect(p.conn).toBe(e.conn);
    expect(p.depth).toBe(e.depth);
    expect(p.td).toBe(e.td);
    close(p.md, e.md);
    close(p.ra, e.ra);
    close(p.rra, e.rra);
    close(p.integ, e.integ);
    close(p.ctrl, e.ctrl);
    close(p.controllability, e.controllability);
    expect(p.choice).toBeCloseTo(e.choice, 9);
    expect(p.type).toBe(e.type);
  });

  it('entropia excludeSelf reproduz o relatório (convenção v1)', () => {
    const Rx = analyse(VALIDATED, { entropy: 'excludeSelf' });
    for (const id of Object.keys(REPORT)) close(Rx.per[id].ent, REPORT[id].entEx);
  });

  it('entropia padrão segue o depthmapX (p_d = n_d/k, inclui d=0)', () => {
    // E: profundidades {0:1, 1:5, 2:3, 3:1}, k = 10
    const p = [0.1, 0.5, 0.3, 0.1];
    close(R.per.E.ent, -p.reduce((s, x) => s + x * Math.log2(x), 0), 9);
    close(R.per.E.ent, 1.685);
  });

  it('medidas globais', () => {
    expect(R.k).toBe(10);
    expect(R.L).toBe(9);
    expect(R.comp).toBe(1);
    expect(R.circuit).toBe(0);
    expect(R.ringiness).toBe(0);
    expect(R.diameter).toBe(5); // G–I–E–D–F–H
    expect(R.typeCounts.a.length).toBe(6);
    expect(R.typeCounts.b.length).toBe(4);
  });

  it('fator de diferença: RA por padrão (H=0.963, H*=0.665); integração como opção (0.940/0.608)', () => {
    close(R.H, 0.963);
    close(R.Hs, 0.665);
    const Ri = analyse(VALIDATED, { differenceFactor: 'integration' });
    close(Ri.H, 0.94);
    close(Ri.Hs, 0.608);
  });

  it('inteligibilidade usa integração global mesmo com raio', () => {
    const R3 = analyse(VALIDATED, { radius: 2 });
    expect(R3.per.G.integ).not.toBeCloseTo(R.per.G.integ!, 3); // a integração local muda…
    close(R3.intelligibility, R.intelligibility!, 12); // …mas R² não
    close(R3.Hs, R.Hs!, 12);
  });

  it('distance() entre espaços', () => {
    expect(R.distance('X', 'H')).toBe(4);
    expect(R.distance('G', 'H')).toBe(5);
    expect(R.distance('X', 'nada')).toBeNull();
  });
});

describe('grafos canônicos (valores fechados à mão)', () => {
  it('D_k: k=5 → 0.351993', () => {
    close(diamond(5), 0.351994, 6);
    expect(diamond(2)).toBeNull();
  });

  it('estrela K1,4: centro com MD=1 não tem RA (como no depthmapX); folha integ 0.70399', () => {
    const R = analyse(topo([['c', 'a'], ['c', 'b'], ['c', 'd'], ['c', 'e']]));
    expect(R.per.c.md).toBe(1);
    expect(R.per.c.ra).toBeNull();
    expect(R.per.c.integ).toBeNull();
    // folha: TD=7, MD=1.75, RA=0.5, RRA=0.5/D5
    close(R.per.a.ra, 0.5, 9);
    close(R.per.a.integ, 0.351993 / 0.5, 5);
    // entropia folha: {0:1,1:1,2:3}/5 (depthmapX) e {1:1,2:3}/4 (excludeSelf)
    close(R.per.a.ent, -(2 * 0.2 * Math.log2(0.2) + 0.6 * Math.log2(0.6)), 9);
    close(analyse(topo([['c', 'a'], ['c', 'b'], ['c', 'd'], ['c', 'e']]), { entropy: 'excludeSelf' }).per.a.ent, 0.811278, 6);
    expect(R.per.c.choice).toBe(6); // C(4,2) pares de folhas passam pelo centro
  });

  it('caminho P5: choice e raio', () => {
    const P = topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']]);
    const R = analyse(P);
    expect([R.per.a.choice, R.per.b.choice, R.per.c.choice]).toEqual([0, 3, 4]);
    const R2 = analyse(P, { radius: 2 });
    expect([R2.per.b.choice, R2.per.c.choice, R2.per.d.choice]).toEqual([1, 1, 1]);
    const R1 = analyse(P, { radius: 1 });
    expect(R1.per.c.reach).toBe(2);
    expect(R1.per.c.ra).toBeNull(); // MD = 1 dentro do raio
  });

  it('ciclo C4: choice dividido entre caminhos mínimos alternativos', () => {
    const R = analyse(topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]));
    for (const id of ['a', 'b', 'c', 'd']) expect(R.per[id].choice).toBeCloseTo(0.5, 12);
  });

  it('ciclo C6: 1 anel, ringiness 1/7, todos tipo c', () => {
    const R = analyse(topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']]));
    expect(R.circuit).toBe(1);
    close(R.ringiness, 1 / 7, 12);
    expect(R.typeCounts.c.length).toBe(6);
  });

  it('theta: nós de grau 2 nos arcos são tipo c, não d (armadilha T1)', () => {
    const R = analyse(topo([['u', 'a'], ['a', 'v'], ['u', 'b'], ['b', 'v'], ['u', 'c'], ['c', 'v']]));
    expect(R.circuit).toBe(2);
    expect(R.per.u.type).toBe('d');
    expect(R.per.v.type).toBe('d');
    expect([R.per.a.type, R.per.b.type, R.per.c.type]).toEqual(['c', 'c', 'c']);
  });

  it('gravata (dois triângulos num nó): junção d, demais c', () => {
    const R = analyse(topo([['z', 'a'], ['a', 'b'], ['b', 'z'], ['z', 'c'], ['c', 'd'], ['d', 'z']]));
    expect(R.per.z.type).toBe('d');
    expect(R.typeCounts.c.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('completo K4: todos MD=1 → sem RA; 3 anéis', () => {
    const R = analyse(topo([['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']]));
    expect(R.circuit).toBe(3);
    expect(R.meanInt).toBeNull();
    expect(R.typeCounts.d.length).toBe(4);
  });

  it('grafo desconexo: componentes, inalcançáveis e órfãos', () => {
    const R = analyse(topo([['a', 'b'], ['c', 'd']], ['z']));
    expect(R.comp).toBe(3);
    expect(R.per.c.unreachable).toBe(true);
    expect(R.per.z.orphan).toBe(true);
    expect(R.per.z.ent).toBeNull();
    expect(R.ringiness).toBe(0);
  });

  it('modelo vazio não quebra', () => {
    const R = analyse({ nodes: [], edges: [], root: null });
    expect(R.k).toBe(0);
    expect(R.H).toBeNull();
  });

  it('fator de diferença: tripla homogênea → H* = 1', () => {
    close(differenceFactor([2, 2, 2])!.Hs, 1, 12);
  });
});
