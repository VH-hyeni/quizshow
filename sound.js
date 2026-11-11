// =====================================================================
//  사운드: 효과음 + 배경음악
//  - 기본: 브라우저가 직접 합성 (파일 필요 없음, 저작권 걱정 없음)
//  - 내 음악을 쓰려면 assets/ 폴더에 아래 이름으로 mp3를 넣으면 자동으로 그 파일을 재생
//      assets/bgm-lobby.mp3     대기 화면 / 엔딩
//      assets/bgm-question.mp3  문제 푸는 동안
// =====================================================================

let ctx = null, master, sfxBus, bgmBus;
const prefs = {
  sfx: load('qs.sfx', true),
  bgm: load('qs.bgm', true),
};
function load(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} }

export const sound = {
  get unlocked() { return !!ctx && ctx.state === 'running'; },
  get sfxOn() { return prefs.sfx; },
  get bgmOn() { return prefs.bgm; },
  async unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = gain(ctx.destination, 0.9);
      sfxBus = gain(master, prefs.sfx ? 0.8 : 0);
      bgmBus = gain(master, prefs.bgm ? 0.32 : 0);
    }
    if (ctx.state !== 'running') await ctx.resume();
    if (pendingLoop) { const n = pendingLoop; pendingLoop = null; bgm.play(n); }
    return ctx.state === 'running';
  },
  setSfx(on) { prefs.sfx = on; save('qs.sfx', on); if (sfxBus) ramp(sfxBus.gain, on ? 0.8 : 0); },
  setBgm(on) {
    prefs.bgm = on; save('qs.bgm', on);
    if (bgmBus) ramp(bgmBus.gain, on ? 0.32 : 0);
    if (fileAudio) fileAudio.muted = !on;
  },
};

function gain(dest, v) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
function ramp(p, v) { p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(v, ctx.currentTime, 0.08); }
const ready = () => ctx && ctx.state === 'running';
const hz = m => 440 * 2 ** ((m - 69) / 12);   // MIDI 번호 → 주파수

// ---------- 합성 도구 ----------
function note(m, t, d, { type = 'triangle', v = 0.25, bus = sfxBus, glideTo = null, attack = 0.006, cutoff = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz(m), t);
  if (glideTo != null) o.frequency.exponentialRampToValueAtTime(hz(glideTo), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  let node = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
  node.connect(g); g.connect(bus);
  o.start(t); o.stop(t + d + 0.05);
}

let noiseBuf = null;
function noise(t, d, { v = 0.2, bus = sfxBus, hp = 1000, lp = null } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(h);
  let last = h;
  if (lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; h.connect(l); last = l; }
  last.connect(g); g.connect(bus);
  s.start(t); s.stop(t + d + 0.05);
}

function chord(ms, t, d, opts) { ms.forEach(m => note(m, t, d, opts)); }

// ---------- 효과음 ----------
let lastJoin = 0;
export const sfx = {
  join() {                       // 참가자 입장: 작은 '뽁'
    if (!ready() || !prefs.sfx) return;
    const now = ctx.currentTime;
    if (now - lastJoin < 0.12) return;
    lastJoin = now;
    note(79 + Math.floor(Math.random() * 5), now, 0.14, { type: 'sine', v: 0.18, glideTo: 86 });
  },
  start() {                      // 문제 시작: 상승 아르페지오
    if (!ready()) return;
    const t = ctx.currentTime + 0.02;
    [60, 64, 67, 72, 76].forEach((m, i) => note(m, t + i * 0.07, 0.35, { type: 'square', v: 0.09, cutoff: 3200 }));
    note(84, t + 0.36, 0.6, { type: 'triangle', v: 0.2 });
  },
  tick(urgent) {                 // 마지막 5초 카운트
    if (!ready()) return;
    const t = ctx.currentTime;
    note(urgent ? 88 : 83, t, 0.07, { type: 'square', v: urgent ? 0.12 : 0.07, cutoff: 5000 });
    if (urgent) noise(t, 0.04, { v: 0.08, hp: 5000 });
  },
  timeup() {                     // 시간 종료: 부저
    if (!ready()) return;
    const t = ctx.currentTime;
    chord([45, 46], t, 0.75, { type: 'sawtooth', v: 0.11, cutoff: 1400 });
  },
  reveal(correct = true) {       // 정답 공개: 팡파르
    if (!ready()) return;
    const t = ctx.currentTime + 0.02;
    const o = { type: 'sawtooth', v: 0.07, cutoff: 2600 };
    chord([67, 72, 76], t, 0.16, o);
    chord([67, 72, 76], t + 0.18, 0.16, o);
    chord([69, 74, 77], t + 0.36, 0.16, o);
    chord([72, 76, 79, 84], t + 0.56, 0.9, { ...o, v: 0.08 });
    note(48, t + 0.56, 0.9, { type: 'triangle', v: 0.25 });
    if (correct) noise(t + 0.56, 0.6, { v: 0.12, hp: 6000 });
  },
  drumroll(dur = 1.6, finale = true) {   // 순위 발표: 드럼롤 + 심벌
    if (!ready()) return;
    const t = ctx.currentTime + 0.02;
    for (let x = 0; x < dur; x += 0.045) {
      noise(t + x, 0.05, { v: 0.05 + 0.13 * (x / dur), hp: 300, lp: 2500 });
    }
    if (!finale) return;
    noise(t + dur, 1.4, { v: 0.22, hp: 5000 });
    note(36, t + dur, 0.5, { type: 'sine', v: 0.5, glideTo: 30 });
    chord([60, 64, 67, 72], t + dur, 1.2, { type: 'sawtooth', v: 0.06, cutoff: 2400 });
  },
  ending() {                     // 최종 결과: 긴 팡파르
    if (!ready()) return;
    sfx.drumroll(2.2, false);
    const t = ctx.currentTime + 2.24;
    const o = { type: 'sawtooth', v: 0.07, cutoff: 2800 };
    noise(t, 1.8, { v: 0.24, hp: 5000 });
    note(36, t, 0.6, { type: 'sine', v: 0.5, glideTo: 30 });
    [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((c, i) =>
      chord(c, t + i * 0.32, i === 3 ? 1.8 : 0.28, i === 3 ? { ...o, v: 0.08 } : o));
    [48, 53, 55, 48].forEach((m, i) => note(m, t + i * 0.32, i === 3 ? 1.8 : 0.3, { type: 'triangle', v: 0.22 }));
  },
};

// ---------- 배경음악 ----------
// 합성 루프: 16분음표 단위 스텝 시퀀서
const LOOPS = {
  // 대기실: 느긋한 메이저 그루브 (Cmaj7 – Am7 – Fmaj7 – G)
  lobby: {
    bpm: 100,
    bars: [[48, [64, 67, 71, 72]], [45, [64, 67, 69, 72]], [41, [65, 69, 72, 76]], [43, [62, 67, 71, 74]]],
    step(i, t, s16, [bass, tones]) {
      const pos = i % 16;
      if (pos === 0 || pos === 6 || pos === 10) note(bass, t, s16 * 3, { type: 'sine', v: 0.32, bus: bgmBus });
      if (pos % 2 === 0) note(tones[(pos / 2) % tones.length] + 12, t, s16 * 1.6, { type: 'triangle', v: 0.07, bus: bgmBus });
      if (pos === 4 || pos === 12) noise(t, 0.08, { v: 0.05, hp: 2500, bus: bgmBus });
      if (pos % 4 === 2) noise(t, 0.03, { v: 0.025, hp: 8000, bus: bgmBus });
    },
  },
  // 문제 풀이: 긴장감 있는 마이너 펄스 (Am – F – G – E)
  question: {
    bpm: 132,
    bars: [[45, [69, 72, 76]], [41, [69, 72, 77]], [43, [71, 74, 79]], [40, [68, 71, 76]]],
    step(i, t, s16, [bass, tones]) {
      const pos = i % 16;
      if (pos % 2 === 0) note(bass, t, s16 * 1.4, { type: 'sawtooth', v: 0.09, cutoff: 700, bus: bgmBus });
      if (pos % 4 === 0) note(28, t, 0.12, { type: 'sine', v: 0.4, glideTo: 24, bus: bgmBus });
      if (pos % 4 === 2) noise(t, 0.035, { v: 0.04, hp: 7000, bus: bgmBus });
      if ([0, 3, 6, 10, 12].includes(pos)) note(tones[pos % tones.length], t, s16 * 0.9, { type: 'square', v: 0.035, cutoff: 2200, bus: bgmBus });
    },
  },
};

let loopTimer = null, loopName = null, nextT = 0, stepI = 0, pendingLoop = null;
let fileAudio = null;
const fileCache = {};

async function hasFile(name) {
  if (name in fileCache) return fileCache[name];
  try {
    const r = await fetch(`assets/bgm-${name}.mp3`, { method: 'HEAD', cache: 'no-store' });
    fileCache[name] = r.ok;
  } catch { fileCache[name] = false; }
  return fileCache[name];
}

export const bgm = {
  async play(name) {
    if (loopName === name) return;
    bgm.stop();
    loopName = name;
    if (!ready()) { pendingLoop = name; loopName = null; return; }
    if (await hasFile(name)) {
      if (loopName !== name) return;
      fileAudio = new Audio(`assets/bgm-${name}.mp3`);
      fileAudio.loop = true; fileAudio.volume = 0.55; fileAudio.muted = !prefs.bgm;
      fileAudio.play().catch(() => {});
      return;
    }
    if (loopName !== name) return;
    const L = LOOPS[name];
    const s16 = 60 / L.bpm / 4;
    nextT = ctx.currentTime + 0.08; stepI = 0;
    loopTimer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.15) {
        const bar = L.bars[Math.floor(stepI / 16) % L.bars.length];
        L.step(stepI, nextT, s16, bar);
        nextT += s16; stepI++;
      }
    }, 30);
  },
  stop() {
    pendingLoop = null;
    loopName = null;
    clearInterval(loopTimer); loopTimer = null;
    if (fileAudio) {
      const a = fileAudio; fileAudio = null;
      const fade = setInterval(() => { a.volume = Math.max(0, a.volume - 0.08); if (a.volume <= 0) { clearInterval(fade); a.pause(); } }, 40);
    }
  },
};
