// 環境：天空、霧、光源、遠景山脈、雲、遠方地面/海面、天氣、極光；切換場景時平滑過渡
import * as THREE from 'three';
import { TUNING } from '../config.js';
import { makeCanvas, mulberry32, mix, shade, hashStr } from '../util.js';

const SKY_VS = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // 永遠在最遠處
}`;
const SKY_FS = `
uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; uniform float night; uniform float time; uniform float moon;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0),0.8)) : mix(mid, bot, clamp(-h*6.0,0.0,1.0));
  c = mix(bot, c, smoothstep(-0.02, 0.12, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  float disk = smoothstep(1.0 - sunSize, 1.0 - sunSize*0.6, sd);
  c += sunColor * (pow(sd, 18.0) * (0.45 - moon*0.3) + pow(sd, 3.0) * 0.12 * (1.0-night));
  c = mix(c, sunColor, disk);
  if (night > 0.5 && h > 0.02) {
    vec3 q = floor(d * 420.0);
    float s = hash(q);
    float tw = 0.6 + 0.4*sin(time*3.0 + s*50.0);
    c += vec3(step(0.9975, s) * tw) * smoothstep(0.02, 0.25, h);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// 遠景山脈貼圖
function ridgeTexture(stage, layer) {
  const W = 2048;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const rng = mulberry32(hashStr(stage.name) + layer * 99);
  const col = layer === 0 ? mix(stage.far, stage.sky[2], 0.35) : stage.far;
  const base = layer === 0 ? H * 0.2 : H * 0.55;
  const amp = layer === 0 ? H * 0.6 : H * 0.35;
  // 疊加多層正弦產生稜線（首尾相接可無縫環繞）
  const waves = [];
  for (let k = 0; k < 6; k++) waves.push({ f: [1, 2, 3, 5, 8, 13][k], a: rng() / (k + 1), p: rng() * Math.PI * 2 });
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 4) {
    let y = 0;
    for (const w of waves) y += Math.sin((x / W) * Math.PI * 2 * w.f + w.p) * w.a;
    y = base + (0.5 - y * 0.5) * amp * (stage.hilly > 0.6 ? 1.2 : 0.8);
    ctx.lineTo(x, Math.max(4, y));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(col, 0.08));
  g.addColorStop(1, shade(col, -0.12));
  ctx.fillStyle = g;
  ctx.fill();
  if (stage.night && layer === 1) {
    // 夜景：山腳燈火
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#ffd88a' : '#fff4c8';
      ctx.fillRect(rng() * W, H * (0.75 + rng() * 0.25), 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function cloudTexture() {
  const c = makeCanvas(256, 128);
  const ctx = c.getContext('2d');
  const rng = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const x = 40 + rng() * 176;
    const y = 50 + rng() * 40 - Math.abs(x - 128) * 0.15;
    const r = 18 + rng() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flakeTexture(kind) {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d');
  if (kind === 'petals') {
    ctx.fillStyle = '#ffb8d0';
    ctx.beginPath();
    ctx.ellipse(16, 16, 12, 7, 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const AURORA_FS = `
uniform float time; varying vec2 vUv;
void main(){
  float w = sin(vUv.x*18.0 + time*0.6)*0.5+0.5;
  float w2 = sin(vUv.x*41.0 - time*0.9)*0.5+0.5;
  float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
  float a = band * (0.35 + 0.65*w*w2) * 0.75;
  vec3 c = mix(vec3(0.2,1.0,0.55), vec3(0.6,0.3,1.0), vUv.y);
  gl_FragColor = vec4(c*a, a);
}`;

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.cur = null; // 目前顏色狀態
    this.target = null;
    this.blend = 1;
    this.follow = new THREE.Group();
    scene.add(this.follow);

    // 霧
    scene.fog = new THREE.Fog('#bfe3ff', TUNING.fogNear, TUNING.fogFar);

    // 天空
    this.skyU = {
      top: { value: new THREE.Color() },
      mid: { value: new THREE.Color() },
      bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.3, 0.3, -1) },
      sunColor: { value: new THREE.Color('#fff6c8') },
      sunSize: { value: 0.0009 },
      night: { value: 0 },
      moon: { value: 0 },
      time: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.follow.add(sky);

    // 遠景山脈（兩層 × 新舊兩組做淡入淡出）
    this.ridges = [];
    for (let set = 0; set < 2; set++) {
      const arr = [];
      for (let layer = 0; layer < 2; layer++) {
        const r = layer === 0 ? 3000 : 2600;
        const h = layer === 0 ? 700 : 380;
        const geo = new THREE.CylinderGeometry(r, r, h, 64, 1, true);
        const m = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, fog: false, opacity: 1 });
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.y = h / 2 - (layer === 0 ? 40 : 30);
        mesh.renderOrder = -9 + layer;
        mesh.frustumCulled = false;
        this.follow.add(mesh);
        arr.push(mesh);
      }
      this.ridges.push(arr);
    }
    this.ridgeSet = 0;

    // 雲
    this.cloudTex = cloudTexture();
    this.clouds = [];
    const rng = mulberry32(5);
    for (let i = 0; i < 22; i++) {
      const m = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, fog: false, depthWrite: false, opacity: 0.9 });
      const s = new THREE.Sprite(m);
      const a = rng() * Math.PI * 2;
      const d = 1200 + rng() * 1200;
      s.position.set(Math.cos(a) * d, 180 + rng() * 380, Math.sin(a) * d);
      const sc = 380 + rng() * 520;
      s.scale.set(sc, sc * 0.5, 1);
      s.renderOrder = -8;
      s.userData.a = a;
      s.userData.d = d;
      this.follow.add(s);
      this.clouds.push(s);
    }

    // 遠方地面 / 海面
    this.farGround = new THREE.Mesh(
      new THREE.CircleGeometry(4000, 48),
      new THREE.MeshLambertMaterial({ color: '#4a9a40' })
    );
    this.farGround.rotation.x = -Math.PI / 2;
    this.farGround.renderOrder = -7;
    scene.add(this.farGround);

    // 光源
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#4a7a3a', 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', TUNING.sunIntensity);
    this.sun.castShadow = false;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 300;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // 天氣粒子
    this.weather = null;

    // 極光
    this.auroraU = { time: { value: 0 } };
    this.aurora = new THREE.Group();
    const am = new THREE.ShaderMaterial({
      uniforms: this.auroraU,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: AURORA_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.PlaneGeometry(3400, 700, 40, 1);
      const p = geo.getAttribute('position');
      for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(p.getX(k) * 0.004 + i) * 260);
      const m = new THREE.Mesh(geo, am);
      m.position.set(0, 700 + i * 60, -1800 + i * 500);
      m.rotation.y = i * 0.7;
      m.renderOrder = -8;
      m.frustumCulled = false;
      this.aurora.add(m);
    }
    this.aurora.visible = false;
    this.follow.add(this.aurora);
  }

  setShadows(on) {
    this.sun.castShadow = on;
  }

  // 由場景資料算出環境參數
  static paramsOf(stage) {
    const sun = stage.sun || { x: 0.5, y: 0.2, color: '#ffffff' };
    const night = !!stage.night;
    return {
      top: new THREE.Color(stage.sky[0]),
      mid: new THREE.Color(stage.sky[1]),
      bot: new THREE.Color(stage.sky[2]),
      fog: new THREE.Color(stage.fog),
      hemiSky: new THREE.Color(night ? '#4a5aa0' : mix(stage.sky[1], '#ffffff', 0.4)),
      hemiGround: new THREE.Color(night ? '#1a1a30' : shade(stage.ground[1], -0.2)),
      hemiI: night ? 0.75 : 1.25,
      sunI: night ? 0.35 : TUNING.sunIntensity,
      sunColor: new THREE.Color(night ? '#a8b8ff' : sun.color || '#fff4e0'),
      sunAz: (sun.x - 0.5) * Math.PI * 1.2,
      sunEl: Math.max(0.05, (0.45 - sun.y) * 1.3),
      sunSize: stage.sun ? (stage.sun.r / 26) * 0.0011 : 0.0,
      night: night ? 1 : 0,
      moon: stage.sun && stage.sun.moon ? 1 : 0,
      farGround: new THREE.Color(stage.sea ? stage.seaColor : shade(stage.ground[1], -0.08)),
      fogNear: night ? TUNING.fogNear * 0.8 : TUNING.fogNear,
      fogFar: night ? TUNING.fogFar * 0.85 : TUNING.fogFar,
      clouds: stage.clouds ?? 0.5,
    };
  }

  setStage(stage, instant = false) {
    const p = Environment.paramsOf(stage);
    this.stage = stage;
    if (!this.cur || instant) {
      this.cur = {};
      for (const k in p) this.cur[k] = p[k] && p[k].isColor ? p[k].clone() : p[k];
      this.from = null;
      this.blend = 1;
    } else {
      this.from = {};
      for (const k in this.cur) this.from[k] = this.cur[k] && this.cur[k].isColor ? this.cur[k].clone() : this.cur[k];
      this.blend = 0;
    }
    this.target = p;
    // 遠景山脈切換
    this.ridgeSet = 1 - this.ridgeSet;
    const set = this.ridges[this.ridgeSet];
    for (let layer = 0; layer < 2; layer++) {
      const m = set[layer].material;
      if (m.map) m.map.dispose();
      m.map = ridgeTexture(stage, layer);
      m.map.repeat.set(layer === 0 ? 2 : 3, 1);
      m.needsUpdate = true;
      m.opacity = instant ? 1 : 0;
    }
    if (instant) for (const mm of this.ridges[1 - this.ridgeSet]) mm.material.opacity = 0;
    // 天氣
    this.setWeather(stage.weather || null);
    this.aurora.visible = stage.landmark === 'aurora';
  }

  setWeather(kind) {
    if (this.weatherKind === kind) return;
    this.weatherKind = kind;
    if (this.weather) {
      this.follow.remove(this.weather);
      this.weather.geometry.dispose();
      this.weather = null;
    }
    if (!kind) return;
    const N = kind === 'snow' ? 1400 : 700;
    const pos = new Float32Array(N * 3);
    const rng = mulberry32(2);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 120;
      pos[i * 3 + 1] = rng() * 40;
      pos[i * 3 + 2] = (rng() - 0.5) * 120;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: kind === 'snow' ? 0.35 : 0.45, map: flakeTexture(kind), transparent: true, depthWrite: false, fog: true });
    this.weather = new THREE.Points(g, m);
    this.weather.frustumCulled = false;
    this.follow.add(this.weather);
  }

  update(dt, camPos, playerPos, speed, heading) {
    this.time += dt;
    this.follow.position.set(camPos.x, camPos.y, camPos.z);
    // 過渡
    if (this.blend < 1 && this.from) {
      this.blend = Math.min(1, this.blend + dt / TUNING.envBlend);
      const t = this.blend;
      for (const k in this.target) {
        const a = this.from[k];
        const b = this.target[k];
        if (b && b.isColor) this.cur[k].copy(a).lerp(b, t);
        else if (typeof b === 'number') this.cur[k] = a + (b - a) * t;
      }
      const set = this.ridges[this.ridgeSet];
      const old = this.ridges[1 - this.ridgeSet];
      for (let l = 0; l < 2; l++) {
        set[l].material.opacity = t;
        old[l].material.opacity = 1 - t;
      }
    }
    const c = this.cur;
    this.skyU.top.value.copy(c.top);
    this.skyU.mid.value.copy(c.mid);
    this.skyU.bot.value.copy(c.fog);
    this.skyU.night.value = c.night;
    this.skyU.moon.value = c.moon;
    this.skyU.sunColor.value.copy(c.sunColor);
    this.skyU.sunSize.value = c.sunSize;
    this.skyU.time.value = this.time;
    const sd = new THREE.Vector3(Math.sin(c.sunAz) * Math.cos(c.sunEl), Math.sin(c.sunEl), -Math.cos(c.sunAz) * Math.cos(c.sunEl));
    this.skyU.sunDir.value.copy(sd);
    this.scene.fog.color.copy(c.fog);
    this.scene.fog.near = TUNING.fogNear * (1 - c.night * 0.2);
    this.scene.fog.far = TUNING.fogFar * (1 - c.night * 0.15);
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = TUNING.sunIntensity + (0.35 - TUNING.sunIntensity) * c.night;
    // 太陽光跟著玩家（陰影範圍）
    this.sun.position.set(playerPos.x + sd.x * 150, playerPos.y + Math.max(0.35, sd.y) * 150, playerPos.z + sd.z * 150);
    this.sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.farGround.material.color.copy(c.farGround);
    // 遠方地面：由比賽端提供可見範圍最低點，平滑跟隨
    const fy = this.farY !== undefined ? this.farY : playerPos.y - 2.2;
    this.farGround.position.set(camPos.x, fy, camPos.z);
    // 雲
    for (const s of this.clouds) {
      s.userData.a += dt * 0.004;
      s.position.x = Math.cos(s.userData.a) * s.userData.d;
      s.position.z = Math.sin(s.userData.a) * s.userData.d;
      s.material.opacity = 0.9 * c.clouds * (1 - c.night * 0.7);
      s.visible = c.clouds > 0.05;
    }
    // 天氣
    if (this.weather) {
      const p = this.weather.geometry.getAttribute('position');
      const fall = this.weatherKind === 'snow' ? 3.5 : 1.8;
      const fx = Math.sin(heading) * speed * dt;
      const fz = -Math.cos(heading) * speed * dt;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i) - fx + Math.sin(this.time + i) * dt * 1.2;
        let y = p.getY(i) - fall * dt;
        let z = p.getZ(i) - fz;
        if (y < -3) y += 40;
        if (x < -60) x += 120;
        if (x > 60) x -= 120;
        if (z < -60) z += 120;
        if (z > 60) z -= 120;
        p.setXYZ(i, x, y, z);
      }
      p.needsUpdate = true;
    }
    this.auroraU.time.value = this.time;
  }
}
