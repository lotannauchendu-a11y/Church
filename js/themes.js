'use strict';
/* ============================================================
 * EMBER BRIGADE - themes: skies, parallax layers, tilesets, props
 * ============================================================ */

const BG_W = 512;

/* ---------- parallax layer generators (all tile horizontally at BG_W) ---------- */
const BGGEN = {
  ridge(x, W, H, rng, o) {
    const ph = o.f.map(() => rng() * 6.2832);
    for (let i = 0; i < W; i++) {
      let v = 0;
      o.f.forEach((f, k) => { v += (o.amp / (k + 1)) * Math.sin((6.2832 * f * i) / W + ph[k]); });
      if (o.plateau) v = Math.round(v / o.plateau) * o.plateau;
      const st = o.step || 1;
      const h = Math.round((o.base - v) / st) * st;
      x.fillStyle = o.col; x.fillRect(i, h, 1, H - h);
      if (o.hi) { x.fillStyle = o.hi; x.fillRect(i, h, 1, o.hiH || 2); }
      if (o.snow !== undefined && h < o.snow) { x.fillStyle = '#ffffff'; x.fillRect(i, h, 1, Math.min(7, Math.floor((o.snow - h) * 0.45) + 1)); }
    }
  },
  skyline(x, W, H, rng, o) {
    let i = 0;
    while (i < W) {
      let bw = 14 + Math.floor(rng() * 22);
      if (i + bw > W - 12) bw = W - i;
      const bh = o.minH + Math.floor(rng() * (o.maxH - o.minH));
      const top = o.base - bh;
      x.fillStyle = o.col; x.fillRect(i, top, bw, H - top);
      if (rng() < 0.4) x.fillRect(i + 3, top - 5, 2, 5);
      if (rng() < 0.3 && bw > 12) x.fillRect(i + bw - 9, top - 3, 6, 3);
      if (o.win) {
        for (let wy = top + 3; wy < H - 4; wy += 5) {
          for (let wx = i + 2; wx < i + bw - 3; wx += 4) {
            if (rng() < o.lit) { x.fillStyle = rng() < 0.8 ? o.win : o.win2 || o.win; x.fillRect(wx, wy, 2, 2); }
          }
        }
      }
      i += bw + (rng() < 0.3 ? 2 : 0);
    }
  },
  forest(x, W, H, rng, o) {
    let i = 10;
    while (i < W - 20) {
      const tw = 5 + Math.floor(rng() * 8);
      x.fillStyle = o.col; x.fillRect(i, 0, tw, o.base);
      x.fillRect(i - 2, o.base - 7, tw + 4, 7); x.fillRect(i - 4, o.base - 3, tw + 8, 3);
      if (o.hi) { x.fillStyle = o.hi; x.fillRect(i, 0, 1, o.base - 6); }
      i += tw + 16 + Math.floor(rng() * 36);
    }
    x.fillStyle = o.col; x.fillRect(0, o.base, W, H - o.base);
    for (let k = 0; k < 46; k++) {
      const cx = rng() * W, cy = rng() * o.canopy, r = 8 + rng() * 12;
      for (const dx of [-W, 0, W]) pxCirc(x, cx + dx, cy, r, o.leaf);
    }
    x.fillStyle = o.leaf;
    for (let k = 0; k < 26; k++) x.fillRect(Math.floor(rng() * W), o.canopy - 4, 1, 10 + Math.floor(rng() * 34));
  },
  clouds(x, W, H, rng, o) {
    for (let k = 0; k < o.n; k++) {
      const cx = rng() * W, cy = o.y0 + rng() * (o.y1 - o.y0), n = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const r = 4 + rng() * (o.r || 7), ox = (j - (n - 1) / 2) * 8;
        for (const dx of [-W, 0, W]) {
          if (o.col2) pxCirc(x, cx + ox + dx, cy - r + 2, r, o.col2);
          pxCirc(x, cx + ox + dx, cy - r, r, o.col);
        }
      }
    }
  },
  cave(x, W, H, rng, o) {
    const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    for (let i = 0; i < W; i++) {
      const v = 10 * Math.sin((6.2832 * 2 * i) / W + ph[0]) + 6 * Math.sin((6.2832 * 5 * i) / W + ph[1]) + 3 * Math.sin((6.2832 * 11 * i) / W + ph[2]);
      const c = Math.round(o.ceil + v), fl = Math.round(o.base - v * 0.7);
      x.fillStyle = o.col; x.fillRect(i, 0, 1, c); x.fillRect(i, fl, 1, H - fl);
    }
    for (let k = 0; k < 16; k++) { // stalactites
      const sx = Math.floor(rng() * (W - 12)) + 4, len = 12 + Math.floor(rng() * 30), w = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < len; j++) { const ww = Math.max(1, Math.round(w * (1 - j / len))); x.fillStyle = o.col; x.fillRect(sx - ww, o.ceil - 6 + j, ww * 2, 1); }
    }
    for (let k = 0; k < (o.crystals || 0); k++) {
      const cx = Math.floor(rng() * (W - 16)) + 8, cy = o.base - 4 - Math.floor(rng() * 10), hh = 5 + Math.floor(rng() * 7);
      for (let j = -hh; j <= hh; j++) {
        const ww = Math.max(0, Math.round(3 * (1 - Math.abs(j) / hh)));
        x.fillStyle = o.cry; x.fillRect(cx - ww, cy + j, ww * 2 + 1, 1);
        x.fillStyle = o.cry2; x.fillRect(cx - ww, cy + j, 1, 1);
      }
    }
  },
  factory(x, W, H, rng, o) {
    let i = 4;
    while (i < W - 40) {
      const kind = rng();
      if (kind < 0.35) {
        const cw = 8 + Math.floor(rng() * 6), ch = 60 + Math.floor(rng() * 50);
        x.fillStyle = o.col; x.fillRect(i, o.base - ch, cw, ch); x.fillRect(i - 1, o.base - ch, cw + 2, 3);
        if (o.glow) { x.fillStyle = o.glow; x.fillRect(i + 2, o.base - ch + 7, cw - 4, 2); }
        i += cw + 10;
      } else if (kind < 0.7) {
        const r = 12 + Math.floor(rng() * 10);
        pxCirc(x, i + r, o.base - r - 10, r, o.col);
        x.fillStyle = o.col; x.fillRect(i, o.base - r - 10, r * 2 + 1, r + 10); x.fillRect(i + r - 1, o.base - 2 * r - 18, 3, 10);
        if (o.hi) { x.fillStyle = o.hi; x.fillRect(i + 2, o.base - r - 6, r * 2 - 3, 1); }
        i += r * 2 + 12;
      } else {
        const bw = 30 + Math.floor(rng() * 30), bh = 24 + Math.floor(rng() * 30);
        x.fillStyle = o.col; x.fillRect(i, o.base - bh, bw, bh);
        for (let wx = i + 4; wx < i + bw - 6; wx += 8) if (rng() < 0.55) { x.fillStyle = o.glow; x.fillRect(wx, o.base - bh + 6, 4, 3); }
        i += bw + 8;
      }
    }
    x.fillStyle = o.col; x.fillRect(0, o.base - 14, W, 3); x.fillRect(0, o.base, W, H - o.base);
  },
  harbor(x, W, H, rng, o) {
    for (let cx = 60; cx < W - 60; cx += 170) {
      x.fillStyle = o.col;
      x.fillRect(cx, o.base - 90, 4, 90); x.fillRect(cx + 26, o.base - 90, 4, 90);
      x.fillRect(cx - 30, o.base - 93, 100, 4); x.fillRect(cx + 10, o.base - 104, 9, 12);
      pxLine(x, cx + 2, o.base - 60, cx + 27, o.base - 30, o.col, 1); pxLine(x, cx + 27, o.base - 60, cx + 2, o.base - 30, o.col, 1);
      x.fillRect(cx + 56, o.base - 89, 1, 30); x.fillRect(cx + 54, o.base - 59, 5, 4);
    }
    let i = 2;
    while (i < W - 26) {
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        x.fillStyle = o.cols[Math.floor(rng() * o.cols.length)]; x.fillRect(i, o.base - (k + 1) * 9, 22, 8);
        x.fillStyle = o.col; for (let s = 3; s < 22; s += 4) x.fillRect(i + s, o.base - (k + 1) * 9 + 1, 1, 6);
      }
      i += 24 + (rng() < 0.3 ? 14 : 0);
    }
    x.fillStyle = o.col; x.fillRect(0, o.base, W, H - o.base);
  },
  tech(x, W, H, rng, o) {
    x.fillStyle = o.col; x.fillRect(0, 0, W, H);
    for (let px = 0; px < W; px += 32) {
      for (let py = 0; py < H; py += 24) {
        x.fillStyle = o.line; x.fillRect(px, py, 32, 1); x.fillRect(px, py, 1, 24);
        if (rng() < 0.25) { x.fillStyle = o.glow; x.fillRect(px + 6 + Math.floor(rng() * 16), py + 8 + Math.floor(rng() * 8), 6, 2); }
        if (rng() < 0.15) { x.fillStyle = o.dark; x.fillRect(px + 8, py + 6, 16, 12); }
      }
    }
    for (let cx = 40; cx < W; cx += 128) {
      x.fillStyle = o.dark; x.fillRect(cx, 0, 14, H);
      x.fillStyle = o.line; x.fillRect(cx, 0, 1, H); x.fillRect(cx + 13, 0, 1, H);
      x.fillStyle = o.glow; for (let cy = 10; cy < H; cy += 30) x.fillRect(cx + 5, cy, 4, 8);
    }
  },
  poles(x, W, H, rng, o) { // telegraph poles / pylons whipping past
    for (let cx = 20; cx < W; cx += o.gap) {
      x.fillStyle = o.col; x.fillRect(cx, o.top, 3, H - o.top); x.fillRect(cx - 8, o.top + 4, 19, 2); x.fillRect(cx - 5, o.top + 12, 13, 2);
    }
    x.fillStyle = o.col;
    for (let i = 0; i < W; i++) { const sag = Math.round(5 * Math.sin((Math.PI * ((i - 20 + o.gap * 8) % o.gap)) / o.gap)); x.fillRect(i, o.top + 5 + sag, 1, 1); }
  },
};

/* ---------- theme table ---------- */
const THEMES = {
  desert: {
    sky: [['#4f9bd4', 34], ['#7cbbe0', 64], ['#b5d8e2', 92], ['#efe3bd', 118], ['#f4d090', 180]],
    orb: { x: 0.72, y: 34, r: 12, c: '#fff6cf', glow: '#ffe9a0' },
    layers: [
      { gen: 'clouds', par: 0.05, o: { n: 7, y0: 24, y1: 70, col: '#ffffff', col2: '#d8e8ee' }, seed: 3 },
      { gen: 'ridge', par: 0.12, o: { base: 104, amp: 22, f: [1, 3, 7], plateau: 8, col: '#d89a5a', hi: '#eab474', step: 2 }, seed: 11 },
      { gen: 'ridge', par: 0.3, o: { base: 132, amp: 12, f: [2, 5], col: '#c07a3e', hi: '#d99552' }, seed: 5 },
    ],
    tile: { style: 'earth', top: '#f0d078', topHi: '#fff0a8', top2: '#d9a852', fill: '#b87a3a', fill2: '#9a6030', fill3: '#7a4826', fillHi: '#d09050', plat: '#a8703a', platHi: '#d09a58', plat2: '#6e4424' },
    weather: 'dust', music: 'stageA',
  },
  swamp: {
    sky: [['#16302f', 30], ['#22483f', 60], ['#35664d', 95], ['#5c8a5e', 130], ['#8faa72', 180]],
    layers: [
      { gen: 'ridge', par: 0.1, o: { base: 110, amp: 14, f: [2, 5, 9], col: '#2a5a48', step: 2 }, seed: 21 },
      { gen: 'forest', par: 0.25, o: { base: 150, canopy: 34, col: '#1c3d34', hi: '#285244', leaf: '#1f4a38' }, seed: 8 },
      { gen: 'forest', par: 0.5, o: { base: 168, canopy: 22, col: '#12292a', leaf: '#153228' }, seed: 15 },
    ],
    tile: { style: 'earth', top: '#7dc050', topHi: '#b5e268', top2: '#4a8f3c', fill: '#5a4630', fill2: '#473626', fill3: '#35281c', fillHi: '#70583c', plat: '#6e5030', platHi: '#94703f', plat2: '#3e2c1c', grass: '#62bd58' },
    liquid: ['#3f7a5a', '#6fb58a', '#2c5a44'],
    weather: 'spores', music: 'stageB',
  },
  harbor: {
    sky: [['#35295a', 24], ['#64396f', 48], ['#a84c78', 76], ['#e3705c', 104], ['#f5a058', 134], ['#f9cf7a', 180]],
    orb: { x: 0.3, y: 118, r: 17, c: '#fff3b8', glow: '#fbd98a' },
    layers: [
      { gen: 'clouds', par: 0.04, o: { n: 6, y0: 40, y1: 90, col: '#f7b98a', col2: '#c9728a', r: 6 }, seed: 9 },
      { gen: 'skyline', par: 0.1, o: { base: 150, minH: 12, maxH: 44, col: '#6b3a6a' }, seed: 2 },
      { gen: 'harbor', par: 0.3, o: { base: 150, col: '#3a2648', cols: ['#7a3a52', '#4a4a7a', '#3f6a6a', '#8a5a3a'] }, seed: 4 },
    ],
    tile: { style: 'metal', top: '#9aa3b5', topHi: '#d4dae6', top2: '#4a4e62', fill: '#5a5f73', fill2: '#434759', fill3: '#30333f', fillHi: '#72788e', plat: '#7d869c', platHi: '#c2c7d8', plat2: '#3a3d50' },
    liquid: ['#2a5a9e', '#6fb0e8', '#1e437a'],
    weather: 'none', music: 'stageC',
  },
  train: {
    sky: [['#356fc4', 32], ['#5492dc', 66], ['#86bbea', 100], ['#c0e0f2', 180]],
    orb: { x: 0.2, y: 30, r: 10, c: '#ffffff', glow: '#e4f2ff' },
    layers: [
      { gen: 'clouds', par: 0.04, o: { n: 9, y0: 26, y1: 96, col: '#ffffff', col2: '#cfe4f4' }, seed: 31 },
      { gen: 'ridge', par: 0.08, o: { base: 120, amp: 20, f: [1, 2, 5], col: '#6f9a8c', hi: '#8db6a4', snow: 104 }, seed: 17, auto: 0.15 },
      { gen: 'ridge', par: 0.2, o: { base: 146, amp: 8, f: [2, 3, 7], col: '#5d8a4e', hi: '#7dab5c' }, seed: 6, auto: 0.6 },
      { gen: 'poles', par: 0.5, o: { gap: 128, top: 96, col: '#2f3f4a' }, seed: 1, auto: 2.4 },
    ],
    tile: { style: 'metal', top: '#b0b6c4', topHi: '#e6e9f0', top2: '#4d5160', fill: '#8a3f30', fill2: '#6a2e24', fill3: '#4a1f1a', fillHi: '#a85542', plat: '#8d92aa', platHi: '#c2c7d8', plat2: '#3a3d50' },
    weather: 'wind', music: 'stageA',
  },
  cavern: {
    sky: [['#0c0a18', 60], ['#131028', 120], ['#1a1638', 180]],
    layers: [
      { gen: 'cave', par: 0.15, o: { ceil: 36, base: 150, col: '#1f1a40', crystals: 0 }, seed: 12 },
      { gen: 'cave', par: 0.35, o: { ceil: 22, base: 162, col: '#2a2352', crystals: 14, cry: '#3cbcae', cry2: '#b9f5e6' }, seed: 44 },
    ],
    tile: { style: 'earth', top: '#7a6aa8', topHi: '#a898d0', top2: '#54487a', fill: '#3c3358', fill2: '#2e2746', fill3: '#221c36', fillHi: '#4e4470', plat: '#5a4e86', platHi: '#8a7cba', plat2: '#2a2344' },
    weather: 'spores', music: 'stageB',
  },
  frost: {
    sky: [['#5e80ba', 32], ['#88a8d2', 66], ['#b8cde6', 100], ['#e2ecf6', 180]],
    orb: { x: 0.6, y: 44, r: 11, c: '#ffffff', glow: '#dfeaf8' },
    layers: [
      { gen: 'ridge', par: 0.08, o: { base: 110, amp: 34, f: [1, 3, 6], col: '#7f9cc4', snow: 112, step: 2 }, seed: 23 },
      { gen: 'ridge', par: 0.22, o: { base: 138, amp: 16, f: [2, 5, 8], col: '#5f7fae', snow: 136 }, seed: 7 },
      { gen: 'ridge', par: 0.45, o: { base: 164, amp: 6, f: [3, 7], col: '#e9f1fa', hi: '#ffffff' }, seed: 19 },
    ],
    tile: { style: 'earth', top: '#ffffff', topHi: '#ffffff', top2: '#c5d8ee', fill: '#6f86a8', fill2: '#5a7092', fill3: '#465a7a', fillHi: '#8aa0c0', plat: '#9fb8d8', platHi: '#ffffff', plat2: '#4c6488' },
    weather: 'snow', music: 'stageC',
  },
  foundry: {
    sky: [['#190d10', 46], ['#2e1318', 96], ['#4f1e1a', 138], ['#742b18', 180]],
    layers: [
      { gen: 'factory', par: 0.12, o: { base: 150, col: '#3a1a1c', glow: '#f59e38' }, seed: 13 },
      { gen: 'factory', par: 0.3, o: { base: 166, col: '#22100f', glow: '#ea4f48', hi: '#3a1c18' }, seed: 29 },
    ],
    tile: { style: 'metal', top: '#8d8478', topHi: '#c9bfae', top2: '#3e342e', fill: '#4a3a36', fill2: '#382a28', fill3: '#261c1c', fillHi: '#5e4a44', plat: '#7a6e62', platHi: '#b5a998', plat2: '#2e2420' },
    liquid: ['#f59e38', '#fff0a0', '#d2691f'],
    weather: 'embers', music: 'stageB',
  },
  city: {
    sky: [['#090d2a', 38], ['#121844', 76], ['#20275f', 112], ['#363470', 146], ['#4f3c78', 180]],
    stars: 70,
    orb: { x: 0.78, y: 36, r: 13, c: '#f4f1d8', glow: '#3a4486' },
    layers: [
      { gen: 'skyline', par: 0.08, o: { base: 150, minH: 30, maxH: 90, col: '#1a1f52', win: '#3d4690', lit: 0.3 }, seed: 33 },
      { gen: 'skyline', par: 0.22, o: { base: 166, minH: 24, maxH: 76, col: '#11143a', win: '#f0c93e', win2: '#8fd6f7', lit: 0.22 }, seed: 10 },
    ],
    tile: { style: 'brick', top: '#a0a4b0', topHi: '#d6d9e0', top2: '#4c4f5c', fill: '#6a4a5a', fill2: '#3c2a38', fill3: '#553a4a', fillHi: '#7d5a6a', plat: '#7d869c', platHi: '#c2c7d8', plat2: '#3a3d50' },
    weather: 'rain', music: 'stageA',
  },
  carrier: {
    sky: [['#28489a', 28], ['#4878cc', 58], ['#86b0e6', 92], ['#efc8a2', 124], ['#f5a868', 180]],
    orb: { x: 0.5, y: 126, r: 20, c: '#fff4c4', glow: '#fbd493' },
    layers: [
      { gen: 'clouds', par: 0.03, o: { n: 8, y0: 60, y1: 120, col: '#ffe9cf', col2: '#e0a890', r: 9 }, seed: 40, auto: 0.1 },
      { gen: 'clouds', par: 0.1, o: { n: 9, y0: 120, y1: 176, col: '#fff6e8', col2: '#f0bfa0', r: 12 }, seed: 41, auto: 0.35 },
      { gen: 'clouds', par: 0.25, o: { n: 7, y0: 160, y1: 200, col: '#ffffff', col2: '#f4d4bc', r: 16 }, seed: 42, auto: 0.9 },
    ],
    tile: { style: 'metal', top: '#b8c4d4', topHi: '#f2f5fa', top2: '#4c586e', fill: '#4a5a78', fill2: '#3a4862', fill3: '#2a3448', fillHi: '#62749a', plat: '#8d9ab2', platHi: '#dfe6f0', plat2: '#36425a' },
    weather: 'wind', music: 'stageC',
  },
  citadel: {
    sky: [['#10101c', 180]],
    layers: [
      { gen: 'tech', par: 0.2, o: { col: '#17152a', line: '#221f3c', dark: '#0e0d1c', glow: '#633a9c' }, seed: 50 },
      { gen: 'tech', par: 0.45, o: { col: 'rgba(0,0,0,0)', line: 'rgba(0,0,0,0)', dark: '#201b3a', glow: '#ab6cd8' }, seed: 51, clip: 1 },
    ],
    tile: { style: 'metal', top: '#8a7fb0', topHi: '#c9c0e8', top2: '#352d54', fill: '#352d50', fill2: '#28213e', fill3: '#1a162a', fillHi: '#4a406c', plat: '#7a6fa2', platHi: '#c0b6e0', plat2: '#2a2344' },
    liquid: ['#ab6cd8', '#f0d8ff', '#633a9c'],
    weather: 'none', music: 'stageB',
  },
};

/* ---------- build a theme's canvases on demand ---------- */
function buildTheme(name) {
  const t = THEMES[name];
  if (t.built) return t;
  // sky
  const sky = makeCanvas(400, VIEW_H), sx = sky.getContext('2d');
  let y0 = 0;
  t.sky.forEach(([c, y1], idx) => {
    sx.fillStyle = c; sx.fillRect(0, y0, 400, y1 - y0);
    if (idx > 0) { // dithered seam
      for (let i = 0; i < 400; i += 2) { sx.fillRect(i, y0 - 1, 1, 1); sx.fillRect(i + 1, y0 - 3, 1, 1); }
      sx.fillStyle = t.sky[idx - 1][0];
      for (let i = 0; i < 400; i += 2) { sx.fillRect(i + 1, y0, 1, 1); sx.fillRect(i, y0 + 2, 1, 1); }
    }
    y0 = y1;
  });
  if (t.stars) {
    const rng = mulberry32(77);
    for (let i = 0; i < t.stars; i++) { sx.fillStyle = rng() < 0.3 ? '#ffffff' : '#8a94d0'; sx.fillRect(Math.floor(rng() * 400), Math.floor(rng() * 110), 1, 1); }
  }
  t.skyC = sky;
  // parallax layers
  t.layerC = t.layers.map((l) => {
    const c = makeCanvas(BG_W, VIEW_H + 24), x = c.getContext('2d');
    BGGEN[l.gen](x, BG_W, VIEW_H + 24, mulberry32(l.seed * 7919 + 13), l.o);
    return c;
  });
  // tiles
  const ts = t.tile, rng = mulberry32(name.length * 131 + 7);
  const mk = (fn) => { const c = makeCanvas(16, 16); fn(c.getContext('2d')); return c; };
  const fillBase = (x, v) => {
    x.fillStyle = ts.fill; x.fillRect(0, 0, 16, 16);
    if (ts.style === 'earth') {
      for (let k = 0; k < 9; k++) { x.fillStyle = ts.fill2; x.fillRect(Math.floor(rng() * 15), Math.floor(rng() * 16), 2, 1); }
      for (let k = 0; k < 5; k++) { x.fillStyle = ts.fill3; x.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 16), 1, 1); }
      for (let k = 0; k < 3; k++) { x.fillStyle = ts.fillHi; x.fillRect(Math.floor(rng() * 16), Math.floor(rng() * 16), 1, 1); }
      if (v === 1) { x.fillStyle = ts.fill3; x.fillRect(4, 7, 5, 3); x.fillStyle = ts.fill2; x.fillRect(4, 7, 5, 1); }
    } else if (ts.style === 'metal') {
      x.fillStyle = ts.fill2; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
      x.fillStyle = ts.fillHi; x.fillRect(0, 0, 15, 1); x.fillRect(0, 0, 1, 15);
      x.fillStyle = ts.fill3; x.fillRect(2, 2, 1, 1); x.fillRect(13, 2, 1, 1); x.fillRect(2, 13, 1, 1); x.fillRect(13, 13, 1, 1);
      if (v === 1) { for (let yy = 5; yy < 12; yy += 2) x.fillRect(4, yy, 8, 1); }
      if (v === 2) { x.fillStyle = ts.fill2; x.fillRect(7, 1, 1, 14); }
    } else { // brick
      x.fillStyle = ts.fill2;
      for (let yy = 3; yy < 16; yy += 4) x.fillRect(0, yy, 16, 1);
      for (let r = 0; r < 4; r++) for (let xx = (r % 2) * 4; xx < 16; xx += 8) x.fillRect(xx, r * 4, 1, 3);
      x.fillStyle = v === 1 ? ts.fillHi : ts.fill3;
      x.fillRect(v === 2 ? 9 : 1, 4, 7, 3);
    }
  };
  const topCap = (x, v) => {
    if (ts.style === 'earth') {
      x.fillStyle = ts.top2; x.fillRect(0, 0, 16, 4);
      for (let i = 0; i < 16; i++) { const d = Math.floor(rng() * 3); if (d) x.fillRect(i, 4, 1, d); }
      x.fillStyle = ts.top; x.fillRect(0, 0, 16, 2);
      x.fillStyle = ts.topHi; x.fillRect(0, 0, 16, 1);
      if (ts.grass) { x.fillStyle = ts.grass; for (let i = 1; i < 16; i += 3 + Math.floor(rng() * 2)) x.fillRect(i, 2, 1, 2); }
    } else {
      x.fillStyle = ts.top; x.fillRect(0, 0, 16, 4);
      x.fillStyle = ts.topHi; x.fillRect(0, 0, 16, 1);
      x.fillStyle = ts.top2; x.fillRect(0, 4, 16, 1);
      if (ts.style === 'metal') {
        if (v === 1) { for (let i = 0; i < 16; i += 6) { x.fillStyle = '#f0c93e'; x.fillRect(i, 1, 3, 3); x.fillStyle = '#22232f'; x.fillRect(i + 3, 1, 3, 3); } }
        else { x.fillStyle = ts.top2; x.fillRect(3, 2, 1, 1); x.fillRect(12, 2, 1, 1); }
      }
    }
  };
  t.fillT = [0, 1, 2, 0].map((v) => mk((x) => fillBase(x, v)));
  t.topT = [0, 1, 0, 0].map((v) => mk((x) => { fillBase(x, 0); topCap(x, v); }));
  t.backT = mk((x) => { x.fillStyle = ts.fill3; x.fillRect(0, 0, 16, 16); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 16, 16); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(3, 5, 4, 1); x.fillRect(10, 12, 3, 1); });
  t.platT = mk((x) => {
    x.fillStyle = '#0e0e16'; x.fillRect(0, 0, 16, 6);
    x.fillStyle = ts.plat; x.fillRect(0, 0, 16, 5);
    x.fillStyle = ts.platHi; x.fillRect(0, 0, 16, 1);
    x.fillStyle = ts.plat2; x.fillRect(0, 4, 16, 1); x.fillRect(15, 1, 1, 3);
    if (ts.style !== 'earth') { x.fillRect(3, 2, 2, 1); x.fillRect(8, 2, 2, 1); x.fillRect(12, 2, 2, 1); x.fillRect(7, 6, 2, 3); }
    else { x.fillRect(7, 6, 2, 2); }
  });
  const liq = t.liquid || ['#101018', '#181828', '#0a0a10'];
  t.liqTop = [0, 1].map((f) => mk((x) => {
    x.fillStyle = liq[0]; x.fillRect(0, 3, 16, 13);
    x.fillStyle = liq[1];
    for (let i = 0; i < 16; i++) { const yy = 2 + (((i + f * 4) % 8) < 4 ? 0 : 1); x.fillRect(i, yy, 1, 1); if ((i + f * 3) % 7 === 0) x.fillRect(i, 7, 2, 1); }
    x.fillStyle = liq[2]; x.fillRect(0, 13, 16, 3);
  }));
  t.liqT = mk((x) => { x.fillStyle = liq[2]; x.fillRect(0, 0, 16, 16); x.fillStyle = liq[0]; x.fillRect(2, 4, 3, 1); x.fillRect(10, 11, 4, 1); });
  t.spikeT = mk((x) => {
    for (let i = 0; i < 4; i++) {
      const bx = i * 4;
      x.fillStyle = '#0e0e16'; x.fillRect(bx, 10, 4, 6); x.fillRect(bx + 1, 6, 2, 4);
      x.fillStyle = '#c2c7d8'; x.fillRect(bx + 1, 11, 2, 5); x.fillRect(bx + 1, 8, 1, 3);
      x.fillStyle = '#ffffff'; x.fillRect(bx + 1, 7, 1, 2);
      x.fillStyle = '#5c6078'; x.fillRect(bx + 2, 11, 1, 5);
    }
  });
  t.beltT = [0, 1, 2, 3].map((f) => mk((x) => {
    fillBase(x, 0);
    x.fillStyle = '#22232f'; x.fillRect(0, 0, 16, 5);
    x.fillStyle = '#5c6078'; x.fillRect(0, 0, 16, 1);
    x.fillStyle = '#f0c93e';
    for (let i = -8; i < 16; i += 8) { x.fillRect(i + f * 2, 2, 2, 1); x.fillRect(i + f * 2 + 1, 1, 2, 1); x.fillRect(i + f * 2 + 1, 3, 2, 1); }
  }));
  t.built = true;
  return t;
}

/* ---------- decorative props ---------- */
const DECO = {
  cactus: () => paint(14, 24, (p) => { p.rbox(5, 2, 5, 22, 'G', 'l', 'g'); p.rbox(0, 8, 4, 8, 'G', 'l', 'g'); p.r(3, 13, 3, 2, 'g'); p.rbox(10, 5, 4, 9, 'G', 'l', 'g'); p.r(9, 11, 2, 2, 'g'); p.px(7, 1, 'k'); }),
  rock: () => paint(18, 10, (p) => { p.ball(6, 7, 5, 's', 'S', 'N'); p.ball(13, 8, 4, 's', 'S', 'N'); p.clear(0, 10, 18, 3); }),
  tent: () => paint(34, 20, (p) => { for (let i = 0; i < 17; i++) { p.r(17 - i, 2 + i, i * 2, 1, i % 4 < 2 ? 'N' : 's'); } p.r(0, 19, 34, 1, 'n'); p.r(14, 10, 6, 10, 'd'); p.r(16, 0, 1, 3, '2'); p.r(17, 0, 4, 2, 'm'); }),
  sandbags: () => paint(26, 12, (p) => { for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - (r === 2 ? 1 : 0); i++) p.rbox(i * 6 + (r % 2) * 3 + (r === 2 ? 3 : 0), 8 - r * 4, 7, 5, 's', 'S', 'N'); }),
  flag: () => paint(14, 30, (p) => { p.r(1, 0, 2, 30, '3'); p.r(1, 0, 1, 30, '5'); p.r(3, 2, 10, 7, 'm'); p.r(3, 2, 10, 1, 'M'); p.r(6, 4, 3, 3, '5'); p.clear(11, 5, 2, 1); }),
  reeds: () => paint(16, 18, (p) => { for (const [x, h] of [[2, 14], [5, 18], [8, 12], [11, 16], [14, 10]]) { p.r(x, 18 - h, 1, h, 'g'); p.r(x - 1, 18 - h, 2, 3, 'n'); } }),
  stump: () => paint(16, 12, (p) => { p.rbox(2, 2, 12, 10, 'N', 's', 'n'); p.r(0, 9, 16, 3, 'n'); p.r(4, 3, 8, 1, 'S'); p.r(6, 5, 1, 5, 'n').r(10, 6, 1, 4, 'n'); }),
  shroom: () => paint(12, 12, (p) => { p.r(5, 5, 2, 7, 'S'); p.ball(5, 4, 4, 'P', 'k', 'p'); p.clear(0, 6, 12, 1); p.r(5, 6, 2, 6, 'S'); p.px(3, 2, '6').px(7, 3, '6'); }),
  bollard: () => paint(10, 12, (p) => { p.rbox(2, 2, 6, 10, '2', '4', '1'); p.rbox(0, 0, 10, 4, '3', '5', '2'); p.r(3, 6, 4, 1, 'y'); }),
  lamp: () => paint(12, 40, (p) => { p.r(5, 6, 2, 34, '2'); p.r(5, 6, 1, 34, '4'); p.r(3, 38, 6, 2, '1'); p.rbox(1, 0, 10, 7, 'Y', '6', 'y'); p.r(1, 0, 10, 2, '1'); }),
  container: () => paint(40, 20, (p) => { p.box(0, 0, 40, 20, 'B', 'c', 'b'); for (let i = 4; i < 38; i += 4) p.r(i, 2, 1, 16, 'b'); p.r(16, 7, 8, 6, '5'); }),
  crystal: () => paint(14, 20, (p) => { for (let j = 0; j < 20; j++) { const w = j < 6 ? Math.ceil((j + 1) / 2) : 3; p.r(7 - w, j, w * 2, 1, 'T'); p.r(7 - w, j, 1, 1, 'c'); p.r(6 + w, j, 1, 1, 't'); } p.r(1, 12, 3, 8, 'T').r(1, 12, 1, 8, 'c').r(11, 14, 2, 6, 't'); }),
  stalag: () => paint(10, 18, (p) => { for (let j = 0; j < 18; j++) { const w = Math.max(1, Math.round(j / 4)); p.r(5 - w, j, w * 2, 1, '2'); p.r(5 - w, j, 1, 1, '3'); } }),
  pine: () => paint(22, 36, (p) => { p.r(10, 28, 3, 8, 'n'); for (let k = 0; k < 4; k++) for (let j = 0; j < 9; j++) { const w = 2 + j + k; p.r(11 - w / 2, 1 + k * 7 + j, w, 1, j < 2 ? '6' : j < 4 ? 'G' : 'g'); } }),
  icerock: () => paint(18, 12, (p) => { p.ball(6, 8, 5, 'c', '6', 'B'); p.ball(13, 9, 4, 'c', '6', 'B'); p.clear(0, 12, 18, 2); p.r(3, 2, 6, 2, '6'); }),
  vent: () => paint(14, 26, (p) => { p.box(3, 4, 8, 22, '3', '4', '2'); p.box(0, 0, 14, 6, '2', '4', '1'); p.r(5, 10, 4, 1, '1').r(5, 13, 4, 1, '1').r(5, 16, 4, 1, '1'); }),
  gauge: () => paint(14, 20, (p) => { p.r(6, 12, 2, 8, '2'); p.ball(7, 7, 6, '5', '6', '4'); p.l(7, 7, 10, 4, 'R'); p.px(7, 7, '0'); }),
  drum: () => paint(12, 16, (p) => { p.rbox(0, 0, 12, 16, '3', '4', '2'); p.r(1, 4, 10, 1, '2').r(1, 11, 10, 1, '2'); p.r(3, 6, 6, 4, 'o'); }),
  antenna: () => paint(12, 34, (p) => { p.r(5, 4, 2, 30, '2'); p.r(5, 4, 1, 30, '4'); p.r(1, 8, 10, 1, '3').r(2, 14, 8, 1, '3').r(3, 20, 6, 1, '3'); p.px(5, 2, 'R').px(6, 2, 'R').px(5, 3, 'r').px(6, 3, 'r'); p.r(3, 32, 6, 2, '1'); }),
  acunit: () => paint(20, 14, (p) => { p.box(0, 2, 20, 12, '4', '5', '3'); p.ball(7, 8, 4, '2', '3', '1'); p.r(13, 5, 5, 1, '2').r(13, 8, 5, 1, '2').r(13, 11, 5, 1, '2'); p.r(2, 0, 3, 2, '2'); }),
  billboard: () => paint(44, 40, (p) => { p.r(8, 22, 2, 18, '2').r(34, 22, 2, 18, '2'); p.box(0, 0, 44, 23, 'b', 'B', '1'); p.r(4, 5, 14, 2, 'c').r(4, 10, 24, 2, 'c').r(4, 15, 18, 2, 'k'); p.ball(34, 11, 5, 'y', 'Y', 'o'); }),
  radar: () => paint(22, 26, (p) => { p.r(10, 12, 2, 14, '2'); p.r(6, 24, 10, 2, '1'); p.ball(11, 8, 8, '4', '6', '3'); p.clear(0, 0, 22, 4); p.r(3, 4, 16, 1, '0'); p.l(11, 8, 15, 2, '2').px(15, 2, 'R'); }),
  railing: () => paint(32, 12, (p) => { p.r(0, 0, 32, 1, '5').r(0, 5, 32, 1, '4'); for (let i = 0; i < 32; i += 8) p.r(i, 0, 1, 12, '4'); }),
  pillar: () => paint(16, 64, (p) => { p.box(2, 0, 12, 64, '2', '3', '1'); p.box(0, 0, 16, 5, '3', '4', '2').box(0, 59, 16, 5, '3', '4', '2'); for (let j = 10; j < 56; j += 12) p.r(6, j, 4, 6, 'P').r(6, j, 4, 1, '6'); }),
  monitor: () => paint(22, 22, (p) => { p.r(9, 14, 4, 6, '2'); p.r(5, 20, 12, 2, '1'); p.box(0, 0, 22, 15, '1', '3', '0'); p.r(2, 2, 18, 11, 'p'); p.r(4, 4, 8, 1, 'P').r(4, 7, 13, 1, 'P').r(4, 10, 6, 1, 'k'); }),
  signal: () => paint(10, 30, (p) => { p.r(4, 8, 2, 22, '2'); p.box(1, 0, 8, 10, '1', '3', '0'); p.r(3, 2, 4, 2, 'R').r(3, 6, 4, 2, 'G'); }),
  cratestack: () => paint(30, 26, (p) => { p.box(0, 12, 14, 14, 'N', 's', 'n'); p.box(14, 12, 16, 14, 'N', 's', 'n'); p.box(6, 0, 15, 12, 'N', 's', 'n'); p.r(1, 18, 12, 1, 'n').r(15, 18, 14, 1, 'n').r(7, 5, 13, 1, 'n'); }),
  sign: () => paint(16, 20, (p) => { p.r(7, 10, 2, 10, 'n'); p.box(0, 0, 16, 11, 'y', 'Y', 'o'); p.l(4, 5, 10, 5, '0').l(8, 3, 10, 5, '0').l(8, 7, 10, 5, '0'); }),
};
function decoSpr(name) {
  const key = 'deco_' + name;
  if (!SPR[key]) SPR[key] = (DECO[name] || DECO.rock)();
  return SPR[key];
}
