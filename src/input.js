// 輸入整合：鍵盤、搖桿、觸控按鈕、手機傾斜
import { clamp } from './util.js';

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'gas',
  KeyX: 'brake',
  Space: 'gear',
  ShiftLeft: 'gear',
  ShiftRight: 'gear',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'radio',
  KeyN: 'radioPrev',
  Backspace: 'back',
  KeyC: 'camera',
  KeyV: 'mute',
};

class Input {
  constructor() {
    this.keys = new Set();
    this.steer = 0;
    this.gas = 0;
    this.brake = 0;
    this.events = [];
    this.taps = [];
    this.pointers = new Map();
    this.controls = []; // HUD 提供的觸控按鈕區
    this.touchState = {};
    this.tiltEnabled = false;
    this.tiltValue = 0;
    this.toLogical = (x, y) => ({ x, y });
    this.padPrev = [];
    this.lastSource = 'keyboard';
    this.enabled = true;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      const a = KEYMAP[e.code];
      if (e.code === 'F2' || e.code === 'Backquote') {
        this.events.push('dev');
        e.preventDefault();
        return;
      }
      if (a) {
        e.preventDefault();
        if (!e.repeat) this.events.push(a);
        this.keys.add(a);
        this.lastSource = 'keyboard';
      } else if (!e.repeat && e.key && e.key.length === 1) {
        this.events.push('char:' + e.key.toUpperCase());
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys.delete(a);
    });
    window.addEventListener('blur', () => this.keys.clear());

    const down = (e) => {
      const p = this.toLogical(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, p);
      this.taps.push({ x: p.x, y: p.y, id: e.pointerId });
      this.lastSource = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    };
    const move = (e) => {
      if (!this.pointers.has(e.pointerId)) {
        this.hover = this.toLogical(e.clientX, e.clientY);
        return;
      }
      this.pointers.set(e.pointerId, this.toLogical(e.clientX, e.clientY));
    };
    const up = (e) => {
      this.pointers.delete(e.pointerId);
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      down(e);
    });
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      const landscape = Math.abs(window.orientation || 0) === 90 || window.innerWidth > window.innerHeight;
      let a;
      if (landscape) {
        const sign = (window.orientation || 90) === 90 ? 1 : -1;
        a = (e.beta || 0) * sign;
      } else a = e.gamma;
      this.tiltValue = clamp(a / 22, -1, 1);
    });
  }

  async enableTilt() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      this.tiltEnabled = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  // 觸控按鈕是否被按住
  isTouchDown(id) {
    return !!this.touchState[id];
  }

  update(dt) {
    // 觸控按鈕
    this.touchState = {};
    for (const c of this.controls) {
      for (const p of this.pointers.values()) {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if (dx * dx + dy * dy < (c.r * 1.25) ** 2) this.touchState[c.id] = true;
      }
    }
    // 搖桿
    let padSteer = 0;
    let padGas = 0;
    let padBrake = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.12) padSteer = ax;
      const b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      padGas = Math.max(b(7), b(0));
      padBrake = Math.max(b(6), b(2));
      const map = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'confirm', 1: 'back', 9: 'pause', 3: 'gear', 5: 'gear', 4: 'radio' };
      for (const k in map) {
        const pressed = b(+k) > 0.5;
        if (pressed && !this.padPrev[k]) {
          this.events.push(map[k]);
          this.lastSource = 'pad';
        }
        this.padPrev[k] = pressed;
      }
      if (Math.abs(ax) > 0.6 && !this.padPrev.ax) {
        this.events.push(ax > 0 ? 'right' : 'left');
      }
      this.padPrev.ax = Math.abs(ax) > 0.6;
      if (padGas > 0.1 || Math.abs(padSteer) > 0.2) this.lastSource = 'pad';
      break;
    }

    const k = this.keys;
    const ts = this.touchState;
    let target = (k.has('right') || ts.right ? 1 : 0) - (k.has('left') || ts.left ? 1 : 0);
    let analog = false;
    if (padSteer) {
      target = padSteer;
      analog = true;
    }
    if (this.tiltEnabled && this.lastSource === 'touch' && !ts.left && !ts.right) {
      target = this.tiltValue;
      analog = true;
    }
    if (analog) this.steer = target;
    else {
      const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5;
      if (this.steer < target) this.steer = Math.min(target, this.steer + rate * dt);
      else this.steer = Math.max(target, this.steer - rate * dt);
    }
    this.gas = Math.max(k.has('up') || k.has('gas') || ts.gas ? 1 : 0, padGas);
    this.brake = Math.max(k.has('down') || k.has('brake') || ts.brake ? 1 : 0, padBrake);
    if (ts.gear && !this._gearPrev) this.events.push('gear');
    this._gearPrev = !!ts.gear;
    if (ts.pause && !this._pausePrev) this.events.push('pause');
    this._pausePrev = !!ts.pause;
  }

  // 取出並清空事件
  consume() {
    const e = this.events;
    this.events = [];
    return e;
  }
  consumeTaps() {
    const t = this.taps;
    this.taps = [];
    return t;
  }
}

export const input = new Input();
