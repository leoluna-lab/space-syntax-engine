import { describe, expect, it } from 'vitest';
import { classifyPair, clipConvex, closeGaps, detectAdjacency, minWidth, signedArea, type PolyIn } from '../src/geometry/adjacency';

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): PolyIn =>
  ({ id, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
const opts = { tol: 8, minContact: 20 };

describe('geometria de apoio', () => {
  it('área com sinal e interseção de convexos', () => {
    expect(Math.abs(signedArea(rect('a', 0, 0, 10, 5).poly))).toBe(50);
    const inter = clipConvex(rect('a', 0, 0, 10, 10).poly, rect('b', 5, 5, 15, 15).poly);
    expect(Math.abs(signedArea(inter))).toBeCloseTo(25, 9);
    expect(clipConvex(rect('a', 0, 0, 1, 1).poly, rect('b', 5, 5, 6, 6).poly)).toEqual([]);
  });

  it('largura mínima', () => {
    expect(minWidth(rect('a', 0, 0, 200, 3).poly)).toBeCloseTo(3, 9);
    expect(minWidth([[0, 0], [10, 0], [0, 10]])).toBeCloseTo(Math.SQRT2 * 5, 9);
  });
});

describe('classifyPair', () => {
  const A = rect('A', 0, 0, 100, 80);

  it('parede exata → certa', () => {
    const c = classifyPair(A, rect('B', 100, 0, 180, 80), opts)!;
    expect(c).toMatchObject({ confidence: 'certa', reason: 'exato' });
    expect(c.contact).toBeCloseTo(80, 9);
    expect(c.gap).toBeCloseTo(0, 9);
  });

  it('fresta de 3 com tolerância 8 → provável', () => {
    const c = classifyPair(A, rect('B', 103, 0, 180, 80), opts)!;
    expect(c).toMatchObject({ confidence: 'provavel', reason: 'fresta' });
    expect(c.gap).toBeCloseTo(3, 9);
  });

  it('parede levemente torta (desenho à mão) ainda conta', () => {
    const B: PolyIn = { id: 'B', poly: [[102, 0], [180, 0], [180, 80], [99, 80]] };
    expect(classifyPair(A, B, opts)!.confidence).toBe('provavel');
  });

  it('fresta de 12 (entre 1× e 2× a tolerância) → duvidosa, fresta larga', () => {
    expect(classifyPair(A, rect('B', 112, 0, 180, 80), opts)).toMatchObject({ confidence: 'duvidosa', reason: 'fresta-larga' });
  });

  it('contato curto (10 < 20) → duvidosa', () => {
    expect(classifyPair(A, rect('B', 100, 70, 180, 150), opts)).toMatchObject({ confidence: 'duvidosa', reason: 'contato-curto' });
  });

  it('só a quina encostando → não é vizinhança', () => {
    expect(classifyPair(A, rect('B', 100, 80, 180, 160), opts)).toBeNull();
  });

  it('polígonos que se invadem → duvidosa, sobreposição', () => {
    expect(classifyPair(A, rect('B', 85, 0, 180, 80), opts)).toMatchObject({ confidence: 'duvidosa', reason: 'sobreposicao' });
  });

  it('invasão de canto (quadrado 20×20, mais largo que a tolerância) → sobreposição, não fresta', () => {
    const c = classifyPair(rect('banho', 210, 160, 400, 300), rect('dep', 380, 280, 460, 380), { tol: 15, minContact: 30 })!;
    expect(c).toMatchObject({ confidence: 'duvidosa', reason: 'sobreposicao' });
    expect(c.overlapDepth).toBeCloseTo(20, 9);
  });

  it('lasca longa e fina (desenho 3 por cima ao longo da parede) não é sobreposição', () => {
    expect(classifyPair(A, rect('B', 97, -2, 180, 82), opts)!.reason).toBe('fresta');
  });

  it('invasão pequena (dentro da tolerância) continua provável', () => {
    expect(classifyPair(A, rect('B', 97, 0, 180, 80), opts)!.confidence).toBe('provavel');
  });

  it('longe → null', () => {
    expect(classifyPair(A, rect('B', 300, 0, 380, 80), opts)).toBeNull();
  });
});

describe('detectAdjacency', () => {
  it('parede longa em T: os dois cômodos de baixo são vizinhos do de cima; ordem por confiança', () => {
    const polys = [rect('cima', 0, 0, 200, 80), rect('esq', 0, 80, 100, 160), rect('dir', 104, 80, 200, 160)];
    const c = detectAdjacency(polys, opts);
    const pairs = c.map(x => `${x.a}-${x.b}:${x.confidence}`);
    expect(pairs).toContain('cima-esq:certa');
    expect(pairs).toContain('cima-dir:certa');
    expect(pairs).toContain('esq-dir:provavel');
    expect(c[0].confidence).toBe('certa');
    expect(c.at(-1)!.confidence).toBe('provavel');
  });
});

describe('closeGaps (fechar frestas)', () => {
  it('fresta de 3 vira parede exata e o par passa a "certa"', () => {
    const polys = [rect('A', 0, 0, 100, 80), rect('B', 103, 0, 180, 80)];
    const { polys: fixed, moved } = closeGaps(polys, new Set(['A', 'B']), 8);
    expect(moved).toBe(4);
    expect(classifyPair(fixed[0], fixed[1], opts)!.confidence).toBe('certa');
  });

  it('junção em T: vértice perto do meio de um lado é encostado nele', () => {
    const polys = [rect('cima', 0, 0, 200, 80), rect('baixo', 50, 84, 150, 160)];
    const { polys: fixed } = closeGaps(polys, new Set(['cima', 'baixo']), 8);
    expect(fixed[1].poly[0]).toEqual([50, 80]);
    expect(fixed[1].poly[1]).toEqual([150, 80]);
    expect(classifyPair(fixed[0], fixed[1], opts)!.confidence).toBe('certa');
  });

  it('só mexe nos polígonos escolhidos e não muda o que está longe', () => {
    const polys = [rect('A', 0, 0, 100, 80), rect('B', 103, 0, 180, 80), rect('C', 400, 0, 480, 80)];
    const { polys: fixed } = closeGaps(polys, new Set(['A']), 8);
    expect(fixed).toEqual(polys);
  });
});
