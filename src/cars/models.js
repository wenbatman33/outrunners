// 一般車流車輛模型（8 台可選車在 hero.js）
// 區域座標：前方 -Z、右方 +X、上方 +Y；原點在車身中心地面
import * as THREE from 'three';
import { makeCanvas, shade } from '../util.js';

const matCache = new Map();
function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!o.unique && matCache.has(key)) return matCache.get(key);
  const p = { color: new THREE.Color(color) };
  if (o.emissive) {
    p.emissive = new THREE.Color(o.emissive);
    p.emissiveIntensity = o.ei ?? 1;
  }
  if (o.transparent) {
    p.transparent = true;
    p.opacity = o.opacity;
  }
  if (o.side) p.side = o.side;
  // 與主角車相同的 PBR 材質，才會有一致的反光
  const m = new THREE.MeshStandardMaterial({ ...p, roughness: o.phong ? 0.25 : 0.45, metalness: o.phong ? 0.8 : 0.25 });
  if (!o.unique) matCache.set(key, m);
  return m;
}

function mesh(parent, geo, material, t = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(t.x || 0, t.y || 0, t.z || 0);
  m.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
  if (t.sx || t.sy || t.sz) m.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// 側面輪廓擠出車身：pts 為 [u(後→前), v(高)]
function profileBody(pts, L, W, bevel = 0.06) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: W - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-(W - bevel * 2) / 2, 0, L / 2);
  geo.computeVertexNormals();
  return geo;
}

// 用曲線產生平滑輪廓點
function smoothPts(ctrl, n = 6) {
  const curve = new THREE.SplineCurve(ctrl.map(([u, v]) => new THREE.Vector2(u, v)));
  return curve.getPoints(ctrl.length * n).map((p) => [p.x, p.y]);
}

const tireGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
tireGeo.rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
rimGeo.rotateZ(Math.PI / 2);

function wheel(parent, x, y, z, r, w, rimCol = '#c8ccd2') {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const spin = new THREE.Group();
  pivot.add(spin);
  const t = new THREE.Mesh(tireGeo, M('#16161a'));
  t.scale.set(w, r, r);
  t.castShadow = true;
  spin.add(t);
  const rim = new THREE.Mesh(rimGeo, M(rimCol, { phong: true }));
  rim.scale.set(w * 1.04, r * 0.62, r * 0.62);
  spin.add(rim);
  // 輪框輻條（看得出轉動）
  const sp = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, r * 1.1, r * 0.14), M('#555a60'));
  spin.add(sp);
  parent.add(pivot);
  return { pivot, spin };
}

// ---------------- 一般車流 ----------------
const TRAFFIC_COLORS = ['#d8d8d8', '#2a4a8a', '#8a1a1a', '#1a6a3a', '#e8c040', '#404048', '#f0f0f0', '#6a4a8a'];

export function buildTraffic(type, colorIdx = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const col = TRAFFIC_COLORS[colorIdx % TRAFFIC_COLORS.length];
  const paint = M(col);
  const glass = M('#2a3a4a');
  const tail = M('#ff2020', { emissive: '#ff0000', ei: 0.6 });
  let L = 4.4;
  let W = 1.8;
  let r = 0.33;
  const lights = (y, z, w) => {
    for (const sx of [-1, 1]) mesh(body, new THREE.BoxGeometry(0.28, 0.14, 0.04), tail, { x: sx * w, y, z });
  };
  switch (type) {
    case 'truck': {
      L = 9;
      W = 2.4;
      r = 0.5;
      mesh(body, new THREE.BoxGeometry(2.3, 2.2, 2.2), M(col), { y: 1.6, z: -3.3 });
      mesh(body, new THREE.BoxGeometry(2.1, 0.8, 0.1), glass, { y: 2.0, z: -4.41 });
      mesh(body, new THREE.BoxGeometry(2.4, 2.9, 6.4), M('#e8e8e8'), { y: 2.1, z: 1.2 });
      mesh(body, new THREE.BoxGeometry(2.42, 0.5, 6.42), M(shade(col, -0.2)), { y: 1.3, z: 1.2 });
      mesh(body, new THREE.BoxGeometry(2.3, 0.3, 8.8), M('#222222'), { y: 0.6 });
      lights(0.8, L / 2 - 0.05, 0.95);
      break;
    }
    case 'bus': {
      L = 10;
      W = 2.5;
      r = 0.5;
      mesh(body, new THREE.BoxGeometry(2.5, 2.8, 10), M(colorIdx % 2 ? '#e8b020' : '#2a6ad8'), { y: 1.9 });
      mesh(body, new THREE.BoxGeometry(2.52, 0.8, 9.2), glass, { y: 2.4, z: 0.2 });
      mesh(body, new THREE.BoxGeometry(2.52, 0.2, 10.02), M('#f4f4f4'), { y: 1.4 });
      lights(1.0, L / 2 + 0.01, 1.0);
      break;
    }
    case 'van':
    case 'cable':
    case 'sled': {
      L = 4.8;
      W = 1.9;
      const c2 = type === 'cable' ? '#c02a2a' : col;
      mesh(body, new THREE.BoxGeometry(1.9, 1.7, 4.8), M(c2), { y: 1.25 });
      mesh(body, new THREE.BoxGeometry(1.92, 0.55, 3.8), glass, { y: 1.65, z: 0.2 });
      if (type === 'cable') mesh(body, new THREE.BoxGeometry(2.0, 0.12, 4.9), M('#f0d890'), { y: 2.14 });
      lights(0.75, L / 2 + 0.01, 0.8);
      break;
    }
    case 'pickup':
    case 'jeep': {
      L = 4.6;
      W = 1.9;
      r = 0.4;
      mesh(body, new THREE.BoxGeometry(1.9, 0.8, 4.6), paint, { y: 0.85 });
      mesh(body, new THREE.BoxGeometry(1.8, 0.7, 1.7), type === 'jeep' ? M('#6a6a50') : paint, { y: 1.6, z: type === 'jeep' ? 0 : -0.5 });
      mesh(body, new THREE.BoxGeometry(1.82, 0.4, 1.72), glass, { y: 1.6, z: type === 'jeep' ? 0 : -0.5 });
      lights(0.9, L / 2 + 0.01, 0.78);
      break;
    }
    case 'scooter': {
      L = 1.9;
      W = 0.7;
      r = 0.25;
      mesh(body, new THREE.BoxGeometry(0.5, 0.5, 1.6), paint, { y: 0.5 });
      mesh(body, new THREE.BoxGeometry(0.4, 0.55, 0.3), M('#303030'), { y: 1.1 });
      mesh(body, new THREE.SphereGeometry(0.16, 8, 6), M('#e0e0e0'), { y: 1.5 });
      lights(0.6, L / 2, 0.1);
      break;
    }
    default: {
      // 轎車 / 計程車
      L = 4.4;
      W = 1.8;
      const c = type === 'taxi' ? '#f0c020' : col;
      const pts = smoothPts([[0, 0.3], [0, 0.72], [0.7, 0.78], [1.1, 1.3], [2.6, 1.34], [3.1, 0.82], [4.4, 0.68], [4.4, 0.3], [0.5, 0.22]], 4);
      mesh(body, profileBody(pts, L, W, 0.08), M(c));
      mesh(body, new THREE.BoxGeometry(W * 0.9, 0.36, 1.5), glass, { y: 1.08, z: 0.1 });
      mesh(body, new THREE.BoxGeometry(W * 0.84, 0.34, 0.05), glass, { y: 1.02, z: 1.08, rx: 0.5 });
      if (type === 'taxi') mesh(body, new THREE.BoxGeometry(0.5, 0.2, 0.3), M('#ffffff', { emissive: '#ffffaa', ei: 0.5 }), { y: 1.44 });
      lights(0.6, L / 2 + 0.01, 0.62);
    }
  }
  const wheels = [];
  if (type !== 'scooter') {
    const zs = L > 6 ? [L / 2 - 1.4, -L / 2 + 1.4, L / 2 - 2.6] : [L / 2 - 0.9, -L / 2 + 0.9];
    for (const z of zs) for (const sx of [-1, 1]) wheels.push(wheel(body, sx * (W / 2 - 0.12), r, z, r, 0.26, '#8a8a8a'));
  } else {
    wheels.push(wheel(body, 0, r, 0.6, r, 0.14), wheel(body, 0, r, -0.6, r, 0.14));
  }
  root.add(blobShadow(W * 1.2, L * 1.05));
  root.userData = { body, wheels, front: [], spec: { L, W, r } };
  return root;
}

// ---------------- 陰影貼片 ----------------
let shadowTex = null;
function blobShadow(w, l) {
  if (!shadowTex) {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
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
