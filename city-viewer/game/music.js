// game/music.js - "Strand FM 97.7": an ORIGINAL late-90s style soundtrack,
// made live with Web Audio (no music files, no copyrighted songs).
//   today:  breakbeat drums + rolling bassline + warm synth chords
//   1997:   the same tune as 8-bit chiptune (square waves, arpeggios)
// M turns the music on/off.

const BPM = 104;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
// A-minor groove, 32 steps (2 bars). Numbers = semitones above A1 (55 Hz), null = rest.
const BASS = [0, null, 0, 12, null, 0, 10, null, 0, null, 0, 12, 3, null, 5, 7,
  5, null, 5, 17, null, 5, 15, null, 3, null, 3, 15, 7, null, 10, 12];
const CHORDS = [[12, 15, 19], [12, 15, 19], [8, 12, 15], [10, 14, 17]]; // one per half bar: Am Am F G
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];

const hz = (semi) => 55 * Math.pow(2, semi / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.retro = false;
    this.step = 0;
    this.nextTime = 0;
  }

  start() {
    if (this.playing) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.16; // background level
        this.out.connect(this.ctx.destination);
        this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      this.ctx.resume();
      this.playing = true;
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25); // plan notes slightly ahead
    } catch { /* no audio */ }
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
  }

  toggle() {
    if (this.playing) this.stop(); else this.start();
    return this.playing;
  }

  schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 32;
      this.nextTime += STEP;
    }
  }

  playStep(i, t) {
    const r = this.retro;
    // Drums
    if (KICK[i % 16]) this.drum(t, 'kick');
    if (SNARE[i % 16]) this.drum(t, 'snare');
    if (i % 2 === 0) this.drum(t, 'hat');
    // Bass
    if (BASS[i] !== null) this.note(hz(BASS[i]), t, STEP * 1.8, r ? 'square' : 'sawtooth', r ? 0.22 : 0.35, r ? 2200 : 500);
    // Chords (today) or fast arpeggios (1997)
    const chord = CHORDS[Math.floor(i / 8)];
    if (r) this.note(hz(chord[i % 3] + 12), t, STEP * 0.9, 'square', 0.08, 4000);
    else if (i % 8 === 0) for (const n of chord) this.note(hz(n + 12), t, STEP * 7, 'triangle', 0.07, 1600);
  }

  note(freq, t, len, type, vol, cutoff) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  drum(t, kind) {
    const c = this.ctx, g = c.createGain();
    if (kind === 'kick') {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.22);
      return;
    }
    const src = c.createBufferSource(), f = c.createBiquadFilter();
    src.buffer = this.noiseBuf;
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const len = kind === 'hat' ? 0.04 : 0.15;
    g.gain.setValueAtTime(kind === 'hat' ? 0.18 : 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + len + 0.02);
  }
}
