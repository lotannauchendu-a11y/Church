'use strict';
/* ============================================================
 * EMBER BRIGADE - core: constants, helpers, pixel-art toolkit
 * ============================================================ */

const TILE = 16;
const VIEW_H = 180;
let VIEW_W = 320;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('emberbrigade.' + k);
      return v === null ? d : JSON.parse(v);
    } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('emberbrigade.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
  },
};

/* ---------- palette ---------- */
const PAL = {
  '0': '#0e0e16', '1': '#22232f', '2': '#3a3d50', '3': '#5c6078', '4': '#8d92aa', '5': '#c2c7d8', '6': '#ffffff',
  r: '#a82430', R: '#ea4f48', o: '#d2691f', O: '#f59e38', y: '#f0c93e', Y: '#fff0a0',
  g: '#2c7a46', G: '#62bd58', l: '#b5e268', t: '#1c6f78', T: '#3cbcae', b: '#284c9c', B: '#4c8ce0', c: '#8fd6f7',
  p: '#633a9c', P: '#ab6cd8', k: '#d8588f', n: '#553623', N: '#855634', s: '#c48a58', S: '#f1c9a2', d: '#33241c',
  m: '#74203c', M: '#a83a58',
};
const col = (c) => PAL[c] || c;

/* ---------- canvases & sprites ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  return c;
}

function mkSprite(c) {
  return { c, w: c.width, h: c.height, f: null, wh: null, whf: null };
}

// rows: array of strings, one palette char per pixel ('.' = transparent)
function bake(rows, swap) {
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  const c = makeCanvas(w, rows.length);
  const x = c.getContext('2d');
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      let ch = r[i];
      if (ch === '.' || ch === ' ') continue;
      if (swap && swap[ch]) ch = swap[ch];
      const cc = PAL[ch];
      if (!cc) continue;
      x.fillStyle = cc;
      x.fillRect(i, j, 1, 1);
    }
  }
  return mkSprite(c);
}

function sprFlip(s) {
  if (!s.f) {
    const c = makeCanvas(s.w, s.h), x = c.getContext('2d');
    x.translate(s.w, 0); x.scale(-1, 1); x.drawImage(s.c, 0, 0);
    s.f = c;
  }
  return s.f;
}
function sprWhite(s, flip) {
  const key = flip ? 'whf' : 'wh';
  if (!s[key]) {
    const c = makeCanvas(s.w, s.h), x = c.getContext('2d');
    x.drawImage(flip ? sprFlip(s) : s.c, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#fff'; x.fillRect(0, 0, s.w, s.h);
    s[key] = c;
  }
  return s[key];
}
function drawSpr(ctx, s, x, y, flip, white) {
  if (!s) return;
  const img = white ? sprWhite(s, flip) : flip ? sprFlip(s) : s.c;
  ctx.drawImage(img, Math.round(x), Math.round(y));
}
// draw bottom-centre anchored
function drawSprBC(ctx, s, cx, by, flip, white) {
  if (!s) return;
  drawSpr(ctx, s, cx - s.w / 2, by - s.h, flip, white);
}

const SPR = {};

/* ---------- crisp pixel primitives ---------- */
function pxCirc(ctx, cx, cy, r, c) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  if (r < 0) return;
  ctx.fillStyle = col(c);
  if (r === 0) { ctx.fillRect(cx, cy, 1, 1); return; }
  const rr = r * r + r * 0.8;
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(rr - dy * dy));
    ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
  }
}
function pxLine(ctx, x0, y0, x1, y1, c, th = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = col(c);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const o = Math.floor((th - 1) / 2);
  let guard = 0;
  while (guard++ < 2000) {
    ctx.fillRect(x0 - o, y0 - o, th, th);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/* ---------- painter: procedural pixel art from boxes & balls ---------- */
class Painter {
  constructor(w, h) { this.cv = makeCanvas(w, h); this.x = this.cv.getContext('2d'); }
  r(x, y, w, h, c) { this.x.fillStyle = col(c); this.x.fillRect(x, y, w, h); return this; }
  px(x, y, c) { return this.r(x, y, 1, 1, c); }
  clear(x, y, w = 1, h = 1) { this.x.clearRect(x, y, w, h); return this; }
  // outlined box with a top-left highlight and a bottom-right shade
  box(x, y, w, h, base, hi, lo, ol = '0') {
    this.r(x, y, w, h, ol).r(x + 1, y + 1, w - 2, h - 2, base);
    if (hi && w > 3 && h > 3) { this.r(x + 1, y + 1, w - 2, 1, hi); this.r(x + 1, y + 1, 1, h - 2, hi); }
    if (lo && w > 3 && h > 3) { this.r(x + 1, y + h - 2, w - 2, 1, lo); this.r(x + w - 2, y + 1, 1, h - 2, lo); }
    return this;
  }
  // box with the four corner pixels knocked out
  rbox(x, y, w, h, base, hi, lo, ol = '0') {
    this.box(x, y, w, h, base, hi, lo, ol);
    this.clear(x, y).clear(x + w - 1, y).clear(x, y + h - 1).clear(x + w - 1, y + h - 1);
    this.px(x + 1, y + 1, ol).px(x + w - 2, y + 1, ol).px(x + 1, y + h - 2, ol).px(x + w - 2, y + h - 2, ol);
    return this;
  }
  circ(cx, cy, r, c) { pxCirc(this.x, cx, cy, r, c); return this; }
  ball(cx, cy, r, base, hi, lo, ol = '0') {
    pxCirc(this.x, cx, cy, r, ol);
    if (lo) { pxCirc(this.x, cx, cy, r - 1, lo); pxCirc(this.x, cx - 1, cy - 1, Math.max(0, r - 2), base); }
    else pxCirc(this.x, cx, cy, r - 1, base);
    if (hi && r > 2) {
      const k = Math.max(1, Math.round(r * 0.3));
      this.r(cx - Math.round(r * 0.45), cy - Math.round(r * 0.55), k, k, hi);
    }
    return this;
  }
  l(x0, y0, x1, y1, c, th = 1) { pxLine(this.x, x0, y0, x1, y1, c, th); return this; }
  // thick limb with outline
  limb(x0, y0, x1, y1, c, th = 3, ol = '0') {
    pxLine(this.x, x0, y0, x1, y1, ol, th + 2); pxLine(this.x, x0, y0, x1, y1, c, th); return this;
  }
  spr(s, x, y, flip) { this.x.drawImage(flip ? sprFlip(s) : s.c, x, y); return this; }
  rows(rows, x, y, swap) { this.x.drawImage(bake(rows, swap).c, x, y); return this; }
  // scatter rivets / speckles
  dots(x, y, w, h, c, n, seed = 1) {
    const rng = mulberry32(seed);
    for (let i = 0; i < n; i++) this.px(x + Math.floor(rng() * w), y + Math.floor(rng() * h), c);
    return this;
  }
  done() { return mkSprite(this.cv); }
}
const paint = (w, h, fn) => { const p = new Painter(w, h); fn(p); return p.done(); };

/* ---------- 5x7 bitmap font ---------- */
const FONT = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01110', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11110 00001 00001 01110 00001 00001 11110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  ':': '00000 01100 01100 00000 01100 01100 00000', '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000', '/': '00001 00001 00010 00100 01000 10000 10000',
  "'": '00100 00100 01000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '%': '11001 11010 00010 00100 01000 01011 10011',
  '>': '01000 00100 00010 00001 00010 00100 01000', '<': '00010 00100 01000 10000 01000 00100 00010',
  '*': '00000 10101 01110 11111 01110 10101 00000', x: '00000 00000 10001 01010 00100 01010 10001',
  '=': '00000 00000 11111 00000 11111 00000 00000', '~': '00000 00000 01010 10101 10101 01010 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111', '^': '00100 01110 10101 00100 00100 00100 00100',
};
const FONT_KEYS = Object.keys(FONT);
const FONT_IDX = {};
FONT_KEYS.forEach((k, i) => { FONT_IDX[k] = i; });
const fontCache = {};
function fontAtlas(color) {
  let a = fontCache[color];
  if (a) return a;
  a = makeCanvas(FONT_KEYS.length * 6, 7);
  const x = a.getContext('2d');
  x.fillStyle = color;
  FONT_KEYS.forEach((k, i) => {
    const rows = FONT[k].split(' ');
    for (let j = 0; j < 7; j++) for (let b = 0; b < 5; b++) if (rows[j][b] === '1') x.fillRect(i * 6 + b, j, 1, 1);
  });
  fontCache[color] = a;
  return a;
}
function textW(str, scale = 1) { return (String(str).length * 6 - 1) * scale; }
// align: 0 left, 1 centre, 2 right
function drawText(ctx, str, x, y, c = '6', scale = 1, align = 0) {
  str = String(str);
  const atlas = fontAtlas(col(c));
  x = Math.round(x); y = Math.round(y);
  if (align === 1) x -= Math.round(textW(str, scale) / 2);
  else if (align === 2) x -= textW(str, scale);
  for (let i = 0; i < str.length; i++) {
    let ch = str[i];
    if (ch !== ' ') {
      let idx = FONT_IDX[ch];
      if (idx === undefined) idx = FONT_IDX[ch.toUpperCase()];
      if (idx !== undefined) ctx.drawImage(atlas, idx * 6, 0, 5, 7, x, y, 5 * scale, 7 * scale);
    }
    x += 6 * scale;
  }
}
// text with a 1px drop shadow / outline for readability over the action
function drawTextS(ctx, str, x, y, c = '6', scale = 1, align = 0, sh = '0') {
  drawText(ctx, str, x + scale, y + scale, sh, scale, align);
  drawText(ctx, str, x, y, c, scale, align);
}
function drawTextO(ctx, str, x, y, c = '6', scale = 1, align = 0, ol = '0') {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) drawText(ctx, str, x + dx * scale, y + dy * scale, ol, scale, align);
  drawText(ctx, str, x, y, c, scale, align);
}
