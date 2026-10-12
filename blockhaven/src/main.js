// ---------------------------------------------------------------------------
// Rendering orchestration, UI, input, save/load and the main loop.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
let renderer, canvas;

// ---- Sky / lighting parameters --------------------------------------------------
function skyParams(t) {
  const a = t * Math.PI * 2;
  const sunDir = V3.norm([Math.cos(a), Math.sin(a), 0.34]);
  const h = sunDir[1];
  const day = smoothstep(-0.18, 0.22, h);
  const sunset = Math.max(0, 1 - Math.abs(h) / 0.38) * smoothstep(-0.3, -0.05, h);
  let zenith = V3.mix([0.0035, 0.006, 0.02], [0.085, 0.24, 0.78], day);
  let horizon = V3.mix([0.016, 0.024, 0.055], [0.36, 0.56, 0.9], day);
  horizon = V3.mix(horizon, [1.0, 0.5, 0.25], sunset * 0.6);
  zenith = V3.mix(zenith, [0.2, 0.22, 0.45], sunset * 0.25);
  const glowK = sunset * 1.1;
  const sunGlow = [1.0 * glowK + 0.16 * day, 0.48 * glowK + 0.14 * day, 0.18 * glowK + 0.1 * day];
  const sunUp = smoothstep(-0.03, 0.14, h);
  const moonUp = smoothstep(-0.03, 0.14, -h);
  const sunCol = V3.mix([1.0, 0.42, 0.16], [1.0, 0.93, 0.83], smoothstep(0.0, 0.42, h));
  let lightDir, lightColor;
  if (h > 0) { lightDir = sunDir; lightColor = V3.scale(sunCol, 1.85 * sunUp); }
  else { lightDir = [-sunDir[0], -sunDir[1], -sunDir[2]]; lightColor = V3.scale([0.5, 0.6, 0.9], 0.22 * moonUp); }
  let ambient = V3.mix([0.032, 0.042, 0.088], [0.42, 0.49, 0.62], day);
  ambient = V3.mix(ambient, [0.62, 0.48, 0.42], sunset * 0.35 * day);
  const cloudColor = V3.mix(V3.mix([0.05, 0.06, 0.09], [1.0, 1.0, 1.04], day), [1.0, 0.6, 0.42], sunset * 0.7);
  return {
    sunDir, lightDir, lightColor, zenith, horizon, sunGlow, ambient, cloudColor, day, night: 1 - day,
    sunDisc: V3.scale(sunCol, sunUp * 1.0 + 0.2), torch: [1.55, 1.12, 0.76], exposure: 0.92 + (1 - day) * 0.45,
  };
}

function cameraBasis(yaw, pitch, roll) {
  const cp = Math.cos(pitch);
  const fwd = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  let right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  let up = V3.cross(right, fwd);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s];
    up = [up[0] * c - right[0] * s, up[1] * c - right[1] * s, up[2] * c - right[2] * s];
    right = r2;
  }
  return { fwd, right, up };
}

function shadowMatrix(cam, lightDir, fwd, S, size) {
  const f = [-lightDir[0], -lightDir[1], -lightDir[2]];
  const up0 = Math.abs(f[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const r = V3.norm(V3.cross(f, up0));
  const u = V3.cross(r, f);
  const c = [cam[0] + fwd[0] * S * 0.4, cam[1], cam[2] + fwd[2] * S * 0.4];
  const texel = (2 * S) / size;
  const cr = Math.floor(V3.dot(c, r) / texel) * texel, cu = Math.floor(V3.dot(c, u) / texel) * texel, cf = V3.dot(c, f);
  const tx = V3.dot(r, cam) - cr, ty = V3.dot(u, cam) - cu, tz = -(V3.dot(f, cam) - cf);
  const view = new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, tx, ty, tz, 1]);
  const D = 170;
  const ortho = new Float32Array([1 / S, 0, 0, 0, 0, 1 / S, 0, 0, 0, 0, -1 / D, 0, 0, 0, 0, 1]);
  return M4.mul(ortho, view);
}

let lastFrame = null;
const timeStart = performance.now();
function buildFrame(cam, yaw, pitch, roll, fovDeg) {
  const W = canvas.width, H = canvas.height;
  const t = ((G.days % 1) + 1) % 1;
  const sp = skyParams(t);
  const { fwd, right, up } = cameraBasis(yaw, pitch, roll);
  const fov = (fovDeg * Math.PI) / 180;
  const far = settings.dist * 16 * 1.6 + 80;
  const proj = M4.persp(fov, W / H, 0.05, far);
  const view = M4.viewRot(right, up, fwd);
  const vp = M4.mul(proj, view);
  const tanY = Math.tan(fov / 2), tanX = tanY * (W / H);
  const underwater = P.eyeIn && G.state !== 'title' ? P.eyeIn : 0;
  const fogFar = settings.dist * 16 - 6;
  const f = Object.assign(sp, {
    vp, proj, view, camPos: cam, fwd, right, up, tanHalf: [tanX, tanY], time: (performance.now() - timeStart) / 1000,
    cloudCover: 0.55, fogFar, fogNear: fogFar * 0.72, underwater, wind: 1,
    waterFog: V3.mix([0.006, 0.02, 0.05], [0.07, 0.2, 0.38], sp.day),
    pxScale: H / (2 * tanY),
  });
  const shadowWanted = settings.shadows && sp.lightColor[0] > 0.05;
  const size = shadowWanted ? (settings.hq ? 2048 : 1024) : 0;
  if (shadowWanted && renderer.shadowSize !== size) renderer.setShadowSize(size);
  f.shadowOn = shadowWanted && renderer.shadowSize > 0;
  f.shadowVP = f.shadowOn ? shadowMatrix(cam, sp.lightDir, fwd, settings.hq ? 80 : 56, renderer.shadowSize) : M4.ident();
  return f;
}

function renderScene(f) {
  const gl = renderer.gl;
  // Collect chunk meshes
  const planes = renderer.frustum(f.vp);
  const vis = [], all = [];
  for (const c of world.chunks.values()) {
    if (!c.mesh && !c.tmesh) continue;
    all.push(c);
    const ox = c.cx * 16 - f.camPos[0], oz = c.cz * 16 - f.camPos[2], oy = -f.camPos[1];
    if (!renderer.boxVisible(planes, ox, oy, oz, ox + 16, oy + CH, oz + 16)) continue;
    c._d = (ox + 8) * (ox + 8) + (oz + 8) * (oz + 8);
    vis.push(c);
  }
  vis.sort((a, b) => a._d - b._d);
  if (f.shadowOn) renderer.renderShadows(all, f);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  renderer.renderSky(f);
  renderer.renderChunks(vis, f, false);
  drawEntities(f);
  if (G.state !== 'title') drawTargetOverlay(f);
  const n = Particles.fill(f.camPos);
  renderer.drawParticles(f, Particles.buf, n);
  const tvis = vis.filter((c) => c.tmesh).reverse();
  renderer.renderChunks(tvis, f, true);
  if (G.state !== 'title' && G.state !== 'dead' && !G.hideHud) drawHeld(f);
  G.stats = { vis: vis.length, all: all.length };
}

function partMatrix(root, p, ang, headYaw) {
  let mm = M4.translate(root, px(p.pivot[0]), px(p.pivot[1]), px(p.pivot[2]));
  if (p.head) mm = M4.rotY(mm, headYaw);
  if (ang) mm = M4.rotX(mm, ang);
  mm = M4.translate(mm, px(p.off[0]), px(p.off[1]), px(p.off[2]));
  return M4.scale(mm, px(p.size[0]), px(p.size[1]), px(p.size[2]));
}
function drawEntities(f) {
  const gl = renderer.gl;
  const cam = f.camPos;
  renderer.beginEntities(f);
  const u = renderer.progs.ent.u;
  for (const m of Mobs.list) {
    const dx = m.x - cam[0], dz = m.z - cam[2];
    if (dx * dx + dz * dz > (settings.dist * 16) ** 2) continue;
    let root = M4.trs(dx, m.y - cam[1], dz, m.yaw, 0, 1, 1, 1);
    if (m.dead) root = M4.rotZ(root, Math.min(1, m.deathT * 3) * Math.PI / 2);
    const light = lightAt(m.x, m.y + m.h * 0.6, m.z);
    const flash = m.hurt > 0 || m.dead;
    gl.uniform3f(u.uFlash, flash ? 0.45 : 0, 0, 0);
    for (const p of m.T.parts) {
      let ang = 0;
      if (p.leg !== undefined) ang = Math.sin(m.walk) * 0.75 * m.walkAmt * (p.leg ? 1 : -1);
      if (p.arm !== undefined) ang = -Math.PI / 2 + Math.sin(f.time * 1.3 + p.arm * 2) * 0.05 + Math.sin(m.walk) * 0.25 * m.walkAmt * (p.arm ? 1 : -1);
      const mm = partMatrix(root, p, ang, m.headYaw);
      renderer.drawBox(mm, [px(p.size[0]), px(p.size[1]), px(p.size[2])], p.layers, p.tile, light);
    }
  }
  gl.uniform3f(u.uFlash, 0, 0, 0);
  // Dropped items
  for (const d of Drops.list) {
    const light = lightAt(d.x, d.y + 0.2, d.z);
    const bob = Math.sin(d.age * 2.6 + d.spin) * 0.06 + 0.16;
    const spin = d.age * 1.7 + d.spin;
    const isCube = d.id < 256 && (BLOCKS[d.id].model === 'cube');
    const copies = d.n > 1 ? 2 : 1;
    for (let k = 0; k < copies; k++) {
      const ox = k ? 0.08 : 0, oy = k ? 0.06 : 0;
      renderer.setTint(d.id < 256 && BLOCKS[d.id].tint ? world.gen.tintAt(Math.floor(d.x), Math.floor(d.z)) : null);
      if (isCube) {
        const mm = M4.trs(d.x - cam[0] + ox, d.y - cam[1] + bob + oy, d.z - cam[2] + ox, spin, 0, 0.25, 0.25, 0.25);
        renderer.drawBox(mm, [0.25, 0.25, 0.25], BLOCKS[d.id].texL, false, light);
      } else {
        const layer = d.id < 256 ? BLOCKS[d.id].texL[0] : ITEMS[d.id].tex;
        const mm = M4.trs(d.x - cam[0] + ox, d.y - cam[1] + bob + 0.08 + oy, d.z - cam[2] + ox, spin, 0, 0.42, 0.42, 0.42);
        renderer.drawQuad(mm, layer, light);
      }
      renderer.setTint(null);
    }
  }
  for (const fb of Falling.list) {
    const mm = M4.trs(fb.x - cam[0], fb.y + 0.5 - cam[1], fb.z - cam[2], 0, 0, 0.999, 0.999, 0.999);
    renderer.drawBox(mm, [1, 1, 1], BLOCKS[fb.id].texL, false, lightAt(fb.x, fb.y + 0.5, fb.z));
  }
  renderer.endEntities();
}
function drawTargetOverlay(f) {
  const gl = renderer.gl;
  if (target && target.kind === 'block' && G.state === 'play') {
    const b = BLOCKS[target.id];
    if (b.model === 'torch') renderer.drawSelection(f, target.x + 0.4, target.y, target.z + 0.4, 0.2, 0.65, 0.2);
    else if (b.model === 'cross') renderer.drawSelection(f, target.x + 0.15, target.y, target.z + 0.15, 0.7, 0.85, 0.7);
    else renderer.drawSelection(f, target.x - 0.002, target.y - 0.002, target.z - 0.002, 1.004, 1.004, 1.004);
  }
  if (P.mining && P.mining.p > 0) {
    const stage = Math.min(9, Math.floor(P.mining.p * 10));
    const L = TEX['crack_' + stage];
    renderer.beginEntities(f);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    gl.uniform1f(renderer.progs.ent.u.uUnlit, 1);
    gl.uniform4f(renderer.progs.ent.u.uColor, 0.25, 0.25, 0.25, 0.9);
    const m = P.mining;
    const mm = M4.trs(m.x + 0.5 - f.camPos[0], m.y + 0.5 - f.camPos[1], m.z + 0.5 - f.camPos[2], 0, 0, 1.003, 1.003, 1.003);
    renderer.drawBox(mm, [1, 1, 1], [L, L, L, L, L, L], false, [1, 0]);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);
    renderer.endEntities();
  }
}
function drawHeld(f) {
  const gl = renderer.gl;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const held = Inv.held();
  const id = held ? held.id : 0;
  const { right, up, fwd } = f;
  const camToWorld = new Float32Array([right[0], right[1], right[2], 0, up[0], up[1], up[2], 0, -fwd[0], -fwd[1], -fwd[2], 0, 0, 0, 0, 1]);
  const sw = P.swing > 0 ? Math.sin((1 - P.swing) * Math.PI) : 0;
  const bobOn = settings.bob ? 1 : 0;
  const bx = Math.sin(P.bob) * 0.03 * P.bobAmt * bobOn, by = -Math.abs(Math.cos(P.bob)) * 0.035 * P.bobAmt * bobOn;
  const light = lightAt(P.x, P.y + P.eyeH, P.z);
  renderer.beginEntities(f);
  let m = M4.mul(camToWorld, M4.ident());
  const isCube = id && id < 256 && BLOCKS[id].model === 'cube';
  renderer.setTint(id && id < 256 && BLOCKS[id].tint ? world.gen.tintAt(Math.floor(P.x), Math.floor(P.z)) : null);
  if (!id) {
    m = M4.translate(m, 0.52 + bx - sw * 0.2, -0.52 + by + sw * 0.12, -0.62 - sw * 0.15);
    m = M4.rotY(m, -0.25 + sw * 0.3);
    m = M4.rotX(m, 0.35 - sw * 0.8);
    m = M4.scale(m, 0.2, 0.2, 0.7);
    renderer.drawBox(m, [0.2, 0.2, 0.7], L6(TEX.player_skin), true, light);
  } else if (isCube) {
    m = M4.translate(m, 0.56 + bx - sw * 0.24, -0.5 + by + sw * 0.16, -0.9 - sw * 0.12);
    m = M4.rotX(m, -sw * 0.6);
    m = M4.rotY(m, Math.PI / 4 + sw * 0.4);
    m = M4.scale(m, 0.3, 0.3, 0.3);
    renderer.drawBox(m, [0.3, 0.3, 0.3], BLOCKS[id].texL, false, light);
  } else {
    const layer = id < 256 ? BLOCKS[id].texL[0] : ITEMS[id].tex;
    m = M4.translate(m, 0.56 + bx - sw * 0.2, -0.42 + by + sw * 0.1, -0.92 - sw * 0.1);
    m = M4.rotX(m, -sw * 1.1);
    m = M4.rotY(m, -1.25);
    m = M4.rotZ(m, 0.3);
    // a few stacked slices give the flat sprite some thickness
    for (let k = 0; k < 4; k++) {
      const mk = M4.scale(M4.translate(m, 0, 0, (k - 1.5) * 0.01), 0.5, 0.5, 0.5);
      renderer.drawQuad(mk, layer, light);
    }
  }
  renderer.endEntities();
}

// ---- UI -------------------------------------------------------------------------
const UI = {
  toastT: 0, nameT: 0, invStation: null, invOpen: false,
  lastHot: [], hearts: {}, settingsFrom: 'title',
  init() {
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div'); s.className = 'slot'; s.dataset.i = i;
      s.innerHTML = '<img alt=""><span class="count"></span>';
      s.addEventListener('pointerdown', (e) => { if (G.state === 'play') { e.stopPropagation(); Inv.sel = i; Inv.dirty = true; UI.showItemName(); } });
      hb.appendChild(s);
    }
    this.makeIcons();
    // Inventory grids
    const mk = (parent, i) => {
      const s = document.createElement('div'); s.className = 'slot click'; s.dataset.i = i;
      s.innerHTML = '<img alt=""><span class="count"></span>';
      s.addEventListener('mousedown', (e) => { e.preventDefault(); slotClick(i, e.button, e.shiftKey); UI.renderInventory(); });
      s.addEventListener('mouseenter', () => { const it = Inv.slots[i]; UI.tip(it ? itemName(it.id) : null, s); });
      s.addEventListener('mouseleave', () => UI.tip(null));
      if (IS_TOUCH) s.addEventListener('touchstart', (e) => { e.preventDefault(); slotClick(i, 0, false); UI.renderInventory(); }, { passive: false });
      parent.appendChild(s);
    };
    for (let i = 9; i < 36; i++) mk($('inv-main'), i);
    for (let i = 0; i < 9; i++) mk($('inv-hot'), i);
    $('inventory').addEventListener('contextmenu', (e) => e.preventDefault());
    $('inventory').addEventListener('pointermove', (e) => { const c = $('cursor-item'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; const t = $('tooltip'); t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY - 30) + 'px'; });
    $('inventory').addEventListener('mousedown', (e) => {
      if (e.target === $('inventory') && Inv.cursor) { // click outside the panel drops the held stack
        if (G.mode === 'survival') { const d = lookDir(); Drops.spawn(Inv.cursor.id, Inv.cursor.n, P.x + d[0], P.y + 1.4, P.z + d[2], d[0] * 4, 2, d[2] * 4, 1.5); }
        Inv.cursor = null; UI.renderInventory();
      }
    });
    $('b-inv-close').addEventListener('click', () => UI.closeInventory());
  },
  makeIcons() {
    const paint = (rows, pal) => {
      const c = document.createElement('canvas'); c.width = 9; c.height = 9;
      const x = c.getContext('2d');
      rows.forEach((r, y) => { for (let i = 0; i < 9; i++) { const k = r[i]; if (pal[k]) { x.fillStyle = pal[k]; x.fillRect(i, y, 1, 1); } } });
      return c.toDataURL();
    };
    const H = ['.KK...KK.', 'KRRK.KRRK', 'KRWRKRRRK', 'KRRRRRRRK', 'KRRRRRRRK', '.KRRRRRK.', '..KRRRK..', '...KRK...', '....K....'];
    const half = H.map((r) => r.split('').map((ch, i) => (i >= 5 && (ch === 'R' || ch === 'W') ? 'D' : ch)).join(''));
    this.hearts.full = paint(H, { K: '#1a0606', R: '#e0262d', W: '#ff9d9d' });
    this.hearts.half = paint(half, { K: '#1a0606', R: '#e0262d', W: '#ff9d9d', D: '#3c1214' });
    this.hearts.empty = paint(H, { K: '#1a0606', R: '#3c1214', W: '#3c1214' });
    const BB = ['..KKKKK..', '.KBBBBBK.', 'KBWWBBBBK', 'KBWBBBBBK', 'KBBBBBBBK', 'KBBBBBBBK', 'KBBBBBBBK', '.KBBBBBK.', '..KKKKK..'];
    this.hearts.bubble = paint(BB, { K: '#0b2546', B: '#5fb0ff', W: '#e8f6ff' });
    const hh = $('hearts'), bb = $('bubbles');
    for (let i = 0; i < 10; i++) { const im = document.createElement('img'); im.alt = ''; hh.appendChild(im); const b2 = document.createElement('img'); b2.alt = ''; bb.appendChild(b2); }
  },
  tip(text, el) {
    const t = $('tooltip');
    if (!text) { t.hidden = true; return; }
    t.textContent = text; t.hidden = false;
    if (el) { const r = el.getBoundingClientRect(); t.style.left = (r.right + 6) + 'px'; t.style.top = (r.top - 4) + 'px'; }
  },
  screens: ['title', 'loading', 'pause', 'settings', 'inventory', 'death', 'help2'],
  showScreen(name) {
    for (const s of this.screens) $(s).hidden = s !== name;
    const inGame = G.state === 'play' || G.state === 'inventory' || G.state === 'paused' || G.state === 'dead';
    $('hud').hidden = !inGame || G.hideHud;
    $('touch').hidden = !(IS_TOUCH && G.state === 'play');
    $('fx-vignette').hidden = G.state === 'title';
  },
  toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; this.toastT = 2.6; },
  showItemName() {
    const s = Inv.held();
    $('itemname').textContent = s ? itemName(s.id) : '';
    $('itemname').style.opacity = s ? 1 : 0;
    this.nameT = 1.8;
  },
  hurtFlash() { const h = $('fx-hurt'); h.style.transition = 'none'; h.style.opacity = 1; requestAnimationFrame(() => { h.style.transition = 'opacity 0.6s'; h.style.opacity = 0; }); },
  showDeath(cause) { $('death-cause').textContent = cause || 'You died.'; this.showScreen('death'); },
  setSlot(el, s) {
    const img = el.firstChild, cnt = el.lastChild;
    const key = s ? s.id + ':' + s.n : '';
    if (el._key === key) return;
    el._key = key;
    if (s) { img.src = Tex.iconFor(s.id); img.style.visibility = 'visible'; cnt.textContent = s.n > 1 ? s.n : ''; }
    else { img.removeAttribute('src'); img.style.visibility = 'hidden'; cnt.textContent = ''; }
  },
  updateHUD(dt) {
    if (Inv.dirty) {
      const slots = $('hotbar').children;
      for (let i = 0; i < 9; i++) { this.setSlot(slots[i], Inv.slots[i]); slots[i].classList.toggle('sel', i === Inv.sel); }
      Inv.dirty = false;
      if (this.invOpen) this.renderInventory();
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').style.opacity = 0; }
    if (this.nameT > 0) { this.nameT -= dt; if (this.nameT <= 0) $('itemname').style.opacity = 0; }
    const surv = G.mode === 'survival';
    $('status').style.visibility = surv ? 'visible' : 'hidden';
    if (surv) {
      const hs = $('hearts').children;
      for (let i = 0; i < 10; i++) {
        const v = P.health - i * 2;
        const src = v >= 2 ? this.hearts.full : v === 1 ? this.hearts.half : this.hearts.empty;
        if (hs[i]._s !== src) { hs[i].src = src; hs[i]._s = src; }
        hs[i].style.transform = P.health <= 4 && G.state === 'play' ? `translateY(${Math.round(Math.sin(performance.now() / 70 + i) * 1.5)}px)` : '';
      }
      const bs = $('bubbles').children;
      const showB = P.air < 10;
      for (let i = 0; i < 10; i++) {
        const on = showB && P.air > (9 - i);
        bs[i].style.visibility = on ? 'visible' : 'hidden';
        if (on && bs[i]._s !== 1) { bs[i].src = this.hearts.bubble; bs[i]._s = 1; }
      }
    }
    const t = ((G.days % 1) + 1) % 1;
    const hours = (6 + t * 24) % 24;
    const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 6) * 10;
    const dayN = Math.floor(G.days + 0.25) + 1;
    const isDay = Math.sin(t * Math.PI * 2) > -0.05;
    const clk = `Day ${dayN} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (this._clk !== clk) { this._clk = clk; $('clock').lastChild.textContent = clk; $('clock').firstChild.style.background = isDay ? 'var(--amber)' : '#9db7ff'; }
    $('fx-water').style.opacity = P.eyeIn === 1 ? 1 : 0;
    if (G.debug) this.updateDebug();
  },
  updateDebug() {
    const fps = G.fps || 0;
    const c = G.gen ? G.gen.column(Math.floor(P.x), Math.floor(P.z)) : null;
    const l = world.getLight(Math.floor(P.x), Math.floor(P.y + 1), Math.floor(P.z));
    const yawDeg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const facing = ['north', 'east', 'south', 'west'][Math.round(((yawDeg) % 360) / 90) % 4];
    $('debug').textContent = [
      `Blockhaven  ${fps} fps`,
      `XYZ ${P.x.toFixed(2)} / ${P.y.toFixed(2)} / ${P.z.toFixed(2)}`,
      `Chunk ${Math.floor(P.x / 16)}, ${Math.floor(P.z / 16)}   facing ${facing}`,
      `Biome ${c ? BIOME_NAMES[c.biome] : '-'}   light sky ${l[0]} block ${l[1]}`,
      `Chunks ${G.stats ? G.stats.vis + ' drawn / ' + G.stats.all + ' meshed / ' + world.chunks.size + ' loaded' : ''}`,
      `Mobs ${Mobs.list.length}  items ${Drops.list.length}  particles ${Particles.list.length}`,
      `Seed ${G.seedText || G.seed}   ${world.syncMode ? 'main thread' : world.workers.length + ' workers'}`,
    ].join('\n');
  },
  // ---- Inventory screen ----
  openInventory(station) {
    if (G.state !== 'play') return;
    G.state = 'inventory';
    this.invOpen = true;
    this.invStation = station || null;
    Input.left = Input.right = false; P.mining = null;
    if (G.locked) { G.expectUnlock = true; document.exitPointerLock(); }
    const creative = G.mode === 'creative';
    $('inv-title').textContent = creative ? 'Creative inventory' : station === 'table' ? 'Crafting table' : station === 'furnace' ? 'Furnace' : 'Inventory';
    $('inv-left-label').textContent = creative ? 'All blocks and items' : 'Crafting';
    $('recipes').hidden = creative; $('palette').hidden = !creative;
    if (creative) this.buildPalette();
    this.stations = { table: station === 'table' || nearStation(B.CRAFTING_TABLE), furnace: station === 'furnace' || nearStation(B.FURNACE) };
    this.showScreen('inventory');
    this.renderInventory();
  },
  closeInventory() {
    if (!this.invOpen) return;
    this.invOpen = false;
    if (Inv.cursor) {
      const left = Inv.add(Inv.cursor.id, Inv.cursor.n);
      if (left && G.mode === 'survival') Drops.spawn(Inv.cursor.id, left, P.x, P.y + 1.4, P.z);
      Inv.cursor = null;
    }
    $('cursor-item').hidden = true;
    this.tip(null);
    G.state = 'play';
    this.showScreen(null);
    Input.lock();
  },
  buildPalette() {
    const pal = $('palette');
    if (pal.childElementCount) return;
    const ids = [];
    BLOCKS.forEach((b) => { if (b && b.creative && b.id !== B.LAVA) ids.push(b.id); });
    ids.push(B.LAVA);
    Object.keys(ITEMS).forEach((k) => ids.push(Number(k)));
    for (const id of ids) {
      const s = document.createElement('div'); s.className = 'slot click';
      s.innerHTML = '<img alt="">';
      s.firstChild.src = Tex.iconFor(id);
      s.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (Inv.cursor) { Inv.cursor = null; }
        else if (e.shiftKey) Inv.add(id, maxStack(id));
        else Inv.cursor = { id, n: e.button === 2 ? 1 : maxStack(id) };
        UI.renderInventory();
      });
      if (IS_TOUCH) s.addEventListener('touchstart', (e) => { e.preventDefault(); const empty = Inv.slots.findIndex((x, i) => i < 9 && !x); Inv.slots[empty >= 0 ? empty : Inv.sel] = { id, n: maxStack(id) }; Inv.dirty = true; UI.renderInventory(); UI.toast(itemName(id) + ' added to hotbar'); }, { passive: false });
      s.addEventListener('mouseenter', () => UI.tip(itemName(id), s));
      s.addEventListener('mouseleave', () => UI.tip(null));
      pal.appendChild(s);
    }
  },
  renderInventory() {
    const main = $('inv-main').children, hot = $('inv-hot').children;
    for (let i = 0; i < 27; i++) this.setSlot(main[i], Inv.slots[9 + i]);
    for (let i = 0; i < 9; i++) this.setSlot(hot[i], Inv.slots[i]);
    const ci = $('cursor-item');
    if (Inv.cursor) { ci.hidden = false; ci.firstChild.src = Tex.iconFor(Inv.cursor.id); ci.lastChild.textContent = Inv.cursor.n > 1 ? Inv.cursor.n : ''; }
    else ci.hidden = true;
    const hotSlots = $('hotbar').children;
    for (let i = 0; i < 9; i++) this.setSlot(hotSlots[i], Inv.slots[i]);
    if (G.mode === 'creative') { $('station-hint').textContent = IS_TOUCH ? 'Tap an item to put a stack in your hotbar.' : 'Click an item to pick up a stack, then click a slot. Shift-click adds it directly.'; return; }
    const list = $('recipes');
    list.textContent = '';
    const rows = RECIPES.map((r) => {
      const need = r.station && !this.stations[r.station];
      const ok = !need && r.ins.every((ing) => ingCount(ing) >= ing[1]);
      const some = r.ins.some((ing) => ingCount(ing) > 0);
      return { r, ok, need, score: ok ? 0 : some ? (need ? 2 : 1) : 3 };
    }).sort((a, b) => a.score - b.score);
    for (const { r, ok, need } of rows) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'recipe ' + (ok ? 'ok' : 'no');
      const ins = r.ins.map((ing) => {
        const have = ingCount(ing);
        return `<span class="${have >= ing[1] ? '' : 'miss'}"><img src="${Tex.iconFor(ingIcon(ing))}" alt=""> ${ingName(ing)} ${Math.min(have, ing[1])}/${ing[1]}</span>`;
      }).join('');
      el.innerHTML = `<div class="slot"><img src="${Tex.iconFor(r.out)}" alt="">${r.n > 1 ? '<span class="count">' + r.n + '</span>' : ''}</div>
        <div><div class="r-name">${itemName(r.out)}</div><div class="r-in">${ins}</div></div>
        <span class="r-st">${need ? (r.station === 'table' ? 'Needs crafting table' : 'Needs furnace') : ''}</span>`;
      el.addEventListener('click', (e) => {
        if (!ok) { Sfx.play('click'); return; }
        let times = e.shiftKey ? 64 : 1;
        while (times-- > 0 && r.ins.every((ing) => ingCount(ing) >= ing[1])) {
          r.ins.forEach(ingTake);
          const left = Inv.add(r.out, r.n);
          if (left) Drops.spawn(r.out, left, P.x, P.y + 1.4, P.z);
        }
        Sfx.play('craft');
        UI.renderInventory();
      });
      list.appendChild(el);
    }
    $('station-hint').textContent = this.stations.table ? (this.stations.furnace ? 'Crafting table and furnace nearby.' : 'Crafting table nearby. Place a furnace to smelt.') : 'Stand near a crafting table to make tools.';
  },
};
function slotClick(i, button, shift) {
  const s = Inv.slots[i];
  if (shift && s) {
    const range = i < 9 ? [9, 36] : [0, 9];
    let n = s.n;
    const ms = maxStack(s.id);
    for (let pass = 0; pass < 2 && n; pass++) for (let j = range[0]; j < range[1] && n; j++) {
      const t = Inv.slots[j];
      if (pass === 0 && t && t.id === s.id && t.n < ms) { const k = Math.min(ms - t.n, n); t.n += k; n -= k; }
      if (pass === 1 && !t) { Inv.slots[j] = { id: s.id, n }; n = 0; }
    }
    if (n) s.n = n; else Inv.slots[i] = null;
  } else if (button === 0) {
    const c = Inv.cursor;
    if (!c) { if (s) { Inv.cursor = s; Inv.slots[i] = null; } }
    else if (!s) { Inv.slots[i] = c; Inv.cursor = null; }
    else if (s.id === c.id) { const k = Math.min(maxStack(s.id) - s.n, c.n); s.n += k; c.n -= k; if (!c.n) Inv.cursor = null; }
    else { Inv.slots[i] = c; Inv.cursor = s; }
  } else if (button === 2) {
    const c = Inv.cursor;
    if (!c) { if (s) { const h = Math.ceil(s.n / 2); Inv.cursor = { id: s.id, n: h }; s.n -= h; if (!s.n) Inv.slots[i] = null; } }
    else if (!s) { Inv.slots[i] = { id: c.id, n: 1 }; c.n--; if (!c.n) Inv.cursor = null; }
    else if (s.id === c.id && s.n < maxStack(s.id)) { s.n++; c.n--; if (!c.n) Inv.cursor = null; }
  }
  Inv.dirty = true;
  Sfx.play('click', null, 0.5);
}

// ---- Settings UI ----------------------------------------------------------------
function initSettingsUI() {
  const ranges = [
    ['s-dist', 'dist', (v) => v | 0, (v) => v + ' chunks'],
    ['s-fov', 'fov', (v) => v | 0, (v) => v + '°'],
    ['s-sens', 'sens', parseFloat, (v) => v.toFixed(2) + '×'],
    ['s-vol', 'vol', parseFloat, (v) => Math.round(v * 100) + '%'],
    ['s-scale', 'scale', parseFloat, (v) => Math.round(v * 100) + '%'],
  ];
  for (const [id, key, parse, fmt] of ranges) {
    const el = $(id), out = $('o' + id.slice(1));
    el.value = settings[key]; out.textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = parse(el.value); out.textContent = fmt(settings[key]); saveSettings();
      if (key === 'vol') Sfx.setVolume(settings.vol);
    });
  }
  for (const key of ['shadows', 'hq', 'music', 'invert', 'bob']) {
    const el = $('s-' + key);
    el.checked = !!settings[key];
    el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); if (!settings.shadows) renderer.setShadowSize(0); });
  }
  $('b-set-done').addEventListener('click', () => {
    if (UI.settingsFrom === 'pause') UI.showScreen('pause'); else UI.showScreen('title');
  });
}

// ---- Save / load ------------------------------------------------------------------
function saveGame() {
  if (!G.active) return;
  const data = {
    v: 1, name: G.name, seed: G.seed, seedText: G.seedText, mode: G.mode, days: G.days, spawn: G.spawn,
    player: { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, health: P.health, flying: P.flying },
    inv: Inv.slots.map((s) => (s ? [s.id, s.n] : 0)), sel: Inv.sel, edits: world.serializeEdits(), saved: Date.now(),
  };
  if (!Store.set('blockhaven.world', data) && !G.warnedSave) { G.warnedSave = true; UI.toast('Could not save: browser storage is full or blocked'); }
}
function refreshTitle() {
  const save = Store.get('blockhaven.world', null);
  $('save-card').hidden = !save; $('b-continue').hidden = !save; $('new-warn').hidden = !save;
  if (save) {
    $('save-name').textContent = save.name || 'My world';
    const day = Math.floor((save.days || 0) + 0.25) + 1;
    $('save-meta').textContent = `${save.mode === 'creative' ? 'Creative' : 'Survival'} · Day ${day} · Seed ${save.seedText || save.seed}`;
  }
  return save;
}

// ---- Game flow --------------------------------------------------------------------
function beginWorld(save) {
  G.mode = save.mode || 'survival';
  G.name = save.name || 'My world';
  G.seedText = save.seedText || '';
  G.days = save.days === undefined ? 0.03 : save.days;
  if (world.seed !== save.seed >>> 0 || G.titleSeed !== save.seed || G.titleEditsFrom !== save.saved) {
    world.reset(save.seed, save.edits);
  }
  G.seed = save.seed >>> 0;
  G.gen = world.gen;
  Inv.slots = new Array(36).fill(null);
  if (save.inv) save.inv.forEach((s, i) => { if (s) Inv.slots[i] = { id: s[0], n: s[1] }; });
  Inv.sel = save.sel || 0; Inv.cursor = null; Inv.dirty = true;
  if (!save.inv && G.mode === 'creative') {
    [B.GRASS, B.STONE_BRICKS, B.PLANKS, B.GLASS, B.TORCH, B.BRICKS, B.OAK_LOG, B.WOOL_RED, B.GLOWSTONE].forEach((id, i) => { Inv.slots[i] = { id, n: 64 }; });
  }
  Mobs.list = []; Drops.list = []; Falling.list = []; Particles.list = [];
  if (save.spawn) G.spawn = save.spawn;
  else { const s = world.gen.findSpawn(); G.spawn = { x: s.x, y: s.h + 1, z: s.z }; }
  const p = save.player;
  P.x = p ? p.x : G.spawn.x; P.y = p ? p.y : G.spawn.y + 1; P.z = p ? p.z : G.spawn.z;
  P.yaw = p ? p.yaw : 0.6; P.pitch = p ? p.pitch : -0.1;
  P.health = p ? p.health : 20; P.flying = p ? !!p.flying && G.mode === 'creative' : false;
  P.vx = P.vy = P.vz = 0; P.air = 10; P.fall = 0; P.burn = 0;
  G.needsGround = !p;
  G.state = 'loading'; G.loadT = 0;
  $('b-play').hidden = true;
  $('load-title').textContent = 'Generating terrain';
  UI.showScreen('loading');
}
function finishLoading() {
  if (G.needsGround) {
    const top = world.topSolid(Math.floor(P.x), Math.floor(P.z));
    P.y = top + 1; G.spawn.y = P.y;
  }
  G.active = true;
  saveGame();
  if (IS_TOUCH) { G.state = 'play'; UI.showScreen(null); return; }
  $('load-title').textContent = 'World ready';
  $('load-text').textContent = 'Click Play to lock the mouse. Press Esc to pause.';
  $('b-play').hidden = false;
  $('b-play').focus();
  G.state = 'ready';
}
function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'paused';
  Input.left = Input.right = false; P.mining = null;
  if (G.locked) { G.expectUnlock = true; document.exitPointerLock(); }
  UI.showScreen('pause');
  saveGame();
}
function resumeGame() { G.state = 'play'; UI.showScreen(null); Input.lock(); }
function quitToTitle() {
  saveGame();
  G.active = false;
  G.state = 'title';
  G.titleSeed = G.seed; G.titleEditsFrom = (Store.get('blockhaven.world', {}) || {}).saved;
  G.titleCenter = [P.x, P.y, P.z];
  refreshTitle();
  showMenu('menu-main');
  UI.showScreen('title');
}
function showMenu(id) { for (const m of ['menu-main', 'menu-new', 'menu-help']) $(m).hidden = m !== id; }

// ---- Input wiring -----------------------------------------------------------------
function initInput() {
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    const was = G.locked;
    G.locked = document.pointerLockElement === canvas;
    if (G.locked) G.lockFails = 0;
    if (was && !G.locked) {
      Input.left = Input.right = false;
      if (G.expectUnlock) G.expectUnlock = false;
      else if (G.state === 'play') pauseGame();
    }
  });
  document.addEventListener('pointerlockerror', () => Input.lockFailed());
  let drag = null;
  canvas.addEventListener('mousedown', (e) => {
    if (IS_TOUCH && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (G.state !== 'play') return;
    Sfx.init();
    if (!G.locked && !G.dragLook) { Input.lock(); return; }
    if (G.dragLook) drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
    if (e.button === 0) Input.left = true;
    if (e.button === 2) { if (G.dragLook) drag.place = true; else Input.right = true; }
    if (e.button === 1) { e.preventDefault(); pickBlock(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) Input.left = false;
    if (e.button === 2) {
      Input.right = false;
      if (drag && drag.place && !drag.moved && G.state === 'play') useItem();
    }
    drag = null;
  });
  document.addEventListener('mousemove', (e) => {
    if (G.state !== 'play') return;
    const inv = settings.invert ? -1 : 1;
    if (G.locked) {
      const mx = Math.max(-200, Math.min(200, e.movementX)), my = Math.max(-200, Math.min(200, e.movementY));
      P.yaw -= mx * 0.0022 * settings.sens;
      P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - my * 0.0022 * settings.sens * inv));
    } else if (G.dragLook && drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; Input.left = false; }
      if (drag.moved) {
        P.yaw -= e.movementX * 0.005 * settings.sens;
        P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - e.movementY * 0.005 * settings.sens * inv));
      }
    }
  });
  canvas.addEventListener('wheel', (e) => {
    if (G.state !== 'play') return;
    e.preventDefault();
    Inv.sel = (Inv.sel + (e.deltaY > 0 ? 1 : 8)) % 9; Inv.dirty = true; UI.showItemName();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'F1', 'Tab'].includes(code)) e.preventDefault();
    if (e.repeat && Input.keys[code]) return;
    Input.keys[code] = true;
    Sfx.init();
    if (G.state === 'play') {
      if (/^Digit[1-9]$/.test(code)) { Inv.sel = Number(code.slice(5)) - 1; Inv.dirty = true; UI.showItemName(); }
      else if (code === 'KeyE') UI.openInventory();
      else if (code === 'KeyQ') dropHeld(e.ctrlKey);
      else if (code === 'F3') { G.debug = !G.debug; $('debug').hidden = !G.debug; }
      else if (code === 'F1') { G.hideHud = !G.hideHud; UI.showScreen(null); }
      else if (code === 'Escape' && !G.locked) pauseGame();
      else if (code === 'Space') {
        const now = performance.now();
        if (G.mode === 'creative' && now - P.lastJumpTap < 300) { P.flying = !P.flying; P.vy = 0; }
        P.lastJumpTap = now;
      } else if (code === 'KeyW') {
        const now = performance.now();
        if (now - P.lastFwdTap < 280) P.sprinting = true;
        P.lastFwdTap = now;
      }
    } else if (G.state === 'inventory') {
      if (code === 'KeyE' || code === 'Escape') UI.closeInventory();
    } else if (G.state === 'ready' && (code === 'Enter' || code === 'Space')) startPlaying();
  });
  window.addEventListener('keyup', (e) => { Input.keys[e.code] = false; });
  window.addEventListener('blur', () => { Input.keys = {}; Input.left = Input.right = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(); if (G.state === 'play' && (IS_TOUCH || G.dragLook)) pauseGame(); } });
  window.addEventListener('pagehide', saveGame);

  // ---- Touch ----
  if (IS_TOUCH) {
    const stick = $('stick'), knob = $('knob');
    let sid = null, sc = null;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); const r = stick.getBoundingClientRect(); sc = [r.left + r.width / 2, r.top + r.height / 2]; moveStick(e); Sfx.init(); });
    const moveStick = (e) => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - sc[0], dy = e.clientY - sc[1];
      const l = Math.hypot(dx, dy), max = 52;
      if (l > max) { dx *= max / l; dy *= max / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      Input.moveX = dx / max; Input.moveY = dy / max;
    };
    stick.addEventListener('pointermove', moveStick);
    const endStick = (e) => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; Input.moveX = Input.moveY = 0; };
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    const jump = $('t-jump');
    jump.addEventListener('pointerdown', (e) => {
      e.preventDefault(); Input.jumpBtn = true;
      const now = performance.now();
      if (G.mode === 'creative' && now - P.lastJumpTap < 300) { P.flying = !P.flying; P.vy = 0; }
      P.lastJumpTap = now;
    });
    const jumpUp = () => { Input.jumpBtn = false; };
    jump.addEventListener('pointerup', jumpUp); jump.addEventListener('pointercancel', jumpUp); jump.addEventListener('pointerleave', jumpUp);
    $('t-down').addEventListener('pointerdown', (e) => { e.preventDefault(); Input.sneakToggle = !Input.sneakToggle; $('t-down').classList.toggle('on', Input.sneakToggle); });
    $('t-inv').addEventListener('click', () => UI.openInventory());
    $('t-pause').addEventListener('click', () => pauseGame());
    const touches = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || G.state !== 'play') return;
      Sfx.init();
      const t = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), moved: false, hold: false };
      t.timer = setTimeout(() => { t.hold = true; Input.left = true; }, 280);
      touches.set(e.pointerId, t);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId); if (!t) return;
      const dx = e.clientX - t.lx, dy = e.clientY - t.ly;
      t.lx = e.clientX; t.ly = e.clientY;
      if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 12) { t.moved = true; if (!t.hold) clearTimeout(t.timer); }
      if (t.moved) {
        const inv = settings.invert ? -1 : 1;
        P.yaw -= dx * 0.0055 * settings.sens;
        P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - dy * 0.0055 * settings.sens * inv));
      }
    });
    const endTouch = (e) => {
      const t = touches.get(e.pointerId); if (!t) return;
      touches.delete(e.pointerId);
      clearTimeout(t.timer);
      if (t.hold) Input.left = false;
      else if (!t.moved && performance.now() - t.t0 < 280 && G.state === 'play') {
        if (target && target.kind === 'mob') { Input.left = true; updateActions(0); Input.left = false; }
        else useItem();
      }
    };
    canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
  }
}

function startPlaying() {
  Sfx.init();
  G.state = 'play';
  UI.showScreen(null);
  Input.lock();
  UI.showItemName();
  if (G.mode === 'survival' && G.days < 0.05 && !Inv.slots.some((s) => s)) UI.toast(IS_TOUCH ? 'Hold your finger on a tree to collect wood' : 'Hold left click on a tree to collect wood');
}

function initMenus() {
  const save = refreshTitle();
  let mode = 'survival';
  $('b-continue').addEventListener('click', () => { Sfx.init(); const s = Store.get('blockhaven.world', null); if (s) beginWorld(s); });
  $('b-new').addEventListener('click', () => { showMenu('menu-new'); $('in-name').focus(); });
  $('b-new-back').addEventListener('click', () => showMenu('menu-main'));
  $('seg-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.mode;
    for (const x of $('seg-mode').children) x.classList.toggle('on', x === b);
    $('mode-hint').textContent = mode === 'creative' ? 'Unlimited blocks, instant mining and flight. Double-tap jump to fly.' : 'Gather resources, craft tools and keep the zombies away at night.';
  });
  $('b-create').addEventListener('click', () => {
    Sfx.init();
    const txt = $('in-seed').value.trim();
    let seed;
    if (!txt) seed = (Math.random() * 4294967295) >>> 0;
    else if (/^-?\d+$/.test(txt)) seed = (Number(txt) >>> 0);
    else seed = hashSeed(txt);
    beginWorld({ name: $('in-name').value.trim() || 'New Haven', seed, seedText: txt || String(seed), mode });
  });
  $('b-settings').addEventListener('click', () => { UI.settingsFrom = 'title'; UI.showScreen('settings'); });
  $('b-help').addEventListener('click', () => showMenu('menu-help'));
  $('b-help-back').addEventListener('click', () => {
    if ($('menu-help').parentElement === $('help2')) { $('title').insertBefore($('menu-help'), $('title').querySelector('.foot')); $('menu-help').hidden = true; UI.showScreen('pause'); }
    else showMenu('menu-main');
  });
  $('b-resume').addEventListener('click', resumeGame);
  $('b-p-settings').addEventListener('click', () => { UI.settingsFrom = 'pause'; UI.showScreen('settings'); });
  $('b-p-help').addEventListener('click', () => { $('help2').appendChild($('menu-help')); $('menu-help').hidden = false; UI.showScreen('help2'); });
  $('b-quit').addEventListener('click', quitToTitle);
  $('b-respawn').addEventListener('click', respawn);
  $('b-play').addEventListener('click', startPlaying);
  return save;
}

// ---- Main loop ----------------------------------------------------------------------
let last = performance.now(), fpsAcc = 0, fpsN = 0, spawnAcc = 0, fluidAcc = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * settings.scale;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  resize();
  const live = G.state === 'play' || G.state === 'inventory' || G.state === 'dead';
  if (live) {
    G.days += dt / DAY_LENGTH;
    const daylight = dayFactor(((G.days % 1) + 1) % 1);
    if (G.state !== 'dead') updatePlayer(dt);
    updateTarget();
    updateActions(dt);
    Mobs.update(dt, daylight);
    spawnAcc += dt;
    if (spawnAcc > 0.5) { spawnAcc = 0; Mobs.trySpawn(daylight); }
    Drops.update(dt);
    Falling.update(dt);
    fluidAcc += dt;
    if (fluidAcc > 0.18) { fluidAcc = 0; world.stepFluids(24); }
    G.saveTimer += dt;
    if (G.saveTimer > 30) { G.saveTimer = 0; saveGame(); }
  }
  Particles.update(dt);
  Sfx.music(dt);
  let cam, yaw, pitch, roll = 0, fov = settings.fov;
  if (G.state === 'title' || G.state === 'boot') {
    const c = G.titleCenter || [0, 80, 0];
    const a = now / 1000 * 0.035 + 0.8;
    const r = 40;
    cam = [c[0] + Math.sin(a) * r, c[1] + 24, c[2] + Math.cos(a) * r];
    yaw = a; pitch = -0.42;
    world.update(c[0], c[2], Math.min(settings.dist, 8));
    G.days += dt / DAY_LENGTH * 0.25;
    if (!G.titleSettled && world.isReady(Math.floor(c[0]), Math.floor(c[2]))) {
      G.titleSettled = true;
      G.titleCenter = [c[0], world.topSolid(Math.floor(c[0]), Math.floor(c[2])) + 2, c[2]];
    }
  } else {
    if (G.state === 'loading') {
      world.update(P.x, P.z, settings.dist);
      G.loadT += dt;
      const pr = world.progress(P.x, P.z, Math.min(settings.dist, 4));
      $('load-bar').style.width = Math.round(pr * 100) + '%';
      $('load-text').textContent = pr < 0.3 ? 'Raising mountains…' : pr < 0.7 ? 'Carving caves…' : 'Planting trees…';
      if ((pr >= 1 && world.isMeshed(Math.floor(P.x), Math.floor(P.z))) || G.loadT > 30) finishLoading();
    } else world.update(P.x, P.z, settings.dist);
    const bobOn = settings.bob && G.state === 'play' ? 1 : 0;
    const basis = cameraBasis(P.yaw, P.pitch, 0);
    const bx = Math.sin(P.bob) * 0.045 * P.bobAmt * bobOn, by = -Math.abs(Math.cos(P.bob)) * 0.06 * P.bobAmt * bobOn;
    cam = [P.x + basis.right[0] * bx, P.y + P.eyeH + by, P.z + basis.right[2] * bx];
    yaw = P.yaw; pitch = P.pitch; roll = P.roll + (bobOn ? Math.sin(P.bob) * 0.006 * P.bobAmt : 0);
    if (G.state === 'dead') roll = 0.5;
    fov = settings.fov + P.fovKick + (P.eyeIn === 1 ? -6 : 0);
  }
  const f = buildFrame(cam, yaw, pitch, roll, fov);
  renderScene(f);
  if (G.state !== 'title' && G.state !== 'boot') UI.updateHUD(dt);
}

function boot() {
  canvas = $('gl');
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    $('fatal').hidden = false;
    $('fatal').textContent = 'Blockhaven needs WebGL 2, which this browser or device does not provide. Try a recent Chrome, Edge, Firefox or Safari.';
    $('title').hidden = true;
    return;
  }
  const texData = Tex.generate();
  renderer.uploadTextures(Tex.mips(texData, TEX_NAMES.length), TEX_NAMES.length);
  world = new World(renderer);
  UI.init();
  if (IS_TOUCH) $('inv-hint').textContent = 'Tap a stack to pick it up, then tap a slot to place it.';
  initSettingsUI();
  initInput();
  const save = initMenus();
  // Title backdrop: the saved world, or a showcase seed.
  const seed = save ? save.seed >>> 0 : hashSeed('blockhaven');
  world.reset(seed, save ? save.edits : null);
  G.titleSeed = seed; G.titleEditsFrom = save ? save.saved : undefined;
  G.gen = world.gen;
  if (save && save.player) G.titleCenter = [save.player.x, save.player.y, save.player.z];
  else { const s = world.gen.findSpawn(); G.titleCenter = [s.x, s.h + 2, s.z]; }
  G.days = save ? save.days : 0.06;
  G.state = 'title';
  showMenu('menu-main');
  UI.showScreen('title');
  requestAnimationFrame(frame);
}
// When the hosting viewer swaps in a new version of the page, save first.
let booted = false;
const startOnce = () => { if (!booted) { booted = true; boot(); } };
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => { saveGame(); return {}; }); } catch (e) { /* optional */ }
try { if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(startOnce); } catch (e) { /* optional */ }
setTimeout(startOnce, window.claude && window.claude.hot && window.claude.hot.ready ? 1500 : 0);
