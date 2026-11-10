'use strict';
/* ============================================================
 * EMBER BRIGADE - level builder and the ten missions
 *
 * Tile codes: 0 empty, 1 solid, 2 one-way platform, 3 liquid (pit hazard),
 *             4 spikes, 5 belt ->, 6 belt <-, 7 dark pit back-wall (non-solid)
 * ============================================================ */

const solidT = (t) => t === 1 || t === 5 || t === 6;

class Level {
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.w = cols * TILE; this.h = rows * TILE;
    this.tiles = new Uint8Array(cols * rows);
    this.spawns = []; this.objs = []; this.decos = []; this.locks = []; this.signs = [];
  }
  get(tx, ty) {
    if (tx < 0 || tx >= this.cols) return 1;
    if (ty < 0 || ty >= this.rows) return 0;
    return this.tiles[ty * this.cols + tx];
  }
  set(tx, ty, t) { if (tx >= 0 && tx < this.cols && ty >= 0 && ty < this.rows) this.tiles[ty * this.cols + tx] = t; }
  solid(tx, ty) { return solidT(this.get(tx, ty)); }
  // first standable surface at/below py for world x; returns pixel y or null
  groundBelow(px, py) {
    const tx = Math.floor(px / TILE);
    for (let ty = Math.max(0, Math.floor(py / TILE)); ty < this.rows; ty++) {
      const t = this.get(tx, ty);
      if (solidT(t) || t === 2) return ty * TILE;
    }
    return null;
  }
}

/* ---------- builder ---------- */
class LB {
  constructor(rows = 12, gh = 2) {
    this.rows = rows; this.gh = gh;
    this.colTop = []; this.colPit = [];
    this.extra = []; this.items = [];
    this.x = 0;
  }
  get row() { return this.rows - this.gh; }
  // n ground columns at the current height, with items placed relative to the segment start
  g(n, ...items) {
    const x0 = this.x;
    for (let i = 0; i < n; i++) { this.colTop.push(this.row); this.colPit.push(null); }
    this.x += n;
    for (const it of items) this.place(it, x0);
    return this;
  }
  rise(k = 1) { this.gh += k; return this; }
  drop(k = 1) { this.gh = Math.max(1, this.gh - k); return this; }
  // n columns of pit; kind (any string) fills it with the theme's liquid
  pit(n, kind, ...items) {
    const x0 = this.x;
    for (let i = 0; i < n; i++) { this.colTop.push(-1); this.colPit.push({ kind, row: this.row }); }
    this.x += n;
    for (const it of items) this.place(it, x0);
    return this;
  }
  place(it, x0) {
    const [kind, dx, a, b] = it;
    const tx = x0 + dx, row = this.row;
    if (kind === 'plat') { for (let i = 0; i < b; i++) this.extra.push([tx + i, row - a, 2]); }
    else if (kind === 'block') { for (let i = 0; i < a; i++) for (let j = 0; j < b; j++) this.extra.push([tx + i, row - 1 - j, 1]); }
    else if (kind === 'spikes') { for (let i = 0; i < a; i++) this.extra.push([tx + i, row - 1, 4]); }
    else if (kind === 'belt') { for (let i = 0; i < a; i++) this.extra.push([tx + i, row, b > 0 ? 5 : 6]); }
    else this.items.push({ kind, tx, row, a, b });
  }
  build(meta) {
    const L = new Level(this.x, this.rows);
    Object.assign(L, meta);
    const open = !!THEMES[meta.theme].open || meta.open;
    for (let c = 0; c < this.x; c++) {
      const top = this.colTop[c];
      if (top >= 0) { for (let r = top; r < this.rows; r++) L.set(c, r, 1); }
      else {
        const p = this.colPit[c];
        if (p.kind) { if (!open) L.set(c, p.row, 7); for (let r = p.row + 1; r < this.rows; r++) L.set(c, r, 3); }
        else if (!open) { for (let r = p.row; r < this.rows; r++) L.set(c, r, 7); }
      }
    }
    for (const [tx, ty, t] of this.extra) L.set(tx, ty, t);
    for (const it of this.items) {
      const o = (it.a && typeof it.a === 'object' && !Array.isArray(it.a)) ? it.a : {};
      const x = it.tx * TILE + 8;
      const y = (it.row - (o.on || 0)) * TILE;
      const k = it.kind;
      if (k === 'lock') L.locks.push({ cx: x, waves: it.a, state: 0 });
      else if (k === 'sign') { L.signs.push({ x, key: it.a, done: false }); L.decos.push({ name: 'sign', x, y }); }
      else if (k.startsWith('d:')) L.decos.push({ name: k.slice(2), x, y });
      else if (OBJ_KINDS[k]) L.objs.push({ kind: k, x, y, o });
      else L.spawns.push({ type: k, x, y, o, done: false });
    }
    L.spawns.sort((p, q) => p.x - q.x);
    L.locks.sort((p, q) => p.cx - q.cx);
    return L;
  }
}
const OBJ_KINDS = { crate: 1, barrel: 1, cage: 1, coin: 1, gem: 1, star: 1, stal: 1, crusher: 1, flame: 1, laser: 1, mplat: 1 };

const HINTS = {
  move: ['ARROWS OR WASD TO MOVE', 'LEFT THUMB: MOVE'],
  fire: ['HOLD Z OR J TO FIRE', 'HOLD FIRE TO SHOOT'],
  jump: ['X OR SPACE TO JUMP', 'TAP JUMP TO LEAP'],
  bomb: ['C OR L THROWS A BOMB', 'BOMB BUTTON LOBS A BOMB'],
  aim: ['HOLD UP TO AIM HIGH', 'PUSH UP TO AIM HIGH'],
  duck: ['HOLD DOWN TO DUCK SHOTS', 'PULL DOWN TO DUCK SHOTS'],
  pip: ['FREE CAGED PIPS FOR SUPPLIES', 'FREE CAGED PIPS FOR SUPPLIES'],
};

/* ---------- the ten missions ---------- */
const LEVELS = [
  {
    name: 'DUSTLINE OUTPOST', sub: 'BREAK THE LEGION PICKET', theme: 'desert', boss: 'hauler',
    make() {
      const L = new LB(12, 2);
      L.g(16, ['d:tent', 2], ['d:flag', 8], ['sign', 5, 'move'], ['d:cactus', 13]);
      L.g(14, ['sign', 2, 'fire'], ['grunt', 9], ['d:rock', 5], ['grunt', 13]);
      L.g(12, ['crate', 3, { drop: 'w1' }], ['grunt', 8], ['grunt', 11], ['d:sandbags', 6]);
      L.rise(1).g(10, ['sign', 1, 'jump'], ['rifle', 6], ['sign', 8, 'duck'], ['d:cactus', 3]);
      L.rise(1).g(9, ['sign', 2, 'pip'], ['cage', 5, { drop: 'gren' }], ['grunt', 7]);
      L.drop(2).g(6, ['sign', 1, 'bomb'], ['d:rock', 3]);
      L.pit(3);
      L.g(14, ['plat', 3, 3, 4], ['crate', 5, { on: 3, drop: 'gem' }], ['grunt', 8], ['grunt', 10], ['lobber', 12]);
      L.g(22, ['lock', 11, [
        [['grunt', 'r', 0], ['grunt', 'r', 40], ['grunt', 'l', 80]],
        [['rifle', 'r', 0], ['grunt', 'r', 30], ['grunt', 't', 60], ['grunt', 'l', 90]],
      ]], ['d:sandbags', 4], ['d:flag', 16]);
      L.g(12, ['sign', 1, 'aim'], ['drone', 8, { h: 60 }], ['drone', 11, { h: 75 }]);
      L.rise(1).g(10, ['turret', 7], ['block', 3, 2, 1], ['crate', 1, { drop: 'hp' }]);
      L.g(8, ['grunt', 3], ['rifle', 6]);
      L.drop(1).pit(2).g(12, ['barrel', 6], ['grunt', 7], ['grunt', 8], ['lobber', 10], ['d:cactus', 2]);
      L.g(14, ['plat', 2, 3, 3], ['plat', 7, 5, 3], ['crate', 8, { on: 5, drop: 'w2' }], ['grunt', 10], ['rifle', 12]);
      L.g(18, ['cage', 3, { drop: 'hp' }], ['d:tent', 8], ['grunt', 14], ['grunt', 16]);
      L.g(27, ['d:flag', 2]);
      return L;
    },
  },
  {
    name: 'MANGROVE MIRE', sub: 'WADE THROUGH THE SPRINGER NESTS', theme: 'swamp', boss: 'strider',
    make() {
      const L = new LB(12, 2);
      L.g(14, ['d:reeds', 3], ['d:stump', 9], ['hopper', 12]);
      L.g(10, ['hopper', 4], ['grunt', 8], ['d:shroom', 6]);
      L.pit(3, 'water').g(6, ['crate', 2, { drop: 'w1' }]).pit(3, 'water');
      L.g(14, ['grunt', 4], ['rifle', 9], ['drone', 7, { h: 70 }], ['d:reeds', 12]);
      L.rise(1).g(8, ['hopper', 3], ['hopper', 6]);
      L.rise(1).g(8, ['cage', 3, { drop: 'w2' }], ['lobber', 6]);
      L.drop(2).pit(9, 'water', ['plat', 1, 0, 2], ['plat', 5, 1, 2], ['drone', 4, { h: 80 }]);
      L.g(22, ['lock', 11, [
        [['hopper', 'r', 0], ['hopper', 'l', 30], ['grunt', 'r', 60]],
        [['drone', 't', 0], ['drone', 't', 40], ['hopper', 'r', 60], ['rifle', 'r', 90]],
      ]], ['d:stump', 5], ['d:reeds', 16]);
      L.g(10, ['turret', 6], ['crate', 2, { drop: 'hp' }]);
      L.rise(1).g(6, ['grunt', 3]).rise(1).g(6, ['rifle', 3]).rise(1).g(8, ['lobber', 4], ['cage', 6, { drop: 'gren' }]);
      L.drop(1).g(5).drop(1).g(5, ['hopper', 2]).drop(1).pit(4, 'water', ['plat', 1, 0, 2]);
      L.g(16, ['plat', 3, 3, 4], ['plat', 9, 3, 4], ['crate', 4, { on: 3, drop: 'gem' }], ['hopper', 6], ['hopper', 10], ['drone', 12, { h: 70 }], ['grunt', 14]);
      L.pit(3, 'water').g(12, ['shield', 6], ['grunt', 9], ['barrel', 4], ['d:shroom', 1]);
      L.g(14, ['crate', 3, { drop: 'w1' }], ['hopper', 8], ['drone', 10, { h: 60 }], ['rifle', 12]);
      L.g(27, ['d:reeds', 2]);
      return L;
    },
  },
  {
    name: 'RIVET HARBOR', sub: 'SEIZE THE SUPPLY DOCKS', theme: 'harbor', boss: 'gunboat',
    make() {
      const L = new LB(12, 2);
      L.g(14, ['d:bollard', 3], ['d:lamp', 8], ['grunt', 11], ['grunt', 13]);
      L.g(12, ['block', 4, 3, 2], ['rifle', 5, { on: 2 }], ['shield', 9]);
      L.g(12, ['crate', 2, { drop: 'w2' }], ['roller', 9], ['roller', 11], ['d:container', 5]);
      L.pit(6, 'water', ['mplat', 1, { ax: 48, w: 2 }]);
      L.g(14, ['turret', 5], ['block', 8, 2, 2], ['block', 10, 2, 3], ['grunt', 9, { on: 2 }], ['lobber', 11, { on: 3 }]);
      L.g(22, ['lock', 11, [
        [['shield', 'r', 0], ['grunt', 'r', 50], ['grunt', 'l', 80]],
        [['roller', 'r', 0], ['roller', 'l', 20], ['rifle', 'r', 50], ['drone', 't', 70]],
        [['shield', 'r', 0], ['shield', 'l', 30], ['lobber', 'r', 70]],
      ]], ['d:lamp', 3], ['d:bollard', 16]);
      L.g(10, ['cage', 3, { drop: 'hp' }], ['d:container', 6]);
      L.pit(5, 'water', ['mplat', 1, { ay: -48, w: 2 }]);
      L.rise(3).g(12, ['rifle', 4], ['turret', 8], ['crate', 10, { drop: 'gren' }]);
      L.drop(3).g(10, ['roller', 4], ['shield', 7], ['d:bollard', 2]);
      L.g(14, ['block', 3, 2, 1], ['block', 5, 2, 2], ['block', 7, 2, 3], ['turret', 8, { on: 3 }], ['crate', 5, { on: 2, drop: 'w4' }], ['grunt', 11], ['grunt', 12]);
      L.pit(3, 'water').g(8, ['drone', 3, { h: 60 }], ['drone', 6, { h: 80 }], ['rifle', 5]).pit(3, 'water');
      L.g(16, ['shield', 5], ['lobber', 9], ['cage', 12, { drop: 'hp' }], ['barrel', 7], ['d:lamp', 14]);
      L.g(21, ['d:bollard', 4]).pit(6, 'water');
      return L;
    },
  },
  {
    name: 'FREIGHT RUN', sub: 'BOARD THE ARMOURED EXPRESS', theme: 'train', boss: 'gunship',
    make() {
      const L = new LB(12, 2);
      L.g(18, ['d:signal', 3], ['grunt', 12], ['grunt', 15]).pit(2);
      L.rise(2).g(14, ['rifle', 6], ['jetter', 10, { h: 60 }], ['d:cratestack', 2]).pit(2);
      L.g(14, ['crate', 3, { drop: 'w1' }], ['grunt', 8], ['lobber', 11]).pit(2);
      L.drop(2).g(16, ['block', 5, 4, 1], ['shield', 9], ['drone', 7, { h: 70 }], ['drone', 12, { h: 60 }]).pit(2);
      L.g(22, ['lock', 11, [
        [['jetter', 'r', 0, { h: 70 }], ['jetter', 'l', 40, { h: 60 }], ['grunt', 't', 60]],
        [['drone', 't', 0], ['drone', 't', 30], ['jetter', 'r', 50, { h: 50 }], ['rifle', 't', 80]],
        [['jetter', 'r', 0, { h: 70 }], ['jetter', 'r', 30, { h: 50 }], ['shield', 't', 60]],
      ]]).pit(2);
      L.rise(1).g(12, ['turret', 6], ['cage', 9, { drop: 'hp' }]).pit(2);
      L.rise(1).g(12, ['lobber', 5], ['rifle', 8], ['roller', 10]).pit(3);
      L.drop(2).g(14, ['plat', 3, 3, 3], ['plat', 8, 3, 3], ['crate', 9, { on: 3, drop: 'w5' }], ['buzzer', 10], ['grunt', 12]).pit(2);
      L.g(16, ['jetter', 5, { h: 70 }], ['jetter', 9, { h: 50 }], ['shield', 11], ['barrel', 7], ['d:cratestack', 1]).pit(2);
      L.rise(2).g(12, ['turret', 4], ['lobber', 8], ['crate', 10, { drop: 'gren' }]).pit(2);
      L.drop(2).g(12, ['cage', 3, { drop: 'hp' }], ['grunt', 7], ['rifle', 10]).pit(2);
      L.g(27);
      return L;
    },
  },
  {
    name: 'GLOWROOT CAVERNS', sub: 'DESCEND TO THE CRYSTAL VEIN', theme: 'cavern', boss: 'borer',
    make() {
      const L = new LB(14, 5);
      L.g(14, ['d:crystal', 4], ['flit', 10, { h: 50 }], ['flit', 13, { h: 60 }]);
      L.drop(1).g(8, ['stal', 3], ['stal', 6], ['grunt', 5]);
      L.drop(1).g(10, ['roller', 6], ['roller', 8], ['crate', 2, { drop: 'w1' }], ['d:stalag', 4]);
      L.drop(1).g(12, ['mortar', 9], ['grunt', 5], ['stal', 4], ['flit', 7, { h: 60 }]);
      L.pit(3).g(6, ['cage', 3, { drop: 'w3' }]).pit(3);
      L.g(22, ['lock', 11, [
        [['flit', 't', 0], ['flit', 't', 20], ['flit', 't', 40], ['grunt', 'r', 30]],
        [['roller', 'r', 0], ['roller', 'l', 40], ['hopper', 'r', 60], ['flit', 't', 80]],
        [['mortar', 0.85, 0], ['shield', 'r', 40], ['flit', 't', 60], ['flit', 't', 90]],
      ]], ['d:crystal', 3], ['d:crystal', 17]);
      L.g(10, ['grunt', 4], ['rifle', 7], ['stal', 5], ['d:stalag', 1]);
      L.rise(1).g(8, ['stal', 2], ['stal', 4], ['stal', 6], ['hopper', 5]);
      L.rise(1).g(10, ['turret', 6], ['rifle', 8], ['crate', 3, { drop: 'hp' }]);
      L.rise(1).g(12, ['plat', 2, 3, 3], ['plat', 7, 4, 3], ['crate', 8, { on: 4, drop: 'gem' }], ['buzzer', 9], ['flit', 5, { h: 80 }], ['flit', 10, { h: 70 }]);
      L.drop(2).pit(4, null, ['plat', 1, 1, 2]).g(12, ['stal', 2], ['stal', 5], ['stal', 8], ['lobber', 7], ['roller', 10]);
      L.drop(1).g(14, ['mortar', 10], ['shield', 6], ['cage', 3, { drop: 'hp' }], ['d:crystal', 12]);
      L.g(12, ['flit', 3, { h: 60 }], ['flit', 6, { h: 70 }], ['flit', 9, { h: 50 }], ['barrel', 5], ['crate', 10, { drop: 'w2' }]);
      L.g(27, ['d:crystal', 2]);
      return L;
    },
  },
  {
    name: 'FROSTPEAK RELAY', sub: 'CLIMB TO THE SIGNAL TOWER', theme: 'frost', boss: 'colossus',
    make() {
      const L = new LB(26, 2);
      L.g(14, ['d:pine', 3], ['d:pine', 10], ['grunt', 12]);
      L.rise(1).g(6, ['grunt', 3]).rise(1).g(6, ['rifle', 4]).rise(1).g(10, ['sniper', 8], ['d:icerock', 3], ['crate', 5, { drop: 'w1' }]);
      L.pit(3).g(10, ['buzzer', 7], ['d:pine', 2]);
      L.rise(2).g(8, ['cage', 4, { drop: 'hp' }], ['hopper', 6]);
      L.rise(1).g(6, ['hopper', 3]).rise(1).g(12, ['jetter', 6, { h: 60 }], ['jetter', 10, { h: 70 }], ['sniper', 10]);
      L.g(22, ['lock', 11, [
        [['buzzer', 'r', 0], ['grunt', 'l', 40], ['sniper', 0.9, 0]],
        [['jetter', 'r', 0, { h: 60 }], ['hopper', 'r', 30], ['hopper', 'l', 50], ['rifle', 'r', 80]],
        [['brute', 'r', 0], ['grunt', 'l', 60]],
      ]], ['d:pine', 2], ['d:pine', 18]);
      L.rise(1).g(8, ['turret', 5], ['crate', 2, { drop: 'w4' }]);
      L.pit(4, null, ['plat', 1, 2, 2]).rise(2).g(10, ['lobber', 5], ['sniper', 8], ['d:icerock', 2]);
      L.rise(1).g(6, ['buzzer', 4]).rise(1).g(6).rise(1).g(10, ['shield', 5], ['jetter', 7, { h: 70 }], ['cage', 8, { drop: 'gren' }]);
      L.pit(3).g(12, ['plat', 3, 3, 3], ['crate', 4, { on: 3, drop: 'gem' }], ['brute', 9]);
      L.rise(1).g(10, ['sniper', 7], ['hopper', 4], ['d:pine', 1]);
      L.g(27, ['d:pine', 3]);
      return L;
    },
  },
  {
    name: 'FOUNDRY NINE', sub: 'SHUT DOWN THE WAR FORGES', theme: 'foundry', boss: 'smelter',
    make() {
      const L = new LB(12, 2);
      L.g(14, ['d:vent', 3], ['d:gauge', 9], ['grunt', 11], ['shield', 13]);
      L.g(12, ['belt', 2, 8, 1], ['buzzer', 10], ['d:drum', 0]);
      L.pit(3, 'lava').g(8, ['flame', 2], ['flame', 5], ['rifle', 6]).pit(3, 'lava');
      L.g(14, ['crusher', 4], ['crusher', 8], ['crate', 11, { drop: 'w3' }], ['grunt', 12]);
      L.rise(1).g(10, ['belt', 1, 8, -1], ['lobber', 7], ['turret', 9]);
      L.pit(6, 'lava', ['mplat', 1, { ax: 48, w: 2 }]);
      L.g(22, ['lock', 11, [
        [['buzzer', 'r', 0], ['buzzer', 'l', 50], ['grunt', 't', 30]],
        [['shield', 'r', 0], ['shield', 'l', 20], ['lobber', 't', 60], ['drone', 't', 80]],
        [['brute', 'r', 0], ['roller', 'l', 40], ['roller', 'l', 70]],
      ]], ['d:vent', 2], ['d:vent', 18]);
      L.g(12, ['flame', 3], ['flame', 6], ['flame', 9], ['cage', 11, { drop: 'hp' }]);
      L.rise(1).g(8, ['crusher', 3], ['crusher', 6]).rise(1).g(8, ['brute', 5], ['d:gauge', 1]);
      L.drop(2).pit(4, 'lava', ['plat', 1, 1, 2]).g(12, ['belt', 1, 10, 1], ['roller', 8], ['roller', 10], ['turret', 11]);
      L.pit(3, 'lava').g(14, ['plat', 2, 3, 3], ['plat', 8, 3, 3], ['crate', 3, { on: 3, drop: 'w2' }], ['crate', 9, { on: 3, drop: 'gren' }], ['shield', 6], ['lobber', 11], ['flame', 5]);
      L.g(12, ['crusher', 3], ['flame', 6], ['crusher', 9], ['buzzer', 10]);
      L.g(10, ['cage', 3, { drop: 'hp' }], ['brute', 7]);
      L.g(27, ['d:vent', 1]);
      return L;
    },
  },
  {
    name: 'SKYLINE SIEGE', sub: 'CROSS THE OCCUPIED ROOFTOPS', theme: 'city', boss: 'skitter',
    make() {
      const L = new LB(20, 6);
      L.g(14, ['d:acunit', 3], ['d:antenna', 9], ['grunt', 11], ['rifle', 13]);
      L.pit(2).rise(2).g(10, ['sniper', 7], ['d:billboard', 1]);
      L.pit(3).drop(3).g(12, ['roller', 6], ['roller', 9], ['crate', 3, { drop: 'w1' }]);
      L.pit(2).rise(1).g(10, ['jetter', 5, { h: 60 }], ['jetter', 8, { h: 80 }], ['d:acunit', 2]);
      L.pit(5, null, ['mplat', 1, { ax: 32, w: 2 }]).rise(1).g(12, ['shield', 5], ['lobber', 8], ['cage', 10, { drop: 'hp' }]);
      L.pit(3).g(24, ['lock', 12, [
        [['jetter', 'r', 0, { h: 70 }], ['jetter', 'l', 30, { h: 50 }], ['grunt', 't', 50], ['grunt', 't', 70]],
        [['tank', 'r', 0]],
      ]], ['d:antenna', 2], ['d:billboard', 16]);
      L.pit(2).rise(2).g(10, ['sniper', 6], ['turret', 8], ['crate', 2, { drop: 'w4' }]);
      L.pit(3).drop(4).g(12, ['brute', 8], ['plat', 2, 3, 3], ['d:acunit', 9]);
      L.pit(2).rise(2).g(8, ['buzzer', 5]).pit(2).rise(2).g(8, ['rifle', 3], ['sniper', 6]);
      L.pit(5, null, ['plat', 1, 0, 1], ['plat', 3, 1, 1]).rise(1).g(12, ['jetter', 4, { h: 60 }], ['jetter', 8, { h: 70 }], ['cage', 6, { drop: 'gren' }], ['d:antenna', 10]);
      L.pit(3).drop(3).g(14, ['shield', 5], ['shield', 8], ['lobber', 11], ['barrel', 6], ['crate', 2, { drop: 'w5' }]);
      L.pit(3).g(12, ['brute', 6], ['sniper', 10], ['d:billboard', 0]);
      L.pit(2).g(27, ['d:antenna', 3]);
      return L;
    },
  },
  {
    name: 'STRATOS CARRIER', sub: 'STORM THE FLYING FORTRESS', theme: 'carrier', boss: 'tempest',
    make() {
      const L = new LB(16, 4);
      L.g(14, ['d:radar', 3], ['d:railing', 8], ['grunt', 10, { drop: true }], ['grunt', 12, { drop: true }]);
      L.g(12, ['turret', 5], ['turret', 9], ['crate', 2, { drop: 'w1' }]);
      L.pit(5, null, ['mplat', 1, { ax: 32, w: 2 }]);
      L.rise(1).g(12, ['shield', 5], ['jetter', 7, { h: 70 }], ['lobber', 9]);
      L.rise(1).g(10, ['sniper', 7], ['buzzer', 4], ['d:railing', 1]);
      L.pit(5, null, ['mplat', 1, { ax: 32, w: 2 }]).drop(1);
      L.g(24, ['lock', 12, [
        [['grunt', 't', 0], ['grunt', 't', 20], ['rifle', 't', 40], ['jetter', 'r', 60, { h: 60 }]],
        [['drone', 't', 0], ['drone', 't', 20], ['shield', 'r', 30], ['shield', 'l', 50], ['sniper', 0.9, 70]],
        [['brute', 'r', 0], ['jetter', 'l', 30, { h: 70 }], ['jetter', 'r', 60, { h: 50 }]],
      ]], ['d:radar', 2], ['d:railing', 16]);
      L.g(10, ['cage', 3, { drop: 'hp' }], ['crate', 6, { drop: 'w3' }]);
      L.rise(2).g(10, ['turret', 3], ['mortar', 7]);
      L.pit(2).g(10, ['brute', 6], ['flame', 3]);
      L.drop(2).pit(6, null, ['mplat', 1, { ax: 48, w: 2 }], ['drone', 3, { h: 60 }]);
      L.g(14, ['plat', 2, 3, 3], ['plat', 8, 3, 3], ['turret', 9, { on: 3 }], ['crate', 3, { on: 3, drop: 'w4' }], ['roller', 6], ['roller', 11], ['shield', 12]);
      L.rise(1).g(8, ['sniper', 5]).rise(1).g(8, ['lobber', 3], ['jetter', 5, { h: 60 }]).rise(1).g(10, ['brute', 6], ['cage', 2, { drop: 'gren' }]);
      L.drop(3).pit(3).g(14, ['buzzer', 5], ['buzzer', 9], ['mortar', 12], ['crate', 2, { drop: 'hp' }]);
      L.g(27, ['plat', 11, 3, 3], ['plat', 16, 3, 3], ['d:railing', 1]);
      return L;
    },
  },
  {
    name: 'CORE CITADEL', sub: 'UNPLUG THE OVERSEER', theme: 'citadel', boss: 'overseer',
    make() {
      const L = new LB(14, 3);
      L.g(14, ['d:pillar', 3], ['d:monitor', 8], ['elite', 11], ['elite', 13]);
      L.g(12, ['laser', 4], ['laser', 8], ['shield', 10]);
      L.g(12, ['spikes', 3, 2], ['spikes', 8, 2], ['turret', 10], ['crate', 0, { drop: 'w1' }]);
      L.rise(1).g(10, ['sniper', 7], ['buzzer', 4]).rise(1).g(8, ['brute', 5]);
      L.pit(5, 'acid', ['mplat', 1, { ax: 32, w: 2 }]).drop(2);
      L.g(24, ['lock', 12, [
        [['elite', 'r', 0], ['elite', 'l', 30], ['jetter', 'r', 50, { h: 60 }], ['flit', 't', 70]],
        [['shield', 'r', 0], ['shield', 'l', 20], ['lobber', 't', 40], ['sniper', 0.88, 60]],
        [['tank', 'r', 0], ['drone', 't', 120], ['drone', 't', 150]],
      ]], ['d:pillar', 1], ['d:pillar', 20]);
      L.g(10, ['cage', 3, { drop: 'hp' }], ['crate', 6, { drop: 'w5' }], ['d:monitor', 8]);
      L.g(14, ['crusher', 3], ['laser', 6], ['crusher', 9], ['elite', 11], ['flame', 12]);
      L.rise(2).g(10, ['turret', 3], ['mortar', 7]).pit(2).g(8, ['brute', 4], ['jetter', 6, { h: 60 }]);
      L.drop(2).pit(4, 'acid', ['plat', 1, 1, 2]).g(14, ['spikes', 4, 2], ['plat', 2, 3, 3], ['plat', 8, 3, 3], ['crate', 9, { on: 3, drop: 'w4' }], ['roller', 10], ['roller', 12], ['elite', 11]);
      L.g(24, ['lock', 12, [
        [['buzzer', 'r', 0], ['buzzer', 'l', 30], ['elite', 't', 50], ['elite', 't', 70]],
        [['brute', 'r', 0], ['brute', 'l', 60], ['flit', 't', 30], ['flit', 't', 90]],
      ]], ['d:pillar', 2], ['d:pillar', 20]);
      L.g(12, ['cage', 2, { drop: 'hp' }], ['cage', 5, { drop: 'gren' }], ['crate', 8, { drop: 'w2' }], ['d:monitor', 10]);
      L.g(27, ['plat', 11, 3, 3], ['plat', 16, 3, 3], ['d:pillar', 1]);
      return L;
    },
  },
];
THEMES.train.open = true; THEMES.carrier.open = true; THEMES.city.open = true;

function buildLevel(i) {
  const def = LEVELS[i];
  const L = def.make().build({ name: def.name, sub: def.sub, theme: def.theme, boss: def.boss, index: i });
  buildTheme(def.theme);
  return L;
}
