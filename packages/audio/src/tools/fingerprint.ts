/** FNV-1a over the 16-bit quantised samples, and the RMS: compares a browser render with Node's. */
export function fingerprint(out: readonly Float32Array[]): { hash: number; rms: number } {
  let hash = 0x811c9dc5;
  let sum = 0;
  let count = 0;
  for (const ch of out)
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i] as number;
      sum += x * x;
      count++;
      const q = Math.max(-32768, Math.min(32767, Math.round(x * 32767))) & 0xffff;
      hash = Math.imul(hash ^ (q & 0xff), 16777619);
      hash = Math.imul(hash ^ (q >> 8), 16777619);
    }
  return { hash: hash >>> 0, rms: Math.sqrt(sum / count) };
}
