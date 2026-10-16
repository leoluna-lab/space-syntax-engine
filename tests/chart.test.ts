import { describe, expect, it } from 'vitest';
import { analyse, pearson } from '../src/engine';
import { groupCoincident, linearFit, niceTicks } from '../src/util/chart';
import { VALIDATED } from './fixtures';

describe('niceTicks', () => {
  it('cobre o intervalo com passos redondos', () => {
    expect(niceTicks(0.524, 2.2)).toEqual([0.5, 1, 1.5, 2, 2.5]);
    expect(niceTicks(0, 29)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('intervalo degenerado e ruído de ponto flutuante', () => {
    const t = niceTicks(3, 3);
    expect(t[0]).toBeLessThan(3);
    expect(t.at(-1)).toBeGreaterThan(3);
    expect(niceTicks(0.1, 0.7)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });
});

describe('linearFit', () => {
  it('reta exata', () => {
    const f = linearFit([0, 1, 2, 3], [1, 3, 5, 7])!;
    expect(f.a).toBeCloseTo(1, 12); expect(f.b).toBeCloseTo(2, 12); expect(f.r).toBeCloseTo(1, 12);
  });
  it('sem variação → null', () => {
    expect(linearFit([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(linearFit([1], [1])).toBeNull();
  });
  it('conectividade × integração do modelo validado: r² = inteligibilidade do motor', () => {
    const R = analyse(VALIDATED);
    const ids = R.ids.filter(id => R.per[id].integ != null);
    const xs = ids.map(id => R.per[id].conn), ys = ids.map(id => R.per[id].integ!);
    const f = linearFit(xs, ys)!;
    expect(f.r).toBeCloseTo(pearson(xs, ys)!, 12);
    expect(f.r * f.r).toBeCloseTo(R.intelligibility!, 12);
  });
});

describe('groupCoincident', () => {
  it('junta pontos com as mesmas coordenadas', () => {
    const g = groupCoincident([{ x: 1, y: 0.846, id: 'X' }, { x: 2, y: 1, id: 'I' }, { x: 1, y: 0.846, id: 'B' }]);
    expect(g.map(grp => grp.map(p => p.id))).toEqual([['X', 'B'], ['I']]);
  });
});

import { categoryColors, CATEGORICAL, toCSV } from '../src/util/chart';

describe('categoryColors', () => {
  it('ordem fixa de aparição; excedentes e vazios viram "outros"', () => {
    const { color, others } = categoryColors(['estar', 'quarto', 'estar', null, 'cozinha'], 2);
    expect([...color]).toEqual([['estar', CATEGORICAL[0]], ['quarto', CATEGORICAL[1]]]);
    expect(others).toBe(true);
  });
  it('sem excedentes nem vazios, sem "outros"', () => {
    expect(categoryColors(['a', 'b']).others).toBe(false);
  });
});

describe('toCSV', () => {
  it('escapa vírgulas, aspas e quebras', () => {
    expect(toCSV([['a', 'b,c'], ['d"e', 'f\ng']])).toBe('a,"b,c"\n"d""e","f\ng"\n');
  });
});
