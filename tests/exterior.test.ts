import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exteriorPieces, faceOf, outwardBearing, suggestFaces } from '../src/geometry/exterior';
import type { Pt } from '../src/geometry/snap';

const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const rect = (id: string, x0: number, y0: number, x1: number, y1: number) =>
  ({ id, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Pt[] });

describe('faceOf (setores de 90° a partir do norte)', () => {
  it('norte para cima', () => {
    expect([0, 44, 46, 90, 134, 180, 224, 270, 316].map(b => faceOf(b))).toEqual(['N', 'N', 'L', 'L', 'L', 'S', 'S', 'O', 'N']);
  });
  it('norte para a direita: o "para cima" da tela vira oeste', () => {
    expect(faceOf(0, 90)).toBe('O');
    expect(faceOf(90, 90)).toBe('N');
    expect(faceOf(180, 90)).toBe('L');
  });
});

describe('outwardBearing (tela com y para baixo)', () => {
  it('quadrado: cima 0°, direita 90°, baixo 180°, esquerda 270°, nos dois sentidos de desenho', () => {
    expect(outwardBearing(sq[0], sq[1], sq)).toBeCloseTo(0, 9);
    expect(outwardBearing(sq[1], sq[2], sq)).toBeCloseTo(90, 9);
    expect(outwardBearing(sq[2], sq[3], sq)).toBeCloseTo(180, 9);
    expect(outwardBearing(sq[3], sq[0], sq)).toBeCloseTo(270, 9);
    const rev = [...sq].reverse();
    expect(outwardBearing(rev[0], rev[1], rev)).toBeCloseTo(180, 9); // (0,10)→(10,10) = lado de baixo, desenhado ao contrário
  });
});

describe('exteriorPieces / suggestFaces', () => {
  it('casa vernacular do schema: as faces sugeridas são as mesmas do exemplo', () => {
    const casa = JSON.parse(readFileSync(fileURLToPath(new URL('../public/schema/examples/casa_vernacular.json', import.meta.url)), 'utf-8'));
    const polys = casa.nodes.filter((n: { poly?: Pt[] }) => n.poly).map((n: { id: string; poly: Pt[] }) => ({ id: n.id, poly: n.poly }));
    const sugg = suggestFaces(exteriorPieces(polys, 0, 15, 30)).map(s => `${s.id}:${s.face}`);
    const expected = casa.edges.filter((e: { face?: string }) => e.face).map((e: { b: string; face: string }) => `${e.b}:${e.face}`);
    expect(sugg.sort()).toEqual(expected.sort());
  });

  it('parede parcialmente coberta: só o trecho livre conta', () => {
    const p = exteriorPieces([rect('A', 0, 100, 200, 200), rect('B', 0, 0, 100, 100)], 0, 5, 10);
    const aTop = p.filter(x => x.id === 'A' && x.face === 'N');
    expect(aTop).toHaveLength(1);
    expect(aTop[0].length).toBeCloseTo(100, 9);
    expect(aTop[0].seg[0][0]).toBeCloseTo(100, 9);
  });

  it('fresta dentro da tolerância conta como encostado; trechos curtos são ignorados', () => {
    const p = exteriorPieces([rect('A', 0, 0, 100, 100), rect('B', 103, 0, 200, 100)], 0, 5, 10);
    expect(p.some(x => x.id === 'A' && x.face === 'L')).toBe(false);
    const q = exteriorPieces([rect('A', 0, 0, 100, 100), rect('B', 0, 100, 95, 200)], 0, 5, 10);
    expect(q.some(x => x.id === 'A' && x.face === 'S')).toBe(false); // sobra de 5 < 10
  });

  it('norte girado muda as faces', () => {
    const s = suggestFaces(exteriorPieces([rect('A', 0, 0, 100, 100)], 90, 5, 10));
    expect(s.map(x => x.face)).toEqual(['N', 'L', 'S', 'O']);
    expect(s.find(x => x.face === 'N')!.segs[0]).toEqual([[100, 0], [100, 100]]); // lado direito aponta para o norte
  });
});
