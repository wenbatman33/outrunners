// 可選車輛（8 台）精緻版模型：以剖面放樣做出曲面車身 + 烤漆材質 + 細節零件
// 區域座標：前方 -Z、右方 +X、上方 +Y；原點在車身中心地面
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas } from '../util.js';

// ---------------- 材質 ----------------
const cache = new Map();
function std(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
const MAT = {
  chrome: () => std('chrome', () => new THREE.MeshStandardMaterial({ color: '#e8ecf0', metalness: 1, roughness: 0.14 })),
  black: () => std('black', () => new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.2, roughness: 0.55 })),
  trim: () => std('trim', () => new THREE.MeshStandardMaterial({ color: '#0c0c0e', metalness: 0.4, roughness: 0.35 })),
  rubber: () => std('rubber', () => new THREE.MeshStandardMaterial({ color: '#18181a', roughness: 0.92 })),
  interior: (c = '#1e1e22') => std('int' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
  glass: () => std('glass', () => new THREE.MeshPhysicalMaterial({ color: '#b8dcff', metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide })),
  lens: () => std('lens', () => new THREE.MeshPhysicalMaterial({ color: '#f4f8ff', roughness: 0.05, clearcoat: 1, emissive: '#fff8e0', emissiveIntensity: 0.3 })),
  rim: (c = '#d8dce2') => std('rim' + c, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.95, roughness: 0.22 })),
  disc: () => std('disc', () => new THREE.MeshStandardMaterial({ color: '#77777c', metalness: 0.9, roughness: 0.5 })),
  skin: () => std('skin', () => new THREE.MeshStandardMaterial({ color: '#f0c09a', roughness: 0.7 })),
  cloth: (c) => std('cloth' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })),
  hair: (c) => std('hair' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
  flat: (c, o = {}) => std('flat' + c + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o })),
};
function paint() {
  // 烤漆：金屬漆 + 透明亮光層；顏色由頂點色提供（可做條紋/雙色）
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    vertexColors: true,
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
}

function add(parent, geo, m, t = {}) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(t.x || 0, t.y || 0, t.z || 0);
  o.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
  if (t.s) o.scale.setScalar(t.s);
  if (t.sx || t.sy || t.sz) o.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cylX = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const cylZ = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

// ---------------- 放樣車身 ----------------
/**
 * st: 剖面陣列，每個 [t(0 車尾~1 車頭), 半寬, 底高, 頂高, 選項?]
 * 選項 {dip: 頂部中央下凹量(翼子板凸起), nX, nTop}
 * o: {L, nX, nTop, nBot, taper(上窄下寬), color, colorFn(x,y,z)->hex, arches:[{z,r,y}]}
 */
function loftBody(st, o) {
  const M = 36; // 剖面點數
  const L = o.L;
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const rows = [];
  const topLine = [];
  // 在剖面間插值，得到平滑車身
  const dense = [];
  const sub = 3;
  for (let i = 0; i < st.length - 1; i++) {
    for (let k = 0; k < sub; k++) {
      const f = k / sub;
      const a = st[i];
      const b = st[i + 1];
      const e = f * f * (3 - 2 * f);
      const oa = a[4] || {};
      const ob = b[4] || {};
      dense.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e, { dip: (oa.dip || 0) + ((ob.dip || 0) - (oa.dip || 0)) * e, nTop: (oa.nTop ?? o.nTop) + ((ob.nTop ?? o.nTop) - (oa.nTop ?? o.nTop)) * e }]);
    }
  }
  dense.push(st[st.length - 1]);
  for (const s of dense) {
    const [t, hw, y0, y1, so = {}] = s;
    const z = L / 2 - t * L;
    const row = [];
    const ym = (y0 + y1) / 2;
    const hh = (y1 - y0) / 2;
    const nTop = so.nTop ?? o.nTop ?? 2.6;
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2 - Math.PI / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = o.nX ?? 4;
      const n2 = sa > 0 ? nTop : o.nBot ?? 6;
      let x = hw * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / nx);
      let y = ym + hh * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n2);
      if (sa > 0) {
        x *= 1 - (o.taper ?? 0.1) * sa; // 上窄下寬
        const u = Math.min(1, Math.abs(x) / hw);
        y -= (so.dip || 0) * (1 - u * u) * sa;
      }
      // 輪拱：側面下緣挖出圓弧
      for (const w of o.arches || []) {
        const dz = z - w.z;
        if (Math.abs(dz) < w.r && Math.abs(x) > hw * 0.45) {
          const ay = w.y + Math.sqrt(w.r * w.r - dz * dz);
          if (y < ay && sa < 0.6) y = Math.max(y, ay);
        }
      }
      row.push(pos.length / 3);
      pos.push(x, y, z);
      if (j === M / 2) topLine.push({ z, y, hw });
      c.set(o.colorFn ? o.colorFn(x, y, z, t) : o.color);
      col.push(c.r, c.g, c.b);
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = rows[i][j];
      const b = rows[i][(j + 1) % M];
      const cc = rows[i + 1][j];
      const d = rows[i + 1][(j + 1) % M];
      idx.push(a, cc, b, b, cc, d);
    }
  }
  // 封口
  for (const [ri, flip] of [[0, false], [rows.length - 1, true]]) {
    const r = rows[ri];
    let cx = 0;
    let cy = 0;
    for (const v of r) cy += pos[v * 3 + 1];
    cy /= r.length;
    const z = pos[r[0] * 3 + 2];
    const center = pos.length / 3;
    pos.push(cx, cy, z);
    const cr = col.slice(r[0] * 3, r[0] * 3 + 3);
    col.push(...cr);
    for (let j = 0; j < M; j++) {
      const a = r[j];
      const b = r[(j + 1) % M];
      if (flip) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.top = topLine;
  return g;
}

// 沿車頂曲線的條紋（x0~x1 為橫向範圍）
function stripe(body, top, x0, x1, m, from = 0, to = 1) {
  const pos = [];
  const idx = [];
  const pts = top.filter((p, i) => i / (top.length - 1) >= from && i / (top.length - 1) <= to);
  pts.forEach((p, i) => {
    const drop = (x) => 0.06 * (x / p.hw) ** 2;
    pos.push(x0, p.y - drop(x0) + 0.008, p.z, x1, p.y - drop(x1) + 0.008, p.z);
    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.material.side = THREE.DoubleSide;
  body.add(mesh);
}

// ---------------- 輪胎與輪框 ----------------
let tireGeoCache = null;
function tireGeo() {
  if (tireGeoCache) return tireGeoCache;
  // 以 Lathe 做出圓潤胎壁（沿 X 軸）
  const pts = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    pts.push(new THREE.Vector2(0.78 + Math.sin(a) * 0.22, -0.5 + (1 - Math.cos(a)) * 0.5));
  }
  pts.unshift(new THREE.Vector2(0.62, -0.46));
  pts.push(new THREE.Vector2(0.62, 0.46));
  const g = new THREE.LatheGeometry(pts, 28);
  g.rotateZ(Math.PI / 2);
  tireGeoCache = g;
  return g;
}

function wheel(parent, x, y, z, r, w, o = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const spin = new THREE.Group();
  pivot.add(spin);
  const side = Math.sign(x) || 1;
  const t = new THREE.Mesh(tireGeo(), MAT.rubber());
  t.scale.set(w, r, r);
  t.castShadow = true;
  spin.add(t);
  // 煞車碟（不轉）
  const disc = new THREE.Mesh(cylX(r * 0.52, w * 0.3, 20), MAT.disc());
  pivot.add(disc);
  // 輪框
  const rimM = MAT.rim(o.rimColor);
  const rimR = r * 0.64;
  const face = new THREE.Mesh(cylX(rimR, w * 0.2, 24), MAT.trim());
  face.position.x = side * w * 0.3;
  spin.add(face);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR, r * 0.05, 6, 28).rotateY(Math.PI / 2), rimM);
  lip.position.x = side * w * 0.42;
  spin.add(lip);
  const spokes = o.spokes ?? 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sp = new THREE.Mesh(rbox(w * 0.14, rimR * 0.95, r * 0.13, 0.015, 1), rimM);
    sp.position.set(side * w * 0.4, Math.cos(a) * rimR * 0.48, Math.sin(a) * rimR * 0.48);
    sp.rotation.x = -a;
    spin.add(sp);
  }
  const cap = new THREE.Mesh(cylX(r * 0.14, w * 0.12, 12), rimM);
  cap.position.x = side * w * 0.46;
  spin.add(cap);
  parent.add(pivot);
  return { pivot, spin };
}

// ---------------- 人物 ----------------
function capsule(r, len) {
  return new THREE.CapsuleGeometry(r, len, 4, 10);
}
function people(body, o) {
  const { y, z, spread } = o;
  const res = {};
  const seat = MAT.interior(o.seat || '#2a2a2e');
  for (const [i, sx] of [[0, -spread], [1, spread]]) {
    // 座椅：椅背 + 頭枕
    add(body, rbox(0.46, 0.5, 0.12, 0.05), seat, { x: sx, y: y + 0.22, z: z + 0.2, rx: -0.18 });
    add(body, rbox(0.46, 0.12, 0.46, 0.05), seat, { x: sx, y: y - 0.02, z: z - 0.05 });
    const driver = i === 0;
    const shirt = MAT.cloth(driver ? o.shirt?.[0] || '#f4f4f4' : o.shirt?.[1] || '#ff4a7a');
    // 軀幹
    add(body, capsule(0.17, 0.26), shirt, { x: sx, y: y + 0.3, z: z + 0.02, sz: 0.75 });
    // 頭
    add(body, new THREE.SphereGeometry(0.125, 16, 12), MAT.skin(), { x: sx, y: y + 0.66, z: z - 0.01 });
    if (driver) {
      // 深色短髮 + 太陽眼鏡
      add(body, new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.hair('#2e1a0e'), { x: sx, y: y + 0.68, z: z + 0.01 });
      add(body, rbox(0.2, 0.045, 0.03, 0.01), MAT.trim(), { x: sx, y: y + 0.67, z: z - 0.12 });
      // 手臂握方向盤
      for (const ax of [-0.16, 0.16]) {
        const arm = add(body, capsule(0.045, 0.34), shirt, { x: sx + ax, y: y + 0.36, z: z - 0.2, rx: 1.15 });
        arm.rotation.z = -ax * 0.9;
      }
      // 方向盤
      add(body, new THREE.TorusGeometry(0.17, 0.018, 6, 20), MAT.trim(), { x: sx, y: y + 0.38, z: z - 0.42, rx: -0.4 });
    } else {
      // 金色長髮（會隨速度飄動）
      add(body, new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), MAT.hair('#f2cf5a'), { x: sx, y: y + 0.68, z: z + 0.01 });
      const hair = new THREE.Group();
      hair.position.set(sx, y + 0.7, z + 0.08);
      const strand = new THREE.Mesh(rbox(0.26, 0.36, 0.08, 0.035), MAT.hair('#f2cf5a'));
      strand.position.y = -0.16;
      strand.castShadow = true;
      hair.add(strand);
      body.add(hair);
      res.hair = hair;
      // 手臂舉起揮手
      add(body, capsule(0.04, 0.3), MAT.skin(), { x: sx + 0.2, y: y + 0.62, z: z + 0.02, rz: -0.3 });
    }
  }
  return res;
}

function windshield(body, o) {
  const g = new THREE.Group();
  g.position.set(0, o.y, o.z);
  g.rotation.x = o.tilt ?? -1.0;
  const glass = new THREE.Mesh(rbox(o.w, o.h, 0.02, 0.009, 1), MAT.glass());
  glass.position.y = o.h / 2;
  g.add(glass);
  const fm = MAT.trim();
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(rbox(0.05, o.h + 0.02, 0.05, 0.02, 1), o.frame || fm);
    f.position.set((sx * o.w) / 2, o.h / 2, 0);
    g.add(f);
  }
  const top = new THREE.Mesh(rbox(o.w + 0.06, 0.05, 0.05, 0.02, 1), o.frame || fm);
  top.position.y = o.h;
  g.add(top);
  body.add(g);
  // 後照鏡
  for (const sx of [-1, 1]) {
    add(body, rbox(0.03, 0.03, 0.12, 0.01, 1), fm, { x: sx * (o.w / 2 + 0.08), y: o.y + 0.05, z: o.z + 0.05 });
    add(body, rbox(0.16, 0.09, 0.05, 0.02, 1), o.mirror || fm, { x: sx * (o.w / 2 + 0.17), y: o.y + 0.08, z: o.z + 0.05 });
  }
}

function plate(body, y, z, text) {
  const c = makeCanvas(160, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f4ea';
  ctx.fillRect(0, 0, 160, 64);
  ctx.strokeStyle = '#1a2a6a';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 154, 58);
  ctx.fillStyle = '#1a2a6a';
  ctx.font = 'bold 34px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 80, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  m.position.set(0, y, z);
  body.add(m);
}

// 圓形尾燈（含外圈鍍鉻）
function roundLamp(body, tail, x, y, z, r) {
  add(body, cylZ(r, 0.05, 20), tail, { x, y, z });
  add(body, new THREE.TorusGeometry(r, 0.012, 6, 20), MAT.chrome(), { x, y, z: z + 0.02 });
}

// 頭燈
function headLamp(body, head, x, y, z, w, h) {
  add(body, rbox(w, h, 0.06, Math.min(w, h) * 0.45, 2), head, { x, y, z });
}

// ---------------- 8 台車 ----------------
// 工具：t 值(0 車尾~1 車頭)轉 z
const Z = (L, t) => L / 2 - t * L;

const STYLES = {
  // MAD POWER：楔形超跑（F40 風）+ 大尾翼
  wing(car, body, P) {
    const L = 4.42;
    const r = 0.34;
    const arches = [{ z: Z(L, 0.2), r: 0.43, y: r }, { z: Z(L, 0.8), r: 0.42, y: r }];
    const st = [
      [0, 0.86, 0.3, 0.8],
      [0.03, 0.95, 0.24, 0.9],
      [0.18, 0.99, 0.22, 0.93, { dip: 0.04 }],
      [0.34, 0.99, 0.22, 0.93, { dip: 0.02 }],
      [0.4, 0.98, 0.22, 0.8, { dip: 0.02 }],
      [0.6, 0.97, 0.22, 0.79],
      [0.66, 0.97, 0.22, 0.8, { dip: 0.04 }],
      [0.78, 0.95, 0.22, 0.73, { dip: 0.06 }],
      [0.9, 0.9, 0.23, 0.6, { dip: 0.04 }],
      [0.97, 0.82, 0.26, 0.5],
      [1, 0.66, 0.3, 0.44],
    ];
    add(body, loftBody(st, { L, nX: 5, nTop: 3, taper: 0.14, color: car.color, arches }), P.paint);
    // 座艙
    add(body, rbox(1.5, 0.08, 0.95, 0.03), MAT.interior(), { y: 0.77, z: Z(L, 0.5) });
    P.people = people(body, { y: 0.52, z: Z(L, 0.47), spread: 0.38, seat: '#b02020' });
    windshield(body, { y: 0.8, z: Z(L, 0.62), w: 1.46, h: 0.42, tilt: -1.08 });
    // 引擎蓋百葉
    for (let i = 0; i < 6; i++) add(body, rbox(1.2, 0.02, 0.05, 0.01, 1), MAT.trim(), { y: 0.94, z: Z(L, 0.1 + i * 0.04) });
    // 側面進氣口
    for (const sx of [-1, 1]) add(body, rbox(0.06, 0.16, 0.5, 0.03), MAT.trim(), { x: sx * 0.95, y: 0.6, z: Z(L, 0.34) });
    // 大尾翼
    add(body, rbox(1.94, 0.05, 0.42, 0.02), P.paint2, { y: 1.2, z: Z(L, 0.04) });
    for (const sx of [-1, 1]) {
      add(body, rbox(0.05, 0.3, 0.42, 0.02), P.paint2, { x: sx * 0.97, y: 1.1, z: Z(L, 0.04) });
      add(body, rbox(0.05, 0.28, 0.12, 0.02), MAT.trim(), { x: sx * 0.62, y: 1.03, z: Z(L, 0.06) });
    }
    // 車尾：黑網 + 四圓燈 + 三出排氣
    add(body, rbox(1.6, 0.34, 0.05, 0.03), MAT.black(), { y: 0.56, z: L / 2 - 0.02 });
    for (const x of [-0.72, -0.44, 0.44, 0.72]) roundLamp(body, P.tail, x, 0.6, L / 2 + 0.02, 0.1);
    for (const x of [-0.12, 0, 0.12]) add(body, cylZ(0.05, 0.16, 12), MAT.chrome(), { x, y: 0.34, z: L / 2 + 0.02 });
    add(body, rbox(1.7, 0.1, 0.3, 0.03), MAT.black(), { y: 0.26, z: L / 2 - 0.12 });
    plate(body, 0.42, L / 2 + 0.01, 'MAD PWR');
    headLamp(body, P.head, -0.62, 0.5, -L / 2 + 0.2, 0.34, 0.1);
    headLamp(body, P.head, 0.62, 0.5, -L / 2 + 0.2, 0.34, 0.1);
    add(body, rbox(0.9, 0.08, 0.1, 0.03), MAT.black(), { y: 0.32, z: -L / 2 + 0.04 });
    return { L, W: 1.98, r, wb: [Z(L, 0.2), Z(L, 0.8)], tw: 0.84, ww: 0.3 };
  },

  // BAD BOY：Cobra 風，腰身、鼓起的翼子板、側排氣、金色條紋
  cobra(car, body, P) {
    const L = 4.15;
    const r = 0.34;
    const arches = [{ z: Z(L, 0.18), r: 0.42, y: r }, { z: Z(L, 0.8), r: 0.42, y: r }];
    const st = [
      [0, 0.76, 0.32, 0.66],
      [0.05, 0.9, 0.26, 0.78, { dip: 0.06 }],
      [0.18, 0.94, 0.24, 0.84, { dip: 0.14 }],
      [0.32, 0.87, 0.24, 0.78, { dip: 0.06 }],
      [0.4, 0.84, 0.24, 0.72],
      [0.58, 0.84, 0.24, 0.72],
      [0.66, 0.88, 0.24, 0.78, { dip: 0.1 }],
      [0.8, 0.92, 0.24, 0.8, { dip: 0.15 }],
      [0.92, 0.84, 0.26, 0.66, { dip: 0.08 }],
      [1, 0.58, 0.32, 0.5],
    ];
    const cobraBody = loftBody(st, { L, nX: 3, nTop: 2.2, taper: 0.08, arches, color: car.color });
    add(body, cobraBody, P.paint);
    const gold = new THREE.MeshPhysicalMaterial({ color: car.accent, metalness: 0.6, roughness: 0.25, clearcoat: 1 });
    for (const sx of [-1, 1]) {
      stripe(body, cobraBody.userData.top, sx * 0.1, sx * 0.24, gold, 0.02, 0.39);
      stripe(body, cobraBody.userData.top, sx * 0.1, sx * 0.24, gold, 0.6, 0.97);
    }
    add(body, rbox(1.3, 0.08, 0.9, 0.03), MAT.interior('#3a2416'), { y: 0.7, z: Z(L, 0.49) });
    P.people = people(body, { y: 0.48, z: Z(L, 0.46), spread: 0.35, seat: '#6a3a1e', shirt: ['#1a1a1a', '#ffd23a'] });
    windshield(body, { y: 0.72, z: Z(L, 0.6), w: 1.2, h: 0.32, tilt: -0.78, frame: MAT.chrome() });
    // 防滾桿
    for (const sx of [-0.35]) add(body, new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI), MAT.chrome(), { x: sx, y: 0.84, z: Z(L, 0.36) });
    // 引擎蓋進氣孔
    add(body, rbox(0.5, 0.08, 0.34, 0.04), MAT.black(), { y: 0.74, z: Z(L, 0.9) });
    // 側排氣管
    for (const sx of [-1, 1]) {
      add(body, cylZ(0.075, 1.9, 14), MAT.chrome(), { x: sx * 0.93, y: 0.3, z: Z(L, 0.46) });
      add(body, cylZ(0.06, 0.1, 14), MAT.black(), { x: sx * 0.93, y: 0.3, z: Z(L, 0.46) + 0.95 });
    }
    for (const x of [-0.58, 0.58]) roundLamp(body, P.tail, x, 0.55, L / 2 - 0.02, 0.085);
    add(body, rbox(1.6, 0.06, 0.08, 0.03), MAT.chrome(), { y: 0.36, z: L / 2 + 0.02 });
    plate(body, 0.46, L / 2 - 0.0, 'BADBOY');
    for (const sx of [-1, 1]) {
      add(body, cylZ(0.11, 0.1, 18), P.head, { x: sx * 0.6, y: 0.6, z: -L / 2 + 0.3 });
      add(body, new THREE.TorusGeometry(0.11, 0.014, 6, 18), MAT.chrome(), { x: sx * 0.6, y: 0.6, z: -L / 2 + 0.25 });
    }
    add(body, rbox(0.5, 0.18, 0.06, 0.08), MAT.black(), { y: 0.42, z: -L / 2 + 0.02 });
    return { L, W: 1.88, r, wb: [Z(L, 0.18), Z(L, 0.8)], tw: 0.78, ww: 0.3, rimColor: '#c8c8c8', spokes: 8 };
  },

  // EASY HANDLING：圓潤小巧的敞篷跑車
  roadster(car, body, P) {
    const L = 3.95;
    const r = 0.31;
    const arches = [{ z: Z(L, 0.19), r: 0.39, y: r }, { z: Z(L, 0.81), r: 0.39, y: r }];
    const st = [
      [0, 0.72, 0.3, 0.66],
      [0.05, 0.84, 0.26, 0.76],
      [0.2, 0.87, 0.24, 0.8, { dip: 0.03 }],
      [0.36, 0.86, 0.24, 0.74],
      [0.6, 0.86, 0.24, 0.72],
      [0.72, 0.86, 0.24, 0.72, { dip: 0.04 }],
      [0.88, 0.8, 0.25, 0.62, { dip: 0.03 }],
      [1, 0.56, 0.32, 0.46],
    ];
    add(body, loftBody(st, { L, nX: 2.8, nTop: 2.2, taper: 0.12, color: car.color, arches }), P.paint);
    add(body, rbox(1.26, 0.08, 0.9, 0.03), MAT.interior('#d8c8a8'), { y: 0.7, z: Z(L, 0.46) });
    P.people = people(body, { y: 0.47, z: Z(L, 0.43), spread: 0.33, seat: '#d8c8a8', shirt: ['#3a8aff', '#ff8a3a'] });
    windshield(body, { y: 0.72, z: Z(L, 0.6), w: 1.26, h: 0.36, tilt: -0.95 });
    for (const sx of [-1, 1]) {
      add(body, new THREE.SphereGeometry(0.12, 16, 10), P.tail, { x: sx * 0.58, y: 0.56, z: L / 2 - 0.04, sx: 1.5, sy: 0.75, sz: 0.4 });
      // 頭燈（圓潤）
      add(body, new THREE.SphereGeometry(0.12, 16, 10), P.head, { x: sx * 0.55, y: 0.52, z: -L / 2 + 0.2, sx: 1.3, sy: 0.8, sz: 0.5 });
    }
    add(body, rbox(1.66, 0.08, 0.12, 0.04), MAT.chrome(), { y: 0.34, z: L / 2 - 0.02 });
    add(body, rbox(0.6, 0.12, 0.08, 0.06), MAT.black(), { y: 0.36, z: -L / 2 + 0.06 });
    plate(body, 0.46, L / 2 - 0.0, 'EASY');
    return { L, W: 1.74, r, wb: [Z(L, 0.19), Z(L, 0.81)], tw: 0.74, ww: 0.26, spokes: 6 };
  },

  // SMOOTH OPERATOR：修長低矮的銀色 GT
  sleek(car, body, P) {
    const L = 4.62;
    const r = 0.34;
    const arches = [{ z: Z(L, 0.18), r: 0.42, y: r }, { z: Z(L, 0.8), r: 0.42, y: r }];
    const st = [
      [0, 0.84, 0.28, 0.74],
      [0.04, 0.94, 0.23, 0.8],
      [0.2, 0.96, 0.22, 0.83, { dip: 0.03 }],
      [0.36, 0.95, 0.22, 0.74],
      [0.6, 0.95, 0.22, 0.72],
      [0.7, 0.95, 0.22, 0.7, { dip: 0.05 }],
      [0.86, 0.9, 0.22, 0.58, { dip: 0.05 }],
      [0.96, 0.8, 0.25, 0.46],
      [1, 0.6, 0.3, 0.4],
    ];
    add(body, loftBody(st, { L, nX: 4, nTop: 2.6, taper: 0.1, color: car.color, arches }), P.paint);
    add(body, rbox(1.44, 0.08, 1.0, 0.03), MAT.interior(), { y: 0.72, z: Z(L, 0.47) });
    P.people = people(body, { y: 0.48, z: Z(L, 0.44), spread: 0.37, seat: '#8a2020', shirt: ['#303848', '#e0e0e0'] });
    windshield(body, { y: 0.74, z: Z(L, 0.6), w: 1.4, h: 0.36, tilt: -1.1 });
    // 貫穿式尾燈
    add(body, rbox(1.7, 0.07, 0.05, 0.03), P.tail, { y: 0.68, z: L / 2 - 0.1 });
    add(body, rbox(1.6, 0.22, 0.05, 0.05), MAT.flat(car.accent), { y: 0.46, z: L / 2 - 0.06 });
    for (const sx of [-1, 1]) add(body, cylZ(0.055, 0.14, 12), MAT.chrome(), { x: sx * 0.5, y: 0.3, z: L / 2 - 0.02 });
    plate(body, 0.46, L / 2 - 0.02, 'SMOOTH');
    for (const sx of [-1, 1]) headLamp(body, P.head, sx * 0.64, 0.44, -L / 2 + 0.26, 0.36, 0.08);
    return { L, W: 1.92, r, wb: [Z(L, 0.18), Z(L, 0.8)], tw: 0.84, ww: 0.3, spokes: 10 };
  },

  // SPEED BUSTER：寬扁紅色跑車（Testarossa 風），側鰭 + 後格柵
  strakes(car, body, P) {
    const L = 4.5;
    const r = 0.35;
    const arches = [{ z: Z(L, 0.19), r: 0.43, y: r }, { z: Z(L, 0.8), r: 0.43, y: r }];
    const st = [
      [0, 0.92, 0.28, 0.82],
      [0.04, 1.0, 0.23, 0.88],
      [0.2, 1.03, 0.22, 0.9, { dip: 0.02 }],
      [0.34, 1.02, 0.22, 0.88],
      [0.4, 1.0, 0.22, 0.78],
      [0.6, 0.98, 0.22, 0.77],
      [0.68, 0.98, 0.22, 0.76, { dip: 0.03 }],
      [0.84, 0.94, 0.22, 0.64, { dip: 0.04 }],
      [0.95, 0.86, 0.24, 0.5],
      [1, 0.7, 0.3, 0.42],
    ];
    add(body, loftBody(st, { L, nX: 6, nTop: 3.4, taper: 0.1, color: car.color, arches }), P.paint);
    // 側鰭
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) add(body, rbox(0.05, 0.035, 1.25, 0.015, 1), MAT.black(), { x: sx * 1.01, y: 0.44 + i * 0.075, z: Z(L, 0.3) });
    }
    add(body, rbox(1.54, 0.08, 1.0, 0.03), MAT.interior('#d8c090'), { y: 0.76, z: Z(L, 0.5) });
    P.people = people(body, { y: 0.52, z: Z(L, 0.47), spread: 0.4, seat: '#d8c090' });
    windshield(body, { y: 0.78, z: Z(L, 0.62), w: 1.5, h: 0.4, tilt: -1.02 });
    // 後格柵（紅燈在後）
    add(body, rbox(1.84, 0.34, 0.05, 0.03), P.tail, { y: 0.6, z: L / 2 - 0.03 });
    for (let i = 0; i < 6; i++) add(body, rbox(1.86, 0.022, 0.06, 0.01, 1), MAT.black(), { y: 0.45 + i * 0.06, z: L / 2 });
    for (const sx of [-1, 1]) add(body, cylZ(0.06, 0.16, 14), MAT.chrome(), { x: sx * 0.34, y: 0.3, z: L / 2 });
    add(body, rbox(1.9, 0.12, 0.25, 0.04), MAT.black(), { y: 0.28, z: L / 2 - 0.12 });
    plate(body, 0.38, L / 2 + 0.03, 'OUTRUN');
    for (const sx of [-1, 1]) headLamp(body, P.head, sx * 0.66, 0.46, -L / 2 + 0.22, 0.34, 0.06);
    add(body, rbox(1.4, 0.1, 0.08, 0.04), MAT.black(), { y: 0.3, z: -L / 2 + 0.05 });
    add(body, rbox(1.1, 0.12, 0.08, 0.04), MAT.black(), { y: 0.36, z: -L / 2 + 0.03 });
    for (const sx of [-1, 1]) add(body, rbox(0.22, 0.06, 0.05, 0.02), MAT.flat('#ffae2a', { emissive: '#aa5500', emissiveIntensity: 0.4 }), { x: sx * 0.72, y: 0.36, z: -L / 2 + 0.08 });
    return { L, W: 2.06, r, wb: [Z(L, 0.19), Z(L, 0.8)], tw: 0.88, ww: 0.32, spokes: 5 };
  },

  // ROAD MONSTER：粉紅凱迪拉克，巨大尾鰭、牛角、尖刺保險桿
  fins(car, body, P) {
    const L = 5.3;
    const r = 0.36;
    const arches = [{ z: Z(L, 0.2), r: 0.44, y: r }, { z: Z(L, 0.8), r: 0.44, y: r }];
    const st = [
      [0, 0.94, 0.3, 0.8],
      [0.04, 1.0, 0.26, 0.86],
      [0.3, 1.0, 0.24, 0.84],
      [0.38, 0.99, 0.24, 0.78],
      [0.62, 0.99, 0.24, 0.78],
      [0.7, 1.0, 0.24, 0.82, { dip: 0.02 }],
      [0.94, 0.98, 0.25, 0.76],
      [1, 0.9, 0.3, 0.64],
    ];
    add(
      body,
      loftBody(st, { L, nX: 6, nTop: 3.2, taper: 0.06, arches, colorFn: (x, y) => (y < 0.44 ? '#f4f4f4' : car.color) }),
      P.paint
    );
    // 尾鰭
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(1.7, 0);
      sh.quadraticCurveTo(0.5, 0.06, 0.1, 0.34);
      sh.lineTo(0, 0.32);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
      g.rotateY(Math.PI / 2);
      const col = new THREE.Color(car.color);
      const cols = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < cols.length; i += 3) cols.set([col.r, col.g, col.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      add(body, g, P.paint, { x: sx * 0.88 - 0.035, y: 0.78, z: L / 2 - 0.02 });
      add(body, new THREE.CapsuleGeometry(0.05, 0.12, 4, 10).rotateX(Math.PI / 2), P.tail, { x: sx * 0.9, y: 1.1, z: L / 2 - 0.06 });
    }
    // 鍍鉻保險桿 + 尖刺
    add(body, rbox(2.02, 0.16, 0.22, 0.07), MAT.chrome(), { y: 0.36, z: L / 2 + 0.04 });
    add(body, rbox(2.02, 0.16, 0.22, 0.07), MAT.chrome(), { y: 0.36, z: -L / 2 - 0.02 });
    for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
      add(body, new THREE.ConeGeometry(0.06, 0.3, 10).rotateX(Math.PI / 2), MAT.chrome(), { x, y: 0.36, z: L / 2 + 0.28 });
      add(body, new THREE.ConeGeometry(0.06, 0.3, 10).rotateX(-Math.PI / 2), MAT.chrome(), { x, y: 0.36, z: -L / 2 - 0.26 });
    }
    for (const sx of [-1, 1]) add(body, rbox(0.3, 0.12, 0.04, 0.04), P.tail, { x: sx * 0.62, y: 0.58, z: L / 2 + 0.0 });
    // 牛角
    for (const sx of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector3(sx * (0.5 + t * 0.55), 0.82 + Math.sin(t * Math.PI * 0.8) * 0.4, -L / 2 + 0.5 - t * 0.35));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 20, 0.08, 10, false);
      // 由粗到細
      const p = tg.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const seg = Math.floor(i / 11) / 20;
        const cp = curve.getPoint(Math.min(1, seg));
        const k = 1 - seg * 0.9;
        p.setXYZ(i, cp.x + (p.getX(i) - cp.x) * k, cp.y + (p.getY(i) - cp.y) * k, cp.z + (p.getZ(i) - cp.z) * k);
      }
      tg.computeVertexNormals();
      add(body, tg, MAT.flat('#f4ecd8', { roughness: 0.4 }));
    }
    add(body, rbox(1.56, 0.08, 1.4, 0.03), MAT.interior('#fafafa'), { y: 0.8, z: Z(L, 0.5) });
    P.people = people(body, { y: 0.56, z: Z(L, 0.48), spread: 0.4, seat: '#fafafa', shirt: ['#111111', '#ff1a8a'] });
    windshield(body, { y: 0.82, z: Z(L, 0.64), w: 1.62, h: 0.42, tilt: -0.85, frame: MAT.chrome() });
    for (const sx of [-1, 1]) {
      add(body, cylZ(0.12, 0.08, 18), P.head, { x: sx * 0.7, y: 0.6, z: -L / 2 + 0.03 });
      add(body, new THREE.TorusGeometry(0.12, 0.02, 6, 18), MAT.chrome(), { x: sx * 0.7, y: 0.6, z: -L / 2 - 0.0 });
    }
    add(body, rbox(1.0, 0.18, 0.05, 0.03), MAT.chrome(), { y: 0.52, z: -L / 2 + 0.0 });
    plate(body, 0.52, L / 2 + 0.0, 'MONSTR');
    return { L, W: 2.0, r, wb: [Z(L, 0.2), Z(L, 0.8)], tw: 0.86, ww: 0.3, rimColor: '#f0f0f0', spokes: 12 };
  },

  // WILD CHASER：沙灘越野車，管架 + 大輪胎
  buggy(car, body, P) {
    const L = 3.7;
    const r = 0.46;
    const st = [
      [0.12, 0.52, 0.42, 0.66],
      [0.25, 0.62, 0.38, 0.72],
      [0.5, 0.64, 0.36, 0.72],
      [0.7, 0.6, 0.38, 0.72, { dip: 0.02 }],
      [0.86, 0.5, 0.42, 0.66],
      [0.97, 0.36, 0.46, 0.58],
    ];
    add(body, loftBody(st, { L, nX: 3, nTop: 2.2, taper: 0.1, color: car.color }), P.paint);
    const tube = MAT.flat(car.accent, { metalness: 0.6, roughness: 0.3 });
    const bar = (a, b, rr = 0.04) => {
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const len = va.distanceTo(vb);
      const g = new THREE.CylinderGeometry(rr, rr, len, 8);
      const m = add(body, g, tube);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    };
    // 防滾籠
    for (const sx of [-0.55, 0.55]) {
      bar([sx, 0.7, 0.55], [sx * 0.9, 1.6, 0.4]);
      bar([sx * 0.9, 1.6, 0.4], [sx * 0.85, 1.55, -0.5]);
      bar([sx * 0.85, 1.55, -0.5], [sx, 0.72, -0.9]);
      bar([sx, 0.5, 1.4], [sx, 0.7, 0.55]);
    }
    bar([-0.5, 1.6, 0.4], [0.5, 1.6, 0.4]);
    bar([-0.47, 1.55, -0.5], [0.47, 1.55, -0.5]);
    // 後置引擎
    add(body, rbox(0.8, 0.42, 0.6, 0.06), MAT.flat('#5a5a60', { metalness: 0.8, roughness: 0.4 }), { y: 0.72, z: 1.4 });
    for (const sx of [-0.2, 0.2]) add(body, cylZ(0.07, 0.5, 12), MAT.chrome(), { x: sx, y: 0.95, z: 1.65, rx: 0.5 });
    add(body, rbox(0.9, 0.1, 0.4, 0.04), MAT.black(), { y: 0.98, z: 1.35 });
    P.people = people(body, { y: 0.62, z: 0.25, spread: 0.3, seat: '#1a1a1a', shirt: ['#ff3a3a', '#ffe23a'] });
    for (const sx of [-1, 1]) roundLamp(body, P.tail, sx * 0.42, 0.62, 1.72, 0.07);
    // 探照燈架
    bar([-0.55, 1.2, -1.0], [0.55, 1.2, -1.0], 0.03);
    for (const sx of [-0.3, 0.3]) add(body, cylZ(0.1, 0.12, 14), P.head, { x: sx, y: 1.26, z: -1.04 });
    // 擋泥板
    for (const sx of [-1, 1]) {
      add(body, new THREE.CylinderGeometry(0.52, 0.52, 0.46, 16, 1, true, -Math.PI * 0.1, Math.PI * 1.2).rotateZ(Math.PI / 2), MAT.flat(car.color, { side: THREE.DoubleSide }), { x: sx * 0.86, y: r, z: -1.15, rx: Math.PI / 2 });
    }
    return { L, W: 1.84, r, wb: [1.2, -1.15], tw: 0.86, ww: 0.42, rimColor: '#ffd23a', spokes: 6 };
  },

  // QUICK REACTOR：金龜車風敞篷，圓弧車身 + 獨立翼子板
  beetle(car, body, P) {
    const L = 4.0;
    const r = 0.33;
    const st = [
      [0, 0.5, 0.3, 0.6],
      [0.05, 0.64, 0.28, 0.84],
      [0.16, 0.72, 0.28, 0.98],
      [0.3, 0.74, 0.28, 0.98],
      [0.36, 0.74, 0.28, 0.86],
      [0.6, 0.74, 0.28, 0.84],
      [0.7, 0.72, 0.28, 0.82],
      [0.86, 0.66, 0.3, 0.72],
      [1, 0.46, 0.34, 0.54],
    ];
    add(body, loftBody(st, { L, nX: 2.4, nTop: 1.9, taper: 0.18, nBot: 4, color: car.color }), P.paint);
    // 獨立翼子板（金龜車特徵）
    for (const [tz, sx] of [[0.17, -1], [0.17, 1], [0.8, -1], [0.8, 1]]) {
      const fst = [
        [0, 0.2, 0.3, 0.5],
        [0.2, 0.26, 0.28, 0.76],
        [0.5, 0.27, 0.28, 0.82],
        [0.8, 0.26, 0.28, 0.76],
        [1, 0.2, 0.3, 0.5],
      ];
      const g = loftBody(fst, { L: 1.0, nX: 2, nTop: 2, color: car.color, arches: [{ z: 0, r: 0.4, y: r }] });
      add(body, g, P.paint, { x: sx * 0.78, z: Z(L, tz) });
    }
    // 腳踏板
    for (const sx of [-1, 1]) add(body, rbox(0.24, 0.05, 1.6, 0.02), MAT.black(), { x: sx * 0.8, y: 0.3, z: Z(L, 0.5) });
    // 引擎蓋百葉
    for (let i = 0; i < 5; i++) add(body, rbox(0.46, 0.02, 0.04, 0.01, 1), MAT.chrome(), { y: 0.92 - i * 0.05, z: L / 2 - 0.28 + i * 0.035, rx: -0.7 });
    add(body, rbox(1.12, 0.08, 1.0, 0.03), MAT.interior('#e8dcc8'), { y: 0.83, z: Z(L, 0.52) });
    P.people = people(body, { y: 0.58, z: Z(L, 0.46), spread: 0.3, seat: '#e8dcc8', shirt: ['#2fbfaa', '#ff5a8a'] });
    windshield(body, { y: 0.86, z: Z(L, 0.66), w: 1.1, h: 0.36, tilt: -0.55, frame: MAT.chrome() });
    for (const sx of [-1, 1]) {
      add(body, new THREE.SphereGeometry(0.09, 14, 10), P.tail, { x: sx * 0.78, y: 0.6, z: L / 2 - 0.45, sy: 1.3, sz: 0.6 });
      add(body, cylZ(0.12, 0.14, 18), P.head, { x: sx * 0.78, y: 0.68, z: -L / 2 + 0.55 });
      add(body, new THREE.TorusGeometry(0.12, 0.018, 6, 18), MAT.chrome(), { x: sx * 0.78, y: 0.68, z: -L / 2 + 0.47 });
    }
    add(body, rbox(1.7, 0.07, 0.1, 0.03), MAT.chrome(), { y: 0.34, z: L / 2 + 0.02 });
    add(body, rbox(1.7, 0.07, 0.1, 0.03), MAT.chrome(), { y: 0.36, z: -L / 2 - 0.02 });
    plate(body, 0.5, L / 2 + 0.0, 'QUICK');
    return { L, W: 1.84, r, wb: [Z(L, 0.17), Z(L, 0.8)], tw: 0.78, ww: 0.28, rimColor: '#f4f0e6', spokes: 4 };
  },
};

// ---------------- 陰影 ----------------
let shadowTex = null;
function blobShadow(w, l) {
  if (!shadowTex) {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.renderOrder = 1;
  return m;
}

// ---------------- 建立車輛 ----------------
export function buildCar(car) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = {
    paint: paint(),
    paint2: new THREE.MeshPhysicalMaterial({ color: car.color, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    tail: new THREE.MeshPhysicalMaterial({ color: '#ff2a2a', emissive: '#ff0000', emissiveIntensity: 0.6, roughness: 0.15, clearcoat: 1 }),
    head: new THREE.MeshPhysicalMaterial({ color: '#f4f8ff', emissive: '#fff4c8', emissiveIntensity: 0.3, roughness: 0.05, clearcoat: 1 }),
  };
  const spec = STYLES[car.style](car, body, P);
  const wheels = [];
  const front = [];
  for (const [z, isFront] of [[spec.wb[0], false], [spec.wb[1], true]]) {
    for (const sx of [-1, 1]) {
      const w = wheel(body, sx * spec.tw, spec.r, z, spec.r, spec.ww, { rimColor: spec.rimColor, spokes: spec.spokes });
      wheels.push(w);
      if (isFront) front.push(w);
    }
  }
  root.add(blobShadow(spec.W * 1.25, spec.L * 1.1));
  root.userData = { body, wheels, front, tail: P.tail, head: P.head, spec, hair: P.people && P.people.hair };
  return root;
}
