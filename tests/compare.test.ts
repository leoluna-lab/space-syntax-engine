import { describe, expect, it } from 'vitest';
import { analyse, differenceFactor, functionalSummary, matchSpaces, migrateProject, ModelError, newScenarioId, normName, ranks } from '../src/engine';
import { VALIDATED } from './fixtures';

const labelled = () => {
  const m = structuredClone(VALIDATED);
  const L: Record<string, string> = { X: 'exterior', E: 'corredor', B: 'quarto', C: 'quarto', D: 'estar', I: 'estar', F: 'estar', A: 'serviço', G: 'serviço', H: 'serviço' };
  m.nodes.forEach(n => { (n as { label?: string }).label = L[n.id]; });
  return m;
};

describe('migrateProject', () => {
  it('modelo solto (dados antigos) vira projeto de um cenário', () => {
    const p = migrateProject(structuredClone(VALIDATED), 'Planta');
    expect(p.scenarios).toHaveLength(1);
    expect(p.scenarios[0]).toMatchObject({ id: 's1', name: 'Planta', family: 's1' });
    expect(p.activeId).toBe('s1');
    expect(p.scenarios[0].model.schema).toBe(2);
  });

  it('projeto válido é preservado e idempotente', () => {
    const p = migrateProject({
      scenarios: [
        { id: 'a', name: 'Original', model: VALIDATED },
        { id: 'b', name: 'Sem corredor', family: 'a', model: { nodes: [{ id: 'X' }], edges: [] } },
      ],
      activeId: 'b',
    });
    expect(p.activeId).toBe('b');
    expect(p.scenarios[1].family).toBe('a');
    expect(p.scenarios[0].family).toBe('a');
    expect(migrateProject(p)).toEqual(p);
  });

  it('activeId inválido cai no primeiro cenário', () => {
    expect(migrateProject({ scenarios: [{ id: 'a', model: VALIDATED }], activeId: 'zz' }).activeId).toBe('a');
  });

  it.each([
    [{ scenarios: [] }, /não tem cenários/],
    [{ scenarios: [{ id: 'a', model: VALIDATED }, { id: 'a', model: VALIDATED }] }, /repetido/],
    [{ scenarios: [{ id: 'a', name: 'Ruim', model: { nodes: 3 } }] }, /Ruim/],
    [{ schema: 9, scenarios: [{ model: VALIDATED }] }, /mais nova/],
  ])('rejeita projeto inválido %#', (input, msg) => {
    expect(() => migrateProject(input)).toThrow(ModelError);
    expect(() => migrateProject(input)).toThrow(msg);
  });

  it('newScenarioId não colide', () => {
    expect(newScenarioId(['s1', 's2', 's4'])).toBe('s3');
  });
});

describe('matchSpaces', () => {
  it('mesma família: casa pelo id, mesmo com o espaço renomeado', () => {
    const a = structuredClone(VALIDATED), b = structuredClone(VALIDATED);
    b.nodes[1].name = 'Hall';
    b.nodes = b.nodes.filter(n => n.id !== 'H');
    b.nodes.push({ id: 'K', name: 'Varanda', x: 0, y: 0 });
    const r = matchSpaces(a, b, true);
    expect(r.pairs).toHaveLength(9);
    expect(r.pairs.every(p => p.by === 'id' && p.a === p.b)).toBe(true);
    expect(r.onlyA).toEqual(['H']);
    expect(r.onlyB).toEqual(['K']);
  });

  it('projetos diferentes: casa por nome (sem acento/maiúscula) e por rótulo único; ignora nomes automáticos e ids', () => {
    const a = { nodes: [
      { id: 'A', name: 'Sala de Estar', x: 0, y: 0 }, { id: 'B', name: 'Espaço 2', x: 0, y: 0, label: 'cozinha' },
      { id: 'C', name: 'Quarto', x: 0, y: 0 }, { id: 'D', name: 'Quarto', x: 0, y: 0 },
    ] };
    const b = { nodes: [
      { id: 'A', name: 'Cozinha nova', x: 0, y: 0, label: 'Cozinha' }, { id: 'Q', name: 'sala de estar', x: 0, y: 0 },
      { id: 'B', name: 'Espaço 2', x: 0, y: 0 }, { id: 'R', name: 'Quarto', x: 0, y: 0 },
    ] };
    const r = matchSpaces(a, b, false);
    expect(r.pairs).toContainEqual({ a: 'A', b: 'Q', by: 'name' });
    expect(r.pairs).toContainEqual({ a: 'B', b: 'A', by: 'label' });
    expect(r.pairs).toHaveLength(2); // "Quarto" é ambíguo em A; "Espaço 2" é automático
    expect(r.onlyA.sort()).toEqual(['C', 'D']);
    expect(r.onlyB.sort()).toEqual(['B', 'R']);
  });

  it('normName remove acentos e normaliza espaços', () => {
    expect(normName('  Área  de   SERVIÇO ')).toBe('area de servico');
  });
});

describe('functionalSummary (genótipo)', () => {
  const m = labelled();
  const R = analyse(m);
  const F = functionalSummary(m, R);

  it('agrupa por rótulo e calcula médias', () => {
    const estar = F.stats.find(s => s.label === 'estar')!;
    expect(estar.ids.sort()).toEqual(['D', 'F', 'I']);
    expect(estar.meanInteg).toBeCloseTo((R.per.D.integ! + R.per.I.integ! + R.per.F.integ!) / 3, 12);
    expect(estar.meanDepth).toBeCloseTo((2 + 2 + 3) / 3, 12);
  });

  it('desigualdade ordenada por integração, com "=" para empates', () => {
    expect(F.inequality).toBe('corredor > estar > exterior = quarto > serviço');
  });

  it('H* sobre o RA médio de cada função', () => {
    const mean = (ids: string[]) => ids.reduce((s, id) => s + R.per[id].ra!, 0) / ids.length;
    const expected = differenceFactor([R.per.X.ra!, R.per.E.ra!, mean(['B', 'C']), mean(['D', 'I', 'F']), mean(['A', 'G', 'H'])])!.Hs;
    expect(F.Hs).toBeCloseTo(expected, 12);
  });

  it('sem rótulos: resumo vazio', () => {
    const G = functionalSummary(VALIDATED, analyse(VALIDATED));
    expect(G.stats).toEqual([]);
    expect(G.inequality).toBe('');
    expect(G.Hs).toBeNull();
  });
});

describe('ranks', () => {
  it('posição por integração com empates', () => {
    const R = analyse(VALIDATED);
    const r = ranks(R, 'integ');
    expect(r.E).toBe(1);
    expect(r.D).toBe(2);
    expect(r.I).toBe(3);
    expect([r.X, r.B, r.C, r.F]).toEqual([4, 4, 4, 4]);
    expect(r.H).toBe(10);
  });
});
