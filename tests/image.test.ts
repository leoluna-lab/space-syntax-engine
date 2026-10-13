import { describe, expect, it } from 'vitest';
import {
  applyH, boxBlur, cleanSketch, createRaster, flattenLighting, homography, isValidQuad,
  rectifiedSize, rotate90, toGray, warpPerspective, type Pt, type Raster,
} from '../src/image';

const px = (img: Raster, x: number, y: number) => img.data[(y * img.width + x) * 4];

describe('homografia', () => {
  it('leva os 4 pontos de origem exatamente aos de destino', () => {
    const from: Pt[] = [[0, 0], [100, 0], [100, 60], [0, 60]];
    const to: Pt[] = [[12, 30], [180, 8], [205, 150], [3, 120]];
    const H = homography(from, to);
    from.forEach((p, i) => {
      const [u, v] = applyH(H, p[0], p[1]);
      expect(u).toBeCloseTo(to[i][0], 9);
      expect(v).toBeCloseTo(to[i][1], 9);
    });
  });

  it('quadrado → mesmo quadrado é a identidade', () => {
    const sq: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const H = homography(sq, sq);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(H[i]).toBeCloseTo(v, 12));
  });

  it('preserva retas (propriedade projetiva): ponto médio de lado continua no lado', () => {
    const to: Pt[] = [[10, 10], [200, 30], [190, 180], [20, 160]];
    const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], to);
    const [u, v] = applyH(H, 0.5, 0); // em algum lugar do segmento to[0]–to[1]
    const cross = (to[1][0] - to[0][0]) * (v - to[0][1]) - (to[1][1] - to[0][1]) * (u - to[0][0]);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('pontos degenerados lançam erro', () => {
    expect(() => homography([[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toThrow(/degenerados/);
  });

  it('isValidQuad aceita convexo e rejeita cruzado/degenerado', () => {
    expect(isValidQuad([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
    expect(isValidQuad([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false); // gravata
    expect(isValidQuad([[0, 0], [5, 0], [10, 0], [0, 10]])).toBe(false);
  });

  it('rectifiedSize usa as maiores medidas e respeita o limite', () => {
    expect(rectifiedSize([[0, 0], [400, 0], [380, 300], [20, 300]], 2000)).toEqual({ width: 400, height: 301 });
    const s = rectifiedSize([[0, 0], [4000, 0], [4000, 2000], [0, 2000]], 1000);
    expect(s).toEqual({ width: 1000, height: 500 });
  });
});

describe('warpPerspective', () => {
  // xadrez 2×2 de 50 px: quadrante sup-esq preto
  const src = createRaster(100, 100);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const v = (x < 50) === (y < 50) ? 0 : 255, o = (y * 100 + x) * 4;
    src.data[o] = src.data[o + 1] = src.data[o + 2] = v; src.data[o + 3] = 255;
  }

  it('cantos = imagem inteira reproduz a imagem', () => {
    const out = warpPerspective(src, [[0, 0], [100, 0], [100, 100], [0, 100]], 100, 100);
    expect(px(out, 10, 10)).toBe(0);
    expect(px(out, 90, 10)).toBe(255);
    expect(px(out, 90, 90)).toBe(0);
  });

  it('recorte do quadrante sup-esq sai todo preto', () => {
    const out = warpPerspective(src, [[0, 0], [50, 0], [50, 50], [0, 50]], 40, 40);
    expect(px(out, 5, 5)).toBe(0);
    expect(px(out, 30, 30)).toBeLessThan(10);
  });

  it('fora da foto vira branco', () => {
    const out = warpPerspective(src, [[-100, -100], [-50, -100], [-50, -50], [-100, -50]], 10, 10);
    expect(px(out, 5, 5)).toBe(255);
  });
});

describe('limpeza do croqui', () => {
  // papel com luz desigual (escurece da esquerda p/ direita, 240 → 120) e um traço vertical em 50% do fundo
  const W = 300, H = 200;
  const photo = createRaster(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const paper = 240 - (120 * x) / W, v = Math.abs(x - 225) <= 2 ? paper * 0.45 : paper;
    const o = (y * W + x) * 4;
    photo.data[o] = photo.data[o + 1] = photo.data[o + 2] = v; photo.data[o + 3] = 255;
  }

  it('boxBlur preserva constante e média', () => {
    const g = new Float32Array(50).fill(7);
    expect([...boxBlur(g, 10, 5, 3)].every(v => Math.abs(v - 7) < 1e-5)).toBe(true);
  });

  it('flattenLighting deixa o papel uniforme (~255) dos dois lados', () => {
    const flat = flattenLighting(toGray(photo), W, H);
    expect(flat[100 * W + 20]).toBeGreaterThan(235);
    expect(flat[100 * W + 280]).toBeGreaterThan(235);
  });

  it('o traço na região escura vira preto em P&B e o papel vira branco', () => {
    const bw = cleanSketch(photo, 'bw', 0.5);
    expect(px(bw, 225, 100)).toBe(0);
    expect(px(bw, 270, 100)).toBe(255);
    expect(px(bw, 20, 100)).toBe(255);
  });

  it('realçar mantém tons de cinza e escurece o traço', () => {
    const en = cleanSketch(photo, 'enhance', 0.5);
    expect(px(en, 225, 100)).toBeLessThan(60);
    expect(px(en, 270, 100)).toBeGreaterThan(200);
  });

  it('original não altera a imagem', () => {
    expect(cleanSketch(photo, 'original').data).toEqual(photo.data);
  });

  it('rotate90 gira e troca dimensões', () => {
    const img = createRaster(3, 2);
    img.data[0] = 99; // pixel (0,0)
    const r1 = rotate90(img, 1);
    expect([r1.width, r1.height]).toEqual([2, 3]);
    expect(px(r1, 1, 0)).toBe(99); // (0,0) → (h−1, 0)
    expect(rotate90(rotate90(img, 2), 2).data).toEqual(img.data);
    expect(rotate90(img, 4)).toBe(img);
  });
});
