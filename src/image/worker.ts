/// <reference lib="webworker" />
/**
 * Processa a foto final fora da thread principal: corrige perspectiva, gira e limpa.
 * Entrada e saída por buffers transferíveis (sem cópia).
 */
import { cleanSketch, rectifiedSize, rotate90, warpPerspective, type CleanMode, type Pt } from './index';

export interface PhotoJob {
  width: number;
  height: number;
  buffer: ArrayBuffer; // RGBA da foto de origem
  corners: Pt[];
  maxSide: number;
  quarters: number;
  mode: CleanMode;
  strength: number;
}

self.onmessage = (e: MessageEvent<PhotoJob>) => {
  const j = e.data;
  try {
    const src = { width: j.width, height: j.height, data: new Uint8ClampedArray(j.buffer) };
    const size = rectifiedSize(j.corners, j.maxSide);
    const out = cleanSketch(rotate90(warpPerspective(src, j.corners, size.width, size.height), j.quarters), j.mode, j.strength);
    (self as unknown as Worker).postMessage({ ok: true, width: out.width, height: out.height, buffer: out.data.buffer }, [out.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error).message || err) });
  }
};
