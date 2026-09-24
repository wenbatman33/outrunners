// 路邊物件 3D 模型（low-poly，合併幾何後以 InstancedMesh 大量繪製）
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, mulberry32 } from '../util.js';
import { getSprite, makeForkSign } from '../art/sprites.js';

// ---------- 材質快取 ----------
const matCache = new Map();
export function mat(color, opt = {}) {
  const key = color + JSON.stringify(opt, (k, v) => (v && v.isTexture ? v.uuid : v));
  let m = matCache.get(key);
  if (m) return m;
  const p = { color: new THREE.Color(color) };
  if (!opt.basic) p.flatShading = opt.flat !== false;
  if (opt.emissive) {
    p.emissive = new THREE.Color(opt.emissive);
    p.emissiveIntensity = opt.ei ?? 1;
  }
  if (opt.map) p.map = opt.map;
  if (opt.emissiveMap) p.emissiveMap = opt.emissiveMap;
  if (opt.side) p.side = opt.side;
  if (opt.transparent) {
    p.transparent = true;
    p.opacity = opt.opacity ?? 1;
  }
  m = opt.basic ? new THREE.MeshBasicMaterial(p) : new THREE.MeshLambertMaterial(p);
  matCache.set(key, m);
  return m;
}

// ---------- 幾何組裝器 ----------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Builder {
  constructor() {
    this.groups = new Map(); // material -> {mat, geos, tint}
  }
  add(geo, material, t = {}, tint = null) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!material.map && !material.emissiveMap) g.deleteAttribute('uv');
    else if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _q.setFromEuler(_e);
    _p.set(t.x || 0, t.y || 0, t.z || 0);
    _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    let e = this.groups.get(material);
    if (!e) {
      e = { mat: material, geos: [], tint };
      this.groups.set(material, e);
    }
    if (tint) e.tint = tint;
    e.geos.push(g);
    return this;
  }
  build() {
    const out = [];
    for (const e of this.groups.values()) {
      const geo = mergeGeometries(e.geos, false);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      out.push({ geometry: geo, material: e.mat, tint: e.tint });
    }
    return out;
  }
}

// 常用幾何
const G = {
  cyl: (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg, 1),
  cone: (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg, 1),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  sph: (r, ws = 8, hs = 6) => new THREE.SphereGeometry(r, ws, hs),
  dode: (r) => new THREE.DodecahedronGeometry(r, 0),
};

// 葉片（棕櫚葉）：沿 +X 延伸並下垂
function leafGeo(len, width, droop) {
  const seg = 6;
  const pos = [];
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.5);
    pts.push([t * len, -droop * t * t * len, w]);
  }
  for (let i = 0; i < seg; i++) {
    const [x0, y0, w0] = pts[i];
    const [x1, y1, w1] = pts[i + 1];
    // 兩片略成 V 字
    pos.push(x0, y0, 0, x1, y1, 0, x1, y1 - w1 * 0.25, w1);
    pos.push(x0, y0, 0, x1, y1 - w1 * 0.25, w1, x0, y0 - w0 * 0.25, w0);
    pos.push(x0, y0, 0, x1, y1 - w1 * 0.25, -w1, x1, y1, 0);
    pos.push(x0, y0, 0, x0, y0 - w0 * 0.25, -w0, x1, y1 - w1 * 0.25, -w1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// 洋蔥頂（Lathe）
export function onionGeo(r, h, seg = 10) {
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * (Math.sin(Math.PI * t * 0.95) * (1.15 - t * 0.6) + (t < 0.1 ? 0.6 * (1 - t / 0.1) * 0 : 0));
    pts.push(new THREE.Vector2(Math.max(0.01, t > 0.97 ? 0.02 : rr), t * h));
  }
  return new THREE.LatheGeometry(pts, seg);
}

// ---------- 大樓立面貼圖 ----------
const texCache = new Map();
export function facadeTex(kind, night) {
  const key = kind + (night ? 'n' : 'd');
  if (texCache.has(key)) return texCache.get(key);
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  const rng = mulberry32(kind.length * 99 + (night ? 7 : 3));
  const base = kind === 'tower' ? (night ? '#1a2033' : '#9fb3c8') : kind === 'white' ? '#f4f4ef' : '#e8d8b8';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  const cols = kind === 'tower' ? 6 : 4;
  const rows = kind === 'tower' ? 16 : 5;
  const cw = 128 / cols;
  const rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const lit = night ? rng() < 0.55 : false;
      ctx.fillStyle = night ? (lit ? (rng() < 0.3 ? '#ffc86a' : '#fff0b0') : '#0c1020') : kind === 'tower' ? (rng() < 0.3 ? '#dbe8f5' : '#557090') : '#4a6a8a';
      ctx.fillRect(k * cw + cw * 0.18, r * rh + rh * 0.22, cw * 0.64, rh * 0.56);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

// 發光窗戶貼圖（夜間）
function windowGlowTex(kind) {
  const key = 'glow' + kind;
  if (texCache.has(key)) return texCache.get(key);
  const src = facadeTex(kind, true).image;
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const bright = d.data[i] > 200 && d.data[i + 1] > 150;
    if (!bright) {
      d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// ---------- 各物件模型 ----------
const MODELS = {
  palm(b) {
    const trunkM = mat('#8a5a32');
    const lean = 0.9;
    let x = 0;
    let y = 0;
    const segs = 9;
    const H = 8.5;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const nx = lean * ((i + 1) / segs) ** 2;
      const h = H / segs;
      const r0 = 0.32 - t * 0.12;
      b.add(G.cyl(r0 - 0.04, r0 + 0.02, h * 1.05, 6), i % 2 ? trunkM : mat('#9c6a3c'), {
        x: (x + nx) / 2,
        y: y + h / 2,
        rz: -Math.atan2(nx - x, h),
      });
      x = nx;
      y += h;
    }
    const leafCols = [mat('#2f9a3a', { side: THREE.DoubleSide }), mat('#3cae45', { side: THREE.DoubleSide })];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.add(leafGeo(4.2, 0.75, 0.55), leafCols[i % 2], { x, y: y - 0.1, ry: a, rz: 0.25 });
    }
    b.add(G.sph(0.22, 6, 4), mat('#5a3a1a'), { x: x + 0.25, y: y - 0.35 });
    b.add(G.sph(0.22, 6, 4), mat('#5a3a1a'), { x: x - 0.1, y: y - 0.4, z: 0.25 });
  },
  pine(b) {
    b.add(G.cyl(0.25, 0.35, 2, 6), mat('#5a3a24'), { y: 1 });
    const c = [mat('#1f6a3a'), mat('#277a44')];
    for (let i = 0; i < 4; i++) {
      b.add(G.cone(2.6 - i * 0.5, 3.2, 7), c[i % 2], { y: 2.2 + i * 1.7 + 1.6 });
    }
  },
  pine_snow(b) {
    b.add(G.cyl(0.25, 0.35, 2, 6), mat('#4a3222'), { y: 1 });
    for (let i = 0; i < 4; i++) {
      const r = 2.6 - i * 0.5;
      b.add(G.cone(r, 3.2, 7), mat('#1c4a38'), { y: 2.2 + i * 1.7 + 1.6 });
      b.add(G.cone(r * 0.62, 1.3, 7), mat('#f2f6ff'), { y: 2.2 + i * 1.7 + 2.62 });
    }
  },
  tree_round(b) {
    b.add(G.cyl(0.25, 0.38, 3, 6), mat('#5a3e28'), { y: 1.5 });
    const f = mat('#ffffff');
    const tint = ['#3f9a44', '#4aa84a', '#358a3c', '#5aa844'];
    b.add(G.ico(2.3), f, { y: 4.6 }, tint);
    b.add(G.ico(1.6), f, { x: 1.3, y: 3.9, z: 0.4 }, tint);
    b.add(G.ico(1.5), f, { x: -1.2, y: 4.0, z: -0.3 }, tint);
    b.add(G.ico(1.3), f, { x: 0.2, y: 6.0, z: 0.2 }, tint);
  },
  maple(b) {
    b.add(G.cyl(0.25, 0.38, 3, 6), mat('#5a3a24'), { y: 1.5 });
    const f = mat('#ffffff');
    const tint = ['#e04a1a', '#f08a1a', '#d02a2a', '#f0b020'];
    b.add(G.ico(2.4), f, { y: 4.7 }, tint);
    b.add(G.ico(1.6), f, { x: 1.4, y: 4.0 }, tint);
    b.add(G.ico(1.5), f, { x: -1.3, y: 4.1, z: 0.3 }, tint);
  },
  olive(b) {
    b.add(G.cyl(0.3, 0.5, 2.2, 6), mat('#6a5a44'), { y: 1.1, rz: 0.15 });
    b.add(G.ico(2.1), mat('#8a9a5a'), { y: 3.4, sy: 0.7 });
    b.add(G.ico(1.4), mat('#7a8a4e'), { x: 1.2, y: 3.0, sy: 0.7 });
  },
  cherry(b) {
    b.add(G.cyl(0.25, 0.4, 3, 6), mat('#5a3a2e'), { y: 1.5 });
    const f = mat('#ffffff');
    const tint = ['#ffb8d0', '#ffc6da', '#ffaecb', '#ffd0e0'];
    b.add(G.ico(2.4, 1), f, { y: 4.4, sy: 0.8 }, tint);
    b.add(G.ico(1.6), f, { x: 1.6, y: 3.9 }, tint);
    b.add(G.ico(1.6), f, { x: -1.5, y: 3.9, z: 0.3 }, tint);
  },
  jungle(b) {
    b.add(G.cyl(0.35, 0.5, 5, 6), mat('#5a4028'), { y: 2.5 });
    b.add(G.ico(2.8), mat('#2a8a36'), { y: 6.2, sy: 0.75 });
    b.add(G.ico(1.9), mat('#237a2f'), { x: 1.8, y: 5.3 });
    b.add(G.ico(1.7), mat('#34983f'), { x: -1.7, y: 5.6, z: 0.6 });
    const lf = mat('#3aa048', { side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) b.add(leafGeo(2.4, 0.6, 0.6), lf, { y: 1.2, ry: (i / 5) * Math.PI * 2, rz: 0.5 });
  },
  acacia(b) {
    const t = mat('#4a3222');
    b.add(G.cyl(0.25, 0.4, 3.2, 6), t, { y: 1.6 });
    b.add(G.cyl(0.14, 0.22, 2.4, 5), t, { x: -0.8, y: 3.6, rz: 0.6 });
    b.add(G.cyl(0.14, 0.22, 2.4, 5), t, { x: 0.8, y: 3.6, rz: -0.6 });
    b.add(G.sph(4.2, 9, 5), mat('#5a7a2a'), { y: 5.0, sy: 0.22 });
    b.add(G.sph(3.0, 8, 5), mat('#6a8a36'), { y: 5.4, x: 0.6, sy: 0.2 });
  },
  eucalyptus(b) {
    b.add(G.cyl(0.2, 0.34, 7, 6), mat('#e8e0d0'), { y: 3.5, rz: 0.05 });
    b.add(G.cyl(0.1, 0.15, 3, 5), mat('#d8d0c0'), { x: 0.9, y: 5.5, rz: -0.6 });
    b.add(G.ico(1.9), mat('#6f9a6a'), { y: 7.6, sy: 0.8 });
    b.add(G.ico(1.4), mat('#7aa874'), { x: 1.8, y: 6.8 });
    b.add(G.ico(1.2), mat('#628f5e'), { x: -1.2, y: 6.1 });
  },
  cypress(b) {
    b.add(G.cyl(0.18, 0.25, 1, 5), mat('#5a3a2a'), { y: 0.5 });
    b.add(G.sph(1.0, 8, 8), mat('#2a5a2e'), { y: 4.2, sy: 4.0 });
  },
  bamboo(b) {
    const rng = mulberry32(5);
    const c = [mat('#6ab43a'), mat('#58a032')];
    for (let i = 0; i < 7; i++) {
      const x = (rng() - 0.5) * 2.2;
      const z = (rng() - 0.5) * 2.2;
      const h = 7 + rng() * 4;
      b.add(G.cyl(0.1, 0.12, h, 5), c[i % 2], { x, z, y: h / 2, rz: (rng() - 0.5) * 0.12 });
      b.add(G.cone(0.9, 2.4, 5), mat('#4a9a2a'), { x, z, y: h - 0.4, rx: Math.PI });
    }
  },
  saguaro(b) {
    const c = mat('#3f8a3a');
    b.add(G.cyl(0.42, 0.45, 6, 8), c, { y: 3 });
    b.add(G.sph(0.42, 8, 5), c, { y: 6 });
    // 手臂
    b.add(G.cyl(0.3, 0.3, 1.2, 7), c, { x: -0.8, y: 2.8, rz: Math.PI / 2 });
    b.add(G.cyl(0.3, 0.3, 2.2, 7), c, { x: -1.35, y: 3.9 });
    b.add(G.sph(0.3, 7, 5), c, { x: -1.35, y: 5.0 });
    b.add(G.cyl(0.28, 0.28, 1.0, 7), c, { x: 0.75, y: 3.6, rz: Math.PI / 2 });
    b.add(G.cyl(0.28, 0.28, 1.6, 7), c, { x: 1.2, y: 4.4 });
    b.add(G.sph(0.28, 7, 5), c, { x: 1.2, y: 5.2 });
  },
  cactus(b) {
    const c = mat('#5aa83f');
    b.add(G.ico(0.8), c, { y: 0.7, sz: 0.4 });
    b.add(G.ico(0.6), c, { x: 0.6, y: 1.5, sz: 0.4, rz: -0.4 });
    b.add(G.ico(0.55), c, { x: -0.5, y: 1.6, sz: 0.4, rz: 0.4 });
    b.add(G.sph(0.14, 5, 4), mat('#ff5a8a'), { x: 0.8, y: 2.1 });
  },
  rock(b) {
    b.add(G.dode(1.5), mat('#8a8a86'), { y: 0.8, sy: 0.7, sx: 1.2 });
    b.add(G.dode(0.9), mat('#7a7a76'), { x: 1.4, y: 0.4, sy: 0.6 });
  },
  rock_red(b) {
    const c = [mat('#c0602e'), mat('#a8522a'), mat('#d47038')];
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const h = 1.6 + (i % 2) * 0.6;
      const w = 5.5 - i * 0.55;
      b.add(G.cyl(w * 0.5, w * 0.55, h, 7), c[i % 3], { y: y + h / 2 });
      y += h;
    }
  },
  building(b, night) {
    const tex = facadeTex('tower', night);
    const m = night ? mat('#ffffff', { map: tex, emissiveMap: windowGlowTex('tower'), emissive: '#ffffff', ei: 1 }) : mat('#ffffff', { map: tex });
    const g = G.box(12, 40, 12);
    b.add(g, m, { y: 20 });
    b.add(G.box(12.6, 1, 12.6), mat(night ? '#20243a' : '#6a7a8a'), { y: 40.5 });
    b.add(G.cyl(0.15, 0.15, 6, 4), mat('#aaaaaa'), { x: 3, y: 44 });
    b.add(G.sph(0.4, 5, 4), mat('#ff3030', { emissive: '#ff2020' }), { x: 3, y: 47 });
  },
  building_low(b, night) {
    const tex = facadeTex('low', night);
    const m = night ? mat('#ffffff', { map: tex, emissiveMap: windowGlowTex('low'), emissive: '#ffffff' }) : mat('#ffffff', { map: tex });
    b.add(G.box(16, 11, 12), m, { y: 5.5 });
    b.add(G.box(17, 0.8, 13), mat('#8a6a5a'), { y: 11.3 });
    b.add(G.box(4, 2, 4), mat('#aaaaaa'), { x: 4, y: 12.5 });
  },
  house_white(b) {
    const w = mat('#f6f6f2');
    b.add(G.box(8, 6, 7), w, { y: 3 });
    b.add(G.box(5, 4, 5), mat('#ecece6'), { x: 5.5, y: 2 });
    b.add(new THREE.SphereGeometry(2.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#1e5ad8'), { y: 6 });
    b.add(G.cyl(0.08, 0.08, 1.4, 4), w, { y: 8.8 });
    b.add(G.box(0.8, 0.1, 0.1), w, { y: 9.1 });
    b.add(G.box(1.4, 2.4, 0.2), mat('#1e5ad8'), { x: -1, y: 1.2, z: 3.55 });
    b.add(G.box(1.2, 1.2, 0.2), mat('#1e5ad8'), { x: 2, y: 4, z: 3.55 });
  },
  house_eu(b) {
    b.add(G.box(8, 6, 7), mat('#f4ead0'), { y: 3 });
    // 三角屋頂
    b.add(G.cyl(4.6, 4.6, 8.6, 3), mat('#b8402a'), { y: 7.4, rz: Math.PI / 2, rx: -Math.PI / 2, sz: 0.7 });
    for (const x of [-3.9, 3.9]) b.add(G.box(0.3, 6, 7.2), mat('#5a3a24'), { x, y: 3 });
    b.add(G.box(8.2, 0.3, 7.2), mat('#5a3a24'), { y: 3.5 });
    b.add(G.box(1.4, 2.4, 0.2), mat('#6a3a1a'), { y: 1.2, z: 3.55 });
    b.add(G.box(1.2, 1.2, 0.2), mat('#3a4a6a'), { x: -2.4, y: 4.6, z: 3.55 });
    b.add(G.box(1.2, 1.2, 0.2), mat('#3a4a6a'), { x: 2.4, y: 4.6, z: 3.55 });
  },
  chalet(b) {
    b.add(G.box(9, 3, 8), mat('#f2ead8'), { y: 1.5 });
    b.add(G.box(9, 3, 8), mat('#9a5a2a'), { y: 4.5 });
    b.add(G.box(10, 0.3, 9.4), mat('#6a3a1a'), { y: 3.2 });
    b.add(G.cyl(5.8, 5.8, 10.6, 3), mat('#5a2e14'), { y: 7.4, rz: Math.PI / 2, rx: -Math.PI / 2, sz: 0.55 });
    for (const x of [-2.6, 0, 2.6]) {
      b.add(G.box(1.3, 1.2, 0.2), mat('#2a3a5a'), { x, y: 4.6, z: 4.05 });
      b.add(G.box(1.4, 0.35, 0.5), mat('#e02a4a'), { x, y: 3.9, z: 4.2 });
    }
  },
  house_ru(b) {
    b.add(G.box(7, 6, 7), mat('#a8503a'), { y: 3 });
    b.add(G.cyl(2.2, 2.2, 2.2, 10), mat('#f0e6d0'), { y: 7.1 });
    b.add(onionGeo(2.6, 4.2), mat('#2a8a5a'), { y: 8.2 });
    b.add(G.cyl(0.07, 0.07, 1.6, 4), mat('#ffd23a', { emissive: '#553300' }), { y: 13.0 });
    b.add(G.box(7.4, 0.5, 7.4), mat('#f4f8ff'), { y: 6.2 });
  },
  hut(b) {
    b.add(G.cyl(3, 3, 3, 10), mat('#b8864a'), { y: 1.5 });
    b.add(G.cone(4.4, 3.4, 10), mat('#d8b458'), { y: 4.7 });
    b.add(G.box(1.2, 2, 0.3), mat('#5a3a1a'), { y: 1, z: 2.9 });
  },
  lamp(b, night) {
    const p = mat('#5a6068');
    b.add(G.cyl(0.1, 0.14, 7, 6), p, { y: 3.5 });
    b.add(G.box(2.4, 0.14, 0.14), p, { x: 1.2, y: 7 });
    b.add(G.box(0.9, 0.22, 0.5), night ? mat('#fff6c0', { emissive: '#fff0a0' }) : mat('#dfe6ee'), { x: 2.3, y: 6.85 });
  },
  lamp_paris(b) {
    const p = mat('#1e2a24');
    b.add(G.cyl(0.07, 0.14, 5, 6), p, { y: 2.5 });
    b.add(G.box(1.6, 0.1, 0.1), p, { y: 4.6 });
    for (const x of [-0.8, 0.8]) {
      b.add(G.box(0.36, 0.5, 0.36), mat('#ffe9a8', { emissive: '#8a6a20' }), { x, y: 4.35 });
      b.add(G.cone(0.3, 0.3, 4), p, { x, y: 4.75, ry: Math.PI / 4 });
    }
  },
  lighthouse(b) {
    for (let i = 0; i < 6; i++) {
      const r0 = 2.2 - i * 0.22;
      b.add(G.cyl(r0 - 0.22, r0, 3, 10), mat(i % 2 ? '#ffffff' : '#e02a2a'), { y: 1.5 + i * 3 });
    }
    b.add(G.cyl(1.4, 1.4, 0.3, 10), mat('#333333'), { y: 18.1 });
    b.add(G.cyl(0.8, 0.8, 1.6, 8), mat('#ffe36a', { emissive: '#ffcc00' }), { y: 19 });
    b.add(G.cone(1.0, 1.2, 8), mat('#333333'), { y: 20.4 });
  },
  windmill(b) {
    b.add(G.cyl(2.2, 3.4, 11, 8), mat('#8a4a3a'), { y: 5.5 });
    b.add(G.cone(2.8, 3, 8), mat('#3a3a3a'), { y: 12.5 });
    b.add(G.box(1.2, 2.2, 0.3), mat('#4a2a1a'), { y: 1.1, z: 3.2 });
    const bl = mat('#f4f0e0', { side: THREE.DoubleSide });
    const arm = mat('#5a3a24');
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const cx = Math.cos(a) * 4.2;
      const cy = 12 + Math.sin(a) * 4.2;
      b.add(G.box(0.2, 8.4, 0.2), arm, { x: Math.cos(a) * 4.2, y: cy, z: 3.0, rz: a - Math.PI / 2 });
      b.add(G.box(1.5, 6.5, 0.08), bl, { x: cx + Math.cos(a + Math.PI / 2) * 0.8, y: cy + Math.sin(a + Math.PI / 2) * 0.8, z: 3.05, rz: a - Math.PI / 2 });
    }
    b.add(G.sph(0.5, 6, 4), mat('#222222'), { y: 12, z: 3.0 });
  },
  torii(b) {
    const r = mat('#e0401e');
    b.add(G.cyl(0.3, 0.34, 6, 8), r, { x: -2.6, y: 3 });
    b.add(G.cyl(0.3, 0.34, 6, 8), r, { x: 2.6, y: 3 });
    b.add(G.box(6.4, 0.4, 0.4), r, { y: 4.8 });
    b.add(G.box(7.6, 0.45, 0.6), r, { y: 5.9 });
    b.add(G.box(8.0, 0.3, 0.7), mat('#222222'), { y: 6.25 });
    b.add(G.box(0.7, 0.6, 0.7), mat('#222222'), { x: -2.6, y: 0.3 });
    b.add(G.box(0.7, 0.6, 0.7), mat('#222222'), { x: 2.6, y: 0.3 });
  },
  pagoda(b) {
    for (let i = 0; i < 5; i++) {
      const w = 5.5 - i * 0.8;
      const y = i * 3.2;
      b.add(G.box(w * 0.75, 2.4, w * 0.75), mat('#c8402a'), { y: y + 1.2 });
      b.add(G.cone(w * 0.95, 1.4, 4), mat('#2f3a3a'), { y: y + 3.0, ry: Math.PI / 4 });
    }
    b.add(G.cyl(0.08, 0.08, 3, 4), mat('#b89a3a'), { y: 17.5 });
  },
  lantern(b) {
    const c = mat('#9a9a94');
    b.add(G.box(1.2, 0.3, 1.2), c, { y: 0.15 });
    b.add(G.cyl(0.18, 0.22, 1.4, 6), c, { y: 1 });
    b.add(G.box(0.9, 0.2, 0.9), c, { y: 1.8 });
    b.add(G.box(0.7, 0.6, 0.7), mat('#ffd88a', { emissive: '#8a6a20' }), { y: 2.2 });
    b.add(G.cone(0.95, 0.6, 4), c, { y: 2.8, ry: Math.PI / 4 });
  },
  moai(b) {
    const c = mat('#8a8078');
    b.add(G.box(2.2, 3.4, 1.8), c, { y: 1.7 });
    b.add(G.box(2.3, 3.6, 2.0), mat('#958b82'), { y: 5.2 });
    b.add(G.box(0.5, 1.4, 0.6), mat('#9d948b'), { y: 5.0, z: 1.1 });
    b.add(G.box(2.4, 0.4, 0.4), mat('#5a524c'), { y: 6.0, z: 0.95 });
    b.add(G.box(0.4, 1.8, 0.7), c, { x: -1.3, y: 5.4 });
    b.add(G.box(0.4, 1.8, 0.7), c, { x: 1.3, y: 5.4 });
    b.add(G.cyl(0.9, 1.0, 0.9, 8), mat('#a8503a'), { y: 7.45 });
  },
  pyramid_small(b) {
    b.add(G.cone(12, 13, 4), mat('#e8c070'), { y: 6.5, ry: Math.PI / 4 });
  },
  obelisk(b) {
    b.add(G.cyl(0.55, 0.85, 9, 4), mat('#d8b070'), { y: 4.5, ry: Math.PI / 4 });
    b.add(G.cone(0.6, 1.0, 4), mat('#ffd86a', { emissive: '#553300' }), { y: 9.5, ry: Math.PI / 4 });
    b.add(G.box(2.2, 0.6, 2.2), mat('#c8a060'), { y: 0.3 });
  },
  column(b) {
    const c = mat('#f0eadc');
    b.add(G.cyl(0.55, 0.6, 6, 10), c, { y: 3.3 });
    b.add(G.box(1.6, 0.4, 1.6), c, { y: 6.5 });
    b.add(G.box(1.6, 0.4, 1.6), c, { y: 0.2 });
  },
  igloo(b) {
    b.add(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#eef4ff'), {});
    b.add(new THREE.CylinderGeometry(1.1, 1.1, 2, 10, 1, false, 0, Math.PI), mat('#e2eaf8'), { z: 3, rx: Math.PI / 2, ry: 0, rz: Math.PI / 2 });
  },
  snowman(b) {
    const w = mat('#f4f8ff');
    b.add(G.sph(0.9, 10, 8), w, { y: 0.8 });
    b.add(G.sph(0.65, 10, 8), w, { y: 2.0 });
    b.add(G.sph(0.45, 10, 8), w, { y: 2.9 });
    b.add(G.cyl(0.35, 0.35, 0.5, 8), mat('#222222'), { y: 3.5 });
    b.add(G.cyl(0.55, 0.55, 0.06, 8), mat('#222222'), { y: 3.27 });
    b.add(G.cone(0.08, 0.5, 5), mat('#ff8a1a'), { y: 2.9, z: 0.6, rx: Math.PI / 2 });
    b.add(G.cyl(0.7, 0.7, 0.18, 8), mat('#d02828'), { y: 2.45 });
  },
  umbrella(b) {
    b.add(G.cyl(0.05, 0.05, 2.6, 4), mat('#dddddd'), { y: 1.3 });
    b.add(G.cone(1.6, 0.7, 8), mat('#ffffff'), { y: 2.7 }, ['#ff3a3a', '#1a8aff', '#ffd21a', '#2ad07a']);
    b.add(G.box(0.7, 0.1, 1.8), mat('#f4f4f4'), { x: 1.1, y: 0.35 });
  },
  totem(b) {
    const cols = ['#c8a050', '#b04a2a', '#3a8a6a', '#c8a050'];
    for (let i = 0; i < 4; i++) {
      b.add(G.box(1, 1.2, 1), mat(cols[i]), { y: 0.6 + i * 1.2 });
      b.add(G.box(0.8, 0.2, 0.1), mat('#1a1a1a'), { y: 0.8 + i * 1.2, z: 0.51 });
    }
    b.add(G.box(3, 0.3, 0.6), mat('#c8a050'), { y: 4.6 });
  },
};

// ---------- 取得物件模型零件（快取） ----------
const modelCache = new Map();
export function getModelParts(type, night) {
  const key = type + (night ? '|n' : '');
  if (modelCache.has(key)) return modelCache.get(key);
  const fn = MODELS[type];
  if (!fn) return null;
  const b = new Builder();
  fn(b, night);
  const parts = b.build();
  modelCache.set(key, parts);
  return parts;
}

// ---------- 看板與招牌 ----------
const spriteMatCache = new Map();
export function spriteMaterial(type, variant, stage) {
  const key = type + '|' + variant + '|' + (stage ? stage.name : '');
  if (spriteMatCache.has(key)) return spriteMatCache.get(key);
  const canvas = getSprite(type, variant, stage);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.35, fog: true });
  m.userData.aspect = canvas.width / canvas.height;
  spriteMatCache.set(key, m);
  return m;
}

const signMatCache = new Map();
export function signMaterial(type, variant, stage, forkNames) {
  const key = type + '|' + variant + '|' + (stage ? stage.name : '') + (forkNames ? forkNames.join('/') : '');
  if (signMatCache.has(key)) return signMatCache.get(key);
  const canvas = type === 'forksign' ? makeForkSign(forkNames[0], forkNames[1]) : getSprite(type, variant, stage);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: type === 'neon' ? 0.9 : 0.35 });
  m.userData.aspect = canvas.width / canvas.height;
  signMatCache.set(key, m);
  return m;
}

export const MODEL_TYPES = new Set(Object.keys(MODELS));
