'use strict';
/* ============================================================
 * EMBER BRIGADE - world state, physics, player, shots, enemies, props
 * ============================================================ */

const DIFFS = {
  casual: { hp: 6, lives: 5, gren: 10, es: 0.85, cd: 1.3, bhp: 0.8, inv: 130 },
  classic: { hp: 3, lives: 3, gren: 8, es: 1, cd: 1, bhp: 1, inv: 100 },
};
const WEAPONS = [
  { name: 'BLASTER', len: 7, th: 2, c1: '3', c2: '5', ammo: 0 },
  { name: 'REPEATER', len: 9, th: 2, c1: '2', c2: 'y', ammo: 150, icon: 'w1' },
  { name: 'SCATTER', len: 7, th: 3, c1: 'n', c2: 'O', ammo: 30, icon: 'w2' },
  { name: 'BURNER', len: 8, th: 3, c1: 'r', c2: 'O', ammo: 140, icon: 'w3' },
  { name: 'LAUNCHER', len: 9, th: 3, c1: 'g', c2: 'l', ammo: 16, icon: 'w4' },
  { name: 'LANCER', len: 10, th: 2, c1: 'b', c2: 'c', ammo: 40, icon: 'w5' },
];

// shared mutable game state
const G = {
  state: 'title', t: 0, level: null, li: 0, player: null, boss: null,
  enemies: [], pshots: [], eshots: [], pickups: [], parts: [], objs: [], markers: [], timers: [],
  camX: 0, camY: 0, shake: 0, score: 0, lives: 3, rescued: 0, kills: 0, hits: 0,
  mode: 'casual', diff: DIFFS.casual, autoFire: false, es: 1, cdm: 1,
  lock: null, cine: false, god: false,
};

/* ---------- tile physics ---------- */
function boxSolid(x, y, w, h) {
  const L = G.level;
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty)) return true;
  return false;
}
function moveEnt(e) {
  const L = G.level;
  e.hitWall = 0;
  if (e.vx) {
    e.x += e.vx;
    const tx = Math.floor((e.vx > 0 ? e.x + e.w - 0.001 : e.x) / TILE);
    const ty0 = Math.floor(e.y / TILE), ty1 = Math.floor((e.y + e.h - 0.001) / TILE);
    let blocked = false, onlyFoot = true;
    for (let ty = ty0; ty <= ty1; ty++) if (L.solid(tx, ty)) { blocked = true; if (ty !== ty1) onlyFoot = false; }
    if (blocked) {
      let stepped = false;
      if (onlyFoot && e.step && e.onGround) { // walk up single-tile ledges
        const ny = ty1 * TILE - e.h;
        if (!boxSolid(e.x, ny, e.w, e.h)) { e.stepVis = (e.stepVis || 0) + (e.y - ny); e.y = ny; stepped = true; }
      }
      if (!stepped) { e.x = e.vx > 0 ? tx * TILE - e.w : (tx + 1) * TILE; e.hitWall = e.vx > 0 ? 1 : -1; }
    }
  }
  e.y += e.vy;
  e.onGround = false; e.onOneWay = false; e.hitCeil = false;
  const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 0.001) / TILE);
  if (e.vy >= 0) {
    const ty = Math.floor((e.y + e.h) / TILE);
    const prevBottom = e.y + e.h - e.vy;
    let solid = false, one = false;
    for (let tx = x0; tx <= x1; tx++) {
      const t = L.get(tx, ty);
      if (solidT(t)) solid = true;
      else if (t === 2 && !(e.drop > 0) && prevBottom <= ty * TILE + 0.01) one = true;
    }
    if (solid || one) { e.y = ty * TILE - e.h; e.vy = 0; e.onGround = true; e.onOneWay = !solid; }
  } else {
    const ty = Math.floor(e.y / TILE);
    for (let tx = x0; tx <= x1; tx++) if (L.solid(tx, ty)) { e.y = (ty + 1) * TILE; e.vy = 0; e.hitCeil = true; break; }
  }
}
const onScreen = (e, m = 8) => e.x + e.w > G.camX - m && e.x < G.camX + VIEW_W + m && e.y + e.h > G.camY - 30 && e.y < G.camY + VIEW_H + 30;

/* ---------- particles ---------- */
function part(type, x, y, vx, vy, life, c, s, g) {
  if (G.parts.length > 420) return;
  G.parts.push({ type, x, y, vx, vy, life, max: life, c, s: s || 1, g: g || 0 });
}
function spark(x, y, c) {
  for (let i = 0; i < 4; i++) part('px', x, y, rand(-1.6, 1.6), rand(-1.8, 0.6), randi(6, 12), c || choose(['Y', '6', 'O']), 1, 0.08);
}
function boom(x, y, r) {
  const n = 3 + Math.floor(r / 5);
  for (let i = 0; i < n; i++) part('fire', x + rand(-r / 2, r / 2), y + rand(-r / 2, r / 2), rand(-0.3, 0.3), rand(-0.7, 0), randi(14, 26), null, rand(r * 0.35, r * 0.75));
  for (let i = 0; i < 6; i++) part('px', x, y, rand(-2.6, 2.6), rand(-3, 0.5), randi(14, 28), choose(['Y', 'O', '6']), 1, 0.12);
  part('ring', x, y, 0, 0, 10, '6', r);
  G.shake = Math.max(G.shake, Math.min(10, r / 4));
}
function debris(x, y, cols, n = 6) {
  for (let i = 0; i < n; i++) part('px', x, y, rand(-2, 2), rand(-3.2, -0.6), randi(22, 40), choose(cols), 2, 0.16);
}
function updateParts() {
  const a = G.parts;
  for (let i = a.length - 1; i >= 0; i--) {
    const p = a[i];
    p.vy += p.g; p.x += p.vx; p.y += p.vy;
    if (--p.life <= 0) { a[i] = a[a.length - 1]; a.pop(); }
  }
}
function drawParts(ctx) {
  for (const p of G.parts) {
    const k = p.life / p.max;
    if (p.type === 'px') { ctx.fillStyle = col(p.c); const s = k < 0.3 ? 1 : p.s; ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s); }
    else if (p.type === 'fire') pxCirc(ctx, p.x, p.y, p.s * (0.35 + k * 0.65), k > 0.75 ? '6' : k > 0.5 ? 'Y' : k > 0.3 ? 'O' : k > 0.14 ? 'R' : '2');
    else if (p.type === 'smoke') pxCirc(ctx, p.x, p.y, p.s * (1.3 - k * 0.6), k > 0.5 ? '4' : '3');
    else if (p.type === 'ring') {
      const r = p.s * (1.25 - k), n = 18;
      ctx.fillStyle = col(p.c);
      for (let i = 0; i < n; i++) ctx.fillRect(Math.round(p.x + Math.cos((i / n) * 6.283) * r), Math.round(p.y + Math.sin((i / n) * 6.283) * r), 1, 1);
    } else if (p.type === 'txt') drawTextS(ctx, p.c, p.x, p.y, k < 0.3 ? '5' : 'Y', 1, 1);
  }
}

/* ---------- score / damage helpers ---------- */
function addScore(n, x, y) {
  G.score += n;
  if (x !== undefined) part('txt', x, y - 4, 0, -0.4, 40, String(n));
}
function hurtPlayer(dmg, fromX, force) {
  const p = G.player;
  if (!p || p.dead || G.state !== 'play' || G.cine || G.god) return;
  if (p.inv > 0 && !force) return;
  p.hp -= dmg; p.inv = G.diff.inv; p.kb = 12;
  p.vx = (p.x + p.w / 2 >= fromX ? 1 : -1) * 1.5; p.vy = -2.4;
  G.shake = Math.max(G.shake, 6); G.hits++;
  Snd.play('hurt');
  if (p.hp <= 0) { p.dead = 1; p.vy = -3.6; Snd.play('die'); }
}
function boxDist(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
// owner 'p' hurts the Legion, owner 'e' hurts the player
function blast(x, y, r, dmg, owner) {
  if (owner === 'p') {
    for (const e of G.enemies.slice()) if (!e.dead && boxDist(x, y, e) < r) e.hurt(dmg, true);
    if (G.boss && !G.boss.dying) { for (const b of G.boss.boxes()) if (boxDist(x, y, b) < r) { G.boss.hurt(dmg); break; } }
    for (const o of G.objs) if (o.shoot && !o.dead && boxDist(x, y, o) < r) objHurt(o, dmg);
  } else if (G.player && boxDist(x, y, G.player) < r) hurtPlayer(dmg, x);
}

/* ---------- player ---------- */
class Player {
  constructor(x, y) {
    this.w = 10; this.h = 22; this.x = x - 5; this.y = y - 22;
    this.vx = 0; this.vy = 0; this.face = 1; this.ax = 1; this.ay = 0;
    this.onGround = false; this.crouch = false; this.step = true;
    this.hp = G.diff.hp; this.inv = 90; this.weapon = 0; this.ammo = 0; this.gren = G.diff.gren;
    this.fireCd = 0; this.grenCd = 0; this.dead = 0; this.anim = 0; this.coyote = 0; this.jbuf = 0;
    this.drop = 0; this.stepVis = 0; this.kb = 0; this.muzzle = 0; this.ride = null;
    this.safeX = x; this.safeY = y;
  }
  setCrouch(on) {
    if (on === this.crouch) return;
    if (on) { this.crouch = true; this.y += 10; this.h = 12; }
    else if (!boxSolid(this.x, this.y - 10, this.w, 22)) { this.crouch = false; this.y -= 10; this.h = 22; }
  }
  update() {
    const I = Input, L = G.level;
    if (this.dead) {
      this.dead++; this.vx *= 0.96; this.vy = Math.min(this.vy + 0.2, 5);
      moveEnt(this);
      if (this.onGround) this.vx = 0;
      return;
    }
    if (this.inv > 0) this.inv--;
    if (this.muzzle > 0) this.muzzle--;
    this.stepVis *= 0.7;
    let mv = 0;
    const ctl = !G.cine;
    if (this.kb > 0) this.kb--;
    else {
      mv = ctl ? (I.right ? 1 : 0) - (I.left ? 1 : 0) : (G.cineMove || 0);
      this.setCrouch(ctl && I.down && this.onGround);
      if (mv) this.face = mv;
      this.vx = this.crouch ? 0 : mv * 1.6;
      if (ctl && I.up) { this.ay = -1; this.ax = mv ? this.face : 0; }
      else if (ctl && I.down && !this.onGround) { this.ay = 1; this.ax = mv ? this.face : 0; }
      else { this.ay = 0; this.ax = this.face; }
      if (ctl && I.p.jump) this.jbuf = 7;
      if (this.jbuf > 0) {
        this.jbuf--;
        if (this.onGround || this.coyote > 0) {
          if (this.crouch && this.onOneWay) { this.drop = 12; this.onGround = false; }
          else { this.vy = -4.7; Snd.play('jump'); }
          this.jbuf = 0; this.coyote = 0; this.ride = null;
        }
      }
      if (ctl && !I.jump && this.vy < -1.6) this.vy = -1.6;
    }
    // conveyor belts
    if (this.onGround) {
      const t = L.get(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h + 1) / TILE));
      if (t === 5) this.vx += 0.7; else if (t === 6) this.vx -= 0.7;
    }
    if (this.ride && !this.ride.dead) { this.x += this.ride.dx; this.y += this.ride.dy; }
    const wasGround = this.onGround;
    this.vy = Math.min(this.vy + 0.22, 5);
    if (this.drop > 0) this.drop--;
    moveEnt(this);
    // moving platforms
    this.ride = null;
    if (this.vy >= 0 && !(this.drop > 0)) {
      for (const o of G.objs) {
        if (!o.plat || this.x + this.w <= o.x || this.x >= o.x + o.w) continue;
        const feet = this.y + this.h;
        if (feet >= o.y - 1 && feet <= o.y + 7 && feet - this.vy <= o.y + 3 + Math.abs(o.dy)) {
          this.y = o.y - this.h; this.vy = 0; this.onGround = true; this.onOneWay = false; this.ride = o;
        }
      }
    }
    if (this.onGround) this.coyote = 7; else if (this.coyote > 0) this.coyote--;
    if (this.onGround && !wasGround) part('px', this.x + this.w / 2, this.y + this.h, rand(-0.6, 0.6), -0.4, 10, '5', 1);
    // stay on screen
    if (this.x < G.camX) this.x = G.camX;
    if (this.x + this.w > G.camX + VIEW_W) this.x = G.camX + VIEW_W - this.w;
    if (this.onGround && Math.abs(this.vx) > 0.2) this.anim++; else this.anim = 0;
    // remember safe footing for pit recovery
    if (this.onGround && !this.ride && !this.onOneWay) {
      const tx = Math.floor((this.x + this.w / 2) / TILE), ty = Math.floor((this.y + this.h + 1) / TILE);
      if (L.solid(tx, ty) && L.solid(tx - 1, ty) && L.solid(tx + 1, ty) && L.get(tx, ty - 1) !== 4) { this.safeX = this.x + this.w / 2; this.safeY = this.y + this.h; }
    }
    // hazards
    const ctx2 = Math.floor((this.x + this.w / 2) / TILE), fty = Math.floor((this.y + this.h - 1) / TILE);
    const ft = L.get(ctx2, fty);
    if (ft === 4) { hurtPlayer(1, this.x + this.w / 2 - this.face); if (!this.dead) this.vy = -3; }
    if (ft === 3 || this.y > L.h + 30) { G.playerFell(); return; }
    // weapons
    if (this.fireCd > 0) this.fireCd--;
    if (this.grenCd > 0) this.grenCd--;
    if (ctl) {
      if (I.p.fire && this.weapon === 0 && this.fireCd > 3) this.fireCd = 3;
      if ((I.fire || (G.autoFire && G.targets)) && this.fireCd <= 0) this.shoot();
      if (I.p.gren && this.gren > 0 && this.grenCd <= 0) {
        this.gren--; this.grenCd = 22;
        const up = this.ay < 0;
        pshot('gr', this.x + this.w / 2 + this.face * 4, this.y + 4, this.face * (up ? 1.2 : 2.4) + this.vx * 0.5, up ? -4.3 : -3.2);
        Snd.play('gren');
      }
    }
  }
  shoulder() { return [this.x + this.w / 2 + this.face, this.y + (this.crouch ? 5 : 11)]; }
  aimDir() { const n = Math.hypot(this.ax, this.ay) || 1; return [this.ax / n, this.ay / n]; }
  shoot() {
    const [sx, sy] = this.shoulder(), [dx, dy] = this.aimDir();
    const W = WEAPONS[this.weapon];
    const mx = sx + dx * (5 + W.len), my = sy + dy * (5 + W.len);
    const rot = (a, sp) => [(dx * Math.cos(a) - dy * Math.sin(a)) * sp, (dy * Math.cos(a) + dx * Math.sin(a)) * sp];
    switch (this.weapon) {
      case 0: pshot('bl', mx, my, dx * 5.5, dy * 5.5); this.fireCd = 9; Snd.play('shot'); break;
      case 1: { const v = rot(rand(-0.05, 0.05), 6.5); pshot('mg', mx, my, v[0], v[1]); this.fireCd = 4; Snd.play('mg'); break; }
      case 2: for (let i = -2; i <= 2; i++) { const v = rot(i * 0.13 + rand(-0.03, 0.03), 5.2); pshot('sc', mx, my, v[0], v[1]); } this.fireCd = 24; Snd.play('scatter'); break;
      case 3: { const v = rot(rand(-0.12, 0.12), 3.1); pshot('fl', mx, my, v[0] + this.vx * 0.5, v[1]); this.fireCd = 3; Snd.play('flame'); break; }
      case 4: pshot('rk', mx, my, dx * 2.2, dy * 2.2); this.fireCd = 30; Snd.play('rocket'); break;
      default: pshot('lz', mx, my, dx * 8, dy * 8); this.fireCd = 11; Snd.play('laser'); break;
    }
    this.muzzle = this.weapon === 3 ? 0 : 4;
    if (this.weapon && --this.ammo <= 0) { this.weapon = 0; this.ammo = 0; }
  }
  giveWeapon(n) {
    if (this.weapon === n) this.ammo += WEAPONS[n].ammo; else { this.weapon = n; this.ammo = WEAPONS[n].ammo; }
    this.fireCd = 0;
  }
  draw(ctx) {
    if (this.inv > 0 && !this.dead && (G.t >> 1) & 1) return;
    const cx = Math.round(this.x + this.w / 2), by = Math.round(this.y + this.h + this.stepVis), f = this.face < 0;
    if (this.dead) {
      if (this.dead > 60 && (G.t >> 1) & 1) return;
      ctx.save(); ctx.translate(cx, by - 8);
      ctx.rotate(-this.face * (Math.min(this.dead, 20) / 20) * Math.PI / 2);
      drawSpr(ctx, SPR.heroFull, -10, -16, f); ctx.restore();
      return;
    }
    let legs = SPR.legsIdle, uy = 0;
    if (this.crouch) { legs = SPR.legsCrouch; uy = 7; }
    else if (!this.onGround) legs = SPR.legsJump;
    else if (Math.abs(this.vx) > 0.2) { const fr = Math.floor(this.anim / 5) % 4; legs = SPR.legsRun[fr]; uy = fr % 2; }
    const x0 = cx - 10, y0 = by - 24;
    drawSpr(ctx, legs, x0, y0 + 17, f);
    drawSpr(ctx, SPR.heroUp, x0, y0 + uy, f);
    // arm + weapon
    const sx = cx + this.face, sy = y0 + uy + 12, [dx, dy] = this.aimDir(), W = WEAPONS[this.weapon];
    const hx = sx + dx * 4, hy = sy + dy * 4, tx = sx + dx * (4 + W.len), ty = sy + dy * (4 + W.len);
    pxLine(ctx, sx, sy, tx, ty, '0', W.th + 2);
    pxLine(ctx, sx, sy, hx, hy, 'T', 2);
    pxLine(ctx, hx, hy, tx, ty, W.c1, W.th);
    pxLine(ctx, hx + (dy && !dx ? -1 : 0), hy + (dx ? -1 : 0), tx + (dy && !dx ? -1 : 0), ty + (dx ? -1 : 0), W.c2, 1);
    ctx.fillStyle = PAL['2']; ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
    if (this.muzzle > 0) pxCirc(ctx, tx + dx * 3, ty + dy * 3, this.muzzle > 2 ? 3 : 2, this.muzzle > 2 ? '6' : 'Y');
  }
}

/* ---------- player shots ---------- */
const PSHOT = {
  bl: { life: 70, dmg: 1, r: 2 }, mg: { life: 60, dmg: 1, r: 2 }, sc: { life: 15, dmg: 1, r: 2 },
  fl: { life: 20, dmg: 0.7, r: 4, pierce: true }, rk: { life: 120, dmg: 5, r: 3 },
  lz: { life: 50, dmg: 2.5, r: 3, pierce: true }, gr: { life: 220, dmg: 0, r: 3 },
};
function pshot(kind, x, y, vx, vy) {
  const d = PSHOT[kind];
  G.pshots.push({ kind, x, y, vx, vy, life: d.life, dmg: d.dmg, r: d.r, pierce: !!d.pierce, hit: d.pierce ? [] : null, t: 0 });
}
const shotHits = (s, b) => s.x + s.r > b.x && s.x - s.r < b.x + b.w && s.y + s.r > b.y && s.y - s.r < b.y + b.h;
function updatePShots() {
  const a = G.pshots, L = G.level;
  for (let i = a.length - 1; i >= 0; i--) {
    const s = a[i];
    s.t++;
    if (s.kind === 'gr') s.vy += 0.16;
    else if (s.kind === 'rk') { if (Math.hypot(s.vx, s.vy) < 6.5) { s.vx *= 1.08; s.vy *= 1.08; } if (s.t % 2 === 0) part('smoke', s.x, s.y, 0, 0, 12, null, 2); }
    else if (s.kind === 'fl') { s.vx *= 0.93; s.vy = s.vy * 0.93 - 0.02; }
    s.x += s.vx; s.y += s.vy; s.life--;
    let dead = s.life <= 0, quiet = false;
    if (s.x < G.camX - 24 || s.x > G.camX + VIEW_W + 24 || s.y < G.camY - 60 || s.y > G.camY + VIEW_H + 40) { dead = true; quiet = true; }
    if (!dead && L.solid(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) { dead = true; if (s.kind !== 'fl' && s.kind !== 'gr' && s.kind !== 'rk') spark(s.x, s.y); }
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead || !shotHits(s, e)) continue;
        if (s.pierce) { if (s.hit.includes(e)) continue; s.hit.push(e); }
        if (e.d.block && e.d.block(e, s)) { spark(s.x, s.y, '6'); Snd.play('block'); dead = true; break; }
        if (s.dmg) e.hurt(s.dmg);
        if (!s.pierce) { dead = true; break; }
      }
    }
    if (!dead && G.boss && !G.boss.dying) {
      for (const b of G.boss.boxes()) {
        if (!shotHits(s, b)) continue;
        if (s.pierce) { if (s.hit.includes(G.boss)) break; s.hit.push(G.boss); }
        if (!G.boss.hurt(s.dmg, b)) { spark(s.x, s.y, '6'); Snd.play('block'); }
        else if (s.kind !== 'fl') spark(s.x, s.y);
        if (!s.pierce) dead = true;
        break;
      }
    }
    if (!dead) {
      for (const o of G.objs) {
        if (!o.shoot || o.dead || !shotHits(s, o)) continue;
        if (s.pierce) { if (s.hit.includes(o)) continue; s.hit.push(o); }
        objHurt(o, s.dmg || 1);
        if (!s.pierce) { dead = true; break; }
      }
    }
    if (dead) {
      if (!quiet && (s.kind === 'rk' || s.kind === 'gr')) {
        const r = s.kind === 'rk' ? 26 : 30;
        boom(s.x, s.y, r); blast(s.x, s.y, r + 4, s.kind === 'rk' ? 4 : 6, 'p'); Snd.play('boom');
      }
      a[i] = a[a.length - 1]; a.pop();
    }
  }
}
function drawPShots(ctx) {
  for (const s of G.pshots) {
    const x = s.x, y = s.y;
    if (s.kind === 'bl' || s.kind === 'mg' || s.kind === 'sc') {
      const k = s.kind === 'sc' ? 0.5 : 0.9;
      pxLine(ctx, x, y, x - s.vx * k, y - s.vy * k, s.kind === 'mg' ? 'O' : 'y', 2);
      pxLine(ctx, x, y, x - s.vx * 0.4, y - s.vy * 0.4, '6', 1);
    } else if (s.kind === 'fl') {
      const k = s.life / 20;
      pxCirc(ctx, x, y, 2 + (1 - k) * 5, k > 0.7 ? 'Y' : k > 0.4 ? 'O' : k > 0.2 ? 'R' : 'r');
      if (k > 0.5) pxCirc(ctx, x, y, 1 + (1 - k) * 2, '6');
    } else if (s.kind === 'rk') {
      const n = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / n, uy = s.vy / n;
      pxLine(ctx, x, y, x - ux * 7, y - uy * 7, '0', 4);
      pxLine(ctx, x, y, x - ux * 6, y - uy * 6, 'l', 2);
      pxLine(ctx, x + ux, y + uy, x + ux * 2, y + uy * 2, 'R', 2);
      pxCirc(ctx, x - ux * 9, y - uy * 9, 2, (s.t >> 1) & 1 ? 'Y' : 'O');
    } else if (s.kind === 'lz') {
      pxLine(ctx, x, y, x - s.vx * 1.8, y - s.vy * 1.8, 'B', 3);
      pxLine(ctx, x, y, x - s.vx * 1.8, y - s.vy * 1.8, '6', 1);
    } else {
      pxCirc(ctx, x, y, 3, '0'); pxCirc(ctx, x, y, 2, 'T');
      ctx.fillStyle = (s.t >> 2) & 1 ? PAL.Y : PAL.c; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
    }
  }
}

/* ---------- enemy shots ---------- */
const ESHOT = {
  orb: { r: 2 }, big: { r: 4 }, bomb: { r: 3, g: 0.1, blast: 14 }, mshell: { r: 3, g: 0.08, blast: 20 },
  shell: { r: 3, blast: 12 }, rock: { r: 3, g: 0.12 }, ice: { r: 2 }, wave: { r: 5 }, fire: { r: 3, g: 0.1 },
};
function eshot(kind, x, y, vx, vy, o) {
  const d = ESHOT[kind];
  const k = d.g ? 1 : G.es;
  const s = { kind, x, y, vx: vx * k, vy: vy * k, life: 360, r: d.r, g: d.g || 0, blast: d.blast || 0, t: 0 };
  if (o) Object.assign(s, o);
  G.eshots.push(s);
  return s;
}
function updateEShots() {
  const a = G.eshots, L = G.level, p = G.player;
  for (let i = a.length - 1; i >= 0; i--) {
    const s = a[i];
    s.t++; s.vy += s.g; s.x += s.vx; s.y += s.vy; s.life--;
    let dead = s.life <= 0, quiet = false;
    if (s.x < G.camX - 60 || s.x > G.camX + VIEW_W + 60 || s.y > G.camY + VIEW_H + 60 || s.y < G.camY - 260) { dead = true; quiet = true; }
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    if (s.kind === 'wave') {
      const d = s.vx > 0 ? 1 : -1;
      if (L.solid(Math.floor((s.x + d * 5) / TILE), ty) || !(L.solid(tx, ty + 1) || L.get(tx, ty + 1) === 2)) { dead = true; quiet = true; }
      if (s.t % 3 === 0) part('px', s.x, s.y + 4, rand(-0.4, 0.4), -0.8, 10, 'Y', 1);
    } else if (!dead && L.solid(tx, ty)) dead = true;
    if (!dead && p && !p.dead && s.x + s.r > p.x && s.x - s.r < p.x + p.w && s.y + s.r > p.y && s.y - s.r < p.y + p.h) {
      if (p.inv <= 0 || s.blast) { hurtPlayer(1, s.x - s.vx); dead = true; }
    }
    if (dead) {
      if (!quiet) {
        if (s.blast) { boom(s.x, s.y, s.blast); blast(s.x, s.y, s.blast, 1, 'e'); Snd.play('pop'); }
        else spark(s.x, s.y, 'k');
      }
      a[i] = a[a.length - 1]; a.pop();
    }
  }
}
function drawEShots(ctx) {
  for (const s of G.eshots) {
    const x = s.x, y = s.y, f = (s.t >> 2) & 1;
    switch (s.kind) {
      case 'orb': drawSpr(ctx, SPR.orb[f], x - 2.5, y - 2.5); break;
      case 'big': pxCirc(ctx, x, y, 5, 'm'); pxCirc(ctx, x, y, 4, f ? 'k' : 'R'); pxCirc(ctx, x, y, 2, '6'); break;
      case 'bomb': case 'mshell': drawSpr(ctx, SPR.ebomb[f], x - 3.5, y - 3.5); break;
      case 'shell': drawSpr(ctx, SPR.shell, x - 4, y - 3, s.vx < 0); break;
      case 'rock': drawSpr(ctx, SPR.rock, x - 4, y - 4); break;
      case 'ice': drawSpr(ctx, SPR.ice, x - 2.5, y - 5); break;
      case 'fire': pxCirc(ctx, x, y, 3, f ? 'O' : 'R'); pxCirc(ctx, x, y, 1, 'Y'); break;
      case 'wave': {
        const d = s.vx > 0 ? 1 : -1;
        pxCirc(ctx, x, y + 1, 5, 'O'); pxCirc(ctx, x - d * 2, y + 2, 4, 'Y'); pxCirc(ctx, x - d * 4, y + 4, 4, f ? 'Y' : '6');
        break;
      }
      default: break;
    }
  }
}

/* ---------- pickups ---------- */
function spawnPickup(kind, x, y, still) {
  G.pickups.push({ kind, x: x - 6, y: y - 12, w: 12, h: 12, vx: 0, vy: still ? 0 : -2.2, still: !!still, life: still ? Infinity : 900, t: randi(0, 60) });
}
const RANDOM_DROPS = ['hp', 'gren', 'w1', 'w2', 'gem', 'gem'];
function updatePickups() {
  const a = G.pickups, p = G.player;
  for (let i = a.length - 1; i >= 0; i--) {
    const k = a[i];
    k.t++;
    if (!k.still) { k.vy = Math.min(k.vy + 0.18, 4); moveEnt(k); }
    let gone = --k.life <= 0 || k.y > G.level.h + 40;
    if (!gone && p && !p.dead && aabb(k, p)) {
      gone = true;
      const cx = k.x + 6, cy = k.y;
      if (k.kind[0] === 'w') { const n = +k.kind[1]; p.giveWeapon(n); Snd.play('power'); G.banner(WEAPONS[n].name + '!'); addScore(100); }
      else if (k.kind === 'hp') { if (p.hp < G.diff.hp) { p.hp++; Snd.play('hp'); } else { addScore(500, cx, cy); Snd.play('pick'); } }
      else if (k.kind === 'gren') { p.gren = Math.min(30, p.gren + 5); Snd.play('pick'); part('txt', cx, cy, 0, -0.4, 40, '+5'); }
      else if (k.kind === 'oneup') { G.lives++; Snd.play('oneup'); G.banner('EXTRA LIFE!'); }
      else { addScore(k.kind === 'coin' ? 100 : k.kind === 'gem' ? 500 : 1000, cx, cy); Snd.play('pick'); }
    }
    if (gone) { a[i] = a[a.length - 1]; a.pop(); }
  }
}
const PICK_SPR = { hp: 'heartBig', gren: 'bombPack', coin: 'gem', gem: 'gem', star: 'star', oneup: 'oneup' };
function drawPickups(ctx) {
  for (const k of G.pickups) {
    if (k.life < 150 && (G.t >> 2) & 1) continue;
    const s = SPR[PICK_SPR[k.kind] || k.kind];
    const bob = Math.round(Math.sin(k.t * 0.1) * 1.5);
    drawSpr(ctx, s, k.x + 6 - s.w / 2, k.y + 12 - s.h + bob - 1);
    if (k.t % 50 < 6) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(k.x + 2 + (k.t % 50)), Math.round(k.y + bob), 1, 2); }
  }
}

/* ---------- props, hazards, platforms ---------- */
function objHurt(o, dmg) {
  if (o.dead) return;
  o.hp -= dmg; o.flash = 4;
  if (o.hp <= 0) { o.dead = true; ODEF[o.kind].die(o); } else Snd.play('hit');
}
const cyc = (o, T) => (G.t + o.ph) % T;
const ODEF = {
  crate: {
    init(o) { o.w = 16; o.h = 16; o.x -= 8; o.y -= 16; o.hp = 2; o.shoot = true; },
    update(o) { if (aabb(o, G.player)) objHurt(o, 9); },
    die(o) { debris(o.x + 8, o.y + 8, ['N', 's', 'n']); Snd.play('pop'); spawnPickup(o.o.drop || choose(RANDOM_DROPS), o.x + 8, o.y + 14); },
    draw(o, ctx) { drawSpr(ctx, SPR.crate, o.x, o.y, false, o.flash > 0); },
  },
  barrel: {
    init(o) { o.w = 12; o.h = 16; o.x -= 6; o.y -= 16; o.hp = 2; o.shoot = true; },
    die(o) { const x = o.x + 6, y = o.y + 8; boom(x, y, 30); Snd.play('boom'); blast(x, y, 36, 6, 'p'); blast(x, y, 24, 1, 'e'); },
    draw(o, ctx) { drawSpr(ctx, SPR.barrel, o.x, o.y, false, o.flash > 0); },
  },
  cage: {
    init(o) { o.w = 20; o.h = 24; o.x -= 10; o.y -= 24; o.hp = 3; o.shoot = true; },
    update(o) { if (aabb(o, G.player)) objHurt(o, 9); },
    die(o) {
      debris(o.x + 10, o.y + 12, ['3', '4', '2'], 8); Snd.play('pip');
      G.rescued++; addScore(500, o.x + 10, o.y);
      spawnPickup(o.o.drop || choose(RANDOM_DROPS), o.x + 10, o.y + 20);
      addObj('pip', o.x + 10, o.y + 24, {});
    },
    draw(o, ctx) { drawSpr(ctx, SPR.pip[(G.t >> 4) & 1], o.x + 5, o.y + 8); drawSpr(ctx, SPR.cage, o.x, o.y, false, o.flash > 0); },
  },
  pip: {
    init(o) { o.w = 8; o.h = 10; o.x -= 4; o.y -= 10; o.vx = 0; o.vy = -2.6; o.step = true; o.t = 0; },
    update(o) {
      o.t++;
      if (o.t > 60) o.vx = -1.4; else if (o.onGround && o.t % 20 === 0) o.vy = -2;
      o.vy = Math.min(o.vy + 0.2, 4); moveEnt(o);
      if (o.x < G.camX - 20 || o.y > G.level.h + 20) o.dead = true;
    },
    draw(o, ctx) { drawSpr(ctx, SPR.pip[(o.t >> 2) & 1], o.x - 1, o.y - 2, o.t > 60); },
  },
  stal: {
    init(o) { o.w = 10; o.h = 18; o.x -= 5; o.gy = o.y; o.y -= (o.o.h || 7) * TILE; o.st = 0; o.t = 0; o.vy = 0; },
    update(o) {
      const p = G.player;
      if (o.st === 0) { if (Math.abs(p.x + p.w / 2 - (o.x + 5)) < 26 && p.y > o.y && p.y - o.y < 150) { o.st = 1; o.t = 0; } }
      else if (o.st === 1) { if (++o.t > 24) o.st = 2; }
      else {
        o.vy = Math.min(o.vy + 0.25, 6); o.y += o.vy;
        if (aabb(o, p)) hurtPlayer(1, o.x + 5);
        if (boxSolid(o.x + 2, o.y + o.h - 2, 6, 2) || o.y > G.level.h) { o.dead = true; debris(o.x + 5, o.y + 14, ['2', '3', '4']); Snd.play('pop'); }
      }
    },
    draw(o, ctx) { drawSpr(ctx, SPR.stal, o.x + (o.st === 1 ? ((o.t >> 1) & 1) * 2 - 1 : 0), o.y); },
  },
  crusher: {
    init(o) { o.w = 22; o.h = 16; o.x -= 11; o.gy = o.y; o.top = o.y - 92; o.y = o.top; o.ph = Math.floor(o.x * 0.37) % 170; },
    update(o) {
      const t = cyc(o, 170), lo = o.gy - 16;
      if (t < 80) o.y = o.top;
      else if (t < 105) o.y = o.top + ((t >> 1) & 1);
      else if (t < 112) o.y = lerp(o.top, lo, (t - 104) / 7);
      else if (t < 135) o.y = lo;
      else o.y = lerp(lo, o.top, (t - 134) / 35);
      if (t === 111 && onScreen(o)) { Snd.play('stomp'); G.shake = Math.max(G.shake, 5); for (let i = 0; i < 6; i++) part('px', o.x + rand(0, 22), o.gy - 1, rand(-1.5, 1.5), rand(-1.4, -0.2), 16, '5', 1, 0.08); }
      if (t >= 105 && t < 126) {
        if (aabb(o, G.player)) hurtPlayer(1, o.x + 11);
        for (const e of G.enemies) if (!e.dead && !e.fly && aabb(o, e)) e.hurt(4);
      }
    },
    draw(o, ctx) {
      const x = Math.round(o.x), y = Math.round(o.y);
      ctx.fillStyle = PAL['0']; ctx.fillRect(x + 6, G.camY - 4, 10, y - G.camY + 4);
      ctx.fillStyle = PAL['2']; ctx.fillRect(x + 7, G.camY - 4, 8, y - G.camY + 4);
      ctx.fillStyle = PAL['4']; ctx.fillRect(x + 8, G.camY - 4, 2, y - G.camY + 4);
      drawSpr(ctx, SPR.crushHead, x, y);
    },
  },
  flame: {
    init(o) { o.w = 10; o.h = 46; o.x -= 5; o.gy = o.y; o.y -= 46; o.ph = Math.floor(o.x * 0.53) % 150; },
    update(o) {
      const t = cyc(o, 150);
      if (!onScreen(o)) return;
      if (t >= 70 && t < 95 && t % 4 === 0) part('fire', o.x + 5, o.gy - 4, rand(-0.2, 0.2), -0.8, 8, null, 2);
      if (t >= 95) {
        part('fire', o.x + 5 + rand(-2, 2), o.gy - 4, rand(-0.25, 0.25), rand(-3.2, -2.2), 15, null, rand(3, 5));
        if (t === 95) Snd.play('flame');
        if (aabb(o, G.player)) hurtPlayer(1, o.x + 5);
      }
    },
    draw(o, ctx) { drawSpr(ctx, SPR.nozzle, o.x - 1, o.gy - 6); },
  },
  laser: {
    init(o) { o.w = 6; o.h = 80; o.x -= 3; o.gy = o.y; o.y -= 80; o.ph = Math.floor(o.x * 0.71) % 160; },
    update(o) { if (cyc(o, 160) < 70 && aabb(o, G.player)) hurtPlayer(1, o.x + 3); },
    draw(o, ctx) {
      const t = cyc(o, 160), x = Math.round(o.x);
      if (t < 70) {
        ctx.fillStyle = PAL.k; ctx.fillRect(x + 1, o.y + 5, 4, 70);
        ctx.fillStyle = (G.t >> 1) & 1 ? PAL['6'] : PAL.P; ctx.fillRect(x + 2, o.y + 5, 2, 70);
      } else if (t >= 140 && (t >> 1) & 1) { ctx.fillStyle = PAL.m; ctx.fillRect(x + 2, o.y + 5, 1, 70); }
      drawSpr(ctx, SPR.emitter, x - 2, o.y); drawSpr(ctx, SPR.emitter, x - 2, o.gy - 6);
    },
  },
  mplat: {
    init(o) { o.w = (o.o.w || 2) * TILE; o.h = 6; o.x -= 8; o.x0 = o.x; o.y0 = o.y; o.plat = true; o.dx = 0; o.dy = 0; o.ph = 0; },
    update(o) {
      const k = (1 - Math.cos((G.t / (o.o.T || 220)) * 6.2832)) / 2;
      const nx = o.x0 + k * (o.o.ax || 0), ny = o.y0 + k * (o.o.ay || 0);
      o.dx = nx - o.x; o.dy = ny - o.y; o.x = nx; o.y = ny;
    },
    draw(o, ctx) {
      const th = THEMES[G.level.theme], x = Math.round(o.x), y = Math.round(o.y);
      for (let i = 0; i < o.w; i += TILE) ctx.drawImage(th.platT, 0, 0, 16, 6, x + i, y, 16, 6);
      ctx.fillStyle = PAL['1']; ctx.fillRect(x + 4, y + 6, o.w - 8, 2);
      ctx.fillStyle = (G.t >> 2) & 1 ? PAL.c : PAL.B; ctx.fillRect(x + 6, y + 8, 3, 2); ctx.fillRect(x + o.w - 9, y + 8, 3, 2);
    },
  },
};
function addObj(kind, x, y, o) {
  const ob = { kind, x, y, o: o || {}, dead: false, flash: 0 };
  ODEF[kind].init(ob);
  G.objs.push(ob);
  return ob;
}

/* ---------- enemies ---------- */
const pdx = (e) => G.player.x + G.player.w / 2 - (e.x + e.w / 2);
const pdy = (e) => G.player.y + G.player.h / 2 - (e.y + e.h / 2);
function eFace(e) { const d = pdx(e); if (Math.abs(d) > 2) e.face = d > 0 ? 1 : -1; }
function eAim(e, oy) { const p = G.player; return Math.atan2(p.y + p.h / 2 - (e.y + oy), p.x + p.w / 2 - (e.x + e.w / 2)); }
function eGravity(e) { e.vy = Math.min(e.vy + 0.22, 5); moveEnt(e); }
function ledgeAhead(e, dir) {
  const fx = dir > 0 ? e.x + e.w + 2 : e.x - 2;
  const t = G.level.get(Math.floor(fx / TILE), Math.floor((e.y + e.h + 2) / TILE));
  return !(solidT(t) || t === 2);
}
function angTo(a, b, max) { let d = b - a; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return [a + clamp(d, -max, max), d]; }
function hoverTo(e, tx, ty, k, max) {
  tx = clamp(tx, G.camX + 12, G.camX + VIEW_W - 12);
  e.vx += clamp((tx - (e.x + e.w / 2)) * k, -max, max); e.vy += clamp((ty - (e.y + e.h / 2)) * k, -max, max);
  e.vx *= 0.95; e.vy *= 0.95; e.x += e.vx; e.y += e.vy;
}

function trooperFire(e) {
  const d = e.d, p = G.player;
  if (d.lob) {
    const T = 72, g = 0.1, sx = e.cx + e.face * 4, sy = e.y + 2;
    eshot('bomb', sx, sy, (p.x + p.w / 2 + p.vx * 18 - sx) / T, -0.5 * g * T + (p.y + p.h - sy) / T);
  } else if (d.snipe) eshot('orb', e.cx + Math.cos(e.ang) * 10, e.y + 6 + Math.sin(e.ang) * 10, Math.cos(e.ang) * d.bspd, Math.sin(e.ang) * d.bspd);
  else eshot('orb', e.cx + e.face * 9, e.y + (e.low ? 13 : 6), e.face * d.bspd, 0);
  Snd.play('eshot');
}
function aiTrooper(e) {
  const d = e.d, adx = Math.abs(pdx(e));
  if (e.st === 'idle' || e.st === 'walk') {
    eFace(e);
    let mv = !e.hold && adx > e.range ? e.face : 0;
    if (mv && e.onGround && ledgeAhead(e, mv)) mv = 0;
    e.vx = mv * d.spd; e.st = mv ? 'walk' : 'idle';
    if (e.cd > 0) e.cd--;
    else if (adx < (d.snipe ? 300 : 200) && (d.snipe || d.lob || Math.abs(pdy(e)) < 56) && onScreen(e, -6)) {
      e.st = 'aim'; e.stT = 0; e.vx = 0; e.low = !!d.canLow && Math.random() < 0.4; e.ang = eAim(e, 6);
    }
  } else if (e.st === 'aim') {
    e.vx = 0;
    if (d.snipe && e.stT < d.aimT - 16) e.ang = eAim(e, 6);
    if (e.stT >= d.aimT) { e.st = 'fire'; e.stT = 0; e.shots = d.burst; }
  } else if (e.st === 'fire') {
    if (e.stT % 10 === 1) {
      trooperFire(e);
      if (--e.shots <= 0) { e.st = d.shield ? 'open' : 'idle'; e.stT = 0; e.cd = randi(d.cdT[0], d.cdT[1]) * G.cdm; }
    }
  } else if (e.stT > 44) e.st = 'idle';
  eGravity(e);
}
function drawTrooper(e, ctx) {
  const d = e.d, fr = SPR[d.spr], cx = e.cx, by = e.y + e.h + (e.stepVis || 0), flip = e.face < 0, wh = e.flash > 0;
  const acting = e.st === 'aim' || e.st === 'fire';
  let f = 0;
  if (e.dropping || !e.onGround) f = 2; else if (e.st === 'walk' || e.entering) f = (e.t >> 3) & 1;
  if (e.low && acting) f = 3;
  if (d.lob) drawSpr(ctx, SPR.lobTube, cx - e.face * 3 - 4, by - 26, flip, wh);
  drawSprBC(ctx, fr[f], cx, by, flip, wh);
  if (d.shield) {
    const up = !(acting || e.st === 'open');
    drawSpr(ctx, SPR.shieldPlate, cx + e.face * (up ? 8 : -7) - 3.5, by - 21, flip, wh);
  }
  if (e.st === 'aim') {
    if (d.snipe) {
      const x0 = cx + Math.cos(e.ang) * 9, y0 = e.y + 6 + Math.sin(e.ang) * 9, locked = e.stT >= d.aimT - 16;
      ctx.fillStyle = locked ? PAL['6'] : PAL.R;
      for (let k = 0; k < 260; k += locked ? 2 : 5) ctx.fillRect(Math.round(x0 + Math.cos(e.ang) * k), Math.round(y0 + Math.sin(e.ang) * k), 1, 1);
    } else if ((e.stT >> 2) & 1) pxCirc(ctx, cx + e.face * 10, e.y + (e.low ? 13 : 6), 2, '6');
  }
  if (e.dropping) drawSpr(ctx, SPR.rotor[(e.t >> 1) & 1], cx - 9, e.y - 5);
}
function shieldBlock(e, s) {
  if (e.st === 'aim' || e.st === 'fire' || e.st === 'open') return false;
  if (s.kind === 'fl' || s.kind === 'lz') return false;
  return Math.abs(s.vx) > 0.8 && sign(s.vx) === -e.face;
}

const EDEF = {};
function trooper(name, o) {
  EDEF[name] = Object.assign({
    w: 10, h: 21, hp: 2, score: 100, spr: name, spd: 0.5, range: [70, 120], aimT: 26, burst: 1, cdT: [90, 160], bspd: 1.6,
    init(e) { e.range = randi(e.d.range[0], e.d.range[1]); e.cd = randi(30, 90); e.hold = !!(e.d.hold || e.o.hold); },
    ai: aiTrooper, draw: drawTrooper,
  }, o);
}
trooper('grunt', {});
trooper('rifle', { hp: 3, score: 150, burst: 3, hold: true, canLow: true, cdT: [110, 170], bspd: 1.8 });
trooper('lobber', { hp: 3, score: 150, lob: true, range: [90, 140], cdT: [120, 180] });
trooper('sniper', { hp: 2, score: 200, snipe: true, hold: true, aimT: 58, cdT: [120, 170], bspd: 4.2 });
trooper('elite', { hp: 5, score: 250, burst: 2, canLow: true, spd: 0.7, cdT: [70, 120], bspd: 2.1 });
trooper('shield', { hp: 5, score: 200, w: 12, shield: true, spd: 0.3, range: [44, 64], aimT: 30, cdT: [110, 150], block: shieldBlock });

EDEF.jetter = {
  w: 10, h: 21, hp: 3, score: 200, fly: true,
  init(e) { e.side = e.x > G.player.x ? 1 : -1; e.hov = e.o.h || 60; e.dist = randi(60, 100); e.ph = rand(6); e.cd = randi(60, 120); },
  ai(e) {
    const p = G.player; e.ph += 0.05;
    hoverTo(e, p.x + p.w / 2 + e.side * e.dist, p.y + p.h - e.hov + Math.sin(e.ph) * 6, 0.004, 0.07);
    eFace(e);
    if (e.t % 3 === 0) part('fire', e.cx - e.face * 5, e.y + e.h - 5, rand(-0.2, 0.2), 1.2, 8, null, 2);
    if (e.st === 'idle') { if (--e.cd <= 0 && onScreen(e, -8)) { e.st = 'aim'; e.stT = 0; } }
    else if (e.stT >= 24) {
      const a = eAim(e, 8);
      eshot('orb', e.cx, e.y + 8, Math.cos(a) * 1.7, Math.sin(a) * 1.7); Snd.play('eshot');
      e.st = 'idle'; e.cd = randi(90, 140) * G.cdm; if (Math.random() < 0.3) e.side = -e.side;
    }
  },
  draw(e, ctx) {
    const flip = e.face < 0, wh = e.flash > 0;
    drawSpr(ctx, SPR.jetpack, e.cx - e.face * 7 - 3, e.y + 6, flip, wh);
    drawSprBC(ctx, SPR.jetter[2], e.cx, e.y + e.h + 1, flip, wh);
    if (e.st === 'aim' && (e.stT >> 2) & 1) pxCirc(ctx, e.cx + e.face * 10, e.y + 7, 2, '6');
  },
};
EDEF.drone = {
  w: 16, h: 11, hp: 2, score: 150, fly: true,
  init(e) { e.hov = e.o.h || 65; e.ph = rand(6); e.cd = randi(70, 130); },
  ai(e) {
    const p = G.player; e.ph += 0.03;
    hoverTo(e, p.x + p.w / 2 + Math.sin(e.ph) * 70, p.y + p.h - e.hov + Math.sin(e.ph * 2.3) * 5, 0.004, 0.07);
    if (e.st === 'idle') { if (--e.cd <= 0 && Math.abs(pdx(e)) < 90 && onScreen(e, -8)) { e.st = 'aim'; e.stT = 0; } }
    else if (e.stT >= 22) { eshot('bomb', e.cx, e.y + e.h + 2, e.vx * 0.6, 0.5); e.st = 'idle'; e.cd = randi(100, 150) * G.cdm; }
  },
  draw(e, ctx) {
    drawSpr(ctx, SPR.drone[(e.t >> 1) & 1], e.x - 1, e.y - 1, false, e.flash > 0);
    if (e.st === 'aim' && (e.stT >> 2) & 1) pxCirc(ctx, e.cx, e.y + e.h + 1, 2, '6');
  },
};
EDEF.flit = {
  w: 12, h: 8, hp: 1, score: 80, fly: true, contact: 1,
  init(e) { e.hov = e.o.h || 60; e.side = Math.random() < 0.5 ? -1 : 1; e.cd = randi(50, 110); e.ph = rand(6); },
  ai(e) {
    const p = G.player; e.ph += 0.08;
    if (e.st === 'idle') {
      hoverTo(e, p.x + p.w / 2 + e.side * 50 + Math.sin(e.ph) * 14, p.y + p.h - e.hov + Math.cos(e.ph * 1.3) * 5, 0.006, 0.1);
      if (--e.cd <= 0 && onScreen(e, -8)) { e.st = 'dive'; e.stT = 0; const a = eAim(e, 4); e.vx = Math.cos(a) * 2.3 * G.es; e.vy = Math.sin(a) * 2.3 * G.es; }
    } else if (e.st === 'dive') {
      e.x += e.vx; e.y += e.vy;
      if (e.stT > 55 || e.cy > p.y + p.h - 3 || boxSolid(e.x, e.y + 4, e.w, e.h)) { e.st = 'rise'; e.stT = 0; e.side = -e.side; }
    } else {
      e.vy -= 0.14; e.vx *= 0.97; e.x += e.vx; e.y += e.vy;
      if (e.stT > 28) { e.st = 'idle'; e.cd = randi(60, 120) * G.cdm; }
    }
    if (Math.abs(e.vx) > 0.1) e.face = e.vx > 0 ? 1 : -1;
  },
  draw(e, ctx) { drawSpr(ctx, SPR.flit[(e.t >> 2) & 1], e.x - 1.5, e.y - 1, false, e.flash > 0); },
};
EDEF.buzzer = {
  w: 20, h: 13, hp: 4, score: 200, contact: 1,
  init(e) { e.cd = 30; },
  ai(e) {
    const adx = Math.abs(pdx(e));
    if (e.st === 'idle') {
      eFace(e); e.vx = 0;
      if (e.cd > 0) e.cd--; else if (adx < 140 && Math.abs(pdy(e)) < 34 && onScreen(e, -6)) { e.st = 'rev'; e.stT = 0; }
    } else if (e.st === 'rev') {
      e.vx = 0;
      if (e.stT % 4 === 0) part('px', e.cx + e.face * 8, e.y + e.h - 2, -e.face * rand(0.5, 1.5), rand(-1.5, -0.3), 12, 'Y', 1, 0.1);
      if (e.stT >= 36) { e.st = 'dash'; e.stT = 0; }
    } else if (e.st === 'dash') {
      e.vx = e.face * 2.7 * G.es;
      if (e.stT > 64 || e.hitWall) { e.st = 'cool'; e.stT = 0; }
    } else { e.vx *= 0.85; if (e.stT > 46) { e.st = 'idle'; e.cd = 40 * G.cdm; } }
    eGravity(e);
  },
  draw(e, ctx) {
    const sh = e.st === 'rev' ? ((e.t >> 1) & 1) : 0;
    drawSprBC(ctx, SPR.buzzer[e.st === 'cool' ? 0 : (e.t >> 1) & 1], e.cx + e.face * 3 + sh, e.y + e.h + 1 + (e.stepVis || 0), e.face < 0, e.flash > 0);
  },
};
EDEF.hopper = {
  w: 12, h: 12, hp: 2, score: 120, contact: 1,
  init(e) { e.cd = randi(20, 60); },
  ai(e) {
    if (e.onGround) {
      e.vx = 0;
      if (--e.cd <= 0 && onScreen(e, 20)) {
        eFace(e);
        let v = clamp(pdx(e) / 34, -1.9, 1.9);
        if (Math.abs(v) < 0.8) v = 0.8 * e.face;
        e.vx = v; e.vy = -3.8; e.cd = randi(40, 75) * G.cdm; e.onGround = false;
      }
    }
    eGravity(e);
  },
  draw(e, ctx) { drawSprBC(ctx, SPR.hopper[e.onGround ? 0 : 1], e.cx, e.y + e.h + 1, e.face < 0, e.flash > 0); },
};
EDEF.turret = {
  w: 16, h: 12, hp: 6, score: 200,
  init(e) { e.ang = Math.PI; e.cd = 60; },
  ai(e) {
    const r = angTo(e.ang, eAim(e, 5), 0.035);
    e.ang = r[0];
    if (e.st === 'idle') {
      if (e.cd > 0) e.cd--;
      else if (Math.abs(r[1]) < 0.2 && Math.abs(pdx(e)) < 210 && onScreen(e, -6)) { e.st = 'aim'; e.stT = 0; }
    } else if (e.stT >= 22) {
      eshot('orb', e.cx + Math.cos(e.ang) * 11, e.y + 5 + Math.sin(e.ang) * 11, Math.cos(e.ang) * 1.9, Math.sin(e.ang) * 1.9);
      Snd.play('eshot'); e.st = 'idle'; e.cd = randi(90, 120) * G.cdm;
    }
    eGravity(e);
  },
  draw(e, ctx) {
    const x0 = e.cx, y0 = e.y + 5, x1 = x0 + Math.cos(e.ang) * 11, y1 = y0 + Math.sin(e.ang) * 11;
    pxLine(ctx, x0, y0, x1, y1, '0', 5); pxLine(ctx, x0, y0, x1, y1, e.flash > 0 ? '6' : '4', 3);
    drawSpr(ctx, SPR.turretBase, e.x - 1, e.y - 1, false, e.flash > 0);
    ctx.fillStyle = e.st === 'aim' && (e.stT >> 2) & 1 ? PAL['6'] : PAL.R; ctx.fillRect(Math.round(x0) - 1, Math.round(y0) - 1, 2, 2);
  },
};
EDEF.brute = {
  w: 22, h: 32, hp: 16, score: 600, boom: 22,
  init(e) { e.cd = 70; },
  ai(e) {
    const adx = Math.abs(pdx(e));
    if (e.st === 'idle') {
      eFace(e);
      let mv = adx > 80 ? e.face : 0;
      if (mv && e.onGround && ledgeAhead(e, mv)) mv = 0;
      e.vx = mv * 0.28; e.walk = !!mv;
      if (e.cd > 0) e.cd--; else if (onScreen(e, -10)) { e.st = adx < 56 ? 'wind' : 'spin'; e.stT = 0; e.vx = 0; }
    } else if (e.st === 'spin') { if (e.stT >= 38) { e.st = 'spray'; e.stT = 0; } }
    else if (e.st === 'spray') {
      if (e.stT % 6 === 1) { eshot('orb', e.cx + e.face * 17, e.y + 14, e.face * 2.1, rand(-0.04, 0.04)); Snd.play('eshot'); }
      if (e.stT >= 54) { e.st = 'idle'; e.cd = 110 * G.cdm; }
    } else if (e.stT >= 30) {
      eshot('wave', e.cx - 12, e.y + e.h - 5, -2.2, 0); eshot('wave', e.cx + 12, e.y + e.h - 5, 2.2, 0);
      G.shake = 8; Snd.play('stomp'); e.st = 'idle'; e.cd = 100 * G.cdm;
    }
    eGravity(e);
  },
  draw(e, ctx) {
    const up = e.st === 'wind' ? -Math.min(4, e.stT >> 2) : 0;
    drawSprBC(ctx, SPR.brute[e.walk && e.st === 'idle' ? (e.t >> 4) & 1 : 0], e.cx + e.face * 4, e.y + e.h + 1 + up + (e.stepVis || 0), e.face < 0, e.flash > 0);
    if (e.st === 'spin' && (e.stT >> 2) & 1) pxCirc(ctx, e.cx + e.face * 18, e.y + 14, 2, '6');
  },
};
EDEF.roller = {
  w: 11, h: 11, hp: 1, score: 100, boom: 16,
  init(e) { e.fuse = 420; },
  ai(e) {
    e.vx = clamp(e.vx + sign(pdx(e)) * 0.05, -1.9 * G.es, 1.9 * G.es);
    eGravity(e);
    if (e.hitWall) e.vx = -e.hitWall * 0.8;
    if (--e.fuse <= 0 || aabb(e, G.player)) { e.self = true; e.die(false); }
  },
  onDie(e) { if (e.self) blast(e.cx, e.cy, 18, 1, 'e'); blast(e.cx, e.cy, 22, 3, 'p'); },
  draw(e, ctx) { drawSpr(ctx, SPR.roller[(e.t >> (e.fuse < 90 ? 1 : 3)) & 1], e.x - 1, e.y - 1, false, e.flash > 0); },
};
EDEF.mortar = {
  w: 22, h: 14, hp: 8, score: 300,
  init(e) { e.cd = 80; },
  ai(e) {
    eFace(e);
    if (e.st === 'idle') { if (e.cd > 0) e.cd--; else if (onScreen(e, -6) && Math.abs(pdx(e)) < 280) { e.st = 'aim'; e.stT = 0; } }
    else if (e.stT >= 30) {
      const p = G.player, T = 120, g = 0.08, sx = e.cx + e.face * 4, sy = e.y - 2, tx = p.x + p.w / 2, gy = p.y + p.h;
      eshot('mshell', sx, sy, (tx - sx) / T, -0.5 * g * T + (gy - sy) / T);
      G.markers.push({ x: tx, y: gy, t: T });
      Snd.play('gren'); e.st = 'idle'; e.cd = randi(150, 200) * G.cdm;
    }
    eGravity(e);
  },
  draw(e, ctx) { drawSprBC(ctx, SPR.mortar[e.st === 'aim' && e.stT > 20 ? 1 : 0], e.cx, e.y + e.h + 1, e.face < 0, e.flash > 0); },
};
EDEF.tank = {
  w: 44, h: 26, hp: 50, score: 2000, contact: 1, big: true, boom: 34,
  init(e) { e.cd = 80; e.atk = 0; },
  ai(e) {
    const adx = Math.abs(pdx(e));
    eFace(e);
    if (e.st === 'idle') {
      let mv = adx > 130 ? e.face : adx < 80 ? -e.face : 0;
      if (mv && (ledgeAhead(e, mv) || (mv > 0 && e.x + e.w > G.camX + VIEW_W - 4) || (mv < 0 && e.x < G.camX + 4))) mv = 0;
      e.vx = mv * 0.35;
      if (e.cd > 0) e.cd--; else if (onScreen(e, -20)) { e.atk ^= 1; e.st = e.atk ? 'cannon' : 'mg'; e.stT = 0; e.vx = 0; }
    } else if (e.st === 'cannon') {
      if (e.stT === 34) { eshot('shell', e.cx + e.face * 26, e.y + 7, e.face * 2.4, 0); Snd.play('rocket'); G.shake = 4; }
      if (e.stT >= 60) { e.st = 'idle'; e.cd = 70 * G.cdm; }
    } else {
      if (e.stT >= 24 && e.stT <= 64 && e.stT % 8 === 0) { eshot('orb', e.cx + e.face * 22, e.y + e.h - 7, e.face * 2, 0); Snd.play('eshot'); }
      if (e.stT >= 80) { e.st = 'idle'; e.cd = 70 * G.cdm; }
    }
    eGravity(e);
  },
  draw(e, ctx) {
    drawSprBC(ctx, SPR.tank[Math.abs(e.vx) > 0.05 ? (e.t >> 2) & 1 : 0], e.cx + e.face, e.y + e.h + 1, e.face < 0, e.flash > 0);
    if (e.st === 'cannon' && e.stT < 34 && (e.stT >> 2) & 1) pxCirc(ctx, e.cx + e.face * 26, e.y + 7, 3, '6');
    if (e.st === 'mg' && e.stT < 24 && (e.stT >> 2) & 1) pxCirc(ctx, e.cx + e.face * 22, e.y + e.h - 7, 2, '6');
    if (e.hp < e.maxhp) { ctx.fillStyle = PAL['0']; ctx.fillRect(e.x + 6, e.y - 8, 32, 3); ctx.fillStyle = PAL.R; ctx.fillRect(e.x + 7, e.y - 7, Math.max(0, Math.round((30 * e.hp) / e.maxhp)), 1); }
  },
};
EDEF.missile = {
  w: 8, h: 6, hp: 1, score: 50, fly: true, boom: 12,
  init(e) { e.ang = e.o.ang !== undefined ? e.o.ang : Math.PI; e.life = 280; e.sp = e.o.sp || 1.5; },
  ai(e) {
    e.ang = angTo(e.ang, eAim(e, 3), 0.03)[0];
    e.x += Math.cos(e.ang) * e.sp * G.es; e.y += Math.sin(e.ang) * e.sp * G.es;
    if (e.t % 3 === 0) part('smoke', e.cx - Math.cos(e.ang) * 5, e.cy - Math.sin(e.ang) * 5, 0, 0, 12, null, 2);
    if (--e.life <= 0 || aabb(e, G.player) || G.level.solid(Math.floor(e.cx / TILE), Math.floor(e.cy / TILE))) { e.self = true; e.die(false); }
  },
  onDie(e) { if (e.self) blast(e.cx, e.cy, 14, 1, 'e'); },
  draw(e, ctx) {
    ctx.save(); ctx.translate(Math.round(e.cx), Math.round(e.cy)); ctx.rotate(e.ang);
    drawSpr(ctx, SPR.missile, -5, -2, false, e.flash > 0); ctx.restore();
  },
};

class Enemy {
  constructor(type, x, y, o) {
    const d = EDEF[type];
    this.type = type; this.d = d; this.o = o || {};
    this.w = d.w; this.h = d.h;
    this.x = x - d.w / 2; this.y = y - d.h - (d.fly && this.o.h ? this.o.h : 0);
    this.vx = 0; this.vy = 0; this.face = -1;
    this.hp = this.maxhp = d.hp;
    this.t = 0; this.st = 'idle'; this.stT = 0; this.flash = 0; this.cd = 60;
    this.onGround = false; this.dead = false; this.step = true; this.fly = !!d.fly; this.contact = d.contact || 0;
    if (this.o.drop && !d.fly) { this.dropping = true; this.y = G.camY - this.h - 6; }
    if (d.init) d.init(this);
    this.cd = Math.round(this.cd * G.cdm);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update() {
    this.t++; this.stT++;
    if (this.flash > 0) this.flash--;
    if (this.stepVis) this.stepVis *= 0.7;
    this.entering = false;
    if (this.dropping) {
      this.vx = 0; this.vy = 1; moveEnt(this);
      if (this.onGround) this.dropping = false;
    } else if (this.locked && !this.fly && this.st === 'idle' && (this.cx < G.camX + this.w / 2 + 12 || this.cx > G.camX + VIEW_W - this.w / 2 - 12)) {
      // arena reinforcements march on-screen before they start fighting
      this.entering = true;
      this.face = this.cx < G.camX + VIEW_W / 2 ? 1 : -1;
      this.vx = this.face * Math.max(0.7, this.d.spd || 0);
      eGravity(this);
      if (this.hitWall && this.onGround) this.vy = -4.2;
    } else this.d.ai(this);
    if (this.dead) return;
    if (this.contact && !this.dropping && aabb(this, G.player)) hurtPlayer(1, this.cx);
    if (this.y > G.level.h + 40) this.dead = true;
    else if (!this.locked && this.x + this.w < G.camX - 90) this.dead = true;
  }
  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 4;
    if (this.hp <= 0) this.die(true); else Snd.play('hit');
  }
  die(killed) {
    if (this.dead) return;
    this.dead = true;
    const d = this.d;
    boom(this.cx, this.cy, d.boom || 12); Snd.play(d.big ? 'bigboom' : 'pop');
    debris(this.cx, this.cy, ['3', '4', '2'], d.big ? 12 : 5);
    if (d.onDie) d.onDie(this);
    if (killed) {
      addScore(d.score, this.cx, this.y); G.kills++;
      const r = Math.random();
      if (d.big) spawnPickup('star', this.cx, this.cy);
      else if (r < 0.05) spawnPickup('hp', this.cx, this.cy);
      else if (r < 0.1) spawnPickup('gren', this.cx, this.cy);
      else if (r < 0.28 && !d.fly) spawnPickup('coin', this.cx, this.cy);
    }
  }
  draw(ctx) { this.d.draw(this, ctx); }
}
function spawnEnemy(type, x, y, o) {
  if (!EDEF[type]) return null;
  const e = new Enemy(type, x, y, o || {});
  G.enemies.push(e);
  return e;
}
