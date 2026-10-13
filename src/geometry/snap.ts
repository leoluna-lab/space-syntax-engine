/**
 * Ímã do desenho de polígonos convexos (F4.3.2).
 * Polígonos desenhados à mão quase nunca encostam exatamente; o ímã faz o ponto novo
 * grudar num vértice ou num lado já existente, para que paredes vizinhas coincidam.
 * Prioridade: vértice > lado > (grade ou livre, decidido por quem chama).
 */

export type Pt = [number, number];

export interface SnapTarget {
  /** id do espaço dono do polígono */
  owner: string;
  poly: Pt[];
}

export type SnapResult =
  | { kind: 'vertex'; p: Pt; owner: string; index: number; d: number }
  | { kind: 'edge'; p: Pt; owner: string; seg: [Pt, Pt]; d: number }
  | { kind: 'none'; p: Pt };

/** Ponto mais próximo de `p` no segmento a–b e a distância até ele. */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): { q: Pt; d: number; t: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { q, d: Math.hypot(p[0] - q[0], p[1] - q[1]), t };
}

/**
 * Procura onde grudar `p`, dentro do raio `r` (em unidades do desenho).
 * Vértices ganham dos lados mesmo que um lado esteja um pouco mais perto: assim, perto de um
 * canto, o ponto cai exatamente no canto (que é o que garante paredes coincidentes).
 */
export function snapPoint(p: Pt, targets: SnapTarget[], r: number): SnapResult {
  let vertex: SnapResult | null = null;
  for (const t of targets) {
    t.poly.forEach((v, index) => {
      const d = Math.hypot(p[0] - v[0], p[1] - v[1]);
      if (d <= r && (!vertex || d < (vertex as { d: number }).d)) vertex = { kind: 'vertex', p: [v[0], v[1]], owner: t.owner, index, d };
    });
  }
  if (vertex) return vertex;
  let edge: SnapResult | null = null;
  for (const t of targets) {
    for (let i = 0; i < t.poly.length; i++) {
      const a = t.poly[i], b = t.poly[(i + 1) % t.poly.length];
      const { q, d } = closestOnSegment(p, a, b);
      if (d <= r && (!edge || d < (edge as { d: number }).d)) edge = { kind: 'edge', p: q, owner: t.owner, seg: [[a[0], a[1]], [b[0], b[1]]], d };
    }
  }
  return edge ?? { kind: 'none', p: [p[0], p[1]] };
}

/**
 * "Parede compartilhada": dado o lado a–b de um polígono vizinho, devolve os dois vértices
 * na ordem inversa (b, a). Percorrer o lado ao contrário é o que um polígono vizinho faria,
 * e assim os dois lados coincidem exatamente.
 */
export function sharedWall(seg: [Pt, Pt]): Pt[] {
  return [[seg[1][0], seg[1][1]], [seg[0][0], seg[0][1]]];
}
