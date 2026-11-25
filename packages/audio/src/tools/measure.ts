/**
 * Level and health measurements for rendered audio: peak, RMS, loudness (ITU-R BS.1770 K-weighted,
 * gated), DC offset, clipping, clicks and spectral balance.
 */

export interface Measurement {
  seconds: number;
  /** dBFS, sample peak across channels. */
  peak: number;
  /** dBFS, RMS of the whole file. */
  rms: number;
  /** LUFS, integrated with the absolute and relative gates. */
  lufs: number;
  /** LUFS, loudest 400 ms window: used for short effects. */
  momentaryMax: number;
  /** Mean sample value, as a fraction of full scale. */
  dc: number;
  /** Samples at or above 0.999 of full scale. */
  clipped: number;
  /**
   * Largest second difference against the local level, in dB above the median of the file.
   * A click shows up as a spike far above the file's own texture.
   */
  click: number;
  /** Seconds where `click` was found. */
  clickAt: number;
  /** Share of energy per band, dB relative to the total: sub, low, mid, presence, air. */
  bands: [number, number, number, number, number];
}

export const BAND_EDGES = [60, 250, 2000, 6000];
export const BAND_NAMES = ["<60", "60-250", "250-2k", "2k-6k", ">6k"];

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The two K-weighting stages, re-derived for any sample rate. */
function kWeighting(sr: number): [Biquad, Biquad] {
  // Stage 1: high shelf.
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / sr);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: high pass.
  const f1 = 38.13547087602444;
  const Q1 = 0.5003270373238773;
  const K1 = Math.tan((Math.PI * f1) / sr);
  const d = 1 + K1 / Q1 + K1 * K1;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K1 * K1 - 1)) / d,
    a2: (1 - K1 / Q1 + K1 * K1) / d,
  };
  return [shelf, hp];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] as number;
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

function loudness(channels: readonly Float32Array[], sr: number): { lufs: number; max: number } {
  const [shelf, hp] = kWeighting(sr);
  const weighted = channels.map((c) => filter(filter(c, shelf), hp));
  const block = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const n = channels[0]?.length ?? 0;
  const powers: number[] = [];
  for (let s = 0; s + block <= n || (s === 0 && n > 0); s += hop) {
    const end = Math.min(n, s + block);
    let p = 0;
    for (const w of weighted) {
      let sum = 0;
      for (let i = s; i < end; i++) sum += (w[i] as number) ** 2;
      p += sum / block;
    }
    powers.push(p);
    if (end === n) break;
  }
  const lk = (p: number) => -0.691 + 10 * Math.log10(p);
  const max = powers.length ? Math.max(...powers.map(lk)) : -Infinity;
  const abs = powers.filter((p) => lk(p) > -70);
  if (abs.length === 0) return { lufs: -Infinity, max };
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((p) => lk(p) > lk(mean) - 10);
  const gated = rel.reduce((a, b) => a + b, 0) / rel.length;
  return { lufs: lk(gated), max };
}

/** Energy share per band from an averaged 4096-point FFT of the mono sum. */
function bands(channels: readonly Float32Array[], sr: number): Measurement["bands"] {
  const N = 4096;
  const n = channels[0]?.length ?? 0;
  const mono = new Float32Array(n);
  for (const c of channels)
    for (let i = 0; i < n; i++) mono[i] = (mono[i] as number) + (c[i] as number);
  const out = [0, 0, 0, 0, 0];
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const hops = Math.max(1, Math.floor((n - N) / (N / 2)));
  const step = Math.max(1, Math.floor(hops / 200));
  for (let h = 0; h < hops; h += step) {
    const s = h * (N / 2);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      re[i] = (mono[s + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sr) / N;
      const e = (re[k] as number) ** 2 + (im[k] as number) ** 2;
      let b = 0;
      while (b < BAND_EDGES.length && f >= (BAND_EDGES[b] as number)) b++;
      out[b] = (out[b] as number) + e;
    }
  }
  const total = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((e) => 10 * Math.log10(e / total + 1e-12)) as Measurement["bands"];
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const tr = (re[b] as number) * cr - (im[b] as number) * ci;
        const ti = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - tr;
        im[b] = (im[a] as number) - ti;
        re[a] = (re[a] as number) + tr;
        im[a] = (im[a] as number) + ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * Click detector: the second difference of the signal, divided by the local RMS over 10 ms, so
 * loud passages and bright timbres do not count. Returns the worst ratio relative to the file's
 * 99.9th percentile ratio.
 */
function clicks(channels: readonly Float32Array[], sr: number): { click: number; at: number } {
  const win = Math.max(8, Math.round(0.01 * sr));
  let worst = 0;
  let at = 0;
  const ratios: number[] = [];
  for (const c of channels) {
    let sum = 0;
    const sq = new Float64Array(c.length + 1);
    for (let i = 0; i < c.length; i++) {
      sum += (c[i] as number) ** 2;
      sq[i + 1] = sum;
    }
    for (let i = 2; i < c.length; i++) {
      const lo = Math.max(0, i - win);
      const hi = Math.min(c.length, i + win);
      const local = Math.sqrt(((sq[hi] as number) - (sq[lo] as number)) / (hi - lo)) + 1e-5;
      const d2 = Math.abs((c[i] as number) - 2 * (c[i - 1] as number) + (c[i - 2] as number));
      const r = d2 / local;
      if (i % 97 === 0) ratios.push(r);
      if (r > worst) {
        worst = r;
        at = i / sr;
      }
    }
  }
  ratios.sort((a, b) => a - b);
  const p = ratios[Math.floor(ratios.length * 0.999)] ?? 1e-9;
  return { click: db(worst / (p || 1e-9)), at };
}

export function measure(channels: readonly Float32Array[], sr: number): Measurement {
  const n = channels[0]?.length ?? 0;
  let peak = 0;
  let sum = 0;
  let mean = 0;
  let clipped = 0;
  for (const c of channels)
    for (let i = 0; i < n; i++) {
      const x = c[i] as number;
      const a = Math.abs(x);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += x * x;
      mean += x;
    }
  const { lufs, max } = loudness(channels, sr);
  const { click, at } = clicks(channels, sr);
  return {
    seconds: n / sr,
    peak: db(peak),
    rms: db(Math.sqrt(sum / (n * channels.length || 1))),
    lufs,
    momentaryMax: max,
    dc: mean / (n * channels.length || 1),
    clipped,
    click,
    clickAt: at,
    bands: bands(channels, sr),
  };
}

/**
 * Seam check for a looping song: the largest jump in the second difference within 20 ms of the
 * loop point, against the same measure over the rest of the file. Below 0 dB means the seam is
 * no rougher than the music around it.
 */
export function seam(channels: readonly Float32Array[], sr: number, at: number): number {
  const win = Math.round(0.02 * sr);
  const centre = Math.round(at * sr);
  let near = 0;
  const all: number[] = [];
  for (const c of channels)
    for (let i = 2; i < c.length; i++) {
      const d2 = Math.abs((c[i] as number) - 2 * (c[i - 1] as number) + (c[i - 2] as number));
      if (Math.abs(i - centre) <= win) near = Math.max(near, d2);
      else if (i % 31 === 0) all.push(d2);
    }
  all.sort((a, b) => a - b);
  const typical = all[Math.floor(all.length * 0.999)] ?? 1e-9;
  return db(near / (typical || 1e-9));
}
