(function () {
  'use strict';

  /* ---------- Mobile navigation ---------- */
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ---------- Copy address ---------- */
  var copyBtn = document.getElementById('copy-address');
  if (copyBtn) {
    var label = copyBtn.textContent;
    var flash = function (text) {
      copyBtn.textContent = text;
      window.setTimeout(function () { copyBtn.textContent = label; }, 2200);
    };
    var selectAddress = function () {
      var addr = document.getElementById('church-address');
      var range = document.createRange();
      range.selectNodeContents(addr);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash('Address selected');
    };
    copyBtn.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () { flash('Copied'); }, selectAddress);
      } catch (err) {
        selectAddress();
      }
    });
  }

  /* ---------- Gathering Group season that is meeting now ---------- */
  var month = new Date().getMonth();
  document.querySelectorAll('.season').forEach(function (el) {
    var months = el.dataset.months.split(',').map(Number);
    if (months.indexOf(month) !== -1) el.classList.add('is-current');
  });

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Hero landscape ----------
     Watercolor hills in the logo's palette with the brushstroke cross planted
     on the highest crest. The front hill ends in exactly the pine of the band
     below, so the landscape runs straight into the page. */
  var hero = document.querySelector('.hero');
  var canvas = document.getElementById('hero-land');
  var copy = document.getElementById('hero-copy');
  if (!hero || !canvas || !canvas.getContext || !copy) return;

  var PINE = '#2b3a23';
  // back to front; y = ridge height as a fraction of the land area
  var LAYERS = [
    { y: 0.10, amp: 0.20, freq: 1.5, seed: 3,  top: '#e8dab9', bottom: '#dccaa2', edge: '#c8b083' },
    { y: 0.28, amp: 0.18, freq: 2.0, seed: 7,  top: '#d6bf92', bottom: '#c7ab79', edge: '#ad8d58' },
    { y: 0.45, amp: 0.13, freq: 1.3, seed: 11, top: '#a6ae82', bottom: '#8f9a6b', edge: '#76845a', crest: true },
    { y: 0.62, amp: 0.12, freq: 2.3, seed: 17, top: '#788a5c', bottom: '#5f7148', edge: '#4f603f' },
    { y: 0.78, amp: 0.09, freq: 1.7, seed: 23, top: '#3f5332', bottom: PINE, edge: '#25321e', front: true }
  ];
  var CREST_LIFT = 0.28;              // how far the crest rises above its layer
  var CROSS_RATIO = 430 / 602;        // width / height of assets/brand/cross.png
  var CROSS_BURY = 0.16;              // share of the cross hidden in the hill

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function valueNoise(seed) {
    var r = mulberry32(seed);
    var pts = [];
    for (var i = 0; i < 64; i++) pts.push(r());
    return function (x) {
      var i0 = Math.floor(x);
      var f = x - i0;
      var a = pts[((i0 % 64) + 64) % 64];
      var b = pts[(((i0 + 1) % 64) + 64) % 64];
      return a + (b - a) * f * f * (3 - 2 * f);
    };
  }

  function rgba(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  var crossImg = new Image();
  var crossReady = new Promise(function (resolve) {
    crossImg.onload = resolve;
    crossImg.onerror = resolve;
  });
  crossImg.src = 'assets/brand/cross.png';

  var tintedCross = null;
  function getTintedCross() {
    if (tintedCross || !crossImg.naturalWidth) return tintedCross;
    var c = document.createElement('canvas');
    c.width = crossImg.naturalWidth;
    c.height = crossImg.naturalHeight;
    var x = c.getContext('2d');
    x.drawImage(crossImg, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = PINE;
    x.fillRect(0, 0, c.width, c.height);
    tintedCross = c;
    return c;
  }

  var grain = null;
  function getGrain(ctx) {
    if (grain) return grain;
    var g = document.createElement('canvas');
    g.width = g.height = 140;
    var gx = g.getContext('2d');
    var img = gx.createImageData(140, 140);
    var r = mulberry32(5);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = r() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(r() * 26);
    }
    gx.putImageData(img, 0, 0);
    grain = ctx.createPattern(g, 'repeat');
    return grain;
  }

  function layout(W, H) {
    var heroBox = hero.getBoundingClientRect();
    var copyBox = copy.getBoundingClientRect();
    var copyBottom = copyBox.bottom - heroBox.top;
    var copyRight = copyBox.left - heroBox.left + Math.min(copyBox.width, copy.scrollWidth);
    var avail = H - copyBottom;
    var crestK = LAYERS[2].y - CREST_LIFT;  // crest height as a fraction of the land area

    // Wide: the cross rises beside the copy. Narrow: it stands below the copy.
    var crossH = Math.min(H * 0.64, 460);
    var crossW = crossH * CROSS_RATIO;
    var room = W - 16 - (copyRight + 48);
    var wide = W >= 900 && room > 150;
    var crestX, crestY, landTop;

    if (wide) {
      if (crossW > room) { crossW = room; crossH = crossW / CROSS_RATIO; }
      crestX = Math.max(W * 0.76, copyRight + 48 + crossW / 2);
      crestX = Math.min(crestX, W - 16 - crossW / 2);
      landTop = copyBottom + Math.max(28, avail * 0.22);
      crestY = landTop + crestK * (H - landTop);
      crossH = Math.min(crossH, (crestY - 24) / (1 - CROSS_BURY));
      crossW = crossH * CROSS_RATIO;
    } else {
      crossH = Math.max(110, Math.min(avail * 0.6, 250));
      crossW = crossH * CROSS_RATIO;
      crestX = W * 0.7;
      crestY = copyBottom + 20 + crossH * (1 - CROSS_BURY);
      landTop = (crestY - crestK * H) / (1 - crestK);
    }
    return { crestX: crestX, crestY: crestY, landTop: landTop, landH: H - landTop, crossW: crossW, crossH: crossH };
  }

  function ridgeFor(L, W, geo) {
    var n1 = valueNoise(L.seed), n2 = valueNoise(L.seed + 101), n3 = valueNoise(L.seed + 202);
    var spread = Math.max(110, W * 0.11);
    var ys = [];
    for (var x = 0; x <= W + 4; x += 4) {
      var u = (x * L.freq) / 360;
      var v = 0.62 * n1(u) + 0.28 * n2(u * 2.3 + 7) + 0.1 * n3(u * 5.1 + 3);
      var bump = 0;
      if (L.crest) bump = Math.exp(-Math.pow((x - geo.crestX) / spread, 2));
      var wobble = L.amp * (v - 0.5) * 2 * (1 - 0.85 * bump);
      ys.push(geo.landTop + geo.landH * (L.y + wobble - CREST_LIFT * bump));
    }
    if (L.crest) {
      // pin the crest so the cross foot sits exactly in the hill
      var i = Math.round(geo.crestX / 4);
      var shift = geo.crestY - ys[i];
      var s2 = Math.max(110, W * 0.11);
      for (var j = 0; j < ys.length; j++) ys[j] += shift * Math.exp(-Math.pow((j * 4 - geo.crestX) / s2, 2));
    }
    return ys;
  }

  function trace(ctx, ys, H, dy) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var i = 0; i < ys.length; i++) ctx.lineTo(i * 4, ys[i] + (dy || 0));
    ctx.lineTo((ys.length - 1) * 4, H);
    ctx.closePath();
  }

  function strokeRidge(ctx, ys, dy) {
    ctx.beginPath();
    for (var i = 0; i < ys.length; i++) {
      if (i === 0) ctx.moveTo(0, ys[0] + dy);
      else ctx.lineTo(i * 4, ys[i] + dy);
    }
    ctx.stroke();
  }

  function drawLayer(ctx, L, ys, W, H, rand) {
    var minY = Math.min.apply(null, ys);

    // soft bleed above the ridge, like wet pigment spreading
    for (var p = 0; p < 3; p++) {
      var lift = (p + 1) * 2.4;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var i = 0; i < ys.length; i++) {
        ctx.lineTo(i * 4, ys[i] - lift * (0.55 + 0.45 * Math.sin(i * 0.05 + p * 1.9 + L.seed)));
      }
      ctx.lineTo((ys.length - 1) * 4, H);
      ctx.closePath();
      ctx.fillStyle = rgba(L.top, 0.16);
      ctx.fill();
    }

    var g = ctx.createLinearGradient(0, minY, 0, H);
    g.addColorStop(0, L.top);
    g.addColorStop(L.front ? 0.55 : 1, L.bottom);
    if (L.front) g.addColorStop(1, L.bottom);
    trace(ctx, ys, H);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    trace(ctx, ys, H);
    ctx.clip();
    if (!L.front) {
      // blooms: uneven washes of lighter and darker pigment
      for (var b = 0; b < 8; b++) {
        var bx = rand() * W;
        var by = minY + rand() * (H - minY) * 0.7;
        var r = 50 + rand() * 170;
        var col = rand() < 0.55 ? L.edge : L.top;
        var rg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        rg.addColorStop(0, rgba(col, 0.2));
        rg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
    // pigment pooled just inside the edge
    ctx.lineWidth = 7;
    ctx.strokeStyle = rgba(L.edge, 0.16);
    strokeRidge(ctx, ys, 3);
    ctx.restore();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(L.edge, 0.5);
    strokeRidge(ctx, ys, 0);
  }

  function draw() {
    var W = hero.clientWidth;
    var H = hero.clientHeight;
    if (!W || !H) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var geo = layout(W, H);
    var rand = mulberry32(41);
    var cross = getTintedCross();

    // a faint warm light behind the cross
    if (cross) {
      var cx = geo.crestX, cy = geo.crestY - geo.crossH * 0.55, rad = geo.crossH * 1.1;
      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      glow.addColorStop(0, 'rgba(207,171,116,0.26)');
      glow.addColorStop(1, 'rgba(207,171,116,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }

    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      if (L.crest && cross) {
        ctx.globalAlpha = 0.96;
        ctx.drawImage(cross, geo.crestX - geo.crossW / 2, geo.crestY - geo.crossH * (1 - CROSS_BURY), geo.crossW, geo.crossH);
        ctx.globalAlpha = 1;
      }
      drawLayer(ctx, L, ridgeFor(L, W, geo), W, H, rand);
    }

    // paper grain over everything painted, then settle the bottom edge into the band
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = getGrain(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    var seam = ctx.createLinearGradient(0, H - 36, 0, H);
    seam.addColorStop(0, rgba(PINE, 0));
    seam.addColorStop(1, rgba(PINE, 1));
    ctx.fillStyle = seam;
    ctx.fillRect(0, H - 36, W, 36);

    hero.classList.add('is-drawn');
  }

  var lastW = 0, lastH = 0, queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      var W = hero.clientWidth, H = hero.clientHeight;
      if (W === lastW && Math.abs(H - lastH) < 2) return;
      lastW = W; lastH = H;
      draw();
    });
  }

  draw();
  lastW = hero.clientWidth; lastH = hero.clientHeight;
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.all([crossReady, fontsReady]).then(function () { lastW = 0; schedule(); });
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(hero);
  else window.addEventListener('resize', schedule);
})();
