// ---------------------------------------------------------------------------
// Procedural 16x16 pixel-art textures and inventory icons (main thread only).
// ---------------------------------------------------------------------------
const Tex = (() => {
  const S = 16;
  const idx = (x, y) => (((y & 15) * 16) + (x & 15)) * 4;
  function put(d, x, y, c, a) { const i = idx(x, y); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a === undefined ? 255 : a; }
  function get(d, x, y) { const i = idx(x, y); return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  const sh = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const add = (c, v) => [c[0] + v, c[1] + v, c[2] + v];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Tileable value noise over the 16x16 tile.
  function blotch(rnd, cells) {
    const g = [];
    for (let i = 0; i < cells * cells; i++) g.push(rnd());
    return (x, y) => {
      const fx = (x / S) * cells, fy = (y / S) * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a, b) => g[((b % cells + cells) % cells) * cells + ((a % cells + cells) % cells)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a + (b - a) * sy;
    };
  }
  function noisy(d, rnd, base, amt, blAmt, cells) {
    const bl = blotch(rnd, cells || 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = (rnd() - 0.5) * amt + (bl(x, y) - 0.5) * (blAmt || 0);
      put(d, x, y, add(base, v));
    }
  }
  // Tileable voronoi cells.
  function voronoi(rnd, n) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([rnd() * S, rnd() * S, rnd()]);
    return (x, y) => {
      let d1 = 1e9, d2 = 1e9, id = 0;
      for (let i = 0; i < n; i++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const dx = x + 0.5 - (pts[i][0] + ox * S), dy = y + 0.5 - (pts[i][1] + oy * S);
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < d1) { d2 = d1; d1 = dd; id = i; } else if (dd < d2) d2 = dd;
      }
      return { d1, d2, id, v: pts[id][2], cx: pts[id][0], cy: pts[id][1] };
    };
  }

  const G = {};
  const dirtBase = [134, 96, 67];
  G.dirt = (d, r) => {
    noisy(d, r, dirtBase, 26, 22);
    for (let k = 0; k < 18; k++) put(d, r() * 16 | 0, r() * 16 | 0, r() < 0.5 ? [98, 70, 48] : [164, 122, 88]);
    for (let k = 0; k < 3; k++) put(d, r() * 16 | 0, r() * 16 | 0, [128, 124, 118]);
  };
  G.grass_top = (d, r) => {
    const bl = blotch(r, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = 168 + (r() - 0.5) * 46 + (bl(x, y) - 0.5) * 30;
      put(d, x, y, [v, v, v]);
    }
    for (let k = 0; k < 22; k++) { const v = 120 + r() * 20; put(d, r() * 16 | 0, r() * 16 | 0, [v, v, v]); }
    for (let k = 0; k < 10; k++) { const v = 210 + r() * 20; put(d, r() * 16 | 0, r() * 16 | 0, [v, v, v]); }
  };
  function grassOverlay(d, r, colorFn, depth) {
    for (let x = 0; x < S; x++) {
      const h = depth + (r() < 0.55 ? 1 : 0) + (r() < 0.25 ? 1 : 0) + (r() < 0.1 ? 2 : 0);
      for (let y = 0; y < h; y++) put(d, x, y, colorFn(x, y, y === h - 1));
    }
  }
  G.grass_side = (d, r) => {
    G.dirt(d, r);
    grassOverlay(d, r, (x, y, last) => { const v = (last ? 140 : 172) + (r() - 0.5) * 36; return [v, v, v]; }, 3);
  };
  G.snowy_grass_side = (d, r) => {
    G.dirt(d, r);
    grassOverlay(d, r, (x, y, last) => { const v = (last ? 222 : 244) + (r() - 0.5) * 12; return [v - 6, v, v + 8]; }, 3);
  };
  G.stone = (d, r) => {
    noisy(d, r, [126, 126, 128], 18, 34, 4);
    for (let k = 0; k < 5; k++) {
      let x = r() * 16 | 0, y = r() * 16 | 0;
      const len = 2 + (r() * 3 | 0);
      for (let i = 0; i < len; i++) { put(d, x, y, sh(get(d, x, y), 0.8)); x += r() < 0.6 ? 1 : 0; y += r() < 0.5 ? 1 : 0; }
    }
  };
  function cobbleInto(d, r, n, light, dark, mortar) {
    const vor = voronoi(r, n);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = vor(x, y);
      if (c.d2 - c.d1 < 1.1) { put(d, x, y, add(mortar, (r() - 0.5) * 12)); continue; }
      let col = mix(dark, light, 0.25 + c.v * 0.75);
      const hl = (c.cx - (x + 0.5)) * 0.4 + (c.cy - (y + 0.5)) * 0.4; // lit from top-left
      col = add(col, hl * 6 + (r() - 0.5) * 16);
      put(d, x, y, col);
    }
  }
  G.cobblestone = (d, r) => cobbleInto(d, r, 9, [158, 158, 158], [96, 96, 98], [62, 62, 64]);
  G.mossy_cobblestone = (d, r) => {
    cobbleInto(d, r, 9, [150, 152, 150], [92, 94, 92], [60, 62, 60]);
    const bl = blotch(r, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (bl(x, y) > 0.55 && r() < 0.85) put(d, x, y, [70 + r() * 30, 112 + r() * 30, 52 + r() * 20]);
  };
  G.sand = (d, r) => { noisy(d, r, [220, 208, 162], 16, 12); for (let k = 0; k < 14; k++) put(d, r() * 16 | 0, r() * 16 | 0, r() < 0.6 ? [198, 184, 138] : [236, 228, 190]); };
  G.gravel = (d, r) => {
    const vor = voronoi(r, 16);
    const cols = [[136, 130, 128], [102, 98, 98], [148, 128, 116], [170, 166, 162], [118, 112, 108]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = vor(x, y);
      if (c.d2 - c.d1 < 0.8) { put(d, x, y, [82, 78, 76]); continue; }
      put(d, x, y, add(cols[(c.v * cols.length) | 0], (r() - 0.5) * 14 + ((c.cy - y) * 3)));
    }
  };
  function bark(d, r, base, groove, stripeP) {
    const colShade = [];
    for (let x = 0; x < S; x++) colShade.push((r() - 0.5) * 22);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(d, x, y, add(base, colShade[x] + (r() - 0.5) * 12));
    for (let x = 0; x < S; x++) if (r() < stripeP) {
      let y = r() * 16 | 0; const len = 4 + (r() * 9 | 0);
      for (let i = 0; i < len; i++) put(d, x, y + i, add(groove, (r() - 0.5) * 10));
    }
  }
  function rings(d, r, outer, light, dark) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - 7.5, dy = y - 7.5, dist = Math.sqrt(dx * dx + dy * dy);
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 6.6) { put(d, x, y, add(outer, (r() - 0.5) * 16)); continue; }
      const ring = Math.floor(dist * 0.9 + r() * 0.35) % 2;
      put(d, x, y, add(ring ? dark : light, (r() - 0.5) * 10));
    }
  }
  G.oak_log = (d, r) => bark(d, r, [104, 82, 50], [70, 54, 32], 0.5);
  G.oak_log_top = (d, r) => rings(d, r, [104, 82, 50], [178, 144, 92], [148, 116, 70]);
  G.birch_log = (d, r) => {
    noisy(d, r, [216, 212, 202], 14, 10);
    for (let k = 0; k < 9; k++) {
      const y = r() * 16 | 0, x = r() * 16 | 0, len = 2 + (r() * 4 | 0);
      for (let i = 0; i < len; i++) put(d, x + i, y, [46 + r() * 20, 44 + r() * 16, 40]);
      if (r() < 0.5) put(d, x + 1, y + 1, [70, 66, 60]);
    }
  };
  G.birch_log_top = (d, r) => rings(d, r, [214, 210, 200], [200, 176, 128], [176, 150, 104]);
  G.spruce_log = (d, r) => bark(d, r, [62, 44, 26], [42, 28, 16], 0.55);
  G.spruce_log_top = (d, r) => rings(d, r, [62, 44, 26], [128, 94, 58], [104, 74, 44]);
  function leaves(d, r, base, gray) {
    const bl = blotch(r, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (r() < 0.2 + bl(x, y) * 0.1) { put(d, x, y, [0, 0, 0], 0); continue; }
      const v = (r() - 0.5) * 50 + (bl(x, y) - 0.5) * 30;
      put(d, x, y, gray ? [base + v, base + v, base + v] : add(base, v * 0.5), 255);
    }
    for (let k = 0; k < 14; k++) { const x = r() * 16 | 0, y = r() * 16 | 0; if (get(d, x, y)[3]) put(d, x, y, gray ? [110, 110, 110] : sh(base, 0.7)); }
  }
  G.oak_leaves = (d, r) => leaves(d, r, 150, true);
  G.birch_leaves = (d, r) => leaves(d, r, [118, 158, 78], false);
  G.spruce_leaves = (d, r) => leaves(d, r, [52, 90, 58], false);
  function planks(d, r, base, seam) {
    const offs = [0, 9, 4, 12];
    for (let y = 0; y < S; y++) {
      const board = y >> 2, inB = y & 3;
      const bshade = (r() - 0.5) * 14;
      for (let x = 0; x < S; x++) {
        let c = add(base, bshade + (r() - 0.5) * 10 + Math.sin((x + board * 5) * 0.9 + y) * 4);
        if (inB === 3) c = add(seam, (r() - 0.5) * 6);
        else if (inB === 0) c = add(c, 8);
        if (x === offs[board] && inB !== 3) c = add(seam, 6);
        put(d, x, y, c);
      }
    }
  }
  G.oak_planks = (d, r) => planks(d, r, [164, 132, 80], [112, 86, 52]);
  G.spruce_planks = (d, r) => planks(d, r, [116, 86, 52], [76, 56, 32]);
  G.birch_planks = (d, r) => planks(d, r, [198, 178, 122], [150, 132, 86]);
  G.glass = (d) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) put(d, x, y, (x + y) % 3 ? [208, 232, 240] : [176, 210, 224]);
      else put(d, x, y, [0, 0, 0], 0);
    }
    for (let i = 0; i < 4; i++) { put(d, 3 + i, 6 - i, [240, 250, 255]); put(d, 4 + i, 6 - i, [240, 250, 255]); }
    for (let i = 0; i < 2; i++) put(d, 10 + i, 12 - i, [230, 245, 255]);
  };
  G.water = (d, r) => {
    const bl = blotch(r, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = (bl(x, y) - 0.5) * 30 + (r() - 0.5) * 10;
      put(d, x, y, [44 + v * 0.4, 96 + v * 0.7, 196 + v], 200);
    }
  };
  G.lava = (d, r) => {
    const bl = blotch(r, 4), bl2 = blotch(r, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = bl(x, y) * 0.65 + bl2(x, y) * 0.35;
      let c;
      if (v > 0.62) c = [255, 226, 110]; else if (v > 0.48) c = [252, 160, 40]; else if (v > 0.3) c = [222, 92, 20]; else c = [150, 40, 12];
      put(d, x, y, add(c, (r() - 0.5) * 14));
    }
  };
  G.bedrock = (d, r) => {
    const vor = voronoi(r, 12);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = vor(x, y);
      const v = 40 + c.v * 70 + (r() - 0.5) * 18;
      put(d, x, y, [v, v, v + 2]);
    }
  };
  function ore(d, r, a, b, sparkle) {
    G.stone(d, r);
    const n = 4 + (r() * 2 | 0);
    for (let k = 0; k < n; k++) {
      const cx = 2 + (r() * 12 | 0), cy = 2 + (r() * 12 | 0);
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [2, 1], [1, 2]];
      const cnt = 3 + (r() * 4 | 0);
      for (let i = 0; i < cnt; i++) {
        const [ox, oy] = pts[i];
        put(d, cx + ox, cy + oy, i === 0 ? (sparkle ? [235, 255, 255] : b) : (r() < 0.6 ? a : b));
      }
      put(d, cx + 1, cy + 2, sh(get(d, cx + 1, cy + 2), 0.7));
    }
  }
  G.coal_ore = (d, r) => ore(d, r, [36, 36, 38], [66, 66, 70]);
  G.iron_ore = (d, r) => ore(d, r, [216, 176, 148], [178, 138, 110]);
  G.gold_ore = (d, r) => ore(d, r, [252, 236, 80], [222, 178, 40]);
  G.diamond_ore = (d, r) => ore(d, r, [98, 236, 228], [40, 180, 178], true);
  G.snow = (d, r) => { noisy(d, r, [240, 247, 252], 8, 10); for (let k = 0; k < 10; k++) put(d, r() * 16 | 0, r() * 16 | 0, [214, 228, 244]); };
  G.ice = (d, r) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const streak = ((x + y * 2) % 11 === 0) || ((x * 2 + y + 5) % 13 === 0);
      put(d, x, y, streak ? [206, 228, 255] : add([150, 190, 246], (r() - 0.5) * 12), 205);
    }
  };
  G.cactus_side = (d, r) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = [82, 142, 54];
      if (x === 0 || x === 15) c = [48, 96, 34];
      else if (x % 4 === 2) c = [60, 112, 40];
      else if (x % 4 === 0) c = [100, 162, 66];
      put(d, x, y, add(c, (r() - 0.5) * 12));
    }
    for (let k = 0; k < 10; k++) put(d, 1 + (r() * 14 | 0), r() * 16 | 0, [226, 224, 186]);
  };
  G.cactus_top = (d, r) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      put(d, x, y, add(e === 0 ? [48, 96, 34] : e % 2 ? [92, 152, 60] : [72, 128, 48], (r() - 0.5) * 10));
    }
  };
  G.bricks = (d, r) => {
    const mortar = [184, 176, 164];
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let b = -1; b < 3; b++) {
        const bc = add([152, 72, 56], (r() - 0.5) * 30);
        for (let y = row * 4; y < row * 4 + 3; y++) for (let x = b * 8 + off; x < b * 8 + off + 7; x++) {
          if (x < 0 || x > 15) continue;
          let c = add(bc, (r() - 0.5) * 16);
          if (y === row * 4) c = add(c, 14);
          put(d, x, y, c);
        }
      }
      for (let x = 0; x < S; x++) put(d, x, row * 4 + 3, add(mortar, (r() - 0.5) * 10));
      for (let b = 0; b < 3; b++) { const x = (b * 8 + off + 7) & 15; for (let y = row * 4; y < row * 4 + 3; y++) put(d, x, y, add(mortar, (r() - 0.5) * 10)); }
    }
  };
  G.stone_bricks = (d, r) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const row = y >> 3, off = row % 2 ? 0 : 4;
      const lx = (x + off) & 7, ly = y & 7;
      let c = add([128, 128, 130], (r() - 0.5) * 14);
      if (lx === 7 || ly === 7) c = [76, 76, 78];
      else if (lx === 0 || ly === 0) c = add(c, 18);
      else if (lx === 6 || ly === 6) c = add(c, -14);
      put(d, x, y, c);
    }
  };
  G.sandstone_top = (d, r) => noisy(d, r, [218, 204, 156], 10, 10);
  G.sandstone_side = (d, r) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let c = [214, 200, 150];
      if (y < 3) c = [226, 214, 166];
      else if (y === 3 || y === 12) c = [186, 170, 122];
      else if (y > 12) c = [204, 188, 140];
      else if ((y + (x >> 2)) % 3 === 0) c = [206, 192, 142];
      put(d, x, y, add(c, (r() - 0.5) * 10));
    }
  };
  G.bookshelf = (d, r) => {
    G.oak_planks(d, r);
    const bookCols = [[150, 40, 40], [50, 70, 150], [60, 120, 60], [170, 140, 60], [110, 60, 120], [180, 170, 150], [60, 50, 40]];
    for (const [y0, y1] of [[2, 7], [9, 14]]) {
      for (let x = 1; x < 15; x++) put(d, x, y0 - 1, [78, 58, 36]);
      let x = 1;
      while (x < 15) {
        const w = 1 + (r() < 0.4 ? 1 : 0), c = bookCols[r() * bookCols.length | 0], top = y0 + (r() < 0.3 ? 1 : 0);
        for (let i = 0; i < w && x < 15; i++, x++) {
          for (let y = y0; y <= y1; y++) put(d, x, y, y < top ? [44, 30, 20] : add(c, (i === 0 ? 10 : -10) + (r() - 0.5) * 10));
        }
      }
      for (let x = 1; x < 15; x++) put(d, x, y1 + 1, [96, 72, 44]);
    }
  };
  G.glowstone = (d, r) => {
    const vor = voronoi(r, 10);
    const cols = [[255, 236, 160], [250, 206, 110], [222, 160, 72], [172, 112, 52], [255, 246, 200]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = vor(x, y);
      put(d, x, y, c.d2 - c.d1 < 0.7 ? [140, 92, 44] : add(cols[(c.v * cols.length) | 0], (r() - 0.5) * 16));
    }
  };
  G.obsidian = (d, r) => {
    noisy(d, r, [22, 16, 34], 10, 14);
    for (let k = 0; k < 16; k++) put(d, r() * 16 | 0, r() * 16 | 0, r() < 0.5 ? [62, 42, 96] : [40, 28, 64]);
  };
  G.crafting_table_top = (d, r) => {
    G.oak_planks(d, r);
    for (let i = 0; i < S; i++) { put(d, i, 0, [86, 62, 36]); put(d, i, 15, [86, 62, 36]); put(d, 0, i, [86, 62, 36]); put(d, 15, i, [86, 62, 36]); }
    for (let i = 2; i < 14; i++) { put(d, i, 5, [110, 84, 52]); put(d, i, 10, [110, 84, 52]); put(d, 5, i, [110, 84, 52]); put(d, 10, i, [110, 84, 52]); }
  };
  function tableSide(d, r, tools) {
    G.oak_planks(d, r);
    for (let x = 0; x < S; x++) { put(d, x, 0, [130, 100, 60]); put(d, x, 1, [96, 72, 42]); put(d, x, 2, [96, 72, 42]); }
    for (let y = 3; y < 16; y++) { put(d, 0, y, [86, 62, 36]); put(d, 15, y, [86, 62, 36]); }
    tools(d);
  }
  G.crafting_table_side = (d, r) => tableSide(d, r, (d2) => {
    for (let y = 5; y < 12; y++) put(d2, 4, y, [70, 50, 30]);
    for (let x = 2; x < 7; x++) put(d2, x, 5, [150, 150, 156]);
    put(d2, 2, 6, [150, 150, 156]); put(d2, 6, 6, [150, 150, 156]);
    for (let y = 4; y < 13; y++) put(d2, 11, y, y < 9 ? [170, 170, 176] : [96, 70, 40]);
  });
  G.crafting_table_front = (d, r) => tableSide(d, r, (d2) => {
    for (let i = 0; i < 7; i++) put(d2, 4 + i, 11 - i, [96, 70, 40]);
    for (let y = 4; y < 7; y++) for (let x = 9; x < 13; x++) put(d2, x, y, [140, 140, 146]);
  });
  G.furnace_side = (d, r) => {
    noisy(d, r, [118, 118, 120], 14, 18);
    for (let i = 0; i < S; i++) { put(d, i, 0, [140, 140, 142]); put(d, i, 15, [84, 84, 86]); }
  };
  G.furnace_top = (d, r) => { noisy(d, r, [126, 126, 128], 12, 16); for (let i = 0; i < S; i++) { put(d, i, 0, [92, 92, 94]); put(d, i, 15, [92, 92, 94]); put(d, 0, i, [92, 92, 94]); put(d, 15, i, [92, 92, 94]); } };
  G.furnace_front = (d, r) => {
    G.furnace_side(d, r);
    for (let y = 2; y < 5; y++) for (let x = 3; x < 13; x++) put(d, x, y, [92, 92, 94]);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) put(d, x, y, y > 11 ? [60 + r() * 30, 30, 20] : [24, 22, 22]);
    for (let x = 3; x < 13; x++) { put(d, x, 7, [70, 70, 72]); put(d, x, 14, [70, 70, 72]); }
  };
  const woolCols = { wool_white: [234, 236, 236], wool_red: [168, 42, 38], wool_orange: [236, 120, 28], wool_yellow: [246, 206, 52], wool_lime: [118, 186, 30], wool_blue: [52, 64, 160], wool_purple: [124, 46, 172], wool_black: [28, 28, 34] };
  Object.keys(woolCols).forEach((k) => {
    G[k] = (d, r) => {
      const base = woolCols[k];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const fib = ((x + y * 3) % 5 === 0 ? -14 : 0) + ((x * 3 - y) % 7 === 0 ? 8 : 0);
        put(d, x, y, add(base, fib + (r() - 0.5) * 14));
      }
    };
  });
  // Plants
  function blank(d) { for (let i = 0; i < 1024; i += 4) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; } }
  function stem(d, x, y0, y1, c) { for (let y = y0; y <= y1; y++) put(d, x, y, c); }
  G.tall_grass = (d, r) => {
    blank(d);
    for (let b = 0; b < 14; b++) {
      let x = 1.5 + r() * 13;
      const lean = (x - 8) * 0.045 + (r() - 0.5) * 0.25;
      const h = 5 + (r() * 10 | 0);
      for (let i = 0; i < h; i++) {
        const v = 118 + (i / h) * 80 + (r() - 0.5) * 22;
        if (i === h - 1 && r() < 0.5) break;
        put(d, Math.round(x), 15 - i, [v, v, v]);
        x += lean;
      }
    }
  };
  G.dead_bush = (d, r) => {
    blank(d);
    const c = [132, 92, 52];
    const branch = (x, y, dx, len) => { for (let i = 0; i < len; i++) { put(d, Math.round(x), Math.round(y), add(c, (r() - 0.5) * 20)); x += dx; y -= 1; if (r() < 0.3) dx += (r() - 0.5) * 0.6; } };
    branch(8, 15, 0, 6); branch(8, 11, -0.6, 6); branch(8, 11, 0.7, 6); branch(7, 13, -0.9, 5); branch(9, 9, 0.2, 5);
  };
  function flower(d, r, petal, center) {
    blank(d);
    stem(d, 7, 8, 15, [58, 122, 40]);
    put(d, 6, 12, [70, 140, 48]); put(d, 5, 11, [70, 140, 48]); put(d, 8, 13, [70, 140, 48]); put(d, 9, 12, [70, 140, 48]);
    for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) {
      const dx = x - 7, dy = y - 5.5;
      if (dx * dx + dy * dy < 5.5) put(d, x, y, add(petal, (r() - 0.5) * 20 - (y - 4) * 6));
    }
    put(d, 7, 5, center); put(d, 7, 6, sh(center, 0.85));
  }
  G.dandelion = (d, r) => flower(d, r, [252, 222, 40], [236, 150, 20]);
  G.poppy = (d, r) => flower(d, r, [220, 34, 30], [40, 26, 20]);
  G.blue_flower = (d, r) => flower(d, r, [86, 118, 236], [230, 220, 120]);
  G.torch = (d) => {
    blank(d);
    for (let y = 8; y < 16; y++) { put(d, 7, y, [138, 98, 54]); put(d, 8, y, [104, 74, 40]); }
    put(d, 7, 6, [255, 244, 170]); put(d, 8, 6, [255, 210, 90]);
    put(d, 7, 7, [255, 196, 60]); put(d, 8, 7, [240, 140, 30]);
    put(d, 7, 5, [255, 250, 210]);
  };
  // Cracks
  const crackPix = (() => {
    const r = mulberry(1234);
    const list = [], seen = new Set();
    for (let w = 0; w < 7; w++) {
      let x = 7.5, y = 7.5; const a = (w / 7) * Math.PI * 2 + r() * 0.6;
      let dx = Math.cos(a), dy = Math.sin(a);
      for (let s = 0; s < 12; s++) {
        x += dx; y += dy; dx += (r() - 0.5) * 0.7; dy += (r() - 0.5) * 0.7;
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix > 15 || iy > 15) break;
        const k = iy * 16 + ix; if (!seen.has(k)) { seen.add(k); list.push([ix, iy, s]); }
      }
    }
    list.sort((p, q) => p[2] - q[2]);
    return list;
  })();
  for (let s = 0; s < 10; s++) {
    G['crack_' + s] = (d) => {
      blank(d);
      const n = Math.round(crackPix.length * (s + 1) / 10);
      for (let i = 0; i < n; i++) put(d, crackPix[i][0], crackPix[i][1], [20, 20, 20], 200);
    };
  }

  // ---- Items ----
  // Rasterise shapes into material ids, then shade edges (lit from top-left).
  function shapeSprite(d, mats, testFn) {
    blank(d);
    const grid = new Int8Array(256);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) grid[y * 16 + x] = testFn(x + 0.5, y + 0.5);
    const at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : grid[y * 16 + x]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const m = at(x, y); if (m <= 0) continue;
      const M = mats[m];
      let c = M[0];
      if (at(x + 1, y) !== m && at(x, y + 1) !== m) c = M[2];
      else if (at(x + 1, y + 1) !== m || at(x + 1, y) !== m || at(x, y + 1) !== m) c = mix(M[0], M[2], 0.55);
      if (at(x - 1, y) !== m && at(x, y - 1) !== m) c = M[1];
      put(d, x, y, c);
    }
    // dark outline
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (at(x, y) !== 0) continue;
      let n = 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = at(x + ox, y + oy); if (m > 0) n = m; }
      if (n) put(d, x, y, sh(mats[n][2], 0.45), 255);
    }
  }
  const segDist = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const dx = px - (ax + vx * t), dy = py - (ay + vy * t); return Math.sqrt(dx * dx + dy * dy);
  };
  const HANDLE = [[140, 100, 56], [176, 134, 80], [86, 60, 32]];
  const MAT = {
    wood: [[164, 128, 76], [196, 160, 100], [104, 78, 44]],
    stone: [[132, 132, 134], [170, 170, 172], [84, 84, 86]],
    iron: [[214, 214, 214], [250, 250, 250], [150, 150, 152]],
    diamond: [[70, 224, 214], [178, 255, 250], [30, 150, 144]],
  };
  const handleTest = (x, y, x1, y1) => segDist(x, y, 3, 13, x1, y1) < 0.95 ? 1 : 0;
  const toolShapes = {
    pickaxe: (x, y) => {
      const dx = x - 2.5, dy = 13.5 - y, rr = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
      if (rr > 9.4 && rr < 11.6 && a > 0.12 && a < 1.45) return 2;
      return handleTest(x, y, 10, 6);
    },
    axe: (x, y) => {
      if (segDist(x, y, 8.5, 4.5, 11.5, 7.5) < 2.4 && (x - 4) + (y - 12) * -1 > 6.2) return 2;
      if (x > 6.5 && x < 10 && y > 2 && y < 6.5 && x + y > 9.5) return 2;
      return handleTest(x, y, 11, 5);
    },
    shovel: (x, y) => {
      const u = ((x - 11) + (y - 5)) / Math.SQRT2, v = ((x - 11) - (y - 5)) / Math.SQRT2;
      if ((u * u) / 7 + (v * v) / 3.2 < 1) return 2;
      return handleTest(x, y, 10, 6);
    },
    sword: (x, y) => {
      if (segDist(x, y, 6, 10, 13, 3) < 1.15) return 2;
      if (segDist(x, y, 3.5, 8.5, 7.5, 12.5) < 0.85) return 3;
      return segDist(x, y, 2.5, 13.5, 5.5, 10.5) < 0.9 ? 1 : 0;
    },
  };
  ['wood', 'stone', 'iron', 'diamond'].forEach((m) => ['pickaxe', 'axe', 'shovel', 'sword'].forEach((t) => {
    G[m + '_' + t] = (d) => shapeSprite(d, [null, HANDLE, MAT[m], [[90, 70, 40], [120, 96, 60], [60, 44, 24]]], toolShapes[t]);
  }));
  G.stick = (d) => shapeSprite(d, [null, HANDLE], (x, y) => segDist(x, y, 4, 12, 12, 4) < 0.95 ? 1 : 0);
  G.coal = (d, r) => {
    const bumps = [[8, 8, 4.6], [6, 6, 2.6], [10, 10, 2.8], [10, 6, 2.4]];
    shapeSprite(d, [null, [[46, 46, 50], [92, 92, 98], [20, 20, 22]]], (x, y) => bumps.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 < br * br) ? 1 : 0);
    for (let k = 0; k < 5; k++) { const x = 5 + (r() * 6 | 0), y = 5 + (r() * 6 | 0); if (get(d, x, y)[3]) put(d, x, y, [110, 110, 118]); }
  };
  const ingot = (cols) => (d) => shapeSprite(d, [null, cols], (x, y) => {
    const u = x - 8, v = y - 9;
    return Math.abs(v) < 3 && Math.abs(u - v * 0.5) < 6 - Math.abs(v) * 0.3 ? 1 : 0;
  });
  G.iron_ingot = ingot([[214, 214, 214], [250, 250, 250], [140, 140, 142]]);
  G.gold_ingot = ingot([[250, 210, 60], [255, 246, 150], [190, 140, 20]]);
  G.diamond = (d) => {
    shapeSprite(d, [null, [[86, 226, 216], [200, 255, 252], [30, 140, 136]]], (x, y) => {
      const v = y - 7;
      if (v < -3 || v > 6) return 0;
      if (v <= -1) return Math.abs(x - 8) < 3 + (v + 3) * 1.4 ? 1 : 0;
      return Math.abs(x - 8) < 5.8 - (v + 1) * 0.86 ? 1 : 0;
    });
    put(d, 6, 5, [255, 255, 255]); put(d, 7, 5, [230, 255, 255]);
  };
  G.apple = (d) => {
    shapeSprite(d, [null, [[214, 34, 36], [255, 120, 110], [130, 14, 18]], [[96, 66, 34], [130, 96, 54], [60, 40, 20]], [[70, 150, 50], [110, 190, 70], [40, 96, 30]]], (x, y) => {
      if ((x - 8) ** 2 + (y - 10) ** 2 < 25 && !((x - 8) ** 2 + (y - 5) ** 2 < 2.2)) return 1;
      if (x > 7.5 && x < 9 && y > 2 && y < 6) return 2;
      if ((x - 11) ** 2 + (y - 4) ** 2 < 2.6) return 3;
      return 0;
    });
  };
  const meat = (body, fat) => (d) => shapeSprite(d, [null, body, fat], (x, y) => {
    const u = x - 8, v = y - 8.5;
    const e = (u * u) / 36 + (v * v) / 16 + (u * v) / 60;
    if (e < 0.62) return 1;
    if (e < 1) return 2;
    if (segDist(x, y, 12.5, 12, 14.5, 14.5) < 1) return 2;
    return 0;
  });
  G.porkchop_raw = meat([[236, 132, 132], [255, 180, 176], [176, 80, 84]], [[250, 236, 230], [255, 255, 255], [200, 180, 176]]);
  G.porkchop_cooked = meat([[172, 104, 54], [212, 146, 86], [112, 62, 28]], [[224, 196, 150], [244, 222, 180], [170, 138, 96]]);
  G.mutton_raw = meat([[212, 70, 66], [250, 120, 110], [140, 36, 36]], [[240, 222, 214], [255, 245, 240], [190, 170, 164]]);
  G.mutton_cooked = meat([[142, 84, 52], [188, 124, 80], [92, 50, 26]], [[214, 186, 140], [236, 212, 170], [160, 130, 90]]);

  // ---- Mobs ----
  G.pig_skin = (d, r) => { noisy(d, r, [238, 156, 156], 14, 16); for (let k = 0; k < 6; k++) put(d, r() * 16 | 0, r() * 16 | 0, [222, 136, 140]); };
  G.pig_face = (d, r) => {
    G.pig_skin(d, r);
    for (const [x, c] of [[2, [250, 250, 250]], [3, [250, 250, 250]], [4, [24, 18, 18]], [5, [24, 18, 18]], [10, [24, 18, 18]], [11, [24, 18, 18]], [12, [250, 250, 250]], [13, [250, 250, 250]]]) { put(d, x, 6, c); put(d, x, 7, c); }
    for (let y = 9; y < 14; y++) for (let x = 4; x < 12; x++) put(d, x, y, add([246, 178, 176], (r() - 0.5) * 8));
    for (const x of [5, 6, 9, 10]) { put(d, x, 11, [160, 82, 86]); put(d, x, 12, [160, 82, 86]); }
  };
  G.sheep_wool = (d, r) => {
    const bl = blotch(r, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 222 + (bl(x, y) - 0.5) * 40 + (r() - 0.5) * 10; put(d, x, y, [v, v, v - 6]); }
  };
  G.sheep_skin = (d, r) => noisy(d, r, [214, 192, 168], 12, 12);
  G.sheep_face = (d, r) => {
    G.sheep_skin(d, r);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { const v = 226 + (r() - 0.5) * 16; put(d, x, y, [v, v, v - 4]); }
    for (const [x, c] of [[3, [250, 250, 250]], [4, [24, 18, 18]], [11, [24, 18, 18]], [12, [250, 250, 250]]]) { put(d, x, 7, c); put(d, x, 8, c); }
    for (let x = 6; x < 10; x++) { put(d, x, 11, [222, 150, 150]); put(d, x, 12, [200, 120, 124]); }
  };
  G.zombie_skin = (d, r) => noisy(d, r, [92, 142, 72], 18, 18);
  G.zombie_hair = (d, r) => noisy(d, r, [46, 72, 34], 16, 14);
  G.zombie_face = (d, r) => {
    G.zombie_skin(d, r);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) put(d, x, y, add([46, 72, 34], (r() - 0.5) * 12));
    for (const x of [3, 4, 11, 12]) { put(d, x, 7, [18, 26, 16]); put(d, x, 8, [18, 26, 16]); }
    put(d, 5, 7, [40, 70, 34]); put(d, 10, 7, [40, 70, 34]);
    for (let x = 7; x < 9; x++) put(d, x, 10, [62, 98, 48]);
    for (let x = 5; x < 11; x++) put(d, x, 12, [44, 70, 34]);
  };
  G.zombie_shirt = (d, r) => { noisy(d, r, [36, 158, 162], 16, 18); for (let k = 0; k < 8; k++) put(d, r() * 16 | 0, r() * 16 | 0, [26, 120, 124]); };
  G.zombie_pants = (d, r) => noisy(d, r, [66, 62, 148], 14, 16);
  G.player_skin = (d, r) => noisy(d, r, [208, 156, 120], 8, 8);
  G.white = (d) => { for (let i = 0; i < 1024; i += 4) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255; } };
  G._missing = (d) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(d, x, y, ((x >> 3) + (y >> 3)) % 2 ? [255, 0, 255] : [0, 0, 0]); };

  // Clamp helper: Uint8ClampedArray does rounding/clamping for us.
  const pix = {};
  function generate() {
    const N = TEX_NAMES.length;
    const data = new Uint8Array(N * 1024);
    for (const name of TEX_NAMES) {
      const d = new Uint8ClampedArray(1024);
      (G[name] || G._missing)(d, mulberry(hashSeed(name)), name);
      pix[name] = d;
      data.set(d, TEX[name] * 1024);
    }
    return data;
  }

  // Mip chain with coverage-preserving alpha for cut-out textures.
  function mips(data, layers) {
    const out = [data];
    let size = 16, prev = data;
    while (size > 1) {
      const ns = size >> 1;
      const m = new Uint8Array(layers * ns * ns * 4);
      for (let l = 0; l < layers; l++) for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0, ar = 0, ag = 0, ab = 0;
        for (let k = 0; k < 4; k++) {
          const sx = x * 2 + (k & 1), sy = y * 2 + (k >> 1);
          const si = (l * size * size + sy * size + sx) * 4;
          ar += prev[si]; ag += prev[si + 1]; ab += prev[si + 2];
          if (prev[si + 3] > 127) { r += prev[si]; g += prev[si + 1]; b += prev[si + 2]; n++; }
          a += prev[si + 3];
        }
        const di = (l * ns * ns + y * ns + x) * 4;
        if (n) { m[di] = r / n; m[di + 1] = g / n; m[di + 2] = b / n; } else { m[di] = ar / 4; m[di + 1] = ag / 4; m[di + 2] = ab / 4; }
        m[di + 3] = n >= 2 ? Math.max(a / 4, 200) | 0 : (n === 1 ? (a / 4) | 0 : 0);
      }
      out.push(m); prev = m; size = ns;
    }
    return out;
  }

  // ---- Icons ----
  const iconCache = {};
  const DEFAULT_TINT = [0.50, 0.74, 0.30];
  function texCanvas(name, tint) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(16, 16);
    const src = pix[name];
    for (let i = 0; i < 1024; i += 4) {
      let r = src[i], g = src[i + 1], b = src[i + 2];
      if (tint) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = (mx - mn) / 255;
        const t = 1 - Math.min(1, Math.max(0, (sat - 0.08) / 0.12));
        r = r * (1 - t + t * tint[0]); g = g * (1 - t + t * tint[1]); b = b * (1 - t + t * tint[2]);
      }
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = src[i + 3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function iconFor(id) {
    if (iconCache[id]) return iconCache[id];
    const SZ = 64;
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (id < 256) {
      const b = BLOCKS[id];
      const tint = b.tint ? DEFAULT_TINT : null;
      if (b.model === 'cube' || b.model === 'liquid') {
        const face = (name, a, bb, cc, dd, e, f, dark) => {
          const fc = document.createElement('canvas'); fc.width = fc.height = SZ;
          const fx = fc.getContext('2d'); fx.imageSmoothingEnabled = false;
          fx.setTransform(a, bb, cc, dd, e, f);
          fx.drawImage(texCanvas(name, tint), 0, 0);
          fx.setTransform(1, 0, 0, 1, 0, 0);
          if (dark) { fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(0,0,0,' + dark + ')'; fx.fillRect(0, 0, SZ, SZ); }
          ctx.drawImage(fc, 0, 0);
        };
        const s = SZ / 16, pad = 2;
        const W = (SZ - pad * 2) / 2 / 16, Hh = (SZ - pad * 2) / 4 / 16, V = (SZ - pad * 2) / 2 / 16;
        // top, left (+Z face), right (+X face)
        face(b.tex[2], W, -Hh, W, Hh, pad, pad + Hh * 16, 0);
        face(b.tex[4], W, Hh, 0, V * 1.02, pad, pad + Hh * 16, 0.22);
        face(b.tex[0], W, -Hh, 0, V * 1.02, pad + W * 16, pad + Hh * 32, 0.42);
        void s;
      } else {
        ctx.drawImage(texCanvas(b.tex[0], tint), 0, 0, 16, 16, 4, 4, SZ - 8, SZ - 8);
      }
    } else {
      const it = ITEMS[id];
      ctx.drawImage(texCanvas(TEX_NAMES[it.tex], null), 0, 0, 16, 16, 4, 4, SZ - 8, SZ - 8);
    }
    iconCache[id] = c.toDataURL();
    return iconCache[id];
  }
  return { generate, mips, iconFor, pix };
})();
