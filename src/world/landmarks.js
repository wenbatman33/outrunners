// 各場景 3D 地標（以基本幾何組合，單位：公尺；區域 -Z 為道路前進方向，+X 為遠離道路側）
import * as THREE from 'three';
import { mix, mulberry32 } from '../util.js';
import { onionGeo, facadeTex, getModelParts } from './props.js';

// 地標用材質：far=true 時不受霧影響，改用與霧色混合的顏色（遠景）
function M(color, o = {}) {
  const c = o.haze ? mix(color, o.haze, o.hazeAmt ?? 0.35) : color;
  const p = { color: new THREE.Color(c), flatShading: o.flat !== false };
  if (o.emissive) p.emissive = new THREE.Color(o.emissive);
  if (o.map) p.map = o.map;
  if (o.emissiveMap) p.emissiveMap = o.emissiveMap;
  if (o.side) p.side = o.side;
  if (o.transparent) {
    p.transparent = true;
    p.opacity = o.opacity ?? 1;
    p.depthWrite = false;
  }
  const m = new THREE.MeshLambertMaterial(p);
  if (o.far) m.fog = false;
  return m;
}

function add(g, geo, material, t = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(t.x || 0, t.y || 0, t.z || 0);
  m.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
  if (t.s !== undefined) m.scale.setScalar(t.s);
  if (t.sx !== undefined || t.sy !== undefined || t.sz !== undefined) m.scale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  g.add(m);
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);

// 山（帶隨機起伏的圓錐 + 雪頂）
function mountain(g, r, h, col, snow, o = {}, seed = 1) {
  const rng = mulberry32(seed);
  const geo = new THREE.ConeGeometry(r, h, o.seg || 9, 4);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < h / 2 - 0.1) {
      const k = 1 + (rng() - 0.5) * (o.jag ?? 0.35);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
      p.setY(i, y + (rng() - 0.5) * h * 0.05);
    }
  }
  geo.computeVertexNormals();
  const m = add(g, geo, M(col, o), { x: o.x || 0, y: h / 2 + (o.y || 0), z: o.z || 0 });
  if (snow) {
    const sh = h * (o.snowFrac ?? 0.3);
    const sgeo = new THREE.ConeGeometry(r * (sh / h) * 1.04, sh, o.seg || 9, 1);
    add(g, sgeo, M('#f6f9ff', o), { x: o.x || 0, y: h - sh / 2 + 0.5 + (o.y || 0), z: o.z || 0 });
  }
  return m;
}

function tube(g, pts, r, material) {
  const curve = new THREE.CatmullRomCurve3(pts);
  add(g, new THREE.TubeGeometry(curve, 40, r, 5, false), material);
}

const BUILDERS = {
  goldengate(g) {
    const red = M('#c0362c');
    const span = 420;
    const deckY = 38;
    add(g, box(22, 3, span + 240), red, { y: deckY });
    for (const z of [-span / 2, span / 2]) {
      for (const x of [-9, 9]) add(g, box(4, 120, 5), red, { x, y: 60, z });
      for (const y of [50, 80, 105, 118]) add(g, box(22, 4, 4), red, { y, z });
    }
    // 主纜與吊索
    for (const x of [-9, 9]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const z = -span / 2 - 120 + t * (span + 240);
        let y;
        if (z < -span / 2) y = deckY + ((z + span / 2 + 120) / 120) * (118 - deckY);
        else if (z > span / 2) y = 118 - ((z - span / 2) / 120) * (118 - deckY);
        else {
          const u = (z / (span / 2)) ** 2;
          y = deckY + 6 + u * (118 - deckY - 6);
        }
        pts.push(new THREE.Vector3(x, y, z));
      }
      tube(g, pts, 0.9, red);
      for (let z = -span / 2 + 15; z < span / 2; z += 15) {
        const u = (z / (span / 2)) ** 2;
        const top = deckY + 6 + u * (118 - deckY - 6);
        add(g, box(0.3, top - deckY, 0.3), red, { x, y: (top + deckY) / 2, z });
      }
    }
    // 海面下支撐
    for (const z of [-span / 2, span / 2]) add(g, box(30, 40, 12), M('#8a8a8a'), { y: 18, z });
    g.userData.sea = true;
  },
  mesa(g) {
    const rng = mulberry32(3);
    const cols = ['#b0583a', '#c0683e', '#a04a30', '#d07a48'];
    for (let k = 0; k < 6; k++) {
      const x = (rng() - 0.3) * 400;
      const z = (rng() - 0.5) * 700;
      const r = 40 + rng() * 80;
      const h = 60 + rng() * 90;
      let y = 0;
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const lh = h / layers;
        add(g, cyl(r * (1 - i * 0.04), r * (1.05 - i * 0.04), lh, 7), M(cols[(i + k) % 4], { haze: '#ffd0a0', hazeAmt: 0.25 }), { x, y: y + lh / 2, z, ry: rng() });
        y += lh;
      }
    }
  },
  maya(g) {
    const c = M('#c8b890');
    const c2 = M('#b0a078');
    for (let i = 0; i < 9; i++) {
      const w = 60 - i * 5.5;
      add(g, box(w, 4.5, w), i % 2 ? c : c2, { y: 2.25 + i * 4.5 });
    }
    // 階梯
    for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2]]) {
      const stair = new THREE.Mesh(box(9, 46, 2), M('#d8c8a0'));
      const holder = new THREE.Group();
      stair.position.set(0, 20, 29);
      stair.rotation.x = -0.62;
      holder.add(stair);
      holder.rotation.y = ry;
      g.add(holder);
    }
    add(g, box(14, 8, 14), M('#a89878'), { y: 44.5 });
    add(g, box(15, 1.5, 15), M('#8a7a5a'), { y: 49 });
    add(g, box(4, 5, 1), M('#3a3020'), { y: 43, z: 7.1 });
  },
  niagara(g) {
    const rock = M('#5a5048');
    add(g, box(420, 60, 60), rock, { y: 30, z: 0 });
    add(g, box(460, 4, 140), M('#3e8a44'), { y: 62, z: -20 });
    // 瀑布（動態貼圖）
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext('2d');
    const rng = mulberry32(9);
    ctx.fillStyle = '#cfefff';
    ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(120,190,230,0.6)';
      ctx.fillRect(rng() * 64, rng() * 256, 2, 10 + rng() * 30);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    const falls = add(g, new THREE.PlaneGeometry(380, 62), new THREE.MeshBasicMaterial({ map: tex }), { y: 31, z: 30.5 });
    g.userData.anim = (t) => (tex.offset.y = t * 0.8);
    // 水潭與水霧
    add(g, box(460, 2, 200), M('#4a90c0'), { y: 0, z: 130 });
    for (let i = 0; i < 6; i++) add(g, new THREE.SphereGeometry(30, 8, 6), M('#ffffff', { transparent: true, opacity: 0.35 }), { x: -150 + i * 60, y: 6, z: 45, sy: 0.5 });
    // 彩虹
    const rb = ['#ff3030', '#ff9a20', '#ffe030', '#40d040', '#3080ff', '#6040d0'];
    rb.forEach((col, i) => {
      add(g, new THREE.TorusGeometry(150 - i * 5, 2.4, 4, 40, Math.PI), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }), { y: 0, z: 90 });
    });
    void falls;
  },
  pirate(g) {
    const shape = new THREE.Shape();
    shape.moveTo(-40, 8);
    shape.lineTo(-34, 0);
    shape.lineTo(30, 0);
    shape.lineTo(44, 12);
    shape.lineTo(28, 10);
    shape.lineTo(-30, 10);
    shape.lineTo(-42, 18);
    shape.lineTo(-40, 8);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 16, bevelEnabled: false });
    hull.translate(0, 0, -8);
    const ship = new THREE.Group();
    add(ship, hull, M('#6a3a1a'));
    add(ship, box(64, 1, 15), M('#8a5a2a'), { y: 10 });
    for (const [x, h] of [[-18, 46], [4, 56], [24, 40]]) {
      add(ship, cyl(0.8, 1, h, 6), M('#4a2a10'), { x, y: 10 + h / 2 });
      for (let k = 0; k < 2; k++) {
        const sw = 22 - k * 5;
        add(ship, box(sw, 12, 0.6), M('#f4ecd8', { side: THREE.DoubleSide }), { x, y: 22 + k * 15, rz: 0, ry: Math.PI / 2, sz: 1 }).scale.set(1, 1, 1);
      }
    }
    add(ship, box(8, 5, 0.3), M('#111111', { side: THREE.DoubleSide }), { x: 4, y: 69 });
    ship.rotation.y = 0.5;
    ship.position.y = -2;
    g.add(ship);
    // 小島
    add(g, new THREE.SphereGeometry(40, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#e8d49a'), { x: 120, y: -6, z: -80, sy: 0.3 });
    const palm = getModelParts('palm', false);
    for (let i = 0; i < 4; i++) {
      for (const part of palm) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.position.set(110 + i * 8, 2, -80 + (i % 2) * 10);
        m.scale.setScalar(1.8);
        m.rotation.y = i;
        g.add(m);
      }
    }
    g.userData.sea = true;
  },
  sagrada(g) {
    const c = M('#c8a878');
    const c2 = M('#b89868');
    add(g, box(80, 40, 50), c2, { y: 20 });
    const spires = [[-28, 110], [-12, 130], [12, 130], [28, 110], [0, 172], [-18, 90], [18, 90], [0, 140]];
    spires.forEach(([x, h], i) => {
      const z = i >= 5 ? -20 : 0;
      add(g, cyl(4.5, 6.5, h * 0.8, 10), i % 2 ? c : c2, { x, y: (h * 0.8) / 2, z });
      add(g, cone(5, h * 0.25, 10), M('#e8d0a0'), { x, y: h * 0.8 + h * 0.125, z });
      add(g, new THREE.SphereGeometry(2.4, 8, 6), M('#e0a030', { emissive: '#402000' }), { x, y: h * 1.05 + 1, z });
    });
  },
  matterhorn(g) {
    const haze = '#cfe4ff';
    mountain(g, 420, 620, '#6f7f96', true, { far: true, haze, hazeAmt: 0.35, jag: 0.5, seg: 6, snowFrac: 0.35 }, 4);
    mountain(g, 380, 360, '#71839a', true, { far: true, haze, hazeAmt: 0.45, x: -600, z: 200, snowFrac: 0.3 }, 5);
    mountain(g, 420, 420, '#7890a8', true, { far: true, haze, hazeAmt: 0.45, x: 650, z: 150, snowFrac: 0.3 }, 6);
    g.userData.distMul = 5;
  },
  windmills(g) {
    const parts = getModelParts('windmill', false);
    for (let i = 0; i < 4; i++) {
      for (const part of parts) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.position.set(-60 + i * 55, 0, -i * 30);
        m.scale.setScalar(2.4 - i * 0.2);
        m.rotation.y = 0.3;
        g.add(m);
      }
    }
    const cols = ['#ff2a4a', '#ffd21a', '#ff7ab8', '#ff8a1a', '#b04aff', '#ffffff'];
    for (let i = 0; i < 12; i++) {
      add(g, box(22, 0.6, 180), M(cols[i % cols.length]), { x: -140 + i * 24, y: 0.3, z: 60 });
    }
  },
  eiffel(g) {
    const c = M('#5a4a3e');
    const c2 = M('#6e5a48');
    // 四隻腳
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(cyl(3.2, 5.5, 70, 4), c);
      leg.position.set(sx * 24, 33, sz * 24);
      leg.rotation.z = sx * 0.36;
      leg.rotation.x = -sz * 0.36;
      g.add(leg);
    }
    // 拱
    for (const r of [0, Math.PI / 2]) {
      const arc = add(g, new THREE.TorusGeometry(26, 1.6, 4, 16, Math.PI), c2, { y: 0, ry: r });
      arc.position.y = 18;
    }
    add(g, box(56, 5, 56), c2, { y: 60 });
    add(g, cyl(12, 20, 60, 4), c, { y: 92, ry: Math.PI / 4 });
    add(g, box(30, 4, 30), c2, { y: 120 });
    add(g, cyl(3, 11, 90, 4), c, { y: 167, ry: Math.PI / 4 });
    add(g, box(9, 5, 9), c2, { y: 212 });
    add(g, cyl(0.8, 2.5, 26, 6), c, { y: 227 });
    // 夜燈
    for (const y of [60, 120, 212]) add(g, box(y === 60 ? 57 : y === 120 ? 31 : 10, 1, y === 60 ? 57 : y === 120 ? 31 : 10), M('#ffd070', { emissive: '#ffb030' }), { y: y + 3 });
  },
  castle(g) {
    mountain(g, 130, 60, '#3f7a44', false, { seg: 10, jag: 0.2 }, 2);
    const w = M('#eeeae0');
    const roof = M('#4a5a7a');
    add(g, box(60, 30, 22), w, { y: 75 });
    add(g, cyl(6, 6, 60, 12), w, { x: -26, y: 90 });
    add(g, cone(8, 20, 12), roof, { x: -26, y: 130 });
    add(g, cyl(5, 5, 45, 12), w, { x: 20, y: 82 });
    add(g, cone(6.5, 16, 12), roof, { x: 20, y: 112 });
    add(g, cyl(4, 4, 70, 10), w, { x: 5, y: 95, z: -8 });
    add(g, cone(5.5, 22, 10), roof, { x: 5, y: 141, z: -8 });
    add(g, cone(24, 12, 4), roof, { y: 96, ry: Math.PI / 4, sx: 1.8, sz: 0.7 });
    for (let i = 0; i < 6; i++) add(g, box(3, 5, 0.6), M('#2a3a5a'), { x: -20 + i * 8, y: 78, z: 11.2 });
  },
  kremlin(g) {
    const brick = M('#b0402a');
    add(g, box(70, 26, 50), brick, { y: 13 });
    // 中央尖塔
    add(g, cyl(9, 10, 40, 8), M('#c85a3a'), { y: 46 });
    add(g, cone(10, 36, 8), M('#2a8a5a'), { y: 84 });
    add(g, new THREE.SphereGeometry(2.5, 8, 6), M('#ffd23a', { emissive: '#553300' }), { y: 104 });
    const domes = [
      [-22, -14, '#2a8a5a', 1.0],
      [22, -14, '#2050c0', 1.0],
      [-22, 14, '#e0b020', 0.9],
      [22, 14, '#d03030', 0.9],
      [0, -22, '#30a0a0', 0.8],
      [0, 22, '#e06a20', 0.8],
      [-32, 0, '#8a3ab0', 0.75],
      [32, 0, '#2a8a5a', 0.75],
    ];
    for (const [x, z, col, s] of domes) {
      const h = 34 * s;
      add(g, cyl(6 * s, 6.5 * s, h, 10), M('#e6d8c0'), { x, z, y: 26 + h / 2 });
      add(g, onionGeo(8.5 * s, 16 * s, 12), M(col), { x, z, y: 26 + h });
      add(g, cyl(0.3, 0.3, 6 * s, 4), M('#ffd23a', { emissive: '#553300' }), { x, z, y: 26 + h + 18 * s });
    }
  },
  volcano(g) {
    const haze = '#c8efff';
    const geo = new THREE.CylinderGeometry(70, 520, 360, 12, 4);
    const p = geo.getAttribute('position');
    const rng = mulberry32(11);
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 179) {
        const k = 1 + (rng() - 0.5) * 0.25;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
    }
    geo.computeVertexNormals();
    add(g, geo, M('#4a6f5a', { far: true, haze, hazeAmt: 0.35 }), { y: 180 });
    add(g, cyl(60, 72, 6, 12), M('#ff5020', { emissive: '#ff3000', far: true }), { y: 360 });
    const smoke = [];
    for (let i = 0; i < 6; i++) {
      const s = add(g, new THREE.SphereGeometry(40, 8, 6), M('#e8e8e8', { transparent: true, opacity: 0.55, far: true }), { y: 400 + i * 50, x: i * 20 });
      smoke.push(s);
    }
    g.userData.anim = (t) => smoke.forEach((s, i) => (s.position.y = 380 + ((t * 20 + i * 50) % 300)));
    g.userData.distMul = 3.5;
  },
  moai(g) {
    const parts = getModelParts('moai', false);
    add(g, box(110, 3, 16), M('#6a625a'), { y: 1.5 });
    for (let i = 0; i < 7; i++) {
      for (const part of parts) {
        const m = new THREE.Mesh(part.geometry, part.material);
        m.position.set(-48 + i * 16, 3, 0);
        m.scale.setScalar(2.6 + (i % 3) * 0.3);
        g.add(m);
      }
    }
  },
  fuji(g) {
    const haze = '#f0e6f4';
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const r = 1100 * Math.pow(1 - t, 1.7) + 90 * (1 - t);
      pts.push(new THREE.Vector2(Math.max(60, r), t * 560));
    }
    add(g, new THREE.LatheGeometry(pts, 24), M('#5a6fa8', { far: true, haze, hazeAmt: 0.25 }));
    // 雪頂（鋸齒邊）
    const snow = [];
    for (let i = 0; i <= 8; i++) {
      const t = 0.58 + (i / 8) * 0.42;
      const r = 1100 * Math.pow(1 - t, 1.7) + 90 * (1 - t);
      snow.push(new THREE.Vector2(Math.max(61, r + 4), t * 560 + 1));
    }
    add(g, new THREE.LatheGeometry(snow, 24), M('#f8f8ff', { far: true, haze, hazeAmt: 0.1 }));
    g.userData.distMul = 6;
  },
  opera(g) {
    const w = M('#f6f4ee');
    add(g, box(120, 10, 70), M('#c8a888'), { y: 5 });
    const shells = [[-35, 44, 0], [-5, 54, 0], [25, 40, 0], [-25, 30, 28], [8, 34, 28]];
    for (const [x, h, z] of shells) {
      const geo = new THREE.SphereGeometry(h, 12, 8, 0, Math.PI, 0, Math.PI / 2);
      add(g, geo, w, { x, y: 10, z, ry: -Math.PI / 2, sx: 0.5, sy: 1, sz: 1 });
    }
    // 海港大橋
    const steel = M('#707880');
    add(g, new THREE.TorusGeometry(140, 4, 6, 30, Math.PI), steel, { x: 260, y: -30, z: -160, ry: 0.4 });
    add(g, box(300, 3, 14), steel, { x: 260, y: 55, z: -160, ry: 0.4 });
    g.userData.sea = true;
  },
  skyline(g) {
    const rng = mulberry32(21);
    const tex = facadeTex('tower', true);
    for (let i = 0; i < 34; i++) {
      const h = 50 + rng() * 170;
      const w = 18 + rng() * 22;
      const t2 = tex.clone();
      t2.needsUpdate = true;
      t2.repeat.set(w / 14, h / 40);
      const m = new THREE.MeshLambertMaterial({ map: t2, emissive: new THREE.Color('#ffffff'), emissiveMap: t2, emissiveIntensity: 0.9 });
      const x = (rng() - 0.5) * 700;
      const z = (rng() - 0.5) * 260;
      add(g, box(w, h, w), m, { x, y: h / 2, z });
      if (rng() < 0.4) add(g, cyl(0.6, 0.6, 30, 4), M('#bbbbbb'), { x, y: h + 15, z });
      if (rng() < 0.5) add(g, box(w * 0.9, 5, 1), new THREE.MeshBasicMaterial({ color: ['#ff3ab0', '#3af0ff', '#ffe23a', '#7aff5a'][i % 4] }), { x, y: h - 8, z: z + w / 2 + 0.6 });
    }
  },
  karst(g) {
    const rng = mulberry32(8);
    const haze = '#dff0ea';
    for (let i = 0; i < 12; i++) {
      const h = 80 + rng() * 150;
      const r = 26 + rng() * 30;
      const x = (rng() - 0.5) * 900;
      const z = (rng() - 0.5) * 500;
      const amt = 0.2 + (z + 250) / 500 * 0.45;
      add(g, cyl(r * 0.55, r, h, 9), M('#4f8a5a', { haze, hazeAmt: amt }), { x, y: h / 2, z });
      add(g, new THREE.SphereGeometry(r * 0.55, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#4f8a5a', { haze, hazeAmt: amt }), { x, y: h, z });
    }
    const parts = getModelParts('pagoda', false);
    for (const part of parts) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.position.set(-40, 0, 60);
      m.scale.setScalar(2.2);
      g.add(m);
    }
  },
  kilimanjaro(g) {
    const haze = '#ffdca0';
    add(g, cyl(260, 1300, 480, 14), M('#6a5a7a', { far: true, haze, hazeAmt: 0.35 }), { y: 240 });
    add(g, cyl(250, 330, 50, 14), M('#f4f4ff', { far: true, haze, hazeAmt: 0.15 }), { y: 470 });
    g.userData.distMul = 6;
  },
  pyramids(g) {
    const sets = [[0, 0, 140], [190, -120, 130], [330, -220, 70]];
    for (const [x, z, h] of sets) {
      add(g, cone(h * 1.1, h, 4), M('#e0b868', { haze: '#fbe7bc', hazeAmt: 0.15 }), { x, y: h / 2, z, ry: Math.PI / 4 });
    }
    // 人面獅身
    const s = M('#d8a860');
    const sph = new THREE.Group();
    add(sph, box(12, 10, 40), s, { y: 5 });
    add(sph, box(10, 12, 10), s, { y: 14, z: 18 });
    add(sph, box(14, 8, 4), M('#c89850'), { y: 17, z: 15 });
    add(sph, box(4, 3, 14), s, { x: -4, y: 1.5, z: 26 });
    add(sph, box(4, 3, 14), s, { x: 4, y: 1.5, z: 26 });
    sph.position.set(-140, 0, 90);
    sph.rotation.y = 0.8;
    g.add(sph);
  },
  santorini(g) {
    add(g, box(360, 70, 120), M('#8a6a5a'), { y: 35 });
    const rng = mulberry32(31);
    const white = M('#f8f8f4');
    const blue = M('#1e5ad8');
    for (let i = 0; i < 44; i++) {
      const w = 8 + rng() * 10;
      const x = (rng() - 0.5) * 330;
      const z = (rng() - 0.5) * 100;
      const h = 6 + rng() * 8;
      add(g, box(w, h, w), white, { x, y: 70 + h / 2, z });
      if (rng() < 0.3) add(g, new THREE.SphereGeometry(w * 0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), blue, { x, y: 70 + h, z });
    }
    g.userData.sea = true;
  },
  aurora(g) {
    const haze = '#27405a';
    for (let i = 0; i < 5; i++) {
      mountain(g, 300 + i * 40, 120 + i * 30, '#dfe8f4', false, { far: true, haze, hazeAmt: 0.4, x: -600 + i * 300, z: (i % 2) * 200, seg: 10 }, 40 + i);
    }
    // 聖誕老人小屋
    add(g, box(30, 16, 22), M('#b02a2a'), { x: -50, y: 8, z: -40 });
    add(g, cone(24, 14, 4), M('#f4f8ff'), { x: -50, y: 23, z: -40, ry: Math.PI / 4 });
    add(g, box(6, 6, 0.5), M('#ffd070', { emissive: '#ffb030' }), { x: -44, y: 8, z: -28.6 });
    g.userData.distMul = 2.2;
  },
};

// 建立地標，回傳 Group（呼叫端負責定位）
export function buildLandmark(key) {
  const fn = BUILDERS[key];
  const g = new THREE.Group();
  g.name = 'landmark-' + key;
  if (fn) fn(g);
  return g;
}
