'use strict';
/* ============================================================
 * EMBER BRIGADE - main loop, camera, HUD, menus, mission flow
 * ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const wrapEl = document.getElementById('wrap');

function resize() {
  const ww = wrapEl.clientWidth, wh = wrapEl.clientHeight;
  if (!ww || !wh) return;
  const portrait = wh > ww * 1.15;
  const availH = portrait ? Math.min(wh * 0.5, ww * 0.72) : wh;
  let vw = clamp(Math.round((VIEW_H * ww) / availH), 256, 400);
  vw -= vw % 2;
  if (canvas.width !== vw || canvas.height !== VIEW_H) { VIEW_W = vw; canvas.width = vw; canvas.height = VIEW_H; }
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(ww / vw, availH / VIEW_H);
  const cw = Math.floor(vw * scale), ch = Math.floor(VIEW_H * scale);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.style.left = Math.floor((ww - cw) / 2) + 'px';
  canvas.style.top = (portrait ? 0 : Math.floor((wh - ch) / 2)) + 'px';
  document.body.classList.toggle('portrait', portrait);
}

/* ---------- persistent settings ---------- */
G.mode = store.get('mode', 'casual');
if (!DIFFS[G.mode]) G.mode = 'casual';
G.autoFire = store.get('auto', null);
G.unlocked = clamp(store.get('unlocked', 0) | 0, 0, LEVELS.length - 1);
G.best = store.get('best', 0) | 0;
G.bannerText = ''; G.bannerT = 0; G.hintText = ''; G.hintT = 0; G.goT = 0; G.introT = 0;
G.wx = []; G.wxKind = 'none'; G.wxCam = 0; G.warnSide = null; G.carry = null;
G.banner = (s) => { G.bannerText = s; G.bannerT = 90; };

/* ---------- mission flow ---------- */
function newGame(i) {
  G.diff = DIFFS[G.mode];
  G.score = 0; G.lives = G.diff.lives; G.carry = null;
  startLevel(i);
}
function findSafe(x) {
  const L = G.level;
  for (let k = 0; k < 40; k++) {
    const xx = x + k * TILE;
    const gy = L.groundBelow(xx, G.camY - 40);
    if (gy !== null && L.solid(Math.floor(xx / TILE), Math.floor(gy / TILE)) && L.get(Math.floor(xx / TILE), Math.floor(gy / TILE) - 1) !== 4) return [xx, gy];
  }
  return [x, L.h - 64];
}
function startLevel(i) {
  G.li = i;
  const L = (G.level = buildLevel(i));
  G.es = G.diff.es * (1 + i * 0.025);
  G.cdm = G.diff.cd * (1 - i * 0.025);
  G.enemies = []; G.pshots = []; G.eshots = []; G.pickups = []; G.parts = []; G.objs = []; G.markers = []; G.timers = [];
  G.camX = 0; G.lock = null; G.boss = null; G.bossT = 0; G.spawnI = 0; G.warnSide = null;
  G.rescued = 0; G.kills = 0; G.hits = 0; G.levelT = 0; G.cine = false; G.cineMove = 0; G.clearT = 0; G.shake = 0;
  G.arenaG = L.groundBelow((L.cols - 27) * TILE + 24, 0);
  const gy = L.groundBelow(40, 0);
  G.player = new Player(40, gy);
  if (G.carry) { G.player.weapon = G.carry.weapon; G.player.ammo = G.carry.ammo; G.player.gren = Math.max(G.carry.gren, G.diff.gren); }
  G.camY = G.camTY = clamp(gy - 132, 0, L.h - VIEW_H);
  for (const o of L.objs) {
    if (o.kind === 'coin' || o.kind === 'gem' || o.kind === 'star') spawnPickup(o.kind, o.x, o.y - 2, true);
    else addObj(o.kind, o.x, o.y, o.o);
  }
  initWeather(THEMES[L.theme].weather);
  G.introT = 160; G.bannerT = 0; G.hintT = 0; G.goT = 0;
  G.state = 'play';
  Snd.music(THEMES[L.theme].music);
}
function respawn(full) {
  const old = G.player;
  let sx = old.safeX, sy = old.safeY;
  if (sx < G.camX + 14) { const s = findSafe(G.camX + 24); sx = s[0]; sy = s[1]; }
  sx = Math.min(sx, G.camX + VIEW_W - 20);
  if (full) {
    const p = (G.player = new Player(sx, sy));
    p.safeX = sx; p.safeY = sy; p.inv = 170;
  } else {
    old.crouch = false; old.h = 22; old.x = sx - 5; old.y = sy - 22; old.vx = 0; old.vy = 0; old.inv = Math.max(old.inv, 120); old.kb = 0; old.ride = null;
  }
}
G.playerFell = function () {
  const p = G.player;
  if (G.god) { respawn(false); return; }
  Snd.play('hurt'); p.hp--; G.hits++; G.shake = 6;
  if (p.hp <= 0) { p.dead = 72; p.vx = 0; p.y = G.level.h + 80; Snd.play('die'); }
  else respawn(false);
};
function startBoss() {
  G.bossT = 1;
  Snd.music(null); Snd.play('warn');
  G.camTY = clamp(G.arenaG - 148, 0, G.level.h - VIEW_H);
}
function finishLevel() {
  const p = G.player;
  G.carry = { weapon: p.weapon, ammo: p.ammo, gren: p.gren };
  const secs = Math.floor(G.levelT / 60);
  G.tally = {
    base: G.score,
    pips: G.rescued * 1000,
    clean: G.hits === 0 ? 5000 : 0,
    time: Math.max(0, 3000 - secs * 10),
    secs, t: 0,
  };
  G.score += G.tally.pips + G.tally.clean + G.tally.time;
  if (G.score > G.best) { G.best = G.score; store.set('best', G.best); }
  if (G.li + 1 > G.unlocked && G.li + 1 < LEVELS.length) { G.unlocked = G.li + 1; store.set('unlocked', G.unlocked); }
  G.state = 'clear';
}

/* ---------- weather ---------- */
function initWeather(kind) {
  G.wx = []; G.wxKind = kind; G.wxCam = G.camX;
  const n = { dust: 24, rain: 56, snow: 46, embers: 24, spores: 20, wind: 14 }[kind] || 0;
  for (let i = 0; i < n; i++) G.wx.push({ x: Math.random() * 410, y: Math.random() * VIEW_H, s: Math.random() });
}
function updWeather() {
  const k = G.wxKind, dc = G.camX - G.wxCam;
  G.wxCam = G.camX;
  for (const w of G.wx) {
    let vx = 0, vy = 0;
    if (k === 'dust') { vx = -0.6 - w.s; vy = 0.1; }
    else if (k === 'rain') { vx = -1.2; vy = 4 + w.s * 2; }
    else if (k === 'snow') { vx = -0.3 - w.s * 0.5 + Math.sin(G.t * 0.03 + w.s * 9) * 0.3; vy = 0.5 + w.s * 0.6; }
    else if (k === 'embers') { vx = Math.sin(G.t * 0.04 + w.s * 9) * 0.4; vy = -0.5 - w.s * 0.6; }
    else if (k === 'spores') { vx = Math.sin(G.t * 0.02 + w.s * 9) * 0.25; vy = -0.12 - w.s * 0.1; }
    else if (k === 'wind') vx = -5 - w.s * 3;
    w.x += vx - dc * 0.6; w.y += vy;
    const W = VIEW_W + 10;
    if (w.x < -4) w.x += W; else if (w.x > W) w.x -= W;
    if (w.y < -4) w.y += VIEW_H + 4; else if (w.y > VIEW_H) w.y -= VIEW_H + 4;
  }
}
function drawWeather() {
  const k = G.wxKind;
  for (const w of G.wx) {
    const x = Math.round(w.x), y = Math.round(w.y);
    if (k === 'dust') { ctx.fillStyle = w.s > 0.5 ? '#f4dca0' : '#d8b070'; ctx.fillRect(x, y, w.s > 0.7 ? 2 : 1, 1); }
    else if (k === 'rain') { ctx.fillStyle = '#7f96d8'; ctx.fillRect(x, y, 1, 3); }
    else if (k === 'snow') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w.s > 0.75 ? 2 : 1, w.s > 0.75 ? 2 : 1); }
    else if (k === 'embers') { ctx.fillStyle = w.s > 0.5 ? PAL.O : PAL.Y; ctx.fillRect(x, y, 1, 1); }
    else if (k === 'spores') { ctx.fillStyle = w.s > 0.5 ? PAL.T : PAL.l; ctx.fillRect(x, y, 1, 1); }
    else if (k === 'wind') { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x, y, 5 + Math.floor(w.s * 6), 1); }
  }
}

/* ---------- play update ---------- */
function waveSpawn(en, lk) {
  const [type, side, , o] = en;
  const L = G.level, p = G.player, feet = p.y + p.h;
  const d = EDEF[type];
  if (!d) return;
  const opts = Object.assign({}, o || {});
  let x;
  if (side === 'r') x = G.camX + VIEW_W + 16;
  else if (side === 'l') x = G.camX - 16;
  else { x = G.camX + VIEW_W * (typeof side === 'number' ? side : rand(0.2, 0.8)); opts.drop = true; }
  let y;
  if (d.fly) { y = lk.gy; if (side === 't' || typeof side === 'number') { opts.h = opts.h || 70; } }
  else {
    y = L.groundBelow(x, G.camY);
    if (y === null || (side !== 'r' && side !== 'l' && false)) y = null;
    if (y === null) { x = clamp(x, G.camX + 20, G.camX + VIEW_W - 20); opts.drop = true; y = L.groundBelow(x, G.camY); if (y === null) y = feet; }
  }
  const e = spawnEnemy(type, x, y, opts);
  if (e) {
    e.locked = true;
    if (d.fly && (side === 't' || typeof side === 'number')) e.y = G.camY - 20;
    lk.alive.push(e);
  }
}
function updPlay() {
  const L = G.level, p = G.player;
  G.levelT++;
  if (G.shake > 0) G.shake -= 0.5;
  if (G.introT > 0) G.introT--;
  if (G.bannerT > 0) G.bannerT--;
  if (G.hintT > 0) G.hintT--;
  if (G.goT > 0) G.goT--;
  if (G.warnSide && --G.warnSide.t <= 0) G.warnSide = null;
  for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; if (--tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); } }
  for (let i = G.markers.length - 1; i >= 0; i--) if (--G.markers[i].t <= 0) G.markers.splice(i, 1);

  // props & hazards near the camera
  for (let i = G.objs.length - 1; i >= 0; i--) {
    const o = G.objs[i];
    if (o.dead) { G.objs.splice(i, 1); continue; }
    if (o.flash > 0) o.flash--;
    const def = ODEF[o.kind];
    if (def.update && o.x < G.camX + VIEW_W + 120 && o.x + o.w > G.camX - 120) def.update(o);
  }

  p.update();
  if (p.dead > 100) {
    G.lives--;
    if (G.lives > 0) respawn(true);
    else { G.state = 'gameover'; G.menu = MENUS.over; G.menu.sel = 0; Snd.music(null); Snd.jingle('over'); if (G.score > G.best) { G.best = G.score; store.set('best', G.best); } return; }
  }

  // level-placed enemies appear just ahead of the camera
  while (G.spawnI < L.spawns.length) {
    const s = L.spawns[G.spawnI];
    if (s.x > G.camX + VIEW_W + (s.o.drop ? -30 : 26)) break;
    spawnEnemy(s.type, s.x, s.y, s.o);
    G.spawnI++;
  }

  // camera locks ("arenas")
  const nextLock = L.locks.find((l) => l.state < 2);
  if (!G.lock && nextLock && G.camX >= nextLock.cx - VIEW_W / 2 - 0.5) {
    G.lock = nextLock; nextLock.state = 1; nextLock.wave = 0; nextLock.t = 0; nextLock.alive = [];
    nextLock.gy = L.groundBelow(nextLock.cx, 0);
  }
  if (G.lock) {
    const lk = G.lock, wave = lk.waves[lk.wave];
    lk.t++;
    let all = true;
    for (const en of wave) {
      if (en.spawned) continue;
      if (lk.t >= en[2] + 40) { en.spawned = true; waveSpawn(en, lk); } else all = false;
    }
    if (all && lk.alive.every((e) => e.dead)) {
      lk.wave++; lk.t = 0; lk.alive = [];
      if (lk.wave >= lk.waves.length) { lk.state = 2; G.lock = null; G.goT = 150; Snd.play('pick'); }
    }
  }

  for (const e of G.enemies.slice()) if (!e.dead) e.update();
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].dead) G.enemies.splice(i, 1);

  // boss
  const bossX = L.w - VIEW_W;
  if (!G.bossT && !G.lock && !nextLock && G.camX >= bossX - 0.5) startBoss();
  if (G.bossT > 0 && !G.boss && !G.clearT) {
    G.bossT++;
    if (G.bossT === 120) { G.boss = new Boss(L.boss); Snd.music('boss'); }
  }
  if (G.boss) {
    G.boss.update();
    if (G.boss.dead) {
      addScore(5000 + G.li * 1000);
      G.boss = null; G.clearT = 1; G.cine = true; G.cineMove = 0;
      Snd.music(null); Snd.jingle('clear');
    }
  }
  if (G.clearT > 0) {
    G.clearT++;
    if (G.clearT > 60 && G.clearT % 40 === 0 && p.onGround) p.vy = -3.4;
    if (G.clearT > 220) { finishLevel(); return; }
  }

  updatePShots(); updateEShots(); updatePickups(); updateParts(); updWeather();

  // tutorial signs
  for (const s of L.signs) if (!s.done && p.x > s.x - 30) { s.done = true; G.hintText = HINTS[s.key][Input.touchMode ? 1 : 0]; G.hintT = 260; }

  // auto-fire target check
  G.targets = false;
  if (G.autoFire) {
    if (G.boss && G.boss.vuln && !G.boss.dying) G.targets = true;
    else {
      for (const e of G.enemies) if (!e.dead && onScreen(e, -4)) { G.targets = true; break; }
      if (!G.targets) for (const o of G.objs) if (o.shoot && !o.dead && onScreen(o, -4) && Math.abs(o.y + o.h - (p.y + p.h)) < 40 && (o.x - p.x) * p.face > 0) { G.targets = true; break; }
    }
  }

  // camera
  let maxX = bossX;
  if (nextLock) maxX = Math.min(maxX, nextLock.cx - VIEW_W / 2);
  maxX = Math.max(0, maxX);
  const want = p.x + p.w / 2 - VIEW_W * 0.42;
  if (want > G.camX) G.camX += Math.min(want - G.camX, 4);
  G.camX = clamp(G.camX, 0, maxX);
  if (!G.bossT) {
    const feet = p.y + p.h;
    if (p.onGround && !p.dead) G.camTY = feet - 132;
    if (feet - G.camTY > 168) G.camTY = feet - 168;
    if (p.y - G.camTY < 20) G.camTY = p.y - 20;
    G.camTY = clamp(G.camTY, 0, L.h - VIEW_H);
  }
  G.camY += clamp((G.camTY - G.camY) * 0.14, -4, 4);
  if (Math.abs(G.camTY - G.camY) < 0.3) G.camY = G.camTY;
}

/* ---------- menus ---------- */
const onOff = (b) => (b ? 'ON' : 'OFF');
function toggleFullscreen() {
  try {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(() => {}); }
  } catch (e) { /* not available here */ }
}
const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
const optItems = () => [
  { label: () => 'AUTO FIRE: ' + onOff(G.autoFire), act() { G.autoFire = !G.autoFire; store.set('auto', G.autoFire); } },
  { label: () => 'MUSIC: ' + onOff(Snd.musOn), act() { Snd.setMusic(!Snd.musOn); } },
  { label: () => 'SOUND: ' + onOff(Snd.sfxOn), act() { Snd.setSfx(!Snd.sfxOn); } },
];
const MENUS = {
  title: {
    y0: 72, dy: 12, sel: 0,
    items: [
      { label: () => (G.unlocked > 0 ? 'CONTINUE: MISSION ' + (G.unlocked + 1) : 'START GAME'), act() { Snd.play('start'); newGame(G.unlocked); } },
      { label: 'MISSION SELECT', act() { G.state = 'select'; G.selI = G.unlocked; } },
      { label: () => 'MODE: ' + G.mode.toUpperCase(), act() { G.mode = G.mode === 'casual' ? 'classic' : 'casual'; store.set('mode', G.mode); } },
      ...optItems(),
    ].concat(canFullscreen ? [{ label: 'FULLSCREEN', act: toggleFullscreen }] : []),
  },
  pause: {
    y0: 62, dy: 13, sel: 0,
    items: [
      { label: 'RESUME', act() { G.state = 'play'; Snd.suspend(false); } },
      { label: 'RESTART MISSION', act() { Snd.suspend(false); G.carry = null; startLevel(G.li); } },
      ...optItems(),
      { label: 'QUIT TO TITLE', act() { Snd.suspend(false); toTitle(); } },
    ],
  },
  over: {
    y0: 96, dy: 14, sel: 0,
    items: [
      { label: 'RETRY MISSION', act() { Snd.play('start'); newGame(G.li); } },
      { label: 'QUIT TO TITLE', act() { toTitle(); } },
    ],
  },
};
function toTitle() { G.state = 'title'; G.menu = MENUS.title; Snd.music('title'); }
function runMenu(m, taps) {
  const n = m.items.length;
  if (Input.p.up) { m.sel = (m.sel + n - 1) % n; Snd.play('select'); }
  if (Input.p.down) { m.sel = (m.sel + 1) % n; Snd.play('select'); }
  let act = Input.p.ok || Input.p.jump || Input.p.fire;
  for (const t of taps) {
    const i = Math.floor((t.y - m.y0 + 3) / m.dy);
    if (i >= 0 && i < n && Math.abs(t.x - VIEW_W / 2) < 96) { m.sel = i; act = true; }
  }
  if (act) { Snd.play('select'); m.items[m.sel].act(); }
}
function drawMenu(m) {
  m.items.forEach((it, i) => {
    const y = m.y0 + i * m.dy, s = typeof it.label === 'function' ? it.label() : it.label, sel = i === m.sel;
    if (sel) {
      ctx.fillStyle = 'rgba(14,14,22,0.72)'; ctx.fillRect(VIEW_W / 2 - 92, y - 3, 184, m.dy);
      const w = textW(s) / 2 + 8 + ((G.t >> 3) & 1);
      drawText(ctx, '>', VIEW_W / 2 - w - 4, y, 'O'); drawText(ctx, '<', VIEW_W / 2 + w, y, 'O');
    }
    drawTextS(ctx, s, VIEW_W / 2, y, sel ? 'Y' : '5', 1, 1);
  });
}
const SEL = { cols: 5, bw: 44, bh: 36, gap: 6, y0: 46 };
function selRect(i) {
  const tw = SEL.cols * SEL.bw + (SEL.cols - 1) * SEL.gap, x0 = Math.round((VIEW_W - tw) / 2);
  return { x: x0 + (i % SEL.cols) * (SEL.bw + SEL.gap), y: SEL.y0 + Math.floor(i / SEL.cols) * (SEL.bh + SEL.gap), w: SEL.bw, h: SEL.bh };
}
function updSelect(taps) {
  let i = G.selI;
  if (Input.p.left) i = Math.max(0, i - 1);
  if (Input.p.right) i = Math.min(LEVELS.length - 1, i + 1);
  if (Input.p.up && i >= SEL.cols) i -= SEL.cols;
  if (Input.p.down && i < SEL.cols) i += SEL.cols;
  if (i !== G.selI) { G.selI = i; Snd.play('select'); }
  let go = Input.p.ok || Input.p.jump || Input.p.fire;
  for (const t of taps) {
    if (t.y > 150) { toTitle(); return; }
    for (let k = 0; k < LEVELS.length; k++) { const r = selRect(k); if (t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h) { G.selI = k; go = true; } }
  }
  if (Input.p.pause || Input.p.gren) { toTitle(); return; }
  if (go) {
    if (G.selI <= G.unlocked) { Snd.play('start'); newGame(G.selI); } else Snd.play('block');
  }
}

/* ---------- top-level update ---------- */
function update() {
  Input.poll();
  G.t++;
  const taps = Input.takeTaps();
  switch (G.state) {
    case 'title': runMenu(MENUS.title, taps); break;
    case 'select': updSelect(taps); break;
    case 'play':
      if (Input.p.pause && !G.cine) { G.state = 'pause'; G.menu = MENUS.pause; G.menu.sel = 0; Snd.play('select'); break; }
      updPlay();
      break;
    case 'pause':
      if (Input.p.pause) { G.state = 'play'; break; }
      runMenu(MENUS.pause, taps);
      break;
    case 'gameover': runMenu(MENUS.over, taps); break;
    case 'clear':
      G.tally.t++;
      if (G.tally.t > 50 && (Input.p.ok || Input.p.jump || Input.p.fire || taps.length)) {
        if (G.li + 1 < LEVELS.length) { Snd.play('start'); startLevel(G.li + 1); }
        else { G.state = 'ending'; G.endT = 0; Snd.music('title'); }
      }
      break;
    case 'ending':
      G.endT++;
      if (G.endT > 120 && (Input.p.ok || Input.p.jump || Input.p.fire || taps.length)) toTitle();
      break;
    default: break;
  }
  Input.setPlayUI(G.state === 'play');
}

/* ---------- rendering ---------- */
function drawBG(themeName, camX, camY, levelH) {
  const th = THEMES[themeName];
  ctx.drawImage(th.skyC, 0, 0);
  if (th.orb) {
    const ox = Math.round(VIEW_W * th.orb.x), oy = th.orb.y;
    pxCirc(ctx, ox, oy, th.orb.r + 3, th.orb.glow); pxCirc(ctx, ox, oy, th.orb.r, th.orb.c);
  }
  th.layers.forEach((l, i) => {
    const c = th.layerC[i];
    let off = Math.floor(camX * l.par + (l.auto ? G.t * l.auto : 0)) % BG_W;
    if (off < 0) off += BG_W;
    const yo = Math.round((levelH - VIEW_H - camY) * l.par * 0.3);
    for (let x = -off; x < VIEW_W; x += BG_W) ctx.drawImage(c, x, yo);
  });
}
function drawTiles() {
  const L = G.level, th = THEMES[L.theme];
  const x0 = Math.max(0, Math.floor(G.camX / TILE) - 1), x1 = Math.min(L.cols - 1, Math.floor((G.camX + VIEW_W) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(G.camY / TILE)), y1 = Math.min(L.rows - 1, Math.floor((G.camY + VIEW_H) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = L.tiles[ty * L.cols + tx];
      if (!t) continue;
      const px = tx * TILE, py = ty * TILE, v = (tx * 7 + ty * 13) & 3;
      if (t === 1) {
        const top = !solidT(L.get(tx, ty - 1));
        ctx.drawImage(top ? th.topT[v] : th.fillT[v], px, py);
        if (!solidT(L.get(tx - 1, ty))) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py + (top ? 1 : 0), 1, TILE); }
        if (!solidT(L.get(tx + 1, ty))) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + 15, py + (top ? 1 : 0), 1, TILE); }
      } else if (t === 2) ctx.drawImage(th.platT, px, py);
      else if (t === 3) ctx.drawImage(L.get(tx, ty - 1) !== 3 ? th.liqTop[(G.t >> 4) & 1] : th.liqT, px, py);
      else if (t === 4) ctx.drawImage(th.spikeT, px, py);
      else if (t === 5) ctx.drawImage(th.beltT[(G.t >> 2) & 3], px, py);
      else if (t === 6) ctx.drawImage(th.beltT[3 - ((G.t >> 2) & 3)], px, py);
      else if (t === 7) ctx.drawImage(th.backT, px, py);
    }
  }
}
function drawHUD() {
  const p = G.player;
  drawSpr(ctx, SPR.heroHead, 3, 2);
  drawTextS(ctx, 'x' + Math.max(0, G.lives - 1), 17, 4, '6');
  for (let i = 0; i < G.diff.hp; i++) drawSpr(ctx, i < p.hp ? SPR.heart : SPR.heartEmpty, 34 + i * 10, 3);
  const W = WEAPONS[p.weapon];
  if (p.weapon) { drawSpr(ctx, SPR[W.icon], 3, 14); drawTextS(ctx, String(p.ammo), 19, 17, 'Y'); }
  else drawTextS(ctx, 'BLASTER', 3, 17, '4');
  drawSpr(ctx, SPR.bomb, 50, 14); drawTextS(ctx, String(p.gren), 61, 17, '6');
  const rx = VIEW_W - 3 - (Input.touchMode ? 26 : 0);
  drawTextS(ctx, String(G.score).padStart(7, '0'), rx, 4, '6', 1, 2);
  drawSpr(ctx, SPR.pip[0], rx - 26, 12); drawTextS(ctx, 'x' + G.rescued, rx, 16, 'y', 1, 2);
  if (G.boss && !G.boss.dying) {
    const w = Math.min(130, VIEW_W - 150), x = Math.round((VIEW_W - w) / 2), b = G.boss;
    ctx.fillStyle = PAL['0']; ctx.fillRect(x - 1, 27, w + 2, 6);
    ctx.fillStyle = PAL.m; ctx.fillRect(x, 28, w, 4);
    ctx.fillStyle = b.hp < b.maxhp * 0.5 ? PAL.O : PAL.R; ctx.fillRect(x, 28, Math.ceil((w * b.hp) / b.maxhp), 4);
    ctx.fillStyle = PAL.k; ctx.fillRect(x, 28, Math.ceil((w * b.hp) / b.maxhp), 1);
    drawTextS(ctx, b.name, VIEW_W / 2, 36, '5', 1, 1);
  }
  if (G.state !== 'play') return;
  if (G.hintT > 0) {
    const w = textW(G.hintText) + 12, x = Math.round((VIEW_W - w) / 2);
    ctx.fillStyle = 'rgba(14,14,22,0.75)'; ctx.fillRect(x, 30, w, 13);
    drawText(ctx, G.hintText, VIEW_W / 2, 33, G.hintT < 30 ? '4' : 'Y', 1, 1);
  }
  if (G.bannerT > 0 && (G.bannerT > 20 || (G.t >> 1) & 1)) drawTextO(ctx, G.bannerText, VIEW_W / 2, 50, 'Y', 1, 1);
  if (G.introT > 0) {
    const a = G.introT > 130 ? (160 - G.introT) / 30 : G.introT < 20 ? G.introT / 20 : 1;
    ctx.fillStyle = 'rgba(14,14,22,' + (0.6 * a).toFixed(2) + ')'; ctx.fillRect(0, 62, VIEW_W, 44);
    if (a > 0.5) {
      drawTextO(ctx, 'MISSION ' + (G.li + 1), VIEW_W / 2, 67, 'O', 2, 1);
      drawTextS(ctx, G.level.name, VIEW_W / 2, 86, '6', 1, 1);
      drawTextS(ctx, G.level.sub, VIEW_W / 2, 96, '4', 1, 1);
    }
  }
  if (G.goT > 0 && (G.t >> 3) & 1) drawTextO(ctx, 'GO >', VIEW_W - 34, 70, 'Y', 2, 1);
  if (G.bossT > 0 && G.bossT < 120) {
    if ((G.bossT >> 3) & 1) drawTextO(ctx, 'WARNING', VIEW_W / 2, 64, 'R', 3, 1);
    drawTextS(ctx, BDEF[G.level.boss].name + ' APPROACHING', VIEW_W / 2, 92, '6', 1, 1);
  }
  if (G.clearT > 30) drawTextO(ctx, 'MISSION COMPLETE', VIEW_W / 2, 66, 'Y', 2, 1);
  if (G.warnSide && (G.t >> 2) & 1) {
    const wx = G.warnSide.dir > 0 ? VIEW_W - 14 : 14, wy = Math.round(G.warnSide.y - G.camY);
    pxCirc(ctx, wx, wy, 8, '0'); pxCirc(ctx, wx, wy, 7, 'R'); drawText(ctx, '!', wx - 2, wy - 3, '6');
  }
}
function drawScene() {
  const L = G.level;
  drawBG(L.theme, G.camX, G.camY, L.h);
  const k = G.shake > 0 ? Math.min(3, Math.ceil(G.shake / 3)) : 0;
  ctx.save();
  ctx.translate(-Math.round(G.camX) + (k ? randi(-k, k) : 0), -Math.round(G.camY) + (k ? randi(-k, k) : 0));
  for (const d of L.decos) {
    if (d.x < G.camX - 40 || d.x > G.camX + VIEW_W + 40) continue;
    const s = decoSpr(d.name);
    drawSpr(ctx, s, d.x - s.w / 2, d.y - s.h);
  }
  drawTiles();
  for (const o of G.objs) if (o.x < G.camX + VIEW_W + 40 && o.x + o.w > G.camX - 40) ODEF[o.kind].draw(o, ctx);
  drawPickups(ctx);
  for (const e of G.enemies) e.draw(ctx);
  if (G.boss) G.boss.draw(ctx);
  G.player.draw(ctx);
  drawPShots(ctx); drawEShots(ctx); drawParts(ctx);
  for (const m of G.markers) {
    if ((m.t >> 2) & 1) continue;
    const x = Math.round(m.x), y = Math.round(m.y);
    ctx.fillStyle = PAL.R;
    for (let j = 0; j < 4; j++) ctx.fillRect(x - 3 + j, y - 9 + j, 7 - j * 2, 1);
    for (let j = 14; j < 46; j += 5) ctx.fillRect(x, y - j, 1, 2);
  }
  ctx.restore();
  drawWeather();
  drawHUD();
}
function dim(a) { ctx.fillStyle = 'rgba(14,14,22,' + a + ')'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
function drawLogo(y) {
  const cx = VIEW_W / 2;
  drawTextO(ctx, 'EMBER', cx, y, 'O', 4, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(0, y, VIEW_W, 13); ctx.clip();
  drawText(ctx, 'EMBER', cx, y, 'Y', 4, 1); ctx.restore();
  drawTextO(ctx, 'BRIGADE', cx, y + 33, 'c', 2, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(0, y + 33, VIEW_W, 6); ctx.clip();
  drawText(ctx, 'BRIGADE', cx, y + 33, '6', 2, 1); ctx.restore();
}
function drawTitleBG() {
  drawBG('harbor', G.t * 0.4, 0, VIEW_H);
  ctx.fillStyle = '#1b1426'; ctx.fillRect(0, 160, VIEW_W, 20);
  ctx.fillStyle = '#3a2648'; ctx.fillRect(0, 160, VIEW_W, 1);
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const s = G.state;
  if (s === 'title') {
    drawTitleBG();
    const hx = 26, hy = 136;
    drawSpr(ctx, SPR.legsRun[(G.t >> 3) & 3], hx, hy + 17); drawSpr(ctx, SPR.heroUp, hx, hy + (((G.t >> 3) & 1)));
    pxLine(ctx, hx + 11, hy + 12, hx + 22, hy + 12, '0', 4); pxLine(ctx, hx + 11, hy + 12, hx + 21, hy + 12, '3', 2);
    drawSprBC(ctx, SPR.pip[(G.t >> 4) & 1], hx - 10, 160, false);
    dim(0.25);
    drawLogo(12);
    drawMenu(MENUS.title);
    drawTextS(ctx, 'BEST ' + String(G.best).padStart(7, '0'), VIEW_W / 2, 164, '4', 1, 1);
  } else if (s === 'select') {
    drawTitleBG(); dim(0.55);
    drawTextO(ctx, 'MISSION SELECT', VIEW_W / 2, 14, 'Y', 2, 1);
    for (let i = 0; i < LEVELS.length; i++) {
      const r = selRect(i), open = i <= G.unlocked, sel = i === G.selI;
      ctx.fillStyle = PAL['0']; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
      ctx.fillStyle = sel ? PAL.O : open ? PAL['3'] : PAL['1']; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = open ? PAL['2'] : PAL['0']; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      drawTextS(ctx, String(i + 1), r.x + r.w / 2, r.y + 8, open ? (sel ? 'Y' : '6') : '2', 2, 1);
      if (!open) drawText(ctx, 'LOCKED', r.x + r.w / 2, r.y + 26, '3', 1, 1);
    }
    const L = LEVELS[G.selI];
    drawTextS(ctx, L.name, VIEW_W / 2, 132, G.selI <= G.unlocked ? '6' : '3', 1, 1);
    drawTextS(ctx, G.selI <= G.unlocked ? L.sub : 'CLEAR THE PREVIOUS MISSION FIRST', VIEW_W / 2, 143, '4', 1, 1);
    drawTextS(ctx, Input.touchMode ? 'TAP HERE TO GO BACK' : 'ENTER: START   ESC: BACK', VIEW_W / 2, 164, 'O', 1, 1);
  } else if (s === 'ending') {
    drawBG('carrier', G.t * 0.3, 0, VIEW_H); dim(0.45);
    const lines = ['THE OVERSEER IS SCRAP.', 'THE LEGION FALLS SILENT.', '', 'KIT AND THE PIPS HEAD HOME.'];
    drawTextO(ctx, 'VICTORY', VIEW_W / 2, 18, 'Y', 3, 1);
    lines.forEach((ln, i) => { if (G.endT > 30 + i * 30) drawTextS(ctx, ln, VIEW_W / 2, 56 + i * 12, '6', 1, 1); });
    drawSpr(ctx, SPR.heroFull, VIEW_W / 2 - 22, 112 - Math.abs(Math.sin(G.t * 0.1)) * 6);
    drawSpr(ctx, SPR.pip[(G.t >> 3) & 1], VIEW_W / 2 + 4, 124 - Math.abs(Math.sin(G.t * 0.1 + 1)) * 5);
    drawSpr(ctx, SPR.pip[(G.t >> 3) & 1 ^ 1], VIEW_W / 2 + 18, 124 - Math.abs(Math.sin(G.t * 0.1 + 2)) * 5);
    drawTextS(ctx, 'FINAL SCORE ' + String(G.score).padStart(7, '0'), VIEW_W / 2, 146, 'Y', 1, 1);
    if (G.endT > 120 && (G.t >> 4) & 1) drawTextS(ctx, Input.touchMode ? 'TAP TO CONTINUE' : 'PRESS ENTER', VIEW_W / 2, 162, '5', 1, 1);
  } else {
    drawScene();
    if (s === 'pause') { dim(0.6); drawTextO(ctx, 'PAUSED', VIEW_W / 2, 30, 'Y', 2, 1); drawMenu(MENUS.pause); }
    else if (s === 'gameover') {
      dim(0.65);
      drawTextO(ctx, 'GAME OVER', VIEW_W / 2, 44, 'R', 3, 1);
      drawTextS(ctx, 'SCORE ' + String(G.score).padStart(7, '0'), VIEW_W / 2, 76, '6', 1, 1);
      drawMenu(MENUS.over);
    } else if (s === 'clear') {
      dim(0.7);
      const T = G.tally, cx = VIEW_W / 2;
      drawTextO(ctx, 'MISSION ' + (G.li + 1) + ' CLEAR', cx, 22, 'Y', 2, 1);
      const rows = [['SCORE', T.base], ['PIPS RESCUED x' + G.rescued, T.pips], ['TIME ' + Math.floor(T.secs / 60) + ':' + String(T.secs % 60).padStart(2, '0'), T.time], ['NO DAMAGE', T.clean]];
      rows.forEach((r, i) => {
        if (T.t < 12 + i * 10) return;
        drawTextS(ctx, r[0], cx - 86, 56 + i * 13, '5'); drawTextS(ctx, String(r[1]), cx + 86, 56 + i * 13, r[1] ? '6' : '3', 1, 2);
      });
      if (T.t > 52) {
        ctx.fillStyle = PAL['4']; ctx.fillRect(cx - 86, 110, 172, 1);
        drawTextS(ctx, 'TOTAL', cx - 86, 116, 'Y'); drawTextS(ctx, String(G.score), cx + 86, 116, 'Y', 1, 2);
        if ((G.t >> 4) & 1) drawTextS(ctx, G.li + 1 < LEVELS.length ? (Input.touchMode ? 'TAP FOR NEXT MISSION' : 'ENTER: NEXT MISSION') : (Input.touchMode ? 'TAP TO CONTINUE' : 'PRESS ENTER'), cx, 146, 'O', 1, 1);
      }
    }
  }
}

/* ---------- boot ---------- */
let lastT = 0, acc = 0;
const STEP = 1000 / 60;
function frame(t) {
  requestAnimationFrame(frame);
  let dt = t - lastT; lastT = t;
  if (dt > 120) dt = 120;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) { update(); acc -= STEP; n++; }
  if (n === 4) acc = 0;
  render();
}
function boot() {
  buildSprites(); buildBossSprites();
  buildTheme('harbor'); buildTheme('carrier');
  Input.init(canvas);
  if (G.autoFire === null) G.autoFire = Input.touchMode;
  G.diff = DIFFS[G.mode];
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(wrapEl);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.state === 'play' && !G.cine) { G.state = 'pause'; G.menu = MENUS.pause; G.menu.sel = 0; } Snd.suspend(true); }
    else Snd.suspend(false);
  });
  toTitle();
  // optional debug entry points: ?level=3&god=1
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('god')) G.god = true;
    if (q.get('level')) { G.unlocked = LEVELS.length - 1; newGame(clamp((q.get('level') | 0) - 1, 0, LEVELS.length - 1)); }
  } catch (e) { /* no query access */ }
  requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
}
boot();
