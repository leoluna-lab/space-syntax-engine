/**
 * Homografia plana (transformação projetiva) a partir de 4 pares de pontos.
 * Usada para "endireitar" a foto de um croqui tirada em ângulo.
 */

export type Pt = [number, number];
/** Matriz 3×3 em ordem de linhas, com h[8] = 1. */
export type Homography = number[];

/** Resolve A·x = b por eliminação de Gauss com pivoteamento parcial. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Pontos degenerados: três cantos alinhados ou repetidos.');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** H tal que applyH(H, from[i]) = to[i] para os 4 pares. */
export function homography(from: Pt[], to: Pt[]): Homography {
  if (from.length !== 4 || to.length !== 4) throw new Error('São necessários exatamente 4 pontos.');
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  return [...solve(A, b), 1];
}

export function applyH(H: Homography, x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Tamanho do retângulo de saída para os cantos [sup-esq, sup-dir, inf-dir, inf-esq]:
 * maior largura e maior altura medidas na foto, limitadas a `maxSide`.
 */
export function rectifiedSize(corners: Pt[], maxSide: number): { width: number; height: number } {
  const [tl, tr, br, bl] = corners;
  let w = Math.max(dist(tl, tr), dist(bl, br)), h = Math.max(dist(tl, bl), dist(tr, br));
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
  return { width: w, height: h };
}

/** Quadrilátero convexo e não degenerado (cantos na ordem sup-esq, sup-dir, inf-dir, inf-esq). */
export function isValidQuad(c: Pt[]): boolean {
  if (c.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
