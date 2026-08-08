// Music is CC0 (credited in index.html). Everything else is synthesised at runtime.

let ctx = null, master = null, musicBus = null, seaGain = null, seaFilter = null;
let started = false;
let intensity = 0;

/* ------------------------------- graph ---------------------------------------- */

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0.72;
  master.connect(ctx.destination);

  // music sits on its own bus so loud moments can duck it
  musicBus = ctx.createGain();
  musicBus.gain.value = 1;
  musicBus.connect(master);

  // ocean bed: pink-ish noise through a slowly breathing lowpass
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  seaFilter = ctx.createBiquadFilter();
  seaFilter.type = 'lowpass';
  seaFilter.frequency.value = 480;
  seaGain = ctx.createGain();
  seaGain.gain.value = 0.07;
  src.connect(seaFilter).connect(seaGain).connect(master);
  src.start();

  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  lfo.frequency.value = 0.11; lfoG.gain.value = 230;
  lfo.connect(lfoG).connect(seaFilter.frequency);
  lfo.start();

  started = true;
  decodeMusic();
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

/* ------------------------------- primitives ----------------------------------- */

function ramp(g, t0, attack, hold, decay, peak) {
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  if (hold) g.setValueAtTime(peak, t0 + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + decay);
}

function tone(freq, { type = 'sine', dur = 0.16, vol = 0.25, slide = 0, delay = 0,
  attack = 0.008, hold = 0 } = {}) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t0 + dur);
  ramp(g.gain, t0, attack, hold, dur, vol);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + attack + hold + dur + 0.06);
}

/** FM bell: metallic, rings out. The workhorse for coins, banking and warnings. */
function bell(freq, { dur = 1.2, vol = 0.26, ratio = 1.41, index = 5, delay = 0 } = {}) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * index, t0);
  mg.gain.exponentialRampToValueAtTime(freq * 0.04, t0 + dur * 0.45);
  mod.connect(mg).connect(car.frequency);
  const g = ctx.createGain();
  ramp(g.gain, t0, 0.005, 0, dur, vol);
  car.connect(g).connect(master);
  car.start(t0); mod.start(t0);
  car.stop(t0 + dur + 0.08); mod.stop(t0 + dur + 0.08);
}

function noiseBurst({ dur = 0.3, vol = 0.3, from = 2600, to = 300, q = 1, type = 'bandpass',
  delay = 0, curve = 1 } = {}) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, curve);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
  const g = ctx.createGain();
  ramp(g.gain, t0, 0.008, 0, dur, vol);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
}

/** Creature throat: a wobbling saw under a closing lowpass. Organic, not electronic. */
function growl(freq, { dur = 0.9, vol = 0.28, delay = 0 } = {}) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 5;
  f.frequency.setValueAtTime(freq * 9, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 2.2, t0 + dur);
  const g = ctx.createGain();
  ramp(g.gain, t0, 0.05, dur * 0.22, dur * 0.7, vol);
  f.connect(g).connect(master);

  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq * 1.25, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.72, t0 + dur);
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 17;
  lg.gain.value = freq * 0.16;
  lfo.connect(lg).connect(o.frequency);
  o.connect(f);
  o.start(t0); lfo.start(t0);
  o.stop(t0 + dur + 0.2); lfo.stop(t0 + dur + 0.2);
}

/** Ship's horn: two detuned saws under a lowpass, slow swell. */
function horn(freq, { dur = 1.5, vol = 0.3, delay = 0 } = {}) {
  if (!started) return;
  const t0 = ctx.currentTime + delay;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(freq * 5, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 2, t0 + dur);
  const g = ctx.createGain();
  ramp(g.gain, t0, 0.18, dur * 0.35, dur * 0.55, vol);
  f.connect(g).connect(master);
  for (const detune of [-7, 5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(f);
    o.start(t0); o.stop(t0 + dur + 0.4);
  }
}

/* --------------------------------- sfx ----------------------------------------- */

export const sfx = {
  pickup(tier = 0) {
    bell(880 + tier * 210, { dur: 0.42, vol: 0.16, ratio: 2.01, index: 3 });
    noiseBurst({ dur: 0.05, vol: 0.07, from: 5200, to: 2600, q: 3 });
  },
  heavy() {
    tone(96, { type: 'sine', dur: 0.22, vol: 0.24, slide: -34, attack: 0.004 });
    noiseBurst({ dur: 0.13, vol: 0.1, from: 700, to: 130, q: 1.2 });
  },
  throw_(power) {
    noiseBurst({ dur: 0.3 + power * 0.12, vol: 0.16 + power * 0.13,
      from: 700 + power * 900, to: 2600 + power * 2600, q: 1.1, curve: 0.5 });
    tone(200 + power * 160, { type: 'triangle', dur: 0.18, vol: 0.09, slide: 240 });
  },
  land() {
    tone(130, { type: 'sine', dur: 0.11, vol: 0.14, slide: -50, attack: 0.003 });
    noiseBurst({ dur: 0.2, vol: 0.13, from: 900, to: 180, q: 0.9, curve: 1.8 });
  },
  bank(n = 0) {
    // a small cascade, climbing with the combo so a good haul sounds like a payout
    const step = [0, 4, 7, 12, 16][Math.min(4, n)];
    bell(523.25 * Math.pow(2, step / 12), { dur: 0.7, vol: 0.2, ratio: 1.5, index: 4 });
    bell(783.99 * Math.pow(2, step / 12), { dur: 0.9, vol: 0.13, ratio: 2.02, index: 3, delay: 0.07 });
    noiseBurst({ dur: 0.3, vol: 0.06, from: 7000, to: 3000, q: 2, delay: 0.02 });
  },
  dash() {
    noiseBurst({ dur: 0.26, vol: 0.18, from: 380, to: 3200, q: 1.6, curve: 0.4 });
    tone(150, { type: 'triangle', dur: 0.14, vol: 0.09, slide: 420 });
  },
  splash(big = false) {
    noiseBurst({ dur: big ? 0.75 : 0.3, vol: big ? 0.34 : 0.16,
      from: big ? 1600 : 2800, to: 180, q: 0.7, curve: big ? 1.4 : 2 });
    noiseBurst({ dur: big ? 0.5 : 0.2, vol: big ? 0.18 : 0.08,
      from: 6000, to: 1400, q: 1.2, type: 'highpass' });
    if (big) tone(70, { type: 'sine', dur: 0.7, vol: 0.24, slide: -22, attack: 0.02 });
  },
  /** Impact. Kept to a thud and a short crunch: square plus saw read as static. */
  hit() {
    tone(70, { type: 'sine', dur: 0.24, vol: 0.3, slide: -26, attack: 0.003 });
    tone(140, { type: 'triangle', dur: 0.16, vol: 0.13, slide: -46 });
    noiseBurst({ dur: 0.2, vol: 0.18, from: 1200, to: 140, q: 1.1, curve: 2 });
  },
  /** Something in the deep just noticed you. */
  wake() {
    growl(96, { dur: 1.0, vol: 0.26 });
    noiseBurst({ dur: 0.5, vol: 0.09, from: 900, to: 220, q: 0.8, curve: 1.4 });
  },
  /** The tide is closing. A ship's bell tolling, not a computer beep. */
  warn(step) {
    bell(step % 2 ? 1046 : 784, { dur: 1.0, vol: 0.17, ratio: 1.41, index: 6 });
  },
  /** The flood turns over. Deep horn out at sea, then the water arrives. */
  floodHorn() {
    horn(58, { dur: 2.0, vol: 0.3 });
    horn(87, { dur: 1.7, vol: 0.16, delay: 0.12 });
  },
  wipeout() {
    noiseBurst({ dur: 1.1, vol: 0.4, from: 2400, to: 70, q: 0.55, curve: 0.8 });
    tone(84, { type: 'sine', dur: 1.1, vol: 0.3, slide: -38, attack: 0.02 });
    tone(126, { type: 'triangle', dur: 0.9, vol: 0.12, slide: -58, delay: 0.05 });
  },
  win() {
    [0, 4, 7, 12].forEach((s, i) =>
      bell(523.25 * Math.pow(2, s / 12), { dur: 1.3, vol: 0.2, ratio: 1.5, index: 4, delay: i * 0.15 }));
    horn(131, { dur: 2.2, vol: 0.14, delay: 0.6 });
  },
  lose() {
    horn(49, { dur: 2.6, vol: 0.28 });
    tone(98, { type: 'triangle', dur: 1.6, vol: 0.1, slide: -22, attack: 0.15, delay: 0.3 });
  },
  ui() {
    tone(660, { type: 'triangle', dur: 0.05, vol: 0.1, attack: 0.002 });
    noiseBurst({ dur: 0.04, vol: 0.05, from: 3000, to: 1200, q: 2 });
  },
};

/* --------------------------------- music --------------------------------------- */

const TRACKS = { ebb: 'ebb.mp3', flood: 'flood.mp3', village: 'village.mp3' };
const raw = {};
const decoded = {};
let phase = null, voice = null;

/** Fetch the files during the model load, before there is an AudioContext. */
export async function prefetchMusic() {
  await Promise.all(Object.entries(TRACKS).map(async ([k, file]) => {
    try {
      const res = await fetch('./assets/audio/' + file);
      if (res.ok) raw[k] = await res.arrayBuffer();
    } catch { /* music is optional, the game still plays without it */ }
  }));
}

function decodeMusic() {
  for (const k of Object.keys(raw)) {
    ctx.decodeAudioData(raw[k], b => {
      decoded[k] = b;
      if (phase === k && !voice) startVoice(k);
    }, () => {});
  }
}

function startVoice(name, fade = 1.4) {
  const buf = decoded[name];
  if (!buf) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  // dodge the mp3 encoder's silent padding so the loop point does not click
  s.loopStart = 0.04;
  s.loopEnd = Math.max(0.2, buf.duration - 0.04);
  s.connect(g).connect(musicBus);
  s.start();
  voice = { src: s, gain: g };
}

function stopVoice(v, fade) {
  if (!v) return;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
  v.src.stop(t + fade + 0.05);
}

/** 'ebb' | 'flood' | 'village' | null. Crossfades, ignores repeats. */
export function setMusicPhase(name, fade = 1.2) {
  if (phase === name) return;
  phase = name;
  if (!started) return;
  stopVoice(voice, fade);
  voice = null;
  if (name) startVoice(name, fade);
}

/** intensity 0..1, drives the ocean bed and how far the music ducks under it. */
export function setMusicIntensity(v) { intensity = Math.max(0, Math.min(1, v)); }

export function updateMusic(dt) {
  if (!started) return;
  seaGain.gain.value += (0.07 + intensity * 0.17 - seaGain.gain.value) * Math.min(1, dt * 2);
  seaFilter.frequency.value += (420 + intensity * 1000 - seaFilter.frequency.value) * Math.min(1, dt * 2);
  const duck = 0.82 + (1 - intensity) * 0.18;
  musicBus.gain.value += (duck - musicBus.gain.value) * Math.min(1, dt * 2);
}
