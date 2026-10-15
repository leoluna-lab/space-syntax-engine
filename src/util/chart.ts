/** Utilitários do gráfico de dispersão dos Resultados (sem DOM). */

/** Marcas "redondas" (1, 2, 2,5, 5 × 10^n) cobrindo [min, max], com cerca de `count` intervalos. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1; min -= pad; max += pad; }
  if (min > max) [min, max] = [max, min];
  const raw = (max - min) / Math.max(1, count), mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw * 0.999)!;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  // limpa ruído de ponto flutuante (0.30000000000000004)
  const dec = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return out.map(v => +v.toFixed(dec));
}

/** Reta de mínimos quadrados y = a + b·x e correlação de Pearson; null se não houver variação. */
export function linearFit(xs: number[], ys: number[]): { a: number; b: number; r: number } | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r: sxy / Math.sqrt(sxx * syy) };
}

/** Agrupa pontos com as mesmas coordenadas (para um rótulo só, sem sobreposição). */
export function groupCoincident<T extends { x: number; y: number }>(pts: T[], digits = 6): T[][] {
  const map = new Map<string, T[]>();
  for (const p of pts) {
    const k = p.x.toFixed(digits) + '|' + p.y.toFixed(digits);
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return [...map.values()];
}
