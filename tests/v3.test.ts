import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { analyse, layerEdges, layerInput, migrateModel, migrateModelWithReport, ModelError } from '../src/engine';
import { topo, VALIDATED } from './fixtures';

const dir = fileURLToPath(new URL('../public/schema/', import.meta.url));
const read = (rel: string) => JSON.parse(readFileSync(dir + rel, 'utf-8'));
const schema = read('v3.json');
const examples = readdirSync(dir + 'examples').filter(f => f.endsWith('.json'));
const casa = () => read('examples/casa_vernacular.json');
const pairSet = (pairs: [string, string][]) => new Set(pairs.map(([a, b]) => [a, b].sort().join('-')));

describe('migração v2 → v3: análise idêntica na camada acesso', () => {
  const cases = {
    validado: VALIDATED,
    theta: topo([['u', 'a'], ['a', 'v'], ['u', 'b'], ['b', 'v'], ['u', 'c'], ['c', 'v']]),
    ciclo6: topo([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']]),
    completoK4: topo([['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']]),
    desconexo: topo([['a', 'b'], ['c', 'd']], ['z']),
  };
  it.each(Object.keys(cases))('%s', name => {
    const v2 = cases[name as keyof typeof cases];
    const v3 = migrateModel(structuredClone(v2));
    expect(v3.edges.every(e => e.kind === 'acesso')).toBe(true);
    for (const radius of [0, 2]) {
      const before = analyse(v2, { radius }), after = analyse(layerInput(v3, 'acesso'), { radius });
      expect(after.per).toEqual(before.per);
      expect([after.Hs, after.intelligibility, after.circuit]).toEqual([before.Hs, before.intelligibility, before.circuit]);
    }
  });

  it('o exemplo migrado_v2.json é exatamente a migração do modelo validado', () => {
    expect(migrateModel(structuredClone(VALIDATED))).toEqual(read('examples/migrado_v2.json'));
  });
});

describe('layerEdges na casa vernacular (4 categorias, exterior com faces)', () => {
  const m = migrateModel(casa());

  it('acesso = {acesso, aberto}', () => {
    expect(pairSet(layerEdges(m, 'acesso'))).toEqual(new Set(['c1-ext', 'ext-v1', 'q1-s1', 'q2-s1', 's1-v1', 'c1-v1']));
  });

  it('visual = {vista, acesso, aberto}; as faces de um mesmo cômodo viram uma só ligação', () => {
    const v = layerEdges(m, 'visual');
    expect(v).toHaveLength(10);
    expect(v.filter(([a, b]) => [a, b].includes('q1') && [a, b].includes('ext'))).toHaveLength(1);
    expect(pairSet(v).has('ext-q2')).toBe(true); // q2 tem vista ao N (e parede cega a L)
  });

  it('visual sem porta: a regra doorIsVisual fica num só lugar', () => {
    expect(pairSet(layerEdges(m, 'visual', { doorIsVisual: false }))).toEqual(new Set(['ext-q1', 'ext-q2', 'ext-s1', 'ext-v1', 'c1-s1', 'c1-v1']));
  });

  it('adjacência = todo par que se toca', () => {
    expect(layerEdges(m, 'adjacencia')).toHaveLength(12);
  });

  it('as camadas mudam a análise: a sala é mais integrada no acesso que a cozinha', () => {
    const R = analyse(layerInput(m, 'acesso'));
    expect(R.per.s1.integ!).toBeGreaterThan(R.per.q1.integ!);
    expect(R.k).toBe(6);
  });
});

describe('validação v3', () => {
  const base = () => casa();

  it('a casa vernacular passa sem avisos e o exterior vira a raiz', () => {
    const c = base(); delete c.root;
    const r = migrateModelWithReport(c);
    expect(r.warnings).toEqual([]);
    expect(r.model.root).toBe('ext');
    expect(r.model.nodes[0].exterior).toBe(true);
  });

  it('cômodo de canto: duas ligações com o exterior, uma por face', () => {
    const m = migrateModel(base());
    expect(m.edges.filter(e => e.b === 'q1' && e.a === 'ext').map(e => e.face)).toEqual(['N', 'O']);
  });

  it.each([
    ['categoria inválida', (c: any) => { c.edges[0].kind = 'janela'; }, /Categoria de ligação inválida/],
    ['ligação sem categoria', (c: any) => { delete c.edges[0].kind; }, /sem categoria/],
    ['face inválida', (c: any) => { c.edges[0].face = 'NE'; }, /Face inválida/],
    ['face em ligação interior', (c: any) => { c.edges[9].face = 'N'; }, /não toca o exterior/],
    ['dois exteriores', (c: any) => { c.nodes[1].exterior = true; }, /Mais de um espaço exterior/],
  ])('rejeita: %s', (_name, mutate, msg) => {
    const c = base();
    mutate(c);
    expect(() => migrateModel(c)).toThrow(ModelError);
    expect(() => migrateModel(c)).toThrow(msg);
  });

  it('avisa (sem bloquear): exterior sem face, repetição conflitante, conjunto desconhecido', () => {
    const c = base();
    c.edges.push({ a: 'c1', b: 'ext', kind: 'vista' }); // sem face
    c.edges.push({ a: 'q2', b: 'q1', kind: 'vista' }); // mesmo par de q1–q2 (opaco), outra categoria
    c.edges.push({ a: 'q1', b: 'ext', kind: 'vista', face: 'N' }); // repetição idêntica: ignorada sem aviso
    c.meta.conjunto = 'teste';
    const r = migrateModelWithReport(c);
    expect(r.warnings.join(' ')).toMatch(/sem face/);
    expect(r.warnings.join(' ')).toMatch(/outra categoria/);
    expect(r.warnings.join(' ')).toMatch(/Conjunto desconhecido/);
    expect(r.warnings).toHaveLength(3);
    expect(r.model.edges.find(e => [e.a, e.b].sort().join() === 'q1,q2')!.kind).toBe('opaco');
    expect(r.model.meta!.conjunto).toBeUndefined();
  });

  it('geo e meta: limpa valores inválidos e normaliza o norte', () => {
    const c = base();
    c.geo = { norte_graus: -90, escala_m_por_unidade: -1, modulo_m: 1.2 };
    const m = migrateModel(c);
    expect(m.geo).toEqual({ norte_graus: 270, modulo_m: 1.2 });
  });

  it('ida e volta: exportar e reimportar devolve o mesmo modelo', () => {
    const m = migrateModel(base());
    expect(migrateModel(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
});

describe('JSON Schema público (fonte única para o app e o Python)', () => {
  const validate = new Ajv({ allErrors: true }).compile(schema);

  it.each(examples)('exemplo %s passa no JSON Schema e no validador do app', file => {
    const ex = read('examples/' + file);
    expect(validate(ex), JSON.stringify(validate.errors)).toBe(true);
    const r = migrateModelWithReport(ex);
    expect(r.warnings).toEqual([]);
    expect(r.model).toEqual(ex); // o exemplo já está na forma normalizada
  });

  it('o que o app exporta passa no JSON Schema', () => {
    expect(validate(migrateModel(structuredClone(VALIDATED)))).toBe(true);
    expect(validate(migrateModel(casa()))).toBe(true);
  });

  it('o JSON Schema também recusa categoria inválida e campo desconhecido', () => {
    const c = casa(); c.edges[0].kind = 'janela';
    expect(validate(c)).toBe(false);
    const d = casa(); d.nodes[0].cor = 'azul';
    expect(validate(d)).toBe(false);
  });
});

describe('orientação (faces) — F4.2', () => {
  it('faces por espaço, aberturas e entradas na casa vernacular', async () => {
    const { orientation } = await import('../src/engine');
    const o = orientation(migrateModel(casa()));
    expect(o.perSpace.q1.faces).toEqual({ N: 'vista', O: 'vista' });
    expect(o.perSpace.q2.opensTo).toEqual(['N']); // a face L é parede cega
    expect(o.perSpace.v1.accessFaces).toEqual(['S', 'L', 'O']);
    expect(o.perSpace.c1.accessFaces).toEqual(['L']);
    expect(o.perSpace.ext).toBeUndefined();
    expect(o.byFace.N).toEqual({ opaco: 0, vista: 2, acesso: 0, aberto: 0 });
    expect(o.byFace.L).toEqual({ opaco: 1, vista: 0, acesso: 1, aberto: 1 });
    expect(o.byFace.O).toEqual({ opaco: 0, vista: 2, acesso: 0, aberto: 1 });
    expect(o.noFace).toBe(0);
  });

  it('sem exterior marcado não há orientação; exterior sem face é contado', async () => {
    const { orientation } = await import('../src/engine');
    expect(orientation(migrateModel(structuredClone(VALIDATED))).perSpace).toEqual({});
    const c = casa(); delete c.edges[0].face; delete c.edges[1].face; c.edges.splice(1, 1);
    expect(orientation(migrateModel(c)).noFace).toBe(1);
  });

  it('a camada muda a análise: visual tem mais ligações que acesso e outra integração', () => {
    const m = migrateModel(casa());
    const acc = analyse(layerInput(m, 'acesso')), vis = analyse(layerInput(m, 'visual'));
    expect(acc.L).toBe(6);
    expect(vis.L).toBe(10);
    expect(vis.per.q1.integ).not.toBeCloseTo(acc.per.q1.integ!, 3);
  });
});
