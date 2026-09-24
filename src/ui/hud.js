// 比賽 HUD 與觸控按鈕
import { layout, VIEW } from '../config.js';
import { SONGS } from '../audio.js';
import { txt, measure, panel, PIXEL, RACE } from './draw.js';
import { drawCourseMap } from './map.js';
import { ordinal, fmtTime, roundRect, clamp } from '../util.js';

// 各元素的外框（給 DEV 拖曳用）
export const hudRects = {};

function reg(id, x, y, w, h) {
  hudRects[id] = { x, y, w, h };
}

export function drawHUD(ctx, W, H, race, o = {}) {
  const L = layout().hud;
  const t = o.t || 0;
  for (const k in hudRects) delete hudRects[k];

  // TIME
  {
    const e = L.time;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    const tv = Math.ceil(race.time);
    const warn = race.time <= 10 && race.state === 'run';
    const col = warn ? (Math.floor(t * 4) % 2 ? '#ff3a3a' : '#ffffff') : e.color;
    txt(ctx, 'TIME', x, y, { size: 11 * s, align: 'center', color: '#ff9a1f' });
    txt(ctx, String(tv), x, y + 30 * s, { size: 34 * s, align: 'center', color: col, font: RACE, stroke: '#000' });
    reg('time', x - 40 * s, y - 10 * s, 80 * s, 60 * s);
  }
  // SCORE
  {
    const e = L.score;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    txt(ctx, 'SCORE', x, y, { size: 10 * s, color: '#ff9a1f' });
    txt(ctx, String(Math.floor(race.score)).padStart(8, ' '), x, y + 20 * s, { size: 15 * s, color: e.color });
    reg('score', x, y - 10 * s, 130 * s, 42 * s);
  }
  // STAGE
  {
    const e = L.stage;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    txt(ctx, `STAGE ${race.stageNum}`, x, y, { size: 10 * s, color: '#ff9a1f' });
    txt(ctx, race.hudStage.name, x, y + 17 * s, { size: 10 * s, color: e.color });
    reg('stage', x, y - 8 * s, 160 * s, 34 * s);
  }
  // RANK
  {
    const e = L.rank;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    txt(ctx, 'POS', x, y, { size: 10 * s, align: 'right', color: '#ff9a1f' });
    const r = race.rank;
    txt(ctx, ordinal(r), x - 30 * s, y + 24 * s, { size: 26 * s, align: 'right', color: r <= 3 ? '#ffe23a' : e.color, font: RACE, stroke: '#000' });
    txt(ctx, '/8', x, y + 28 * s, { size: 10 * s, align: 'right', color: e.color });
    reg('rank', x - 100 * s, y - 8 * s, 100 * s, 50 * s);
  }
  // LAP
  {
    const e = L.lap;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    txt(ctx, 'LAP ' + fmtTime(race.stageTime), x, y + 10 * s, { size: 9 * s, align: 'right', color: e.color });
    reg('lap', x - 130 * s, y, 130 * s, 20 * s);
  }
  // 進度條
  {
    const e = L.progress;
    const s = e.s;
    const w = Math.min(W * 0.34, 300) * s;
    const x = e.x * W - w / 2;
    const y = e.y * H;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x, y, w, 6 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = e.color;
    const p = race.progress();
    roundRect(ctx, x, y, w * p, 6 * s, 3 * s);
    ctx.fill();
    // 對手位置
    for (const r of race.rivals) {
      if (!r.map || r.map.path !== race.path) continue;
      const end = race.path.kind === 'last' ? race.path.goalSeg : race.path.n - 1;
      const rp = clamp(r.map.s / (end * 5), 0, 1);
      ctx.fillStyle = r.car.color;
      ctx.fillRect(x + w * rp - 2, y - 3 * s, 4, 12 * s);
    }
    txt(ctx, race.path.kind === 'last' ? 'GOAL' : 'FORK', x + w + 6, y + 3 * s, { size: 7 * s, color: '#fff' });
    reg('progress', x, y - 6, w + 40, 18 * s);
  }
  // 速度與轉速
  {
    const e = L.speed;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    const kmh = Math.floor(race.speedKmh);
    const cw = measure(ctx, 'km/h', 10 * s);
    txt(ctx, 'km/h', x, y, { size: 10 * s, align: 'right', color: '#ff9a1f' });
    txt(ctx, String(kmh), x - cw - 8 * s, y - 4 * s, { size: 38 * s, align: 'right', color: e.color, font: RACE, stroke: '#000', italic: true });
    // 轉速條
    const bars = 16;
    const bw = 7 * s;
    for (let i = 0; i < bars; i++) {
      const on = i / bars < race.rpm;
      const bx = x - (bars - i) * (bw + 2 * s);
      const bh = (6 + i * 1.3) * s;
      ctx.fillStyle = on ? (i > 12 ? '#ff3a3a' : i > 9 ? '#ffd21a' : '#4aff6a') : 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, y - 32 * s - bh, bw, bh);
    }
    reg('speed', x - 180 * s, y - 60 * s, 180 * s, 75 * s);
  }
  // 檔位
  {
    const e = L.gear;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    const label = race.trans === 'MT' ? `${race.gear}/${race.gears}` : 'AT ' + race.atGear;
    // 手排到達極限轉速時閃爍提示升檔
    const flash = race.overRev && Math.floor((o.t || 0) * 8) % 2 === 0;
    panel(ctx, x - 78 * s, y - 13 * s, 78 * s, 26 * s, { r: 6, fill: flash ? 'rgba(200,20,20,0.85)' : 'rgba(0,0,0,0.55)', border: e.color });
    txt(ctx, race.trans === 'MT' ? 'GEAR ' + label : label, x - 39 * s, y + 1, { size: (race.trans === 'MT' ? 9 : 11) * s, align: 'center', color: flash ? '#ffffff' : e.color });
    if (race.overRev) txt(ctx, 'SHIFT UP!', x - 39 * s, y - 24 * s, { size: 8 * s, align: 'center', color: '#ff5a3a' });
    reg('gear', x - 78 * s, y - 13 * s, 78 * s, 26 * s);
  }
  // 電台
  {
    const e = L.radio;
    const x = e.x * W;
    const y = e.y * H;
    const s = e.s;
    const song = SONGS[o.songIdx || 0];
    const w = txt(ctx, '♪ ' + song.name, x, y, { size: 8 * s, color: e.color });
    if (!VIEW.isTouch) txt(ctx, 'M: RADIO', x, y - 14 * s, { size: 6 * s, color: 'rgba(255,255,255,0.6)' });
    reg('radio', x, y - 10 * s, w, 20 * s);
    hudRects.radioBtn = { x, y: y - 12 * s, w, h: 24 * s };
  }
  // 迷你地圖
  {
    const e = L.map;
    const s = e.s;
    const w = 150 * s;
    const h = 95 * s;
    const x = e.x * W - w / 2;
    const y = e.y * H - h / 2;
    ctx.globalAlpha = 0.85;
    panel(ctx, x, y, w, h, { r: 8, fill: 'rgba(0,30,80,0.55)', border: 'rgba(255,255,255,0.25)' });
    drawCourseMap(ctx, x, y - h * 0.02, w, h, { history: race.routeHistory, compact: true, t });
    ctx.globalAlpha = 1;
    reg('map', x, y, w, h);
  }
  // 訊息
  {
    const e = L.message;
    const x = e.x * W;
    let y = e.y * H;
    for (const m of race.messages) {
      const a = Math.min(1, m.t * 3, (m.dur - m.t) * 6 + 0.2);
      ctx.globalAlpha = clamp(a, 0, 1);
      const sz = 30 * e.s * m.size;
      const pop = 1 + Math.max(0, 0.3 - (m.dur - m.t)) * 1.5;
      txt(ctx, m.text, x, y, { size: sz * pop, align: 'center', color: m.color, font: RACE, stroke: '#000', strokeW: 5, italic: true });
      y += sz * 1.25;
    }
    ctx.globalAlpha = 1;
    reg('message', x - 150, e.y * H - 25, 300, 50);
  }
  // 倒數
  if (race.state === 'countdown') {
    const n = Math.ceil(race.countdown);
    if (n <= 3 && n >= 1) {
      const f = race.countdown - Math.floor(race.countdown);
      txt(ctx, String(n), W / 2, H * 0.45, { size: 90 * (0.8 + f * 0.5), align: 'center', color: '#ffe23a', font: RACE, stroke: '#a00', strokeW: 8 });
    }
  }
}

// 觸控按鈕（回傳區域給 input 使用）
export function drawTouch(ctx, W, H, race, input) {
  const T = layout().touch;
  const regions = [];
  const draw = (id, label, color, sub) => {
    const c = T[id];
    const x = c.x * W;
    const y = c.y * H;
    const r = c.r * Math.min(W, H);
    const down = input.isTouchDown(id);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = down ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    const symbol = /^[▲▼◀▶]$/.test(label);
    txt(ctx, label, x, y + (sub ? -r * 0.12 : 1), {
      size: symbol ? Math.max(14, r * 0.62) : Math.max(9, r * 0.36),
      align: 'center',
      color,
      shadow: false,
      font: symbol ? 'Arial, "PingFang TC", sans-serif' : undefined,
    });
    if (sub) txt(ctx, sub, x, y + r * 0.35, { size: Math.max(6, r * 0.2), align: 'center', color: '#fff', shadow: false });
    regions.push({ id, x, y, r });
    hudRects['touch_' + id] = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
  };
  if (!input.tiltEnabled) {
    draw('left', '◀', '#ffffff');
    draw('right', '▶', '#ffffff');
  }
  draw('gas', 'GAS', '#4aff6a');
  draw('brake', 'BRK', '#ff5a5a');
  if (race.trans === 'MT') {
    draw('gearUp', '▲', '#ffd21a', String(race.gear));
    draw('gearDown', '▼', '#ffd21a');
  }
  draw('pause', '❚❚', '#ffffff');
  return regions;
}

void PIXEL;
