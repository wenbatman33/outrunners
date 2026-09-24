// 版面與遊戲參數（DEV 工具可即時調整，匯出後再寫回這裡）
import { deepClone, deepMerge } from './util.js';

// HUD 座標皆為畫面比例 (0~1)，s 為縮放倍率
export const LAYOUT_PC = {
  hud: {
    time: { x: 0.5, y: 0.045, s: 1, color: '#ffe23a' },
    score: { x: 0.06, y: 0.045, s: 1, color: '#ffffff' },
    stage: { x: 0.06, y: 0.115, s: 1, color: '#7fd4ff' },
    rank: { x: 0.975, y: 0.045, s: 1, color: '#ffffff' },
    lap: { x: 0.975, y: 0.115, s: 1, color: '#b8ffb0' },
    progress: { x: 0.5, y: 0.16, s: 1, color: '#ffffff' },
    speed: { x: 0.975, y: 0.93, s: 1, color: '#ffffff' },
    gear: { x: 0.975, y: 0.8, s: 1, color: '#ff9a1f' },
    radio: { x: 0.025, y: 0.95, s: 1, color: '#ffffff' },
    map: { x: 0.84, y: 0.3, s: 1, color: '#ffffff' },
    message: { x: 0.5, y: 0.33, s: 1, color: '#ffe23a' },
  },
  touch: {
    left: { x: 0.08, y: 0.8, r: 0.1 },
    right: { x: 0.23, y: 0.8, r: 0.1 },
    gas: { x: 0.9, y: 0.76, r: 0.12 },
    brake: { x: 0.74, y: 0.84, r: 0.085 },
    gearUp: { x: 0.74, y: 0.53, r: 0.055 },
    gearDown: { x: 0.74, y: 0.67, r: 0.05 },
    pause: { x: 0.965, y: 0.06, r: 0.04 },
  },
};

export const LAYOUT_MOBILE = {
  hud: {
    time: { x: 0.5, y: 0.05, s: 1.15, color: '#ffe23a' },
    score: { x: 0.07, y: 0.05, s: 0.95, color: '#ffffff' },
    stage: { x: 0.07, y: 0.12, s: 0.9, color: '#7fd4ff' },
    rank: { x: 0.88, y: 0.05, s: 1, color: '#ffffff' },
    lap: { x: 0.88, y: 0.12, s: 0.85, color: '#b8ffb0' },
    progress: { x: 0.5, y: 0.17, s: 1, color: '#ffffff' },
    speed: { x: 0.64, y: 0.95, s: 0.95, color: '#ffffff' },
    gear: { x: 0.64, y: 0.83, s: 0.9, color: '#ff9a1f' },
    radio: { x: 0.36, y: 0.97, s: 0.8, color: '#ffffff' },
    map: { x: 0.84, y: 0.3, s: 0.85, color: '#ffffff' },
    message: { x: 0.5, y: 0.33, s: 1, color: '#ffe23a' },
  },
  touch: {
    left: { x: 0.085, y: 0.8, r: 0.12 },
    right: { x: 0.25, y: 0.8, r: 0.12 },
    gas: { x: 0.9, y: 0.74, r: 0.14 },
    brake: { x: 0.74, y: 0.85, r: 0.1 },
    gearUp: { x: 0.745, y: 0.49, r: 0.065 },
    gearDown: { x: 0.745, y: 0.66, r: 0.06 },
    pause: { x: 0.965, y: 0.07, r: 0.05 },
  },
};

// 手機直拿（直式）專用版面；觸控按鈕半徑 r 以螢幕短邊為基準
export const LAYOUT_PORTRAIT = {
  hud: {
    time: { x: 0.5, y: 0.03, s: 1.2, color: '#ffe23a' },
    score: { x: 0.1, y: 0.03, s: 1, color: '#ffffff' },
    stage: { x: 0.1, y: 0.075, s: 0.95, color: '#7fd4ff' },
    rank: { x: 0.96, y: 0.03, s: 1, color: '#ffffff' },
    lap: { x: 0.96, y: 0.075, s: 0.9, color: '#b8ffb0' },
    progress: { x: 0.5, y: 0.115, s: 1, color: '#ffffff' },
    speed: { x: 0.96, y: 0.7, s: 1, color: '#ffffff' },
    gear: { x: 0.96, y: 0.6, s: 0.95, color: '#ff9a1f' },
    radio: { x: 0.04, y: 0.7, s: 0.85, color: '#ffffff' },
    map: { x: 0.2, y: 0.19, s: 0.8, color: '#ffffff' },
    message: { x: 0.5, y: 0.3, s: 1, color: '#ffe23a' },
  },
  touch: {
    left: { x: 0.14, y: 0.87, r: 0.12 },
    right: { x: 0.38, y: 0.87, r: 0.12 },
    gas: { x: 0.86, y: 0.84, r: 0.13 },
    brake: { x: 0.63, y: 0.91, r: 0.085 },
    gearUp: { x: 0.63, y: 0.72, r: 0.06 },
    gearDown: { x: 0.63, y: 0.8, r: 0.055 },
    pause: { x: 0.93, y: 0.15, r: 0.05 },
  },
};

export const TUNING = {
  // 相機
  fov: 64,
  camHeight: 2.7,
  camDistance: 7.2,
  lookAhead: 16,
  lookHeight: 1.0,
  camLag: 7,
  speedFovKick: 10,
  pixelRatioMax: 1.5,
  // 道路 / 世界（單位：公尺）
  segLen: 5,
  roadHalfWidth: 7.5,
  groundWidth: 170,
  fogNear: 90,
  fogFar: 820,
  viewAhead: 900,
  chunkSegs: 40,
  propDensity: 1,
  carScale: 1,
  sunIntensity: 2.2,
  // 遊戲性
  startTime: 100,
  checkpointBonus: 75,
  stageSegments: 800,
  trafficDensity: 1,
  rivalSkill: 1,
  steerSpeed: 15,
  centrifugal: 0.42,
  crashTime: 1.3,
  // 動畫
  fadeTime: 0.6,
  envBlend: 2.0,
  messageTime: 2.2,
};

export const DEFAULTS = {
  LAYOUT_PC: deepClone(LAYOUT_PC),
  LAYOUT_MOBILE: deepClone(LAYOUT_MOBILE),
  LAYOUT_PORTRAIT: deepClone(LAYOUT_PORTRAIT),
  TUNING: deepClone(TUNING),
};

const KEY = 'outrunners_dev_overrides_v2';

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o.LAYOUT_PC) deepMerge(LAYOUT_PC, o.LAYOUT_PC);
    if (o.LAYOUT_MOBILE) deepMerge(LAYOUT_MOBILE, o.LAYOUT_MOBILE);
    if (o.LAYOUT_PORTRAIT) deepMerge(LAYOUT_PORTRAIT, o.LAYOUT_PORTRAIT);
    if (o.TUNING) deepMerge(TUNING, o.TUNING);
  } catch (e) {
    /* 忽略損壞的覆寫資料 */
  }
}

export function saveOverrides() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ LAYOUT_PC, LAYOUT_MOBILE, LAYOUT_PORTRAIT, TUNING }));
  } catch (e) {
    /* 無痕模式等情況可能無法寫入 */
  }
}

export function resetOverrides() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
  deepMerge(LAYOUT_PC, deepClone(DEFAULTS.LAYOUT_PC));
  deepMerge(LAYOUT_MOBILE, deepClone(DEFAULTS.LAYOUT_MOBILE));
  deepMerge(LAYOUT_PORTRAIT, deepClone(DEFAULTS.LAYOUT_PORTRAIT));
  deepMerge(TUNING, deepClone(DEFAULTS.TUNING));
}

// 目前使用的版面（PC / MOBILE），DEV 工具可強制切換
export const VIEW = {
  forced: null, // 'pc' | 'mobile' | null
  isTouch: false,
  portrait: false,
  mode: 'pc',
};

export function detectView() {
  VIEW.isTouch =
    'ontouchstart' in window || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  VIEW.mode = VIEW.forced || (VIEW.isTouch ? 'mobile' : 'pc');
  VIEW.portrait = VIEW.mode === 'mobile' && window.innerHeight > window.innerWidth;
  return VIEW.mode;
}

export function layout() {
  if (VIEW.mode !== 'mobile') return LAYOUT_PC;
  return VIEW.portrait ? LAYOUT_PORTRAIT : LAYOUT_MOBILE;
}
