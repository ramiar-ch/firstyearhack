// game/audio.js - game sounds made with Web Audio (no sound files needed).
//   engine hum (pitch follows speed, turns into a chiptune buzz in 1997 mode),
//   crash, pickup, mission passed/failed, warp, throw, thud, NICKED.
// Browsers only allow sound after the first key press / tap, so we start then.

let ctx = null, master = null, engine = null;

function start() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Engine: a low buzzing oscillator through a muffling filter.
    const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engine = { osc, gain, filter };
  } catch { ctx = null; }
}
addEventListener('keydown', start);
addEventListener('pointerdown', start);

/** A short beep: frequency (Hz), length (s), wave type, start delay (s), volume. */
function tone(freq, len, type = 'square', delay = 0, vol = 0.15, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + len + 0.05);
}

/** A burst of noise (crashes, whooshes). */
function noise(len, vol = 0.3, filterFreq = 800, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  crash() { noise(0.45, 0.6, 500); tone(90, 0.3, 'sine', 0, 0.3, 40); },
  pickup() { tone(660, 0.12); tone(990, 0.2, 'square', 0.1); },
  passed() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', i * 0.12, 0.13)); },
  failed() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', i * 0.18, 0.18)); },
  warp() { tone(200, 0.7, 'sawtooth', 0, 0.12, 2400); noise(0.6, 0.2, 3000, 0.1); },
  throw() { noise(0.35, 0.25, 2500); tone(500, 0.3, 'triangle', 0, 0.08, 150); },
  thud() { tone(70, 0.5, 'sine', 0, 0.5, 30); noise(0.3, 0.4, 300); },
  nicked() { [880, 660, 880, 660].forEach((f, i) => tone(f, 0.18, 'square', i * 0.2, 0.12)); tone(80, 0.8, 'sawtooth', 0.8, 0.2, 40); },
  scan() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'square', i * 0.07, 0.1)); },

  /** Call every frame: engine pitch from speed (m/s). retro = chiptune engine. */
  engine(speed, driving, retro) {
    if (!engine) return;
    const s = Math.min(1, Math.abs(speed) / 24);
    engine.osc.type = retro ? 'square' : 'sawtooth';
    engine.osc.frequency.setTargetAtTime(45 + s * 110, ctx.currentTime, 0.1);
    engine.filter.frequency.setTargetAtTime(retro ? 1800 : 400 + s * 900, ctx.currentTime, 0.1);
    engine.gain.gain.setTargetAtTime(driving ? 0.04 + s * 0.05 : 0, ctx.currentTime, 0.15);
  },
};
