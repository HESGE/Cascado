// Original procedural sounds for Cascado, dedicated to CC0 1.0 Universal.
// Rebuild with: node scripts/generate-sounds.mjs
// No recordings, sample libraries or external dependencies are used.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const TAU = Math.PI * 2;
const asset = name => fileURLToPath(new URL(`../assets/audio/${name}.wav`, import.meta.url));

function writeWave(name, samples, peak) {
  let maximum = 0;
  for (const sample of samples) maximum = Math.max(maximum, Math.abs(sample));
  const scale = peak / maximum;
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * scale)) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(asset(name), Buffer.concat([header, pcm]));
}

function tick() {
  let seed = 0x5a17c0de;
  let filtered = 0;
  const length = Math.round(.032 * RATE);
  const samples = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0xffffffff * 2 - 1;
    filtered += .12 * (noise - filtered);
    const t = i / RATE;
    const envelope = (1 - Math.exp(-t / .0007)) * Math.exp(-t / .0037);
    const body = Math.sin(TAU * 730 * t) + .22 * Math.sin(TAU * 1370 * t);
    const latchTime = t - .008;
    const latch = latchTime > 0 ? .24 * Math.sin(TAU * 510 * latchTime)
      * (1 - Math.exp(-latchTime / .0008)) * Math.exp(-latchTime / .0035) : 0;
    const endFade = Math.min(1, (length - 1 - i) / (.003 * RATE));
    samples[i] = (body * envelope + filtered * envelope * .3 + latch) * endFade;
  }
  samples[0] = samples[length - 1] = 0;
  return samples;
}

function melody(duration, notes, warmth) {
  const samples = new Float64Array(Math.round(duration * RATE));
  for (const [start, frequency, length, gain] of notes) {
    const first = Math.round(start * RATE);
    const count = Math.min(Math.round(length * RATE), samples.length - first);
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / .009);
      const tail = Math.min(1, (count - 1 - i) / (.12 * RATE));
      const envelope = attack * Math.exp(-t / (length * .42)) * Math.max(0, tail);
      const tone = Math.sin(TAU * frequency * t)
        + .16 * Math.sin(TAU * frequency * 2 * t) * Math.exp(-t / .15)
        + warmth * Math.sin(TAU * frequency * .5 * t);
      samples[first + i] += gain * tone * envelope;
    }
  }
  samples[0] = samples[samples.length - 1] = 0;
  return samples;
}

writeWave('safe-tick', tick(), .16);
writeWave('victory', melody(2.1, [
  [.02, 523.251, .48, .8], [.27, 659.255, .48, .8],
  [.52, 783.991, .52, .8], [.80, 1046.502, 1.25, .85],
  [.86, 523.251, 1.19, .24], [.86, 659.255, 1.19, .20],
  [.86, 783.991, 1.19, .18],
], .05), .52);
writeWave('defeat', melody(1.85, [
  [.02, 659.255, .50, .55], [.29, 587.330, .50, .55],
  [.56, 493.883, .52, .6], [.84, 391.995, .96, .62],
  [.90, 329.628, .90, .32],
], .12), .44);
