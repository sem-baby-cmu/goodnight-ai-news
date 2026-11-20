// A speech-like test signal for the MP3 spike (issue #69, exact change 2).
// It is broadband like speech, so it loads the encoder in the same way.
// The same seed gives the same bytes.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HARMONICS = 20;
// Peak level: -3 dBFS.
const PEAK = Math.floor(32767 * 10 ** (-3 / 20));

type Formants = [number, number, number];

function randomFormants(rnd: () => number): Formants {
  return [300 + 600 * rnd(), 900 + 1600 * rnd(), 2400 + 1100 * rnd()];
}

// Mono, 16-bit PCM at `rate` Hz, `seconds` long.
export function speechLikePcm(seconds: number, rate = 24000, seed = 69): Int16Array {
  const rnd = mulberry32(seed);
  const n = Math.round(seconds * rate);
  const out = new Float64Array(n);

  // Syllables of 150 to 300 ms. A 300 ms pause after every 6 to 10 syllables.
  let i = 0;
  let phase = 0;
  let f0 = 120 + 140 * rnd();
  let formFrom = randomFormants(rnd);
  let formTo = randomFormants(rnd);
  let formStart = 0;
  let formLen = Math.round((0.08 + 0.12 * rnd()) * rate);
  const gains = new Float64Array(HARMONICS + 1);
  let syllablesLeft = 6 + Math.floor(5 * rnd());

  while (i < n) {
    const sylLen = Math.round((0.15 + 0.15 * rnd()) * rate);
    const f0From = f0;
    const f0To = 120 + 140 * rnd();
    const noiseLen = Math.round((0.02 + 0.04 * rnd()) * rate);
    let prevNoise = 0;
    for (let s = 0; s < sylLen && i < n; s++, i++) {
      const t = s / sylLen;
      f0 = f0From + (f0To - f0From) * t;
      phase += (2 * Math.PI * f0) / rate;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

      // Formants move every 80 to 200 ms.
      if (i - formStart >= formLen) {
        formFrom = formTo;
        formTo = randomFormants(rnd);
        formStart = i;
        formLen = Math.round((0.08 + 0.12 * rnd()) * rate);
      }
      // The harmonic gains change slowly: update them every 2 ms.
      if (s % 48 === 0) {
        const ft = (i - formStart) / formLen;
        for (let k = 1; k <= HARMONICS; k++) {
          const f = k * f0;
          let g = 0;
          for (let j = 0; j < 3; j++) {
            const fc = formFrom[j]! + (formTo[j]! - formFrom[j]!) * ft;
            const bw = 80 + 0.06 * fc;
            g += 1 / (1 + ((f - fc) / bw) ** 2);
          }
          gains[k] = g / k;
        }
      }
      let voiced = 0;
      for (let k = 1; k <= HARMONICS; k++) voiced += gains[k]! * Math.sin(k * phase);

      // A consonant at the start of the syllable: high-passed noise.
      let noise = 0;
      if (s < noiseLen) {
        const w = 2 * rnd() - 1;
        noise = (w - prevNoise) * (1 - s / noiseLen);
        prevNoise = w;
      }
      const env = Math.sin(Math.PI * t) ** 0.6;
      out[i] = env * voiced + 0.5 * noise;
    }
    syllablesLeft--;
    if (syllablesLeft === 0) {
      i += Math.round(0.3 * rate);
      syllablesLeft = 6 + Math.floor(5 * rnd());
    }
  }

  let max = 0;
  for (let k = 0; k < n; k++) max = Math.max(max, Math.abs(out[k]!));
  const pcm = new Int16Array(n);
  const scale = max > 0 ? PEAK / max : 0;
  for (let k = 0; k < n; k++) pcm[k] = Math.round(out[k]! * scale);
  return pcm;
}
