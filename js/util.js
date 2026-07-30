// ---- math & helpers ----
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const KN2MS = 0.5144;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randPick = arr => arr[Math.floor(Math.random() * arr.length)];

// normalize angle to (-PI, PI]
function angNorm(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}
// signed shortest difference b-a
const angDiff = (a, b) => angNorm(b - a);

// heading 0 = up (north on screen), clockwise positive
const dirVec = a => ({ x: Math.sin(a), y: -Math.cos(a) });
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const bearingTo = (ax, ay, bx, by) => Math.atan2(bx - ax, -(by - ay));

// cheap smooth 1D noise
function makeNoise(seed = 1) {
  const h = n => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  return t => {
    const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  };
}

function fmtTime(sec) {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

// ---- tiny synth sounds ----
const Sound = {
  ctx: null, muted: false,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } },
  env(g, t, a, d, v = 0.2) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + a + d); },
  tone(freq, dur = 0.15, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.connect(g); g.connect(this.ctx.destination);
    this.env(g, t, 0.01, dur, vol);
    o.start(t); o.stop(t + dur + 0.1);
  },
  noise(dur = 0.3, vol = 0.15, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const n = this.ctx.sampleRate * dur, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = vol;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    s.connect(f); f.connect(g); g.connect(this.ctx.destination);
    s.start(t);
  },
  ding() { this.tone(880, 0.12, 'sine', 0.22); this.tone(1320, 0.25, 'sine', 0.18, 0.09); },
  star() { this.tone(660, 0.1, 'triangle', 0.2); this.tone(880, 0.1, 'triangle', 0.2, 0.08); this.tone(1100, 0.2, 'triangle', 0.2, 0.16); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.22, i * 0.13)); },
  splash() { this.noise(0.35, 0.25); },
  squirt() { this.tone(300, 0.08, 'square', 0.05); this.noise(0.12, 0.08); },
  thunk() { this.tone(120, 0.2, 'square', 0.25); this.noise(0.2, 0.15); },
  quack() { this.tone(330, 0.08, 'sawtooth', 0.15); this.tone(260, 0.1, 'sawtooth', 0.13, 0.09); },
  horn() { this.tone(220, 0.6, 'sawtooth', 0.18); this.tone(277, 0.6, 'sawtooth', 0.12); },
  buzz() { this.tone(140, 0.3, 'sawtooth', 0.15); },
};
