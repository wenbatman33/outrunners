// 比賽主邏輯：物理、分岔、檢查點、碰撞、翻車、AI 對手、車流、鏡頭
import * as THREE from 'three';
import { TUNING } from '../config.js';
import { CARS } from '../data/cars.js';
import { STAGES, START_STAGE, stageIdOf, TOTAL_STAGES } from '../data/stages.js';
import { Path, FORK_SEGS, forkOffset, LANES } from '../world/path.js';
import { buildLandmark } from '../world/landmarks.js';
import { PROP_INFO } from '../world/propInfo.js';
import { buildTraffic } from '../cars/models.js';
import { buildCar } from '../cars/hero.js';
import { clamp, lerp, mulberry32, makeCanvas } from '../util.js';
import { audio } from '../audio.js';

const _p = {};
const _p2 = {};
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();

// 煙霧粒子貼圖
let smokeTex = null;
function getSmokeTex() {
  if (smokeTex) return smokeTex;
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

export class Race {
  /**
   * @param {object} world {scene, env, chunks, camera}
   * @param {object} opt {carIdx, trans:'AT'|'MT', demo, startRoute}
   */
  constructor(world, opt = {}) {
    this.world = world;
    this.scene = world.scene;
    this.env = world.env;
    this.chunks = world.chunks;
    this.camera = world.camera;
    this.demo = !!opt.demo;
    this.car = CARS[opt.carIdx ?? 4];
    this.carIdx = opt.carIdx ?? 4;
    this.trans = opt.trans || 'AT';
    this.hooks = opt.hooks || {};
    this.rng = mulberry32(opt.seed ?? (Date.now() & 0xffff));

    const startRoute = opt.startRoute || { bound: null, col: -1, row: 0 };
    const sid = stageIdOf(startRoute);
    this.path = new Path({
      stageId: sid,
      route: startRoute,
      start: { x: 0, y: 0, z: 0, h: 0 },
      startD: 0,
      side: 0,
      kind: startRoute.col >= 3 ? 'last' : 'first',
      seed: opt.seed,
    });
    this.path.kind = startRoute.col >= 3 ? 'last' : this.path.kind;
    this.routeHistory = [startRoute];
    this.stageNum = startRoute.bound ? startRoute.col + 2 : 1;
    this.env.setStage(this.path.stage, true);

    // 玩家狀態
    const startSeg = this.path.gates.find((g) => g.kind === 'start')?.seg ?? 26;
    this.s = startSeg * TUNING.segLen - 14;
    this.x = 3;
    this.v = 0;
    this.lv = 0; // 側向速度
    this.yaw = 0;
    this.gear = 0; // MT: 0=LOW 1=HIGH；AT: 自動 1~4
    this.atGear = 1;
    this.rpm = 0;
    this.skid = 0;
    this.offroad = 0;
    this.time = TUNING.startTime;
    this.stageTime = 0;
    this.totalTime = 0;
    this.lapTimes = [];
    this.score = 0;
    this.state = this.demo ? 'run' : 'countdown';
    this.countdown = 3.99;
    this.crash = null;
    this.bumpCool = 0;
    this.messages = [];
    this.timeWarnT = 0;
    this.goalT = 0;
    this.finished = false;
    this.camMode = 0;
    this.shake = 0;
    this.lastStageT = 0;

    // 玩家車輛
    this.mesh = buildCar(this.car);
    this.mesh.rotation.order = 'YXZ';
    this.scene.add(this.mesh);
    if (world.shadows) this.mesh.traverse((o) => o.isMesh && (o.castShadow = true));
    this.headLight = new THREE.SpotLight('#fff4d0', 0, 90, 0.45, 0.6, 1.2);
    this.headLight.position.set(0, 1, -1.5);
    this.headLight.target.position.set(0, 0, -30);
    this.mesh.add(this.headLight);
    this.mesh.add(this.headLight.target);

    // 對手
    this.rivals = [];
    const others = CARS.map((c, i) => i).filter((i) => i !== this.carIdx);
    const base = this.s;
    others.forEach((ci, k) => {
      const row = Math.floor((k + 1) / 2);
      const side = (k + 1) % 2 === 0 ? -3 : 3;
      const c = CARS[ci];
      const mesh = buildCar(c);
      mesh.rotation.order = 'YXZ';
      this.scene.add(mesh);
      this.rivals.push({
        car: c,
        idx: ci,
        mesh,
        D: this.path.startD + base + (k === 0 ? 0 : row * 15),
        x: k === 0 ? -3 : side,
        tx: k === 0 ? -3 : side,
        v: 0,
        skill: (0.9 + this.rng() * 0.07) * (c.top / 290),
        pref: this.rng() < 0.5 ? -1 : 1,
        launch: 0.05 + this.rng() * 0.3,
        wob: this.rng() * 10,
        lane: 0,
        visible: false,
        bump: 0,
      });
    });

    // 車流網格
    this.trafficMeshes = new Map();

    // 地標
    this.landmarks = new Map();
    this.addLandmark(this.path);

    // 煙霧
    this.smoke = [];
    const smat = new THREE.SpriteMaterial({ map: getSmokeTex(), transparent: true, depthWrite: false, opacity: 0.6 });
    for (let i = 0; i < 70; i++) {
      const sp = new THREE.Sprite(smat.clone());
      sp.visible = false;
      this.scene.add(sp);
      this.smoke.push({ sp, life: 0 });
    }
    this.smokeIdx = 0;

    // 鏡頭初始
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camInit = false;
    this.syncChunks();
    this.updateVisuals(0);
    if (!this.demo) this.message('GET READY', '#ffe23a', 2.4);
  }

  get stage() {
    return this.path.stage;
  }
  // HUD 用：分岔尚未確定時仍顯示原本的場景
  get hudStage() {
    const sib = this.sibling();
    if (sib && !sib.abandoned && this.path.parent) return this.path.parent.stage;
    return this.path.stage;
  }
  get D() {
    return this.path.startD + this.s;
  }
  get speedKmh() {
    return this.v * 3.6;
  }
  get vmax() {
    const base = this.car.top / 3.6;
    return this.trans === 'MT' ? base * 1.02 : base * 0.97;
  }

  message(text, color = '#ffe23a', dur = TUNING.messageTime, size = 1) {
    this.messages.push({ text, color, t: dur, dur, size });
    if (this.messages.length > 3) this.messages.shift();
  }

  // ---------------- 地標 ----------------
  addLandmark(path) {
    if (!path.landmark || this.landmarks.has(path.id)) return;
    const lm = path.landmark;
    const g = buildLandmark(lm.key);
    let dist = lm.dist * (g.userData.distMul || 1);
    const paths = this.landmarkPaths(path);
    for (let tries = 0; tries < 5; tries++) {
      path.pointAt(lm.seg * TUNING.segLen, lm.side * dist, _p);
      g.position.set(_p.x, _p.y + (g.userData.sea ? -3 : -0.5), _p.z);
      g.rotation.y = -_p.h + (lm.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (this.landmarkOverlaps(g, paths, false) === 0) break;
      dist *= 1.35;
    }
    this.landmarkOverlaps(g, paths, true);
    g.userData.path = path;
    this.scene.add(g);
    this.landmarks.set(path.id, g);
  }

  // 與地標相關、需要避開的道路
  landmarkPaths(path) {
    const list = [path];
    if (path.parent) list.push(path.parent);
    if (path.children) list.push(path.children.L, path.children.R);
    if (path.parent && path.parent.children) for (const c of [path.parent.children.L, path.parent.children.R]) if (c !== path) list.push(c);
    return list;
  }

  // 計算地標中壓到路面的零件數；hide=true 時將其隱藏
  landmarkOverlaps(g, paths, hide) {
    g.updateMatrixWorld(true);
    const margin = TUNING.roadHalfWidth + 4;
    let count = 0;
    g.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      _box.setFromObject(o);
      let hitRoad = false;
      for (const q of paths) {
        for (let j = 0; j < q.n && !hitRoad; j += 3) {
          if (q.x[j] > _box.min.x - margin && q.x[j] < _box.max.x + margin && q.z[j] > _box.min.z - margin && q.z[j] < _box.max.z + margin && _box.min.y < q.y[j] + 12) hitRoad = true;
        }
        if (hitRoad) break;
      }
      if (hitRoad) {
        count++;
        if (hide) o.visible = false;
      }
    });
    return count;
  }

  removeLandmark(path) {
    const g = this.landmarks.get(path.id);
    if (!g) return;
    this.scene.remove(g);
    g.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    this.landmarks.delete(path.id);
  }

  // ---------------- 路徑對應 ----------------
  // 將比賽距離 D 對應到可見路徑
  mapD(D, pref) {
    const p = this.path;
    if (D >= p.startD && D < p.startD + p.length) return { path: p, s: D - p.startD };
    if (D >= p.startD + p.length && p.children) {
      let c = pref < 0 ? p.children.L : p.children.R;
      if (c.abandoned) c = c === p.children.L ? p.children.R : p.children.L;
      if (D < c.startD + c.length) return { path: c, s: D - c.startD };
      return null;
    }
    if (D < p.startD && p.parent) {
      const q = p.parent;
      const s = D - q.startD;
      if (s >= 0) return { path: q, s };
    }
    return null;
  }

  sibling() {
    const p = this.path;
    if (!p.parent || !p.parent.children) return null;
    const c = p.parent.children;
    return c.L === p ? c.R : c.L;
  }

  // ---------------- 區塊同步 ----------------
  syncChunks() {
    const segLen = TUNING.segLen;
    const ahead = TUNING.viewAhead;
    const wanted = [];
    const p = this.path;
    const si = Math.floor(this.s / segLen);
    wanted.push({ path: p, fromSeg: si - 12, toSeg: Math.floor((this.s + ahead) / segLen) });
    if (this.s < 80 && p.parent) {
      wanted.push({ path: p.parent, fromSeg: p.parent.n - 20, toSeg: p.parent.n });
    }
    const sib = this.sibling();
    if (sib && this.s < (FORK_SEGS + 40) * segLen) {
      wanted.push({ path: sib, fromSeg: si - 12, toSeg: Math.min(FORK_SEGS + 60, Math.floor((this.s + ahead) / segLen)) });
    }
    const over = this.s + ahead - p.length;
    if (over > 0 && p.children) {
      for (const c of [p.children.L, p.children.R]) {
        wanted.push({ path: c, fromSeg: 0, toSeg: Math.floor(over / segLen) });
      }
    }
    this.chunks.sync(wanted);
  }

  // ---------------- 主更新 ----------------
  update(dt, inp) {
    dt = Math.min(dt, 1 / 20);
    const ctl = this.demo || this.state === 'goal' ? this.autopilot() : inp;
    this.totalT = (this.totalT || 0) + dt;

    // 訊息
    for (const m of this.messages) m.t -= dt;
    this.messages = this.messages.filter((m) => m.t > 0);

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n >= 1 && n <= 3) {
          audio.sfx('beep');
        }
        const lights = this.chunks.startLights();
        if (lights) lights.forEach((l, i) => l.material.color.set(n <= 0 ? '#20ff40' : i < 3 - n + 1 ? '#ff2020' : '#330000'));
      }
      this.rpm = lerp(this.rpm, ctl.gas ? 0.85 : 0.1, dt * 5);
      if (this.countdown <= 0) {
        this.state = 'run';
        audio.sfx('go');
        this.message('GO!', '#40ff60', 1.2, 1.4);
        const lights = this.chunks.startLights();
        if (lights) lights.forEach((l) => l.material.color.set('#20ff40'));
      }
    } else if (this.state === 'run' || this.state === 'goal' || this.state === 'timeover') {
      this.physics(dt, ctl);
      if (this.state === 'run' && !this.demo) {
        this.time -= dt;
        this.stageTime += dt;
        this.totalTime += dt;
        if (this.time <= 10 && this.time > 0) {
          this.timeWarnT -= dt;
          if (this.timeWarnT <= 0) {
            audio.sfx('warn');
            this.timeWarnT = 1;
          }
        }
        if (this.time <= 0) {
          this.time = 0;
          this.state = 'timeover';
          this.overT = 0;
          audio.sfx('timeover');
          this.message('TIME OVER', '#ff4040', 99, 1.4);
        }
      }
      if (this.state === 'goal') {
        this.goalT += dt;
        if (this.goalT > 6 && !this.finished) {
          this.finished = true;
          this.hooks.onGoal && this.hooks.onGoal(this.results());
        }
      }
      if (this.state === 'timeover') {
        this.overT += dt;
        if (this.overT > 3.5 && !this.finished) {
          this.finished = true;
          this.hooks.onTimeOver && this.hooks.onTimeOver();
        }
      }
    }
    this.updateRivals(dt);
    this.updateTraffic(dt);
    this.syncChunks();
    this.updateVisuals(dt, ctl);
    this.updateCamera(dt);
    this.path.pointAt(this.s, 0, _p2);
    this.env.farY = this.lowestVisibleY() - 4;
    this.env.update(dt, this.camera.position, this.mesh.position, this.v, _p2.h);
    // 地標動畫
    for (const g of this.landmarks.values()) if (g.userData.anim) g.userData.anim(this.totalT);
  }

  // 可見範圍內最低的路面高度（遠方地面平面不可高於它，否則會蓋住山谷裡的路）
  lowestVisibleY() {
    const segLen = TUNING.segLen;
    const p = this.path;
    let m = Infinity;
    const i0 = Math.max(0, Math.floor(this.s / segLen) - 30);
    const i1 = Math.min(p.n - 1, Math.floor((this.s + TUNING.viewAhead) / segLen));
    for (let i = i0; i <= i1; i += 4) m = Math.min(m, p.y[i]);
    const over = this.s + TUNING.viewAhead - p.length;
    if (over > 0 && p.children) {
      for (const c of [p.children.L, p.children.R]) {
        const j1 = Math.min(c.n - 1, Math.floor(over / segLen));
        for (let j = 0; j <= j1; j += 4) m = Math.min(m, c.y[j]);
      }
    }
    if (p.parent && this.s < 200) m = Math.min(m, p.parent.y[p.parent.n - 1]);
    return m;
  }

  // 自動駕駛（展示模式 / 終點後）
  autopilot() {
    const k = this.path.curvatureAt(this.s + this.v * 0.6);
    const drift = this.v * this.v * k * TUNING.centrifugal * (1.25 - this.car.grip * 0.6);
    const steerRate = TUNING.steerSpeed * (0.4 + 0.6 * this.car.handling);
    let targetX = this.demoLane ?? 3;
    // 閃避前方車流
    const blockedAt = (x) => this.path.traffic.some((t) => !t.dead && t.s - this.s > -3 && t.s - this.s < 70 + this.v && Math.abs(t.x - x) < 2.8);
    if (blockedAt(targetX) || blockedAt(this.x)) {
      const free = LANES.filter((l) => !blockedAt(l));
      if (free.length) targetX = free.reduce((a, b) => (Math.abs(b - this.x) < Math.abs(a - this.x) ? b : a));
      this.demoLane = targetX;
    }
    // 分岔時選邊
    if (this.path.length - this.s < 400 && this.path.kind !== 'last') targetX = (this.demoSide ?? 1) * 4;
    const want = clamp((targetX - this.x) * 0.25 + drift / Math.max(1, steerRate), -1, 1);
    let kmax = 0;
    for (let d = 5; d <= 90; d += 12) kmax = Math.max(kmax, Math.abs(this.path.curvatureAt(this.s + d)));
    const vLim = kmax > 0.0005 ? Math.sqrt(26 / kmax) : 999;
    const hard = this.v > vLim;
    if (this.state === 'goal') return { steer: clamp((0 - this.x) * 0.2 + drift / Math.max(1, steerRate), -1, 1), gas: 0, brake: this.v > 8 ? 0.35 : 0 };
    return { steer: want, gas: hard ? 0 : 1, brake: this.v > vLim + 4 ? 0.6 : 0 };
  }

  physics(dt, ctl) {
    const car = this.car;
    const vmax = this.vmax;
    const hw = TUNING.roadHalfWidth;
    const prevS = this.s;

    // ---- 翻車中 ----
    if (this.crash) {
      this.crash.t += dt;
      this.v = Math.max(this.crash.keep, this.v - this.crash.decel * dt);
      this.s += this.v * dt;
      this.x += this.crash.dx * dt;
      this.crash.dx *= 1 - dt * 2.5;
      if (this.crash.t > this.crash.dur) {
        const wasBig = this.crash.big;
        this.recoverTarget = this.crash.preV * 0.97;
        this.crash = null;
        this.slide = 0;
        this.lv = 0;
        this.yaw = 0;
        this.bumpCool = 1.0; // 恢復後短暫無敵，避免連環撞
        this.recoverBoost = wasBig ? 4 : 2; // 恢復後加速度提升，快速追回撞車前的速度
        // 回到路面內
        this.recoverX = clamp(this.x, -hw + 2, hw - 2);
      }
      this.rpm = lerp(this.rpm, 0.1, dt * 3);
      this.checkProgress(prevS);
      return;
    }
    if (this.recoverX !== undefined) {
      this.x = lerp(this.x, this.recoverX, dt * 6);
      if (Math.abs(this.x - this.recoverX) < 0.1) this.recoverX = undefined;
    }

    const gas = this.state === 'timeover' ? 0 : ctl.gas;
    const brake = this.state === 'timeover' ? 0.4 : ctl.brake;
    const vn = this.v / vmax;
    const accBase = 8 + car.accel * 7;
    let a = 0;
    if (this.trans === 'AT') {
      a = accBase * (1 - Math.pow(Math.min(1, vn), 1.7));
      // 自動換檔（引擎聲用）
      const g = vn < 0.22 ? 1 : vn < 0.45 ? 2 : vn < 0.7 ? 3 : 4;
      if (g !== this.atGear) {
        this.atGear = g;
      }
      const lo = [0, 0, 0.22, 0.45, 0.7][g];
      const hi = [0, 0.22, 0.45, 0.7, 1.02][g];
      this.rpm = 0.25 + ((vn - lo) / (hi - lo)) * 0.72;
    } else {
      if (this.gear === 0) {
        const lim = 0.58;
        a = vn < lim ? accBase * 1.12 * (1 - Math.pow(vn / lim, 2) * 0.55) : -3;
        this.rpm = 0.2 + (vn / lim) * 0.8;
      } else {
        a = accBase * (0.28 + 0.72 * clamp(vn / 0.42, 0, 1)) * (1 - Math.pow(Math.min(1, vn), 1.7));
        this.rpm = 0.2 + vn * 0.8;
      }
    }
    this.rpm = clamp(this.rpm, 0.1, 1.05);
    if (this.recoverBoost > 0) {
      this.recoverBoost -= dt;
      if (this.v < (this.recoverTarget || 0) && gas > 0) a = Math.max(a * 1.5, 13);
      else this.recoverBoost = 0;
    }
    if (gas > 0) this.v += a * gas * dt;
    else this.v -= (1.2 + 0.00055 * this.v * this.v) * dt;
    if (brake > 0) this.v -= 24 * brake * dt;

    // 路外
    const onRoad = this.onRoadCheck();
    this.offroad = onRoad ? 0 : 1;
    if (!onRoad) {
      const cap = vmax * (0.32 + 0.55 * car.offroad);
      if (this.v > cap) this.v -= (20 - car.offroad * 12) * dt;
      this.shake = Math.max(this.shake, 0.08 * vn);
      if (this.v > 5 && this.rng() < 0.5) this.emitSmoke(true);
    }
    this.v = clamp(this.v, 0, vmax * 1.03);

    // 轉向與離心力
    const k = this.path.curvatureAt(this.s);
    const grip = 1.25 - car.grip * 0.6;
    const lat = this.v * this.v * k; // 向心需求 (m/s²，正=右彎)
    // ---- 甩尾（Power Slide）----
    // 條件1：高速進彎並朝彎內打方向；條件2：點煞車後猛打方向（主動甩尾）
    if (brake > 0.2) this.brakeTap = 0.45;
    else this.brakeTap = Math.max(0, (this.brakeTap || 0) - dt);
    let slideTarget = 0;
    const steerInto = ctl.steer * Math.sign(k) > 0.35;
    if (onRoad && vn > 0.42 && steerInto && Math.abs(lat) > 7) {
      slideTarget = Math.sign(k) * clamp((Math.abs(lat) - 7) / 14 + 0.35, 0, 1);
    }
    if (onRoad && vn > 0.5 && this.brakeTap > 0 && Math.abs(ctl.steer) > 0.6) {
      slideTarget = Math.sign(ctl.steer) * Math.max(Math.abs(slideTarget), 0.9);
    }
    // 放開方向或反打 → 逐漸回正
    const rate = slideTarget !== 0 ? 3.2 : Math.abs(ctl.steer) < 0.2 || ctl.steer * this.slide < 0 ? 3.5 : 1.6;
    this.slide = lerp(this.slide || 0, slideTarget, clamp(dt * rate, 0, 1));
    const slideAbs = Math.abs(this.slide);
    // 甩尾中：離心推力降低、轉向更有效，但會掉一點速度
    const drift = lat * TUNING.centrifugal * grip * (1 - slideAbs * 0.38);
    const steerRate = TUNING.steerSpeed * (0.4 + 0.6 * car.handling) * clamp(this.v / 10, 0, 1) * (1 + slideAbs * 0.25);
    if (slideAbs > 0.1) this.v -= slideAbs * (2.2 + (1 - car.grip) * 2) * dt;
    const targetLv = ctl.steer * steerRate - drift;
    this.lv = lerp(this.lv, targetLv, clamp(dt * (6 + car.handling * 6), 0, 1));
    this.x += this.lv * dt;
    const maxX = hw + TUNING.groundWidth * 0.5;
    this.x = clamp(this.x, -maxX, maxX);
    // 輪胎尖叫與煙
    const skidRaw = Math.max(slideAbs * 1.1, (Math.abs(drift) - 6) / 8);
    this.skid = lerp(this.skid, clamp(skidRaw, 0, 1) * (onRoad ? 1 : 0.2), dt * 8);
    if (slideAbs > 0.25 && this.rng() < slideAbs * 1.4) this.emitSmoke(false, true);
    else if (this.skid > 0.4 && this.rng() < this.skid * 0.6) this.emitSmoke(false, true);
    // 車身角度：甩尾時車頭朝彎內偏
    const yawTarget = clamp(this.lv / Math.max(8, this.v), -0.4, 0.4) + ctl.steer * 0.05 + this.slide * 0.44;
    this.yaw = lerp(this.yaw, yawTarget, clamp(dt * 7, 0, 1));
    if (slideAbs > 0.5 && !this.slideMsgT && this.state === 'run') {
      this.slideMsgT = 3;
    }
    this.slideMsgT = Math.max(0, (this.slideMsgT || 0) - dt);

    this.s += this.v * dt;
    this.score += this.v * dt * (this.state === 'run' ? 1.2 : 0);
    this.bumpCool -= dt;

    this.checkProgress(prevS);
    if (this.state === 'run') {
      this.checkPropCollision();
      this.checkCarCollision();
    }
  }

  // 是否在路面上（含分岔兩條路）
  onRoadCheck() {
    const hw = TUNING.roadHalfWidth + 0.7;
    if (Math.abs(this.x) < hw) return true;
    const sib = this.sibling();
    if (sib && !sib.abandoned && this.s < FORK_SEGS * TUNING.segLen) {
      const xs = this.x + forkOffset(this.path.side, this.s) - forkOffset(sib.side, this.s);
      if (Math.abs(xs) < hw) return true;
    }
    return false;
  }

  // 路段推進：分岔、檢查點、終點
  checkProgress(prevS) {
    const segLen = TUNING.segLen;
    let p = this.path;
    // 靠近路段尾端時產生子路徑
    if (!p.children && p.kind !== 'last' && p.length - this.s < TUNING.viewAhead + 300) {
      const ch = p.spawnChildren();
      if (ch) {
        const own = this.landmarks.get(p.id);
        if (own) this.landmarkOverlaps(own, [ch.L, ch.R], true);
        this.addLandmark(ch.L);
        this.addLandmark(ch.R);
      }
    }
    // 進入子路徑
    if (this.s >= p.length && p.children) {
      const c = this.x < 0 ? p.children.L : p.children.R;
      this.s -= p.length;
      prevS -= p.length;
      this.path = c;
      p = c;
      this.demoSide = this.rng() < 0.5 ? -1 : 1;
    }
    // 分岔張開區：可切換到另一條
    const sib = this.sibling();
    if (sib && !sib.abandoned && this.s < FORK_SEGS * segLen) {
      const xs = this.x + forkOffset(p.side, this.s) - forkOffset(sib.side, this.s);
      if (Math.abs(xs) < Math.abs(this.x)) {
        this.path = sib;
        this.x = xs;
        p = sib;
      }
      const sep = Math.abs(forkOffset(1, this.s) * 2);
      if (sep > TUNING.roadHalfWidth * 2 + 4) this.commitBranch();
    }
    // 拱門
    for (const g of p.gates) {
      const gs = g.seg * segLen;
      if (prevS < gs && this.s >= gs) this.passGate(g.kind);
    }
  }

  commitBranch() {
    const p = this.path;
    const sib = this.sibling();
    if (!sib || sib.abandoned) return;
    sib.abandoned = true;
    this.routeHistory.push(p.route);
    this.stageNum++;
    this.env.setStage(p.stage);
    for (const r of this.rivals) r.pref = p.side;
    // 清理兩關以前的地標
    if (p.parent && p.parent.parent) this.removeLandmark(p.parent.parent);
    this.hooks.onStage && this.hooks.onStage(p);
    const cleanup = () => this.removeLandmark(sib);
    setTimeout(cleanup, 12000);
  }

  passGate(kind) {
    if (kind === 'checkpoint') {
      if (this.demo) return;
      const bonus = Math.round(TUNING.checkpointBonus - (this.stageNum - 2) * 2);
      this.time += bonus;
      this.lapTimes.push(this.stageTime);
      this.stageTime = 0;
      audio.sfx('checkpoint');
      this.message('CHECKPOINT!', '#40e0ff', 2.4, 1.3);
      this.message('EXTENDED PLAY +' + bonus, '#ffe23a', 2.8, 0.9);
      this.message(this.stage.name + '  ' + this.stage.country, '#ffffff', 3.2, 0.8);
      this.score += Math.round(this.time) * 100;
    } else if (kind === 'goal') {
      if (this.demo) return;
      this.state = 'goal';
      this.goalT = 0;
      this.lapTimes.push(this.stageTime);
      audio.sfx('goal');
      this.message('GOAL!', '#ffd23a', 99, 1.6);
      this.goalRank = this.rank;
      this.score += Math.round(this.time) * 1000 + (9 - this.goalRank) * 20000;
      this.camMode = 2;
    }
  }

  // 撞路邊物件
  checkPropCollision() {
    if (this.crash || this.bumpCool > 0) return;
    const segLen = TUNING.segLen;
    const p = this.path;
    const i0 = Math.floor(this.s / segLen);
    const halfW = this.mesh.userData.spec.W * 0.45;
    const test = (path, xShift) => {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        if (i < 0 || i >= path.n - 1) continue;
        for (const pr of path.info[i].props) {
          if (!pr.r) continue;
          const px = pr.x + xShift;
          const ds = i * segLen - this.s;
          if (Math.abs(ds) < pr.r * pr.scale + 1.6 && Math.abs(px - this.x) < pr.r * pr.scale + halfW) {
            this.hitObstacle(px);
            return true;
          }
        }
      }
      return false;
    };
    if (test(p, 0)) return;
    const sib = this.sibling();
    if (sib && this.s < (FORK_SEGS + 5) * segLen) {
      test(sib, forkOffset(sib.side, this.s) - forkOffset(p.side, this.s));
    }
  }

  hitObstacle(px) {
    if (this.v > 20) this.startCrash(Math.sign(this.x - px) || 1);
    else {
      audio.sfx('bump');
      this.v = Math.min(this.v, 3);
      this.x += Math.sign(this.x - px) * 1.2;
      this.bumpCool = 0.5;
      this.shake = 0.4;
    }
  }

  startCrash(dir) {
    if (this.crash) return;
    audio.sfx('crash');
    const big = this.v > 38;
    // 撞車後保留部分車速，不必從靜止重新起步
    const keep = big ? Math.max(22, this.v * 0.55) : Math.max(16, this.v * 0.6);
    const dur = big ? TUNING.crashTime : TUNING.crashTime * 0.7;
    this.crash = {
      t: 0,
      dir,
      big,
      dur,
      keep: Math.min(keep, this.v),
      preV: this.v,
      decel: Math.max(0, this.v - keep) / (dur * 0.6),
      dx: dir * (big ? 5 : 2.5),
      spins: big ? 2 : 1,
    };
    this.shake = 1;
    this.message(big ? 'CRASH!!' : 'SPIN!', '#ff5a3a', 1.2, 1.2);
    for (let i = 0; i < 10; i++) this.emitSmoke(false);
  }

  // 與車流/對手碰撞
  checkCarCollision() {
    if (this.crash || this.bumpCool > 0) return;
    const spec = this.mesh.userData.spec;
    const check = (path, s, x, L, W, vOther, obj) => {
      if (path !== this.path) return false;
      const ds = s - this.s;
      if (Math.abs(ds) < (spec.L + L) / 2 && Math.abs(x - this.x) < (spec.W + W) / 2 - 0.1) {
        if (ds > 0 && this.v > vOther) {
          // 追撞
          const rel = this.v - vOther;
          audio.sfx('bump');
          this.shake = 0.5;
          if (rel > 28 && obj.big) this.startCrash(Math.sign(this.x - x) || 1);
          else {
            this.v = vOther * 0.8;
            this.x += Math.sign(this.x - x || 1) * 0.6;
            if (obj.push) obj.push(rel);
          }
        } else {
          audio.sfx('bump');
          this.x += Math.sign(this.x - x || 1) * 0.8;
          this.lv = 0;
          if (obj.push) obj.push(2);
        }
        this.bumpCool = 0.45;
        return true;
      }
      return false;
    };
    for (const t of this.visibleTraffic || []) {
      const sp = t.mesh.userData.spec;
      if (check(t.path, t.s, t.x, sp.L, sp.W, t.v, { big: true })) return;
    }
    for (const r of this.rivals) {
      if (!r.map) continue;
      const w = this.car.weight / r.car.weight;
      if (check(r.map.path, r.map.s, r.x, 4.4, 1.9, r.v, { big: false, push: (rel) => { r.v += rel * 0.4 * w; r.x += Math.sign(r.x - this.x || 1) * 1.2 * w; } })) return;
    }
  }

  get rank() {
    let n = 1;
    const D = this.D;
    for (const r of this.rivals) if (r.D > D) n++;
    return n;
  }

  // ---------------- 對手 AI ----------------
  updateRivals(dt) {
    const D = this.D;
    const racing = this.state !== 'countdown';
    for (const r of this.rivals) {
      const m = this.mapD(r.D, r.pref);
      r.map = m;
      const path = m ? m.path : null;
      const s = m ? m.s : 0;
      let target = r.car.top / 3.6 * 0.95 * r.skill * TUNING.rivalSkill;
      if (path) {
        // 依前方最大曲率限速（最大向心 ~24 m/s²）
        let kmax = 0;
        for (let d = 5; d <= 70; d += 13) kmax = Math.max(kmax, Math.abs(path.curvatureAt(s + d)));
        if (kmax > 0.0005) target = Math.min(target, Math.sqrt((24 * r.skill) / kmax));
      }
      // 橡皮筋
      const gap = r.D - D;
      if (gap > 300) target *= 0.86;
      else if (gap > 120) target *= 0.95;
      else if (gap < -400) target *= 1.18;
      else if (gap < -120) target *= 1.07;
      if (!racing) target = 0;
      if (this.demo) target *= 1.02;
      if (racing && r.launch > 0) {
        r.launch -= dt;
        target = 0;
      }
      const acc = r.v < target ? (7 + r.car.accel * 5) * (r.v < 25 ? 1.35 : 1) : 10;
      r.v = r.v < target ? Math.min(target, r.v + acc * dt) : Math.max(target, r.v - acc * dt);
      // 閃避車流
      if (path) {
        let blocked = false;
        for (const t of path.traffic) {
          if (t.dead) continue;
          const ds = t.s - s;
          if (ds > 0 && ds < 55 && Math.abs(t.x - r.tx) < 2.6) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          const free = LANES.filter((l) => !path.traffic.some((t) => !t.dead && t.s - s > -8 && t.s - s < 60 && Math.abs(t.x - l) < 2.6));
          if (free.length) r.tx = free.reduce((a, b) => (Math.abs(b - r.x) < Math.abs(a - r.x) ? b : a));
          else r.v = Math.min(r.v, 22);
        }
        // 分岔：往偏好方向靠
        if (path.kind !== 'last' && path.length - s < 350 && path.children == null) r.tx = r.pref * 4;
        if (path.length - s < 350 && path.kind !== 'last') r.tx = r.pref * 4;
      }
      r.wob += dt;
      const tx = r.tx + Math.sin(r.wob * 0.3) * 0.8;
      r.lvx = clamp((tx - r.x) * 1.5, -6, 6);
      r.x += r.lvx * dt;
      r.D += r.v * dt;
      if (r.bump > 0) r.bump -= dt;
    }
  }

  // ---------------- 車流 ----------------
  updateTraffic(dt) {
    const segLen = TUNING.segLen;
    const paths = [this.path];
    if (this.path.children) paths.push(this.path.children.L, this.path.children.R);
    if (this.path.parent) paths.push(this.path.parent);
    const vis = [];
    const used = new Set();
    for (const p of paths) {
      for (const t of p.traffic) {
        if (t.dead) continue;
        t.s += t.v * dt;
        if (t.s > p.bodyEnd * segLen) {
          t.dead = true;
          continue;
        }
        // 相對距離
        let rel;
        if (p === this.path) rel = t.s - this.s;
        else if (p.parent === this.path) rel = t.s + this.path.length - this.s;
        else if (p === this.path.parent) rel = t.s - p.length - this.s;
        else rel = 99999;
        if (rel > -60 && rel < TUNING.viewAhead) {
          if (!t.mesh) {
            t.mesh = buildTraffic(t.type, t.color);
            t.mesh.rotation.order = 'YXZ';
            this.scene.add(t.mesh);
          }
          used.add(t);
          vis.push(t);
        }
      }
    }
    // 移除不可見的車流網格
    for (const [t, m] of this.trafficMeshes) {
      if (!used.has(t)) {
        this.scene.remove(m);
        t.mesh = null;
        this.trafficMeshes.delete(t);
      }
    }
    for (const t of vis) {
      this.trafficMeshes.set(t, t.mesh);
      t.path.pointAt(t.s, t.x, _p);
      t.mesh.position.set(_p.x, _p.y, _p.z);
      t.mesh.rotation.y = -_p.h;
      t.mesh.rotation.x = t.path.pitchAt(t.s);
      for (const w of t.mesh.userData.wheels) w.spin.rotation.x -= (t.v * dt) / 0.35;
    }
    this.visibleTraffic = vis;
  }

  // ---------------- 視覺 ----------------
  emitSmoke(dust, rear) {
    const s = this.smoke[this.smokeIdx++ % this.smoke.length];
    s.life = 1;
    s.dust = dust;
    let off = (this.rng() - 0.5) * 1.6;
    let back = 1.8;
    if (rear) {
      // 後輪位置（考慮車身偏角）
      const side = this.rng() < 0.5 ? -0.85 : 0.85;
      back = 1.5;
      off = side - this.yaw * back * 1.2;
    }
    this.path.pointAt(this.s - back + 1.2, this.x + off, _p);
    s.sp.position.set(_p.x, _p.y + 0.4, _p.z);
    s.sp.material.color.set(dust ? this.stage.ground[0] : '#e8e8e8');
    s.sp.scale.setScalar(1);
    s.sp.visible = true;
  }

  updateVisuals(dt, ctl = { steer: 0, brake: 0 }) {
    const m = this.mesh;
    const ud = m.userData;
    this.path.pointAt(this.s, this.x, _p);
    m.position.set(_p.x, _p.y, _p.z);
    m.scale.setScalar(TUNING.carScale);
    m.rotation.y = -_p.h - this.yaw;
    m.rotation.x = this.path.pitchAt(this.s);
    // 翻車動畫
    const body = ud.body;
    if (this.crash) {
      const c = this.crash;
      const t = c.t / c.dur;
      const k = clamp(t / 0.75, 0, 1);
      if (c.big) {
        body.rotation.z = c.dir * k * Math.PI * 2 * c.spins;
        body.rotation.x = Math.sin(k * Math.PI) * 0.6;
        body.position.y = Math.sin(k * Math.PI) * 3.2;
        body.rotation.y = c.dir * k * 1.2;
      } else {
        body.rotation.y = c.dir * k * Math.PI * 2;
        body.position.y = Math.sin(k * Math.PI) * 0.4;
        body.rotation.z = 0;
      }
    } else {
      body.rotation.z = lerp(body.rotation.z % (Math.PI * 2), clamp(-this.lv * 0.012, -0.08, 0.08), clamp(dt * 8, 0, 1));
      body.rotation.y = lerp(body.rotation.y % (Math.PI * 2), 0, clamp(dt * 8, 0, 1));
      body.rotation.x = lerp(body.rotation.x, (ctl.brake > 0 ? 0.025 : 0) - (ctl.gas > 0 && this.v < 20 ? 0.02 : 0), clamp(dt * 6, 0, 1));
      body.position.y = this.offroad ? Math.sin(this.totalT * 40) * 0.04 : 0;
    }
    const spin = (this.v * dt) / ud.spec.r;
    for (const w of ud.wheels) w.spin.rotation.x -= spin;
    for (const w of ud.front) w.pivot.rotation.y = -ctl.steer * 0.45;
    ud.tail.emissiveIntensity = ctl.brake > 0 ? 2.2 : 0.55;
    const night = this.stage.night;
    ud.head.emissiveIntensity = night ? 1.5 : 0.3;
    this.headLight.intensity = night ? 60 : 0;
    if (ud.hair) ud.hair.rotation.x = -0.3 - Math.sin(this.totalT * 18) * 0.12 * (this.v / 60) - (this.v / 80) * 0.5;

    // 對手
    for (const r of this.rivals) {
      const mm = r.mesh;
      if (!r.map || r.D - this.D > TUNING.viewAhead || r.D - this.D < -80) {
        mm.visible = false;
        continue;
      }
      mm.visible = true;
      r.map.path.pointAt(r.map.s, r.x, _p2);
      mm.position.set(_p2.x, _p2.y, _p2.z);
      const rk = r.map.path.curvatureAt(r.map.s);
      const rslide = clamp((r.v * r.v * Math.abs(rk) - 9) / 20, 0, 0.35) * Math.sign(rk);
      mm.rotation.y = -_p2.h - clamp((r.lvx || 0) / Math.max(8, r.v), -0.3, 0.3) - rslide;
      mm.rotation.x = r.map.path.pitchAt(r.map.s);
      const rs = (r.v * dt) / mm.userData.spec.r;
      for (const w of mm.userData.wheels) w.spin.rotation.x -= rs;
      mm.userData.head.emissiveIntensity = night ? 1.5 : 0.3;
    }

    // 煙霧
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt * (s.dust ? 1.4 : 1.1);
      if (s.life <= 0) {
        s.sp.visible = false;
        continue;
      }
      s.sp.position.y += dt * 1.2;
      s.sp.scale.setScalar(1 + (1 - s.life) * 4);
      s.sp.material.opacity = s.life * 0.55;
    }
  }

  updateCamera(dt) {
    const cam = this.camera;
    const T = TUNING;
    const spd = this.v / Math.max(1, this.vmax);
    if (this.camMode === 2) {
      // 終點環繞鏡頭
      const a = this.goalT * 0.45;
      _v.copy(this.mesh.position);
      const r = 9 + this.goalT * 0.6;
      const h = -_p.h;
      cam.position.set(_v.x + Math.sin(a + h) * r, _v.y + 2.5 + this.goalT * 0.2, _v.z + Math.cos(a + h) * r);
      cam.lookAt(_v.x, _v.y + 1, _v.z);
      cam.fov = lerp(cam.fov, T.fov, dt * 2);
      cam.updateProjectionMatrix();
      return;
    }
    const dist = this.camMode === 1 ? -0.2 : T.camDistance;
    const hgt = this.camMode === 1 ? 1.25 : T.camHeight;
    this.path.pointAt(this.s - dist, this.x * 0.92 - (this.slide || 0) * 1.4, _p2);
    const tx = _p2.x;
    const camRoadY = _p2.y;
    const ty = _p2.y + hgt;
    const tz = _p2.z;
    this.path.pointAt(this.s + T.lookAhead, this.x * 0.7, _p2);
    const lx = _p2.x;
    const ly = _p2.y + T.lookHeight;
    const lz = _p2.z;
    if (!this.camInit) {
      this.camPos.set(tx, ty, tz);
      this.camLook.set(lx, ly, lz);
      this.camInit = true;
    }
    const k = clamp(dt * T.camLag, 0, 1);
    this.camPos.x = lerp(this.camPos.x, tx, this.camMode === 1 ? 1 : k * 1.6);
    this.camPos.y = lerp(this.camPos.y, ty, this.camMode === 1 ? 1 : Math.min(1, k * 2.2));
    // 不讓鏡頭掉到路面以下（陡坡銜接處）
    const minY = Math.max(camRoadY, this.path.yAt(this.s - dist * 0.5), this.path.yAt(this.s)) + (this.camMode === 1 ? 1.0 : 1.5);
    if (this.camPos.y < minY) this.camPos.y = minY;
    this.camPos.z = lerp(this.camPos.z, tz, this.camMode === 1 ? 1 : k * 1.6);
    this.camLook.x = lerp(this.camLook.x, lx, k * 2);
    this.camLook.y = lerp(this.camLook.y, ly, k * 2);
    this.camLook.z = lerp(this.camLook.z, lz, k * 2);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * 0.25;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    cam.lookAt(this.camLook);
    const fov = T.fov + spd * T.speedFovKick;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = lerp(cam.fov, fov, dt * 3);
      cam.updateProjectionMatrix();
    }
    this.mesh.visible = this.camMode !== 1 || !!this.crash;
  }

  // ---------------- 其他 ----------------
  toggleGear() {
    if (this.trans !== 'MT') return;
    this.gear = 1 - this.gear;
    audio.sfx('shift');
  }

  continueRace() {
    this.time = TUNING.startTime * 0.8;
    this.score = 0;
    this.state = 'run';
    this.finished = false;
    this.messages = [];
    this.message('CONTINUE!', '#40ff60', 1.6, 1.3);
  }

  progress() {
    const end = this.path.kind === 'last' ? this.path.goalSeg : this.path.n - 1;
    return clamp(this.s / (end * TUNING.segLen), 0, 1);
  }

  results() {
    return {
      car: this.car,
      carIdx: this.carIdx,
      score: Math.round(this.score),
      rank: this.goalRank || this.rank,
      time: this.totalTime,
      laps: this.lapTimes.slice(),
      route: this.routeHistory.slice(),
      goal: this.path.stageId,
    };
  }

  // DEV：跳至分岔前 / 終點前
  devJump(where) {
    if (where === 'fork' && this.path.kind !== 'last') this.s = Math.max(this.s, this.path.length - 700);
    if (where === 'goal' && this.path.kind === 'last') this.s = this.path.goalSeg * TUNING.segLen - 300;
    this.camInit = false;
    for (const r of this.rivals) r.D = this.D + (this.rng() - 0.5) * 200;
  }

  dispose() {
    this.chunks.clear();
    this.scene.remove(this.mesh);
    for (const r of this.rivals) this.scene.remove(r.mesh);
    for (const m of this.trafficMeshes.values()) this.scene.remove(m);
    for (const g of this.landmarks.values()) this.scene.remove(g);
    for (const s of this.smoke) this.scene.remove(s.sp);
    this.landmarks.clear();
  }
}

export { TOTAL_STAGES, START_STAGE, STAGES };
