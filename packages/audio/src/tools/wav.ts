/** 16-bit PCM WAV writing with TPDF dither. */

import { Rng } from "../dsp/core.ts";

export function wav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const n = channels[0]?.length ?? 0;
  const c = channels.length;
  const data = n * c * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + data, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, c, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * c * 2, true);
  v.setUint16(32, c * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, data, true);
  const rng = new Rng(7);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let ch = 0; ch < c; ch++) {
      const x = (channels[ch]?.[i] ?? 0) * 32767 + (rng.next() - rng.next());
      v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(x))), true);
      o += 2;
    }
  return new Uint8Array(buf);
}
