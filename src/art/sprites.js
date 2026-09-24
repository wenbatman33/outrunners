// 路邊物件：全部以 Canvas 程式繪製，預先渲染成快取圖
// 每個定義：w/h 畫布像素、world 世界寬度、collide 是否可撞、off 距路邊偏移範圍、draw 繪製函式
import { makeCanvas, mulberry32, shade, ellipse, poly, roundRect, vgrad, rgba } from '../util.js';

// ---- 共用小工具 ----
function blob(ctx, x, y, r, base, rng, n = 7) {
  // 樹叢：多個圓疊成的球狀，帶明暗
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r * 0.55;
    const rr = r * (0.45 + rng() * 0.35);
    ellipse(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 + r * 0.1, rr, rr, shade(base, -0.25));
  }
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * r * 0.45;
    const rr = r * (0.35 + rng() * 0.3);
    ellipse(ctx, x + Math.cos(a) * d - r * 0.1, y + Math.sin(a) * d * 0.7 - r * 0.1, rr, rr, base);
  }
  for (let i = 0; i < 4; i++) {
    const rr = r * (0.18 + rng() * 0.15);
    ellipse(ctx, x - r * 0.3 + rng() * r * 0.4, y - r * 0.35 + rng() * r * 0.3, rr, rr * 0.8, shade(base, 0.25));
  }
}

function trunk(ctx, x0, y0, x1, y1, w0, w1, col) {
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const L = Math.hypot(nx, ny) || 1;
  const ux = nx / L;
  const uy = ny / L;
  poly(ctx, [x0 + ux * w0, y0 + uy * w0, x1 + ux * w1, y1 + uy * w1, x1 - ux * w1, y1 - uy * w1, x0 - ux * w0, y0 - uy * w0], col);
}

function palmFrond(ctx, x, y, ang, len, col, droop = 0.5) {
  const steps = 10;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ang + droop * t * t * Math.sign(Math.cos(ang) || 1);
    pts.push([x + Math.cos(ang) * len * t, y + Math.sin(ang) * len * t + droop * len * 0.55 * t * t]);
  }
  ctx.strokeStyle = shade(col, -0.3);
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.stroke();
  // 葉片
  for (let i = 1; i < steps; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[i + 1];
    const dx = qx - px;
    const dy = qy - py;
    const s = (1 - i / steps) * 22 + 6;
    const nx = -dy;
    const ny = dx;
    const L = Math.hypot(nx, ny) || 1;
    ctx.fillStyle = i % 2 ? col : shade(col, -0.15);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (nx / L) * s + dx * 0.6, py + (ny / L) * s + dy * 0.6 + s * 0.4);
    ctx.lineTo(qx, qy);
    ctx.lineTo(px - (nx / L) * s + dx * 0.6, py - (ny / L) * s + dy * 0.6 + s * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

function windowsGrid(ctx, x, y, w, h, cols, rows, lit, rng, dark = '#2a3450') {
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = rng() < lit;
      ctx.fillStyle = on ? (rng() < 0.2 ? '#ffd27a' : '#ffeaa8') : dark;
      ctx.fillRect(x + c * cw + cw * 0.18, y + r * rh + rh * 0.2, cw * 0.64, rh * 0.55);
    }
  }
}

function text(ctx, str, x, y, size, col, font = 'Racing Sans One, Impact, sans-serif', align = 'center') {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = col;
  ctx.fillText(str, x, y);
}

// ---- 精靈定義 ----
export const SPRITES = {
  palm: {
    w: 260, h: 420, world: 1500, collide: true, off: [1.25, 2.4],
    draw(ctx, w, h, rng) {
      const bx = w * 0.5;
      const lean = (rng() - 0.5) * 70;
      const tx = bx + lean;
      const ty = h * 0.2;
      // 樹幹（有節）
      const segs = 14;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const x0 = bx + (tx - bx) * t0 * t0;
        const x1 = bx + (tx - bx) * t1 * t1;
        const y0 = h - (h - ty) * t0;
        const y1 = h - (h - ty) * t1;
        trunk(ctx, x0, y0, x1, y1 + 2, 13 - t0 * 5, 13 - t1 * 5, i % 2 ? '#8a5a30' : '#a06a3a');
      }
      const cols = ['#2f9a3a', '#3fb048', '#268a32'];
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i / 8 - 0.5) * Math.PI * 1.9 + (rng() - 0.5) * 0.3;
        palmFrond(ctx, tx, ty, a, 95 + rng() * 30, cols[i % 3], 0.9);
      }
      ellipse(ctx, tx, ty + 4, 10, 9, '#6a4a20');
      ellipse(ctx, tx + 8, ty + 10, 7, 7, '#5a3a18');
    },
  },
  lamp: {
    w: 120, h: 400, world: 700, collide: true, off: [1.15, 1.35], nightGlow: true,
    draw(ctx, w, h, rng, night) {
      const x = w * 0.35;
      ctx.fillStyle = '#5a6068';
      ctx.fillRect(x - 5, h * 0.12, 10, h * 0.88);
      ctx.fillRect(x - 12, h - 20, 24, 20);
      ctx.fillRect(x, h * 0.12, w * 0.45, 8);
      roundRect(ctx, x + w * 0.35, h * 0.12 + 4, 34, 14, 5);
      ctx.fillStyle = night ? '#fff6c0' : '#dfe6ee';
      ctx.fill();
      if (night) {
        const g = ctx.createRadialGradient(x + w * 0.35 + 17, h * 0.15, 2, x + w * 0.35 + 17, h * 0.15, 55);
        g.addColorStop(0, 'rgba(255,240,170,0.9)');
        g.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h * 0.4);
      }
    },
  },
  lamp_paris: {
    w: 110, h: 380, world: 650, collide: true, off: [1.15, 1.35],
    draw(ctx, w, h) {
      const x = w / 2;
      ctx.fillStyle = '#1e2a24';
      trunk(ctx, x, h, x, h * 0.2, 9, 4, '#1e2a24');
      ctx.fillRect(x - 16, h - 30, 32, 30);
      ctx.fillRect(x - 30, h * 0.22, 60, 5);
      for (const s of [-1, 1]) {
        poly(ctx, [x + s * 30 - 12, h * 0.2, x + s * 30 + 12, h * 0.2, x + s * 30 + 8, h * 0.1, x + s * 30 - 8, h * 0.1], '#1e2a24');
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(x + s * 30 - 6, h * 0.11, 12, h * 0.08);
      }
      poly(ctx, [x - 10, h * 0.22, x + 10, h * 0.22, x, h * 0.16], '#1e2a24');
    },
  },
  building_low: {
    w: 360, h: 300, world: 3000, collide: true, off: [2.0, 3.0],
    draw(ctx, w, h, rng) {
      const cols = ['#e8d6b0', '#f0c8b8', '#c8dce8', '#e8e0c8'];
      const c = cols[Math.floor(rng() * cols.length)];
      const bh = h * (0.55 + rng() * 0.35);
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(w * 0.82, h - bh + 10, w * 0.14, bh - 10);
      ctx.fillStyle = c;
      ctx.fillRect(w * 0.06, h - bh, w * 0.78, bh);
      ctx.fillStyle = shade(c, -0.4);
      ctx.fillRect(w * 0.04, h - bh - 8, w * 0.82, 10);
      windowsGrid(ctx, w * 0.1, h - bh + 16, w * 0.7, bh - 60, 6, Math.max(2, Math.floor(bh / 45)), 0.2, rng, '#4a6a8a');
      ctx.fillStyle = '#6a4a3a';
      ctx.fillRect(w * 0.4, h - 40, w * 0.12, 40);
    },
  },
  building: {
    w: 300, h: 640, world: 3000, collide: true, off: [2.0, 3.4],
    draw(ctx, w, h, rng) {
      const cols = ['#27304a', '#2f2848', '#1f3a48', '#3a2f3f'];
      const c = cols[Math.floor(rng() * cols.length)];
      const bh = h * (0.6 + rng() * 0.4);
      ctx.fillStyle = shade(c, -0.3);
      ctx.fillRect(w * 0.78, h - bh + 16, w * 0.18, bh - 16);
      ctx.fillStyle = c;
      ctx.fillRect(w * 0.08, h - bh, w * 0.72, bh);
      windowsGrid(ctx, w * 0.12, h - bh + 14, w * 0.64, bh - 30, 6, Math.floor(bh / 26), 0.55, rng, '#141a2a');
      ctx.fillStyle = '#ff3a3a';
      ctx.fillRect(w * 0.43, h - bh - 18, 6, 18);
      ellipse(ctx, w * 0.43 + 3, h - bh - 20, 5, 5, '#ff5050');
    },
  },
  neon: {
    w: 260, h: 380, world: 1700, collide: true, off: [1.35, 2.0],
    draw(ctx, w, h, rng) {
      const words = ['HOTEL', 'BAR', 'CAFE', '夜市', '飯店', '酒家', 'KARAOKE', 'NOODLE'];
      const word = words[Math.floor(rng() * words.length)];
      const cols = ['#ff3ab0', '#3af0ff', '#ffe23a', '#7aff5a', '#ff7a3a'];
      const c = cols[Math.floor(rng() * cols.length)];
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(w / 2 - 6, h * 0.5, 12, h * 0.5);
      roundRect(ctx, w * 0.06, h * 0.08, w * 0.88, h * 0.42, 14);
      ctx.fillStyle = '#10101a';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 18;
      ctx.stroke();
      text(ctx, word, w / 2, h * 0.29, word.length > 5 ? 48 : 70, '#fff', 'Racing Sans One, "PingFang TC", sans-serif');
      ctx.shadowBlur = 0;
    },
  },
  billboard: {
    w: 420, h: 300, world: 2600, collide: true, off: [1.4, 2.2],
    draw(ctx, w, h, rng) {
      const ads = [
        ['OUTRUNNERS', '#ffcc00', '#d8201c'],
        ['TURBO OIL', '#1a4ad8', '#ffffff'],
        ['SUNSET FM', '#ff5a2a', '#fff3a0'],
        ['BLUE SKY', '#27a4f2', '#ffffff'],
        ['GO WEST!', '#1d8a3a', '#fff'],
        ['1992', '#111', '#ffcc00'],
      ];
      const [t, bg, fg] = ads[Math.floor(rng() * ads.length)];
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(w * 0.2, h * 0.55, 12, h * 0.45);
      ctx.fillRect(w * 0.78, h * 0.55, 12, h * 0.45);
      ctx.fillStyle = '#eee';
      ctx.fillRect(w * 0.03, h * 0.02, w * 0.94, h * 0.58);
      ctx.fillStyle = bg;
      ctx.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.5);
      ctx.fillStyle = rgba('#ffffff', 0.18);
      poly(ctx, [w * 0.06, h * 0.06, w * 0.5, h * 0.06, w * 0.3, h * 0.56, w * 0.06, h * 0.56]);
      ctx.fill();
      text(ctx, t, w / 2, h * 0.31, t.length > 8 ? 58 : 72, fg);
    },
  },
  bush: {
    w: 200, h: 120, world: 900, collide: false, off: [1.2, 2.6],
    draw(ctx, w, h, rng, night, stage) {
      const base = stage && stage.near ? shade(stage.near, 0.05) : '#3e9a3e';
      blob(ctx, w * 0.35, h * 0.62, h * 0.42, base, rng, 6);
      blob(ctx, w * 0.62, h * 0.58, h * 0.46, shade(base, 0.08), rng, 6);
    },
  },
  hut: {
    w: 320, h: 260, world: 2200, collide: true, off: [1.8, 2.6],
    draw(ctx, w, h) {
      ctx.fillStyle = '#b8864a';
      ctx.fillRect(w * 0.18, h * 0.45, w * 0.64, h * 0.55);
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(w * 0.44, h * 0.62, w * 0.14, h * 0.38);
      ctx.fillRect(w * 0.24, h * 0.58, w * 0.12, h * 0.12);
      ctx.fillRect(w * 0.66, h * 0.58, w * 0.12, h * 0.12);
      poly(ctx, [w * 0.02, h * 0.5, w * 0.5, h * 0.05, w * 0.98, h * 0.5], '#d8b458');
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = '#a8883a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.06);
        ctx.lineTo(w * 0.04 + (i / 13) * w * 0.92, h * 0.5);
        ctx.stroke();
      }
    },
  },
  surfboard: {
    w: 120, h: 260, world: 700, collide: true, off: [1.2, 1.6],
    draw(ctx, w, h, rng) {
      const cols = ['#ff5a3a', '#3ac8ff', '#ffd23a', '#ff4ab0'];
      const c = cols[Math.floor(rng() * cols.length)];
      ctx.save();
      ctx.translate(w / 2, h * 0.55);
      ctx.rotate(0.12);
      ellipse(ctx, 0, 0, w * 0.3, h * 0.45, c);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -h * 0.4, 6, h * 0.8);
      ctx.restore();
      ellipse(ctx, w / 2, h * 0.98, w * 0.3, 5, 'rgba(0,0,0,0.25)');
    },
  },
  tiki: {
    w: 120, h: 300, world: 700, collide: true, off: [1.25, 1.8],
    draw(ctx, w, h) {
      const x = w * 0.2;
      ctx.fillStyle = '#7a4a28';
      ctx.fillRect(x, h * 0.05, w * 0.6, h * 0.95);
      for (let i = 0; i < 3; i++) {
        const y = h * (0.1 + i * 0.3);
        ctx.fillStyle = '#5a321a';
        ctx.fillRect(x, y + h * 0.22, w * 0.6, 6);
        ctx.fillStyle = '#f0e6c8';
        ellipse(ctx, x + w * 0.15, y + h * 0.07, 8, 7, '#f0e6c8');
        ellipse(ctx, x + w * 0.45, y + h * 0.07, 8, 7, '#f0e6c8');
        ellipse(ctx, x + w * 0.15, y + h * 0.07, 3, 3, '#000');
        ellipse(ctx, x + w * 0.45, y + h * 0.07, 3, 3, '#000');
        ctx.fillStyle = '#3a200e';
        ctx.fillRect(x + w * 0.1, y + h * 0.15, w * 0.4, 8);
      }
    },
  },
  hibiscus: {
    w: 200, h: 130, world: 950, collide: false, off: [1.2, 2.2],
    draw(ctx, w, h, rng) {
      blob(ctx, w * 0.5, h * 0.6, h * 0.45, '#2f8a3a', rng, 8);
      for (let i = 0; i < 9; i++) {
        const x = w * 0.2 + rng() * w * 0.6;
        const y = h * 0.3 + rng() * h * 0.45;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          ellipse(ctx, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 6, 6, i % 2 ? '#ff3a5a' : '#ffb020');
        }
        ellipse(ctx, x, y, 3, 3, '#ffe');
      }
    },
  },
  moai: {
    w: 200, h: 380, world: 1300, collide: true, off: [1.5, 2.6],
    draw(ctx, w, h) {
      const c = '#8a8078';
      poly(ctx, [w * 0.25, h, w * 0.75, h, w * 0.72, h * 0.42, w * 0.28, h * 0.42], shade(c, -0.1));
      // 頭部
      poly(ctx, [w * 0.24, h * 0.45, w * 0.76, h * 0.45, w * 0.78, h * 0.12, w * 0.7, h * 0.03, w * 0.3, h * 0.03, w * 0.22, h * 0.12], c);
      ctx.fillStyle = shade(c, -0.35);
      ctx.fillRect(w * 0.26, h * 0.13, w * 0.48, h * 0.05);
      poly(ctx, [w * 0.46, h * 0.16, w * 0.54, h * 0.16, w * 0.6, h * 0.3, w * 0.4, h * 0.3], shade(c, 0.12));
      ctx.fillStyle = shade(c, -0.4);
      ctx.fillRect(w * 0.36, h * 0.35, w * 0.28, h * 0.02);
      ctx.fillRect(w * 0.18, h * 0.12, w * 0.06, h * 0.18);
      ctx.fillRect(w * 0.76, h * 0.12, w * 0.06, h * 0.18);
      ctx.fillStyle = rgba('#000000', 0.12);
      ctx.fillRect(w * 0.6, h * 0.03, w * 0.18, h * 0.97);
      // 紅帽
      ellipse(ctx, w / 2, h * 0.03, w * 0.22, h * 0.035, '#a8503a');
    },
  },
  rock: {
    w: 220, h: 150, world: 1100, collide: true, off: [1.25, 2.4],
    draw(ctx, w, h, rng, night, stage) {
      const c = stage && stage.landmark === 'kilimanjaro' ? '#8a7058' : '#8a8a86';
      poly(ctx, [w * 0.05, h, w * 0.12, h * 0.45, w * 0.35, h * 0.12, w * 0.62, h * 0.08, w * 0.85, h * 0.35, w * 0.96, h], c);
      poly(ctx, [w * 0.35, h * 0.12, w * 0.62, h * 0.08, w * 0.85, h * 0.35, w * 0.55, h * 0.4], shade(c, 0.2));
      poly(ctx, [w * 0.55, h * 0.4, w * 0.85, h * 0.35, w * 0.96, h, w * 0.6, h], shade(c, -0.25));
    },
  },
  rock_red: {
    w: 300, h: 260, world: 1800, collide: true, off: [1.4, 2.8],
    draw(ctx, w, h) {
      const c = '#c0602e';
      poly(ctx, [w * 0.1, h, w * 0.18, h * 0.25, w * 0.3, h * 0.08, w * 0.72, h * 0.06, w * 0.84, h * 0.3, w * 0.9, h], c);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? shade(c, -0.15) : shade(c, 0.1);
        ctx.fillRect(w * 0.14, h * (0.25 + i * 0.15), w * 0.74, h * 0.07);
      }
      poly(ctx, [w * 0.62, h * 0.06, w * 0.72, h * 0.06, w * 0.84, h * 0.3, w * 0.9, h, w * 0.7, h], rgba('#000000', 0.18));
    },
  },
  saguaro: {
    w: 200, h: 360, world: 1000, collide: true, off: [1.25, 2.6],
    draw(ctx, w, h) {
      const c = '#3f8a3a';
      const arm = (x, y0, y1, dir) => {
        ctx.fillStyle = c;
        roundRect(ctx, x, y1, 26, y0 - y1, 13);
        ctx.fill();
        roundRect(ctx, dir > 0 ? x : x - 30 + 26, y0 - 20, 56, 26, 13);
        ctx.fill();
      };
      arm(w * 0.12, h * 0.6, h * 0.3, 1);
      arm(w * 0.74, h * 0.52, h * 0.22, -1);
      ctx.fillStyle = c;
      roundRect(ctx, w * 0.38, h * 0.05, w * 0.24, h * 0.95, w * 0.12);
      ctx.fill();
      ctx.fillStyle = shade(c, 0.2);
      ctx.fillRect(w * 0.43, h * 0.1, 6, h * 0.88);
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(w * 0.54, h * 0.1, 6, h * 0.88);
    },
  },
  cactus: {
    w: 160, h: 140, world: 800, collide: true, off: [1.2, 2.2],
    draw(ctx, w, h, rng) {
      for (let i = 0; i < 3; i++) {
        const x = w * (0.25 + i * 0.25);
        const r = 22 + rng() * 12;
        ellipse(ctx, x, h - r, r * 0.8, r, i === 1 ? '#5aa83f' : '#4a9635');
        ellipse(ctx, x - r * 0.3, h - r * 1.2, r * 0.2, r * 0.4, '#7ac85a');
      }
      ellipse(ctx, w * 0.5, h * 0.3, 7, 7, '#ff5a8a');
    },
  },
  cherry: {
    w: 300, h: 340, world: 1600, collide: true, off: [1.3, 2.4],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2 + 5, h * 0.45, 14, 8, '#5a3a2e');
      trunk(ctx, w / 2 + 3, h * 0.6, w * 0.3, h * 0.35, 6, 3, '#5a3a2e');
      trunk(ctx, w / 2 + 3, h * 0.55, w * 0.72, h * 0.32, 6, 3, '#5a3a2e');
      blob(ctx, w * 0.5, h * 0.32, h * 0.26, '#ffb8d0', rng, 10);
      blob(ctx, w * 0.28, h * 0.4, h * 0.18, '#ffc6da', rng, 6);
      blob(ctx, w * 0.72, h * 0.38, h * 0.19, '#ffaecb', rng, 6);
    },
  },
  torii: {
    w: 360, h: 320, world: 2600, collide: true, off: [1.35, 1.6],
    draw(ctx, w, h) {
      const c = '#e0401e';
      ctx.fillStyle = c;
      ctx.fillRect(w * 0.18, h * 0.2, 22, h * 0.8);
      ctx.fillRect(w * 0.76, h * 0.2, 22, h * 0.8);
      ctx.fillRect(w * 0.1, h * 0.3, w * 0.8, 16);
      poly(ctx, [0, h * 0.1, w, h * 0.1, w * 0.95, h * 0.2, w * 0.05, h * 0.2], '#222');
      poly(ctx, [w * 0.03, h * 0.14, w * 0.97, h * 0.14, w * 0.94, h * 0.22, w * 0.06, h * 0.22], c);
      ctx.fillStyle = '#222';
      ctx.fillRect(w * 0.17, h * 0.93, 26, h * 0.07);
      ctx.fillRect(w * 0.75, h * 0.93, 26, h * 0.07);
    },
  },
  lantern: {
    w: 100, h: 220, world: 560, collide: true, off: [1.15, 1.45],
    draw(ctx, w, h) {
      const c = '#9a9a94';
      ctx.fillStyle = c;
      ctx.fillRect(w * 0.4, h * 0.55, w * 0.2, h * 0.45);
      ctx.fillRect(w * 0.2, h * 0.92, w * 0.6, h * 0.08);
      ctx.fillRect(w * 0.25, h * 0.5, w * 0.5, h * 0.06);
      ctx.fillRect(w * 0.28, h * 0.3, w * 0.44, h * 0.2);
      ctx.fillStyle = '#ffd88a';
      ctx.fillRect(w * 0.36, h * 0.34, w * 0.28, h * 0.12);
      poly(ctx, [w * 0.08, h * 0.3, w * 0.92, h * 0.3, w * 0.5, h * 0.14], shade(c, -0.2));
      ellipse(ctx, w / 2, h * 0.13, 7, 7, c);
    },
  },
  pagoda: {
    w: 240, h: 460, world: 2200, collide: true, off: [1.9, 2.8],
    draw(ctx, w, h) {
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const bw = w * (0.62 - t * 0.35);
        const y = h - (i + 1) * h * 0.16;
        ctx.fillStyle = '#c8402a';
        ctx.fillRect(w / 2 - bw * 0.4, y + 10, bw * 0.8, h * 0.16 - 10);
        ctx.fillStyle = '#f0d8a0';
        ctx.fillRect(w / 2 - bw * 0.1, y + 18, bw * 0.2, h * 0.1);
        poly(ctx, [w / 2 - bw * 0.7, y + 14, w / 2 + bw * 0.7, y + 14, w / 2 + bw * 0.45, y - 4, w / 2 - bw * 0.45, y - 4], '#2f3a3a');
      }
      ctx.fillStyle = '#b89a3a';
      ctx.fillRect(w / 2 - 3, h * 0.02, 6, h * 0.18);
    },
  },
  eucalyptus: {
    w: 260, h: 420, world: 1600, collide: true, off: [1.3, 2.6],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2 - 10, h * 0.3, 11, 5, '#e8e0d0');
      trunk(ctx, w / 2 - 5, h * 0.55, w * 0.72, h * 0.25, 5, 2, '#d8d0c0');
      blob(ctx, w * 0.45, h * 0.26, h * 0.18, '#6f9a6a', rng, 8);
      blob(ctx, w * 0.7, h * 0.22, h * 0.13, '#7aa874', rng, 6);
      blob(ctx, w * 0.3, h * 0.36, h * 0.12, '#628f5e', rng, 6);
    },
  },
  kangaroo: {
    w: 220, h: 220, world: 900, collide: true, off: [1.2, 1.4],
    draw(ctx, w, h) {
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(w / 2 - 5, h * 0.55, 10, h * 0.45);
      ctx.save();
      ctx.translate(w / 2, h * 0.32);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#222';
      ctx.fillRect(-58, -58, 116, 116);
      ctx.fillStyle = '#ffd200';
      ctx.fillRect(-52, -52, 104, 104);
      ctx.restore();
      // 袋鼠剪影
      ctx.fillStyle = '#111';
      ellipse(ctx, w / 2, h * 0.34, 18, 12, '#111');
      ellipse(ctx, w / 2 + 16, h * 0.24, 7, 6, '#111');
      trunk(ctx, w / 2 - 14, h * 0.36, w / 2 - 36, h * 0.44, 5, 2, '#111');
      trunk(ctx, w / 2 + 2, h * 0.4, w / 2 + 12, h * 0.46, 4, 3, '#111');
    },
  },
  bamboo: {
    w: 200, h: 460, world: 1100, collide: true, off: [1.2, 2.2],
    draw(ctx, w, h, rng) {
      for (let i = 0; i < 6; i++) {
        const x = w * (0.2 + rng() * 0.6);
        const top = h * (0.05 + rng() * 0.2);
        const c = i % 2 ? '#6ab43a' : '#58a032';
        ctx.fillStyle = c;
        ctx.fillRect(x - 5, top, 10, h - top);
        for (let y = h - 40; y > top; y -= 40) {
          ctx.fillStyle = shade(c, -0.3);
          ctx.fillRect(x - 6, y, 12, 3);
        }
        for (let k = 0; k < 4; k++) {
          const ly = top + rng() * (h - top) * 0.6;
          const dir = rng() < 0.5 ? -1 : 1;
          poly(ctx, [x, ly, x + dir * 40, ly + 8, x + dir * 36, ly + 16], '#4a9a2a');
        }
      }
    },
  },
  panda: {
    w: 200, h: 180, world: 900, collide: true, off: [1.3, 1.9],
    draw(ctx, w, h) {
      ellipse(ctx, w / 2, h * 0.68, w * 0.3, h * 0.3, '#fafafa');
      ellipse(ctx, w / 2, h * 0.3, w * 0.22, h * 0.2, '#fafafa');
      ellipse(ctx, w * 0.34, h * 0.14, 16, 16, '#111');
      ellipse(ctx, w * 0.66, h * 0.14, 16, 16, '#111');
      ellipse(ctx, w * 0.41, h * 0.3, 11, 14, '#111');
      ellipse(ctx, w * 0.59, h * 0.3, 11, 14, '#111');
      ellipse(ctx, w * 0.41, h * 0.3, 4, 4, '#fff');
      ellipse(ctx, w * 0.59, h * 0.3, 4, 4, '#fff');
      ellipse(ctx, w / 2, h * 0.39, 7, 5, '#111');
      ellipse(ctx, w * 0.26, h * 0.62, 18, 30, '#111');
      ellipse(ctx, w * 0.74, h * 0.62, 18, 30, '#111');
      ellipse(ctx, w * 0.32, h * 0.92, 26, 14, '#111');
      ellipse(ctx, w * 0.68, h * 0.92, 26, 14, '#111');
      trunk(ctx, w * 0.78, h * 0.5, w * 0.95, h * 0.1, 4, 3, '#6ab43a');
    },
  },
  acacia: {
    w: 400, h: 320, world: 2400, collide: true, off: [1.5, 3.0],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2 - 10, h * 0.35, 12, 7, '#4a3222');
      trunk(ctx, w / 2 - 8, h * 0.5, w * 0.28, h * 0.25, 7, 4, '#4a3222');
      trunk(ctx, w / 2 - 6, h * 0.45, w * 0.72, h * 0.22, 7, 4, '#4a3222');
      const c = '#5a7a2a';
      for (let i = 0; i < 12; i++) {
        ellipse(ctx, w * (0.12 + rng() * 0.76), h * (0.18 + rng() * 0.08), w * (0.09 + rng() * 0.06), h * 0.06, i % 2 ? c : shade(c, -0.15));
      }
      ellipse(ctx, w / 2, h * 0.14, w * 0.4, h * 0.06, shade(c, 0.12));
    },
  },
  elephant: {
    w: 360, h: 280, world: 2200, collide: true, off: [1.8, 2.8],
    draw(ctx, w, h) {
      const c = '#8a8690';
      ellipse(ctx, w * 0.5, h * 0.48, w * 0.3, h * 0.26, c);
      for (const lx of [0.3, 0.42, 0.58, 0.68]) {
        ctx.fillStyle = shade(c, lx < 0.5 ? -0.1 : -0.2);
        ctx.fillRect(w * lx - 16, h * 0.55, 32, h * 0.45);
      }
      ellipse(ctx, w * 0.8, h * 0.38, w * 0.12, h * 0.15, c);
      ellipse(ctx, w * 0.74, h * 0.38, w * 0.08, h * 0.17, shade(c, -0.12));
      trunk(ctx, w * 0.88, h * 0.42, w * 0.92, h * 0.85, 12, 7, c);
      poly(ctx, [w * 0.86, h * 0.5, w * 0.95, h * 0.6, w * 0.87, h * 0.54], '#fffbe8');
      ellipse(ctx, w * 0.83, h * 0.33, 4, 4, '#111');
      trunk(ctx, w * 0.21, h * 0.4, w * 0.16, h * 0.62, 3, 2, c);
    },
  },
  giraffe: {
    w: 240, h: 440, world: 1500, collide: true, off: [1.6, 2.8],
    draw(ctx, w, h, rng) {
      const c = '#e8b04a';
      ellipse(ctx, w * 0.45, h * 0.58, w * 0.25, h * 0.1, c);
      for (const lx of [0.28, 0.36, 0.54, 0.62]) {
        ctx.fillStyle = shade(c, -0.1);
        ctx.fillRect(w * lx - 7, h * 0.6, 14, h * 0.4);
      }
      trunk(ctx, w * 0.62, h * 0.55, w * 0.78, h * 0.12, 16, 10, c);
      ellipse(ctx, w * 0.82, h * 0.1, 24, 14, c);
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(w * 0.76, h * 0.02, 4, 16);
      ctx.fillRect(w * 0.84, h * 0.02, 4, 16);
      for (let i = 0; i < 26; i++) {
        const t = rng();
        const x = i < 14 ? w * (0.25 + rng() * 0.4) : w * (0.64 + t * 0.14);
        const y = i < 14 ? h * (0.52 + rng() * 0.1) : h * (0.5 - t * 0.35);
        ctx.fillStyle = '#9a5a22';
        ctx.fillRect(x - 5, y - 4, 10, 8);
      }
    },
  },
  camel: {
    w: 320, h: 280, world: 1800, collide: true, off: [1.5, 2.6],
    draw(ctx, w, h) {
      const c = '#c8904a';
      ellipse(ctx, w * 0.45, h * 0.46, w * 0.25, h * 0.14, c);
      ellipse(ctx, w * 0.36, h * 0.32, w * 0.1, h * 0.12, c);
      ellipse(ctx, w * 0.56, h * 0.33, w * 0.09, h * 0.1, c);
      for (const lx of [0.28, 0.36, 0.54, 0.62]) {
        ctx.fillStyle = shade(c, -0.12);
        ctx.fillRect(w * lx - 7, h * 0.52, 14, h * 0.48);
      }
      trunk(ctx, w * 0.68, h * 0.45, w * 0.82, h * 0.2, 13, 9, c);
      ellipse(ctx, w * 0.87, h * 0.2, 26, 14, c);
      // 鞍毯
      ctx.fillStyle = '#c02a2a';
      ctx.fillRect(w * 0.4, h * 0.3, w * 0.12, h * 0.2);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(w * 0.4, h * 0.48, w * 0.12, 6);
    },
  },
  pyramid_small: {
    w: 400, h: 260, world: 3200, collide: true, off: [2.2, 3.4],
    draw(ctx, w, h) {
      poly(ctx, [0, h, w * 0.5, 0, w * 0.62, h], '#e8c070');
      poly(ctx, [w * 0.5, 0, w, h, w * 0.62, h], '#b88a48');
      ctx.strokeStyle = rgba('#7a5a2a', 0.35);
      for (let i = 1; i < 10; i++) {
        const y = (h * i) / 10;
        ctx.beginPath();
        ctx.moveTo(w * 0.5 * (1 - y / h), y);
        ctx.lineTo(w - w * 0.5 * (1 - y / h), y);
        ctx.stroke();
      }
    },
  },
  obelisk: {
    w: 100, h: 420, world: 700, collide: true, off: [1.3, 2.0],
    draw(ctx, w, h) {
      poly(ctx, [w * 0.3, h, w * 0.37, h * 0.12, w * 0.63, h * 0.12, w * 0.7, h], '#d8b070');
      poly(ctx, [w * 0.5, h * 0.12, w * 0.63, h * 0.12, w * 0.7, h, w * 0.5, h], '#b8904e');
      poly(ctx, [w * 0.37, h * 0.12, w * 0.63, h * 0.12, w * 0.5, h * 0.02], '#ffd86a');
      ctx.fillStyle = '#8a6a3a';
      for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.45, h * (0.2 + i * 0.09), w * 0.1, 8);
    },
  },
  house_white: {
    w: 360, h: 320, world: 2600, collide: true, off: [1.9, 2.8],
    draw(ctx, w, h, rng) {
      ctx.fillStyle = '#f6f6f2';
      ctx.fillRect(w * 0.08, h * 0.35, w * 0.6, h * 0.65);
      ctx.fillStyle = '#e2e2dc';
      ctx.fillRect(w * 0.55, h * 0.55, w * 0.38, h * 0.45);
      // 藍頂
      ctx.beginPath();
      ctx.arc(w * 0.38, h * 0.36, w * 0.18, Math.PI, 0);
      ctx.fillStyle = '#1e5ad8';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(w * 0.37, h * 0.1, 5, h * 0.08);
      ctx.fillRect(w * 0.35, h * 0.12, 13, 4);
      ctx.fillStyle = '#1e5ad8';
      ctx.fillRect(w * 0.18, h * 0.5, w * 0.1, h * 0.14);
      ctx.fillRect(w * 0.44, h * 0.5, w * 0.1, h * 0.14);
      ctx.fillRect(w * 0.3, h * 0.74, w * 0.12, h * 0.26);
      ctx.fillRect(w * 0.68, h * 0.66, w * 0.1, h * 0.12);
      if (rng() < 0.5) {
        ellipse(ctx, w * 0.88, h * 0.52, 18, 16, '#e0409a');
      }
    },
  },
  olive: {
    w: 260, h: 240, world: 1400, collide: true, off: [1.3, 2.6],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2 - 12, h * 0.45, 16, 9, '#6a5a44');
      blob(ctx, w / 2, h * 0.36, h * 0.3, '#8a9a5a', rng, 10);
    },
  },
  cypress: {
    w: 120, h: 440, world: 700, collide: true, off: [1.2, 2.2],
    draw(ctx, w, h, rng) {
      ctx.fillStyle = '#5a3a2a';
      ctx.fillRect(w / 2 - 5, h * 0.9, 10, h * 0.1);
      const c = '#2a5a2e';
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.quadraticCurveTo(w * 0.95, h * 0.55, w / 2, h * 0.93);
      ctx.quadraticCurveTo(w * 0.05, h * 0.55, w / 2, 0);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.04);
      ctx.quadraticCurveTo(w * 0.2, h * 0.5, w / 2, h * 0.9);
      ctx.quadraticCurveTo(w * 0.35, h * 0.5, w / 2, h * 0.04);
      ctx.fillStyle = shade(c, 0.15);
      ctx.fill();
    },
  },
  column: {
    w: 120, h: 380, world: 800, collide: true, off: [1.3, 2.2],
    draw(ctx, w, h) {
      ctx.fillStyle = '#f0eadc';
      ctx.fillRect(w * 0.25, h * 0.08, w * 0.5, h * 0.84);
      ctx.fillStyle = '#d8d0c0';
      for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.3 + i * 0.12), h * 0.1, 4, h * 0.8);
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(w * 0.12, h * 0.02, w * 0.76, h * 0.07);
      ctx.fillRect(w * 0.15, h * 0.92, w * 0.7, h * 0.08);
    },
  },
  pine: {
    w: 220, h: 420, world: 1200, collide: true, off: [1.25, 2.6],
    draw(ctx, w, h, rng) {
      ctx.fillStyle = '#5a3a24';
      ctx.fillRect(w / 2 - 9, h * 0.8, 18, h * 0.2);
      const c = '#1f6a3a';
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        const y = h * (0.82 - t * 0.17);
        const bw = w * (0.5 - t * 0.08);
        poly(ctx, [w / 2 - bw, y, w / 2 + bw, y, w / 2, y - h * 0.28], i % 2 ? c : shade(c, 0.08));
        poly(ctx, [w / 2 + bw, y, w / 2, y - h * 0.28, w / 2 + bw * 0.25, y], shade(c, -0.2));
      }
    },
  },
  pine_snow: {
    w: 220, h: 420, world: 1200, collide: true, off: [1.25, 2.6],
    draw(ctx, w, h) {
      ctx.fillStyle = '#4a3222';
      ctx.fillRect(w / 2 - 9, h * 0.8, 18, h * 0.2);
      const c = '#1c4a38';
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        const y = h * (0.82 - t * 0.17);
        const bw = w * (0.5 - t * 0.08);
        poly(ctx, [w / 2 - bw, y, w / 2 + bw, y, w / 2, y - h * 0.28], c);
        poly(ctx, [w / 2 - bw * 0.85, y - 4, w / 2 - bw * 0.1, y - h * 0.18, w / 2, y - h * 0.28, w / 2 + bw * 0.5, y - h * 0.1, w / 2 + bw * 0.85, y - 6, w / 2, y - h * 0.06], '#f2f6ff');
      }
    },
  },
  reindeer: {
    w: 280, h: 280, world: 1400, collide: true, off: [1.5, 2.4],
    draw(ctx, w, h) {
      const c = '#8a5a3a';
      ellipse(ctx, w * 0.45, h * 0.55, w * 0.24, h * 0.12, c);
      for (const lx of [0.28, 0.36, 0.54, 0.62]) {
        ctx.fillStyle = shade(c, -0.15);
        ctx.fillRect(w * lx - 6, h * 0.58, 12, h * 0.42);
      }
      trunk(ctx, w * 0.64, h * 0.52, w * 0.74, h * 0.32, 12, 9, c);
      ellipse(ctx, w * 0.8, h * 0.3, 22, 13, c);
      ellipse(ctx, w * 0.9, h * 0.31, 7, 7, '#ff2020');
      ctx.strokeStyle = '#d8c8a0';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(w * 0.76, h * 0.24);
      ctx.lineTo(w * 0.68, h * 0.06);
      ctx.moveTo(w * 0.72, h * 0.15);
      ctx.lineTo(w * 0.6, h * 0.1);
      ctx.moveTo(w * 0.8, h * 0.24);
      ctx.lineTo(w * 0.88, h * 0.05);
      ctx.moveTo(w * 0.84, h * 0.14);
      ctx.lineTo(w * 0.95, h * 0.1);
      ctx.stroke();
      ellipse(ctx, w * 0.45, h * 0.62, w * 0.2, h * 0.04, rgba('#ffffff', 0.4));
    },
  },
  igloo: {
    w: 300, h: 180, world: 1800, collide: true, off: [1.7, 2.6],
    draw(ctx, w, h) {
      ctx.beginPath();
      ctx.ellipse(w / 2, h, w * 0.45, h * 0.95, 0, Math.PI, 0);
      ctx.fillStyle = '#eef4ff';
      ctx.fill();
      ctx.strokeStyle = '#b8c8e0';
      ctx.lineWidth = 2;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h, w * 0.45, h * 0.95 * (1 - i / 5), 0, Math.PI, 0);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(w * 0.3, h, w * 0.1, h * 0.35, 0, Math.PI, 0);
      ctx.fillStyle = '#304060';
      ctx.fill();
    },
  },
  snowman: {
    w: 140, h: 220, world: 700, collide: true, off: [1.2, 1.9],
    draw(ctx, w, h) {
      ellipse(ctx, w / 2, h * 0.76, w * 0.38, h * 0.22, '#f4f8ff');
      ellipse(ctx, w / 2, h * 0.44, w * 0.28, h * 0.16, '#f8fbff');
      ellipse(ctx, w / 2, h * 0.2, w * 0.2, h * 0.12, '#fff');
      ctx.fillStyle = '#222';
      ctx.fillRect(w * 0.32, h * 0.04, w * 0.36, h * 0.05);
      ctx.fillRect(w * 0.38, 0, w * 0.24, h * 0.07);
      ellipse(ctx, w * 0.43, h * 0.18, 3, 3, '#111');
      ellipse(ctx, w * 0.57, h * 0.18, 3, 3, '#111');
      poly(ctx, [w * 0.5, h * 0.21, w * 0.5, h * 0.24, w * 0.66, h * 0.23], '#ff8a1a');
      ctx.fillStyle = '#d02828';
      ctx.fillRect(w * 0.3, h * 0.29, w * 0.4, h * 0.04);
    },
  },
  house_ru: {
    w: 280, h: 340, world: 2200, collide: true, off: [1.9, 2.8],
    draw(ctx, w, h) {
      ctx.fillStyle = '#a8503a';
      ctx.fillRect(w * 0.15, h * 0.5, w * 0.7, h * 0.5);
      ctx.fillStyle = '#f0e6d0';
      ctx.fillRect(w * 0.3, h * 0.62, w * 0.14, h * 0.14);
      ctx.fillRect(w * 0.56, h * 0.62, w * 0.14, h * 0.14);
      // 洋蔥頂
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.08);
      ctx.bezierCurveTo(w * 0.62, h * 0.2, w * 0.74, h * 0.28, w * 0.66, h * 0.4);
      ctx.lineTo(w * 0.34, h * 0.4);
      ctx.bezierCurveTo(w * 0.26, h * 0.28, w * 0.38, h * 0.2, w / 2, h * 0.08);
      ctx.fillStyle = '#2a8a5a';
      ctx.fill();
      ctx.fillStyle = '#f0e6d0';
      ctx.fillRect(w * 0.36, h * 0.4, w * 0.28, h * 0.1);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(w / 2 - 2, 0, 4, h * 0.09);
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(w * 0.12, h * 0.47, w * 0.76, 8);
    },
  },
  jungle: {
    w: 300, h: 380, world: 1800, collide: true, off: [1.3, 2.8],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2 + 8, h * 0.35, 13, 8, '#5a4028');
      blob(ctx, w / 2, h * 0.3, h * 0.25, '#2a8a36', rng, 10);
      for (let i = 0; i < 6; i++) {
        palmFrond(ctx, w / 2, h * 0.65, Math.PI + (i / 5) * Math.PI * -1 + Math.PI, 70, '#3aa048', 0.6);
      }
    },
  },
  totem: {
    w: 140, h: 360, world: 900, collide: true, off: [1.3, 2.0],
    draw(ctx, w, h) {
      const bw = w * 0.6;
      const x = (w - bw) / 2;
      const cols = ['#c8a050', '#b04a2a', '#3a8a6a'];
      for (let i = 0; i < 4; i++) {
        const y = h * (0.1 + i * 0.225);
        ctx.fillStyle = cols[i % 3];
        ctx.fillRect(x, y, bw, h * 0.225);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + bw * 0.15, y + h * 0.05, bw * 0.22, h * 0.04);
        ctx.fillRect(x + bw * 0.63, y + h * 0.05, bw * 0.22, h * 0.04);
        ctx.fillRect(x + bw * 0.3, y + h * 0.14, bw * 0.4, h * 0.03);
      }
      poly(ctx, [0, h * 0.14, w, h * 0.14, w / 2, h * 0.02], '#c8a050');
    },
  },
  flamingo: {
    w: 160, h: 300, world: 800, collide: true, off: [1.4, 2.4],
    draw(ctx, w, h) {
      const c = '#ff7ab0';
      ctx.fillStyle = '#e0608a';
      ctx.fillRect(w * 0.45, h * 0.55, 4, h * 0.45);
      trunk(ctx, w * 0.5, h * 0.55, w * 0.62, h * 0.78, 2, 2, '#e0608a');
      ellipse(ctx, w * 0.45, h * 0.48, w * 0.28, h * 0.1, c);
      ctx.strokeStyle = c;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(w * 0.62, h * 0.45);
      ctx.bezierCurveTo(w * 0.85, h * 0.3, w * 0.5, h * 0.2, w * 0.66, h * 0.08);
      ctx.stroke();
      ellipse(ctx, w * 0.68, h * 0.08, 10, 9, c);
      poly(ctx, [w * 0.72, h * 0.07, w * 0.86, h * 0.11, w * 0.74, h * 0.12], '#222');
    },
  },
  maple: {
    w: 280, h: 340, world: 1600, collide: true, off: [1.3, 2.6],
    draw(ctx, w, h, rng) {
      trunk(ctx, w / 2, h, w / 2, h * 0.45, 13, 7, '#5a3a24');
      const cols = ['#e04a1a', '#f08a1a', '#d02a2a'];
      blob(ctx, w / 2, h * 0.36, h * 0.28, cols[Math.floor(rng() * 3)], rng, 10);
    },
  },
  tree_round: {
    w: 260, h: 340, world: 1500, collide: true, off: [1.3, 2.6],
    draw(ctx, w, h, rng, night, stage) {
      trunk(ctx, w / 2, h, w / 2, h * 0.5, 12, 7, '#5a3e28');
      const base = stage && stage.near ? shade(stage.near, 0.12) : '#3f9a44';
      blob(ctx, w / 2, h * 0.36, h * 0.3, base, rng, 10);
    },
  },
  umbrella: {
    w: 220, h: 220, world: 1300, collide: true, off: [1.3, 2.4],
    draw(ctx, w, h, rng) {
      const cols = [['#ff3a3a', '#fff'], ['#1a8aff', '#fff'], ['#ffd21a', '#ff5a1a']];
      const [a, b] = cols[Math.floor(rng() * cols.length)];
      ctx.fillStyle = '#ddd';
      ctx.fillRect(w / 2 - 3, h * 0.3, 6, h * 0.7);
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2, h * 0.1);
        const a0 = Math.PI + (i / 8) * Math.PI;
        const a1 = Math.PI + ((i + 1) / 8) * Math.PI;
        ctx.lineTo(w / 2 + Math.cos(a0) * w * 0.48, h * 0.34 + Math.sin(a0) * -h * 0.02);
        ctx.lineTo(w / 2 + Math.cos(a1) * w * 0.48, h * 0.34 + Math.sin(a1) * -h * 0.02);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? a : b;
        ctx.fill();
      }
      ctx.fillStyle = '#f4f4f4';
      roundRect(ctx, w * 0.15, h * 0.82, w * 0.7, h * 0.08, 5);
      ctx.fill();
    },
  },
  barrel: {
    w: 140, h: 140, world: 700, collide: true, off: [1.2, 1.8],
    draw(ctx, w, h) {
      ellipse(ctx, w * 0.35, h * 0.62, w * 0.25, h * 0.36, '#8a5a2a');
      ctx.fillStyle = '#444';
      ctx.fillRect(w * 0.1, h * 0.45, w * 0.5, 6);
      ctx.fillRect(w * 0.1, h * 0.75, w * 0.5, 6);
      // 寶箱
      ctx.fillStyle = '#9a6a2a';
      ctx.fillRect(w * 0.55, h * 0.6, w * 0.42, h * 0.4);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(w * 0.55, h * 0.68, w * 0.42, 6);
      ctx.fillRect(w * 0.73, h * 0.66, 10, 14);
      ellipse(ctx, w * 0.76, h * 0.58, 10, 6, '#ffe36a');
    },
  },
  lighthouse: {
    w: 160, h: 480, world: 1500, collide: true, off: [2.2, 3.0],
    draw(ctx, w, h) {
      for (let i = 0; i < 6; i++) {
        const y0 = h * (0.2 + i * 0.133);
        const t0 = (y0 - h * 0.2) / (h * 0.8);
        const t1 = t0 + 0.166;
        const hw0 = w * (0.18 + t0 * 0.16);
        const hw1 = w * (0.18 + t1 * 0.16);
        poly(ctx, [w / 2 - hw0, y0, w / 2 + hw0, y0, w / 2 + hw1, y0 + h * 0.133, w / 2 - hw1, y0 + h * 0.133], i % 2 ? '#fff' : '#e02a2a');
      }
      ctx.fillStyle = '#333';
      ctx.fillRect(w * 0.28, h * 0.18, w * 0.44, 8);
      ctx.fillStyle = '#ffe36a';
      ctx.fillRect(w * 0.34, h * 0.1, w * 0.32, h * 0.08);
      poly(ctx, [w * 0.3, h * 0.1, w * 0.7, h * 0.1, w / 2, h * 0.04], '#333');
    },
  },
  sunflowers: {
    w: 280, h: 200, world: 1500, collide: false, off: [1.2, 2.4],
    draw(ctx, w, h, rng) {
      for (let i = 0; i < 9; i++) {
        const x = w * (0.08 + rng() * 0.84);
        const y = h * (0.2 + rng() * 0.3);
        ctx.fillStyle = '#3a7a22';
        ctx.fillRect(x - 3, y, 6, h - y);
        poly(ctx, [x, y + 40, x + 26, y + 30, x + 6, y + 50], '#4a8a2a');
        for (let p = 0; p < 10; p++) {
          const a = (p / 10) * Math.PI * 2;
          ellipse(ctx, x + Math.cos(a) * 15, y + Math.sin(a) * 15, 9, 9, '#ffcc10');
        }
        ellipse(ctx, x, y, 11, 11, '#6a3a12');
      }
    },
  },
  bull: {
    w: 260, h: 320, world: 1600, collide: true, off: [1.8, 2.6],
    draw(ctx, w, h) {
      // 公牛看板剪影
      ctx.fillStyle = '#111';
      ctx.fillRect(w * 0.47, h * 0.7, 10, h * 0.3);
      ellipse(ctx, w * 0.45, h * 0.4, w * 0.3, h * 0.13, '#111');
      ellipse(ctx, w * 0.76, h * 0.36, w * 0.1, h * 0.08, '#111');
      for (const lx of [0.22, 0.32, 0.56, 0.66]) ctx.fillRect(w * lx, h * 0.45, 10, h * 0.2);
      trunk(ctx, w * 0.8, h * 0.3, w * 0.9, h * 0.2, 4, 2, '#111');
      trunk(ctx, w * 0.74, h * 0.3, w * 0.68, h * 0.2, 4, 2, '#111');
      trunk(ctx, w * 0.15, h * 0.38, w * 0.1, h * 0.55, 2, 2, '#111');
    },
  },
  cow: {
    w: 280, h: 200, world: 1400, collide: true, off: [1.5, 2.6],
    draw(ctx, w, h, rng) {
      const c = '#f6f6f0';
      ctx.fillStyle = c;
      roundRect(ctx, w * 0.15, h * 0.3, w * 0.58, h * 0.36, 20);
      ctx.fill();
      for (let i = 0; i < 4; i++) ellipse(ctx, w * (0.25 + rng() * 0.4), h * (0.38 + rng() * 0.2), 16 + rng() * 10, 12, '#222');
      for (const lx of [0.2, 0.3, 0.58, 0.66]) {
        ctx.fillStyle = '#eee';
        ctx.fillRect(w * lx, h * 0.62, 12, h * 0.38);
      }
      ellipse(ctx, w * 0.8, h * 0.36, 28, 22, c);
      ellipse(ctx, w * 0.86, h * 0.44, 16, 11, '#f0b0b0');
      ellipse(ctx, w * 0.78, h * 0.3, 4, 4, '#111');
      ctx.fillStyle = '#d8b020';
      ctx.fillRect(w * 0.76, h * 0.54, 12, 12);
    },
  },
  chalet: {
    w: 340, h: 300, world: 2600, collide: true, off: [1.9, 2.8],
    draw(ctx, w, h) {
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(w * 0.14, h * 0.62, w * 0.72, h * 0.38);
      ctx.fillStyle = '#9a5a2a';
      ctx.fillRect(w * 0.14, h * 0.36, w * 0.72, h * 0.26);
      ctx.fillStyle = '#6a3a1a';
      ctx.fillRect(w * 0.1, h * 0.58, w * 0.8, 8);
      poly(ctx, [0, h * 0.4, w / 2, h * 0.08, w, h * 0.4, w * 0.92, h * 0.44, w / 2, h * 0.16, w * 0.08, h * 0.44], '#5a2e14');
      for (const x of [0.24, 0.44, 0.64]) {
        ctx.fillStyle = '#2a3a5a';
        ctx.fillRect(w * x, h * 0.42, w * 0.1, h * 0.1);
        ctx.fillStyle = '#e02a4a';
        ctx.fillRect(w * x, h * 0.53, w * 0.1, 6);
      }
      ctx.fillStyle = '#6a3a1a';
      ctx.fillRect(w * 0.44, h * 0.72, w * 0.12, h * 0.28);
    },
  },
  flowers: {
    w: 240, h: 90, world: 1200, collide: false, off: [1.2, 2.2],
    draw(ctx, w, h, rng) {
      ellipse(ctx, w / 2, h * 0.75, w * 0.46, h * 0.3, '#3f8f3a');
      const cols = ['#ff4a8a', '#ffe23a', '#ffffff', '#b04aff', '#ff6a2a'];
      for (let i = 0; i < 40; i++) {
        ellipse(ctx, w * (0.08 + rng() * 0.84), h * (0.4 + rng() * 0.45), 5, 5, cols[i % cols.length]);
      }
    },
  },
  tulips: {
    w: 320, h: 110, world: 1800, collide: false, off: [1.2, 2.6],
    draw(ctx, w, h, rng) {
      const cols = ['#ff2a4a', '#ffd21a', '#ff7ab8', '#ff8a1a', '#b04aff'];
      const c = cols[Math.floor(rng() * cols.length)];
      ctx.fillStyle = '#3a8a2a';
      ctx.fillRect(0, h * 0.55, w, h * 0.45);
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 14; i++) {
          const x = w * (0.03 + i * 0.07) + r * 8;
          const y = h * (0.3 + r * 0.2);
          ctx.fillStyle = '#2f7a22';
          ctx.fillRect(x - 1.5, y, 3, h - y);
          ellipse(ctx, x, y, 7, 10, c);
          ellipse(ctx, x - 3, y - 4, 3, 5, shade(c, 0.3));
        }
      }
    },
  },
  windmill: {
    w: 320, h: 520, world: 2400, collide: true, off: [2.0, 3.0],
    draw(ctx, w, h) {
      poly(ctx, [w * 0.3, h, w * 0.7, h, w * 0.6, h * 0.35, w * 0.4, h * 0.35], '#8a4a3a');
      poly(ctx, [w * 0.55, h * 0.35, w * 0.6, h * 0.35, w * 0.7, h, w * 0.6, h], rgba('#000000', 0.2));
      ctx.fillStyle = '#f2eee0';
      ctx.fillRect(w * 0.44, h * 0.55, w * 0.12, h * 0.1);
      ctx.fillStyle = '#4a2a1a';
      ctx.fillRect(w * 0.45, h * 0.84, w * 0.1, h * 0.16);
      poly(ctx, [w * 0.36, h * 0.36, w * 0.64, h * 0.36, w / 2, h * 0.24], '#3a3a3a');
      const cx = w / 2;
      const cy = h * 0.3;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = '#5a3a24';
        ctx.fillRect(-3, 0, 6, h * 0.28);
        ctx.fillStyle = '#f4f0e0';
        ctx.fillRect(4, h * 0.04, 22, h * 0.24);
        ctx.strokeStyle = '#8a7a6a';
        ctx.lineWidth = 1;
        for (let k = 1; k < 6; k++) {
          ctx.beginPath();
          ctx.moveTo(4, h * 0.04 + (k * h * 0.24) / 6);
          ctx.lineTo(26, h * 0.04 + (k * h * 0.24) / 6);
          ctx.stroke();
        }
        ctx.restore();
      }
      ellipse(ctx, cx, cy, 8, 8, '#222');
    },
  },
  house_eu: {
    w: 320, h: 320, world: 2400, collide: true, off: [1.9, 2.8],
    draw(ctx, w, h, rng) {
      const walls = ['#f4ead0', '#f0d8c0', '#e8e4d8'];
      const c = walls[Math.floor(rng() * walls.length)];
      ctx.fillStyle = c;
      ctx.fillRect(w * 0.12, h * 0.4, w * 0.76, h * 0.6);
      // 木骨架
      ctx.strokeStyle = '#5a3a24';
      ctx.lineWidth = 7;
      ctx.strokeRect(w * 0.12, h * 0.4, w * 0.76, h * 0.6);
      ctx.beginPath();
      ctx.moveTo(w * 0.12, h * 0.68);
      ctx.lineTo(w * 0.88, h * 0.68);
      ctx.moveTo(w * 0.12, h * 0.4);
      ctx.lineTo(w * 0.32, h * 0.68);
      ctx.moveTo(w * 0.88, h * 0.4);
      ctx.lineTo(w * 0.68, h * 0.68);
      ctx.stroke();
      poly(ctx, [w * 0.04, h * 0.42, w / 2, h * 0.04, w * 0.96, h * 0.42], '#b8402a');
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(w * 0.42, h * 0.46, w * 0.16, h * 0.14);
      ctx.fillRect(w * 0.2, h * 0.74, w * 0.14, h * 0.12);
      ctx.fillRect(w * 0.66, h * 0.74, w * 0.14, h * 0.12);
      ctx.fillStyle = '#6a3a1a';
      ctx.fillRect(w * 0.44, h * 0.76, w * 0.12, h * 0.24);
      ctx.fillStyle = '#e02a4a';
      ctx.fillRect(w * 0.2, h * 0.86, w * 0.14, 6);
    },
  },
  chevron_l: {
    w: 200, h: 220, world: 900, collide: true, off: [1.15, 1.25],
    draw(ctx, w, h) {
      ctx.fillStyle = '#555';
      ctx.fillRect(w * 0.25, h * 0.5, 8, h * 0.5);
      ctx.fillRect(w * 0.72, h * 0.5, 8, h * 0.5);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w * 0.05, h * 0.08, w * 0.9, h * 0.44);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.28 + i * 0.22);
        poly(ctx, [x + 20, h * 0.12, x - 12, h * 0.3, x + 20, h * 0.48, x + 36, h * 0.48, x + 6, h * 0.3, x + 36, h * 0.12], '#e02020');
      }
    },
  },
  chevron_r: {
    w: 200, h: 220, world: 900, collide: true, off: [1.15, 1.25],
    draw(ctx, w, h) {
      ctx.fillStyle = '#555';
      ctx.fillRect(w * 0.25, h * 0.5, 8, h * 0.5);
      ctx.fillRect(w * 0.72, h * 0.5, 8, h * 0.5);
      ctx.fillStyle = '#fff';
      ctx.fillRect(w * 0.05, h * 0.08, w * 0.9, h * 0.44);
      for (let i = 0; i < 3; i++) {
        const x = w * (0.2 + i * 0.22);
        poly(ctx, [x - 4, h * 0.12, x + 28, h * 0.3, x - 4, h * 0.48, x + 12, h * 0.48, x + 42, h * 0.3, x + 12, h * 0.12], '#e02020');
      }
    },
  },
};

// ---- 快取 ----
const cache = new Map();

export function getSprite(type, variant = 0, stage = null) {
  const night = !!(stage && stage.night);
  const key = `${type}|${variant}|${night ? 1 : 0}|${stage ? stage.near || '' : ''}`;
  let c = cache.get(key);
  if (c) return c;
  const def = SPRITES[type];
  if (!def) return null;
  c = makeCanvas(def.w, def.h);
  const ctx = c.getContext('2d');
  const rng = mulberry32(variant * 7919 + type.length * 131 + 17);
  def.draw(ctx, def.w, def.h, rng, night, stage);
  if (night && !def.nightGlow && type !== 'neon' && type !== 'building') {
    // 夜間變暗
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(10,12,40,0.45)';
    ctx.fillRect(0, 0, def.w, def.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  cache.set(key, c);
  return c;
}

// 分岔路牌（動態文字）
export function makeForkSign(leftName, rightName) {
  const w = 560;
  const h = 360;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#555';
  ctx.fillRect(w * 0.2, h * 0.6, 14, h * 0.4);
  ctx.fillRect(w * 0.78, h * 0.6, 14, h * 0.4);
  roundRect(ctx, 6, 6, w - 12, h * 0.6, 18);
  ctx.fillStyle = '#0a6a2a';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(w / 2 - 2, 20, 4, h * 0.6 - 30);
  const fit = (s, maxW, size) => {
    ctx.font = `${size}px "Racing Sans One", Impact, sans-serif`;
    while (ctx.measureText(s).width > maxW && size > 14) {
      size -= 2;
      ctx.font = `${size}px "Racing Sans One", Impact, sans-serif`;
    }
    return size;
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  fit(leftName, w * 0.42, 44);
  ctx.fillText(leftName, w * 0.26, h * 0.34);
  fit(rightName, w * 0.42, 44);
  ctx.fillText(rightName, w * 0.74, h * 0.34);
  // 箭頭
  poly(ctx, [w * 0.1, h * 0.14, w * 0.2, h * 0.08, w * 0.2, h * 0.2], '#ffe23a');
  poly(ctx, [w * 0.9, h * 0.14, w * 0.8, h * 0.08, w * 0.8, h * 0.2], '#ffe23a');
  return c;
}

// 起點 / 檢查點 / 終點 拱門橫幅
export function makeBanner(label, colA = '#d81f1f', colB = '#ffffff') {
  const w = 1024;
  const h = 150;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = vgrad(ctx, 0, h, [shade(colA, 0.2), colA, shade(colA, -0.3)]);
  ctx.fillRect(0, 0, w, h);
  // 棋盤邊
  const sq = 18;
  for (let i = 0; i < w / sq; i++) {
    ctx.fillStyle = i % 2 ? '#000' : '#fff';
    ctx.fillRect(i * sq, 0, sq, sq);
    ctx.fillStyle = i % 2 ? '#fff' : '#000';
    ctx.fillRect(i * sq, h - sq, sq, sq);
  }
  ctx.font = '84px "Racing Sans One", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText(label, w / 2 + 5, h / 2 + 5);
  ctx.fillStyle = colB;
  ctx.fillText(label, w / 2, h / 2);
  return c;
}

export function clearSpriteCache() {
  cache.clear();
}
