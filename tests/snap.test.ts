import { describe, expect, it } from 'vitest';
import { closestOnSegment, sharedWall, snapPoint, type SnapTarget } from '../src/geometry/snap';

// dois cômodos lado a lado: A = [0..100]×[0..80], B = [100..180]×[0..80]
const targets: SnapTarget[] = [
  { owner: 'A', poly: [[0, 0], [100, 0], [100, 80], [0, 80]] },
  { owner: 'B', poly: [[100, 0], [180, 0], [180, 80], [100, 80]] },
];

describe('closestOnSegment', () => {
  it('projeta dentro do segmento e prende nas pontas', () => {
    expect(closestOnSegment([50, 10], [0, 0], [100, 0])).toMatchObject({ q: [50, 0], d: 10, t: 0.5 });
    expect(closestOnSegment([-30, 0], [0, 0], [100, 0]).q).toEqual([0, 0]);
    expect(closestOnSegment([5, 5], [3, 3], [3, 3]).q).toEqual([3, 3]); // segmento degenerado
  });
});

describe('snapPoint (ímã)', () => {
  it('perto de um canto gruda exatamente no vértice', () => {
    const r = snapPoint([103, 76], targets, 8);
    expect(r.kind).toBe('vertex');
    expect(r.p).toEqual([100, 80]);
  });

  it('vértice ganha do lado mesmo que o lado esteja mais perto', () => {
    // a 1 unidade do lado x=100 e a ~6 do vértice (100,0)
    const r = snapPoint([101, 6], targets, 8);
    expect(r.kind).toBe('vertex');
    expect(r.p).toEqual([100, 0]);
  });

  it('no meio de uma parede gruda no lado (projeção)', () => {
    const r = snapPoint([104, 40], targets, 8);
    expect(r.kind).toBe('edge');
    expect(r.p).toEqual([100, 40]);
    if (r.kind === 'edge') expect([[100, 0], [100, 80]]).toContainEqual(r.seg[0]);
  });

  it('fora do raio não gruda', () => {
    expect(snapPoint([140, 40], targets, 8)).toEqual({ kind: 'none', p: [140, 40] });
  });

  it('sem polígonos não gruda', () => {
    expect(snapPoint([1, 1], [], 50).kind).toBe('none');
  });
});

describe('parede compartilhada', () => {
  it('devolve o lado invertido, como o percorreria o vizinho', () => {
    expect(sharedWall([[100, 0], [100, 80]])).toEqual([[100, 80], [100, 0]]);
  });

  it('um polígono desenhado a partir da parede compartilhada encosta exatamente no vizinho', () => {
    const wall = sharedWall([[100, 0], [100, 80]]); // lado direito de A
    const C = [...wall, [40, 0]]; // triângulo à esquerda, dentro de A só para o teste geométrico
    expect(C[0]).toEqual([100, 80]);
    expect(C[1]).toEqual([100, 0]);
  });
});
