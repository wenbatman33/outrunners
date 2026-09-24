// 2D UI 繪製工具（邏輯座標：高 540，寬依螢幕比例）
import { roundRect } from '../util.js';

export const PIXEL = '"Press Start 2P", monospace';
export const RACE = '"Racing Sans One", Impact, sans-serif';

export function txt(ctx, s, x, y, o = {}) {
  const size = o.size || 16;
  ctx.font = `${o.italic ? 'italic ' : ''}${size}px ${o.font || PIXEL}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'middle';
  if (o.shadow !== false) {
    ctx.fillStyle = o.shadowColor || 'rgba(0,0,0,0.75)';
    const d = Math.max(1.5, size * 0.1);
    ctx.fillText(s, x + d, y + d);
  }
  if (o.stroke) {
    ctx.lineWidth = o.strokeW || Math.max(2, size * 0.14);
    ctx.strokeStyle = o.stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

export function measure(ctx, s, size, font = PIXEL) {
  ctx.font = `${size}px ${font}`;
  return ctx.measureText(s).width;
}

export function panel(ctx, x, y, w, h, o = {}) {
  roundRect(ctx, x, y, w, h, o.r ?? 10);
  ctx.fillStyle = o.fill || 'rgba(8,12,30,0.72)';
  ctx.fill();
  if (o.border !== false) {
    ctx.lineWidth = o.lw || 2;
    ctx.strokeStyle = o.border || 'rgba(255,255,255,0.35)';
    ctx.stroke();
  }
}

export function button(ctx, x, y, w, h, label, o = {}) {
  const hot = o.hot;
  roundRect(ctx, x, y, w, h, o.r ?? 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (hot) {
    g.addColorStop(0, '#ffe46a');
    g.addColorStop(1, '#ff9a1a');
  } else {
    g.addColorStop(0, 'rgba(40,60,120,0.9)');
    g.addColorStop(1, 'rgba(15,25,60,0.9)');
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = hot ? '#fff6c0' : 'rgba(160,200,255,0.6)';
  ctx.stroke();
  txt(ctx, label, x + w / 2, y + h / 2 + 1, { size: o.size || 14, align: 'center', color: hot ? '#2a1400' : '#fff', shadow: !hot, font: o.font });
  return { x, y, w, h };
}

export function hit(r, p) {
  return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// 標題 LOGO
export function logo(ctx, cx, cy, scale = 1, t = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  // 橢圓底
  ctx.save();
  ctx.scale(1, 0.34);
  const eg = ctx.createLinearGradient(0, -180, 0, 180);
  eg.addColorStop(0, '#2a9ae8');
  eg.addColorStop(1, '#0a3a8a');
  ctx.beginPath();
  ctx.arc(0, 0, 250, 0, Math.PI * 2);
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
  ctx.font = `italic 92px ${RACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const word = 'OutRunners';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#0a2a6a';
  ctx.strokeText(word, 0, 4);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(word, 0, 4);
  const g = ctx.createLinearGradient(0, -40, 0, 45);
  g.addColorStop(0, '#fff7a0');
  g.addColorStop(0.45, '#ffd21a');
  g.addColorStop(0.5, '#ff9a10');
  g.addColorStop(1, '#e8500a');
  ctx.fillStyle = g;
  ctx.fillText(word, 0, 4);
  // 高光掃過
  const sx = ((t * 260) % 900) - 450;
  ctx.globalCompositeOperation = 'source-atop';
  const hg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.fillText(word, 0, 4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// 圖示（地圖用）
export const STAGE_ICON = {
  sanfrancisco: '🌉',
  hawaii: '🌺',
  easter: '🗿',
  fuji: '🗻',
  sydney: '🦘',
  hongkong: '🌃',
  guilin: '🐼',
  savanna: '🐘',
  egypt: '🐪',
  greece: '🏛️',
  lapland: '🦌',
  grandcanyon: '🌵',
  maya: '🔺',
  niagara: '🌈',
  caribbean: '🏴‍☠️',
  spain: '🌻',
  alps: '🐄',
  holland: '🌷',
  paris: '🗼',
  germany: '🏰',
  russia: '⛪',
};
