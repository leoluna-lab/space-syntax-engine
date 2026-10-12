import type { Model } from '../src/engine';

type Lite = Pick<Model, 'nodes' | 'edges' | 'root'>;

/** Modelo validado de 10 nós (mesmo do VALIDATED da UI e do relatório space_syntax_analysis). */
export const VALIDATED: Lite = {
  nodes: [
    { id: 'X', name: 'Exterior (carrier)', x: 90, y: 235 }, { id: 'E', name: 'Central corridor', x: 250, y: 235 },
    { id: 'B', name: 'Top-middle room', x: 250, y: 95 }, { id: 'C', name: 'Top-right room', x: 400, y: 120 },
    { id: 'D', name: 'Bottom-left room', x: 245, y: 375 }, { id: 'I', name: 'Bottom-right room', x: 470, y: 265 },
    { id: 'A', name: 'Top-left room', x: 110, y: 375 }, { id: 'F', name: 'Bottom-center room', x: 390, y: 390 },
    { id: 'G', name: 'Upper small room', x: 610, y: 255 }, { id: 'H', name: 'Lower small room', x: 470, y: 440 },
  ],
  edges: [['A', 'D'], ['D', 'E'], ['D', 'F'], ['E', 'B'], ['E', 'C'], ['E', 'I'], ['F', 'H'], ['I', 'G'], ['X', 'E']],
  root: 'X',
};

/**
 * Valores publicados no relatório space_syntax_analysis (3 casas).
 * `entEx` = entropia na convenção excludeSelf (a do relatório/engine v1).
 */
export const REPORT: Record<string, { conn: number; depth: number; td: number; md: number; ra: number; rra: number; integ: number; ctrl: number; choice: number; entEx: number; type: string; controllability: number }> = {
  E: { conn: 5, depth: 1, td: 14, md: 1.556, ra: 0.139, rra: 0.455, integ: 2.2, ctrl: 3.833, choice: 29, entEx: 1.352, type: 'b', controllability: 0.625 },
  D: { conn: 3, depth: 2, td: 16, md: 1.778, ra: 0.194, rra: 0.636, integ: 1.571, ctrl: 1.7, choice: 20, entEx: 1.352, type: 'b', controllability: 0.375 },
  I: { conn: 2, depth: 2, td: 20, md: 2.222, ra: 0.306, rra: 1.0, integ: 1.0, ctrl: 1.2, choice: 8, entEx: 1.837, type: 'b', controllability: 0.333 },
  X: { conn: 1, depth: 0, td: 22, md: 2.444, ra: 0.361, rra: 1.182, integ: 0.846, ctrl: 0.2, choice: 0, entEx: 1.753, type: 'a', controllability: 0.2 },
  B: { conn: 1, depth: 2, td: 22, md: 2.444, ra: 0.361, rra: 1.182, integ: 0.846, ctrl: 0.2, choice: 0, entEx: 1.753, type: 'a', controllability: 0.2 },
  C: { conn: 1, depth: 2, td: 22, md: 2.444, ra: 0.361, rra: 1.182, integ: 0.846, ctrl: 0.2, choice: 0, entEx: 1.753, type: 'a', controllability: 0.2 },
  F: { conn: 2, depth: 3, td: 22, md: 2.444, ra: 0.361, rra: 1.182, integ: 0.846, ctrl: 1.333, choice: 8, entEx: 1.837, type: 'b', controllability: 0.5 },
  A: { conn: 1, depth: 3, td: 24, md: 2.667, ra: 0.417, rra: 1.364, integ: 0.733, ctrl: 0.333, choice: 0, entEx: 1.658, type: 'a', controllability: 0.333 },
  G: { conn: 1, depth: 3, td: 28, md: 3.111, ra: 0.528, rra: 1.727, integ: 0.579, ctrl: 0.5, choice: 0, entEx: 2.059, type: 'a', controllability: 0.5 },
  H: { conn: 1, depth: 4, td: 30, md: 3.333, ra: 0.583, rra: 1.909, integ: 0.524, ctrl: 0.5, choice: 0, entEx: 2.059, type: 'a', controllability: 0.5 },
};

/** Monta um modelo só com topologia. */
export function topo(edges: [string, string][], extra: string[] = []): Lite {
  const ids = [...new Set([...edges.flat(), ...extra])];
  return { nodes: ids.map((id, i) => ({ id, name: id, x: i, y: 0 })), edges, root: ids[0] };
}
