// The 8 sound recipes (#21, closed list). Each `render` returns `n` raw samples
// at `sampleRate`; `renderSfx` adds the fades and the peak normalisation.
// Sounds are synthesised in code from these recipes and a seeded random
// generator, so there is no third-party audio.
//
// Choices that the recipe table leaves open (implementation decisions):
// - whoosh: the centre frequency moves linearly in each segment; the band-pass
//   is the RBJ "constant 0 dB peak gain" form, coefficients set per sample;
// - tick: the noise burst has amplitude 1;
// - splash: the 4 blips are drawn first (start, then frequency, per blip), then
//   the noise; a blip has amplitude 0.5;
// - tada: the triangle is (2 / pi) * asin(sin(2 pi f t)).

export type SfxRecipe = {
  key: string;
  name: string;
  ms: number;
  render: (n: number, sampleRate: number, rand: () => number) => Float64Array;
};

const TAU = 2 * Math.PI;

function each(n: number, sampleRate: number, sample: (t: number) => number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = sample(i / sampleRate);
  return out;
}

// A sine whose frequency changes with time: the phase is the running sum.
function sweep(n: number, sampleRate: number, freq: (t: number) => number, amp: (t: number) => number): Float64Array {
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    out[i] = Math.sin(phase) * amp(t);
    phase += (TAU * freq(t)) / sampleRate;
  }
  return out;
}

const decay = (t: number, tau: number) => Math.exp(-t / tau);
const noise = (rand: () => number) => rand() * 2 - 1;
const triangle = (f: number, t: number) => (2 / Math.PI) * Math.asin(Math.sin(TAU * f * t));

export const SFX: readonly SfxRecipe[] = [
  {
    key: "sfx-pop",
    name: "Pop",
    ms: 120,
    render: (n, sr) =>
      sweep(
        n,
        sr,
        (t) => 600 * (200 / 600) ** (Math.min(t, 0.08) / 0.08),
        (t) => (t < 0.002 ? t / 0.002 : decay(t - 0.002, 0.03)),
      ),
  },
  {
    key: "sfx-boing",
    name: "Boing",
    ms: 450,
    render: (n, sr) =>
      sweep(
        n,
        sr,
        (t) => 220 + 80 * Math.sin(TAU * 12 * t) * decay(t, 0.15),
        (t) => decay(t, 0.18),
      ),
  },
  {
    key: "sfx-chime",
    name: "Chime",
    ms: 900,
    render: (n, sr) =>
      each(n, sr, (t) =>
        [
          [1046.5, 0],
          [1318.5, 0.06],
          [1568, 0.12],
        ].reduce((sum, [f, start]) => (t >= start! ? sum + Math.sin(TAU * f! * (t - start!)) * decay(t - start!, 0.25) : sum), 0),
      ),
  },
  {
    key: "sfx-whoosh",
    name: "Whoosh",
    ms: 600,
    render: (n, sr, rand) => {
      const length = n / sr;
      const centre = (t: number) => (t < 0.3 ? 300 + ((2500 - 300) * t) / 0.3 : 2500 + ((600 - 2500) * (t - 0.3)) / (length - 0.3));
      const q = 1.2;
      const out = new Float64Array(n);
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w0 = (TAU * centre(t)) / sr;
        const alpha = Math.sin(w0) / (2 * q);
        const a0 = 1 + alpha;
        const x = noise(rand);
        const y = (alpha * x - alpha * x2 + 2 * Math.cos(w0) * y1 - (1 - alpha) * y2) / a0;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[i] = y * 0.5 * (1 - Math.cos((TAU * t) / length));
      }
      return out;
    },
  },
  {
    key: "sfx-tick",
    name: "Tick",
    ms: 60,
    render: (n, sr, rand) => each(n, sr, (t) => (t < 0.003 ? noise(rand) : 0) + Math.sin(TAU * 2000 * t) * decay(t, 0.008)),
  },
  {
    key: "sfx-bell",
    name: "Bell",
    ms: 1200,
    render: (n, sr) =>
      each(n, sr, (t) =>
        [
          [800, 1, 0.4],
          [2208, 0.5, 0.2],
          [4320, 0.25, 0.1],
        ].reduce((sum, [f, a, tau]) => sum + a! * Math.sin(TAU * f! * t) * decay(t, tau!), 0),
      ),
  },
  {
    key: "sfx-splash",
    name: "Splash",
    ms: 500,
    render: (n, sr, rand) => {
      const length = n / sr;
      const blips = Array.from({ length: 4 }, () => {
        const start = 0.05 + rand() * 0.3;
        return { start, freq: 1200 + rand() * 800 };
      });
      const out = new Float64Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const cutoff = 3000 + ((800 - 3000) * t) / length;
        y += (1 - Math.exp((-TAU * cutoff) / sr)) * (noise(rand) - y);
        let s = y * decay(t, 0.12);
        for (const b of blips) {
          const dt = t - b.start;
          if (dt >= 0 && dt < 0.03) s += 0.5 * Math.sin(TAU * b.freq * dt) * decay(dt, 0.01);
        }
        out[i] = s;
      }
      return out;
    },
  },
  {
    key: "sfx-tada",
    name: "Tada",
    ms: 600,
    render: (n, sr) => each(n, sr, (t) => (t < 0.12 ? triangle(784, t) * decay(t, 0.15) : triangle(1046.5, t - 0.12) * decay(t - 0.12, 0.15))),
  },
];
