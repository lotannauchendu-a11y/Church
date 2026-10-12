// ---------------------------------------------------------------------------
// World: chunk storage, worker pool for generation/meshing, block edits.
// ---------------------------------------------------------------------------
const WORKER_TAIL = `
let GEN = null, GSEED = -1;
self.onmessage = (e) => {
  const m = e.data;
  if (GSEED !== m.seed) { GEN = createGen(m.seed); GSEED = m.seed; }
  if (m.type === 'gen') {
    const blocks = GEN.generateChunk(m.cx, m.cz);
    self.postMessage({ type: 'gen', epoch: m.epoch, cx: m.cx, cz: m.cz, blocks }, [blocks.buffer]);
  } else if (m.type === 'mesh') {
    const r = buildChunkMesh(m.cx, m.cz, m.chunks, GEN);
    self.postMessage({ type: 'mesh', epoch: m.epoch, cx: m.cx, cz: m.cz, ver: m.ver, opaque: r.opaque, trans: r.trans, light: r.light }, [r.opaque.buffer, r.trans.buffer, r.light.buffer]);
  }
};`;

const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// Chunk offsets sorted by distance (circular), reused every frame.
const OFFSETS = (() => {
  const out = [];
  const R = 20;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= R) out.push([dx, dz, d]);
  }
  out.sort((a, b) => a[2] - b[2]);
  return out;
})();

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = null; this.light = null;
    this.state = 0;       // 0 new, 1 generating, 2 ready
    this.ver = 0;         // bumped on every block change
    this.meshVer = -1;    // version the current mesh was built from
    this.meshing = false;
    this.mesh = null; this.tmesh = null;
    this.inPrio = false;
  }
}

class World {
  constructor(renderer) {
    this.r = renderer;
    this.chunks = new Map();
    this.edits = new Map();
    this.prio = [];
    this.epoch = 0;
    this.seed = 0;
    this.gen = null;
    this.workers = [];
    this.syncMode = false;
    this.pendingSync = [];
    this.stats = { genMs: 0, meshMs: 0 };
    const src = document.getElementById('shared-src').textContent + WORKER_TAIL;
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    try {
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.busy = false;
        w.onmessage = (e) => { w.busy = false; this.workerOk = true; this.onResult(e.data); };
        w.onerror = (e) => {
          console.error('Worker error', e && e.message);
          w.busy = false;
          if (!this.workerOk) this.fallbackToSync();
        };
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('Workers unavailable, generating on the main thread', err);
      this.syncMode = true;
    }
  }
  // If workers can't run here (blocked by the host page), generate on the main thread instead.
  fallbackToSync() {
    if (this.syncMode) return;
    console.warn('World workers unavailable; generating on the main thread');
    this.syncMode = true;
    for (const w of this.workers) { try { w.terminate(); } catch (e) { /* ignore */ } }
    this.workers = [];
    for (const c of this.chunks.values()) { if (c.state === 1) c.state = 0; c.meshing = false; }
  }
  reset(seed, edits) {
    for (const c of this.chunks.values()) { this.r.freeMesh(c.mesh); this.r.freeMesh(c.tmesh); }
    this.chunks.clear();
    this.prio = [];
    this.epoch++;
    this.seed = seed >>> 0;
    this.gen = createGen(this.seed);
    this.edits = new Map();
    if (edits) for (const k in edits) {
      const m = new Map(); const arr = edits[k];
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.edits.set(Number(k), m);
    }
    for (const w of this.workers) w.busy = false;
    this.fluidQ = [];
  }
  serializeEdits() {
    const o = {};
    for (const [k, m] of this.edits) { const a = []; for (const [i, id] of m) a.push(i, id); if (a.length) o[k] = a; }
    return o;
  }
  get(cx, cz) { return this.chunks.get(ckey(cx, cz)); }
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.blocks) return -1;
    return c.blocks[((y << 4) + (z & 15)) * 16 + (x & 15)];
  }
  // Returns [sky, block] light 0..15 for entity shading.
  getLight(x, y, z) {
    if (y >= CH) return [15, 0];
    if (y < 0) return [0, 0];
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.light) return [15, 0];
    const v = c.light[((y << 4) + (z & 15)) * 16 + (x & 15)];
    return [v >> 4, v & 15];
  }
  isReady(x, z) { const c = this.chunks.get(ckey(x >> 4, z >> 4)); return !!(c && c.blocks); }
  isMeshed(x, z) { const c = this.chunks.get(ckey(x >> 4, z >> 4)); return !!(c && c.meshVer >= 0); }
  topSolid(x, z) {
    for (let y = CH - 1; y > 0; y--) { const b = this.getBlock(x, y, z); if (b > 0 && T_SOLID[b]) return y; }
    return 0;
  }
  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return false;
    const cx = x >> 4, cz = z >> 4;
    const c = this.get(cx, cz);
    if (!c || !c.blocks) return false;
    const i = ((y << 4) + (z & 15)) * 16 + (x & 15);
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    const k = ckey(cx, cz);
    let m = this.edits.get(k);
    if (!m) { m = new Map(); this.edits.set(k, m); }
    m.set(i, id);
    // Re-mesh this chunk first, then neighbours (light and AO can cross borders).
    const lx = x & 15, lz = z & 15;
    const order = [[0, 0]];
    const near = [];
    if (lx === 0) near.push([-1, 0]); if (lx === 15) near.push([1, 0]);
    if (lz === 0) near.push([0, -1]); if (lz === 15) near.push([0, 1]);
    order.push(...near);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (!near.some((n) => n[0] === dx && n[1] === dz)) order.push([dx, dz]);
    }
    for (const [dx, dz] of order) {
      const n = this.get(cx + dx, cz + dz);
      if (!n || n.state !== 2) continue;
      n.ver++;
      if (!n.inPrio) { n.inPrio = true; this.prio.push(n); }
    }
    return true;
  }
  neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.get(c.cx + dx, c.cz + dz);
      if (!n || n.state !== 2) return false;
    }
    return true;
  }
  makeMeshJob(c) {
    const arr = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) arr.push(this.get(c.cx + dx, c.cz + dz).blocks);
    c.meshing = true;
    return { type: 'mesh', seed: this.seed, epoch: this.epoch, cx: c.cx, cz: c.cz, ver: c.ver, chunks: arr };
  }
  nextJob(pcx, pcz, R) {
    while (this.prio.length) {
      const c = this.prio[0];
      if (this.chunks.get(ckey(c.cx, c.cz)) !== c || c.meshVer === c.ver) { c.inPrio = false; this.prio.shift(); continue; }
      if (c.meshing) break;
      if (!this.neighborsReady(c)) { c.inPrio = false; this.prio.shift(); continue; }
      c.inPrio = false; this.prio.shift();
      return this.makeMeshJob(c);
    }
    for (const [dx, dz, d] of OFFSETS) {
      if (d > R + 1.5) break;
      const cx = pcx + dx, cz = pcz + dz;
      const k = ckey(cx, cz);
      let c = this.chunks.get(k);
      if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
      if (c.state === 0) { c.state = 1; return { type: 'gen', seed: this.seed, epoch: this.epoch, cx, cz }; }
      if (d <= R + 0.5 && c.state === 2 && c.meshVer !== c.ver && !c.meshing && this.neighborsReady(c)) return this.makeMeshJob(c);
    }
    return null;
  }
  onResult(m) {
    if (m.epoch !== this.epoch) return;
    const c = this.get(m.cx, m.cz);
    if (m.type === 'gen') {
      if (!c) return;
      c.blocks = m.blocks;
      const ed = this.edits.get(ckey(m.cx, m.cz));
      if (ed) for (const [i, id] of ed) c.blocks[i] = id;
      c.state = 2;
      c.ver++;
    } else if (m.type === 'mesh') {
      if (!c) return;
      c.meshing = false;
      this.r.freeMesh(c.mesh); this.r.freeMesh(c.tmesh);
      c.mesh = this.r.makeMesh(m.opaque);
      c.tmesh = this.r.makeMesh(m.trans);
      c.light = m.light;
      c.meshVer = m.ver;
      if (c.ver !== m.ver && !c.inPrio) { c.inPrio = true; this.prio.unshift(c); }
    }
  }
  update(px, pz, R) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    // Unload far chunks.
    if (!this._unloadTick || --this._unloadTick <= 0) {
      this._unloadTick = 30;
      const lim = R + 3;
      for (const [k, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > lim * lim && !c.meshing && c.state !== 1) {
          this.r.freeMesh(c.mesh); this.r.freeMesh(c.tmesh);
          this.chunks.delete(k);
        }
      }
    }
    if (this.syncMode) {
      const t0 = performance.now();
      while (performance.now() - t0 < 10) {
        const job = this.nextJob(pcx, pcz, R);
        if (!job) break;
        this.runSync(job);
      }
      return;
    }
    if (!this.workerOk && this.firstDispatch && performance.now() - this.firstDispatch > 8000) { this.fallbackToSync(); return; }
    for (const w of this.workers) {
      if (w.busy) continue;
      const job = this.nextJob(pcx, pcz, R);
      if (!job) break;
      w.busy = true;
      if (!this.firstDispatch) this.firstDispatch = performance.now();
      w.postMessage(job);
    }
  }
  runSync(job) {
    if (job.type === 'gen') {
      const blocks = this.gen.generateChunk(job.cx, job.cz);
      this.onResult({ type: 'gen', epoch: job.epoch, cx: job.cx, cz: job.cz, blocks });
    } else {
      const r = buildChunkMesh(job.cx, job.cz, job.chunks, this.gen);
      this.onResult({ type: 'mesh', epoch: job.epoch, cx: job.cx, cz: job.cz, ver: job.ver, opaque: r.opaque, trans: r.trans, light: r.light });
    }
  }
  progress(px, pz, R) {
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    let total = 0, done = 0;
    for (const [dx, dz, d] of OFFSETS) {
      if (d > R) break;
      total++;
      const c = this.get(pcx + dx, pcz + dz);
      if (c && c.meshVer >= 0) done++;
    }
    return done / total;
  }
  // Simple still-water settling: water fills holes next to it (bounded spread).
  queueFluid(x, y, z) { this.fluidQ.push([x, y, z, 0]); }
  stepFluids(maxSteps) {
    let n = 0;
    while (this.fluidQ.length && n < maxSteps) {
      const [x, y, z, dist] = this.fluidQ.shift();
      n++;
      const cur = this.getBlock(x, y, z);
      if (cur < 0) continue;
      if (!(cur === B.AIR || (BLOCKS[cur].replaceable))) continue;
      const above = this.getBlock(x, y + 1, z) === B.WATER;
      let side = false;
      if (!above && dist < 6) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.getBlock(x + dx, y, z + dz) === B.WATER) { side = true; break; }
      }
      if (!above && !side) continue;
      const below = this.getBlock(x, y - 1, z);
      this.setBlock(x, y, z, B.WATER);
      this.fluidQ.push([x, y - 1, z, above ? dist : dist + 1]);
      const nd = dist + 1;
      if (below > 0 && (T_SOLID[below] || below === B.WATER)) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.fluidQ.push([x + dx, y, z + dz, nd]);
      }
    }
    if (this.fluidQ.length > 4000) this.fluidQ.length = 4000;
  }
}
