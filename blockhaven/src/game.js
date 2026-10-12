// ---------------------------------------------------------------------------
// Gameplay: settings, audio, inventory/crafting, player, mobs, items, particles.
// ---------------------------------------------------------------------------
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const DEFAULT_SETTINGS = { dist: IS_TOUCH ? 5 : 8, fov: 75, sens: 1, vol: 0.7, scale: IS_TOUCH ? 0.7 : 1, shadows: true, hq: !IS_TOUCH, music: true, invert: false, bob: true };
const settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('blockhaven.settings', {}));
const saveSettings = () => Store.set('blockhaven.settings', settings);

const DAY_LENGTH = 720; // seconds per full day/night cycle
const rand = Math.random;

// ---- Audio (all synthesised) ------------------------------------------------
const Sfx = (() => {
  let ctx = null, master = null, sfx = null, musicBus = null, noiseBuf = null;
  let nextMusic = 20;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = settings.vol;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp); comp.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.22;
      const verb = ctx.createConvolver();
      const len = ctx.sampleRate * 3.5, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.8;
      musicBus.connect(verb); verb.connect(wet); wet.connect(master); musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function setVolume(v) { if (master) master.gain.value = v; }
  function noise(freq, q, type, dur, vol, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, type, vol, delay, dest) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  const MAT = {
    stone: [2400, 1.1, 'bandpass', 0.09, 0.5], dirt: [650, 0.8, 'lowpass', 0.11, 0.55], grass: [1500, 0.6, 'bandpass', 0.12, 0.45],
    wood: [480, 2.6, 'bandpass', 0.1, 0.7], sand: [2600, 0.5, 'highpass', 0.13, 0.35], gravel: [1100, 0.9, 'bandpass', 0.14, 0.55],
    glass: [3800, 2.5, 'bandpass', 0.07, 0.45], snow: [1700, 0.5, 'lowpass', 0.13, 0.45], wool: [800, 0.4, 'lowpass', 0.1, 0.4],
  };
  function play(kind, a, vol) {
    if (!ctx) return;
    vol = vol === undefined ? 1 : vol;
    if (vol <= 0.01) return;
    const m = MAT[a] || MAT.stone;
    switch (kind) {
      case 'dig': noise(m[0], m[1], m[2], m[3] * 0.8, m[4] * 0.45 * vol); break;
      case 'step': noise(m[0] * 0.8, m[1], m[2], m[3] * 0.7, m[4] * 0.22 * vol); break;
      case 'break':
        noise(m[0], m[1], m[2], m[3] * 1.8, m[4] * vol);
        noise(m[0] * 0.6, m[1], m[2], m[3] * 1.4, m[4] * 0.6 * vol, 0.03);
        if (a === 'glass') { tone(2600, 2100, 0.25, 'sine', 0.12 * vol); tone(3400, 2800, 0.2, 'sine', 0.08 * vol, 0.04); }
        break;
      case 'place': noise(m[0] * 0.7, m[1], m[2], m[3] * 1.1, m[4] * 0.8 * vol); tone(140, 80, 0.07, 'sine', 0.25 * vol); break;
      case 'hurt': tone(320, 140, 0.18, 'square', 0.12 * vol); noise(900, 0.7, 'lowpass', 0.12, 0.3 * vol); break;
      case 'hit': noise(1200, 0.9, 'bandpass', 0.08, 0.6 * vol); tone(180, 90, 0.09, 'triangle', 0.25 * vol); break;
      case 'pop': tone(520, 1100, 0.07, 'sine', 0.16 * vol); break;
      case 'eat': for (let i = 0; i < 3; i++) noise(1400, 1.2, 'bandpass', 0.07, 0.4 * vol, i * 0.13); break;
      case 'splash': noise(900, 0.5, 'lowpass', 0.45, 0.5 * vol); noise(2500, 0.6, 'bandpass', 0.3, 0.2 * vol, 0.05); break;
      case 'click': tone(900, 700, 0.04, 'square', 0.05 * vol); break;
      case 'craft': tone(660, 660, 0.08, 'triangle', 0.12 * vol); tone(990, 990, 0.12, 'triangle', 0.1 * vol, 0.07); break;
      case 'zombie': {
        const f = 70 + Math.random() * 30;
        tone(f * 1.5, f, 0.9, 'sawtooth', 0.09 * vol);
        tone(f * 1.52, f * 1.02, 0.85, 'sawtooth', 0.06 * vol, 0.04);
        break;
      }
      case 'pig': tone(380, 260, 0.12, 'sawtooth', 0.08 * vol); tone(420, 300, 0.14, 'sawtooth', 0.07 * vol, 0.15); break;
      case 'sheep': { for (let i = 0; i < 5; i++) tone(430 + (i % 2) * 18, 400, 0.09, 'sawtooth', 0.06 * vol, i * 0.08); break; }
      case 'death': tone(300, 60, 0.5, 'sawtooth', 0.1 * vol); break;
      case 'fizz': noise(3000, 0.5, 'highpass', 0.4, 0.2 * vol); break;
      default: break;
    }
  }
  // Generative ambient piano: soft pentatonic phrases through a long reverb.
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function note(midi, t, vol, dur) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    for (const [mul, v] of [[1, 1], [2, 0.32], [3, 0.1]]) {
      const o = ctx.createOscillator(); o.type = mul === 1 ? 'sine' : 'triangle'; o.frequency.value = f * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function music(dt) {
    if (!ctx || !settings.music) return;
    nextMusic -= dt;
    if (nextMusic > 0) return;
    nextMusic = 35 + Math.random() * 55;
    const root = [48, 50, 53, 55][(Math.random() * 4) | 0];
    let t = ctx.currentTime + 0.1;
    note(root - 12, t, 0.22, 7);
    note(root - 5, t + 0.02, 0.12, 6);
    const n = 5 + ((Math.random() * 6) | 0);
    let deg = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      t += 0.55 + Math.random() * 0.9;
      deg = Math.max(0, Math.min(SCALE.length - 1, deg + ((Math.random() * 5) | 0) - 2));
      note(root + 12 + SCALE[deg], t, 0.16 + Math.random() * 0.08, 3.5);
      if (Math.random() < 0.25) note(root + SCALE[deg], t + 0.01, 0.08, 4);
    }
  }
  return { init, play, music, setVolume, get ready() { return !!ctx; } };
})();

// ---- Inventory --------------------------------------------------------------
const Inv = {
  slots: new Array(36).fill(null), // 0..8 hotbar, 9..35 backpack
  sel: 0,
  cursor: null,
  dirty: true,
  held() { return this.slots[this.sel]; },
  add(id, n) {
    const ms = maxStack(id);
    for (let pass = 0; pass < 2 && n > 0; pass++) {
      for (let i = 0; i < 36 && n > 0; i++) {
        const s = this.slots[i];
        if (pass === 0 && s && s.id === id && s.n < ms) { const k = Math.min(ms - s.n, n); s.n += k; n -= k; }
        else if (pass === 1 && !s) { const k = Math.min(ms, n); this.slots[i] = { id, n: k }; n -= k; }
      }
    }
    this.dirty = true;
    return n;
  },
  canTake(id) {
    const ms = maxStack(id);
    return this.slots.some((s) => !s || (s.id === id && s.n < ms));
  },
  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.n; return c; },
  remove(id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) this.slots[i] = null; }
    }
    this.dirty = true;
  },
  takeHeld(n) {
    const s = this.slots[this.sel]; if (!s) return;
    s.n -= n || 1; if (s.n <= 0) this.slots[this.sel] = null; this.dirty = true;
  },
};

const GROUPS = {
  planks: { name: 'Planks', ids: [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS] },
  logs: { name: 'Logs', ids: [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG] },
  fuel: { name: 'Fuel', ids: [I.COAL, B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS] },
};
const RECIPES = [];
function recipe(out, n, ins, station) { RECIPES.push({ out, n, ins, station: station || null }); }
recipe(B.PLANKS, 4, [[B.OAK_LOG, 1]]);
recipe(B.BIRCH_PLANKS, 4, [[B.BIRCH_LOG, 1]]);
recipe(B.SPRUCE_PLANKS, 4, [[B.SPRUCE_LOG, 1]]);
recipe(I.STICK, 4, [['planks', 2]]);
recipe(B.CRAFTING_TABLE, 1, [['planks', 4]]);
recipe(B.TORCH, 4, [[I.STICK, 1], [I.COAL, 1]]);
[['wood', 'planks'], ['stone', B.COBBLE], ['iron', I.IRON_INGOT], ['diamond', I.DIAMOND]].forEach(([m, mat]) => {
  recipe(toolId(m, 'pickaxe'), 1, [[mat, 3], [I.STICK, 2]], 'table');
  recipe(toolId(m, 'axe'), 1, [[mat, 3], [I.STICK, 2]], 'table');
  recipe(toolId(m, 'shovel'), 1, [[mat, 1], [I.STICK, 2]], 'table');
  recipe(toolId(m, 'sword'), 1, [[mat, 2], [I.STICK, 1]], 'table');
});
recipe(B.FURNACE, 1, [[B.COBBLE, 8]], 'table');
recipe(I.IRON_INGOT, 1, [[B.IRON_ORE, 1], ['fuel', 1]], 'furnace');
recipe(I.GOLD_INGOT, 1, [[B.GOLD_ORE, 1], ['fuel', 1]], 'furnace');
recipe(I.COAL, 1, [['logs', 1], ['planks', 1]], 'furnace');
recipe(B.GLASS, 1, [[B.SAND, 1], ['fuel', 1]], 'furnace');
recipe(B.STONE, 1, [[B.COBBLE, 1], ['fuel', 1]], 'furnace');
recipe(I.PORK_COOKED, 1, [[I.PORK_RAW, 1], ['fuel', 1]], 'furnace');
recipe(I.MUTTON_COOKED, 1, [[I.MUTTON_RAW, 1], ['fuel', 1]], 'furnace');
recipe(B.BRICKS, 2, [[B.DIRT, 2], [B.SAND, 2], ['fuel', 1]], 'furnace');
recipe(B.STONE_BRICKS, 4, [[B.STONE, 4]], 'table');
recipe(B.SANDSTONE, 1, [[B.SAND, 4]]);
recipe(B.BOOKSHELF, 1, [['planks', 6], [I.STICK, 3]], 'table');
recipe(B.GLOWSTONE, 1, [[B.GLASS, 1], [B.TORCH, 4]], 'table');
recipe(B.MOSSY_COBBLE, 1, [[B.COBBLE, 1], [B.TALL_GRASS, 1]]);
recipe(B.WOOL_RED, 1, [[B.WOOL_WHITE, 1], [B.POPPY, 1]]);
recipe(B.WOOL_YELLOW, 1, [[B.WOOL_WHITE, 1], [B.DANDELION, 1]]);
recipe(B.WOOL_BLUE, 1, [[B.WOOL_WHITE, 1], [B.CORNFLOWER, 1]]);
recipe(B.WOOL_BLACK, 1, [[B.WOOL_WHITE, 1], [I.COAL, 1]]);
recipe(B.WOOL_ORANGE, 1, [[B.WOOL_RED, 1], [B.WOOL_YELLOW, 1]]);

function ingCount(ing) {
  const k = ing[0];
  if (typeof k === 'string') return GROUPS[k].ids.reduce((a, id) => a + Inv.count(id), 0);
  return Inv.count(k);
}
function ingTake(ing) {
  let n = ing[1];
  const ids = typeof ing[0] === 'string' ? GROUPS[ing[0]].ids : [ing[0]];
  for (const id of ids) { const have = Inv.count(id); const k = Math.min(have, n); if (k) { Inv.remove(id, k); n -= k; } if (!n) break; }
}
function ingIcon(ing) { return typeof ing[0] === 'string' ? GROUPS[ing[0]].ids.find((id) => Inv.count(id) > 0) || GROUPS[ing[0]].ids[0] : ing[0]; }
function ingName(ing) { return typeof ing[0] === 'string' ? GROUPS[ing[0]].name : itemName(ing[0]); }

// ---- Game state ---------------------------------------------------------------
const G = {
  state: 'boot',        // boot | title | loading | play | paused | inventory | dead
  mode: 'survival',
  name: 'New Haven',
  seedText: '',
  seed: 0,
  days: 0.03,
  active: false,
  dragLook: false,
  locked: false,
  debug: false,
  hideHud: false,
  stationCache: null,
  saveTimer: 0,
  spawn: { x: 0.5, y: 80, z: 0.5 },
};
const P = {
  x: 0, y: 80, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
  hw: 0.3, h: 1.8, onGround: false, inWater: false, inLava: false, eyeIn: 0, headInWater: false,
  flying: false, sprinting: false, sneaking: false,
  health: 20, air: 10, hurtT: 0, invuln: 0, fall: 0, regen: 0, lastHurt: 0, burn: 0,
  bob: 0, bobAmt: 0, fovKick: 0, swing: 0, swingDir: 1, stepDist: 0, eyeH: 1.62, roll: 0,
  mining: null, attackCD: 0, placeCD: 0, lastJumpTap: 0, lastFwdTap: 0, cause: '',
};

let world, R;

// ---- Physics helpers -----------------------------------------------------------
function solidAt(x, y, z) { const b = world.getBlock(x, y, z); return b < 0 ? true : T_SOLID[b] === 1; }
function boxHits(x0, y0, z0, x1, y1, z1) {
  const ax = Math.floor(x0), bx = Math.floor(x1 - 1e-7), ay = Math.floor(y0), by = Math.floor(y1 - 1e-7), az = Math.floor(z0), bz = Math.floor(z1 - 1e-7);
  for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) if (solidAt(x, y, z)) return true;
  return false;
}
function boxHasBlock(e, id, y0, y1) {
  const ax = Math.floor(e.x - e.hw), bx = Math.floor(e.x + e.hw - 1e-7), az = Math.floor(e.z - e.hw), bz = Math.floor(e.z + e.hw - 1e-7);
  for (let y = Math.floor(e.y + y0); y <= Math.floor(e.y + y1 - 1e-7); y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) if (world.getBlock(x, y, z) === id) return true;
  return false;
}
function moveEntity(e, dx, dy, dz, sneakGuard) {
  const hw = e.hw, h = e.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.35));
  dx /= steps; dy /= steps; dz /= steps;
  e.hitX = e.hitZ = false; e.onGround = false;
  for (let s = 0; s < steps; s++) {
    if (dy) {
      let ny = e.y + dy;
      if (boxHits(e.x - hw, ny, e.z - hw, e.x + hw, ny + h, e.z + hw)) {
        if (dy < 0) { ny = Math.floor(ny) + 1; e.onGround = true; } else ny = Math.floor(ny + h) - h - 0.001;
        e.vy = 0; dy = 0;
      }
      e.y = ny;
    }
    if (dx) {
      let nx = e.x + dx;
      if (sneakGuard && !boxHits(nx - hw, e.y - 0.6, e.z - hw, nx + hw, e.y - 0.01, e.z + hw)) { nx = e.x; e.vx = 0; }
      else if (boxHits(nx - hw, e.y, e.z - hw, nx + hw, e.y + h, e.z + hw)) {
        nx = dx > 0 ? Math.floor(nx + hw) - hw - 0.001 : Math.floor(nx - hw) + 1 + hw + 0.001;
        e.vx = 0; e.hitX = true; dx = 0;
      }
      e.x = nx;
    }
    if (dz) {
      let nz = e.z + dz;
      if (sneakGuard && !boxHits(e.x - hw, e.y - 0.6, nz - hw, e.x + hw, e.y - 0.01, nz + hw)) { nz = e.z; e.vz = 0; }
      else if (boxHits(e.x - hw, e.y, nz - hw, e.x + hw, e.y + h, nz + hw)) {
        nz = dz > 0 ? Math.floor(nz + hw) - hw - 0.001 : Math.floor(nz - hw) + 1 + hw + 0.001;
        e.vz = 0; e.hitZ = true; dz = 0;
      }
      e.z = nz;
    }
  }
  if (!e.onGround && e.vy <= 0 && boxHits(e.x - hw, e.y - 0.02, e.z - hw, e.x + hw, e.y, e.z + hw)) e.onGround = true;
}

function raycast(ox, oy, oz, dx, dy, dz, maxD) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
  let tmx = dx ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
  let tmy = dy ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
  let tmz = dz ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 100; i++) {
    if (t > maxD) break;
    const b = world.getBlock(x, y, z);
    if (b > 0 && BLOCKS[b].target) return { x, y, z, id: b, nx, ny, nz, t };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return -1; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

function lightAt(x, y, z) { const l = world.getLight(Math.floor(x), Math.floor(y), Math.floor(z)); return [l[0] / 15, l[1] / 15]; }
function dayFactor(t) { const h = Math.sin(t * Math.PI * 2); return smoothstep(-0.18, 0.22, h); }

// ---- Particles ------------------------------------------------------------------
const Particles = {
  list: [],
  buf: new Float32Array(2048 * 11),
  debris(x, y, z, id, n, spread) {
    const d = BLOCKS[id]; if (!d) return;
    const layer = d.texL[0];
    const l = lightAt(x, y, z);
    for (let i = 0; i < n && this.list.length < 2000; i++) {
      this.list.push({
        x: x + (rand() - 0.5) * spread, y: y + (rand() - 0.5) * spread, z: z + (rand() - 0.5) * spread,
        vx: (rand() - 0.5) * 4, vy: rand() * 4 + 1, vz: (rand() - 0.5) * 4, life: 0.5 + rand() * 0.7, g: 16,
        layer, u: (rand() * 12 | 0) / 16, v: (rand() * 12 | 0) / 16, size: 0.09 + rand() * 0.06, c: [l[0], l[1], d.tint ? 1 : 0, 1],
      });
    }
  },
  puff(x, y, z, col, n, opts) {
    opts = opts || {};
    for (let i = 0; i < n && this.list.length < 2000; i++) {
      this.list.push({
        x: x + (rand() - 0.5) * (opts.spread || 0.6), y: y + (rand() - 0.5) * (opts.spread || 0.6), z: z + (rand() - 0.5) * (opts.spread || 0.6),
        vx: (rand() - 0.5) * (opts.v || 1), vy: (opts.up || 1) * (0.5 + rand()), vz: (rand() - 0.5) * (opts.v || 1),
        life: (opts.life || 0.8) * (0.6 + rand() * 0.6), g: opts.g || -0.5, layer: -1, u: 0, v: 0, size: opts.size || 0.12,
        c: [col[0], col[1], col[2], col[3] === undefined ? 0.85 : col[3]], grow: opts.grow || 0,
      });
    }
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= p.g * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.layer >= 0 && solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) { p.vx *= 0.4; p.vz *= 0.4; p.vy = 0; }
      else { p.x = nx; p.y = ny; p.z = nz; }
      if (p.grow) p.size += p.grow * dt;
    }
  },
  fill(cam) {
    let n = 0;
    const b = this.buf;
    for (const p of this.list) {
      const o = n * 11;
      b[o] = p.x - cam[0]; b[o + 1] = p.y - cam[1]; b[o + 2] = p.z - cam[2];
      b[o + 3] = p.layer; b[o + 4] = p.u; b[o + 5] = p.v; b[o + 6] = p.size;
      b[o + 7] = p.c[0]; b[o + 8] = p.c[1]; b[o + 9] = p.c[2]; b[o + 10] = p.layer < 0 ? p.c[3] * Math.min(1, p.life * 2) : 1;
      if (++n >= 2048) break;
    }
    return n;
  },
};

// ---- Dropped items & falling blocks ------------------------------------------------
const Drops = {
  list: [],
  spawn(id, n, x, y, z, vx, vy, vz, delay) {
    this.list.push({ id, n, x, y, z, vx: vx === undefined ? (rand() - 0.5) * 3 : vx, vy: vy === undefined ? 3 + rand() * 2 : vy, vz: vz === undefined ? (rand() - 0.5) * 3 : vz, hw: 0.125, h: 0.25, age: 0, delay: delay || 0.4, spin: rand() * 6 });
  },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.age += dt; d.delay -= dt;
      if (d.age > 300 || d.y < -10) { L.splice(i, 1); continue; }
      if (!world.isReady(Math.floor(d.x), Math.floor(d.z))) continue;
      const dx = P.x - d.x, dy = (P.y + 0.8) - d.y, dz = P.z - d.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d.delay <= 0 && G.state !== 'dead' && dist < 2.4 && Inv.canTake(d.id)) {
        if (dist < 0.7) {
          const left = Inv.add(d.id, d.n);
          Sfx.play('pop', null, 0.8);
          if (left) d.n = left; else { L.splice(i, 1); continue; }
        } else {
          const k = 10 / Math.max(dist, 0.3);
          d.vx += dx * k * dt; d.vy += dy * k * dt; d.vz += dz * k * dt;
          d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
          d.vx *= 0.9; d.vy *= 0.9; d.vz *= 0.9;
          continue;
        }
      }
      const inW = world.getBlock(Math.floor(d.x), Math.floor(d.y + 0.1), Math.floor(d.z)) === B.WATER;
      d.vy -= (inW ? 2 : 18) * dt;
      if (inW) d.vy = Math.max(d.vy, -1);
      d.vx *= Math.pow(d.onGround ? 0.02 : 0.6, dt); d.vz *= Math.pow(d.onGround ? 0.02 : 0.6, dt);
      moveEntity(d, d.vx * dt, d.vy * dt, d.vz * dt);
      if (d.hitX) d.vx = 0; if (d.hitZ) d.vz = 0;
    }
  },
};
const Falling = {
  list: [],
  spawn(id, x, y, z) { this.list.push({ id, x: x + 0.5, y, z: z + 0.5, vy: 0 }); },
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const f = L[i];
      f.vy = Math.max(f.vy - 30 * dt, -40);
      const ny = f.y + f.vy * dt;
      const bx = Math.floor(f.x), bz = Math.floor(f.z);
      const below = world.getBlock(bx, Math.floor(ny), bz);
      if (ny < 0 || (below !== -1 && below > 0 && T_SOLID[below])) {
        const cy = Math.floor(ny) + 1;
        const cur = world.getBlock(bx, cy, bz);
        if (cur === B.AIR || cur === B.WATER || (cur > 0 && BLOCKS[cur].replaceable)) { world.setBlock(bx, cy, bz, f.id); blockUpdate(bx, cy, bz); }
        else if (G.mode === 'survival') Drops.spawn(f.id, 1, f.x, cy + 0.5, f.z);
        Sfx.play('place', BLOCKS[f.id].sound, 0.6);
        L.splice(i, 1);
        continue;
      }
      f.y = ny;
    }
  },
};

// ---- World interaction -------------------------------------------------------------
function needsSupport(id) { const m = BLOCKS[id].model; return m === 'cross' || m === 'torch'; }
function blockUpdate(x, y, z) {
  // Called after the block at (x,y,z) changed. Updates the cell above and neighbouring water.
  const above = world.getBlock(x, y + 1, z);
  const here = world.getBlock(x, y, z);
  if (above > 0 && needsSupport(above) && !(here > 0 && T_SOLID[here])) {
    world.setBlock(x, y + 1, z, B.AIR);
    Particles.debris(x + 0.5, y + 1.3, z + 0.5, above, 6, 0.4);
    if (G.mode === 'survival') dropFor(above, 0, x + 0.5, y + 1.3, z + 0.5);
    blockUpdate(x, y + 1, z);
  } else if (above > 0 && BLOCKS[above].falls && (here === B.AIR || here === B.WATER || (here > 0 && !T_SOLID[here]))) {
    world.setBlock(x, y + 1, z, B.AIR);
    Falling.spawn(above, x, y + 1, z);
    blockUpdate(x, y + 1, z);
  }
  if (here > 0 && BLOCKS[here].falls) {
    const below = world.getBlock(x, y - 1, z);
    if (below === B.AIR || below === B.WATER || (below > 0 && !T_SOLID[below])) {
      world.setBlock(x, y, z, B.AIR); Falling.spawn(here, x, y, z); blockUpdate(x, y, z);
    }
  }
  if (here === B.AIR || (here > 0 && BLOCKS[here].replaceable)) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) { world.queueFluid(x, y, z); break; }
    }
  }
}
function dropFor(id, toolItem, x, y, z) {
  const d = BLOCKS[id];
  const it = ITEMS[toolItem];
  const canHarvest = !d.tier || (it && it.tool === d.tool && it.tier >= d.tier);
  if (!canHarvest) return;
  if (id === B.OAK_LEAVES && rand() < 0.06) Drops.spawn(I.APPLE, 1, x, y, z);
  if (id === B.GRAVEL && rand() < 0.1) { Drops.spawn(I.COAL, 1, x, y, z); return; }
  if (id === B.TALL_GRASS && rand() < 0.08) { Drops.spawn(B.TALL_GRASS, 1, x, y, z); return; }
  if (d.drop) Drops.spawn(d.drop, 1, x, y, z);
}
function breakTime(id, toolItem) {
  const d = BLOCKS[id];
  if (d.hardness < 0) return Infinity;
  if (d.hardness === 0) return 0.05;
  const it = ITEMS[toolItem];
  const right = it && d.tool && it.tool === d.tool;
  const canHarvest = !d.tier || (right && it.tier >= d.tier);
  let speed = right ? it.speed : 1;
  if (it && it.tool === 'sword' && (d.wave === 1 || id === B.CACTUS)) speed = 1.5;
  let t = d.hardness * (canHarvest ? 1.5 : 5) / speed;
  if (P.headInWater) t *= 2.5;
  if (!P.onGround && !P.flying && !P.inWater) t *= 2;
  return t;
}
function nearStation(id) {
  const x0 = Math.floor(P.x), y0 = Math.floor(P.y), z0 = Math.floor(P.z);
  for (let y = y0 - 3; y <= y0 + 4; y++) for (let z = z0 - 4; z <= z0 + 4; z++) for (let x = x0 - 4; x <= x0 + 4; x++) if (world.getBlock(x, y, z) === id) return true;
  return false;
}

// ---- Player -------------------------------------------------------------------
function damagePlayer(n, cause, kx, kz) {
  if (G.mode === 'creative' || G.state === 'dead' || P.invuln > 0) return;
  P.health = Math.max(0, P.health - n);
  P.invuln = 0.5; P.hurtT = 0.45; P.lastHurt = 0; P.cause = cause;
  P.roll = (rand() < 0.5 ? -1 : 1) * 0.12;
  if (kx !== undefined) { P.vx += kx * 7; P.vz += kz * 7; P.vy = Math.max(P.vy, 5); }
  Sfx.play('hurt');
  UI.hurtFlash();
  if (P.health <= 0) die();
}
function die() {
  G.state = 'dead';
  P.mining = null;
  Sfx.play('death');
  UI.showDeath(P.cause);
  if (document.exitPointerLock && G.locked) { G.expectUnlock = true; document.exitPointerLock(); }
}
function respawn() {
  P.health = 20; P.air = 10; P.vx = P.vy = P.vz = 0; P.fall = 0; P.burn = 0;
  P.x = G.spawn.x; P.z = G.spawn.z;
  const top = world.isReady(Math.floor(P.x), Math.floor(P.z)) ? world.topSolid(Math.floor(P.x), Math.floor(P.z)) : G.spawn.y;
  P.y = Math.max(top + 1, 2);
  G.state = 'play';
  UI.showScreen(null);
  Input.lock();
}

const Input = {
  keys: {}, left: false, right: false, mid: false,
  moveX: 0, moveY: 0, jumpBtn: false, sneakToggle: false, touchLook: null, touchActions: false,
  lock() {
    if (IS_TOUCH || G.dragLook) return;
    const c = document.getElementById('gl');
    try {
      const p = c.requestPointerLock && c.requestPointerLock();
      if (p && p.catch) p.catch(() => Input.lockFailed());
    } catch (e) { Input.lockFailed(); }
  },
  // One failure can be a timing hiccup (Chrome refuses a re-lock right after Esc);
  // two in a row means the page can't capture the mouse, so fall back to drag-to-look.
  lockFailed() {
    const now = performance.now();
    if (now - (G.lastLockFail || 0) < 400) return;
    G.lastLockFail = now;
    G.lockFails = (G.lockFails || 0) + 1;
    if (G.lockFails >= 2 && !G.dragLook) { G.dragLook = true; UI.toast('Mouse capture is unavailable here: drag to look around'); }
    else if (!G.dragLook) UI.toast('Click the world to capture the mouse');
  },
};

function updatePlayer(dt) {
  const k = Input.keys;
  const creative = G.mode === 'creative';
  // Movement intent
  let fwd = 0, str = 0;
  if (k.KeyW || k.ArrowUp) fwd += 1;
  if (k.KeyS || k.ArrowDown) fwd -= 1;
  if (k.KeyA) str -= 1;
  if (k.KeyD) str += 1;
  if (Input.moveX || Input.moveY) { str += Input.moveX; fwd += -Input.moveY; }
  if (k.ArrowLeft) P.yaw += 2.2 * dt;
  if (k.ArrowRight) P.yaw -= 2.2 * dt;
  const jump = k.Space || Input.jumpBtn;
  const sneakKey = k.ShiftLeft || k.ShiftRight || Input.sneakToggle;
  P.sneaking = sneakKey && !P.flying;
  if ((k.ControlLeft || k.ControlRight) && fwd > 0) P.sprinting = true;
  if (fwd <= 0 || P.sneaking || (P.onGround && P.hitX && P.hitZ)) P.sprinting = false;
  if (IS_TOUCH && Math.hypot(Input.moveX, Input.moveY) > 0.95 && fwd > 0.7) P.sprinting = true;

  const feetBlock = world.getBlock(Math.floor(P.x), Math.floor(P.y + 0.1), Math.floor(P.z));
  P.inWater = boxHasBlock(P, B.WATER, 0, 1.2);
  P.inLava = boxHasBlock(P, B.LAVA, 0, 1.2);
  const eyeB = world.getBlock(Math.floor(P.x), Math.floor(P.y + P.eyeH), Math.floor(P.z));
  P.headInWater = eyeB === B.WATER;
  P.eyeIn = eyeB === B.WATER ? 1 : eyeB === B.LAVA ? 2 : 0;
  void feetBlock;

  const len = Math.hypot(fwd, str);
  if (len > 1) { fwd /= len; str /= len; }
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  const wx = -sy * fwd + cy * str, wz = -cy * fwd - sy * str;
  let speed;
  if (P.flying) speed = P.sprinting ? 21 : 10.9;
  else if (P.inWater || P.inLava) speed = P.inLava ? 1.5 : (P.sprinting ? 3.4 : 2.4);
  else if (P.sneaking) speed = 1.35;
  else speed = P.sprinting ? 5.6 : 4.32;
  const below = world.getBlock(Math.floor(P.x), Math.floor(P.y - 0.05), Math.floor(P.z));
  const icy = below === B.ICE;
  const accel = P.flying ? 8 : (P.onGround ? (icy ? 1.6 : 16) : (P.inWater ? 7 : 2.6));
  const f = 1 - Math.exp(-accel * dt);
  P.vx += (wx * speed - P.vx) * f;
  P.vz += (wz * speed - P.vz) * f;

  if (P.flying) {
    let ty = 0;
    if (jump) ty += 8; if (sneakKey) ty -= 8;
    P.vy += (ty - P.vy) * (1 - Math.exp(-10 * dt));
  } else if (P.inWater || P.inLava) {
    P.vy -= 10 * dt;
    P.vy *= Math.exp(-3.2 * dt);
    if (jump) P.vy = Math.min(P.vy + 26 * dt, 3.4);
    P.vy = Math.max(P.vy, -4);
    // jump out at the water edge
    if (jump && (P.hitX || P.hitZ)) P.vy = 5.5;
  } else {
    P.vy -= 30 * dt;
    P.vy = Math.max(P.vy, -60);
    if (jump && P.onGround) { P.vy = 8.7; if (P.sprinting) { P.vx += wx * 1.5; P.vz += wz * 1.5; } }
  }
  // Auto-jump on touch: hop up single blocks while walking.
  if (IS_TOUCH && P.onGround && !P.flying && len > 0.3 && (P.hitX || P.hitZ)) {
    const ax = Math.floor(P.x + wx * 0.6), az = Math.floor(P.z + wz * 0.6), ay = Math.floor(P.y);
    if (solidAt(ax, ay, az) && !solidAt(ax, ay + 1, az) && !solidAt(ax, ay + 2, az)) P.vy = 8.7;
  }
  const prevY = P.y, wasGround = P.onGround;
  const guard = P.sneaking && P.onGround;
  moveEntity(P, P.vx * dt, P.vy * dt, P.vz * dt, guard);
  if (P.flying && P.onGround && !creative) P.flying = false;
  if (P.flying && P.onGround && sneakKey) P.flying = false;

  // Fall damage
  if (!P.onGround && P.vy < 0 && !P.inWater && !P.flying) P.fall += prevY - P.y;
  if (P.inWater || P.flying || P.inLava) P.fall = 0;
  if (P.onGround) {
    if (P.fall > 3.4) {
      damagePlayer(Math.floor(P.fall - 3), 'Fell from a high place');
      Particles.debris(P.x, P.y + 0.1, P.z, Math.max(1, below), 10, 0.6);
    }
    if (!wasGround && P.fall > 1) Sfx.play('step', BLOCKS[Math.max(1, below)] ? BLOCKS[Math.max(1, below)].sound : 'stone', 0.9);
    P.fall = 0;
  }
  // Footsteps & bobbing
  const hs = Math.hypot(P.vx, P.vz);
  if (P.onGround && hs > 0.5) {
    P.stepDist += hs * dt;
    P.bob += hs * dt * 2.1;
    if (P.stepDist > 1.9) { P.stepDist = 0; if (below > 0) Sfx.play('step', BLOCKS[below].sound, P.sneaking ? 0.3 : 0.75); }
  }
  P.bobAmt += ((P.onGround && hs > 0.5 && !P.flying ? Math.min(1, hs / 4.3) : 0) - P.bobAmt) * Math.min(1, dt * 8);
  const fk = (P.sprinting ? 9 : 0) + (P.flying && P.sprinting ? 6 : 0);
  P.fovKick += (fk - P.fovKick) * Math.min(1, dt * 6);
  const eyeT = P.sneaking ? 1.32 : 1.62;
  P.eyeH += (eyeT - P.eyeH) * Math.min(1, dt * 14);
  P.roll *= Math.exp(-6 * dt);

  // Water splash
  if (P.inWater && !P.wasInWater && P.vy < -6) { Sfx.play('splash'); Particles.puff(P.x, P.y + 0.3, P.z, [0.5, 0.7, 1.0, 0.8], 14, { up: 3, v: 3, g: 8, life: 0.7, size: 0.1 }); }
  P.wasInWater = P.inWater;

  // Survival vitals
  P.invuln -= dt; P.hurtT -= dt; P.lastHurt += dt;
  if (!creative) {
    if (P.headInWater) {
      P.air -= dt;
      if (P.air < 0) { P.air = 0; P.regen += dt; if (P.regen > 1) { P.regen = 0; damagePlayer(2, 'Drowned'); } }
    } else P.air = Math.min(10, P.air + dt * 4);
    if (P.inLava) { damagePlayer(4, 'Tried to swim in lava'); P.burn = 4; }
    if (P.burn > 0) {
      P.burn -= dt;
      if (P.inWater) P.burn = 0;
      if (rand() < dt * 20) Particles.puff(P.x, P.y + 1, P.z, [3, 1.2, 0.2, 0.9], 1, { up: 1.5, life: 0.5, size: 0.08 });
      if (Math.floor(P.burn * 1) !== Math.floor((P.burn + dt) * 1)) damagePlayer(1, 'Burned to death');
    }
    if (boxHasBlock(P, B.CACTUS, -0.05, 1.8) || (P.hitX || P.hitZ) && cactusNear()) damagePlayer(1, 'Pricked to death by a cactus');
    if (P.health < 20 && P.lastHurt > 4) { P.regen += dt; if (P.regen > 2.5) { P.regen = 0; P.health = Math.min(20, P.health + 1); } }
    if (P.y < -20) damagePlayer(4, 'Fell out of the world');
  } else { P.air = 10; P.health = 20; }
  if (P.y < -60) { P.y = 120; P.vy = 0; }
}
function cactusNear() {
  for (const [dx, dz] of [[0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) if (world.getBlock(Math.floor(P.x + dx), Math.floor(P.y + 0.5), Math.floor(P.z + dz)) === B.CACTUS) return true;
  return false;
}

// ---- Targeting, mining and placing ------------------------------------------------
let target = null; // {kind:'block', ...} | {kind:'mob', mob}
function eyePos() { return [P.x, P.y + P.eyeH, P.z]; }
function lookDir() { const cp = Math.cos(P.pitch); return [-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp]; }
function updateTarget() {
  const e = eyePos(), d = lookDir();
  const reach = G.mode === 'creative' ? 6 : 5;
  const hit = raycast(e[0], e[1], e[2], d[0], d[1], d[2], reach);
  let best = hit ? { kind: 'block', ...hit } : null;
  for (const m of Mobs.list) {
    if (m.dead) continue;
    const t = rayBox(e[0], e[1], e[2], d[0], d[1], d[2], m.x - m.hw, m.y, m.z - m.hw, m.x + m.hw, m.y + m.h, m.z + m.hw);
    if (t >= 0 && t < Math.min(3.5, best ? best.t : 1e9)) best = { kind: 'mob', mob: m, t };
  }
  target = best;
}
function swing() { P.swing = 1; }
function updateActions(dt) {
  const creative = G.mode === 'creative';
  const held = Inv.held();
  const heldId = held ? held.id : 0;
  P.attackCD -= dt; P.placeCD -= dt;
  if (P.swing > 0) P.swing = Math.max(0, P.swing - dt * 3.2);
  // Left: mine / attack
  if (Input.left && G.state === 'play') {
    if (target && target.kind === 'mob') {
      P.mining = null;
      if (P.attackCD <= 0) {
        P.attackCD = 0.45; swing();
        const it = ITEMS[heldId];
        const dmg = it && it.damage ? it.damage : 1;
        const d = lookDir();
        Mobs.hurt(target.mob, creative ? dmg * 3 : dmg, d[0], d[2]);
      }
    } else if (target && target.kind === 'block') {
      const key = target.x + ',' + target.y + ',' + target.z;
      if (creative) {
        if (P.attackCD <= 0) { P.attackCD = 0.22; swing(); breakBlock(target.x, target.y, target.z, target.id, heldId); }
      } else {
        if (!P.mining || P.mining.key !== key) P.mining = { key, x: target.x, y: target.y, z: target.z, id: target.id, p: 0, snd: 0 };
        const t = breakTime(target.id, heldId);
        P.mining.p += dt / t;
        P.mining.snd -= dt;
        if (P.swing <= 0.05) swing();
        if (P.mining.snd <= 0) {
          P.mining.snd = 0.22;
          Sfx.play('dig', BLOCKS[target.id].sound, 0.7);
          Particles.debris(target.x + 0.5 + target.nx * 0.52, target.y + 0.5 + target.ny * 0.52, target.z + 0.5 + target.nz * 0.52, target.id, 3, 0.7);
        }
        if (P.mining.p >= 1) { breakBlock(target.x, target.y, target.z, target.id, heldId); P.mining = null; }
      }
    } else P.mining = null;
  } else {
    P.mining = null;
    if (!Input.left) P.attackCD = Math.min(P.attackCD, 0);
  }
  // Right: place / use / eat
  if (Input.right && G.state === 'play' && P.placeCD <= 0) {
    P.placeCD = 0.24;
    useItem();
  }
  if (!Input.right) P.placeCD = 0;
}
function breakBlock(x, y, z, id, toolItem) {
  const d = BLOCKS[id];
  if (d.hardness < 0) return;
  world.setBlock(x, y, z, B.AIR);
  Sfx.play('break', d.sound);
  Particles.debris(x + 0.5, y + 0.5, z + 0.5, id, 22, 0.9);
  if (G.mode === 'survival') dropFor(id, toolItem, x + 0.5, y + 0.4, z + 0.5);
  blockUpdate(x, y, z);
}
function useItem() {
  const creative = G.mode === 'creative';
  const held = Inv.held();
  const id = held ? held.id : 0;
  // Use stations
  if (target && target.kind === 'block' && !P.sneaking && (target.id === B.CRAFTING_TABLE || target.id === B.FURNACE)) {
    swing();
    UI.openInventory(target.id === B.FURNACE ? 'furnace' : 'table');
    Input.right = false;
    return;
  }
  // Eat
  if (id >= 256 && ITEMS[id].food) {
    if (P.health < 20 || creative) {
      P.health = Math.min(20, P.health + ITEMS[id].food);
      if (!creative) Inv.takeHeld(1);
      Sfx.play('eat'); swing(); P.placeCD = 0.6;
      const e = eyePos(), d = lookDir();
      Particles.puff(e[0] + d[0] * 0.5, e[1] - 0.25, e[2] + d[2] * 0.5, [0.8, 0.45, 0.35, 1], 8, { up: 1, v: 1.5, g: 9, life: 0.5, size: 0.06 });
    }
    return;
  }
  if (!id || id >= 256 || !target || target.kind !== 'block') return;
  const t = target;
  const tdef = BLOCKS[t.id];
  let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
  if (tdef.replaceable && t.id !== id) { x = t.x; y = t.y; z = t.z; }
  const cur = world.getBlock(x, y, z);
  if (!(cur === B.AIR || cur === B.WATER || cur === B.LAVA || (cur > 0 && BLOCKS[cur].replaceable))) return;
  if (y < 0 || y >= CH) return;
  const def = BLOCKS[id];
  // Plants need soil below
  if (def.model === 'cross') {
    const below = world.getBlock(x, y - 1, z);
    const soil = id === B.DEAD_BUSH ? [B.SAND, B.DIRT, B.GRASS] : [B.GRASS, B.DIRT, B.SNOWY_GRASS];
    if (!soil.includes(below)) return;
  }
  if (def.model === 'torch') {
    const below = world.getBlock(x, y - 1, z);
    if (!(below > 0 && T_SOLID[below])) { UI.toast('Torches need a solid block under them'); return; }
  }
  if (def.solid) {
    if (boxIntersects(P, x, y, z)) return;
    for (const m of Mobs.list) if (!m.dead && boxIntersects(m, x, y, z)) return;
  }
  world.setBlock(x, y, z, id);
  swing();
  Sfx.play('place', def.sound);
  if (!creative) Inv.takeHeld(1);
  blockUpdate(x, y, z);
  if (cur === B.WATER || cur === B.LAVA) Sfx.play('fizz', null, 0.4);
}
function boxIntersects(e, x, y, z) {
  return e.x + e.hw > x && e.x - e.hw < x + 1 && e.y + e.h > y && e.y < y + 1 && e.z + e.hw > z && e.z - e.hw < z + 1;
}
function pickBlock() {
  if (!target || target.kind !== 'block') return;
  const id = target.id;
  const slot = Inv.slots.findIndex((s, i) => i < 9 && s && s.id === id);
  if (slot >= 0) { Inv.sel = slot; Inv.dirty = true; UI.showItemName(); return; }
  if (G.mode === 'creative') {
    let empty = Inv.slots.findIndex((s, i) => i < 9 && !s);
    if (empty < 0) empty = Inv.sel;
    Inv.slots[empty] = { id, n: 64 }; Inv.sel = empty; Inv.dirty = true; UI.showItemName();
  }
}
function dropHeld(all) {
  const s = Inv.held(); if (!s) return;
  const n = all ? s.n : 1;
  const d = lookDir(), e = eyePos();
  if (G.mode === 'survival') Drops.spawn(s.id, n, e[0] + d[0] * 0.4, e[1] - 0.3, e[2] + d[2] * 0.4, d[0] * 5, d[1] * 5 + 2, d[2] * 5, 1.5);
  Inv.takeHeld(n);
}

// ---- Mobs ---------------------------------------------------------------------
const px = (v) => v / 16;
const L6 = (all) => [all, all, all, all, all, all];
const MOB_TYPES = {
  pig: {
    hw: 0.45, h: 0.9, health: 10, speed: 1.4, hostile: false, sound: 'pig',
    parts: [
      { size: [10, 8, 16], pivot: [0, 10, 0], off: [0, 0, 0], layers: L6(TEX.pig_skin), tile: true },
      { size: [8, 8, 8], pivot: [0, 12, 10], off: [0, 0, 2], layers: [TEX.pig_skin, TEX.pig_skin, TEX.pig_skin, TEX.pig_skin, TEX.pig_face, TEX.pig_skin], head: true },
      { size: [4, 6, 4], pivot: [-3, 6, 5], off: [0, -3, 0], layers: L6(TEX.pig_skin), tile: true, leg: 0 },
      { size: [4, 6, 4], pivot: [3, 6, 5], off: [0, -3, 0], layers: L6(TEX.pig_skin), tile: true, leg: 1 },
      { size: [4, 6, 4], pivot: [-3, 6, -5], off: [0, -3, 0], layers: L6(TEX.pig_skin), tile: true, leg: 1 },
      { size: [4, 6, 4], pivot: [3, 6, -5], off: [0, -3, 0], layers: L6(TEX.pig_skin), tile: true, leg: 0 },
    ],
    drops: () => [[I.PORK_RAW, 1 + (rand() * 2 | 0)]],
  },
  sheep: {
    hw: 0.45, h: 1.3, health: 8, speed: 1.3, hostile: false, sound: 'sheep',
    parts: [
      { size: [10, 10, 16], pivot: [0, 17, 0], off: [0, 0, 0], layers: L6(TEX.sheep_wool), tile: true },
      { size: [7, 7, 8], pivot: [0, 20, 8], off: [0, 0, 3], layers: [TEX.sheep_wool, TEX.sheep_wool, TEX.sheep_wool, TEX.sheep_skin, TEX.sheep_face, TEX.sheep_wool], head: true },
      { size: [4, 12, 4], pivot: [-3, 12, 5], off: [0, -6, 0], layers: L6(TEX.sheep_skin), tile: true, leg: 0 },
      { size: [4, 12, 4], pivot: [3, 12, 5], off: [0, -6, 0], layers: L6(TEX.sheep_skin), tile: true, leg: 1 },
      { size: [4, 12, 4], pivot: [-3, 12, -5], off: [0, -6, 0], layers: L6(TEX.sheep_skin), tile: true, leg: 1 },
      { size: [4, 12, 4], pivot: [3, 12, -5], off: [0, -6, 0], layers: L6(TEX.sheep_skin), tile: true, leg: 0 },
    ],
    drops: () => [[B.WOOL_WHITE, 1], [I.MUTTON_RAW, 1 + (rand() * 2 | 0)]],
  },
  zombie: {
    hw: 0.3, h: 1.95, health: 20, speed: 2.4, hostile: true, sound: 'zombie',
    parts: [
      { size: [8, 12, 4], pivot: [0, 18, 0], off: [0, 0, 0], layers: L6(TEX.zombie_shirt), tile: true },
      { size: [8, 8, 8], pivot: [0, 24, 0], off: [0, 4, 0], layers: [TEX.zombie_skin, TEX.zombie_skin, TEX.zombie_hair, TEX.zombie_skin, TEX.zombie_face, TEX.zombie_skin], head: true },
      { size: [4, 12, 4], pivot: [-6, 22, 0], off: [0, -4, 0], layers: L6(TEX.zombie_skin), tile: true, arm: 0 },
      { size: [4, 12, 4], pivot: [6, 22, 0], off: [0, -4, 0], layers: L6(TEX.zombie_skin), tile: true, arm: 1 },
      { size: [4, 12, 4], pivot: [-2, 12, 0], off: [0, -6, 0], layers: L6(TEX.zombie_pants), tile: true, leg: 0 },
      { size: [4, 12, 4], pivot: [2, 12, 0], off: [0, -6, 0], layers: L6(TEX.zombie_pants), tile: true, leg: 1 },
    ],
    drops: () => (rand() < 0.08 ? [[I.IRON_INGOT, 1]] : rand() < 0.35 ? [[I.COAL, 1]] : []),
  },
};
const Mobs = {
  list: [],
  spawnTimer: 0,
  spawn(type, x, y, z) {
    const T = MOB_TYPES[type];
    this.list.push({ type, T, x, y, z, vx: 0, vy: 0, vz: 0, hw: T.hw, h: T.h, yaw: rand() * 6.28, headYaw: 0, headPitch: 0, health: T.health, hurt: 0, dead: false, deathT: 0, walk: 0, walkAmt: 0, ai: 0, moving: false, targetYaw: 0, panic: 0, cd: 0, soundT: 3 + rand() * 10, burn: 0, onGround: false });
  },
  hurt(m, dmg, kx, kz) {
    if (m.dead || m.hurt > 0.3) return;
    m.health -= dmg;
    m.hurt = 0.5;
    const kl = Math.hypot(kx, kz) || 1;
    m.vx += (kx / kl) * 6; m.vz += (kz / kl) * 6; m.vy = 5;
    Sfx.play('hit', null, 0.8);
    if (!m.T.hostile) m.panic = 4;
    if (m.health <= 0) {
      m.dead = true; m.deathT = 0;
      Sfx.play(m.T.sound, null, 0.6);
      if (G.mode === 'survival') for (const [id, n] of m.T.drops()) Drops.spawn(id, n, m.x, m.y + 0.5, m.z);
    }
  },
  update(dt, daylight) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const m = L[i];
      const dxp = P.x - m.x, dzp = P.z - m.z, distP = Math.hypot(dxp, dzp);
      if (m.dead) {
        m.deathT += dt;
        if (m.deathT > 0.9) { Particles.puff(m.x, m.y + m.h * 0.5, m.z, [0.9, 0.9, 0.9, 0.8], 14, { spread: m.hw * 2, up: 1, life: 0.9, size: 0.18, grow: 0.15 }); L.splice(i, 1); }
        continue;
      }
      if (distP > (m.T.hostile ? 80 : 110)) { L.splice(i, 1); continue; }
      if (!world.isReady(Math.floor(m.x), Math.floor(m.z)) || !world.isReady(Math.floor(m.x + 2), Math.floor(m.z + 2)) || !world.isReady(Math.floor(m.x - 2), Math.floor(m.z - 2))) continue;
      m.hurt -= dt; m.cd -= dt; m.panic -= dt; m.soundT -= dt;
      const inW = boxHasBlock(m, B.WATER, 0, m.h * 0.7);
      const inLava = boxHasBlock(m, B.LAVA, 0, m.h * 0.7);
      let wantMove = 0, speed = m.T.speed;
      const chase = m.T.hostile && G.mode === 'survival' && G.state !== 'dead' && distP < 22 && Math.abs(P.y - m.y) < 10;
      if (chase) {
        m.targetYaw = Math.atan2(dxp, dzp);
        wantMove = distP > 0.9 ? 1 : 0;
        if (distP < 1.25 && Math.abs(P.y - m.y) < 1.6 && m.cd <= 0) {
          m.cd = 1.0;
          damagePlayer(3, 'Slain by a zombie', dxp / (distP || 1), dzp / (distP || 1));
        }
      } else if (m.panic > 0) {
        if ((m.ai -= dt) <= 0) { m.ai = 0.6 + rand(); m.targetYaw = Math.atan2(-dxp, -dzp) + (rand() - 0.5) * 1.5; }
        wantMove = 1; speed *= 1.9;
      } else {
        if ((m.ai -= dt) <= 0) {
          if (m.moving || rand() < 0.45) { m.moving = false; m.ai = 2 + rand() * 4; }
          else { m.moving = true; m.ai = 1.5 + rand() * 3; m.targetYaw = rand() * Math.PI * 2; }
        }
        wantMove = m.moving ? 1 : 0;
      }
      let dy = m.targetYaw - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, dt * 6);
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      // Avoid cliffs and liquids (passive mobs)
      if (wantMove && !m.T.hostile && m.onGround) {
        const ax = Math.floor(m.x + fx * 0.9), az = Math.floor(m.z + fz * 0.9), ay = Math.floor(m.y);
        const ahead = world.getBlock(ax, ay - 1, az);
        if ((!solidAt(ax, ay - 1, az) && !solidAt(ax, ay - 2, az)) || ahead === B.WATER || ahead === B.LAVA) { m.targetYaw = m.yaw + Math.PI * (0.6 + rand() * 0.8); m.ai = 0.5; wantMove = 0; }
      }
      const tv = wantMove ? speed : 0;
      const acc = 1 - Math.exp(-(m.onGround ? 10 : 2) * dt);
      m.vx += (fx * tv - m.vx) * acc;
      m.vz += (fz * tv - m.vz) * acc;
      if (inW || inLava) {
        m.vy -= 8 * dt; m.vy *= Math.exp(-3 * dt);
        if (boxHasBlock(m, inW ? B.WATER : B.LAVA, m.h * 0.4, m.h * 0.75)) m.vy = Math.min(m.vy + 22 * dt, 2.2);
      } else { m.vy -= 30 * dt; m.vy = Math.max(m.vy, -50); }
      // Hop up blocks
      if (wantMove && m.onGround && (m.hitX || m.hitZ)) m.vy = 8.4;
      // Push away from player
      if (distP < m.hw + P.hw && Math.abs(P.y - m.y) < 1.8) { m.vx -= dxp * 4 * dt; m.vz -= dzp * 4 * dt; }
      const prevY = m.y;
      moveEntity(m, m.vx * dt, m.vy * dt, m.vz * dt);
      if (m.onGround && prevY - m.y > 4) this.hurt(m, Math.floor(prevY - m.y - 3), 0, 0.01);
      m.walk += Math.hypot(m.vx, m.vz) * dt * 3.2;
      m.walkAmt += ((Math.hypot(m.vx, m.vz) > 0.3 ? 1 : 0) - m.walkAmt) * Math.min(1, dt * 8);
      // Head look
      const look = distP < 8 && !chase ? Math.atan2(dxp, dzp) - m.yaw : 0;
      let hy = look; while (hy > Math.PI) hy -= Math.PI * 2; while (hy < -Math.PI) hy += Math.PI * 2;
      hy = Math.max(-0.9, Math.min(0.9, hy));
      m.headYaw += (hy - m.headYaw) * Math.min(1, dt * 5);
      // Daylight burning
      if (m.T.hostile) {
        const l = world.getLight(Math.floor(m.x), Math.floor(m.y + 1.6), Math.floor(m.z));
        if (daylight > 0.6 && l[0] >= 14 && !inW) {
          if (rand() < dt * 18) Particles.puff(m.x + (rand() - 0.5) * 0.5, m.y + rand() * 1.8, m.z + (rand() - 0.5) * 0.5, [3, 1.1, 0.15, 0.95], 1, { up: 1.4, life: 0.5, size: 0.11 });
          m.burn += dt;
          if (m.burn > 1) { m.burn = 0; this.hurt(m, 2, 0, 0.001); }
        }
      }
      if (inLava) this.hurt(m, 4, 0, 0.01);
      if (m.soundT <= 0) {
        m.soundT = 6 + rand() * 12;
        const v = Math.max(0, 1 - distP / 24);
        if (v > 0) Sfx.play(m.T.sound, null, v);
      }
      if (m.y < -20) L.splice(i, 1);
    }
  },
  trySpawn(daylight) {
    const night = daylight < 0.3;
    let passive = 0, hostile = 0;
    for (const m of this.list) { if (m.T.hostile) hostile++; else passive++; }
    const R = Math.min(settings.dist, 6) * 16;
    const pick = (rmin, rmax) => { const a = rand() * Math.PI * 2, r = rmin + rand() * (rmax - rmin); return [Math.floor(P.x + Math.cos(a) * r), Math.floor(P.z + Math.sin(a) * r)]; };
    if (passive < 10 && rand() < 0.5) {
      const [x, z] = pick(20, Math.min(48, R));
      if (world.isMeshed(x, z)) {
        const y = world.topSolid(x, z);
        if (world.getBlock(x, y, z) === B.GRASS && world.getBlock(x, y + 1, z) === B.AIR) {
          const type = rand() < 0.5 ? 'pig' : 'sheep';
          const n = 1 + (rand() * 3 | 0);
          for (let i = 0; i < n; i++) {
            const ox = x + (rand() * 3 | 0) - 1, oz = z + (rand() * 3 | 0) - 1;
            const oy = world.topSolid(ox, oz);
            if (world.getBlock(ox, oy, oz) === B.GRASS && !solidAt(ox, oy + 1, oz)) this.spawn(type, ox + 0.5, oy + 1, oz + 0.5);
          }
        }
      }
    }
    if (hostile < (night ? 8 : 3) && rand() < 0.5) {
      if (night && rand() < 0.7) {
        const [x, z] = pick(22, Math.min(44, R));
        if (world.isMeshed(x, z)) {
          const y = world.topSolid(x, z);
          const b = world.getBlock(x, y, z);
          const l = world.getLight(x, y + 1, z);
          if (b > 0 && T_OPAQUE[b] && !solidAt(x, y + 1, z) && !solidAt(x, y + 2, z) && l[1] < 7) this.spawn('zombie', x + 0.5, y + 1, z + 0.5);
        }
      } else {
        // dark caves
        const [x, z] = pick(14, 34);
        if (world.isMeshed(x, z)) {
          const top = world.topSolid(x, z);
          for (let tries = 0; tries < 6; tries++) {
            const y = 6 + (rand() * Math.max(1, top - 12) | 0);
            if (!solidAt(x, y, z) && !solidAt(x, y + 1, z) && solidAt(x, y - 1, z) && world.getBlock(x, y, z) === B.AIR) {
              const l = world.getLight(x, y, z);
              if (l[0] < 3 && l[1] < 5) { this.spawn('zombie', x + 0.5, y, z + 0.5); break; }
            }
          }
        }
      }
    }
  },
};
