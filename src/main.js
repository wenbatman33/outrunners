// OutRunners — 主程式與畫面流程
import * as THREE from 'three';
import { TUNING, loadOverrides, detectView, VIEW } from './config.js';
import { CARS, statBars } from './data/cars.js';
import { STAGES, ROUTES } from './data/stages.js';
import { Environment } from './world/env.js';
import { ChunkManager } from './world/chunks.js';
import { Race } from './game/race.js';
import { buildCar } from './cars/hero.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { input } from './input.js';
import { audio, SONGS } from './audio.js';
import { drawHUD, drawTouch, hudRects } from './ui/hud.js';
import { drawCourseMap, drawMapBackground } from './ui/map.js';
import { txt, panel, button, hit, logo, RACE, PIXEL, STAGE_ICON } from './ui/draw.js';
import { clamp, lerp, fmtTime, ordinal, makeCanvas, roundRect } from './util.js';
import { initDev, devState } from './dev.js';

loadOverrides();
detectView();

// ---------------- 渲染器 ----------------
const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const ui = uiCanvas.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: !VIEW.isTouch, powerPreference: 'high-performance' });
renderer.setClearColor('#000000');
const SHADOWS = !VIEW.isTouch;
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(TUNING.fov, 16 / 9, 0.5, 7000);
const env = new Environment(scene, renderer);
env.setShadows(SHADOWS);
const chunks = new ChunkManager(scene);
chunks.shadows = SHADOWS;
const world = { scene, env, chunks, camera, shadows: SHADOWS };

// 車漆反射用環境貼圖
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.7;

// ---------------- 選車展示間 ----------------
const show = (() => {
  const s = new THREE.Scene();
  const bg = makeCanvas(4, 256);
  const bctx = bg.getContext('2d');
  const g = bctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1a0a4a');
  g.addColorStop(0.55, '#c83a7a');
  g.addColorStop(0.75, '#ff9a4a');
  g.addColorStop(1, '#2a1030');
  bctx.fillStyle = g;
  bctx.fillRect(0, 0, 4, 256);
  const bt = new THREE.CanvasTexture(bg);
  bt.colorSpace = THREE.SRGBColorSpace;
  s.background = bt;
  s.add(new THREE.HemisphereLight('#ffd8f0', '#302040', 1.6));
  const d = new THREE.DirectionalLight('#ffffff', 2.4);
  d.position.set(5, 8, 6);
  s.add(d);
  const rim = new THREE.DirectionalLight('#6ab8ff', 1.6);
  rim.position.set(-6, 3, -6);
  s.add(rim);
  // 轉盤
  const ft = makeCanvas(256, 256);
  const fctx = ft.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    fctx.fillStyle = (i + j) % 2 ? '#20203a' : '#2c2c50';
    fctx.fillRect(i * 16, j * 16, 16, 16);
  }
  const ftex = new THREE.CanvasTexture(ft);
  ftex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 48), new THREE.MeshLambertMaterial({ map: ftex }));
  disc.position.y = -0.13;
  s.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.06, 6, 64), new THREE.MeshBasicMaterial({ color: '#ffd21a' }));
  ring.rotation.x = Math.PI / 2;
  s.add(ring);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshLambertMaterial({ color: '#241838' }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.26;
  s.add(floor);
  const turn = new THREE.Group();
  s.add(turn);
  s.environment = envTex;
  s.environmentIntensity = 1.0;
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  const cars = [];
  return { scene: s, cam, turn, cars };
})();

function showroomCar(i) {
  if (!show.cars[i]) {
    const m = buildCar(CARS[i]);
    m.visible = false;
    show.turn.add(m);
    show.cars[i] = m;
  }
  show.cars.forEach((c, k) => c && (c.visible = k === i));
}

// ---------------- 狀態 ----------------
const G = {
  state: 'boot',
  st: 0, // 目前狀態經過時間
  t: 0,
  race: null,
  sel: { car: 4, trans: 0, song: 0, step: 0 },
  btns: [],
  paused: false,
  pauseSel: 0,
  results: null,
  name: ['A', 'A', 'A'],
  namePos: 0,
  hiscores: loadScores(),
  demoT: 0,
  W: 960,
  H: 540,
  lastRank: -1,
};

function loadScores() {
  try {
    const s = JSON.parse(localStorage.getItem('outrunners3d_scores') || 'null');
    if (Array.isArray(s) && s.length) return s;
  } catch (e) {}
  const names = ['OUT', 'RUN', 'SUN', 'SKY', 'SEA', 'CAR', 'FUN', 'TOP', 'ACE', 'JET'];
  return names.map((n, i) => ({ name: n, score: 3000000 - i * 250000, car: i % 8, goal: ['paris', 'fuji', 'egypt', 'russia', 'lapland', 'holland', 'greece', 'germany', 'savanna', 'fuji'][i], time: 300 + i * 12 }));
}
function saveScores() {
  try {
    localStorage.setItem('outrunners3d_scores', JSON.stringify(G.hiscores.slice(0, 10)));
  } catch (e) {}
}

function setState(s) {
  G.state = s;
  G.st = 0;
  G.btns = [];
}

// ---------------- 比賽控制 ----------------
function randomRoute() {
  const b = Math.random() < 0.5 ? 'west' : 'east';
  const col = Math.floor(Math.random() * 3);
  return Math.random() < 0.3 ? { bound: null, col: -1, row: 0 } : { bound: b, col, row: Math.floor(Math.random() * (col + 1)) };
}

function startDemo() {
  if (G.race) G.race.dispose();
  G.race = new Race(world, { demo: true, carIdx: Math.floor(Math.random() * 8), startRoute: randomRoute(), seed: Math.floor(Math.random() * 99999) });
  G.race.demoLane = (Math.random() - 0.5) * 6;
  G.race.s += 400 + Math.random() * 1200;
  G.race.v = 50;
  G.demoT = 0;
}

function startRace(startRoute) {
  if (G.race) G.race.dispose();
  G.race = new Race(world, {
    carIdx: G.sel.car,
    trans: G.sel.trans ? 'MT' : 'AT',
    startRoute,
    hooks: {
      onGoal: (res) => {
        G.results = res;
        setState('ending');
      },
      onTimeOver: () => setState('continue'),
      onStage: () => {},
    },
  });
  G.paused = false;
  audio.duck(false);
  if (!audio.playing || audio.songIdx !== G.sel.song) audio.playSong(G.sel.song);
  setState('race');
}

function routeOfStage(id) {
  if (id === 'sanfrancisco') return { bound: null, col: -1, row: 0 };
  for (const b of ['west', 'east']) {
    for (let c = 0; c < 4; c++) {
      const r = ROUTES[b][c].indexOf(id);
      if (r >= 0) return { bound: b, col: c, row: r };
    }
  }
  return null;
}

// ---------------- 尺寸 ----------------
function resize() {
  detectView();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, VIEW.isTouch ? Math.min(TUNING.pixelRatioMax, 1.3) : TUNING.pixelRatioMax);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  show.cam.aspect = w / h;
  show.cam.updateProjectionMatrix();
  const udpr = Math.min(window.devicePixelRatio || 1, 2);
  uiCanvas.width = Math.round(w * udpr);
  uiCanvas.height = Math.round(h * udpr);
  // 邏輯座標至少 960x540（直式畫面時改以寬度為準，避免 UI 擠壓）
  // 橫式以高度 540 為基準；直式以寬度 600 為基準（字與按鈕才不會太小）
  G.scale = uiCanvas.width >= uiCanvas.height ? uiCanvas.height / 540 : uiCanvas.width / 600;
  G.H = uiCanvas.height / G.scale;
  G.W = uiCanvas.width / G.scale;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

input.attach(uiCanvas);

// ---------------- 靜音按鈕 ----------------
const muteBtn = document.getElementById('mute-btn');
function refreshMute() {
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', audio.muted);
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  refreshMute();
}
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
  muteBtn.blur();
});
refreshMute();
input.toLogical = (cx, cy) => ({ x: (cx / window.innerWidth) * G.W, y: (cy / window.innerHeight) * G.H });

// ---------------- 按鈕系統 ----------------
function btn(x, y, w, h, label, action, o = {}) {
  const r = button(ui, x, y, w, h, label, o);
  G.btns.push({ r, action });
  return r;
}

function handleTaps() {
  const taps = input.consumeTaps();
  if (devState.dragMode) return;
  for (const tp of taps) {
    // 觸控按鈕區不當作選單點擊
    if (G.state === 'race' && !G.paused && input.controls.some((c) => (tp.x - c.x) ** 2 + (tp.y - c.y) ** 2 < (c.r * 1.25) ** 2)) continue;
    let used = false;
    for (let i = G.btns.length - 1; i >= 0; i--) {
      const b = G.btns[i];
      if (hit(b.r, tp)) {
        b.action();
        used = true;
        break;
      }
    }
    if (!used) onBlankTap(tp);
  }
}

function onBlankTap(tp) {
  if (G.state === 'boot') bootStart();
  else if (G.state === 'title' && G.st > 0.5) goSelect();
  else if (G.state === 'race' && !G.paused && hudRects.radioBtn && hit(hudRects.radioBtn, tp)) changeRadio(1);
}

function bootStart() {
  audio.init();
  audio.playSong(G.sel.song);
  audio.sfx('coin');
  if (VIEW.isTouch) {
    try {
      const de = document.documentElement;
      if (de.requestFullscreen) de.requestFullscreen().catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  }
  startDemo();
  setState('title');
}

function goSelect() {
  audio.sfx('select');
  G.sel.step = 0;
  showroomCar(G.sel.car);
  setState('select');
}

function changeRadio(dir) {
  G.sel.song = (G.sel.song + dir + SONGS.length) % SONGS.length;
  audio.playSong(G.sel.song);
  if (G.race && G.state === 'race') G.race.message('♪ ' + SONGS[G.sel.song].name, '#ffffff', 1.8, 0.7);
}

// ---------------- 更新 ----------------
function update(dt) {
  G.t += dt;
  G.st += dt;
  input.update(dt);
  const ev = input.consume();
  if (ev.includes('dev')) devApi.toggle();
  if (ev.includes('mute')) {
    if (G.state === 'name') ev.push('char:V');
    else toggleMute();
  }
  handleTaps();
  const s = G.state;

  if (s === 'boot') {
    if (ev.includes('confirm') || ev.includes('gas') || ev.includes('gear')) bootStart();
    return;
  }
  if (s === 'title' || s === 'map' || s === 'ranking') {
    if (G.race) {
      G.race.update(dt, input);
      G.demoT += dt;
      if (G.demoT > 45) startDemo();
    }
    if (s === 'title') {
      if (ev.includes('confirm') || ev.includes('gas')) goSelect();
      if (ev.includes('back') || ev.includes('radio')) {
        setState('map');
      }
    } else if (ev.some((e) => ['confirm', 'back', 'pause', 'gas'].includes(e)) && G.st > 0.3) {
      audio.sfx('back');
      setState('title');
    }
    return;
  }
  if (s === 'select') {
    updateSelect(dt, ev);
    return;
  }
  if (s === 'race') {
    const r = G.race;
    if (ev.includes('pause')) togglePause();
    if (G.paused) {
      if (ev.includes('up') || ev.includes('down')) G.pauseSel = 1 - G.pauseSel;
      if (ev.includes('confirm')) G.pauseSel === 0 ? togglePause() : retire();
      return;
    }
    if (ev.includes('gear')) r.shiftUp();
    if (ev.includes('gearDown')) r.shiftDown();
    if (ev.includes('radio')) changeRadio(1);
    if (ev.includes('radioPrev')) changeRadio(-1);
    if (ev.includes('camera')) r.camMode = r.camMode === 1 ? 0 : 1;
    r.update(dt, input);
    const inRun = r.state === 'run';
    audio.updateEngine(r.rpm, input.gas, r.v / r.vmax, r.skid, r.offroad, inRun || r.state === 'countdown' || r.state === 'goal');
    return;
  }
  if (s === 'continue') {
    const r = G.race;
    r.update(dt, { steer: 0, gas: 0, brake: 0 });
    audio.updateEngine(0.1, 0, 0, 0, 0, false);
    const left = 10 - G.st;
    if (Math.floor(left) !== G.lastCount) {
      G.lastCount = Math.floor(left);
      audio.sfx('warn');
    }
    if (ev.includes('confirm') || ev.includes('gas')) doContinue();
    if (left <= 0) gameOver();
    return;
  }
  if (s === 'ending') {
    if (G.race) G.race.update(dt, input);
    audio.updateEngine(0.15, 0, 0, 0, 0, false);
    if (G.st > 2.5 && (ev.includes('confirm') || ev.includes('gas'))) toNameEntry();
    return;
  }
  if (s === 'name') {
    if (G.race) G.race.update(dt, input);
    updateName(ev);
  }
}

function togglePause() {
  G.paused = !G.paused;
  G.pauseSel = 0;
  audio.duck(G.paused);
  audio.sfx('select');
  if (G.paused) audio.updateEngine(0, 0, 0, 0, 0, false);
}

function retire() {
  G.paused = false;
  audio.duck(false);
  audio.updateEngine(0, 0, 0, 0, 0, false);
  startDemo();
  setState('title');
}

function doContinue() {
  audio.sfx('coin');
  G.race.continueRace();
  setState('race');
}

function gameOver() {
  audio.updateEngine(0, 0, 0, 0, 0, false);
  G.results = G.race.results();
  G.results.gameOver = true;
  toNameEntry();
}

function toNameEntry() {
  const sc = G.results ? G.results.score : 0;
  const qualifies = G.hiscores.length < 10 || sc > G.hiscores[G.hiscores.length - 1].score;
  if (qualifies && sc > 0) {
    G.name = ['A', 'A', 'A'];
    G.namePos = 0;
    setState('name');
  } else {
    startDemo();
    setState('ranking');
  }
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!♥ ';
function updateName(ev) {
  const cur = G.name[G.namePos];
  let idx = LETTERS.indexOf(cur);
  if (ev.includes('up') || ev.includes('right')) idx = (idx + 1) % LETTERS.length;
  if (ev.includes('down') || ev.includes('left')) idx = (idx - 1 + LETTERS.length) % LETTERS.length;
  G.name[G.namePos] = LETTERS[idx];
  if (ev.includes('up') || ev.includes('down') || ev.includes('left') || ev.includes('right')) audio.sfx('move');
  for (const e of ev) {
    if (e.startsWith('char:')) {
      const ch = e.slice(5);
      if (LETTERS.includes(ch)) {
        G.name[G.namePos] = ch;
        nameNext();
      }
    }
  }
  if (ev.includes('confirm') || ev.includes('gear')) nameNext();
  if (ev.includes('back') && G.namePos > 0) G.namePos--;
}

function nameNext() {
  audio.sfx('select');
  G.namePos++;
  if (G.namePos >= 3) submitName();
}

function submitName() {
  const r = G.results;
  G.hiscores.push({ name: G.name.join(''), score: r.score, car: r.carIdx, goal: r.gameOver ? null : r.goal, time: r.time });
  G.hiscores.sort((a, b) => b.score - a.score);
  G.hiscores = G.hiscores.slice(0, 10);
  G.lastRank = G.hiscores.findIndex((h) => h.name === G.name.join('') && h.score === r.score);
  saveScores();
  startDemo();
  setState('ranking');
}

function updateSelect(dt, ev) {
  const sel = G.sel;
  if (sel.step === 0) {
    if (ev.includes('left')) {
      sel.car = (sel.car + 7) % 8;
      audio.sfx('move');
      showroomCar(sel.car);
    }
    if (ev.includes('right')) {
      sel.car = (sel.car + 1) % 8;
      audio.sfx('move');
      showroomCar(sel.car);
    }
  } else if (sel.step === 1) {
    if (ev.includes('left') || ev.includes('right') || ev.includes('up') || ev.includes('down')) {
      sel.trans = 1 - sel.trans;
      audio.sfx('move');
    }
  } else if (sel.step === 2) {
    const d = ev.includes('left') || ev.includes('up') ? -1 : ev.includes('right') || ev.includes('down') ? 1 : 0;
    if (d) changeRadio(d);
  }
  if (ev.includes('confirm') || ev.includes('gear')) selNext();
  if (ev.includes('back') || ev.includes('pause')) selBack();
  // 展示間動畫
  show.turn.rotation.y += dt * 0.5;
  const a = Math.sin(G.t * 0.3) * 0.2;
  // 直式畫面鏡頭拉遠，整台車才放得進畫面
  const far = show.cam.aspect < 1 ? 1 + (1 - show.cam.aspect) * 1.8 : 1;
  show.cam.position.set(Math.sin(a) * 9.5 * far, 2.6 * far, Math.cos(a) * 9.5 * far);
  show.cam.lookAt(0, 0.7, 0);
  const car = show.cars[sel.car];
  if (car) for (const w of car.userData.wheels) w.spin.rotation.x -= dt * 2;
}

function selNext() {
  audio.sfx('select');
  if (G.sel.step < 2) G.sel.step++;
  else startRace(null);
}
function selBack() {
  audio.sfx('back');
  if (G.sel.step > 0) G.sel.step--;
  else {
    setState('title');
  }
}

// ---------------- 繪製 ----------------
function render() {
  const s = G.state;
  if (s === 'select') {
    renderer.render(show.scene, show.cam);
  } else if (G.race) {
    renderer.render(scene, camera);
  } else {
    renderer.clear();
  }
  const W = G.W;
  const H = G.H;
  ui.setTransform(1, 0, 0, 1, 0, 0);
  ui.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  ui.setTransform(G.scale, 0, 0, G.scale, 0, 0);
  G.btns = [];
  input.controls = [];
  switch (s) {
    case 'boot':
      drawBoot(W, H);
      break;
    case 'title':
      drawTitle(W, H);
      break;
    case 'map':
      drawMapScreen(W, H);
      break;
    case 'select':
      drawSelect(W, H);
      break;
    case 'race':
      drawRace(W, H);
      break;
    case 'continue':
      drawRace(W, H, true);
      drawContinue(W, H);
      break;
    case 'ending':
      drawEnding(W, H);
      break;
    case 'name':
      drawName(W, H);
      break;
    case 'ranking':
      drawRanking(W, H);
      break;
  }
  // 直式提示
  if (VIEW.isTouch && W < H * 1.05 && s === 'title') {
    const hy = H * 0.46;
    panel(ui, W * 0.12, hy, W * 0.76, 52, { fill: 'rgba(0,0,0,0.55)' });
    txt(ui, '橫放手機視野更大', W / 2, hy + 19, { size: 16, align: 'center', font: 'sans-serif', color: '#ffe23a' });
    txt(ui, 'ROTATE FOR WIDER VIEW', W / 2, hy + 40, { size: 8, align: 'center' });
  }
  devApi.drawOverlay(ui, W, H);
}

function drawBoot(W, H) {
  ui.fillStyle = '#000';
  ui.fillRect(0, 0, W, H);
  logo(ui, W / 2, H * 0.38, Math.min(1, W / 700), G.t);
  if (Math.floor(G.t * 2) % 2 === 0) txt(ui, VIEW.isTouch ? 'TAP TO START' : 'PRESS ENTER / CLICK', W / 2, H * 0.72, { size: 16, align: 'center', color: '#ffe23a' });
}

function drawTitle(W, H) {
  ui.fillStyle = 'rgba(0,0,0,0.18)';
  ui.fillRect(0, 0, W, H);
  logo(ui, W / 2, H * 0.3, Math.min(1, W / 700), G.t);
  if (Math.floor(G.t * 2) % 2 === 0) txt(ui, VIEW.isTouch ? 'TAP TO START' : 'PRESS ENTER', W / 2, H * 0.58, { size: 18, align: 'center', color: '#ffe23a', stroke: '#000' });
  const bw = 150;
  const y = H * 0.68;
  btn(W / 2 - bw * 1.5 - 12, y, bw, 40, 'START', goSelect, { hot: true });
  btn(W / 2 - bw / 2, y, bw, 40, 'COURSE MAP', () => setState('map'));
  btn(W / 2 + bw / 2 + 12, y, bw, 40, 'RANKING', () => setState('ranking'));
  // 高分跑馬燈
  const h = G.hiscores[Math.floor(G.t / 2.5) % G.hiscores.length];
  if (h) txt(ui, `HI-SCORE  ${h.name}  ${String(h.score).padStart(8, ' ')}`, W / 2, H * 0.84, { size: 11, align: 'center' });
  if (!VIEW.isTouch) txt(ui, '← → 轉向   ↑/Z 油門   ↓/X 煞車   SPACE/E 升檔  Q 降檔   M 換電台   C 視角   V 靜音   ESC 暫停', W / 2, H * 0.94, { size: 11, align: 'center', font: 'sans-serif', color: '#dde' });
  else txt(ui, '左下：轉向　右下：油門/煞車　右上：暫停', W / 2, H * 0.94, { size: 12, align: 'center', font: 'sans-serif', color: '#dde' });
}

function drawMapScreen(W, H) {
  drawMapBackground(ui, W, H, G.t);
  txt(ui, 'COURSE MAP', W / 2, 34, { size: 22, align: 'center', color: '#ffe23a', stroke: '#000' });
  const mw = Math.min(W - 20, H * 1.9);
  drawCourseMap(ui, (W - mw) / 2, 30, mw, H - 70, { history: [{ bound: null, col: -1, row: 0 }], t: G.t });
  btn(W / 2 - 60, H - 48, 120, 36, 'BACK', () => setState('title'));
}

function drawSelect(W, H) {
  const sel = G.sel;
  const titles = ['SELECT YOUR CAR', 'SELECT TRANSMISSION', 'SELECT MUSIC'];
  ui.fillStyle = 'rgba(0,0,0,0.35)';
  ui.fillRect(0, 0, W, 50);
  txt(ui, titles[sel.step], W / 2, 26, { size: 20, align: 'center', color: '#ffe23a', stroke: '#000' });
  const car = CARS[sel.car];
  const narrow = W < 760;
  if (sel.step === 0) {
    txt(ui, car.name, W / 2, 84, { size: 42, align: 'center', font: RACE, italic: true, color: car.color, stroke: '#000', strokeW: 6 });
    btn(12, H * 0.42, 56, 64, '◀', () => { sel.car = (sel.car + 7) % 8; showroomCar(sel.car); audio.sfx('move'); }, { size: 20 });
    btn(W - 68, H * 0.42, 56, 64, '▶', () => { sel.car = (sel.car + 1) % 8; showroomCar(sel.car); audio.sfx('move'); }, { size: 20 });
    // 能力值
    const pw = narrow ? W - 40 : 300;
    const px = narrow ? 20 : 24;
    const py = narrow ? H - 190 : H - 222;
    panel(ui, px, py, pw, narrow ? 120 : 150);
    statBars(car).forEach(([name, v], i) => {
      const y = py + 20 + i * (narrow ? 20 : 24);
      txt(ui, name, px + 12, y, { size: 9 });
      const bx = px + 110;
      const bwid = pw - 124;
      ui.fillStyle = 'rgba(255,255,255,0.15)';
      ui.fillRect(bx, y - 6, bwid, 12);
      const g = ui.createLinearGradient(bx, 0, bx + bwid, 0);
      g.addColorStop(0, '#3aff6a');
      g.addColorStop(0.6, '#ffe23a');
      g.addColorStop(1, '#ff3a3a');
      ui.fillStyle = g;
      ui.fillRect(bx, y - 6, bwid * clamp(v, 0.05, 1), 12);
    });
    txt(ui, `TOP ${car.top} km/h   MT ${car.gears}-SPEED`, px + 12, py + (narrow ? 112 : 138), { size: 9, color: '#ffe23a' });
    if (!narrow) {
      panel(ui, W - 324, H - 222, 300, 150);
      wrapText(car.desc, W - 310, H - 196, 272, 22, 15);
    }
    // 車輛圓點
    for (let i = 0; i < 8; i++) {
      ui.beginPath();
      ui.arc(W / 2 - 70 + i * 20, 118, 5, 0, Math.PI * 2);
      ui.fillStyle = i === sel.car ? '#ffe23a' : 'rgba(255,255,255,0.35)';
      ui.fill();
    }
  } else if (sel.step === 1) {
    const cw = Math.min(300, W * 0.42);
    const opts = [
      ['AT', 'AUTOMATIC', '自動排檔：只要踩油門，輕鬆上手'],
      ['MT', `MANUAL  ${CARS[sel.car].gears}-SPEED`, `手動 ${CARS[sel.car].gears} 段：極速 +5%，需自行升降檔（${VIEW.isTouch ? '▲▼ 按鈕' : 'SPACE/E 升、Q 降'}）`],
    ];
    opts.forEach(([k, n, d], i) => {
      const x = W / 2 + (i === 0 ? -cw - 10 : 10);
      const y = H * 0.56;
      const hot = sel.trans === i;
      const r = { x, y, w: cw, h: 150 };
      panel(ui, x, y, cw, 150, { fill: hot ? 'rgba(255,170,30,0.85)' : 'rgba(10,20,60,0.8)', border: hot ? '#fff' : 'rgba(255,255,255,0.3)', lw: hot ? 4 : 2 });
      txt(ui, k, x + cw / 2, y + 40, { size: 44, align: 'center', font: RACE, italic: true, color: hot ? '#2a1000' : '#fff', shadow: !hot });
      txt(ui, n, x + cw / 2, y + 82, { size: 9, align: 'center', color: hot ? '#2a1000' : '#ffe23a', shadow: !hot });
      wrapText(d, x + 14, y + 110, cw - 28, 18, 12, hot ? '#2a1000' : '#dde');
      G.btns.push({ r, action: () => { if (sel.trans === i) selNext(); else { sel.trans = i; audio.sfx('move'); } } });
    });
  } else {
    const cw = Math.min(360, W * 0.44);
    SONGS.forEach((song, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W / 2 + (col === 0 ? -cw - 8 : 8);
      const y = H * 0.5 + row * 70;
      const hot = sel.song === i;
      const r = { x, y, w: cw, h: 60 };
      panel(ui, x, y, cw, 60, { fill: hot ? 'rgba(255,170,30,0.9)' : 'rgba(10,20,60,0.8)', border: hot ? '#fff' : 'rgba(255,255,255,0.3)', lw: hot ? 4 : 2 });
      txt(ui, `FM ${88 + i * 4}.${i * 3}`, x + 14, y + 18, { size: 8, color: hot ? '#2a1000' : '#8fe0ff', shadow: !hot });
      txt(ui, song.name, x + 14, y + 40, { size: 13, color: hot ? '#2a1000' : '#fff', shadow: !hot });
      if (hot) {
        for (let k = 0; k < 6; k++) {
          const hh = 6 + Math.abs(Math.sin(G.t * 8 + k * 1.3)) * 22;
          ui.fillStyle = '#2a1000';
          ui.fillRect(x + cw - 60 + k * 8, y + 44 - hh, 5, hh);
        }
      }
      G.btns.push({ r, action: () => { if (sel.song === i) selNext(); else { sel.song = i; audio.playSong(i); } } });
    });
    txt(ui, '比賽中可隨時按 M（或點電台名稱）切換', W / 2, H * 0.5 - 22, { size: 12, align: 'center', font: 'sans-serif', color: '#fff' });
  }
  btn(20, H - 58, 120, 42, 'BACK', selBack);
  btn(W - 160, H - 58, 140, 42, sel.step === 2 ? 'START!' : 'OK', selNext, { hot: true });
}

function wrapText(s, x, y, maxW, lh, size, color = '#fff') {
  ui.font = `${size}px -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`;
  let line = '';
  let yy = y;
  for (const ch of s) {
    if (ui.measureText(line + ch).width > maxW) {
      txt(ui, line, x, yy, { size, font: '-apple-system, "PingFang TC", sans-serif', color });
      line = ch;
      yy += lh;
    } else line += ch;
  }
  if (line) txt(ui, line, x, yy, { size, font: '-apple-system, "PingFang TC", sans-serif', color });
}

function drawRace(W, H, noTouch) {
  const r = G.race;
  if (!r) return;
  drawHUD(ui, W, H, r, { t: G.t, songIdx: G.sel.song });
  if (VIEW.mode === 'mobile' && !noTouch && !G.paused) {
    input.controls = drawTouch(ui, W, H, r, input);
  }
  if (G.paused) {
    ui.fillStyle = 'rgba(0,0,0,0.6)';
    ui.fillRect(0, 0, W, H);
    txt(ui, 'PAUSE', W / 2, H * 0.24, { size: 40, align: 'center', font: RACE, color: '#ffe23a', stroke: '#000', italic: true });
    btn(W / 2 - 110, H * 0.36, 220, 46, 'RESUME', togglePause, { hot: G.pauseSel === 0 });
    btn(W / 2 - 110, H * 0.36 + 58, 220, 46, 'RETIRE', retire, { hot: G.pauseSel === 1 });
    btn(W / 2 - 110, H * 0.36 + 116, 220, 40, '♪ ' + SONGS[G.sel.song].name, () => changeRadio(1), { size: 9 });
    if (VIEW.isTouch) {
      btn(W / 2 - 110, H * 0.36 + 166, 220, 40, input.tiltEnabled ? '體感轉向：開' : '體感轉向：關', async () => {
        if (input.tiltEnabled) input.tiltEnabled = false;
        else await input.enableTilt();
      }, { font: 'sans-serif', size: 15 });
    } else {
      txt(ui, 'C：切換第一人稱視角　M/N：切換電台', W / 2, H * 0.36 + 180, { size: 13, align: 'center', font: 'sans-serif' });
    }
  }
}

function drawContinue(W, H) {
  ui.fillStyle = 'rgba(0,0,0,0.55)';
  ui.fillRect(0, 0, W, H);
  txt(ui, 'CONTINUE?', W / 2, H * 0.3, { size: 44, align: 'center', font: RACE, italic: true, color: '#ffe23a', stroke: '#000' });
  const n = Math.max(0, Math.ceil(10 - G.st) - 1);
  txt(ui, String(n), W / 2, H * 0.5, { size: 90, align: 'center', font: RACE, color: '#fff', stroke: '#a00' });
  btn(W / 2 - 170, H * 0.7, 160, 48, 'CONTINUE', doContinue, { hot: true });
  btn(W / 2 + 10, H * 0.7, 160, 48, 'GIVE UP', gameOver);
}

function drawEnding(W, H) {
  const r = G.results;
  if (!r) return;
  const st = STAGES[r.goal];
  const a = clamp(G.st / 1.5, 0, 1);
  ui.fillStyle = `rgba(0,0,20,${0.35 * a})`;
  ui.fillRect(0, 0, W, H);
  ui.globalAlpha = a;
  txt(ui, 'CONGRATULATIONS!', W / 2, 44, { size: 34, align: 'center', font: RACE, italic: true, color: '#ffe23a', stroke: '#a02000', strokeW: 6 });
  txt(ui, `${STAGE_ICON[r.goal] || ''} GOAL : ${st.name}, ${st.country}`, W / 2, 84, { size: 13, align: 'center', color: '#fff' });
  // 路線
  const mw = Math.min(W * 0.55, 520);
  panel(ui, 16, 110, mw, mw * 0.55, { fill: 'rgba(0,40,110,0.75)' });
  drawCourseMap(ui, 16, 110, mw, mw * 0.55, { history: r.route, t: G.t, compact: true });
  // 成績
  const px = Math.min(W - 280, 32 + mw);
  panel(ui, px, 110, 260, 250);
  txt(ui, 'RESULT', px + 130, 132, { size: 12, align: 'center', color: '#ffe23a' });
  txt(ui, `POSITION  ${ordinal(r.rank)}`, px + 16, 164, { size: 11, color: r.rank === 1 ? '#ffe23a' : '#fff' });
  txt(ui, `TIME  ${fmtTime(r.time)}`, px + 16, 190, { size: 11 });
  r.laps.forEach((l, i) => txt(ui, `STAGE ${i + 1}  ${fmtTime(l)}`, px + 16, 216 + i * 20, { size: 9, color: '#b8ffb0' }));
  txt(ui, `SCORE  ${r.score}`, px + 16, 336, { size: 12, color: '#ffe23a' });
  ui.globalAlpha = 1;
  if (G.st > 2.5) {
    btn(W / 2 - 80, H - 60, 160, 44, 'NEXT', toNameEntry, { hot: true });
  }
}

function drawName(W, H) {
  ui.fillStyle = 'rgba(0,0,20,0.7)';
  ui.fillRect(0, 0, W, H);
  txt(ui, 'ENTER YOUR INITIALS', W / 2, 50, { size: 18, align: 'center', color: '#ffe23a' });
  txt(ui, `SCORE ${G.results.score}`, W / 2, 84, { size: 12, align: 'center' });
  for (let i = 0; i < 3; i++) {
    const x = W / 2 - 80 + i * 80;
    const cur = i === G.namePos;
    panel(ui, x - 30, 108, 60, 70, { fill: cur ? 'rgba(255,170,30,0.8)' : 'rgba(10,20,60,0.8)' });
    txt(ui, G.name[i], x, 145, { size: 34, align: 'center', color: cur ? '#2a1000' : '#fff', shadow: !cur });
  }
  // 觸控字母鍵盤
  const cols = 10;
  const kw = Math.min(46, (W - 40) / cols);
  const kh = 36;
  const ox = (W - kw * cols) / 2;
  const oy = 200;
  [...LETTERS].forEach((ch, i) => {
    const x = ox + (i % cols) * kw;
    const y = oy + Math.floor(i / cols) * (kh + 6);
    btn(x + 2, y, kw - 4, kh, ch === ' ' ? '␣' : ch, () => {
      G.name[G.namePos] = ch;
      nameNext();
    }, { size: 12 });
  });
  btn(W / 2 - 150, H - 56, 140, 40, 'DEL', () => { if (G.namePos > 0) G.namePos--; audio.sfx('back'); });
  btn(W / 2 + 10, H - 56, 140, 40, 'END', submitName, { hot: true });
}

function drawRanking(W, H) {
  ui.fillStyle = 'rgba(0,0,20,0.7)';
  ui.fillRect(0, 0, W, H);
  txt(ui, 'BEST OUTRUNNERS', W / 2, 40, { size: 20, align: 'center', color: '#ffe23a', stroke: '#000' });
  const tw = Math.min(W - 30, 700);
  const x0 = (W - tw) / 2;
  txt(ui, 'RANK  NAME     SCORE    CAR             GOAL', x0 + 10, 78, { size: 8, color: '#8fe0ff' });
  G.hiscores.forEach((h, i) => {
    const y = 104 + i * 36;
    const me = i === G.lastRank;
    if (me) {
      ui.fillStyle = `rgba(255,200,40,${0.3 + Math.sin(G.t * 6) * 0.15})`;
      ui.fillRect(x0, y - 15, tw, 30);
    }
    txt(ui, ordinal(i + 1).padEnd(5, ' '), x0 + 10, y, { size: 11, color: i < 3 ? '#ffe23a' : '#fff' });
    txt(ui, h.name, x0 + 78, y, { size: 12 });
    txt(ui, String(h.score).padStart(9, ' '), x0 + 150, y, { size: 11 });
    txt(ui, CARS[h.car] ? CARS[h.car].name : '', x0 + 290, y, { size: 8, color: CARS[h.car] ? CARS[h.car].color : '#fff' });
    const gs = h.goal ? STAGES[h.goal] : null;
    txt(ui, gs ? `${STAGE_ICON[h.goal] || ''} ${gs.name}` : '---', x0 + tw - 10, y, { size: 8, align: 'right' });
  });
  btn(W / 2 - 70, H - 50, 140, 38, 'BACK', () => setState('title'));
}

// ---------------- DEV 工具 ----------------
const devApi = initDev({
  G,
  get race() {
    return G.race;
  },
  stages: Object.keys(STAGES),
  jumpStage(id) {
    const route = routeOfStage(id);
    if (!route) return;
    audio.init();
    startRace(route);
  },
  trigger(kind) {
    const r = G.race;
    audio.init();
    switch (kind) {
      case 'fork':
        if (r && G.state === 'race') r.devJump('fork');
        break;
      case 'goalNear':
        if (r && G.state === 'race') r.devJump('goal');
        break;
      case 'checkpoint':
        if (r) r.passGate('checkpoint');
        break;
      case 'crash':
        if (r) r.startCrash(1);
        break;
      case 'timeover':
        if (r && G.state === 'race') r.time = 0.01;
        break;
      case 'time30':
        if (r) r.time += 30;
        break;
      case 'ending':
        if (r) {
          G.results = { ...r.results(), rank: 1, route: [{ bound: null, col: -1, row: 0 }, { bound: 'east', col: 0, row: 0 }, { bound: 'east', col: 1, row: 1 }, { bound: 'east', col: 2, row: 1 }, { bound: 'east', col: 3, row: 1 }], goal: 'paris', laps: [55.2, 61.8, 58.4, 63.1, 59.9], score: 4321000 };
          setState('ending');
        }
        break;
      case 'select':
        goSelect();
        break;
      case 'title':
        startDemo();
        setState('title');
        break;
      case 'map':
        if (!G.race) startDemo();
        setState('map');
        break;
      case 'name':
        G.results = { score: 5000000, carIdx: G.sel.car, goal: 'fuji', time: 300, route: [], laps: [] };
        G.name = ['A', 'A', 'A'];
        G.namePos = 0;
        setState('name');
        break;
      case 'ranking':
        setState('ranking');
        break;
      case 'continue':
        if (r) setState('continue');
        break;
      case 'night':
        break;
    }
  },
  applyTuning() {
    resize();
    if (G.race) G.race.camInit = false;
  },
});

// ---------------- 主迴圈 ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    update(dt);
    render();
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(frame);
}

// 等字型載入後開始（避免畫面字型跳動）
const fontReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('16px "Press Start 2P"'), document.fonts.load('40px "Racing Sans One"')]).catch(() => {}) : Promise.resolve();
Promise.race([fontReady, new Promise((r) => setTimeout(r, 2500))]).then(() => {
  // 預先建一個展示用賽道（boot 畫面背後）
  startDemo();
  requestAnimationFrame(frame);
});

window.__OR = G;
// 除錯用入口（DEV 工具與測試）
window.__ORapi = { startRace, routeOfStage, setState, startDemo, show, showroomCar };
void lerp;
void PIXEL;
void roundRect;
