// DEV 微調工具：F2 / ` 或左上角 ⚙ 開啟
// 功能：拖曳 HUD 與觸控按鈕、即時滑桿、PC/Mobile 版面切換、狀態觸發、匯出 JSON
import { LAYOUT_PC, LAYOUT_MOBILE, TUNING, VIEW, saveOverrides, resetOverrides, detectView, layout } from './config.js';
import { hudRects } from './ui/hud.js';
import { STAGES } from './data/stages.js';

export const devState = { open: false, dragMode: false, sel: null };

const TUNING_SCHEMA = [
  ['相機', [
    ['fov', 40, 100, 1, '視角 FOV'],
    ['camHeight', 0.5, 8, 0.05, '鏡頭高度'],
    ['camDistance', 1, 16, 0.1, '鏡頭距離'],
    ['lookAhead', 2, 50, 0.5, '注視前方'],
    ['lookHeight', -2, 5, 0.05, '注視高度'],
    ['camLag', 1, 20, 0.5, '跟隨速度'],
    ['speedFovKick', 0, 30, 0.5, '高速 FOV 增量'],
    ['carScale', 0.5, 2, 0.01, '玩家車縮放'],
  ]],
  ['世界 / 畫面', [
    ['fogNear', 0, 500, 5, '霧起點'],
    ['fogFar', 200, 2500, 10, '霧終點'],
    ['viewAhead', 300, 1600, 10, '前方載入距離'],
    ['sunIntensity', 0, 5, 0.05, '日光強度'],
    ['pixelRatioMax', 0.5, 3, 0.05, '解析度上限'],
    ['roadHalfWidth', 5, 12, 0.1, '路寬(下一關生效)'],
    ['groundWidth', 60, 320, 5, '地面寬(新區塊)'],
    ['propDensity', 0, 2, 0.05, '路邊物密度(下一關)'],
  ]],
  ['遊戲性', [
    ['startTime', 20, 200, 1, '起始時間'],
    ['checkpointBonus', 10, 150, 1, '檢查點加時'],
    ['stageSegments', 300, 2400, 10, '每關長度(段)'],
    ['trafficDensity', 0, 3, 0.05, '車流密度(下一關)'],
    ['rivalSkill', 0.5, 1.5, 0.01, '對手強度'],
    ['steerSpeed', 4, 30, 0.5, '轉向速度'],
    ['centrifugal', 0, 1.2, 0.01, '離心力'],
  ]],
  ['動畫時間', [
    ['crashTime', 0.5, 5, 0.05, '翻車時間'],
    ['envBlend', 0.2, 6, 0.1, '場景色彩過渡'],
    ['messageTime', 0.5, 5, 0.1, '訊息停留'],
  ]],
];

const HUD_NAMES = {
  time: '時間', score: '分數', stage: '關卡名', rank: '名次', lap: '分段時間', progress: '進度條',
  speed: '速度錶', gear: '檔位', radio: '電台', map: '迷你地圖', message: '中央訊息',
};
const TOUCH_NAMES = { left: '左轉', right: '右轉', gas: '油門', brake: '煞車', gear: '換檔', pause: '暫停' };

export function initDev(api) {
  const panelEl = document.getElementById('dev-panel');
  const btnEl = document.getElementById('dev-btn');
  const uiCanvas = document.getElementById('ui');
  let drag = null;

  const persist = () => saveOverrides();

  function curLayout() {
    return VIEW.mode === 'mobile' ? LAYOUT_MOBILE : LAYOUT_PC;
  }

  // ---------- DOM 產生 ----------
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'onclick' || k === 'oninput' || k === 'onchange') e[k] = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of children) e.append(c);
    return e;
  }

  function section(title, open = false) {
    const h = el('h3', {}, title);
    const box = el('div', { class: 'sec' });
    if (!open) {
      h.classList.add('closed');
      box.classList.add('closed');
    }
    h.onclick = () => {
      h.classList.toggle('closed');
      box.classList.toggle('closed');
    };
    panelEl.append(h, box);
    return box;
  }

  function slider(parent, label, obj, key, min, max, step, onChange) {
    const row = el('div', { class: 'row' });
    const lab = el('label', { title: key }, label);
    const r = el('input', { type: 'range', min, max, step });
    r.value = obj[key];
    const n = el('input', { type: 'number', min, max, step });
    n.value = obj[key];
    const set = (v) => {
      obj[key] = parseFloat(v);
      r.value = v;
      n.value = v;
      persist();
      onChange && onChange();
    };
    r.oninput = () => set(r.value);
    n.onchange = () => set(n.value);
    row.append(lab, r, n);
    parent.append(row);
    return { refresh: () => { r.value = obj[key]; n.value = obj[key]; } };
  }

  function colorRow(parent, label, obj, key) {
    const row = el('div', { class: 'row' });
    const c = el('input', { type: 'color' });
    c.value = obj[key];
    c.oninput = () => {
      obj[key] = c.value;
      persist();
    };
    row.append(el('label', {}, label), c, el('span'));
    parent.append(row);
  }

  let refreshers = [];
  function build() {
    panelEl.innerHTML = '';
    refreshers = [];
    const top = el('div', { class: 'top' });
    top.append(el('b', {}, 'DEV 微調工具'), el('div', { class: 'hint' }, '拖曳模式下可直接用滑鼠/手指拖動 HUD 與觸控按鈕。所有調整即時生效並自動暫存於瀏覽器；按「💾 匯出」取得 JSON。'));
    panelEl.append(top);

    // 版面模式
    const s0 = section('版面 / 拖曳', true);
    const modeRow = el('div');
    for (const [k, lab] of [[null, '自動'], ['pc', 'PC'], ['mobile', 'MOBILE']]) {
      const b = el('button', { class: VIEW.forced === k ? 'sel' : '' }, lab);
      b.onclick = () => {
        VIEW.forced = k;
        detectView();
        api.applyTuning();
        build();
      };
      modeRow.append(b);
    }
    s0.append(el('div', { class: 'hint' }, `目前編輯：${VIEW.mode === 'mobile' ? 'LAYOUT_MOBILE' : 'LAYOUT_PC'}（選 MOBILE 可在電腦上預覽/拖曳觸控按鈕）`), modeRow);
    const dragBtn = el('button', { class: devState.dragMode ? 'primary' : '' }, devState.dragMode ? '✋ 拖曳模式：開' : '✋ 拖曳模式：關');
    dragBtn.onclick = () => {
      devState.dragMode = !devState.dragMode;
      build();
    };
    const pauseBtn = el('button', {}, api.G.paused ? '▶ 繼續' : '❚❚ 暫停遊戲');
    pauseBtn.onclick = () => {
      if (api.G.state === 'race') {
        api.G.paused = !api.G.paused;
        build();
      }
    };
    s0.append(dragBtn, pauseBtn);

    // 狀態觸發
    const s1 = section('狀態觸發 / 跳關', true);
    const sel = el('select');
    for (const id of api.stages) sel.append(el('option', { value: id }, `${STAGES[id].name}（${id}）`));
    const go = el('button', { class: 'primary' }, '▶ 從此關開始');
    go.onclick = () => api.jumpStage(sel.value);
    s1.append(sel, go, el('br'));
    const trig = [
      ['fork', '跳到分岔前'],
      ['goalNear', '跳到終點前'],
      ['checkpoint', 'Checkpoint'],
      ['crash', '翻車'],
      ['time30', '+30 秒'],
      ['timeover', 'Time Over'],
      ['continue', '接關畫面'],
      ['ending', '結局畫面'],
      ['name', '輸入名字'],
      ['ranking', '排行榜'],
      ['select', '選車畫面'],
      ['map', '路線地圖'],
      ['title', '標題'],
    ];
    for (const [k, lab] of trig) {
      const b = el('button', {}, lab);
      b.onclick = () => api.trigger(k);
      s1.append(b);
    }

    // HUD 元素
    const L = curLayout();
    const s2 = section(`HUD 元素（${VIEW.mode.toUpperCase()}）`);
    for (const id of Object.keys(L.hud)) {
      const e = L.hud[id];
      const sub = el('div', { style: 'border-top:1px solid #2a3044;padding-top:4px;margin-top:4px' });
      sub.append(el('div', { style: 'color:#ffd84a' }, `${HUD_NAMES[id] || id}（${id}）`));
      refreshers.push(slider(sub, 'X', e, 'x', 0, 1, 0.001));
      refreshers.push(slider(sub, 'Y', e, 'y', 0, 1, 0.001));
      refreshers.push(slider(sub, '縮放', e, 's', 0.3, 3, 0.01));
      if (e.color) colorRow(sub, '顏色', e, 'color');
      s2.append(sub);
    }
    // 觸控按鈕
    const s3 = section(`觸控按鈕（${VIEW.mode.toUpperCase()}）`);
    for (const id of Object.keys(L.touch)) {
      const e = L.touch[id];
      const sub = el('div', { style: 'border-top:1px solid #2a3044;padding-top:4px;margin-top:4px' });
      sub.append(el('div', { style: 'color:#ffd84a' }, `${TOUCH_NAMES[id] || id}（${id}）`));
      refreshers.push(slider(sub, 'X', e, 'x', 0, 1, 0.001));
      refreshers.push(slider(sub, 'Y', e, 'y', 0, 1, 0.001));
      refreshers.push(slider(sub, '半徑', e, 'r', 0.02, 0.3, 0.001));
      s3.append(sub);
    }
    // 參數
    for (const [title, items] of TUNING_SCHEMA) {
      const s = section(title);
      for (const [k, min, max, step, lab] of items) {
        refreshers.push(slider(s, lab, TUNING, k, min, max, step, () => {
          if (k === 'pixelRatioMax' || k === 'fov') api.applyTuning();
        }));
      }
    }
    // 匯出
    const s4 = section('💾 匯出 / 鎖定', true);
    const ta = el('textarea', { readonly: 'readonly' });
    const exp = el('button', { class: 'primary' }, '💾 匯出 JSON');
    exp.onclick = () => {
      const json = JSON.stringify({ LAYOUT_PC, LAYOUT_MOBILE, TUNING }, null, 2);
      ta.value = json;
      try {
        navigator.clipboard.writeText(json);
        exp.textContent = '✅ 已複製到剪貼簿';
        setTimeout(() => (exp.textContent = '💾 匯出 JSON'), 1600);
      } catch (e) {}
      console.log('[OutRunners DEV EXPORT]\n' + json);
    };
    const rst = el('button', {}, '↺ 全部重置為預設');
    rst.onclick = () => {
      if (!confirm('確定把所有微調值重置為預設？')) return;
      resetOverrides();
      api.applyTuning();
      build();
    };
    s4.append(el('div', { class: 'hint' }, '調好後按匯出，把 JSON 貼給 Claude 並說「我調好了，鎖定」，即會寫回 src/config.js。'), exp, rst, ta);
  }

  function toggle() {
    btnEl.classList.add('show');
    devState.open = !devState.open;
    panelEl.hidden = !devState.open;
    btnEl.classList.toggle('on', devState.open);
    if (!devState.open) devState.dragMode = false;
    if (devState.open) build();
  }
  btnEl.addEventListener('click', toggle);
  // ⚙ 按鈕預設隱藏；網址加 ?dev=1 才顯示（F2 仍可開啟）
  if (/[?&]dev=1/.test(location.search)) {
    btnEl.classList.add('show');
    setTimeout(toggle, 300);
  }

  // ---------- 畫面拖曳 ----------
  const toLogical = (e) => {
    const G = api.G;
    return { x: (e.clientX / window.innerWidth) * G.W, y: (e.clientY / window.innerHeight) * G.H };
  };
  uiCanvas.addEventListener(
    'pointerdown',
    (e) => {
      if (!devState.dragMode) return;
      const p = toLogical(e);
      let found = null;
      const ids = Object.keys(hudRects).reverse();
      for (const id of ids) {
        const r = hudRects[id];
        if (id === 'radioBtn') continue;
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          found = id;
          break;
        }
      }
      if (found) {
        const L = curLayout();
        const entry = found.startsWith('touch_') ? L.touch[found.slice(6)] : L.hud[found];
        if (entry) {
          drag = { entry, id: found, px: p.x, py: p.y, ox: entry.x, oy: entry.y };
          devState.sel = found;
        }
      }
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!drag) return;
      const p = toLogical(e);
      const G = api.G;
      drag.entry.x = Math.round(Math.min(1, Math.max(0, drag.ox + (p.x - drag.px) / G.W)) * 1000) / 1000;
      drag.entry.y = Math.round(Math.min(1, Math.max(0, drag.oy + (p.y - drag.py) / G.H)) * 1000) / 1000;
      refreshers.forEach((r) => r.refresh());
    },
    true
  );
  window.addEventListener(
    'pointerup',
    () => {
      if (drag) persist();
      drag = null;
    },
    true
  );

  function drawOverlay(ctx, W, H) {
    if (!devState.open) return;
    ctx.save();
    ctx.font = '10px monospace';
    if (devState.dragMode) {
      for (const id in hudRects) {
        if (id === 'radioBtn') continue;
        const r = hudRects[id];
        ctx.strokeStyle = id === devState.sel ? '#ff3a3a' : 'rgba(255,230,60,0.9)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = id === devState.sel ? 2.5 : 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(r.x, r.y - 12, ctx.measureText(id).width + 6, 12);
        ctx.fillStyle = '#ffe23a';
        ctx.fillText(id, r.x + 3, r.y - 3);
      }
      ctx.fillStyle = 'rgba(200,30,30,0.85)';
      ctx.fillRect(W / 2 - 110, H - 22, 220, 18);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('DEV 拖曳模式（' + VIEW.mode.toUpperCase() + '）', W / 2, H - 9);
    }
    // 效能資訊
    const r = api.race;
    if (r) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(34, 4, 250, 16);
      ctx.fillStyle = '#9f9';
      ctx.fillText(`${r.path.stageId} s=${r.s.toFixed(0)}/${r.path.length.toFixed(0)} x=${r.x.toFixed(1)} v=${(r.v * 3.6).toFixed(0)}`, 38, 15);
    }
    ctx.restore();
    void layout;
  }

  return { toggle, drawOverlay, rebuild: build };
}
