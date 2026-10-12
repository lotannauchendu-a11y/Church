'use strict';
// ---------------------------------------------------------------------------
// Shared core: runs on the main thread AND inside the world workers.
// Block/item definitions, seeded noise, terrain generation, lighting, meshing.
// Must not touch the DOM.
// ---------------------------------------------------------------------------
const CS = 16;            // chunk width (x/z)
const CH = 128;           // world height
const SEA = 52;           // sea level
const CVOL = CS * CS * CH;

// ---- Texture layers --------------------------------------------------------
const TEX_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'sand', 'gravel', 'oak_log', 'oak_log_top', 'oak_leaves',
  'oak_planks', 'glass', 'water', 'bedrock', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'snow', 'ice',
  'cactus_side', 'cactus_top', 'birch_log', 'birch_log_top', 'birch_leaves', 'spruce_log', 'spruce_log_top', 'spruce_leaves', 'bricks', 'tall_grass',
  'dandelion', 'poppy', 'torch', 'glowstone', 'crafting_table_top', 'crafting_table_side', 'crafting_table_front', 'furnace_front', 'furnace_side', 'furnace_top',
  'wool_white', 'wool_red', 'wool_orange', 'wool_yellow', 'wool_lime', 'wool_blue', 'wool_purple', 'wool_black', 'stone_bricks', 'sandstone_top',
  'sandstone_side', 'bookshelf', 'mossy_cobblestone', 'lava', 'snowy_grass_side', 'dead_bush', 'spruce_planks', 'birch_planks', 'obsidian', 'blue_flower',
  'crack_0', 'crack_1', 'crack_2', 'crack_3', 'crack_4', 'crack_5', 'crack_6', 'crack_7', 'crack_8', 'crack_9',
  'stick', 'coal', 'iron_ingot', 'gold_ingot', 'diamond', 'apple', 'porkchop_raw', 'porkchop_cooked', 'mutton_raw', 'mutton_cooked',
  'wood_pickaxe', 'wood_axe', 'wood_shovel', 'wood_sword', 'stone_pickaxe', 'stone_axe', 'stone_shovel', 'stone_sword',
  'iron_pickaxe', 'iron_axe', 'iron_shovel', 'iron_sword', 'diamond_pickaxe', 'diamond_axe', 'diamond_shovel', 'diamond_sword',
  'pig_skin', 'pig_face', 'sheep_wool', 'sheep_face', 'sheep_skin', 'zombie_skin', 'zombie_face', 'zombie_shirt', 'zombie_pants', 'zombie_hair',
  'player_skin', 'white',
];
const TEX = {};
TEX_NAMES.forEach((n, i) => { TEX[n] = i; });

// ---- Blocks ----------------------------------------------------------------
const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, GRAVEL: 6, OAK_LOG: 7, OAK_LEAVES: 8, PLANKS: 9,
  GLASS: 10, WATER: 11, BEDROCK: 12, COAL_ORE: 13, IRON_ORE: 14, GOLD_ORE: 15, DIAMOND_ORE: 16, SNOW: 17, ICE: 18, CACTUS: 19,
  BIRCH_LOG: 20, BIRCH_LEAVES: 21, SPRUCE_LOG: 22, SPRUCE_LEAVES: 23, BRICKS: 24, TALL_GRASS: 25, DANDELION: 26, POPPY: 27, TORCH: 28, GLOWSTONE: 29,
  CRAFTING_TABLE: 30, FURNACE: 31, WOOL_WHITE: 32, WOOL_RED: 33, WOOL_ORANGE: 34, WOOL_YELLOW: 35, WOOL_LIME: 36, WOOL_BLUE: 37, WOOL_PURPLE: 38, WOOL_BLACK: 39,
  STONE_BRICKS: 40, SANDSTONE: 41, BOOKSHELF: 42, MOSSY_COBBLE: 43, LAVA: 44, SNOWY_GRASS: 45, DEAD_BUSH: 46, SPRUCE_PLANKS: 47, BIRCH_PLANKS: 48, OBSIDIAN: 49,
  CORNFLOWER: 50,
};
const BLOCKS = [];
const FACE_ALL = (t) => [t, t, t, t, t, t];
const FACE_SIDES = (side, top, bottom) => [side, side, top, bottom === undefined ? top : bottom, side, side];

function defBlock(id, name, p) {
  const d = Object.assign({
    id, name, tex: FACE_ALL('stone'), solid: true, opaque: true, model: 'cube', translucent: false,
    cullSame: false, atten: 0, emit: 0, hardness: 1, tool: null, tier: 0, drop: id, sound: 'stone',
    tint: 0, wave: 0, replaceable: false, target: true, liquid: false, glow: false, creative: true,
  }, p);
  d.texL = d.tex.map((n) => TEX[n]);
  BLOCKS[id] = d;
  return d;
}
const PLANT = { solid: false, opaque: false, model: 'cross', hardness: 0, sound: 'grass', replaceable: false, wave: 2 };
defBlock(B.AIR, 'Air', { solid: false, opaque: false, model: 'none', target: false, hardness: 0, drop: 0, creative: false });
defBlock(B.GRASS, 'Grass Block', { tex: FACE_SIDES('grass_side', 'grass_top', 'dirt'), hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'grass', tint: 1 });
defBlock(B.DIRT, 'Dirt', { tex: FACE_ALL('dirt'), hardness: 0.5, tool: 'shovel', sound: 'dirt' });
defBlock(B.STONE, 'Stone', { tex: FACE_ALL('stone'), hardness: 1.5, tool: 'pickaxe', tier: 1, drop: B.COBBLE });
defBlock(B.COBBLE, 'Cobblestone', { tex: FACE_ALL('cobblestone'), hardness: 2, tool: 'pickaxe', tier: 1 });
defBlock(B.SAND, 'Sand', { tex: FACE_ALL('sand'), hardness: 0.5, tool: 'shovel', sound: 'sand', falls: true });
defBlock(B.GRAVEL, 'Gravel', { tex: FACE_ALL('gravel'), hardness: 0.6, tool: 'shovel', sound: 'gravel', falls: true });
defBlock(B.OAK_LOG, 'Oak Log', { tex: FACE_SIDES('oak_log', 'oak_log_top'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.OAK_LEAVES, 'Oak Leaves', { tex: FACE_ALL('oak_leaves'), opaque: false, hardness: 0.2, atten: 1, sound: 'grass', tint: 1, wave: 1, drop: 0 });
defBlock(B.PLANKS, 'Oak Planks', { tex: FACE_ALL('oak_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.GLASS, 'Glass', { tex: FACE_ALL('glass'), opaque: false, cullSame: true, hardness: 0.3, sound: 'glass' });
defBlock(B.WATER, 'Water', { tex: FACE_ALL('water'), solid: false, opaque: false, model: 'liquid', translucent: true, cullSame: true, atten: 2, target: false, liquid: true, hardness: -1, drop: 0 });
defBlock(B.BEDROCK, 'Bedrock', { tex: FACE_ALL('bedrock'), hardness: -1, drop: 0 });
defBlock(B.COAL_ORE, 'Coal Ore', { tex: FACE_ALL('coal_ore'), hardness: 3, tool: 'pickaxe', tier: 1, drop: 257 });
defBlock(B.IRON_ORE, 'Iron Ore', { tex: FACE_ALL('iron_ore'), hardness: 3, tool: 'pickaxe', tier: 2 });
defBlock(B.GOLD_ORE, 'Gold Ore', { tex: FACE_ALL('gold_ore'), hardness: 3, tool: 'pickaxe', tier: 3 });
defBlock(B.DIAMOND_ORE, 'Diamond Ore', { tex: FACE_ALL('diamond_ore'), hardness: 3, tool: 'pickaxe', tier: 3, drop: 260 });
defBlock(B.SNOW, 'Snow Block', { tex: FACE_ALL('snow'), hardness: 0.3, tool: 'shovel', sound: 'snow' });
defBlock(B.ICE, 'Ice', { tex: FACE_ALL('ice'), opaque: false, translucent: true, cullSame: true, atten: 1, hardness: 0.5, tool: 'pickaxe', sound: 'glass', slippery: true });
defBlock(B.CACTUS, 'Cactus', { tex: FACE_SIDES('cactus_side', 'cactus_top'), hardness: 0.4, sound: 'wool' });
defBlock(B.BIRCH_LOG, 'Birch Log', { tex: FACE_SIDES('birch_log', 'birch_log_top'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.BIRCH_LEAVES, 'Birch Leaves', { tex: FACE_ALL('birch_leaves'), opaque: false, hardness: 0.2, atten: 1, sound: 'grass', wave: 1, drop: 0 });
defBlock(B.SPRUCE_LOG, 'Spruce Log', { tex: FACE_SIDES('spruce_log', 'spruce_log_top'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.SPRUCE_LEAVES, 'Spruce Leaves', { tex: FACE_ALL('spruce_leaves'), opaque: false, hardness: 0.2, atten: 1, sound: 'grass', wave: 1, drop: 0 });
defBlock(B.BRICKS, 'Bricks', { tex: FACE_ALL('bricks'), hardness: 2, tool: 'pickaxe', tier: 1 });
defBlock(B.TALL_GRASS, 'Tall Grass', Object.assign({}, PLANT, { tex: FACE_ALL('tall_grass'), tint: 1, replaceable: true, drop: 0 }));
defBlock(B.DANDELION, 'Dandelion', Object.assign({}, PLANT, { tex: FACE_ALL('dandelion') }));
defBlock(B.POPPY, 'Poppy', Object.assign({}, PLANT, { tex: FACE_ALL('poppy') }));
defBlock(B.TORCH, 'Torch', { tex: FACE_ALL('torch'), solid: false, opaque: false, model: 'torch', emit: 14, hardness: 0, sound: 'wood', glow: true });
defBlock(B.GLOWSTONE, 'Glowstone', { tex: FACE_ALL('glowstone'), emit: 15, hardness: 0.3, sound: 'glass', glow: true });
defBlock(B.CRAFTING_TABLE, 'Crafting Table', { tex: ['crafting_table_side', 'crafting_table_side', 'crafting_table_top', 'oak_planks', 'crafting_table_front', 'crafting_table_front'], hardness: 2.5, tool: 'axe', sound: 'wood' });
defBlock(B.FURNACE, 'Furnace', { tex: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_front', 'furnace_side'], hardness: 3.5, tool: 'pickaxe', tier: 1 });
const WOOLS = [['White', 'wool_white'], ['Red', 'wool_red'], ['Orange', 'wool_orange'], ['Yellow', 'wool_yellow'], ['Lime', 'wool_lime'], ['Blue', 'wool_blue'], ['Purple', 'wool_purple'], ['Black', 'wool_black']];
WOOLS.forEach(([n, t], i) => defBlock(B.WOOL_WHITE + i, n + ' Wool', { tex: FACE_ALL(t), hardness: 0.8, sound: 'wool' }));
defBlock(B.STONE_BRICKS, 'Stone Bricks', { tex: FACE_ALL('stone_bricks'), hardness: 1.5, tool: 'pickaxe', tier: 1 });
defBlock(B.SANDSTONE, 'Sandstone', { tex: FACE_SIDES('sandstone_side', 'sandstone_top'), hardness: 0.8, tool: 'pickaxe', tier: 1 });
defBlock(B.BOOKSHELF, 'Bookshelf', { tex: FACE_SIDES('bookshelf', 'oak_planks'), hardness: 1.5, tool: 'axe', sound: 'wood' });
defBlock(B.MOSSY_COBBLE, 'Mossy Cobblestone', { tex: FACE_ALL('mossy_cobblestone'), hardness: 2, tool: 'pickaxe', tier: 1 });
defBlock(B.LAVA, 'Lava', { tex: FACE_ALL('lava'), solid: false, opaque: false, model: 'liquid', cullSame: true, emit: 15, target: false, liquid: true, hardness: -1, drop: 0, glow: true, lightBlock: true });
defBlock(B.SNOWY_GRASS, 'Snowy Grass Block', { tex: FACE_SIDES('snowy_grass_side', 'snow', 'dirt'), hardness: 0.6, tool: 'shovel', drop: B.DIRT, sound: 'snow' });
defBlock(B.DEAD_BUSH, 'Dead Bush', Object.assign({}, PLANT, { tex: FACE_ALL('dead_bush'), replaceable: true, drop: 256 }));
defBlock(B.SPRUCE_PLANKS, 'Spruce Planks', { tex: FACE_ALL('spruce_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.BIRCH_PLANKS, 'Birch Planks', { tex: FACE_ALL('birch_planks'), hardness: 2, tool: 'axe', sound: 'wood' });
defBlock(B.OBSIDIAN, 'Obsidian', { tex: FACE_ALL('obsidian'), hardness: 15, tool: 'pickaxe', tier: 4 });
defBlock(B.CORNFLOWER, 'Cornflower', Object.assign({}, PLANT, { tex: FACE_ALL('blue_flower') }));

// ---- Items (ids >= 256) ----------------------------------------------------
const I = { STICK: 256, COAL: 257, IRON_INGOT: 258, GOLD_INGOT: 259, DIAMOND: 260, APPLE: 261, PORK_RAW: 262, PORK_COOKED: 263, MUTTON_RAW: 264, MUTTON_COOKED: 265 };
const ITEMS = {};
function defItem(id, name, tex, p) { ITEMS[id] = Object.assign({ id, name, tex: TEX[tex], stack: 64 }, p || {}); }
defItem(I.STICK, 'Stick', 'stick');
defItem(I.COAL, 'Coal', 'coal');
defItem(I.IRON_INGOT, 'Iron Ingot', 'iron_ingot');
defItem(I.GOLD_INGOT, 'Gold Ingot', 'gold_ingot');
defItem(I.DIAMOND, 'Diamond', 'diamond');
defItem(I.APPLE, 'Apple', 'apple', { food: 4 });
defItem(I.PORK_RAW, 'Raw Porkchop', 'porkchop_raw', { food: 3 });
defItem(I.PORK_COOKED, 'Cooked Porkchop', 'porkchop_cooked', { food: 8 });
defItem(I.MUTTON_RAW, 'Raw Mutton', 'mutton_raw', { food: 2 });
defItem(I.MUTTON_COOKED, 'Cooked Mutton', 'mutton_cooked', { food: 6 });
const TOOL_MATS = [['wood', 'Wooden', 1, 2], ['stone', 'Stone', 2, 4], ['iron', 'Iron', 3, 6], ['diamond', 'Diamond', 4, 8]];
const TOOL_TYPES = [['pickaxe', 'Pickaxe'], ['axe', 'Axe'], ['shovel', 'Shovel'], ['sword', 'Sword']];
const TOOL_BASE = 270;
TOOL_MATS.forEach(([m, mn, tier, speed], mi) => TOOL_TYPES.forEach(([t, tn], ti) => {
  const dmg = t === 'sword' ? 3 + tier : t === 'axe' ? 2 + tier : 1 + tier * 0.5;
  defItem(TOOL_BASE + mi * 4 + ti, mn + ' ' + tn, m + '_' + t, { tool: t, tier, speed, damage: dmg, stack: 1 });
}));
const toolId = (mat, type) => TOOL_BASE + ['wood', 'stone', 'iron', 'diamond'].indexOf(mat) * 4 + ['pickaxe', 'axe', 'shovel', 'sword'].indexOf(type);

function itemName(id) { return id < 256 ? (BLOCKS[id] ? BLOCKS[id].name : '?') : (ITEMS[id] ? ITEMS[id].name : '?'); }
function maxStack(id) { return id < 256 ? 64 : (ITEMS[id] ? ITEMS[id].stack : 64); }

// ---- Lookup tables for fast meshing -----------------------------------------
const NB = 256;
const T_OPAQUE = new Uint8Array(NB), T_LIGHTBLOCK = new Uint8Array(NB), T_ATTEN = new Uint8Array(NB), T_EMIT = new Uint8Array(NB);
const T_MODEL = new Uint8Array(NB), T_TRANS = new Uint8Array(NB), T_CULLSAME = new Uint8Array(NB), T_TINT = new Uint8Array(NB);
const T_WAVE = new Uint8Array(NB), T_GLOW = new Uint8Array(NB), T_TEX = new Uint8Array(NB * 6), T_SOLID = new Uint8Array(NB), T_LIQUID = new Uint8Array(NB);
const MODEL_ID = { none: 0, cube: 1, cross: 2, torch: 3, liquid: 4 };
BLOCKS.forEach((d, id) => {
  if (!d) return;
  T_OPAQUE[id] = d.opaque ? 1 : 0;
  T_LIGHTBLOCK[id] = (d.opaque || d.lightBlock) ? 1 : 0;
  T_ATTEN[id] = d.atten;
  T_EMIT[id] = d.emit;
  T_MODEL[id] = MODEL_ID[d.model];
  T_TRANS[id] = d.translucent ? 1 : 0;
  T_CULLSAME[id] = d.cullSame ? 1 : 0;
  T_TINT[id] = d.tint;
  T_WAVE[id] = d.wave;
  T_GLOW[id] = d.glow ? 1 : 0;
  T_SOLID[id] = d.solid ? 1 : 0;
  T_LIQUID[id] = d.liquid ? 1 : 0;
  for (let f = 0; f < 6; f++) T_TEX[id * 6 + f] = d.texL[f];
});

// ---- Seeded noise ----------------------------------------------------------
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hash3(seed, x, y, z) {
  let h = (seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^ Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const g = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
  const G = new Float64Array(g);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const F3 = 1 / 3, G3 = 1 / 6;
  function n2(xin, yin) {
    let n0 = 0, n1 = 0, n2v = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const gi = pm12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (G[gi] * x0 + G[gi + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const gi = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (G[gi] * x1 + G[gi + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const gi = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2v = t2 * t2 * (G[gi] * x2 + G[gi + 1] * y2); }
    return 70 * (n0 + n1 + n2v);
  }
  function n3(xin, yin, zin) {
    let n0 = 0, n1 = 0, n2v = 0, n3v = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const gi = pm12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (G[gi] * x0 + G[gi + 1] * y0 + G[gi + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const gi = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (G[gi] * x1 + G[gi + 1] * y1 + G[gi + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const gi = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2v = t2 * t2 * (G[gi] * x2 + G[gi + 1] * y2 + G[gi + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const gi = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3v = t3 * t3 * (G[gi] * x3 + G[gi + 1] * y3 + G[gi + 2] * z3); }
    return 32 * (n0 + n1 + n2v + n3v);
  }
  return { n2, n3 };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- Terrain generator -----------------------------------------------------
const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, TAIGA: 5, MOUNTAIN: 6, PEAK: 7, FROZEN_OCEAN: 8, SNOWY_BEACH: 9 };
const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Desert', 'Snowy Taiga', 'Mountains', 'Snowy Peaks', 'Frozen Ocean', 'Snowy Beach'];

function createGen(seed) {
  seed = seed >>> 0;
  const nCont = makeNoise(seed + 11), nEro = makeNoise(seed + 23), nHill = makeNoise(seed + 37), nMount = makeNoise(seed + 41);
  const nTemp = makeNoise(seed + 53), nHum = makeNoise(seed + 67), nDet = makeNoise(seed + 71);
  const nC1 = makeNoise(seed + 83), nC2 = makeNoise(seed + 97), nC3 = makeNoise(seed + 101), nMisc = makeNoise(seed + 113);

  function fbm(n, x, z, oct) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * n.n2(x * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }
  function climate(x, z) {
    const t = clamp(fbm(nTemp, x / 1100, z / 1100, 3) * 1.9 + nDet.n2(x / 70, z / 70) * 0.04, -1, 1);
    const h = clamp(fbm(nHum, x / 900, z / 900, 3) * 1.9 + nDet.n2(x / 60 + 50, z / 60) * 0.04, -1, 1);
    return [t, h];
  }
  // Surface height (float) for a world column.
  function heightF(x, z) {
    const cont = fbm(nCont, x / 1300, z / 1300, 4) * 1.6 + 0.12;
    const ero = fbm(nEro, x / 500, z / 500, 3);
    const hills = fbm(nHill, x / 150, z / 150, 4);
    const land = smoothstep(-0.18, 0.2, cont);
    let h = SEA + cont * 30;
    h += hills * (2.5 + 9 * land) * (0.55 + 0.45 * (1 - Math.abs(ero)));
    const ridge = 1 - Math.abs(nMount.n2(x / 280, z / 280));
    const mmask = smoothstep(0.05, 0.45, fbm(nEro, x / 900 + 77, z / 900 - 31, 2) * 1.4 + cont * 0.4) * land;
    h += mmask * (ridge * ridge * ridge * 58 + ridge * 6);
    h += nDet.n2(x / 26, z / 26) * 0.8;
    return clamp(h, 4, CH - 12);
  }
  function biomeAt(h, t, hu) {
    const cold = t < -0.42;
    if (h < SEA - 2) return cold ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    if (h <= SEA + 1) return cold ? BIOME.SNOWY_BEACH : BIOME.BEACH;
    if (h >= 102) return BIOME.PEAK;
    if (h >= 86) return cold ? BIOME.PEAK : BIOME.MOUNTAIN;
    if (cold) return BIOME.TAIGA;
    if (t > 0.3 && hu < 0.05) return BIOME.DESERT;
    if (hu > 0.08) return BIOME.FOREST;
    return BIOME.PLAINS;
  }
  function column(x, z) {
    const h = Math.floor(heightF(x, z));
    const c = climate(x, z);
    return { h, biome: biomeAt(h, c[0], c[1]), t: c[0], hu: c[1] };
  }
  function surfaceBlocks(biome, x, z, h) {
    // [top, filler, fillerDepth]
    switch (biome) {
      case BIOME.OCEAN: case BIOME.FROZEN_OCEAN: {
        const r = nMisc.n2(x / 40, z / 40);
        if (r > 0.35) return [B.GRAVEL, B.GRAVEL, 3];
        if (r < -0.4 && h > SEA - 12) return [B.DIRT, B.DIRT, 3];
        return [B.SAND, B.SAND, 3];
      }
      case BIOME.BEACH: return [B.SAND, B.SAND, 4];
      case BIOME.SNOWY_BEACH: return [B.SNOWY_GRASS, B.DIRT, 3];
      case BIOME.DESERT: return [B.SAND, B.SAND, 5];
      case BIOME.TAIGA: return [B.SNOWY_GRASS, B.DIRT, 3];
      case BIOME.PEAK: return [B.SNOW, B.STONE, 1];
      case BIOME.MOUNTAIN: return nMisc.n2(x / 18, z / 18) > 0.1 ? [B.STONE, B.STONE, 1] : [B.GRASS, B.DIRT, 2];
      default: return [B.GRASS, B.DIRT, 3];
    }
  }

  // Trees: a column hosts a tree if its hash is below the biome density and it is
  // the lowest hash within a 5x5 neighbourhood (keeps trunks apart).
  const TREE_SEED = (seed * 31 + 7) >>> 0;
  function treeHash(x, z) { return hash3(TREE_SEED, x, 0, z); }
  function isTreeSite(x, z, p) {
    const hv = treeHash(x, z);
    if (hv >= p) return false;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dz) && treeHash(x + dx, z + dz) < hv) return false;
    }
    return true;
  }
  const TREE_DENSITY = [0, 0, 0.012, 0.11, 0.012, 0.07, 0.02, 0, 0, 0];

  function generateChunk(cx, cz) {
    const blocks = new Uint8Array(CVOL);
    const x0 = cx * CS, z0 = cz * CS;
    const heights = new Int16Array(256), biomes = new Uint8Array(256);
    let maxH = 0;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const c = column(x0 + lx, z0 + lz);
      heights[lz * 16 + lx] = c.h; biomes[lz * 16 + lx] = c.biome;
      if (c.h > maxH) maxH = c.h;
    }
    // Cave noise on a coarse 4x4x4 grid, trilinearly interpolated.
    const GY = Math.min(CH / 4, (maxH >> 2) + 2) + 1;
    const g1 = new Float32Array(25 * GY), g2 = new Float32Array(25 * GY), g3 = new Float32Array(25 * GY);
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++) {
      const wx = x0 + gx * 4, wy = gy * 4, wz = z0 + gz * 4;
      const gi = (gy * 5 + gz) * 5 + gx;
      g1[gi] = nC1.n3(wx / 42, wy / 26, wz / 42);
      g2[gi] = nC2.n3(wx / 42, wy / 26, wz / 42);
      g3[gi] = nC3.n3(wx / 64, wy / 30, wz / 64);
    }
    const sample = (g, lx, y, lz) => {
      const fx = lx / 4, fy = y / 4, fz = lz / 4;
      const ix = fx | 0, iy = fy | 0, iz = fz | 0;
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const i000 = (iy * 5 + iz) * 5 + ix;
      const a = g[i000] + (g[i000 + 1] - g[i000]) * tx;
      const b = g[i000 + 5] + (g[i000 + 6] - g[i000 + 5]) * tx;
      const c = g[i000 + 25] + (g[i000 + 26] - g[i000 + 25]) * tx;
      const d = g[i000 + 30] + (g[i000 + 31] - g[i000 + 30]) * tx;
      const ab = a + (b - a) * tz, cd = c + (d - c) * tz;
      return ab + (cd - ab) * ty;
    };
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const ci = lz * 16 + lx;
      const h = heights[ci], biome = biomes[ci];
      const wx = x0 + lx, wz = z0 + lz;
      const [top, filler, depth] = surfaceBlocks(biome, wx, wz, h);
      const cold = biome === BIOME.FROZEN_OCEAN || biome === BIOME.TAIGA || biome === BIOME.SNOWY_BEACH;
      const desert = biome === BIOME.DESERT;
      for (let y = 0; y <= Math.max(h, SEA); y++) {
        let b;
        if (y === 0) b = B.BEDROCK;
        else if (y < 4 && hash3(seed, wx, y, wz) < 0.6 - y * 0.15) b = B.BEDROCK;
        else if (y < h - depth) b = (desert && y >= h - depth - 3) ? B.SANDSTONE : B.STONE;
        else if (y < h) b = filler;
        else if (y === h) b = (h < SEA && top === B.SNOWY_GRASS) ? B.DIRT : (h < SEA && top === B.GRASS ? B.DIRT : top);
        else b = (y === SEA && cold) ? B.ICE : B.WATER;
        blocks[(y * 16 + lz) * 16 + lx] = b;
      }
      // Caves
      const wet = h <= SEA + 2;
      const topCarve = wet ? h - 5 : h;
      for (let y = 1; y <= topCarve; y++) {
        const idx = (y * 16 + lz) * 16 + lx;
        const cur = blocks[idx];
        if (cur === B.BEDROCK || cur === B.WATER) continue;
        const a = sample(g1, lx, y, lz), bb = sample(g2, lx, y, lz);
        const depthFade = y > h - 6 ? 0.012 * (y - (h - 6)) : 0;
        let carve = Math.abs(a) < 0.07 - depthFade && Math.abs(bb) < 0.07 - depthFade;
        if (!carve && y < h - 10) carve = sample(g3, lx, y, lz) > 0.58 + (y < 20 ? 0 : (y - 20) * 0.004);
        if (carve) blocks[idx] = y <= 10 ? B.LAVA : B.AIR;
      }
      // Grass that ended up under a carved surface stays as is; dirt exposed in caves is fine.
    }
    // Ores and underground blobs
    const rnd = mulberry((hash3(seed, cx, 77, cz) * 4294967296) >>> 0);
    const vein = (ore, count, ymin, ymax, size, replace) => {
      for (let n = 0; n < count; n++) {
        let x = (rnd() * 16) | 0, y = ymin + ((rnd() * (ymax - ymin)) | 0), z = (rnd() * 16) | 0;
        const s = 2 + ((rnd() * size) | 0);
        for (let k = 0; k < s; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) {
            const idx = (y * 16 + z) * 16 + x;
            if (blocks[idx] === replace) blocks[idx] = ore;
          }
          const r = rnd();
          if (r < 0.33) x += rnd() < 0.5 ? -1 : 1; else if (r < 0.66) z += rnd() < 0.5 ? -1 : 1; else y += rnd() < 0.5 ? -1 : 1;
        }
      }
    };
    vein(B.DIRT, 3, 10, 70, 22, B.STONE);
    vein(B.GRAVEL, 3, 5, 70, 22, B.STONE);
    vein(B.COAL_ORE, 16, 5, 110, 10, B.STONE);
    vein(B.IRON_ORE, 10, 2, 64, 7, B.STONE);
    vein(B.GOLD_ORE, 3, 2, 32, 6, B.STONE);
    vein(B.DIAMOND_ORE, 2, 2, 16, 5, B.STONE);
    // Plants
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const ci = lz * 16 + lx, h = heights[ci], biome = biomes[ci];
      if (h + 1 >= CH) continue;
      const below = blocks[(h * 16 + lz) * 16 + lx], ai = ((h + 1) * 16 + lz) * 16 + lx;
      if (blocks[ai] !== B.AIR) continue;
      const r = hash3(seed + 5, x0 + lx, h, z0 + lz);
      if (below === B.GRASS) {
        const flowerZone = nMisc.n2((x0 + lx) / 30, (z0 + lz) / 30);
        if (biome === BIOME.PLAINS || biome === BIOME.MOUNTAIN) {
          if (r < 0.2) blocks[ai] = B.TALL_GRASS;
          else if (r < 0.2 + (flowerZone > 0.3 ? 0.06 : 0.008)) blocks[ai] = flowerZone > 0.6 ? B.CORNFLOWER : (r * 1000 | 0) % 2 ? B.DANDELION : B.POPPY;
        } else if (biome === BIOME.FOREST) {
          if (r < 0.1) blocks[ai] = B.TALL_GRASS;
          else if (r < 0.112) blocks[ai] = (r * 1000 | 0) % 3 === 0 ? B.CORNFLOWER : (r * 1000 | 0) % 2 ? B.DANDELION : B.POPPY;
        }
      } else if (below === B.SAND && biome === BIOME.DESERT && r < 0.008) blocks[ai] = B.DEAD_BUSH;
    }
    // Trees (including canopies spilling over from neighbouring chunks)
    const setIf = (wx, y, wz, b, force) => {
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y < 1 || y >= CH) return;
      const idx = (y * 16 + lz) * 16 + lx, cur = blocks[idx];
      if (force ? (cur === B.AIR || T_MODEL[cur] === 2 || cur === B.OAK_LEAVES || cur === B.BIRCH_LEAVES || cur === B.SPRUCE_LEAVES || cur === B.SNOWY_GRASS || cur === B.GRASS)
        : (cur === B.AIR || T_MODEL[cur] === 2)) blocks[idx] = b;
    };
    for (let wz = z0 - 3; wz < z0 + 19; wz++) for (let wx = x0 - 3; wx < x0 + 19; wx++) {
      if (treeHash(wx, wz) > 0.11) continue;
      const lxi = wx - x0, lzi = wz - z0;
      const inside = lxi >= 0 && lxi < 16 && lzi >= 0 && lzi < 16;
      let h, biome;
      if (inside) { h = heights[lzi * 16 + lxi]; biome = biomes[lzi * 16 + lxi]; } else { const c = column(wx, wz); h = c.h; biome = c.biome; }
      const p = TREE_DENSITY[biome];
      if (!p || !isTreeSite(wx, wz, p)) continue;
      if (h <= SEA || h > CH - 20) continue;
      if (inside) {
        const surf = blocks[(h * 16 + lzi) * 16 + lxi];
        if (!(surf === B.GRASS || surf === B.SNOWY_GRASS || surf === B.SAND)) continue;
        if (blocks[((h + 1) * 16 + lzi) * 16 + lxi] !== B.AIR && T_MODEL[blocks[((h + 1) * 16 + lzi) * 16 + lxi]] !== 2) continue;
      }
      const r1 = hash3(seed + 9, wx, 1, wz), r2 = hash3(seed + 9, wx, 2, wz);
      const base = h + 1;
      if (biome === BIOME.DESERT) {
        const ht = 1 + ((r1 * 3) | 0);
        for (let i = 0; i < ht; i++) setIf(wx, base + i, wz, B.CACTUS, false);
        continue;
      }
      if (biome === BIOME.TAIGA || (biome === BIOME.MOUNTAIN && r2 < 0.5)) {
        const ht = 7 + ((r1 * 4) | 0);
        const leafStart = 2 + ((r2 * 2) | 0);
        for (let i = 0; i < ht; i++) setIf(wx, base + i, wz, B.SPRUCE_LOG, true);
        setIf(wx, base + ht, wz, B.SPRUCE_LEAVES, false);
        setIf(wx, base + ht + 1, wz, B.SPRUCE_LEAVES, false);
        let k = 0;
        for (let y = base + ht - 1; y >= base + leafStart; y--, k++) {
          const rad = k === 0 ? 1 : (k % 2 === 1 ? Math.min(3, 1 + (k >> 1)) : Math.max(1, (k >> 1)));
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            if (!dx && !dz) continue;
            if (dx * dx + dz * dz > rad * rad + rad * 0.6) continue;
            setIf(wx + dx, y, wz + dz, B.SPRUCE_LEAVES, false);
          }
        }
        if (inside) setIf(wx, h, wz, B.DIRT, true);
        continue;
      }
      const birch = biome === BIOME.FOREST && r2 < 0.3;
      const log = birch ? B.BIRCH_LOG : B.OAK_LOG, leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
      const ht = (birch ? 5 : 4) + ((r1 * 3) | 0);
      for (let dy = ht - 3; dy <= ht; dy++) {
        const rad = dy >= ht - 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) {
            if (dy === ht || hash3(seed + 13, wx + dx, base + dy, wz + dz) < 0.5) continue;
          }
          setIf(wx + dx, base + dy, wz + dz, leaves, false);
        }
      }
      for (let i = 0; i < ht; i++) setIf(wx, base + i, wz, log, true);
      if (inside) setIf(wx, h, wz, B.DIRT, true);
    }
    return blocks;
  }

  function findSpawn() {
    for (let r = 0; r < 4000; r += 8) {
      const steps = Math.max(1, Math.floor(r / 8) * 8);
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const c = column(x, z);
        if ((c.biome === BIOME.PLAINS || c.biome === BIOME.FOREST) && c.h > SEA + 2 && c.h < 80) return { x: x + 0.5, z: z + 0.5, h: c.h };
      }
    }
    return { x: 0.5, z: 0.5, h: column(0, 0).h };
  }

  // Grass/foliage tint (r,g,b in 0..1) from climate.
  function tintAt(x, z) {
    const [t, hu] = climate(x, z);
    const tt = (t + 1) / 2, hh = (hu + 1) / 2;
    const dry = [0.72, 0.70, 0.38], lush = [0.34, 0.62, 0.24], cool = [0.42, 0.60, 0.48], temperate = [0.50, 0.70, 0.31];
    const warm = [lerp(temperate[0], dry[0], smoothstep(0.55, 0.85, tt) * (1 - hh)), lerp(temperate[1], dry[1], smoothstep(0.55, 0.85, tt) * (1 - hh)), lerp(temperate[2], dry[2], smoothstep(0.55, 0.85, tt) * (1 - hh))];
    const wl = smoothstep(0.45, 0.75, hh);
    const c = [lerp(warm[0], lush[0], wl), lerp(warm[1], lush[1], wl), lerp(warm[2], lush[2], wl)];
    const cl = 1 - smoothstep(0.2, 0.4, tt);
    return [lerp(c[0], cool[0], cl), lerp(c[1], cool[1], cl), lerp(c[2], cool[2], cl)];
  }

  return { generateChunk, column, climate, heightF, findSpawn, tintAt, seed };
}

// ---- Lighting + meshing ----------------------------------------------------
// The mesher works on a padded 48x130x48 volume made of the 3x3 chunk
// neighbourhood (plus a bedrock floor and an open-sky ceiling layer), so light
// coming from neighbouring chunks is exact and faces/AO on chunk edges match.
const PW = 48, PHT = CH + 2;
const SX = 1, SZ = PW, SY = PW * PW;
const PVOL = PW * PW * PHT;
let _vol = null, _sky = null, _blk = null, _q = null;
const QMASK = (1 << 21) - 1;

// face order: +X, -X, +Y, -Y, +Z, -Z
const FN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FBL = [[1, 0, 1], [0, 0, 0], [0, 1, 1], [0, 0, 0], [0, 0, 1], [1, 0, 0]];
const FR = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
const FU = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
const CR = [0, 1, 1, 0], CU = [0, 0, 1, 1];
const dOf = (v) => v[0] * SX + v[1] * SY + v[2] * SZ;
const FDN = FN.map(dOf), FDR = FR.map(dOf), FDU = FU.map(dOf);

function growBuf(buf, need) {
  if (buf.len + need <= buf.data.length) return;
  let n = buf.data.length * 2;
  while (n < buf.len + need) n *= 2;
  const d = new Uint32Array(n); d.set(buf.data.subarray(0, buf.len)); buf.data = d;
}

function computeLight(vol, sky, blk, q) {
  sky.fill(0); blk.fill(0);
  // Direct skylight down each column.
  let lowest = PHT;
  for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
    let lvl = 15, y = PHT - 1;
    for (; y >= 0; y--) {
      const i = y * SY + z * SZ + x, b = vol[i];
      if (T_LIGHTBLOCK[b]) break;
      lvl -= T_ATTEN[b];
      if (lvl <= 0) break;
      sky[i] = lvl;
    }
    if (y < lowest) lowest = y;
  }
  // Seed BFS from lit cells next to darker open cells.
  let head = 0, tail = 0;
  for (let y = Math.max(1, lowest); y < PHT; y++) for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
    const i = y * SY + z * SZ + x, l = sky[i];
    if (l < 2) continue;
    const t = l - 1;
    if ((x > 0 && sky[i - 1] < t && !T_LIGHTBLOCK[vol[i - 1]]) || (x < PW - 1 && sky[i + 1] < t && !T_LIGHTBLOCK[vol[i + 1]]) ||
      (z > 0 && sky[i - SZ] < t && !T_LIGHTBLOCK[vol[i - SZ]]) || (z < PW - 1 && sky[i + SZ] < t && !T_LIGHTBLOCK[vol[i + SZ]]) ||
      (sky[i - SY] < t && !T_LIGHTBLOCK[vol[i - SY]])) { q[tail++ & QMASK] = i; }
  }
  propagate(vol, sky, q, head, tail);
  // Block light from emitters.
  head = 0; tail = 0;
  for (let i = SY; i < PVOL - SY; i++) {
    const e = T_EMIT[vol[i]];
    if (e) { blk[i] = e; q[tail++ & QMASK] = i; }
  }
  propagate(vol, blk, q, head, tail);
}
function propagate(vol, L, q, head, tail) {
  while (head < tail) {
    const i = q[head++ & QMASK];
    const l = L[i];
    if (l <= 1) continue;
    const x = i % PW, z = ((i / PW) | 0) % PW, y = (i / SY) | 0;
    for (let f = 0; f < 6; f++) {
      let n;
      if (f === 0) { if (x === PW - 1) continue; n = i + 1; }
      else if (f === 1) { if (x === 0) continue; n = i - 1; }
      else if (f === 2) { if (y === PHT - 1) continue; n = i + SY; }
      else if (f === 3) { if (y === 0) continue; n = i - SY; }
      else if (f === 4) { if (z === PW - 1) continue; n = i + SZ; }
      else { if (z === 0) continue; n = i - SZ; }
      const b = vol[n];
      if (T_LIGHTBLOCK[b]) continue;
      const nl = l - 1 - T_ATTEN[b];
      if (nl > L[n]) { L[n] = nl; q[tail++ & QMASK] = n; }
    }
  }
}

// Vertex packing (3 x uint32 per vertex):
//  w0: x*16 (9b) | z*16 (9b) <<9 | y*16 (12b) <<18
//  w1: layer (8b) | face <<8 (3b) | u <<11 (5b) | v <<16 (5b) | ao <<21 (2b) | wave <<23 (2b) | glow <<25
//  w2: sky*4 (6b) | blk*4 <<6 (6b) | tint rgb555 <<12
function buildChunkMesh(cx, cz, chunks, gen) {
  if (!_vol) { _vol = new Uint8Array(PVOL); _sky = new Uint8Array(PVOL); _blk = new Uint8Array(PVOL); _q = new Int32Array(QMASK + 1); }
  const vol = _vol, sky = _sky, blk = _blk;
  vol.fill(0, 0, SY);
  for (let i = 0; i < SY; i++) vol[i] = B.BEDROCK;
  vol.fill(0, (PHT - 1) * SY);
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const src = chunks[dz * 3 + dx];
    for (let y = 0; y < CH; y++) for (let lz = 0; lz < 16; lz++) {
      const d = (y + 1) * SY + (dz * 16 + lz) * SZ + dx * 16;
      if (src) { const s = (y * 16 + lz) * 16; vol.set(src.subarray(s, s + 16), d); } else vol.fill(0, d, d + 16);
    }
  }
  computeLight(vol, sky, blk, _q);

  // Biome tints for the centre chunk columns.
  const tints = new Uint32Array(256);
  for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    const t = gen.tintAt(cx * 16 + lx, cz * 16 + lz);
    tints[lz * 16 + lx] = (Math.round(t[0] * 31) | (Math.round(t[1] * 31) << 5) | (Math.round(t[2] * 31) << 10)) || 1;
  }

  const op = { data: new Uint32Array(1 << 16), len: 0 };
  const tr = { data: new Uint32Array(1 << 14), len: 0 };
  const ao = [0, 0, 0, 0], sl = [0, 0, 0, 0], bl = [0, 0, 0, 0];

  const emitQuad = (buf, pos, layer, face, uvs, aoA, slA, blA, wave, glow, tint, flipOK) => {
    growBuf(buf, 12);
    const d = buf.data;
    let start = 0;
    if (flipOK && aoA[0] + aoA[2] + (slA[0] + slA[2]) * 0.01 < aoA[1] + aoA[3] + (slA[1] + slA[3]) * 0.01) start = 1;
    for (let k = 0; k < 4; k++) {
      const v = (k + start) & 3;
      const o = buf.len;
      d[o] = (pos[v * 3] | (pos[v * 3 + 2] << 9) | (pos[v * 3 + 1] << 18)) >>> 0;
      d[o + 1] = (layer | (face << 8) | (uvs[v * 2] << 11) | (uvs[v * 2 + 1] << 16) | (aoA[v] << 21) | (((wave >> (v * 2)) & 3) << 23) | (glow << 25)) >>> 0;
      d[o + 2] = (slA[v] | (blA[v] << 6) | (tint << 12)) >>> 0;
      buf.len += 3;
    }
  };
  const pos = new Int32Array(12), uvs = new Int32Array(8);

  for (let y = 0; y < CH; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
    const i = (y + 1) * SY + (lz + 16) * SZ + lx + 16;
    const b = vol[i];
    if (!b) continue;
    const model = T_MODEL[b];
    const tint = T_TINT[b] ? tints[lz * 16 + lx] : 0;
    const glow = T_GLOW[b];
    if (model === 2) { // cross sprite
      const layer = T_TEX[b * 6];
      const s4 = sky[i] * 4, b4 = blk[i] * 4;
      sl[0] = sl[1] = sl[2] = sl[3] = s4; bl[0] = bl[1] = bl[2] = bl[3] = b4; ao[0] = ao[1] = ao[2] = ao[3] = 3;
      const X = lx * 16, Y = y * 16, Z = lz * 16;
      const jx = ((hash3(7, cx * 16 + lx, y, cz * 16 + lz) * 5) | 0) - 2, jz = ((hash3(8, cx * 16 + lx, y, cz * 16 + lz) * 5) | 0) - 2;
      const quads = [[2, 2, 14, 14], [14, 14, 2, 2], [2, 14, 14, 2], [14, 2, 2, 14]];
      for (const [ax, az, bx, bz] of quads) {
        const p0x = X + ax + jx, p0z = Z + az + jz, p1x = X + bx + jx, p1z = Z + bz + jz;
        pos[0] = p0x; pos[1] = Y; pos[2] = p0z;
        pos[3] = p1x; pos[4] = Y; pos[5] = p1z;
        pos[6] = p1x; pos[7] = Y + 16; pos[8] = p1z;
        pos[9] = p0x; pos[10] = Y + 16; pos[11] = p0z;
        uvs[0] = 0; uvs[1] = 16; uvs[2] = 16; uvs[3] = 16; uvs[4] = 16; uvs[5] = 0; uvs[6] = 0; uvs[7] = 0;
        // wave only on the top two vertices: bits for v2 and v3
        emitQuad(op, pos, layer, 2, uvs, ao, sl, bl, T_WAVE[b] ? (2 << 4) | (2 << 6) : 0, glow, tint, false);
      }
      continue;
    }
    if (model === 3) { // torch: thin post
      const layer = T_TEX[b * 6];
      const s4 = sky[i] * 4, b4 = Math.max(blk[i], 14) * 4;
      sl[0] = sl[1] = sl[2] = sl[3] = s4; bl[0] = bl[1] = bl[2] = bl[3] = b4; ao[0] = ao[1] = ao[2] = ao[3] = 3;
      const X = lx * 16, Y = y * 16, Z = lz * 16;
      for (let f = 0; f < 6; f++) {
        if (f === 3) continue;
        const bl0 = FBL[f], r = FR[f], u = FU[f];
        for (let k = 0; k < 4; k++) {
          // map unit cube corner onto torch box (7..9, 0..10, 7..9)
          const cxx = bl0[0] + r[0] * CR[k] + u[0] * CU[k];
          const cyy = bl0[1] + r[1] * CR[k] + u[1] * CU[k];
          const czz = bl0[2] + r[2] * CR[k] + u[2] * CU[k];
          pos[k * 3] = X + 7 + cxx * 2; pos[k * 3 + 1] = Y + cyy * 10; pos[k * 3 + 2] = Z + 7 + czz * 2;
          if (f === 2) { uvs[k * 2] = 7 + CR[k] * 2; uvs[k * 2 + 1] = 8 - CU[k] * 2; }
          else { uvs[k * 2] = 7 + CR[k] * 2; uvs[k * 2 + 1] = 16 - CU[k] * 10; }
        }
        emitQuad(op, pos, layer, f, uvs, ao, sl, bl, 0, 1, 0, false);
      }
      continue;
    }
    const liquid = model === 4;
    const buf = T_TRANS[b] ? tr : op;
    const topLow = liquid && vol[i + SY] !== b;
    for (let f = 0; f < 6; f++) {
      const n = i + FDN[f];
      const nb = vol[n];
      if (T_OPAQUE[nb]) continue;
      if (nb === b && T_CULLSAME[b]) continue;
      if (liquid && T_LIQUID[nb] && f !== 2) continue;
      if (b === B.WATER && nb === B.ICE) continue;
      if (b === B.ICE && nb === B.WATER) continue;
      if (liquid && f === 2 && T_LIQUID[nb]) continue;
      const layer = T_TEX[b * 6 + f];
      const bl0 = FBL[f];
      const dr = FDR[f], du = FDU[f];
      for (let k = 0; k < 4; k++) {
        const sr = CR[k] ? dr : -dr, su = CU[k] ? du : -du;
        const A = n + sr, Bc = n + su, C = n + sr + su;
        const aOp = T_OPAQUE[vol[A]], bOp = T_OPAQUE[vol[Bc]], cOp = T_OPAQUE[vol[C]];
        ao[k] = (aOp && bOp) ? 0 : 3 - (aOp + bOp + cOp);
        let s = sky[n], bb = blk[n], cnt = 1;
        if (!aOp) { s += sky[A]; bb += blk[A]; cnt++; }
        if (!bOp) { s += sky[Bc]; bb += blk[Bc]; cnt++; }
        if (!cOp && !(aOp && bOp)) { s += sky[C]; bb += blk[C]; cnt++; }
        sl[k] = Math.round(s * 4 / cnt); bl[k] = Math.round(bb * 4 / cnt);
        if (glow) { bl[k] = 60; }
        const r = FR[f], u = FU[f];
        const px = bl0[0] + r[0] * CR[k] + u[0] * CU[k];
        const py = bl0[1] + r[1] * CR[k] + u[1] * CU[k];
        const pz = bl0[2] + r[2] * CR[k] + u[2] * CU[k];
        pos[k * 3] = lx * 16 + px * 16;
        pos[k * 3 + 1] = y * 16 + (py && topLow ? 14 : py * 16);
        pos[k * 3 + 2] = lz * 16 + pz * 16;
        uvs[k * 2] = CR[k] * 16; uvs[k * 2 + 1] = (1 - CU[k]) * 16;
        if (topLow && f !== 2 && f !== 3 && CU[k]) uvs[k * 2 + 1] = 2;
      }
      let wave = 0;
      if (T_WAVE[b] === 1) wave = 0x55; // all four vertices sway (leaves)
      else if (b === B.WATER) {
        // water surface vertices bob (only those at the lowered top)
        for (let k = 0; k < 4; k++) if (topLow && pos[k * 3 + 1] === y * 16 + 14) wave |= 3 << (k * 2);
      }
      emitQuad(buf, pos, layer, f, uvs, ao, sl, bl, wave, glow, tint, !liquid);
    }
  }

  // Light of the centre chunk (sky<<4 | blk) for entity shading on the main thread.
  const light = new Uint8Array(CVOL);
  for (let y = 0; y < CH; y++) for (let lz = 0; lz < 16; lz++) {
    const s = (y + 1) * SY + (lz + 16) * SZ + 16, d = (y * 16 + lz) * 16;
    for (let lx = 0; lx < 16; lx++) light[d + lx] = (sky[s + lx] << 4) | blk[s + lx];
  }
  return { opaque: op.data.slice(0, op.len), trans: tr.data.slice(0, tr.len), light };
}

if (typeof module !== 'undefined') module.exports = { CS, CH, SEA, B, BLOCKS, I, ITEMS, createGen, buildChunkMesh, TEX, TEX_NAMES, BIOME_NAMES };
