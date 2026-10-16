import { describe, expect, it } from 'vitest';
import { analyse, diagnose } from '../src/engine';
import { topo, VALIDATED } from './fixtures';

const run = (m: ReturnType<typeof topo>) => diagnose(m, analyse(m));
const codes = (d: ReturnType<typeof diagnose>) => d.readings.map(r => r.code);

describe('diagnóstico configuracional (H&H 1984, cap. 4)', () => {
  it('árvore (modelo validado): tudo assimétrico e não distribuído', () => {
    const d = run(VALIDATED);
    expect(d.counts).toEqual({ sd: 0, sn: 0, ad: 0, an: 9 });
    expect(Object.values(d.spaces).every(s => s.distributed !== true)).toBe(true);
    expect(d.spaces.X.distributed).toBeNull(); // a raiz
    expect(codes(d)).toEqual(['tree', 'asymmetric', 'depth', 'typesControl']);
    expect(d.readings.find(r => r.code === 'depth')!.n).toBe(4);
  });

  it('anel de 4 a partir de um canto: assimétrico e distribuído; corda entre os do mesmo nível é simétrica', () => {
    const ring = topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']]);
    const d = run(ring);
    expect(d.counts).toEqual({ sd: 0, sn: 0, ad: 4, an: 0 });
    expect(['b', 'c', 'd'].every(id => d.spaces[id].distributed)).toBe(true);
    const chord = run(topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['b', 'd']]));
    expect(chord.counts.sd).toBe(1);
    expect(chord.spaces.b.symmetricWith).toEqual(['d']);
  });

  it('anel depois de uma passagem única: o anel é distribuído, mas os espaços não são distribuídos em relação à raiz', () => {
    // r — a ; triângulo a, b, c
    const d = run(topo([['r', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'a']]));
    const rel = (x: string, y: string) => d.links.find(l => [l.a, l.b].sort().join() === [x, y].sort().join())!;
    expect(rel('r', 'a')).toMatchObject({ symmetric: false, distributed: false });
    expect(rel('a', 'b')).toMatchObject({ symmetric: false, distributed: true });
    expect(rel('b', 'c')).toMatchObject({ symmetric: true, distributed: true }); // ambos na profundidade 2
    expect([d.spaces.a.distributed, d.spaces.b.distributed, d.spaces.c.distributed]).toEqual([false, false, false]);
    expect(d.spaces.b.symmetricWith).toEqual(['c']);
  });

  it('raiz dentro do anel: os espaços do anel são distribuídos em relação a ela', () => {
    const d = run(topo([['r', 'a'], ['a', 'b'], ['b', 'r'], ['b', 'x']]));
    expect([d.spaces.a.distributed, d.spaces.b.distributed, d.spaces.x.distributed]).toEqual([true, true, false]);
  });

  it('inalcançáveis ficam fora das contagens', () => {
    const d = run(topo([['a', 'b'], ['c', 'd']]));
    expect(d.L).toBe(1);
    expect(d.spaces.c).toMatchObject({ depth: null, distributed: null });
  });

  it('leitura muda com a estrutura: grade bem conectada é distribuída e mista/simétrica', () => {
    // grade 3×2 a partir de um canto, com diagonais de mesmo nível
    const d = run(topo([['a', 'b'], ['b', 'c'], ['d', 'e'], ['e', 'f'], ['a', 'd'], ['b', 'e'], ['c', 'f'], ['b', 'd'], ['c', 'e']]));
    expect(codes(d)).toContain('distributed');
    expect(codes(d)).not.toContain('asymmetric');
    expect(codes(d)).toContain('typesChoice');
  });
});
