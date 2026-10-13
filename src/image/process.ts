/**
 * Processamento de fotos de croquis, sobre buffers RGBA (compatível com ImageData,
 * mas sem depender do DOM — roda em testes Node e em Web Worker).
 */
import { applyH, homography, type Pt } from './homography';

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export const createRaster = (width: number, height: number): Raster =>
  ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

/**
 * Corrige a perspectiva: copia o quadrilátero `corners` (sup-esq, sup-dir, inf-dir, inf-esq,
 * em pixels da origem) para um retângulo width×height. Amostragem bilinear; fora da foto = branco.
 */
export function warpPerspective(src: Raster, corners: Pt[], width: number, height: number): Raster {
  const out = createRaster(width, height);
  const H = homography([[0, 0], [width, 0], [width, height], [0, height]], corners);
  const { data: s, width: sw, height: sh } = src, d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [u, v] = applyH(H, x + 0.5, y + 0.5);
      const fx = u - 0.5, fy = v - 0.5;
      const o = (y * width + x) * 4;
      if (fx < -0.5 || fy < -0.5 || fx > sw - 0.5 || fy > sh - 0.5) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255; continue; }
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        d[o + c] = top + (bot - top) * ay;
      }
    }
  }
  return out;
}

/** Luminância (Rec. 601), 0–255. */
export function toGray(img: Raster): Float32Array {
  const n = img.width * img.height, g = new Float32Array(n), d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return g;
}

/** Desfoque de caixa separável com somas corridas (O(n) qualquer que seja o raio), bordas replicadas. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Normaliza a iluminação: divide cada pixel pelo "fundo do papel" estimado por desfoque largo.
 * Remove sombras e luz desigual típicas de fotos de celular; papel → ~255, traço continua escuro.
 */
export function flattenLighting(gray: Float32Array, w: number, h: number): Float32Array {
  // O fundo é suave: estimado numa versão reduzida (~500 px) e ampliado — muito mais rápido no celular.
  const f = Math.max(1, Math.floor(Math.max(w, h) / 500));
  const sw = Math.ceil(w / f), sh = Math.ceil(h / f);
  const small = new Float32Array(sw * sh), cnt = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Math.floor(y / f) * sw + Math.floor(x / f);
    small[k] += gray[y * w + x]; cnt[k]++;
  }
  for (let k = 0; k < small.length; k++) small[k] /= cnt[k];
  const r = Math.max(3, Math.round(Math.max(sw, sh) / 40));
  // fechamento aproximado: máximo local antes de suavizar, para o traço não "puxar" o fundo para baixo
  const bgS = boxBlur(boxBlur(localMax(small, sw, sh, Math.max(2, Math.round(r / 2))), sw, sh, r), sw, sh, r);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), ax = fx - x0;
      const top = bgS[y0 * sw + x0] + (bgS[y0 * sw + x1] - bgS[y0 * sw + x0]) * ax;
      const bot = bgS[y1 * sw + x0] + (bgS[y1 * sw + x1] - bgS[y1 * sw + x0]) * ax;
      const bg = top + (bot - top) * ay;
      out[y * w + x] = Math.min(255, (gray[y * w + x] / Math.max(bg, 1)) * 255);
    }
  }
  return out;
}

/** Máximo local em janela quadrada (separável, ingênuo O(n·r) — r é pequeno). */
function localMax(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
    tmp[y * w + x] = m;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
    out[y * w + x] = m;
  }
  return out;
}

export type CleanMode = 'original' | 'enhance' | 'bw';

/**
 * Limpeza do croqui.
 * - original: só a foto corrigida;
 * - enhance: iluminação normalizada + níveis (cinza, preserva a espessura do traço);
 * - bw: iluminação normalizada + limiar (preto e branco).
 * `strength` ∈ [0,1]: quanto maior, mais traço fraco vira preto.
 */
export function cleanSketch(img: Raster, mode: CleanMode, strength = 0.5): Raster {
  if (mode === 'original') return { width: img.width, height: img.height, data: img.data.slice() };
  const { width: w, height: h } = img;
  const flat = flattenLighting(toGray(img), w, h);
  const out = createRaster(w, h), d = out.data;
  const s = Math.max(0, Math.min(1, strength));
  const white = 250, black = 120 + 110 * s; // enhance: abaixo de `black` vira preto
  const thr = 170 + 70 * s; // bw: limiar
  for (let i = 0, j = 0; i < flat.length; i++, j += 4) {
    let v: number;
    if (mode === 'bw') v = flat[i] < thr ? 0 : 255;
    else v = Math.max(0, Math.min(255, ((flat[i] - black) / (white - black)) * 255));
    d[j] = d[j + 1] = d[j + 2] = v;
    d[j + 3] = 255;
  }
  return out;
}

/** Gira 90° no sentido horário, `quarters` vezes. */
export function rotate90(img: Raster, quarters: number): Raster {
  const q = ((quarters % 4) + 4) % 4;
  if (q === 0) return img;
  const { width: w, height: h, data: s } = img;
  const out = q === 2 ? createRaster(w, h) : createRaster(h, w), d = out.data, ow = out.width;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = q === 1 ? [h - 1 - y, x] : q === 2 ? [w - 1 - x, h - 1 - y] : [y, w - 1 - x];
    const si = (y * w + x) * 4, di = (ny * ow + nx) * 4;
    d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
  }
  return out;
}
