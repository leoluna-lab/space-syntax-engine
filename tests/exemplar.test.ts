import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { exemplarChecklist, exemplarFileName, manifestCSV, manifestRow, migrateModel, MANIFEST_COLUMNS } from '../src/engine';
import { VALIDATED } from './fixtures';

const read = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL('../public/schema/' + rel, import.meta.url)), 'utf-8'));
const casa = () => migrateModel(read('examples/casa_vernacular.json'));

describe('exemplarChecklist', () => {
  it('casa vernacular: nada importante faltando', () => {
    const c = exemplarChecklist(casa());
    expect(c.filter(i => i.level === 'importante')).toEqual([]);
    expect(c.map(i => i.code)).toEqual([]); // fonte, codificador, escala, norte e funções preenchidos
  });

  it('modelo validado (sem pesquisa): aponta o que falta', () => {
    const codes = exemplarChecklist(migrateModel(structuredClone(VALIDATED))).map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(['noExemplarId', 'noConjunto', 'noExterior', 'noCodificador', 'noFonte', 'noScale', 'noNorth', 'unlabelled', 'noPoly']));
    expect(codes).not.toContain('extNoFace');
  });

  it('ligação com o exterior sem face e espaço isolado são contados', () => {
    const m = casa();
    m.edges.push({ a: 'ext', b: 's1', kind: 'acesso' });
    m.nodes.push({ id: 'z', name: 'Esquecido', x: 0, y: 0, label: 'depósito' });
    const c = exemplarChecklist(m);
    expect(c).toContainEqual({ code: 'extNoFace', level: 'importante', n: 1 });
    expect(c).toContainEqual({ code: 'noPoly', level: 'aviso', n: 1 });
    expect(c).toContainEqual({ code: 'disconnected', level: 'aviso', n: 1 });
  });
});

describe('manifesto', () => {
  it('linha da casa vernacular: espaços interiores e ligações por categoria', () => {
    expect(manifestRow(casa())).toEqual({
      exemplar_id: 'exemplo01', conjunto: 'sintetico', fonte: 'Exemplo fictício para testar o schema', local: '', data: '',
      codificador: 'space-syntax-engine', n_espacos: 5, n_opaco: 3, n_vista: 5, n_acesso: 4, n_aberto: 4,
    });
  });

  it('CSV com cabeçalho fixo e campos com vírgula/aspas escapados', () => {
    const m = casa();
    m.meta = { ...m.meta, fonte: 'Arquivo "A", caixa 3' };
    const csv = manifestCSV([m, migrateModel(structuredClone(VALIDATED))]).trim().split('\n');
    expect(csv[0]).toBe(MANIFEST_COLUMNS.join(','));
    expect(csv[0]).toBe('exemplar_id,conjunto,fonte,local,data,codificador,n_espacos,n_opaco,n_vista,n_acesso,n_aberto');
    expect(csv[1]).toContain('"Arquivo ""A"", caixa 3"');
    expect(csv[2]).toBe(',,,,,,10,0,0,9,0');
  });

  it('nome de arquivo seguro', () => {
    expect(exemplarFileName({ meta: { exemplar_id: 'Casa Ç/01 — Aquiraz' } }, 'x')).toBe('Casa_C_01_Aquiraz');
    expect(exemplarFileName({}, 'Cenário 2')).toBe('Cenario_2');
    expect(exemplarFileName({}, '')).toBe('exemplar');
  });

  it('o exemplar exportado (modelo normalizado) passa no JSON Schema público', () => {
    const validate = new Ajv().compile(read('v3.json'));
    const m = casa();
    m.meta = { ...m.meta, local: 'Aquiraz, CE', data: '1950', notas: 'Teste de exportação' };
    m.geo = { ...m.geo, modulo_m: 1.1 };
    expect(validate(JSON.parse(JSON.stringify(m))), JSON.stringify(validate.errors)).toBe(true);
  });
});
