// 音效與音樂：全部以 WebAudio 即時合成（原創曲，不使用原版音樂）
import { mulberry32, clamp } from './util.js';

// 原創曲目設定：旋律由種子與和弦進行自動生成
export const SONGS = [
  {
    name: 'PASSING SUNSET',
    bpm: 132,
    root: 53, // F3
    mode: 'major',
    progA: [0, 4, 5, 3, 1, 4, 0, 4],
    progB: [3, 4, 2, 5, 3, 4, 0, 0],
    rhythm: ['x.x.x..x.x..x...', 'x..x..x.x.x.x...', '..x.x.x..x..x.x.', 'x...x.x.x.......'],
    bass: 'x..xx.x.x..xx.x.',
    stab: '..x...x...x...x.',
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx' },
    lead: 'square',
    seed: 11,
  },
  {
    name: 'MIDNIGHT HIGHWAY',
    bpm: 124,
    root: 45, // A2
    mode: 'minor',
    progA: [0, 5, 2, 6, 0, 5, 3, 4],
    progB: [5, 6, 0, 0, 5, 6, 4, 4],
    rhythm: ['x...x.x.x...x...', 'x.x...x...x.x.x.', 'x..x..x...x.....', '..x.x.x.x.x.x...'],
    bass: 'x.xxx.xxx.xxx.xx',
    stab: 'x.....x.....x...',
    drums: { k: 'x.....x...x.....', s: '....x.......x...', h: '..x...x...x...x.' },
    lead: 'sawtooth',
    seed: 29,
  },
  {
    name: 'OCEAN BREEZE DRIVE',
    bpm: 116,
    root: 50, // D3
    mode: 'major',
    progA: [0, 3, 5, 4, 0, 3, 1, 4],
    progB: [5, 3, 0, 4, 5, 3, 4, 4],
    rhythm: ['x..x..x...x.x...', 'x.x.x...x..x....', '...x.x.x.x..x...', 'x.....x.x.x.x...'],
    bass: 'x...x.x...x.x.x.',
    stab: '..x..x....x..x..',
    drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
    lead: 'triangle',
    seed: 47,
  },
  {
    name: 'TURBO SPLASH',
    bpm: 148,
    root: 52, // E3
    mode: 'minor',
    progA: [0, 6, 5, 6, 0, 6, 5, 4],
    progB: [2, 6, 3, 4, 2, 6, 4, 4],
    rhythm: ['x.x.x.x.x..x.x..', 'xx.x.x.x..x.x...', 'x.x.xx.x.x.x.x..', 'x..x..x.x.x.x.x.'],
    bass: 'x.x.x.x.x.x.x.x.',
    stab: '....x.......x.x.',
    drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'xxxxxxxxxxxxxxxx' },
    lead: 'square',
    seed: 83,
  },
];

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 由設定產生整首曲子的音符序列（16 小節循環）
function compose(song) {
  const rng = mulberry32(song.seed);
  const sc = SCALES[song.mode];
  const deg = (d) => song.root + 12 + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const bars = [...song.progA, ...song.progB];
  const chordTones = (cd) => [cd, cd + 2, cd + 4];
  const lead = []; // [step, midi, lenSteps]
  const motifs = {};
  let prev = 7; // 以音階度數表示
  for (let b = 0; b < bars.length; b++) {
    const section = b < 8 ? 0 : 1;
    const phrasePos = b % 8;
    // 句型：A A' B A''
    const motifId = section * 10 + [0, 1, 0, 1, 2, 3, 0, 4][phrasePos];
    const rhythm = song.rhythm[(motifId + section) % song.rhythm.length];
    const cd = bars[b];
    let notes = motifs[motifId];
    if (!notes) {
      notes = [];
      for (let s = 0; s < 16; s++) {
        if (rhythm[s] !== 'x') continue;
        let d;
        if (s % 4 === 0) {
          const ct = chordTones(cd).map((t) => t + 7);
          d = ct.reduce((a, c) => (Math.abs(c - prev) < Math.abs(a - prev) ? c : a), ct[0]);
          if (rng() < 0.3) d = ct[Math.floor(rng() * 3)];
        } else {
          d = prev + [-2, -1, -1, 1, 1, 2, 0][Math.floor(rng() * 7)];
        }
        d = clamp(d, 4, 13);
        prev = d;
        notes.push([s, d]);
      }
      motifs[motifId] = notes;
    }
    // 依當前和弦微調強拍音
    const ct = chordTones(cd).map((t) => t + 7);
    notes.forEach(([s, d], i) => {
      let dd = d;
      if (s % 8 === 0 && !ct.includes(dd) && !ct.includes(dd - 7)) {
        dd = ct.reduce((a, c) => (Math.abs(c - dd) < Math.abs(a - dd) ? c : a), ct[0]);
      }
      if (phrasePos === 7 && i === notes.length - 1) dd = 7;
      const next = notes[i + 1] ? notes[i + 1][0] : 16;
      lead.push([b * 16 + s, deg(dd), Math.max(1, Math.min(4, next - s))]);
    });
  }
  return { bars, lead, deg, chordTones };
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicVol = 0.55;
    this.sfxVol = 0.8;
    this.songIdx = 0;
    this.playing = false;
    try {
      this.muted = localStorage.getItem('outrunners_muted') === '1';
    } catch (e) {
      this.muted = false;
    }
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('outrunners_muted', m ? '1' : '0');
    } catch (e) {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    // 延遲效果（旋律用）
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const dl = ctx.createGain();
    dl.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.musicBus);
    // 噪音緩衝
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.initEngine();
  }

  // ---------- 引擎 ----------
  initEngine() {
    const ctx = this.ctx;
    this.eng = {};
    const e = this.eng;
    e.o1 = ctx.createOscillator();
    e.o1.type = 'sawtooth';
    e.o2 = ctx.createOscillator();
    e.o2.type = 'square';
    e.o3 = ctx.createOscillator();
    e.o3.type = 'sine';
    e.f = ctx.createBiquadFilter();
    e.f.type = 'lowpass';
    e.f.frequency.value = 600;
    e.f.Q.value = 3;
    e.g = ctx.createGain();
    e.g.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    const g3 = ctx.createGain();
    g3.gain.value = 0.18;
    e.o1.connect(e.f);
    e.o2.connect(g2).connect(e.f);
    e.o3.connect(g3).connect(e.g);
    e.f.connect(e.g);
    e.g.connect(this.sfxBus);
    e.o1.start();
    e.o2.start();
    e.o3.start();
    // 輪胎尖叫
    e.skidSrc = ctx.createBufferSource();
    e.skidSrc.buffer = this.noise;
    e.skidSrc.loop = true;
    e.skidF = ctx.createBiquadFilter();
    e.skidF.type = 'bandpass';
    e.skidF.frequency.value = 1500;
    e.skidF.Q.value = 6;
    e.skidG = ctx.createGain();
    e.skidG.gain.value = 0;
    e.skidSrc.connect(e.skidF).connect(e.skidG).connect(this.sfxBus);
    e.skidSrc.start();
    // 風切聲 / 路外碎石
    e.windSrc = ctx.createBufferSource();
    e.windSrc.buffer = this.noise;
    e.windSrc.loop = true;
    e.windF = ctx.createBiquadFilter();
    e.windF.type = 'lowpass';
    e.windF.frequency.value = 500;
    e.windG = ctx.createGain();
    e.windG.gain.value = 0;
    e.windSrc.connect(e.windF).connect(e.windG).connect(this.sfxBus);
    e.windSrc.start();
  }

  updateEngine(rpm, throttle, speedN, skid, offroad, active) {
    if (!this.ctx || !this.eng) return;
    const e = this.eng;
    const t = this.ctx.currentTime;
    const f = 32 + rpm * 150;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.o3.frequency.setTargetAtTime(f * 3.02, t, 0.05);
    e.f.frequency.setTargetAtTime(350 + rpm * 1400 + throttle * 700, t, 0.08);
    e.g.gain.setTargetAtTime(active ? 0.1 + throttle * 0.09 : 0, t, 0.1);
    e.skidG.gain.setTargetAtTime(active ? clamp(skid, 0, 1) * 0.22 : 0, t, 0.05);
    e.windG.gain.setTargetAtTime(active ? speedN * 0.08 + offroad * 0.18 : 0, t, 0.2);
    e.windF.frequency.setTargetAtTime(offroad > 0 ? 1600 : 400 + speedN * 500, t, 0.1);
  }

  // ---------- 音效 ----------
  tone(freq, dur, type = 'square', vol = 0.3, when = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseHit(dur, vol, freq = 800, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'move':
        this.tone(880, 0.05, 'square', 0.12);
        break;
      case 'select':
        this.tone(660, 0.08, 'square', 0.18);
        this.tone(990, 0.12, 'square', 0.18, 0.07);
        break;
      case 'back':
        this.tone(440, 0.1, 'square', 0.15, 0, 0.6);
        break;
      case 'coin':
        this.tone(988, 0.08, 'square', 0.2);
        this.tone(1319, 0.35, 'square', 0.2, 0.08);
        break;
      case 'beep':
        this.tone(523, 0.28, 'square', 0.25);
        break;
      case 'go':
        this.tone(1046, 0.7, 'square', 0.28);
        break;
      case 'shift':
        this.noiseHit(0.05, 0.3, 2400, 'highpass');
        this.tone(120, 0.08, 'sine', 0.3);
        break;
      case 'bump':
        this.noiseHit(0.18, 0.6, 700);
        this.tone(90, 0.2, 'sine', 0.6, 0, 0.5);
        break;
      case 'crash':
        this.noiseHit(1.2, 0.9, 1200);
        this.noiseHit(0.5, 0.7, 300);
        this.tone(70, 0.6, 'sine', 0.8, 0, 0.4);
        this.noiseHit(0.3, 0.5, 3000, 'highpass', 0.25);
        this.noiseHit(0.3, 0.4, 2000, 'highpass', 0.6);
        break;
      case 'checkpoint':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.2, i * 0.09));
        break;
      case 'extend':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.22, 'square', 0.18, i * 0.07));
        break;
      case 'warn':
        this.tone(1760, 0.07, 'square', 0.14);
        break;
      case 'goal':
        [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, 'square', 0.2, i * 0.11));
        [523, 659, 784].forEach((f) => this.tone(f, 1.4, 'sawtooth', 0.08, 0.8));
        break;
      case 'timeover':
        [784, 740, 698, 659, 622, 587].forEach((f, i) => this.tone(f, 0.25, 'square', 0.2, i * 0.18));
        break;
      default:
    }
  }

  // ---------- 音樂 ----------
  playSong(idx) {
    if (!this.ctx) return;
    this.stopSong();
    this.songIdx = ((idx % SONGS.length) + SONGS.length) % SONGS.length;
    this.song = SONGS[this.songIdx];
    this.comp = compose(this.song);
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.playing = true;
    this.leadIdx = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stopSong() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  nextSong(dir = 1) {
    this.playSong(this.songIdx + dir);
  }

  setMusicVolume(v) {
    this.musicVol = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  }

  duck(on) {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? this.musicVol * 0.35 : this.musicVol, this.ctx.currentTime, 0.2);
  }

  schedule() {
    if (!this.playing || !this.ctx) return;
    const spb = 60 / this.song.bpm / 4; // 每 16 分音符秒數
    const total = this.comp.bars.length * 16;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step % total, this.nextTime, spb);
      this.step++;
      const swing = this.step % 2 === 1 ? 0.04 : -0.04;
      this.nextTime += spb * (1 + swing * 0.5);
    }
  }

  playStep(step, t, spb) {
    const s = this.song;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const cd = this.comp.bars[bar];
    const deg = this.comp.deg;
    // 鼓
    if (s.drums.k[i] === 'x') this.kick(t);
    if (s.drums.s[i] === 'x') this.snare(t);
    if (s.drums.h[i] === 'x') this.hat(t, i % 4 === 2 ? 0.07 : 0.035);
    // 貝斯
    if (s.bass[i] === 'x') {
      const oct = i % 4 === 2 ? 12 : 0;
      this.synth(mtof(deg(cd) - 24 + oct), t, spb * 1.6, 'sawtooth', 0.16, 420, false);
    }
    // 和弦
    if (s.stab[i] === 'x') {
      for (const d of this.comp.chordTones(cd)) this.synth(mtof(deg(d)), t, spb * 1.8, 'sawtooth', 0.045, 2000, false, 6);
    }
    if (i === 0) {
      for (const d of this.comp.chordTones(cd)) this.synth(mtof(deg(d) - 12), t, spb * 15, 'triangle', 0.04, 1200, false);
    }
    // 旋律
    const lead = this.comp.lead;
    for (const n of lead) {
      if (n[0] === step) this.synth(mtof(n[1]), t, spb * n[2] * 0.95, s.lead, 0.085, 3200, true);
    }
  }

  synth(freq, t, dur, type, vol, cutoff, toDelay, detune = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = (Math.random() - 0.5) * detune * 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.35), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setTargetAtTime(vol * 0.6, t + 0.02, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
    o.connect(f).connect(g).connect(this.musicBus);
    if (toDelay) {
      // 顫音
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = freq * 0.006;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.2);
      g.connect(this.delay);
    }
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  snare(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + 0.2);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g2).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.1);
  }

  hat(t, vol) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random());
    s.stop(t + 0.07);
  }
}

export const audio = new AudioSys();
