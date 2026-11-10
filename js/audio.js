'use strict';
/* ============================================================
 * EMBER BRIGADE - synthesised sound effects + chiptune sequencer
 * (everything is generated with WebAudio, no audio files)
 * ============================================================ */

const SCALES = {
  min: [0, 2, 3, 5, 7, 8, 10],
  maj: [0, 2, 4, 5, 7, 9, 11],
  phr: [0, 1, 3, 5, 7, 8, 10],
};
const TOK = '0123456789abcdefghij';

const TRACKS = {
  title: {
    bpm: 112, root: 57, scale: 'min', chords: [0, 5, 2, 6],
    bass: 'r...r..r....o.r.', arp: '0.1.2.1.0.1.2.3.', drums: 'k...h...s...h.k.',
    lead: [
      '4--7--4-9--87-6-', '7---5-7-9-----..', '6--9--6-b--a9-8-', '8---6-8-a-----..',
      'b--a9-7-9--87-4-', '5-7-9---7-5-4---', '6-9-b---a-9-8---', '8---a---b-----..',
    ],
  },
  stageA: {
    bpm: 148, root: 52, scale: 'min', chords: [0, 0, 5, 6, 0, 0, 5, 4],
    bass: 'r.rr.rr.r.rr.ro.', arp: '0.1.2.1.0.1.2.3.', drums: 'k.h.s.h.kkh.s.h.',
    lead: [
      '7.7.67.4..467.9.', '8-7.6.4.6-7---..', '9.9.89.7..579.a.', 'a-9.8.6.8-a---..',
      'b.b.ab.9..79b.a.', '9-7.6.4.6-7---..', '5.7.9.c.b-a-9-7-', '8---6-8-b-----..',
    ],
  },
  stageB: {
    bpm: 132, root: 50, scale: 'min', chords: [0, 0, 3, 4, 0, 0, 5, 4],
    bass: 'r..r..r.r..r.o..', arp: '0..1..2.0..1..2.', drums: 'k..h..s.k.h.s..h',
    lead: [
      '4--3--2-0---..23', '4--6--4-3---....', '5--4--3-5---..35', '6--4--6-8---7-6-',
      '7--6--4-7---..78', '9--8--7-4---....', '5-7-9-7-5-7-9-c-', 'b---8---6---4-..',
    ],
  },
  stageC: {
    bpm: 140, root: 55, scale: 'maj', chords: [0, 4, 5, 3, 0, 4, 3, 4],
    bass: 'r.r.o.r.r.r.o.f.', arp: '0.2.1.2.0.2.1.3.', drums: 'k.h.s.hk.kh.s.hh',
    lead: [
      '7-9-b-9-7--47-9-', '8---6-4-8-----..', '9-7-5-7-9--ba-9-', 'a---9-7-5-----..',
      'b-9-7-9-b--cb-9-', '8---b-8-6---4-6-', '7-5-3-5-7-9-a-9-', '8-----8-b-----..',
    ],
  },
  boss: {
    bpm: 164, root: 52, scale: 'phr', chords: [0, 0, 1, 0, 0, 0, 1, 6],
    bass: 'rrorrorrrrorroro', arp: '0.2.1.2.0.2.1.2.', drums: 'k.hks.h.kkh.s.ss',
    lead: [
      '77.7.67.88.8.76.', '7---4---7-9-8-7-', '88.8.78.aa.a.98.', '7---4---7-----..',
      'bb.b.ab.cc.c.ba.', 'b---7---b-9-8-7-', '8.a.c.a.8.a.c.e.', 'd---a---8---6-..',
    ],
  },
};
// pre-parse lead bars into [degree|-1 (rest), lengthInSteps] per step
for (const k in TRACKS) {
  const t = TRACKS[k];
  t.leadP = t.lead.map((bar) => {
    const out = [];
    for (let i = 0; i < 16; i++) {
      const ch = bar[i];
      if (ch === '.' || ch === '-' || ch === undefined) { out.push(null); continue; }
      let len = 1;
      while (i + len < 16 && bar[i + len] === '-') len++;
      out.push([TOK.indexOf(ch), len]);
    }
    return out;
  });
}

const JINGLES = {
  clear: { type: 'square', notes: [[72, 0, 0.12], [76, 0.12, 0.12], [79, 0.24, 0.12], [84, 0.36, 0.3], [79, 0.7, 0.12], [84, 0.84, 0.6]], bass: [[48, 0, 0.36], [55, 0.36, 0.34], [48, 0.84, 0.6]] },
  over: { type: 'triangle', notes: [[69, 0, 0.3], [67, 0.3, 0.3], [64, 0.6, 0.3], [62, 0.9, 0.3], [60, 1.2, 0.3], [57, 1.5, 0.9]], bass: [[45, 0, 1.2], [33, 1.5, 0.9]] },
};

const Snd = {
  ac: null, master: null, sfxG: null, musG: null, noiseBuf: null,
  sfxOn: store.get('sfx', true), musOn: store.get('mus', true),
  want: null, seq: null, timer: null, last: {},

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ac = (this.ac = new AC());
      this.master = ac.createGain(); this.master.gain.value = 0.55; this.master.connect(ac.destination);
      this.sfxG = ac.createGain(); this.sfxG.gain.value = 0.9; this.sfxG.connect(this.master);
      this.musG = ac.createGain(); this.musG.gain.value = 0.55; this.musG.connect(this.master);
      const len = ac.sampleRate;
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.want) { const w = this.want; this.want = null; this.music(w); }
    } catch (e) { this.ac = null; }
  },
  suspend(on) {
    if (!this.ac) return;
    try { if (on) this.ac.suspend(); else this.ac.resume(); } catch (e) { /* ignore */ }
  },

  tone(type, f0, f1, dur, vol, delay = 0, dest) {
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, f0, f1, delay = 0, ftype = 'lowpass', dest) {
    const ac = this.ac, t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxG);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },

  play(name) {
    if (!this.ac || !this.sfxOn || this.ac.state !== 'running') return;
    const now = this.ac.currentTime;
    if (this.last[name] && now - this.last[name] < 0.045) return;
    this.last[name] = now;
    const T = (a, b, c, d, e, f) => this.tone(a, b, c, d, e, f);
    const N = (a, b, c, d, e, f) => this.noise(a, b, c, d, e, f);
    switch (name) {
      case 'shot': T('square', 900, 240, 0.08, 0.13); break;
      case 'mg': T('square', 620, 170, 0.05, 0.11); N(0.04, 0.07, 3000, 900); break;
      case 'scatter': N(0.2, 0.3, 2600, 260); T('square', 280, 70, 0.14, 0.14); break;
      case 'flame': N(0.14, 0.1, 700, 380); break;
      case 'rocket': N(0.3, 0.18, 400, 1600); T('sawtooth', 210, 80, 0.26, 0.11); break;
      case 'laser': T('sawtooth', 1700, 320, 0.14, 0.1); T('square', 850, 160, 0.14, 0.05); break;
      case 'eshot': T('square', 480, 300, 0.07, 0.05); break;
      case 'hit': T('square', 320, 150, 0.04, 0.09); break;
      case 'block': T('triangle', 1500, 1100, 0.05, 0.12); break;
      case 'pop': N(0.14, 0.2, 1800, 200); T('square', 220, 70, 0.1, 0.12); break;
      case 'boom': N(0.38, 0.36, 1300, 70); T('sine', 130, 40, 0.3, 0.4); break;
      case 'bigboom': N(0.9, 0.5, 1600, 45); T('sine', 110, 28, 0.8, 0.5); N(0.3, 0.2, 4000, 800, 0.05); break;
      case 'pick': T('square', 660, 660, 0.06, 0.1); T('square', 990, 990, 0.1, 0.1, 0.06); break;
      case 'power': [523, 659, 784, 1047].forEach((f, i) => T('square', f, f, 0.08, 0.1, i * 0.06)); break;
      case 'hp': T('triangle', 520, 780, 0.12, 0.16); T('triangle', 780, 1040, 0.16, 0.16, 0.1); break;
      case 'oneup': [784, 988, 1175, 1568, 1976].forEach((f, i) => T('square', f, f, 0.09, 0.1, i * 0.07)); break;
      case 'jump': T('square', 250, 520, 0.11, 0.06); break;
      case 'hurt': T('sawtooth', 420, 90, 0.26, 0.18); N(0.12, 0.15, 1500, 300); break;
      case 'die': [440, 330, 247, 165].forEach((f, i) => T('square', f, f * 0.7, 0.16, 0.14, i * 0.13)); break;
      case 'gren': T('triangle', 520, 260, 0.12, 0.1); break;
      case 'select': T('square', 720, 720, 0.045, 0.09); break;
      case 'start': [392, 523, 659, 784].forEach((f, i) => T('square', f, f, 0.1, 0.11, i * 0.07)); break;
      case 'warn': for (let i = 0; i < 3; i++) { T('square', 620, 620, 0.16, 0.1, i * 0.4); T('square', 440, 440, 0.16, 0.1, i * 0.4 + 0.2); } break;
      case 'pip': T('square', 880, 1320, 0.08, 0.09); T('square', 1320, 1760, 0.1, 0.09, 0.09); break;
      case 'charge': T('sawtooth', 120, 900, 0.7, 0.09); break;
      case 'beam': N(0.5, 0.25, 3000, 600); T('sawtooth', 90, 60, 0.5, 0.2); break;
      case 'stomp': N(0.2, 0.3, 500, 60); T('sine', 90, 35, 0.22, 0.4); break;
      default: break;
    }
  },

  /* ---------- music ---------- */
  mnote(midi, time, dur, type, vol) {
    const ac = this.ac, f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.setValueAtTime(vol * 0.7, time + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    o.connect(g); g.connect(this.musG);
    o.start(time); o.stop(time + dur + 0.02);
  },
  drum(kind, time) {
    const ac = this.ac;
    if (kind === 'k') {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(42, time + 0.11);
      g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
      o.connect(g); g.connect(this.musG); o.start(time); o.stop(time + 0.15);
    } else {
      const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
      const f = ac.createBiquadFilter(), g = ac.createGain();
      const snare = kind === 's';
      f.type = snare ? 'bandpass' : 'highpass'; f.frequency.value = snare ? 1900 : 7500;
      const d = snare ? 0.1 : 0.03;
      g.gain.setValueAtTime(snare ? 0.2 : 0.07, time); g.gain.exponentialRampToValueAtTime(0.0001, time + d);
      s.connect(f); f.connect(g); g.connect(this.musG); s.start(time, Math.random() * 0.5); s.stop(time + d + 0.02);
    }
  },
  degToMidi(t, d) {
    const sc = SCALES[t.scale];
    return t.root + 12 * Math.floor(d / 7) + sc[((d % 7) + 7) % 7];
  },
  step(s, time, spb) {
    const t = s.t, bars = t.leadP.length;
    const bar = Math.floor(s.step / 16) % bars, i = s.step % 16;
    const chord = t.chords[bar % t.chords.length];
    const lead = t.leadP[bar][i];
    if (lead) this.mnote(this.degToMidi(t, lead[0]) + 12, time, lead[1] * spb * 0.95, 'square', 0.075);
    const b = t.bass[i];
    if (b && b !== '.') {
      let m = this.degToMidi(t, chord) - 12;
      if (b === 'o') m += 12; else if (b === 'f') m = this.degToMidi(t, chord + 4) - 12;
      this.mnote(m, time, spb * 0.9, 'triangle', 0.2);
    }
    const a = t.arp[i];
    if (a && a !== '.') {
      const n = +a;
      const m = n === 3 ? this.degToMidi(t, chord) + 12 : this.degToMidi(t, chord + n * 2);
      this.mnote(m + 12, time, spb * 0.8, 'square', 0.028);
    }
    const dr = t.drums[i];
    if (dr && dr !== '.') this.drum(dr, time);
  },
  pump() {
    const s = this.seq;
    if (!s || !this.ac || this.ac.state !== 'running') return;
    const spb = 60 / s.t.bpm / 4;
    if (s.next < this.ac.currentTime - 0.3) s.next = this.ac.currentTime + 0.05; // tab was asleep: resync
    while (s.next < this.ac.currentTime + 0.18) { this.step(s, s.next, spb); s.next += spb; s.step++; }
  },
  music(name) {
    if (this.want === name && (this.seq || !name)) return;
    this.want = name;
    this.seq = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!this.ac || !this.musOn || !name || !TRACKS[name]) return;
    this.seq = { t: TRACKS[name], step: 0, next: this.ac.currentTime + 0.08 };
    this.timer = setInterval(() => this.pump(), 30);
  },
  stopMusic() { this.music(null); },
  jingle(name) {
    if (!this.ac || !this.musOn) return;
    const j = JINGLES[name], t0 = this.ac.currentTime + 0.05;
    for (const [m, at, d] of j.notes) this.mnote(m, t0 + at, d, j.type, 0.1);
    for (const [m, at, d] of j.bass) this.mnote(m, t0 + at, d, 'triangle', 0.2);
  },
  setMusic(on) {
    this.musOn = on; store.set('mus', on);
    const w = this.want; this.want = null; this.seq = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (w) { if (on) this.music(w); else this.want = w; }
  },
  setSfx(on) { this.sfxOn = on; store.set('sfx', on); },
};
