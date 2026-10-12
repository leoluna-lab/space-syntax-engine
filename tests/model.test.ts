import { describe, expect, it } from 'vitest';
import { migrateModel, ModelError, SCHEMA_VERSION } from '../src/engine';
import { escapeHtml } from '../src/util/html';
import { VALIDATED } from './fixtures';

describe('migrateModel (esquema v1 → v2)', () => {
  it('modelo v1 (sem "schema") vira v2 sem perder dados', () => {
    const m = migrateModel(structuredClone(VALIDATED));
    expect(m.schema).toBe(SCHEMA_VERSION);
    expect(m.nodes).toHaveLength(10);
    expect(m.edges).toHaveLength(9);
    expect(m.root).toBe('X');
    expect(m.nodes[0]).toEqual({ id: 'X', name: 'Exterior (carrier)', x: 90, y: 235 });
  });

  it('é idempotente', () => {
    const m = migrateModel(VALIDATED);
    expect(migrateModel(m)).toEqual(m);
  });

  it('normaliza ligações: remove laços, duplicatas e ids inexistentes', () => {
    const m = migrateModel({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 1 }],
      edges: [['a', 'b'], ['b', 'a'], ['a', 'a'], ['a', 'zz'], ['b', 1], 'lixo', ['a']],
    });
    expect(m.edges).toEqual([['a', 'b'], ['b', '1']]);
    expect(m.root).toBe('a');
    expect(m.nodes[2]).toMatchObject({ id: '1', name: '1' });
  });

  it('preserva polígono e rótulo válidos, descarta inválidos', () => {
    const m = migrateModel({
      nodes: [
        { id: 'a', x: 0, y: 0, poly: [[0, 0], [10, 0], [10, 10]], label: ' sala ' },
        { id: 'b', x: 0, y: 0, poly: [[0, 0], [1, 'x'], [2, 2]] },
      ],
      edges: [],
    });
    expect(m.nodes[0].poly).toHaveLength(3);
    expect(m.nodes[0].label).toBe('sala');
    expect(m.nodes[1].poly).toBeUndefined();
  });

  it('posição ausente recebe posição em grade', () => {
    const m = migrateModel({ nodes: [{ id: 'a' }], edges: [] });
    expect(Number.isFinite(m.nodes[0].x) && Number.isFinite(m.nodes[0].y)).toBe(true);
  });

  it.each([
    [null, /objeto/],
    [[], /objeto/],
    [{ edges: [] }, /nodes/],
    [{ nodes: [] }, /edges/],
    [{ nodes: [{ id: 'a' }, { id: 'a' }], edges: [] }, /repetido/],
    [{ nodes: [{ name: 'sem id' }], edges: [] }, /id/],
    [{ schema: 99, nodes: [], edges: [] }, /mais nova/],
  ])('rejeita entrada inválida %#', (input, msg) => {
    expect(() => migrateModel(input)).toThrow(ModelError);
    expect(() => migrateModel(input)).toThrow(msg);
  });
});

describe('escapeHtml', () => {
  it('neutraliza marcação em nomes de espaços', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml("Sala & 'Cozinha'")).toBe('Sala &amp; &#39;Cozinha&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});
