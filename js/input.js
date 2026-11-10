'use strict';
/* ============================================================
 * EMBER BRIGADE - input: keyboard, touch (virtual stick + buttons), gamepad
 * ============================================================ */

const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'jump', 'gren', 'ok', 'pause'];
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'fire', KeyJ: 'fire', KeyX: 'jump', KeyK: 'jump', Space: 'jump',
  KeyC: 'gren', KeyL: 'gren', Enter: 'ok', KeyP: 'pause', Escape: 'pause',
};

const Input = {
  left: false, right: false, up: false, down: false, fire: false, jump: false, gren: false, ok: false, pause: false,
  p: {},            // edge-triggered "pressed this step"
  _key: {}, _touch: {}, _pad: {}, _held: {}, _latch: {},
  taps: [],         // menu taps in game pixels
  touchMode: false,
  playUI: false,
  el: {},
  stick: { id: null, ox: 0, oy: 0 },
  btnTouches: {},   // touch id -> true

  init(canvas) {
    this.canvas = canvas;
    for (const a of ACTIONS) { this.p[a] = false; this._key[a] = 0; this._touch[a] = false; this._pad[a] = false; this._held[a] = false; this._latch[a] = false; }
    const el = this.el;
    for (const id of ['touch', 'stick', 'knob', 'bFire', 'bJump', 'bGren', 'bPause']) el[id] = document.getElementById(id);

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) { this._key[a]++; this._latch[a] = true; }
      Snd.init();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      this._key[a] = 0;
    });
    window.addEventListener('blur', () => { for (const a of ACTIONS) { this._key[a] = 0; this._touch[a] = false; } this.resetStick(); });

    // menu taps / clicks on the canvas
    canvas.addEventListener('pointerdown', (e) => {
      Snd.init();
      if (e.pointerType === 'touch') this.setTouchMode(true);
      const r = canvas.getBoundingClientRect();
      this.taps.push({ x: ((e.clientX - r.left) * VIEW_W) / r.width, y: ((e.clientY - r.top) * VIEW_H) / r.height });
      e.preventDefault();
    });

    // in-game touch controls
    const t = el.touch;
    const opts = { passive: false };
    t.addEventListener('touchstart', (e) => this.onTouch(e, 0), opts);
    t.addEventListener('touchmove', (e) => this.onTouch(e, 1), opts);
    t.addEventListener('touchend', (e) => this.onTouch(e, 2), opts);
    t.addEventListener('touchcancel', (e) => this.onTouch(e, 2), opts);
    const pauseTap = (e) => { e.preventDefault(); e.stopPropagation(); Snd.init(); this._latch.pause = true; };
    el.bPause.addEventListener('touchstart', pauseTap, opts);
    el.bPause.addEventListener('mousedown', pauseTap);
    window.addEventListener('touchstart', () => { this.setTouchMode(true); Snd.init(); }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) this.setTouchMode(true);
    this.refreshUI();
  },

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.refreshUI();
  },
  setPlayUI(on) {
    if (this.playUI === on) return;
    this.playUI = on;
    if (!on) { for (const a of ACTIONS) this._touch[a] = false; this.resetStick(); this.btnTouches = {}; this.paintButtons(); }
    this.refreshUI();
  },
  refreshUI() {
    const show = this.touchMode && this.playUI;
    if (this.el.touch) this.el.touch.hidden = !show;
    if (this.el.bPause) this.el.bPause.hidden = !show;
  },

  resetStick() {
    this.stick.id = null;
    const t = this._touch;
    t.left = t.right = t.up = t.down = false;
    if (this.el.stick) this.el.stick.classList.remove('on');
  },
  stickRadius() { return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.11, 34, 60); },
  moveStick(x, y) {
    const s = this.stick, R = this.stickRadius();
    let dx = x - s.ox, dy = y - s.oy;
    const len = Math.hypot(dx, dy);
    if (len > R) { // drag the base along so reversing direction is instant
      s.ox += (dx / len) * (len - R); s.oy += (dy / len) * (len - R);
      dx = x - s.ox; dy = y - s.oy;
    }
    const t = this._touch;
    t.left = t.right = t.up = t.down = false;
    if (len > R * 0.3) {
      const sec = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      if (sec === 0 || sec === 1 || sec === -1) t.right = true;
      if (sec === 4 || sec === -4 || sec === 3 || sec === -3) t.left = true;
      if (sec === -1 || sec === -2 || sec === -3) t.up = true;
      if (sec === 1 || sec === 2 || sec === 3) t.down = true;
    }
    const st = this.el.stick, kn = this.el.knob;
    const pr = this.el.touch.getBoundingClientRect();
    st.style.left = s.ox - pr.left + 'px'; st.style.top = s.oy - pr.top + 'px';
    kn.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    st.classList.add('on');
  },
  buttonsAt(x, y) {
    const out = [];
    let best = null, bestD = 1e9;
    for (const [id, a] of [['bFire', 'fire'], ['bJump', 'jump'], ['bGren', 'gren']]) {
      const r = this.el[id].getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d < 1.2) out.push(a);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (!out.length && best && bestD < 1.9) out.push(best);
    return out;
  },
  paintButtons() {
    const t = this._touch, el = this.el;
    if (!el.bFire) return;
    el.bFire.classList.toggle('on', !!t.fire);
    el.bJump.classList.toggle('on', !!t.jump);
    el.bGren.classList.toggle('on', !!t.gren);
  },
  onTouch(e, phase) {
    e.preventDefault();
    Snd.init();
    this.setTouchMode(true);
    const w = window.innerWidth;
    for (const tc of e.changedTouches) {
      const id = tc.identifier;
      if (phase === 0) {
        if (tc.clientX < w * 0.45 && this.stick.id === null) {
          this.stick.id = id; this.stick.ox = tc.clientX; this.stick.oy = tc.clientY;
          this.moveStick(tc.clientX, tc.clientY);
        } else {
          this.btnTouches[id] = { x: tc.clientX, y: tc.clientY, fresh: true };
        }
      } else if (phase === 1) {
        if (id === this.stick.id) this.moveStick(tc.clientX, tc.clientY);
        else if (this.btnTouches[id]) { this.btnTouches[id].x = tc.clientX; this.btnTouches[id].y = tc.clientY; }
      } else {
        if (id === this.stick.id) this.resetStick();
        delete this.btnTouches[id];
      }
    }
    // recompute button state from all active button touches
    const t = this._touch;
    const was = { fire: t.fire, jump: t.jump, gren: t.gren };
    t.fire = t.jump = t.gren = false;
    for (const id in this.btnTouches) {
      const b = this.btnTouches[id];
      for (const a of this.buttonsAt(b.x, b.y)) { t[a] = true; if (!was[a]) this._latch[a] = true; }
    }
    this.paintButtons();
  },

  pollPad() {
    const pad = this._pad;
    for (const a of ACTIONS) pad[a] = false;
    if (!navigator.getGamepads) return;
    let gps;
    try { gps = navigator.getGamepads(); } catch (e) { return; }
    for (const g of gps) {
      if (!g || !g.connected) continue;
      const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (ax < -0.4 || b(14)) pad.left = true;
      if (ax > 0.4 || b(15)) pad.right = true;
      if (ay < -0.5 || b(12)) pad.up = true;
      if (ay > 0.5 || b(13)) pad.down = true;
      if (b(0)) { pad.jump = true; pad.ok = true; }
      if (b(2) || b(7) || b(5)) pad.fire = true;
      if (b(1) || b(3) || b(6) || b(4)) pad.gren = true;
      if (b(9)) pad.pause = true;
    }
  },

  // call once per fixed update step
  poll() {
    this.pollPad();
    for (const a of ACTIONS) {
      const held = !!(this._key[a] || this._touch[a] || this._pad[a]);
      this.p[a] = (held && !this._held[a]) || this._latch[a];
      this._latch[a] = false;
      this._held[a] = held;
      this[a] = held;
    }
  },
  takeTaps() { const t = this.taps; this.taps = []; return t; },
};
