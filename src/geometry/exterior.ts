/**
 * Exterior e orientação (F4.3.4, roteiro §8.2): quais trechos de parede de cada espaço dão
 * para fora e para qual face (N, S, L, O), a partir do norte informado pelo usuário.
 *
 * "Para fora" = trecho de lado que não encosta (dentro da tolerância) em nenhum outro polígono.
 * Um pátio interno ou um espaço que faltou desenhar também aparece como "fora" — por isso o
 * resultado é só uma SUGESTÃO, que o usuário valida antes de gravar.
 *
 * Convenção de ângulo: graus no sentido horário a partir do "para cima" da tela (y cresce para baixo).
 * `norte_graus` = para onde aponta o norte nessa mesma convenção.
 */
import type { Face } from '../engine/model';
import { edgeContact } from './adjacency';
import type { Pt } from './snap';

export interface PolyIn { id: string; poly: Pt[] }

export interface ExteriorPiece {
  id: string;
  face: Face;
  length: number;
  seg: [Pt, Pt];
  /** Direção para fora, em graus horários a partir do "para cima" da tela. */
  bearing: number;
}

/** Face correspondente a uma direção, dado o norte (setores de 90° centrados nos pontos cardeais). */
export function faceOf(bearingDeg: number, northDeg = 0): Face {
  const rel = (((bearingDeg - northDeg) % 360) + 360) % 360;
  if (rel >= 315 || rel < 45) return 'N';
  if (rel < 135) return 'L';
  if (rel < 225) return 'S';
  return 'O';
}

const centroid = (p: Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** Direção para fora do lado a–b de um polígono convexo (graus horários a partir de "cima"). */
export function outwardBearing(a: Pt, b: Pt, poly: Pt[]): number {
  let nx = b[1] - a[1], ny = -(b[0] - a[0]); // uma das normais
  const c = centroid(poly), mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
  if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; } // aponta para longe do centro
  // tela: "cima" = (0,-1); ângulo horário = atan2(x, -y)
  return ((Math.atan2(nx, -ny) * 180) / Math.PI + 360) % 360;
}

/** Une intervalos [lo, hi] sobrepostos. */
function union(iv: [number, number][]): [number, number][] {
  const s = iv.slice().sort((x, y) => x[0] - y[0]), out: [number, number][] = [];
  for (const [lo, hi] of s) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1e-9) last[1] = Math.max(last[1], hi); else out.push([lo, hi]);
  }
  return out;
}

/**
 * Trechos de parede voltados para fora, com a face sugerida.
 * `tol`: fresta máxima para considerar o lado encostado num vizinho; `minLen`: trechos menores são ignorados.
 */
export function exteriorPieces(polys: PolyIn[], northDeg: number, tol: number, minLen: number, maxAngleDeg = 12): ExteriorPiece[] {
  const sinMax = Math.sin((maxAngleDeg * Math.PI) / 180), out: ExteriorPiece[] = [];
  for (const P of polys) {
    for (let i = 0; i < P.poly.length; i++) {
      const a = P.poly[i], b = P.poly[(i + 1) % P.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-9) continue;
      const covered: [number, number][] = [];
      for (const Q of polys) {
        if (Q === P) continue;
        for (let j = 0; j < Q.poly.length; j++) {
          const c = edgeContact(a, b, Q.poly[j], Q.poly[(j + 1) % Q.poly.length], tol, sinMax);
          if (c) covered.push([c.lo, c.hi]);
        }
      }
      // complemento dos trechos cobertos = trechos livres (para fora)
      let s = 0;
      const free: [number, number][] = [];
      for (const [lo, hi] of union(covered)) { if (lo > s) free.push([s, lo]); s = Math.max(s, hi); }
      if (s < L) free.push([s, L]);
      const bearing = outwardBearing(a, b, P.poly), face = faceOf(bearing, northDeg);
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
      for (const [lo, hi] of free) {
        if (hi - lo < minLen) continue;
        out.push({ id: P.id, face, length: hi - lo, bearing, seg: [[a[0] + ux * lo, a[1] + uy * lo], [a[0] + ux * hi, a[1] + uy * hi]] });
      }
    }
  }
  return out;
}

export interface FaceSuggestion {
  id: string;
  face: Face;
  /** Soma dos trechos daquele espaço voltados para aquela face. */
  length: number;
  segs: [Pt, Pt][];
}

/** Agrupa os trechos por espaço e face: uma sugestão de ligação com o exterior por (espaço, face). */
export function suggestFaces(pieces: ExteriorPiece[]): FaceSuggestion[] {
  const map = new Map<string, FaceSuggestion>();
  for (const p of pieces) {
    const k = p.id + '\u0000' + p.face;
    const s = map.get(k) ?? { id: p.id, face: p.face, length: 0, segs: [] };
    s.length += p.length; s.segs.push(p.seg);
    map.set(k, s);
  }
  const order: Record<Face, number> = { N: 0, L: 1, S: 2, O: 3 };
  return [...map.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : order[x.face] - order[y.face]));
}
