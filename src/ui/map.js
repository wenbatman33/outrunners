// 路線地圖（依原版格狀分岔地圖）：舊金山在中央，西行向左、東行向右
import { ROUTES, STAGES, START_STAGE } from '../data/stages.js';
import { txt, PIXEL, STAGE_ICON } from './draw.js';

// 節點位置（0~1）
export function nodePos(route) {
  if (!route || !route.bound) return { x: 0.5, y: 0.6 };
  const s = route.bound === 'west' ? -1 : 1;
  const c = route.col;
  const off = (route.row - c / 2) * 0.2;
  return { x: 0.5 + s * (0.13 + c * 0.1), y: 0.6 + (s < 0 ? -off : off) };
}

const same = (a, b) => a && b && a.bound === b.bound && a.col === b.col && a.row === b.row;

export function drawCourseMap(ctx, X, Y, W, H, o = {}) {
  const hist = o.history || [];
  const cur = hist[hist.length - 1];
  const P = (r) => {
    const p = nodePos(r);
    return { x: X + p.x * W, y: Y + p.y * H };
  };
  const edges = [];
  for (const bound of ['west', 'east']) {
    edges.push([{ bound: null }, { bound, col: 0, row: 0 }]);
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r <= c; r++) {
        edges.push([{ bound, col: c, row: r }, { bound, col: c + 1, row: r }]);
        edges.push([{ bound, col: c, row: r }, { bound, col: c + 1, row: r + 1 }]);
      }
    }
  }
  const traveled = (a, b) => {
    for (let i = 0; i < hist.length - 1; i++) {
      const h0 = hist[i];
      const h1 = hist[i + 1];
      if ((same(h0, a) || (!h0.bound && !a.bound)) && same(h1, b)) return true;
    }
    return false;
  };
  const lw = o.compact ? 2.5 : 6;
  // 道路線
  ctx.lineCap = 'round';
  for (const [a, b] of edges) {
    const pa = P(a);
    const pb = P(b);
    const done = traveled(a, b);
    ctx.strokeStyle = done ? '#ffd21a' : o.compact ? 'rgba(255,255,255,0.35)' : '#f2f0d0';
    ctx.lineWidth = done ? lw * 1.4 : lw;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    // 原版的直角轉折風格
    const mx = (pa.x + pb.x) / 2;
    ctx.lineTo(mx, pa.y);
    ctx.lineTo(mx, pb.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  // 節點
  const all = [{ bound: null, col: -1, row: 0 }];
  for (const bound of ['west', 'east']) for (let c = 0; c < 4; c++) for (let r = 0; r <= c; r++) all.push({ bound, col: c, row: r });
  for (const r of all) {
    const p = P(r);
    const id = r.bound ? ROUTES[r.bound][r.col][r.row] : START_STAGE;
    const st = STAGES[id];
    const visited = hist.some((h) => same(h, r) || (!h.bound && !r.bound));
    const isCur = cur && (same(cur, r) || (!cur.bound && !r.bound));
    const rad = o.compact ? 5 : 20;
    if (isCur) {
      const pulse = 1 + Math.sin((o.t || 0) * 6) * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 1.6 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,60,0.45)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = isCur ? '#ff3a3a' : visited ? '#ffd21a' : r.col === 3 ? '#d02a6a' : '#2a6ad8';
    ctx.fill();
    ctx.lineWidth = o.compact ? 1.5 : 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (!o.compact) {
      ctx.font = `20px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(STAGE_ICON[id] || '★', p.x, p.y + 1);
      txt(ctx, st.name, p.x, p.y + 32, { size: 8, align: 'center', color: visited ? '#ffe23a' : '#ffffff' });
      if (r.col === 3) txt(ctx, 'GOAL', p.x, p.y - 30, { size: 7, align: 'center', color: '#ff7ab0' });
    }
  }
  if (!o.compact) {
    const pw = P({ bound: 'west', col: 0, row: 0 });
    const pe = P({ bound: 'east', col: 0, row: 0 });
    const ps = P({ bound: null });
    txt(ctx, '◀ WEST BOUND', (pw.x + ps.x) / 2, ps.y + 46, { size: 9, align: 'center', color: '#8fe0ff' });
    txt(ctx, 'EAST BOUND ▶', (pe.x + ps.x) / 2, ps.y + 46, { size: 9, align: 'center', color: '#ffb08f' });
  }
}

// 地圖背景（海洋）
export function drawMapBackground(ctx, W, H, t = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a5ab8');
  g.addColorStop(1, '#0a2a6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // 海浪
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = ((i * 137 + t * 20) % (W + 60)) - 30;
    const y = (i * 71) % H;
    ctx.beginPath();
    ctx.arc(x, y, 10, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  void PIXEL;
}
