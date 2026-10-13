/**
 * Projeto = conjunto de cenários (variações de uma planta ou plantas diferentes).
 * Cada cenário tem seu modelo convexo. `family` liga cenários derivados uns dos outros
 * (duplicados): dentro da mesma família os ids dos espaços correspondem.
 */
import { migrateModel, ModelError, SCHEMA_VERSION, type Model } from './model';

export interface Scenario {
  id: string;
  name: string;
  family: string;
  model: Model;
}

export interface Project {
  schema: typeof SCHEMA_VERSION;
  name: string;
  scenarios: Scenario[];
  activeId: string;
}

export const MAX_SCENARIOS = 24;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Novo id de cenário que não colide com os existentes. */
export function newScenarioId(existing: Iterable<string>): string {
  const used = new Set(existing);
  let n = 1;
  while (used.has('s' + n)) n++;
  return 's' + n;
}

/**
 * Valida e normaliza um projeto. Aceita também um modelo solto (v1/v2), que vira
 * um projeto de um cenário — é assim que dados antigos são migrados.
 */
export function migrateProject(input: unknown, fallbackScenarioName = 'Cenário 1'): Project {
  if (!isObj(input)) throw new ModelError('O projeto deve ser um objeto JSON.');
  if (!('scenarios' in input)) {
    const model = migrateModel(input);
    return { schema: SCHEMA_VERSION, name: '', scenarios: [{ id: 's1', name: fallbackScenarioName, family: 's1', model }], activeId: 's1' };
  }
  if (typeof input.schema === 'number' && input.schema > SCHEMA_VERSION) {
    throw new ModelError(`Projeto criado por uma versão mais nova (schema ${input.schema}). Atualize o aplicativo.`);
  }
  if (!Array.isArray(input.scenarios) || !input.scenarios.length) throw new ModelError('O projeto não tem cenários.');
  if (input.scenarios.length > MAX_SCENARIOS) throw new ModelError(`Cenários demais (máx. ${MAX_SCENARIOS}).`);
  const seen = new Set<string>();
  const scenarios: Scenario[] = input.scenarios.map((raw, i) => {
    if (!isObj(raw)) throw new ModelError(`Cenário #${i + 1} inválido.`);
    const id = text(raw.id, 40) ?? newScenarioId(seen);
    if (seen.has(id)) throw new ModelError(`Id de cenário repetido: "${id}".`);
    seen.add(id);
    let model: Model;
    try { model = migrateModel(raw.model); } catch (e) {
      throw new ModelError(`Cenário "${text(raw.name, 80) ?? id}": ${(e as Error).message}`);
    }
    return { id, name: text(raw.name, 80) ?? `Cenário ${i + 1}`, family: text(raw.family, 40) ?? id, model };
  });
  const active = text(input.activeId, 40);
  return {
    schema: SCHEMA_VERSION,
    name: text(input.name, 120) ?? '',
    scenarios,
    activeId: active && seen.has(active) ? active : scenarios[0].id,
  };
}
