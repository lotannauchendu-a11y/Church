'use strict';
/* ============================================================
 * EMBER BRIGADE - the ten Legion war machines (bosses)
 * Each boss runs a generator "script": `yield n` waits n frames.
 * ============================================================ */

const aL = () => G.camX;
const aR = () => G.camX + VIEW_W;
const aG = () => G.arenaG;
const pX = () => G.player.x + G.player.w / 2;

function* bMove(b, tx, ty, spd) {
  for (;;) {
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d <= spd) { b.x = tx; b.y = ty; return; }
    b.x += (dx / d) * spd; b.y += (dy / d) * spd;
    yield 0;
  }
}
function bFan(x, y, ang, n, spread, spd, kind) {
  for (let i = 0; i < n; i++) { const a = ang + (i - (n - 1) / 2) * spread; eshot(kind || 'orb', x, y, Math.cos(a) * spd, Math.sin(a) * spd); }
}
function bAimAt(x, y) { const p = G.player; return Math.atan2(p.y + p.h / 2 - y, p.x + p.w / 2 - x); }
function bLob(x, y, tx, T, kind) {
  kind = kind || 'bomb';
  const g = ESHOT[kind].g;
  eshot(kind, x, y, (tx - x) / T, -0.5 * g * T + (aG() - y) / T);
}
function bRain(xs, kind, delay) {
  for (const x of xs) {
    G.markers.push({ x, y: aG(), t: delay });
    G.timers.push({ t: delay, fn: () => eshot(kind, x, G.camY - 8, 0, 2.6) });
  }
}
function bWaves(x0, x1) { eshot('wave', x0, aG() - 5, -2.2, 0); eshot('wave', x1, aG() - 5, 2.2, 0); }
function randXs(n) { const xs = [pX()]; for (let i = 0; i < n; i++) xs.push(aL() + 14 + Math.random() * (VIEW_W - 28)); return xs; }
function drawLeg(ctx, hx, hy, fx, fy, bend, c) {
  const kx = (hx + fx) / 2 + bend, ky = Math.min(hy, fy) - 10 + (fy - hy) * 0.15;
  pxLine(ctx, hx, hy, kx, ky, '0', 5); pxLine(ctx, kx, ky, fx, fy, '0', 5);
  pxLine(ctx, hx, hy, kx, ky, c, 3); pxLine(ctx, kx, ky, fx, fy, c, 3);
  pxCirc(ctx, kx, ky, 2, '5');
  ctx.fillStyle = PAL['0']; ctx.fillRect(Math.round(fx) - 4, Math.round(fy) - 3, 8, 3);
  ctx.fillStyle = PAL['4']; ctx.fillRect(Math.round(fx) - 3, Math.round(fy) - 3, 6, 2);
}
const blink = (b) => b.tele > 0 && (b.tele >> 2) & 1;

function buildBossSprites() {
  SPR.bHauler = paint(92, 48, (p) => {
    p.rbox(2, 34, 62, 14, '1', '2', '0');
    for (let i = 0; i < 5; i++) { p.ball(10 + i * 11, 41, 4, '3', '4', '2'); p.px(10 + i * 11, 41, '1'); }
    p.ball(78, 40, 7, '2', '4', '1'); p.ball(78, 40, 3, '3', '5', '2');
    p.rbox(0, 16, 88, 20, '3', '4', '2'); p.r(2, 27, 84, 3, 'm').r(2, 27, 84, 1, 'M'); p.dots(2, 18, 84, 8, '2', 14, 5);
    p.rbox(4, 4, 24, 14, '4', '5', '3'); p.r(8, 7, 10, 6, '1').r(9, 8, 8, 2, 'c');
    p.rbox(36, 2, 26, 16, '3', '5', '2'); p.r(40, 6, 6, 4, 'R').px(41, 7, 'Y');
    p.box(60, 7, 32, 7, '2', '4', '1'); p.r(88, 6, 4, 9, '1');
    p.r(86, 22, 3, 18, '5').r(88, 24, 3, 18, '4'); p.r(1, 6, 3, 12, '1');
    p.box(70, 26, 14, 6, '1', '2', '0');
  });
  SPR.bStrider = paint(58, 30, (p) => {
    p.rbox(0, 6, 58, 18, '3', '4', '2'); p.r(4, 17, 50, 2, 'g').r(4, 17, 50, 1, 'G'); p.dots(3, 8, 52, 8, '2', 10, 3);
    p.ball(40, 8, 7, 'G', 'l', 'g'); p.r(40, 6, 5, 3, 'R').px(42, 6, 'Y');
    p.box(22, 22, 14, 8, '1', '2', '0'); p.r(26, 27, 6, 3, '4');
    p.ball(6, 15, 4, '2', '4', '1').ball(51, 15, 4, '2', '4', '1').ball(20, 15, 3, '2', '4', '1').ball(37, 15, 3, '2', '4', '1');
  });
  SPR.bBoat = paint(98, 44, (p) => {
    p.rbox(0, 22, 98, 18, '2', '3', '1');
    for (let i = 0; i < 9; i++) p.clear(98 - 9 + i, 31 + i, 9 - i, 1);
    for (let i = 0; i < 6; i++) p.clear(0, 34 + i, i + 1, 1);
    p.r(2, 33, 92, 2, 'r'); p.r(2, 23, 94, 1, '4');
    p.rbox(22, 6, 32, 18, '4', '5', '3'); p.r(26, 10, 6, 5, 'c').r(34, 10, 6, 5, 'c').r(42, 10, 6, 5, 'c');
    p.r(36, 0, 2, 7, '2'); p.r(32, 1, 10, 1, '2'); p.px(37, 0, 'R');
    p.box(4, 12, 14, 12, 'm', 'M', 'r'); p.r(7, 14, 3, 3, '0').r(12, 14, 3, 3, '0').r(7, 19, 3, 3, '0').r(12, 19, 3, 3, '0');
    p.ball(74, 18, 6, '3', '5', '2'); p.box(76, 15, 18, 5, '2', '4', '1');
    p.r(58, 16, 10, 8, '3').r(58, 16, 10, 1, '5');
  });
  SPR.bGunship = paint(80, 32, (p) => {
    p.r(0, 12, 14, 5, '2').r(0, 12, 14, 1, '4'); p.box(0, 4, 5, 12, '3', '4', '2'); p.r(1, 6, 3, 3, 'm');
    p.rbox(10, 8, 52, 18, '3', '4', '2'); p.r(12, 18, 48, 2, 'm').r(12, 18, 48, 1, 'M'); p.dots(13, 10, 44, 7, '2', 10, 8);
    p.ball(62, 17, 9, 'c', '6', 'B'); p.r(58, 12, 2, 10, '2');
    p.r(34, 2, 4, 7, '1'); p.r(30, 6, 12, 3, '2');
    p.box(48, 24, 12, 6, '1', '2', '0'); p.r(58, 26, 6, 2, '4');
    p.r(18, 28, 30, 2, '1'); p.r(22, 26, 2, 3, '1').r(42, 26, 2, 3, '1');
    p.r(20, 12, 8, 6, '1').r(21, 13, 6, 2, 'c');
  });
  SPR.bDrill = paint(28, 40, (p) => {
    for (let j = 0; j < 22; j++) {
      const w = Math.round(1 + j * 0.6);
      p.r(14 - w, j, w * 2, 1, (j + 1) % 6 < 3 ? '4' : '5'); p.px(14 - w, j, '0').px(13 + w, j, '0'); if (w > 2) p.px(15 - w, j, '6');
    }
    p.rbox(0, 22, 28, 10, 'm', 'M', 'r'); p.r(8, 25, 12, 4, 'Y').r(12, 26, 4, 2, '0');
    p.rbox(2, 32, 24, 8, '3', '4', '2');
  });
  SPR.bSeg = paint(26, 14, (p) => { p.rbox(0, 0, 26, 14, '3', '4', '2'); p.r(2, 6, 22, 2, 'm'); p.px(4, 3, '5').px(21, 3, '5'); });
  SPR.bColossus = paint(66, 68, (p) => {
    p.box(14, 44, 12, 18, '4', '5', '3').box(34, 44, 12, 18, '4', '5', '3');
    p.box(10, 60, 20, 8, '2', '4', '1').box(30, 60, 20, 8, '2', '4', '1');
    p.rbox(8, 14, 44, 32, '5', '6', '4'); p.r(12, 38, 36, 3, 'B'); p.dots(10, 16, 40, 18, '4', 12, 6);
    p.ball(30, 27, 7, 'c', '6', 'B'); p.r(29, 26, 3, 3, '6');
    p.rbox(20, 2, 20, 14, '4', '5', '3'); p.r(26, 7, 12, 3, 'c').px(34, 7, '6');
    p.ball(10, 18, 9, 'B', 'c', 'b').ball(50, 18, 9, 'B', 'c', 'b');
    p.box(46, 26, 20, 11, '2', '4', '1'); p.r(63, 27, 3, 9, 'c');
  });
  SPR.bSmelter = paint(52, 52, (p) => {
    p.rbox(0, 0, 52, 52, '2', '3', '1'); p.dots(3, 3, 46, 46, '1', 24, 9);
    for (const [x, y] of [[6, 6], [45, 6], [6, 45], [45, 45]]) p.ball(x, y, 3, '4', '6', '3');
    p.ball(26, 26, 20, '1', '2', '0'); p.ball(26, 26, 15, 'r', 'R', 'm'); p.ball(26, 26, 8, 'O', 'Y', 'o'); p.r(24, 24, 4, 4, '6');
  });
  SPR.bPiston = paint(26, 20, (p) => {
    p.box(0, 0, 26, 14, '3', '5', '2');
    for (let i = 1; i < 25; i += 6) { p.r(i, 3, 3, 4, 'y'); p.r(i + 3, 3, 3, 4, '1'); }
    for (let i = 1; i < 26; i += 5) { p.r(i, 14, 4, 3, '0'); p.r(i + 1, 14, 2, 5, '5'); p.px(i + 1, 19, '6'); }
  });
  SPR.bSkitter = paint(66, 30, (p) => {
    p.rbox(6, 6, 54, 20, '2', '3', '1'); p.r(8, 18, 50, 2, 'p').r(8, 18, 50, 1, 'P');
    p.ball(16, 14, 12, 'p', 'P', 'm'); p.r(10, 9, 4, 3, 'k');
    p.ball(52, 12, 9, '3', '5', '2'); p.r(52, 8, 3, 3, 'R').r(57, 11, 3, 3, 'R').r(52, 14, 3, 3, 'R');
    p.box(48, 22, 18, 6, '1', '2', '0'); p.r(63, 23, 3, 4, '4');
    p.dots(26, 8, 22, 9, '1', 8, 4);
  });
  SPR.bTempest = paint(66, 76, (p) => {
    p.rbox(6, 44, 58, 32, '3', '4', '2'); p.r(8, 58, 54, 3, 'm').r(8, 58, 54, 1, 'M'); p.dots(8, 46, 54, 10, '2', 14, 7);
    for (let i = 10; i < 60; i += 12) p.box(i, 66, 8, 8, '1', '2', '0');
    p.ball(34, 34, 20, '4', '6', '3'); p.r(26, 22, 8, 5, 'R').px(28, 23, 'Y');
    p.box(40, 26, 26, 16, '2', '4', '1'); p.r(62, 28, 4, 12, '1'); p.r(63, 31, 2, 6, 'c');
    p.rbox(8, 0, 18, 16, 'm', 'M', 'r'); p.r(11, 3, 4, 4, '0').r(18, 3, 4, 4, '0').r(11, 9, 4, 4, '0').r(18, 9, 4, 4, '0');
    p.r(14, 16, 6, 6, '2');
  });
  SPR.bOverseer = paint(60, 62, (p) => {
    for (const x of [8, 20, 34, 46]) { for (let j = 0; j < 8; j++) p.r(x + 3 - Math.floor(j / 2.5), j, 1 + Math.floor(j / 1.25), 1, '2'); }
    p.rbox(2, 6, 56, 44, '2', '3', '1'); p.r(4, 8, 52, 2, 'p'); p.dots(5, 12, 50, 34, '1', 26, 2);
    p.r(6, 40, 48, 2, 'p').r(6, 40, 48, 1, 'P');
    p.ball(30, 26, 13, '1', '2', '0'); p.ball(30, 26, 10, 'p', 'P', 'm'); p.ball(30, 26, 5, 'k', '6', 'm');
    p.box(12, 48, 36, 12, '1', '2', '0');
    for (let i = 14; i < 46; i += 5) { p.r(i, 49, 3, 5, '5'); p.px(i + 1, 54, '6'); }
  });
  SPR.bFist = paint(24, 24, (p) => {
    p.rbox(1, 0, 22, 12, '2', '3', '1'); p.r(3, 8, 18, 2, 'p');
    p.rbox(0, 10, 24, 14, '3', '4', '2');
    for (let i = 2; i < 22; i += 5) { p.box(i, 17, 5, 7, '2', '4', '1'); }
  });
  SPR.bCore = paint(44, 44, (p) => {
    p.ball(22, 22, 21, '1', '2', '0'); p.ball(22, 22, 17, 'p', 'P', 'm'); p.ball(22, 22, 10, 'k', '6', 'm'); p.ball(22, 22, 4, '6', '6', 'Y');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.r(Math.round(22 + Math.cos(a) * 19) - 1, Math.round(22 + Math.sin(a) * 19) - 1, 3, 3, '5'); }
  });
}

/* ---------- boss definitions ---------- */
const BDEF = {
  hauler: {
    name: 'DUNE HAULER', w: 84, h: 44, hp: 110,
    *script(b) {
      const home = () => aR() - b.w - 6;
      yield* bMove(b, home(), b.y, 1.2);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        b.tele = 30; yield 30;
        for (let i = 0; i < (rage ? 7 : 5); i++) { eshot('orb', b.x - 2, b.y + b.h - 15, -2.1, 0); Snd.play('eshot'); yield 9; }
        yield 50;
        for (let i = 0; i < (rage ? 4 : 3); i++) {
          const tx = pX() + rand(-10, 10);
          G.markers.push({ x: tx, y: aG(), t: 80 });
          bLob(b.x + 14, b.y + 8, tx, 80, 'mshell'); Snd.play('gren'); yield 34;
        }
        yield 60;
        b.rev = 44; Snd.play('charge'); yield 44;
        yield* bMove(b, Math.max(aL() + VIEW_W * 0.42, aL() + 70), b.y, 3.2);
        G.shake = 6; yield 24;
        yield* bMove(b, home(), b.y, 1.1);
        if (rage) { spawnEnemy('grunt', aL() + VIEW_W * 0.3, aG(), { drop: true }); spawnEnemy('grunt', aL() + VIEW_W * 0.6, aG(), { drop: true }); }
        yield 50;
      }
    },
    tick(b) { if (b.rev > 0) { b.rev--; if (b.rev % 3 === 0) part('smoke', b.x + b.w, b.y + 12, 0.5, -0.5, 16, null, 3); } },
    draw(b, ctx) {
      const sh = b.rev > 0 ? (b.t & 1) : 0;
      drawSpr(ctx, SPR.bHauler, b.x - 4 + sh, b.y - 4, true, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.x - 2, b.y + b.h - 15, 3, '6');
    },
  },
  strider: {
    name: 'MIRE STRIDER', w: 56, h: 24, hp: 120,
    init(b) { b.y = aG() - 84; },
    *script(b) {
      yield* bMove(b, aR() - b.w - 30, b.y, 1.2);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        yield* bMove(b, clamp(pX() - b.w / 2, aL() + 8, aR() - b.w - 8), b.y, rage ? 1.1 : 0.8);
        b.tele = 24; yield 24;
        bFan(b.cx, b.y + b.h + 2, Math.PI / 2, rage ? 5 : 3, 0.3, 1.8); Snd.play('eshot');
        yield 40;
        b.tele = 20; yield 20;
        yield* bMove(b, b.x, b.y + 20, 1.6);
        G.shake = 8; Snd.play('stomp'); bWaves(b.x + 4, b.x + b.w - 4);
        yield 14;
        yield* bMove(b, b.x, aG() - 84, 1);
        yield 30;
        for (let i = 0; i < 3; i++) { const a = bAimAt(b.cx, b.y + b.h); eshot('orb', b.cx, b.y + b.h, Math.cos(a) * 2, Math.sin(a) * 2); Snd.play('eshot'); yield 16; }
        if (rage) spawnEnemy('hopper', aL() + VIEW_W * (Math.random() < 0.5 ? 0.15 : 0.85), aG(), { drop: true });
        yield 44;
      }
    },
    draw(b, ctx) {
      const gy = aG();
      for (let i = 0; i < 4; i++) {
        const hx = b.x + 6 + i * 15, out = i < 2 ? -1 : 1;
        const fx = Math.round((hx + out * 16 + i * 5) / 16) * 16 - i * 5 + out * 6;
        drawLeg(ctx, hx, b.y + 16, fx, gy, out * 12, '3');
      }
      drawSpr(ctx, SPR.bStrider, b.x - 1, b.y - 6, true, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.cx, b.y + b.h + 2, 3, '6');
    },
  },
  gunboat: {
    name: 'BRINEBREAKER', w: 82, h: 30, hp: 130,
    init(b) { b.by = aG() - 18; b.y = b.by; b.x = G.level.w + 16; b.contact = false; },
    *script(b) {
      yield* bMove(b, G.level.w - 90, b.by, 0.8);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        for (let i = 0; i < 3; i++) {
          b.tele = 14; yield 14;
          const a = bAimAt(b.x + 6, b.y + 12);
          eshot('orb', b.x + 6, b.y + 12, Math.cos(a) * 2, Math.sin(a) * 2); Snd.play('eshot'); yield 18;
        }
        yield 40;
        for (let i = 0; i < (rage ? 4 : 3); i++) { bLob(b.x + 30, b.y, clamp(pX() + rand(-24, 24), aL() + 8, b.x - 20), 70 + i * 8, 'bomb'); Snd.play('gren'); yield 22; }
        yield 60;
        for (let i = 0; i < (rage ? 3 : 2); i++) { spawnEnemy('missile', b.x + 70, b.y, { ang: -2.2, sp: 1.4 }); Snd.play('rocket'); yield 44; }
        yield 70;
        for (let i = 0; i < 2; i++) { b.tele = 20; yield 20; eshot('shell', b.x - 2, aG() - 7, -2.3, 0); Snd.play('rocket'); yield 44; }
        yield 40;
      }
    },
    tick(b) { b.y = b.by + Math.sin(b.t * 0.05) * 2; },
    draw(b, ctx) {
      drawSpr(ctx, SPR.bBoat, b.x - 8, b.y - 4, true, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.x + 6, b.y + 12, 3, '6');
    },
  },
  gunship: {
    name: 'SKYHOOK', w: 70, h: 24, hp: 130,
    init(b) { b.y = G.camY + 28; },
    *script(b) {
      const top = () => G.camY + 28;
      yield* bMove(b, aR() - b.w - 20, top(), 1.5);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        { // strafing pass
          const dir = b.cx > aL() + VIEW_W / 2 ? -1 : 1;
          b.face = dir;
          const it = bMove(b, dir < 0 ? aL() + 10 : aR() - b.w - 10, top(), rage ? 1.9 : 1.5);
          let n = 0;
          while (!it.next().done) { if (++n % 14 === 0) { eshot('orb', b.cx, b.y + b.h, 0, 2); Snd.play('eshot'); } yield 0; }
        }
        yield 30;
        b.face = pX() < b.cx ? -1 : 1;
        for (let i = 0; i < 3; i++) {
          b.tele = 12; yield 12;
          bFan(b.cx, b.y + b.h, bAimAt(b.cx, b.y + b.h), rage ? 3 : 1, 0.25, 1.9); Snd.play('eshot'); yield 22;
        }
        yield 30;
        { // low swoop: duck under it
          const fromRight = pX() < aL() + VIEW_W / 2;
          yield* bMove(b, fromRight ? aR() + 14 : aL() - b.w - 14, top(), 3);
          b.y = aG() - 15 - b.h; b.face = fromRight ? -1 : 1;
          G.warnSide = { dir: fromRight ? 1 : -1, t: 50, y: b.y + b.h / 2 }; Snd.play('charge');
          yield 50;
          yield* bMove(b, fromRight ? aL() - b.w - 14 : aR() + 14, b.y, 3.6);
          b.y = top(); b.face = -b.face;
          yield* bMove(b, fromRight ? aL() + 20 : aR() - b.w - 20, top(), 2);
        }
        if (rage) spawnEnemy('jetter', aR() + 10, aG(), { h: 60 });
        yield 40;
      }
    },
    draw(b, ctx) {
      drawSpr(ctx, SPR.bGunship, b.x - 5, b.y - 6, b.face < 0, b.flash > 0);
      ctx.fillStyle = PAL['5'];
      const rw = (b.t >> 1) & 1 ? 64 : 22;
      ctx.fillRect(Math.round(b.cx - rw / 2), Math.round(b.y - 6), rw, 1);
      if (blink(b)) pxCirc(ctx, b.cx, b.y + b.h, 3, '6');
    },
  },
  borer: {
    name: 'THE BORER', w: 28, h: 60, hp: 120,
    init(b) { b.vuln = false; b.mode = 'hide'; b.ext = 0; b.sx = 0; },
    boxes(b) {
      const gy = aG();
      if (b.mode === 'up') return [{ x: b.x, y: gy - 62 * b.ext, w: 28, h: 62 * b.ext }];
      if (b.mode === 'down') return [{ x: b.x, y: G.camY, w: 28, h: (gy - G.camY) * b.ext }];
      if (b.mode === 'side') return [{ x: b.sx, y: gy - 22, w: 64, h: 22 }];
      return [];
    },
    *script(b) {
      yield 50;
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        { // erupt from the floor
          const gx = clamp(pX() + rand(-30, 30), aL() + 24, aR() - 24);
          b.mode = 'up'; b.x = gx - 14; b.ext = 0; b.vuln = false;
          for (let i = 0; i < 52; i++) { if (i % 3 === 0) part('px', gx + rand(-12, 12), aG() - 1, rand(-0.8, 0.8), rand(-2, -0.6), 14, 'N', 2, 0.1); if (i % 12 === 0) G.shake = 2; yield 0; }
          b.vuln = true; Snd.play('stomp');
          while (b.ext < 1) { b.ext = Math.min(1, b.ext + 0.09); yield 0; }
          for (let i = 0; i < (rage ? 7 : 5); i++) eshot('rock', b.x + 14, aG() - 60, rand(-1.8, 1.8), rand(-3.6, -2.2));
          yield 40;
          for (let i = 0; i < 2; i++) { const a = bAimAt(b.x + 14, aG() - 36); eshot('orb', b.x + 14, aG() - 36, Math.cos(a) * 2, Math.sin(a) * 2); Snd.play('eshot'); yield 26; }
          yield 20;
          while (b.ext > 0) { b.ext = Math.max(0, b.ext - 0.05); yield 0; }
          b.vuln = false; b.mode = 'hide';
        }
        yield 34;
        { // spear down from the ceiling
          const cx = pX();
          b.mode = 'down'; b.x = cx - 14; b.ext = 0;
          G.markers.push({ x: cx, y: aG(), t: 52 });
          for (let i = 0; i < 52; i++) { if (i % 4 === 0) part('px', cx + rand(-10, 10), G.camY + 2, 0, rand(0.5, 1.5), 16, 'N', 1, 0.05); yield 0; }
          b.vuln = true;
          while (b.ext < 1) { b.ext = Math.min(1, b.ext + 0.11); yield 0; }
          G.shake = 8; Snd.play('stomp');
          if (rage) bWaves(cx - 12, cx + 12);
          yield 56;
          while (b.ext > 0) { b.ext = Math.max(0, b.ext - 0.05); yield 0; }
          b.vuln = false; b.mode = 'hide';
        }
        yield 34;
        { // tunnel charge along the floor: jump it
          const fromRight = pX() < aL() + VIEW_W / 2;
          b.dir = fromRight ? -1 : 1; b.sx = fromRight ? aR() + 10 : aL() - 74;
          G.warnSide = { dir: fromRight ? 1 : -1, t: 44, y: aG() - 11 }; Snd.play('charge');
          yield 44;
          b.mode = 'side'; b.vuln = true;
          const end = fromRight ? aL() - 80 : aR() + 16;
          while (fromRight ? b.sx > end : b.sx < end) { b.sx += b.dir * (rage ? 3.6 : 3); if (b.t % 3 === 0) part('px', b.sx + 32, aG() - 1, rand(-1, 1), rand(-1.6, -0.4), 12, 'N', 2, 0.1); yield 0; }
          b.vuln = false; b.mode = 'hide';
        }
        yield 40;
      }
    },
    draw(b, ctx) {
      const gy = aG(), wh = b.flash > 0;
      if (b.mode === 'up') {
        const top = gy - 62 * b.ext;
        ctx.save(); ctx.beginPath(); ctx.rect(b.x - 4, G.camY - 10, 40, gy - G.camY + 10); ctx.clip();
        for (let y = top + 38; y < gy + 14; y += 12) drawSpr(ctx, SPR.bSeg, b.x + 1, y, false, wh);
        drawSpr(ctx, SPR.bDrill, b.x, top, false, wh);
        ctx.restore();
      } else if (b.mode === 'down') {
        const bot = G.camY + (gy - G.camY) * b.ext;
        ctx.save(); ctx.translate(Math.round(b.x + 14), Math.round(bot)); ctx.rotate(Math.PI);
        for (let y = 38; y < bot - G.camY + 14; y += 12) drawSpr(ctx, SPR.bSeg, -13, y, false, wh);
        drawSpr(ctx, SPR.bDrill, -14, 0, false, wh);
        ctx.restore();
      } else if (b.mode === 'side') {
        ctx.save();
        ctx.translate(Math.round(b.dir < 0 ? b.sx : b.sx + 64), Math.round(gy - 11)); ctx.rotate(b.dir < 0 ? -Math.PI / 2 : Math.PI / 2);
        for (let y = 38; y < 70; y += 12) drawSpr(ctx, SPR.bSeg, -13, y, false, wh);
        drawSpr(ctx, SPR.bDrill, -14, 0, false, wh);
        ctx.restore();
      }
    },
  },
  colossus: {
    name: 'FROST COLOSSUS', w: 44, h: 64, hp: 170,
    *script(b) {
      yield* bMove(b, aR() - b.w - 16, b.y, 0.8);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        b.face = pX() < b.cx ? -1 : 1;
        yield* bMove(b, clamp(pX() + (b.cx > pX() ? 70 : -70 - b.w), aL() + 6, aR() - b.w - 6), b.y, rage ? 0.9 : 0.6);
        b.face = pX() < b.cx ? -1 : 1;
        b.tele = 26; yield 26;
        bFan(b.cx + b.face * 22, b.y + 30, bAimAt(b.cx + b.face * 22, b.y + 30), rage ? 5 : 3, 0.2, 2.1); Snd.play('eshot');
        yield 44;
        b.arm = 30; yield 30;
        G.shake = 10; Snd.play('stomp'); eshot('wave', b.cx + b.face * 24, aG() - 5, b.face * 2.3, 0);
        bRain(randXs(rage ? 6 : 4), 'ice', 56);
        yield 110;
        for (let i = 0; i < 3; i++) { bLob(b.cx, b.y + 6, pX() + rand(-16, 16), 80, 'bomb'); Snd.play('gren'); yield 30; }
        yield 60;
      }
    },
    tick(b) { if (b.arm > 0) b.arm--; },
    draw(b, ctx) {
      const up = b.arm > 0 ? -Math.min(5, (30 - b.arm) >> 2) : 0;
      drawSpr(ctx, SPR.bColossus, b.x - 11, b.y - 4 + up, b.face < 0, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.cx + b.face * 24, b.y + 30, 3, '6');
    },
  },
  smelter: {
    name: 'SMELTER CORE', w: 44, h: 44, hp: 160,
    init(b) { b.contact = false; b.y = aG() - 118; b.x = aL() + VIEW_W / 2 - 22; b.arm = null; },
    *script(b) {
      yield 60;
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        for (let k = 0; k < (rage ? 3 : 2); k++) {
          const ax = clamp(pX(), aL() + 14, aR() - 14);
          b.arm = { x: ax, ext: 0 };
          G.markers.push({ x: ax, y: aG(), t: 42 });
          yield 42;
          while (b.arm.ext < 1) { b.arm.ext = Math.min(1, b.arm.ext + 0.125); yield 0; }
          G.shake = 8; Snd.play('stomp'); bWaves(ax - 10, ax + 10);
          yield 24;
          while (b.arm.ext > 0) { b.arm.ext = Math.max(0, b.arm.ext - 0.04); yield 0; }
          b.arm = null; yield 10;
        }
        for (let i = 0; i < (rage ? 5 : 3); i++) {
          b.tele = 16; yield 16;
          bFan(b.cx, b.cy + 10, Math.PI / 2 + Math.sin(b.t * 0.1) * 0.5, 5, 0.38, 1.7); Snd.play('eshot'); yield 26;
        }
        yield 30;
        bRain(randXs(rage ? 6 : 4), 'fire', 50);
        yield 110;
      }
    },
    tick(b) {
      b.x = aL() + VIEW_W / 2 - 22; b.y = aG() - 118;
      const a = b.arm;
      if (a && a.ext > 0.35) {
        const box = { x: a.x - 12, y: G.camY, w: 24, h: (aG() - G.camY) * a.ext };
        if (aabb(box, G.player)) hurtPlayer(1, a.x);
      }
    },
    draw(b, ctx) {
      const a = b.arm;
      if (a) {
        const bot = G.camY + (aG() - G.camY) * a.ext, x = Math.round(a.x);
        ctx.fillStyle = PAL['0']; ctx.fillRect(x - 6, G.camY - 2, 12, bot - G.camY - 16);
        ctx.fillStyle = PAL['2']; ctx.fillRect(x - 5, G.camY - 2, 10, bot - G.camY - 16);
        ctx.fillStyle = PAL['4']; ctx.fillRect(x - 4, G.camY - 2, 2, bot - G.camY - 16);
        drawSpr(ctx, SPR.bPiston, x - 13, bot - 20);
      }
      ctx.fillStyle = PAL['1']; ctx.fillRect(Math.round(b.x) + 10, G.camY - 2, 24, b.y - G.camY + 6);
      ctx.fillStyle = PAL['3']; ctx.fillRect(Math.round(b.x) + 12, G.camY - 2, 3, b.y - G.camY + 6);
      drawSpr(ctx, SPR.bSmelter, b.x - 4, b.y - 4, false, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.cx, b.cy, 6, '6');
    },
  },
  skitter: {
    name: 'SKITTER QUEEN', w: 60, h: 26, hp: 190,
    init(b) { b.y = aG() - 18 - b.h; },
    *script(b) {
      const gyv = () => aG() - 18 - b.h;
      yield* bMove(b, aR() - b.w - 10, gyv(), 1.2);
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        b.face = pX() < b.cx ? -1 : 1;
        b.tele = 24; yield 24;
        for (let i = 0; i < (rage ? 8 : 6); i++) { eshot('orb', b.cx + b.face * 32, aG() - 16, b.face * 2.2, 0); Snd.play('eshot'); yield 8; }
        yield 30;
        for (let i = 0; i < 2; i++) { b.tele = 20; yield 20; eshot('shell', b.cx + b.face * 32, aG() - 7, b.face * 2.4, 0); Snd.play('rocket'); yield 34; }
        b.squat = 24; yield 24;
        { // leap across the roof
          const tx = b.cx > aL() + VIEW_W / 2 ? aL() + 10 : aR() - b.w - 10, x0 = b.x, y0 = gyv(), T = 50;
          for (let k = 1; k <= T; k++) { b.x = lerp(x0, tx, k / T); b.y = y0 - Math.sin((Math.PI * k) / T) * 84; yield 0; }
          b.y = y0; G.shake = 10; Snd.play('stomp'); bWaves(b.x, b.x + b.w);
        }
        b.face = pX() < b.cx ? -1 : 1;
        yield 30;
        spawnEnemy('roller', b.cx, aG(), {});
        if (rage) spawnEnemy('roller', b.cx + b.face * 24, aG(), {});
        yield 70;
      }
    },
    tick(b) { if (b.squat > 0) b.squat--; },
    draw(b, ctx) {
      const gy = aG(), air = b.y < gy - 18 - b.h - 4, sq = b.squat > 0 ? 4 : 0;
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1, k = i % 3;
        const hx = b.cx + side * (8 + k * 9), hy = b.y + 20 + sq;
        const fx = air ? hx + side * 12 : Math.round((hx + side * (10 + k * 6)) / 14) * 14 + side * 4;
        drawLeg(ctx, hx, hy, fx, air ? b.y + b.h + 22 : gy, side * 8, '2');
      }
      drawSpr(ctx, SPR.bSkitter, b.x - 3, b.y - 2 + sq, b.face < 0, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.cx + b.face * 32, gy - 12, 3, '6');
    },
  },
  tempest: {
    name: 'TEMPEST CANNON', w: 58, h: 72, hp: 210,
    init(b) { b.beam = 0; b.charge = 0; },
    *script(b) {
      yield* bMove(b, aR() - b.w - 2, b.y, 0.8);
      b.set = true;
      for (;;) {
        const rage = b.hp < b.maxhp * 0.5;
        for (let i = 0; i < (rage ? 3 : 2); i++) { spawnEnemy('missile', b.x + 40, b.y + 2, { ang: -2.2, sp: 1.5 }); Snd.play('rocket'); yield 38; }
        yield 50;
        for (let i = 0; i < 3; i++) {
          b.tele = 14; yield 14;
          bFan(b.x, b.y + 32, bAimAt(b.x, b.y + 32), 3, 0.18, 2); Snd.play('eshot'); yield 30;
        }
        yield 30;
        b.charge = 76; Snd.play('charge'); yield 76;
        b.beam = rage ? 70 : 50; Snd.play('beam'); G.shake = 6;
        yield b.beam + 12;
        spawnEnemy(rage ? 'elite' : 'grunt', aL() + VIEW_W * 0.25, aG(), { drop: true });
        if (rage) spawnEnemy('grunt', aL() + VIEW_W * 0.5, aG(), { drop: true });
        yield 90;
      }
    },
    tick(b) {
      if (b.set) b.x = aR() - b.w - 2;
      if (b.charge > 0) b.charge--;
      if (b.beam > 0) {
        b.beam--;
        const box = { x: aL(), y: aG() - 22, w: b.x - aL(), h: 16 };
        if (aabb(box, G.player)) hurtPlayer(1, b.x);
        if (b.beam % 2 === 0) part('px', aL() + Math.random() * (b.x - aL()), aG() - 14 + rand(-8, 8), -2, 0, 8, '6', 2);
      }
    },
    draw(b, ctx) {
      const y0 = aG() - 22;
      if (b.charge > 0) {
        ctx.fillStyle = (b.charge >> 1) & 1 ? PAL.R : PAL.m;
        for (let x = aL(); x < b.x; x += 6) ctx.fillRect(Math.round(x), y0 + 8, 3, 1);
        pxCirc(ctx, b.x - 2, y0 + 8, 2 + ((76 - b.charge) >> 4), (b.charge >> 1) & 1 ? '6' : 'c');
      }
      if (b.beam > 0) {
        const th = b.beam > 6 ? 16 : b.beam * 2;
        ctx.fillStyle = PAL.B; ctx.fillRect(aL(), y0 + 8 - th / 2, b.x - aL() + 4, th);
        ctx.fillStyle = PAL.c; ctx.fillRect(aL(), y0 + 8 - th / 2 + 2, b.x - aL() + 4, Math.max(0, th - 4));
        ctx.fillStyle = PAL['6']; ctx.fillRect(aL(), y0 + 8 - th / 4, b.x - aL() + 4, th / 2);
      }
      drawSpr(ctx, SPR.bTempest, b.x - 2, b.y - 4, true, b.flash > 0);
      if (blink(b)) pxCirc(ctx, b.x, b.y + 32, 3, '6');
    },
  },
  overseer: {
    name: 'THE OVERSEER', w: 56, h: 54, hp: 300,
    init(b) {
      b.y = aG() - 114; b.phase = 1;
      b.hands = [{ x: aR() + 30, y: b.y, st: 0, ox: -32, oy: 4 }, { x: aR() + 30, y: b.y + 30, st: 0, ox: -26, oy: 42 }];
    },
    *script(b) {
      yield* bMove(b, aR() - b.w - 22, aG() - 114, 1);
      while (b.hp > b.maxhp * 0.5) {
        for (const h of b.hands) {
          if (b.hp <= b.maxhp * 0.5) break;
          const hx = clamp(pX() - 12, aL() + 4, aR() - 28);
          h.st = 1;
          yield* bMove(h, hx, aG() - 92, 3.2);
          G.markers.push({ x: hx + 12, y: aG(), t: 26 });
          yield 26;
          yield* bMove(h, hx, aG() - 24, 6);
          G.shake = 8; Snd.play('stomp'); bWaves(hx, hx + 24);
          yield 30;
          h.st = 0; yield 20;
        }
        b.tele = 30; yield 30;
        bFan(b.cx, b.cy, bAimAt(b.cx, b.cy), 7, 0.26, 1.8); Snd.play('eshot');
        yield 50;
        for (let i = 0; i < 3; i++) {
          for (const h of b.hands) { const a = bAimAt(h.x + 12, h.y + 12); eshot('orb', h.x + 12, h.y + 12, Math.cos(a) * 2, Math.sin(a) * 2); }
          Snd.play('eshot'); yield 32;
        }
        yield 40;
      }
      // the shell cracks open
      b.vuln = false; G.eshots.length = 0;
      for (let i = 0; i < 60; i++) {
        if (i % 6 === 0) { const h = b.hands[(i / 6) & 1]; boom(h.x + rand(0, 24), h.y + rand(0, 24), 14); boom(b.x + rand(0, b.w), b.y + rand(0, b.h), 16); Snd.play('boom'); }
        yield 0;
      }
      Snd.play('bigboom'); G.shake = 12;
      b.hands = []; b.phase = 2; b.x += 8; b.y += 6; b.w = 40; b.h = 40; b.vuln = true;
      yield 40;
      for (let k = 1; ; k++) {
        yield* bMove(b, aL() + 20 + Math.random() * (VIEW_W - 40 - b.w), aG() - 70 - Math.random() * 50, 1.6);
        for (let i = 0; i < 16; i++) { bFan(b.cx, b.cy, i * 0.45 + k, 2, Math.PI, 1.6); if (i % 2 === 0) Snd.play('eshot'); yield 7; }
        yield 30;
        b.tele = 34; yield 34;
        yield* bMove(b, clamp(pX() - b.w / 2, aL() + 4, aR() - b.w - 4), aG() - b.h - 2, 4.2);
        G.shake = 8; Snd.play('stomp'); bWaves(b.x, b.x + b.w);
        yield 22;
        yield* bMove(b, b.x, aG() - 112, 2);
        bRain(randXs(5), 'fire', 50);
        if (k % 2 === 0) { spawnEnemy('flit', aL() + 30, aG(), { h: 90 }); spawnEnemy('flit', aR() - 30, aG(), { h: 90 }); }
        yield 90;
      }
    },
    tick(b) {
      for (const h of b.hands) {
        if (h.st === 0) { h.x = lerp(h.x, b.x + h.ox, 0.08); h.y = lerp(h.y, b.y + h.oy + Math.sin(b.t * 0.06 + h.oy) * 3, 0.08); }
        if (b.vuln && aabb({ x: h.x + 2, y: h.y + 2, w: 20, h: 20 }, G.player)) hurtPlayer(1, h.x + 12);
      }
    },
    draw(b, ctx) {
      const wh = b.flash > 0;
      if (b.phase === 1) {
        drawSpr(ctx, SPR.bOverseer, b.x - 2, b.y - 6 + Math.sin(b.t * 0.05) * 2, false, wh);
        for (const h of b.hands) drawSpr(ctx, SPR.bFist, h.x, h.y);
        if (blink(b)) pxCirc(ctx, b.cx - 1, b.cy - 1, 7, '6');
      } else {
        ctx.save(); ctx.translate(Math.round(b.cx), Math.round(b.cy)); ctx.rotate(Math.floor(b.t / 6) * (Math.PI / 8));
        drawSpr(ctx, SPR.bCore, -22, -22, false, wh); ctx.restore();
        if (blink(b)) pxCirc(ctx, b.cx, b.cy, 8, '6');
      }
    },
  },
};

class Boss {
  constructor(type) {
    const d = BDEF[type];
    this.type = type; this.d = d; this.name = d.name;
    this.w = d.w; this.h = d.h;
    this.maxhp = this.hp = Math.round(d.hp * G.diff.bhp);
    this.x = aR() + 24; this.y = aG() - d.h;
    this.t = 0; this.flash = 0; this.wait = 0; this.dying = 0; this.tele = 0;
    this.vuln = true; this.contact = true; this.face = -1; this.dead = false;
    if (d.init) d.init(this);
    this.co = d.script(this);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  boxes() { return this.d.boxes ? this.d.boxes(this) : [this]; }
  hurt(dmg) {
    if (!this.vuln || this.dying) return false;
    this.hp -= dmg; this.flash = 3;
    if (this.hp <= 0) {
      this.hp = 0; this.dying = 1;
      G.eshots.length = 0; G.timers.length = 0; G.markers.length = 0;
      for (const e of G.enemies) e.die(false);
    }
    return true;
  }
  update() {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.tele > 0) this.tele--;
    if (this.dying) {
      this.dying++;
      const bs = this.boxes(), bx = bs[0] || this;
      if (this.dying % 7 === 0 && this.dying < 130) { boom(bx.x + rand(0, bx.w), bx.y + rand(0, bx.h), randi(12, 22)); Snd.play('boom'); }
      if (this.dying === 130) { boom(bx.x + bx.w / 2, bx.y + bx.h / 2, 44); Snd.play('bigboom'); G.shake = 14; debris(bx.x + bx.w / 2, bx.y + bx.h / 2, ['3', '4', '2', '5'], 24); }
      if (this.dying > 150) this.dead = true;
      return;
    }
    if (this.d.tick) this.d.tick(this);
    if (this.wait > 0) this.wait--;
    else { const r = this.co.next(); this.wait = typeof r.value === 'number' ? r.value : 0; }
    if (this.contact && this.vuln) { for (const b of this.boxes()) if (aabb(b, G.player)) { hurtPlayer(1, b.x + b.w / 2); break; } }
  }
  draw(ctx) {
    if (this.dying > 130) return;
    if (this.dying && (this.dying >> 1) & 1) this.flash = 1;
    this.d.draw(this, ctx);
  }
}
