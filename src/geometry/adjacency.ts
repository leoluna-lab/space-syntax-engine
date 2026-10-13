/**
 * Detecção de vizinhança entre polígonos desenhados à mão (F4.3.3, roteiro §8.1).
 *
 * Polígonos de croqui quase nunca encostam exatamente: há frestas e invasões de alguns
 * centímetros. Para cada par de espaços medimos o contato de parede (trechos quase paralelos
 * e próximos), a largura da fresta e a sobreposição, e classificamos:
 *   certa    — lados coincidem (fresta ≈ 0) e o contato tem o comprimento mínimo;
 *   provavel — fresta ≤ tolerância e contato mínimo;
 *   duvidosa — contato curto, fresta entre 1× e 2× a tolerância, ou polígonos que se invadem.
 * Encostar só pela quina não é vizinhança. Nada é gravado aqui: a interface pede revisão.
 */
import type { Pt } from './snap';

export type Confidence = 'certa' | 'provavel' | 'duvidosa';
export type Reason = 'exato' | 'fresta' | 'contato-curto' | 'fresta-larga' | 'sobreposicao';

export interface PolyIn { id: string; poly: Pt[] }

export interface AdjacencyOptions {
  /** Fresta máxima aceita como contato (unidades do desenho). */
  tol: number;
  /** Comprimento mínimo de parede em comum (unidades do desenho). */
  minContact: number;
  /** Ângulo máximo entre os lados para contarem como paralelos (graus). Padrão 12°. */
  maxAngleDeg?: number;
}

export interface AdjacencyCandidate {
  a: string;
  b: string;
  confidence: Confidence;
  reason: Reason;
  /** Comprimento de parede em comum com fresta ≤ tol. */
  contact: number;
  /** Maior fresta medida nos trechos de contato considerados. */
  gap: number;
  /** Profundidade da invasão: largura mínima da área comum aos dois polígonos (0 se não se invadem). */
  overlapDepth: number;
  /** Trechos de contato (sobre o lado de `a`) para destacar no mapa. */
  segs: [Pt, Pt][];
}

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);
const cross = (u: Pt, v: Pt) => u[0] * v[1] - u[1] * v[0];
const dot = (u: Pt, v: Pt) => u[0] * v[0] + u[1] * v[1];

/** Área com sinal (positiva no sentido anti-horário matemático). */
export function signedArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/** Interseção de dois polígonos convexos (Sutherland–Hodgman). */
export function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  const orient = Math.sign(signedArea(clip)) || 1;
  let out = subject.slice();
  for (let i = 0; i < clip.length && out.length; i++) {
    const c1 = clip[i], c2 = clip[(i + 1) % clip.length], e = sub(c2, c1);
    const inside = (p: Pt) => orient * cross(e, sub(p, c1)) >= -1e-9;
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], pin = inside(p), qin = inside(q);
      if (pin) out.push(p);
      if (pin !== qin) {
        const d = sub(q, p), den = cross(e, d);
        if (Math.abs(den) > 1e-12) { const t = cross(e, sub(c1, p)) / den; out.push([p[0] + t * d[0], p[1] + t * d[1]]); }
      }
    }
  }
  return out;
}

/**
 * Largura mínima de um polígono convexo (menor distância entre duas retas paralelas que o
 * contêm, medida pelos lados). Separa a "lasca" fina de um desenho levemente por cima do
 * vizinho (largura pequena) de uma invasão de verdade, mesmo num canto (largura grande).
 */
export function minWidth(p: Pt[]): number {
  if (p.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], e = sub(p[(i + 1) % p.length], a), l = len(e);
    if (l < 1e-12) continue;
    let far = 0;
    for (const q of p) far = Math.max(far, Math.abs(cross(e, sub(q, a))) / l);
    best = Math.min(best, far);
  }
  return Number.isFinite(best) ? best : 0;
}

export interface Contact { len: number; gap: number; seg: [Pt, Pt]; /** trecho [lo, hi] medido ao longo do lado de a */ lo: number; hi: number }

/** Trecho em que o lado b1–b2 corre paralelo e próximo ao lado a1–a2. */
export function edgeContact(a1: Pt, a2: Pt, b1: Pt, b2: Pt, maxGap: number, sinMax: number): Contact | null {
  const ea = sub(a2, a1), la = len(ea), eb = sub(b2, b1), lb = len(eb);
  if (la < 1e-9 || lb < 1e-9) return null;
  const ua: Pt = [ea[0] / la, ea[1] / la], ub: Pt = [eb[0] / lb, eb[1] / lb];
  if (Math.abs(cross(ua, ub)) > sinMax) return null;
  // intervalo de sobreposição medido ao longo do lado de a
  let s0 = dot(sub(b1, a1), ua), s1 = dot(sub(b2, a1), ua);
  if (s0 > s1) [s0, s1] = [s1, s0];
  const lo = Math.max(0, s0), hi = Math.min(la, s1);
  if (hi - lo <= 1e-9) return null;
  // fresta: distância, nas duas pontas do trecho, do lado de a até a reta do lado de b
  const pLo: Pt = [a1[0] + ua[0] * lo, a1[1] + ua[1] * lo], pHi: Pt = [a1[0] + ua[0] * hi, a1[1] + ua[1] * hi];
  const dist = (p: Pt) => Math.abs(cross(ub, sub(p, b1)));
  const gap = Math.max(dist(pLo), dist(pHi));
  return gap <= maxGap ? { len: hi - lo, gap, seg: [pLo, pHi], lo, hi } : null;
}

/** Classifica um par de polígonos; null se não forem vizinhos nem suspeitos. */
export function classifyPair(A: PolyIn, B: PolyIn, o: AdjacencyOptions): AdjacencyCandidate | null {
  const sinMax = Math.sin(((o.maxAngleDeg ?? 12) * Math.PI) / 180);
  const near: Contact[] = [], wide: Contact[] = [];
  for (let i = 0; i < A.poly.length; i++) {
    const a1 = A.poly[i], a2 = A.poly[(i + 1) % A.poly.length];
    for (let j = 0; j < B.poly.length; j++) {
      const c = edgeContact(a1, a2, B.poly[j], B.poly[(j + 1) % B.poly.length], 2 * o.tol, sinMax);
      if (c) (c.gap <= o.tol ? near : wide).push(c);
    }
  }
  const contact = near.reduce((s, c) => s + c.len, 0), wideLen = wide.reduce((s, c) => s + c.len, 0);
  const inter = clipConvex(A.poly, B.poly);
  const overlap = Math.abs(signedArea(inter));
  // profundidade da invasão = largura mínima da área comum (lasca fina ao longo da parede ≈ 0)
  const overlapDepth = overlap > 1e-9 ? minWidth(inter) : 0;
  const gap = near.length ? Math.max(...near.map(c => c.gap)) : wide.length ? Math.min(...wide.map(c => c.gap)) : Infinity;
  const segs = (near.length ? near : wide).map(c => c.seg);
  const base = { a: A.id, b: B.id, contact, gap: Number.isFinite(gap) ? gap : 0, overlapDepth, segs };
  if (overlapDepth > o.tol) return { ...base, confidence: 'duvidosa', reason: 'sobreposicao' };
  if (contact >= o.minContact) {
    return gap <= o.tol * 0.02 ? { ...base, confidence: 'certa', reason: 'exato' } : { ...base, confidence: 'provavel', reason: 'fresta' };
  }
  if (contact > 0) return { ...base, confidence: 'duvidosa', reason: 'contato-curto' };
  if (wideLen >= o.minContact) return { ...base, confidence: 'duvidosa', reason: 'fresta-larga' };
  return null;
}

/** Todos os pares candidatos, dos mais seguros para os mais duvidosos. */
export function detectAdjacency(polys: PolyIn[], o: AdjacencyOptions): AdjacencyCandidate[] {
  const out: AdjacencyCandidate[] = [];
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    const c = classifyPair(polys[i], polys[j], o);
    if (c) out.push(c);
  }
  const rank: Record<Confidence, number> = { certa: 0, provavel: 1, duvidosa: 2 };
  return out.sort((x, y) => rank[x.confidence] - rank[y.confidence] || y.contact - x.contact);
}

/**
 * "Fechar frestas": junta vértices a menos de `tol` uns dos outros (no ponto médio) e depois
 * encosta vértices que estão a menos de `tol` de um lado de outro polígono (junção em T).
 * Só mexe nos polígonos de `ids`. Devolve os polígonos novos e quantos vértices se moveram.
 */
export function closeGaps(polys: PolyIn[], ids: Set<string>, tol: number): { polys: PolyIn[]; moved: number } {
  const out = polys.map(p => ({ id: p.id, poly: p.poly.map(v => [v[0], v[1]] as Pt) }));
  const refs: { pi: number; vi: number }[] = [];
  out.forEach((p, pi) => { if (ids.has(p.id)) p.poly.forEach((_, vi) => refs.push({ pi, vi })); });
  const at = (r: { pi: number; vi: number }) => out[r.pi].poly[r.vi];
  // 1. solda de vértices próximos (união-busca)
  const parent = refs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) {
    if (refs[i].pi === refs[j].pi) continue;
    const p = at(refs[i]), q = at(refs[j]);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) parent[find(i)] = find(j);
  }
  const groups = new Map<number, number[]>();
  refs.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  let moved = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const pts = g.map(i => at(refs[i]));
    const m: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    for (const i of g) { const p = at(refs[i]); if (p[0] !== m[0] || p[1] !== m[1]) moved++; out[refs[i].pi].poly[refs[i].vi] = [m[0], m[1]]; }
  }
  // 2. junções em T: vértice perto do meio de um lado de outro polígono vai para cima do lado
  for (const r of refs) {
    const v = at(r);
    let best: { q: Pt; d: number } | null = null;
    for (let pj = 0; pj < out.length; pj++) {
      if (pj === r.pi || !ids.has(out[pj].id)) continue;
      const P = out[pj].poly;
      for (let k = 0; k < P.length; k++) {
        const a = P[k], b = P[(k + 1) % P.length], e = sub(b, a), l2 = dot(e, e);
        if (l2 < 1e-12) continue;
        const t = dot(sub(v, a), e) / l2;
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        const q: Pt = [a[0] + t * e[0], a[1] + t * e[1]], d = len(sub(v, q));
        if (d > 1e-9 && d <= tol && (!best || d < best.d)) best = { q, d };
      }
    }
    if (best) { out[r.pi].poly[r.vi] = best.q; moved++; }
  }
  return { polys: out, moved };
}
