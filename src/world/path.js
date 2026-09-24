// 賽道路徑生成：每個場景一條 Path，結尾分岔成兩條子路徑（下一關）
// 座標：y 朝上；heading h=0 時前進方向為 -Z；右方向 r = (cos h, 0, sin h)
import { TUNING } from '../config.js';
import { STAGES, nextOptions, stageIdOf } from '../data/stages.js';
import { mulberry32, hashStr, clamp, smooth } from '../util.js';
import { PROP_INFO } from './propInfo.js';

export const FORK_SEGS = 70; // 分岔張開長度（段）
export const FORK_SPREAD = 13; // 分岔完成後，路中心距原中線(m)
export const CURVE_UNIT = 0.012; // 彎道值 1 = 每段轉向弧度（值 8 ≈ 半徑 52m 的急彎）
export const LANES = [-5, 0, 5];

export class Path {
  /**
   * @param {object} o
   *  stageId, route, start:{x,y,z,h}, startD, side(-1 左 / +1 右 / 0), kind: 'first'|'normal'|'last', seed
   */
  constructor(o) {
    this.stageId = o.stageId;
    this.stage = STAGES[o.stageId];
    this.route = o.route;
    this.side = o.side || 0;
    this.kind = o.kind || 'normal';
    this.startD = o.startD || 0;
    this.parent = o.parent || null;
    this.children = null;
    this.abandoned = false;
    this.id = Path.nextId++;
    this.rng = mulberry32(o.seed ?? hashStr(o.stageId + ':' + (o.route ? o.route.bound + o.route.col + o.route.row : 's')));
    this.build(o.start);
  }

  build(start) {
    const rng = this.rng;
    const st = this.stage;
    const segLen = TUNING.segLen;
    const curves = [];
    const heights = []; // 各段的 y 增量
    const info = [];
    const gates = [];
    let hsum = 0; // 相對起點的累計轉向（弧度）
    const pushSeg = (c, dy, tag) => {
      hsum += c * CURVE_UNIT;
      curves.push(c);
      heights.push(dy);
      info.push({ props: [], tag: tag || null });
    };
    // 加入一段路：enter/hold/leave 段數、彎道值、總升降(m)
    const addRoad = (enter, hold, leave, curve, dy, tag) => {
      const total = enter + hold + leave;
      let prevY = 0;
      for (let i = 0; i < total; i++) {
        let c;
        if (i < enter) c = curve * smooth(i / enter);
        else if (i < enter + hold) c = curve;
        else c = curve * (1 - smooth((i - enter - hold) / leave));
        const y = dy * smooth((i + 1) / total);
        pushSeg(c, y - prevY, tag);
        prevY = y;
      }
    };

    // ---- 開頭 ----
    this.forkZone = 0;
    if (this.side !== 0) {
      // 分岔張開區
      for (let i = 0; i < FORK_SEGS; i++) pushSeg(0, 0, 'fork');
      this.forkZone = FORK_SEGS;
      // 兩條分岔路朝相反方向彎開，避免平行或交叉
      addRoad(12, 30, 12, this.side * 1.6, 0, 'intro');
      gates.push({ seg: FORK_SEGS + 8, kind: 'checkpoint' });
    } else {
      addRoad(0, 70, 0, 0, 0, 'intro');
      gates.push({ seg: 26, kind: 'start' });
    }
    this.introEnd = curves.length;

    // ---- 主體 ----
    const target = TUNING.stageSegments;
    const bodyEnd = target - (this.kind === 'last' ? 120 : 110);
    const curvy = st.curvy;
    const hilly = st.hilly;
    let lastCurveSign = this.side !== 0 ? -this.side : rng() < 0.5 ? -1 : 1;
    // 起伏：坡度明顯（最陡約 15%）
    const hill = () => (rng() < 0.35 + hilly * 0.5 ? (rng() - 0.5) * 2 * (12 + hilly * 45) : 0);
    // 彎道：限制總轉角，避免繞圈
    const LIMIT = 1.3;
    const addCurve = (sign, sharp, dy, angleMul = 1, force = false) => {
      let c = sharp ? 4.5 + rng() * (2 + curvy * 1.5) : 1.2 + rng() * 2.6;
      let angle = (sharp ? 0.8 + rng() * 0.9 : 0.35 + rng() * 0.8) * angleMul;
      // 非強制時，若同方向會超過上限就反向
      if (!force && hsum * sign + angle > LIMIT) sign = -sign;
      // 此方向剩餘可轉角度（累計航向維持在 ±LIMIT 內，道路就不會繞回自己）
      const room = LIMIT - hsum * sign;
      if (room < 0.2) {
        addRoad(10, 25, 10, 0, dy, 'straight');
        return;
      }
      angle = Math.min(angle, room);
      const ent = Math.floor(sharp ? 8 + rng() * 8 : 14 + rng() * 18);
      const hold = Math.max(4, Math.round(angle / (c * CURVE_UNIT) - ent));
      // 彎道總轉角 ≈ c × 單位 × (ent + hold)；太大時降低彎度，確保實際轉角等於設定值
      if (c * CURVE_UNIT * (ent + hold) > angle) c = angle / (CURVE_UNIT * (ent + hold));
      addRoad(ent, hold, ent, sign * c, dy, c >= 3.8 ? 'hard' : 'curve');
    };
    while (curves.length < bodyEnd) {
      const r = rng();
      if (r < 0.14 + (1 - curvy) * 0.2) {
        // 直線（常帶坡）
        addRoad(10, Math.floor(20 + rng() * 45), 10, 0, hill(), 'straight');
      } else if (r < 0.24 && hilly > 0.2) {
        // 山頂：先爬再衝下去
        const H = 14 + hilly * 40 + rng() * 10;
        addRoad(12, Math.floor(15 + rng() * 20), 12, 0, H, 'straight');
        addRoad(12, Math.floor(15 + rng() * 20), 12, 0, -H * (0.7 + rng() * 0.5), 'straight');
      } else if (r < 0.86) {
        let sign = rng() < 0.7 ? -lastCurveSign : lastCurveSign;
        // 分岔子路徑的第一個彎：強制繼續往外，確保兩條路不會再靠近
        const force = this.side !== 0 && curves.length < FORK_SEGS + 140;
        if (force) sign = this.side;
        lastCurveSign = sign;
        const sharp = rng() < 0.22 + curvy * 0.35;
        addCurve(sign, sharp, hill(), 1, force);
        if (sharp) addRoad(8, Math.floor(10 + rng() * 15), 8, 0, 0, 'straight');
      } else {
        // S 彎
        const sharp = rng() < 0.3 + curvy * 0.3;
        const early = this.side !== 0 && curves.length < FORK_SEGS + 140;
        const sign = early ? this.side : rng() < 0.5 ? -1 : 1;
        addCurve(sign, sharp, hill() * 0.5, 0.7, early);
        addCurve(-sign, sharp, hill() * 0.5, 0.7);
      }
    }
    this.bodyEnd = curves.length;

    // ---- 結尾 ----
    if (this.kind === 'last') {
      addRoad(20, 60, 20, 0, 0, 'final');
      gates.push({ seg: curves.length - 10, kind: 'goal' });
      addRoad(0, 260, 0, 0, 0, 'tail');
      this.goalSeg = curves.length - 260 - 10;
    } else {
      addRoad(20, 90, 0, 0, 0, 'prefork');
    }

    // ---- 積分出座標 ----
    const n = curves.length + 1;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.h = new Float32Array(n);
    this.curve = new Float32Array(n);
    let px = start.x;
    let py = start.y;
    let pz = start.z;
    let h = start.h;
    this.x[0] = px;
    this.y[0] = py;
    this.z[0] = pz;
    for (let i = 0; i < curves.length; i++) {
      h += curves[i] * CURVE_UNIT;
      px += Math.sin(h) * segLen;
      pz += -Math.cos(h) * segLen;
      py = clamp(py + heights[i], -160, 220);
      this.x[i + 1] = px;
      this.y[i + 1] = py;
      this.z[i + 1] = pz;
      this.curve[i] = curves[i];
    }
    // 分岔張開：依子路徑方向做側向位移
    if (this.side !== 0) {
      const rx = Math.cos(start.h);
      const rz = Math.sin(start.h);
      for (let i = 0; i < n; i++) {
        const k = Math.min(i, FORK_SEGS) / FORK_SEGS;
        const off = this.side * FORK_SPREAD * smooth(k);
        this.x[i] += rx * off;
        this.z[i] += rz * off;
      }
    }
    // 由座標反推方向
    for (let i = 0; i < n - 1; i++) {
      this.h[i] = Math.atan2(this.x[i + 1] - this.x[i], -(this.z[i + 1] - this.z[i]));
    }
    this.h[n - 1] = this.h[n - 2];
    this.length = (n - 1) * segLen;
    // 各段兩側可用的地面寬度（急彎內側縮窄）
    const gw = TUNING.groundWidth;
    const hw = TUNING.roadHalfWidth;
    const raw = [new Float32Array(n), new Float32Array(n)]; // [左, 右]
    for (let i = 0; i < n; i++) {
      const c = this.curve[Math.min(i, n - 2)];
      const R = Math.abs(c) > 0.01 ? segLen / (Math.abs(c) * CURVE_UNIT) : 1e9;
      const inner = Math.max(12, Math.min(gw, R * 0.8 - hw));
      raw[0][i] = c < 0 ? inner : gw;
      raw[1][i] = c > 0 ? inner : gw;
    }
    this.gwSide = [new Float32Array(n), new Float32Array(n)];
    this.skirt = [new Uint8Array(n).fill(1), new Uint8Array(n).fill(1)]; // 地面外緣是否往下收成懸崖
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        let m = gw;
        for (let j = Math.max(0, i - 25); j <= Math.min(n - 1, i + 25); j++) m = Math.min(m, raw[k][j] + Math.abs(j - i) * 1.5);
        this.gwSide[k][i] = m;
      }
    }
    this.info = info;
    info.push({ props: [], tag: 'end' });
    this.gates = gates;
    for (const g of gates) info[g.seg].gate = g.kind;

    this.placeProps();
    this.pruneAgainst([this]);
    this.placeLandmark();
    this.makeTraffic();
  }

  // ---- 路邊物件配置 ----
  placeProps() {
    const st = this.stage;
    const rng = this.rng;
    const hw = TUNING.roadHalfWidth;
    const weights = st.roadside;
    const totalW = weights.reduce((a, b) => a + b[1], 0);
    const pick = () => {
      let r = rng() * totalW;
      for (const [t, w] of weights) {
        r -= w;
        if (r <= 0) return t;
      }
      return weights[0][0];
    };
    const dens = TUNING.propDensity;
    const seaSide = st.sea === 'left' ? -1 : st.sea === 'right' ? 1 : 0;
    const start = this.side !== 0 ? FORK_SEGS + 20 : 12;
    const end = this.kind === 'last' ? this.n - 2 : this.n - 30;
    // 本段主題物件：幾段一組（原作的節奏感）
    let groupType = pick();
    let groupLeft = 0;
    for (let i = start; i < end; i++) {
      const tag = this.info[i].tag;
      if (groupLeft <= 0) {
        groupType = pick();
        groupLeft = 8 + Math.floor(rng() * 20);
      }
      groupLeft--;
      for (const side of [-1, 1]) {
        const innerFork = this.side !== 0 && side === -this.side && i < FORK_SEGS + 130;
        // 近排
        if (i % 3 === (side > 0 ? 0 : 1) && rng() < 0.8 * dens) {
          const type = rng() < 0.7 ? groupType : pick();
          const pi = PROP_INFO[type];
          if (!pi) continue;
          if (side === seaSide && pi.big) continue;
          if (innerFork && (pi.big || pi.off[0] > 1.45)) continue;
          let off = pi.off[0] + rng() * (pi.off[1] - pi.off[0]);
          if (innerFork) off = Math.min(off, 1.45);
          if (hw * off > this.gwSide[side < 0 ? 0 : 1][i] + hw - 4) continue;
          this.addProp(i, type, side * hw * off, rng);
        }
        // 遠排（增加景深）
        if (side !== seaSide && !innerFork && i % 7 === (side > 0 ? 2 : 5) && rng() < 0.55 * dens) {
          const type = pick();
          const pi = PROP_INFO[type];
          if (!pi || pi.sign) continue;
          const d = hw * (3.2 + rng() * 7);
          if (d > this.gwSide[side < 0 ? 0 : 1][i] + hw - 6) continue;
          this.addProp(i, type, side * d, rng);
        }
      }
      // 彎道警示牌：外側
      const c = this.curve[i];
      if ((tag === 'hard' && i % 3 === 0) || (tag === 'curve' && Math.abs(c) >= 2.5 && i % 6 === 0)) {
        const outer = c > 0 ? -1 : 1;
        this.addProp(i, c > 0 ? 'chevron_r' : 'chevron_l', outer * hw * 1.2, rng, true);
      }
    }
    // 分岔前警示與分岔路牌
    if (this.kind !== 'last') {
      for (let i = this.n - 100; i < this.n - 5; i += 10) {
        this.addProp(i, 'lamp', -hw * 1.2, rng);
        this.addProp(i, 'lamp', hw * 1.2, rng);
      }
    }
    if (this.side === -1) {
      // 分岔路牌放在左路右側（兩路中間的分隔島）
      const k = Math.floor(FORK_SEGS * 0.72);
      const off = FORK_SPREAD * smooth(k / FORK_SEGS);
      this.info[k].props.push({ type: 'forksign', x: off, scale: 1, rot: 0, v: 0, r: 2.2 });
    }
    // 起點旁的觀眾建築
    if (this.kind === 'first') {
      for (let i = 14; i < 40; i += 6) {
        this.addProp(i, 'billboard', -hw * 1.5, rng, true);
        this.addProp(i + 3, weights[0][0], hw * 1.5, rng);
      }
    }
  }

  addProp(i, type, x, rng, noRand) {
    const pi = PROP_INFO[type];
    if (!pi) return;
    this.info[i].props.push({
      type,
      x,
      scale: noRand ? 1 : 0.85 + rng() * 0.35,
      rot: noRand ? 0 : rng() * Math.PI * 2,
      v: Math.floor(rng() * 4),
      r: pi.r,
    });
  }

  placeLandmark() {
    const st = this.stage;
    if (!st.landmark) return;
    const rng = this.rng;
    const seg = Math.floor(this.introEnd + (this.bodyEnd - this.introEnd) * (0.45 + rng() * 0.2));
    let side = rng() < 0.5 ? -1 : 1;
    if (st.sea === 'left') side = 1;
    if (st.sea === 'right') side = -1;
    // 部分地標放在海上或路的正前方遠處
    const dist = 170 + rng() * 120;
    this.landmark = { seg, side, dist, key: st.landmark };
  }

  makeTraffic() {
    const rng = this.rng;
    const types = this.stage.traffic || ['sedan'];
    const count = Math.floor(((this.n - this.introEnd) / 42) * TUNING.trafficDensity);
    this.traffic = [];
    const segLen = TUNING.segLen;
    for (let k = 0; k < count; k++) {
      const seg = this.introEnd + 20 + Math.floor(rng() * (this.bodyEnd - this.introEnd - 20));
      this.traffic.push({
        s: seg * segLen,
        x: LANES[Math.floor(rng() * 3)],
        tx: 0,
        v: (60 + rng() * 60) / 3.6,
        type: types[Math.floor(rng() * types.length)],
        color: Math.floor(rng() * 8),
        path: this,
        mesh: null,
        dead: false,
      });
    }
    for (const t of this.traffic) t.tx = t.x;
  }

  // ---- 查詢 ----
  segIndex(s) {
    return clamp(Math.floor(s / TUNING.segLen), 0, this.n - 2);
  }

  // 取得世界座標（寫入 out）
  pointAt(s, lateral, out) {
    const segLen = TUNING.segLen;
    let i = Math.floor(s / segLen);
    let t;
    if (i < 0) {
      i = 0;
      t = s / segLen;
    } else if (i > this.n - 2) {
      i = this.n - 2;
      t = (s - i * segLen) / segLen;
    } else t = s / segLen - i;
    const x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    const y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    const z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    let h0 = this.h[i];
    let h1 = this.h[Math.min(i + 1, this.n - 1)];
    let dh = h1 - h0;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    const h = h0 + dh * clamp(t, 0, 1);
    out.x = x + Math.cos(h) * lateral;
    out.y = y;
    out.z = z + Math.sin(h) * lateral;
    out.h = h;
    out.pitch = Math.atan2(this.y[i + 1] - this.y[i], segLen);
    return out;
  }

  // 高度（線性插值）
  yAt(s) {
    const segLen = TUNING.segLen;
    const i = clamp(Math.floor(s / segLen), 0, this.n - 2);
    const t = clamp(s / segLen - i, 0, 1);
    return this.y[i] + (this.y[i + 1] - this.y[i]) * t;
  }

  // 平滑的俯仰角（取前後各 2.2m，避免換坡瞬間車頭插進路面）
  pitchAt(s) {
    return Math.atan2(this.yAt(s + 2.2) - this.yAt(s - 2.2), 4.4);
  }

  // 目前位置的曲率（弧度/公尺，正值=右彎）
  curvatureAt(s) {
    const i = this.segIndex(s);
    return (this.curve[i] * CURVE_UNIT) / TUNING.segLen;
  }

  endState() {
    const i = this.n - 1;
    return { x: this.x[i], y: this.y[i], z: this.z[i], h: this.h[i] };
  }

  // 產生兩條子路徑（下一關的兩個選項）
  // 分岔兩路之間：靠兄弟路那側的地面只鋪到兩路中線，避免蓋住對方的路面
  limitGroundAgainst(sib) {
    const hw = TUNING.roadHalfWidth;
    const k = this.side < 0 ? 1 : 0; // 靠兄弟路的一側（左路的右側 / 右路的左側）
    const lim = Math.min(this.n, 420);
    let lastLimited = -1;
    for (let i = 0; i < lim; i++) {
      let d = Infinity;
      for (let j = Math.max(0, i - 40); j < Math.min(sib.n, i + 40); j++) {
        const dx = sib.x[j] - this.x[i];
        const dz = sib.z[j] - this.z[i];
        const dd = dx * dx + dz * dz;
        if (dd < d) d = dd;
      }
      d = Math.sqrt(d);
      const allowed = Math.max(0, d / 2 - hw - 0.6);
      if (allowed < this.gwSide[k][i]) {
        this.gwSide[k][i] = allowed;
        this.skirt[k][i] = 0;
        lastLimited = i;
      }
    }
    // 限制區結束後平滑恢復，避免地面突然變寬
    for (let i = lastLimited + 1; i < Math.min(this.n, lastLimited + 30); i++) {
      this.gwSide[k][i] = Math.min(this.gwSide[k][i], this.gwSide[k][lastLimited] + (i - lastLimited) * 3);
      this.skirt[k][i] = 0;
    }
  }

  // 移除與任何路面重疊的路邊物件（含自己繞回來的路段、分岔兄弟路）
  pruneAgainst(paths) {
    const segLen = TUNING.segLen;
    const hw = TUNING.roadHalfWidth;
    const pt = {};
    for (let i = 0; i < this.n - 1; i++) {
      const props = this.info[i].props;
      if (!props.length) continue;
      this.info[i].props = props.filter((p) => {
        if (p.type === 'forksign') return true;
        this.pointAt(i * segLen, p.x, pt);
        const rr = (p.r || 1) * (p.scale || 1) + hw + 2.5;
        for (const q of paths) {
          for (let j = 0; j < q.n; j += 2) {
            if (q === this && Math.abs(j - i) < 4) continue;
            const dx = q.x[j] - pt.x;
            const dz = q.z[j] - pt.z;
            if (dx * dx + dz * dz < rr * rr) return false;
          }
        }
        return true;
      });
    }
  }

  spawnChildren() {
    if (this.children || this.kind === 'last') return this.children;
    const opts = nextOptions(this.route);
    if (!opts) return null;
    const end = this.endState();
    const startD = this.startD + this.length;
    const mk = (route, side) => {
      const kind = route.col >= 3 ? 'last' : 'normal';
      return new Path({
        stageId: stageIdOf(route),
        route,
        start: end,
        startD,
        side,
        kind,
        parent: this,
        seed: hashStr(stageIdOf(route) + route.bound + route.col + route.row) ^ (this.id * 977),
      });
    };
    this.children = { L: mk(opts.left, -1), R: mk(opts.right, 1) };
    this.children.L.pruneAgainst([this.children.R]);
    this.children.R.pruneAgainst([this.children.L]);
    this.children.L.limitGroundAgainst(this.children.R);
    this.children.R.limitGroundAgainst(this.children.L);
    return this.children;
  }
}
Path.nextId = 1;

// 分岔張開區的側向位移（相對原中線）
export function forkOffset(side, s) {
  const k = clamp(s / (FORK_SEGS * TUNING.segLen), 0, 1);
  return side * FORK_SPREAD * smooth(k);
}
