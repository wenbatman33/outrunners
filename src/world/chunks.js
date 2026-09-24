// 將 Path 切成區塊，建立道路/地面/物件網格；依玩家位置動態載入與釋放
import * as THREE from 'three';
import { TUNING } from '../config.js';
import { makeCanvas, mulberry32, shade, hexToRgb } from '../util.js';
import { makeBanner } from '../art/sprites.js';
import { PROP_INFO } from './propInfo.js';
import { getModelParts, spriteMaterial, signMaterial } from './props.js';
import { STAGES, nextOptions, stageIdOf } from '../data/stages.js';

// ---------- 道路貼圖 ----------
const roadTexCache = new Map();
function roadTexture(stage) {
  const key = stage.name;
  if (roadTexCache.has(key)) return roadTexCache.get(key);
  const W = 256;
  const H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(7);
  ctx.fillStyle = stage.road[0];
  ctx.fillRect(0, 0, W, H);
  // 柏油雜訊
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(rng() * W, rng() * H, 2, 2);
  }
  // 路緣紅白條
  const rw = W * 0.055;
  for (let k = 0; k < 2; k++) {
    ctx.fillStyle = stage.rumble[k];
    ctx.fillRect(0, k * (H / 2), rw, H / 2);
    ctx.fillRect(W - rw, k * (H / 2), rw, H / 2);
  }
  // 邊線
  ctx.fillStyle = stage.lane;
  ctx.fillRect(rw + 3, 0, 4, H);
  ctx.fillRect(W - rw - 7, 0, 4, H);
  // 車道虛線
  for (const u of [1 / 3, 2 / 3]) {
    ctx.fillRect(W * u - 2.5, H * 0.1, 5, H * 0.35);
    ctx.fillRect(W * u - 2.5, H * 0.6, 5, H * 0.35);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  roadTexCache.set(key, t);
  return t;
}
const ROAD_TILE = 24; // 貼圖一次重複的長度(m)

const roadMatCache = new Map();
function roadMaterial(stage, side) {
  const key = stage.name + side;
  if (roadMatCache.has(key)) return roadMatCache.get(key);
  const m = new THREE.MeshLambertMaterial({
    map: roadTexture(stage),
    polygonOffset: true,
    polygonOffsetFactor: side === 1 ? -3 : -2,
    polygonOffsetUnits: side === 1 ? -3 : -2,
  });
  roadMatCache.set(key, m);
  return m;
}
const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------- 拱門 ----------
const bannerCache = new Map();
function bannerMat(kind) {
  if (bannerCache.has(kind)) return bannerCache.get(kind);
  const cfg = {
    start: ['START', '#d81f1f'],
    checkpoint: ['CHECKPOINT', '#1f5ad8'],
    goal: ['GOAL', '#e0a010'],
  }[kind];
  const tex = new THREE.CanvasTexture(makeBanner(cfg[0], cfg[1]));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: new THREE.Color('#333333'), emissiveMap: tex });
  bannerCache.set(kind, m);
  return m;
}

function buildGate(kind, p) {
  const g = new THREE.Group();
  const hw = TUNING.roadHalfWidth;
  const pillarM = new THREE.MeshLambertMaterial({ color: kind === 'goal' ? '#ffd23a' : '#e8e8e8' });
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8, 0.9), pillarM);
    pil.position.set(s * (hw + 1.2), 4, 0);
    pil.castShadow = true;
    g.add(pil);
  }
  const banner = new THREE.Mesh(new THREE.PlaneGeometry((hw + 1.6) * 2, 2.6), bannerMat(kind));
  banner.position.set(0, 7.2, 0);
  g.add(banner);
  // 起點：燈號架
  if (kind === 'start') {
    const lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#330000' }));
      l.position.set(-1.4 + i * 1.4, 5.3, 0.3);
      g.add(l);
      lights.push(l);
    }
    g.userData.lights = lights;
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = -p.h;
  return g;
}

// ---------- 區塊 ----------
const _pt = {};
const _pt2 = {};
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

const ALIGN = new Set(['lamp', 'lamp_paris', 'torii']);

export function buildChunk(path, c, opts = {}) {
  const CS = TUNING.chunkSegs;
  const i0 = c * CS;
  const i1 = Math.min(i0 + CS, path.n - 1);
  if (i0 >= i1) return null;
  const st = path.stage;
  const hw = TUNING.roadHalfWidth;
  const segLen = TUNING.segLen;
  const group = new THREE.Group();
  group.name = `chunk-${path.id}-${c}`;
  const shadows = opts.shadows;

  // ---- 道路 ----
  {
    const cnt = i1 - i0 + 1;
    const pos = new Float32Array(cnt * 2 * 3);
    const uv = new Float32Array(cnt * 2 * 2);
    const nor = new Float32Array(cnt * 2 * 3);
    const idx = [];
    for (let k = 0; k < cnt; k++) {
      const i = i0 + k;
      const h = path.h[i];
      const rx = Math.cos(h);
      const rz = Math.sin(h);
      const x = path.x[i];
      const y = path.y[i] + 0.03;
      const z = path.z[i];
      pos.set([x - rx * hw, y, z - rz * hw, x + rx * hw, y, z + rz * hw], k * 6);
      const v = (i * segLen) / ROAD_TILE;
      uv.set([0, v, 1, v], k * 4);
      nor.set([0, 1, 0, 0, 1, 0], k * 6);
      if (k < cnt - 1) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMaterial(st, path.side));
    m.receiveShadow = !!shadows;
    group.add(m);
  }

  // ---- 地面（條紋）----
  {
    const gw = TUNING.groundWidth;
    const seaSide = st.sea === 'left' ? -1 : st.sea === 'right' ? 1 : 0;
    const g1 = hexToRgb(st.ground[0]).map((v) => v / 255);
    const g2 = hexToRgb(st.ground[1]).map((v) => v / 255);
    const sand = hexToRgb('#e8d49a').map((v) => v / 255);
    const sand2 = hexToRgb('#d8c088').map((v) => v / 255);
    const cliff = hexToRgb(shade(st.ground[1], -0.25)).map((v) => v / 255);
    const pos = [];
    const col = [];
    const yOff = path.side === -1 ? -0.09 : path.side === 1 ? -0.06 : -0.06;
    for (const side of [-1, 1]) {
      // 每條帶：[起始距離, 結束距離, 起始高度, 結束高度, 顏色A, 顏色B]
      const bands =
        side === seaSide
          ? [
              [hw, hw + 18, 0, -0.3, g1, g2],
              [hw + 18, hw + 30, -0.3, -2.5, sand, sand2],
              [hw + 30, hw + 44, -2.5, -60, sand2, sand2],
            ]
          : [
              [hw, hw + gw, 0, 0, g1, g2],
              [hw + gw, hw + gw + 30, 0, -50, cliff, cliff],
            ];
      for (let i = i0; i < i1; i++) {
        const stripe = Math.floor(i / 3) % 2 === 0;
        const ha = path.h[i];
        const hb = path.h[i + 1];
        const wa = path.gwSide[side < 0 ? 0 : 1][i] / gw;
        const wb = path.gwSide[side < 0 ? 0 : 1][i + 1] / gw;
        const kk = side < 0 ? 0 : 1;
        const limited = !path.skirt[kk][i] || !path.skirt[kk][i + 1];
        const sk = !limited;
        for (const [d0r, d1r, y0, y1r, ca, cb] of bands) {
          if (!sk && y1r < -5) continue; // 分岔兩路之間不做懸崖
          const y1 = y1r;
          const c3 = stripe ? ca : cb;
          // 非海岸側依曲率縮放寬度（內側急彎）
          const sc0 = side === seaSide && !limited ? 1 : side === seaSide ? Math.min(1, wa * 4) : wa;
          const sc1 = side === seaSide && !limited ? 1 : side === seaSide ? Math.min(1, wb * 4) : wb;
          const fix = (d, scl) => (d <= hw ? d : hw + (d - hw) * scl);
          const d0 = fix(d0r, sc0);
          const d1 = fix(d1r, sc0);
          const d0b = fix(d0r, sc1);
          const d1b = fix(d1r, sc1);
          const A = [path.x[i] + Math.cos(ha) * d0 * side, path.y[i] + y0 + yOff, path.z[i] + Math.sin(ha) * d0 * side];
          const B = [path.x[i] + Math.cos(ha) * d1 * side, path.y[i] + y1 + yOff, path.z[i] + Math.sin(ha) * d1 * side];
          const C = [path.x[i + 1] + Math.cos(hb) * d0b * side, path.y[i + 1] + y0 + yOff, path.z[i + 1] + Math.sin(hb) * d0b * side];
          const D = [path.x[i + 1] + Math.cos(hb) * d1b * side, path.y[i + 1] + y1 + yOff, path.z[i + 1] + Math.sin(hb) * d1b * side];
          // 依側邊調整繞序，讓法線朝上
          if (side > 0) pos.push(...A, ...B, ...C, ...B, ...D, ...C);
          else pos.push(...B, ...A, ...D, ...A, ...C, ...D);
          for (let k = 0; k < 6; k++) col.push(c3[0], c3[1], c3[2]);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat);
    m.receiveShadow = !!shadows;
    group.add(m);
  }

  // ---- 拱門 ----
  const gates = [];
  for (let i = i0; i < i1; i++) {
    const kind = path.info[i].gate;
    if (!kind) continue;
    path.pointAt(i * segLen, 0, _pt);
    const gate = buildGate(kind, _pt);
    group.add(gate);
    gates.push(gate);
  }

  // ---- 物件 ----
  const byType = new Map();
  for (let i = i0; i < i1; i++) {
    for (const p of path.info[i].props) {
      let arr = byType.get(p.type);
      if (!arr) byType.set(p.type, (arr = []));
      arr.push({ i, p });
    }
  }
  const night = !!st.night;
  for (const [type, list] of byType) {
    const pi = PROP_INFO[type];
    if (!pi) continue;
    if (pi.kind === 'model') {
      const parts = getModelParts(type, night);
      if (!parts) continue;
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        list.forEach(({ i, p }, k) => {
          path.pointAt(i * segLen, p.x, _pt);
          p.wx = _pt.x;
          p.wz = _pt.z;
          let rot = p.rot;
          if (ALIGN.has(type)) rot = p.x < 0 ? -_pt.h : Math.PI - _pt.h;
          _quat.setFromAxisAngle(_up, rot);
          _pos.set(_pt.x, _pt.y - 0.05, _pt.z);
          _scl.setScalar(p.scale);
          _mat4.compose(_pos, _quat, _scl);
          im.setMatrixAt(k, _mat4);
          if (part.tint) {
            _col.set(part.tint[p.v % part.tint.length]);
            im.setColorAt(k, _col);
          }
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = !!shadows;
        im.computeBoundingSphere();
        group.add(im);
      }
    } else if (pi.kind === 'sprite') {
      for (const { i, p } of list) {
        const m = spriteMaterial(type, p.v % 3, st);
        const sp = new THREE.Sprite(m);
        const h = pi.h * p.scale;
        sp.center.set(0.5, 0);
        sp.scale.set(h * m.userData.aspect, h, 1);
        path.pointAt(i * segLen, p.x, _pt);
        p.wx = _pt.x;
        p.wz = _pt.z;
        sp.position.set(_pt.x, _pt.y - 0.1, _pt.z);
        group.add(sp);
      }
    } else if (pi.kind === 'sign') {
      for (const { i, p } of list) {
        let names = null;
        if (type === 'forksign') {
          const opt = path.parent ? nextOptions(path.parent.route) : null;
          names = opt ? [STAGES[stageIdOf(opt.left)].name, STAGES[stageIdOf(opt.right)].name] : ['LEFT', 'RIGHT'];
          if (!path.parent || !path.parent.route.bound) names = ['WEST BOUND', 'EAST BOUND'];
        }
        const m = signMaterial(type, p.v % 3, st, names);
        const w = pi.w;
        const h = w / m.userData.aspect;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        path.pointAt(i * segLen, p.x, _pt);
        p.wx = _pt.x;
        p.wz = _pt.z;
        mesh.position.set(_pt.x, _pt.y + h / 2 - 0.05, _pt.z);
        mesh.rotation.y = -_pt.h;
        mesh.castShadow = !!shadows;
        group.add(mesh);
      }
    }
  }
  group.userData.gates = gates;
  return group;
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      // 只釋放區塊專屬的幾何（道路、地面、拱門、招牌平面）；共用幾何保留
      if (!o.isInstancedMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
  });
}

// 管理所有已建立的區塊
export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // key -> {group, path, c}
    this.shadows = false;
  }
  // wanted: [{path, fromSeg, toSeg}]
  sync(wanted) {
    const CS = TUNING.chunkSegs;
    const need = new Set();
    for (const w of wanted) {
      const c0 = Math.max(0, Math.floor(w.fromSeg / CS));
      const c1 = Math.min(Math.floor((w.path.n - 2) / CS), Math.floor(w.toSeg / CS));
      for (let c = c0; c <= c1; c++) {
        const key = w.path.id + ':' + c;
        need.add(key);
        if (!this.chunks.has(key)) {
          const g = buildChunk(w.path, c, { shadows: this.shadows });
          if (g) {
            this.scene.add(g);
            this.chunks.set(key, { group: g, path: w.path, c });
          }
        }
      }
    }
    for (const [key, ch] of this.chunks) {
      if (!need.has(key)) {
        this.scene.remove(ch.group);
        disposeGroup(ch.group);
        this.chunks.delete(key);
      }
    }
  }
  clear() {
    for (const ch of this.chunks.values()) {
      this.scene.remove(ch.group);
      disposeGroup(ch.group);
    }
    this.chunks.clear();
  }
  // 取得某條路徑上的起點燈號
  startLights() {
    for (const ch of this.chunks.values()) {
      for (const g of ch.group.userData.gates || []) if (g.userData.lights) return g.userData.lights;
    }
    return null;
  }
}
