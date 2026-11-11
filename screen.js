import { rpc, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE, joinUrl } from './common.js';
import { sound, sfx, bgm } from './sound.js';
import { avatarSVG, mascotSVG } from './characters.js';

if (!configured) { showConfigError(); throw new Error('config.js not set'); }

document.title = `${TITLE} · 스크린`;
$('#title').textContent = TITLE;

const stage = $('#stage');
let game = null;
let view = '';           // 지금 그려진 화면 (같은 화면이면 다시 그리지 않음)
let phaseKey = '';       // 효과음 중복 재생 방지용
let tallyTimer = null;
let lobbyTimer = null;
let lastSec = null;
let timeupPlayed = false;

function setPeople(n) { $('#people').textContent = n != null ? `${n}명 참가 중` : ''; }

// ---------- 사운드 버튼 ----------
function paintSoundButtons() {
  const locked = !sound.unlocked;
  const s = $('#btn-sfx'), m = $('#btn-bgm');
  s.textContent = locked ? '클릭해서 소리 켜기' : `효과음 ${sound.sfxOn ? '켜짐' : '꺼짐'}`;
  s.classList.toggle('attn', locked);
  s.classList.toggle('on', !locked && sound.sfxOn);
  m.classList.toggle('hidden', locked);
  m.textContent = `배경음악 ${sound.bgmOn ? '켜짐' : '꺼짐'}`;
  m.classList.toggle('on', sound.bgmOn);
}
async function unlockAudio() {
  const was = sound.unlocked;
  await sound.unlock();
  if (!was && sound.unlocked && game) startPhaseMusic(game);
  paintSoundButtons();
  return !was;
}
$('#btn-sfx').addEventListener('click', async () => {
  if (await unlockAudio()) return;              // 첫 클릭은 소리 켜기만
  sound.setSfx(!sound.sfxOn); paintSoundButtons();
});
$('#btn-bgm').addEventListener('click', () => { sound.setBgm(!sound.bgmOn); paintSoundButtons(); });
document.addEventListener('pointerdown', () => { if (!sound.unlocked) unlockAudio(); }, { once: true });
paintSoundButtons();

function startPhaseMusic(g) {
  if (g.phase === 'lobby') bgm.play('lobby');
  else if (g.phase === 'question') bgm.play('question');
}

// ---------- 단계 전환 ----------
function render(g) {
  const prev = game;
  game = g;
  $('#qpos').textContent = g.q_index >= 0 && !['lobby', 'end'].includes(g.phase) ? `${g.q_index + 1} / ${g.q_total}` : '';
  clearInterval(tallyTimer); clearInterval(lobbyTimer);

  const key = `${g.phase}:${g.q_index}:${g.started_at}`;
  const entering = key !== phaseKey;
  phaseKey = key;
  if (entering) closeZoom();
  if (entering && prev) playTransition(g);
  else if (entering) startPhaseMusic(g);

  if (!['question', 'closed', 'reveal'].includes(g.phase)) stage.classList.remove('crowd-mode');
  if (g.phase === 'lobby') return renderLobby();
  if (['question', 'closed', 'reveal'].includes(g.phase)) return renderQuestion(g);
  if (g.phase === 'leaderboard' || g.phase === 'end') return renderBoard(g.phase === 'end');
}

function playTransition(g) {
  switch (g.phase) {
    case 'lobby': bgm.play('lobby'); break;
    case 'question': lastSec = null; timeupPlayed = false; sfx.start(); bgm.play('question'); break;
    case 'closed': bgm.stop(); if (!timeupPlayed) { timeupPlayed = true; sfx.timeup(); } break;
    case 'reveal': bgm.stop(); sfx.reveal(g.question?.kind === 'quiz'); break;
    case 'leaderboard': bgm.stop(); sfx.drumroll(1.6); break;
    case 'end': bgm.stop(); sfx.ending(); setTimeout(() => { if (game.phase === 'end') bgm.play('lobby'); }, 6000); break;
  }
}

// 바글바글 군중 한 명: 등장 모션(.pc) + 각자 박자가 다른 들썩임(.pc-body) + 이름표
function member(p, mood, delay = 0) {
  const d = document.createElement('div');
  d.className = 'pc';
  d.style.setProperty('--enter-delay', `${delay}s`);
  d.style.setProperty('--dur', `${(mood === 'happy' ? 0.7 : mood === 'sad' ? 2.2 : 1.1) + Math.random() * 0.5}s`);
  d.style.setProperty('--phase', `${-Math.random() * 2}s`);
  d.style.setProperty('--dy', `${Math.round(Math.random() * 8 - 4)}%`);
  d.innerHTML = `<div class="pc-body mood-${mood}">${avatarSVG(p.a, mood)}</div><span class="pc-name"></span>`;
  d.querySelector('.pc-name').textContent = p.n;
  d.title = p.n;
  return d;
}

// ---------- 대기실 ----------
let shownNames = new Set();
let lobbyLoaded = false;
async function renderLobby() {
  if (view !== 'lobby') {
    view = 'lobby';
    shownNames = new Set();
    lobbyLoaded = false;
    const url = joinUrl();
    stage.innerHTML = `
      <div class="lobby">
        <div class="ticket">
          <div id="qr"></div>
          <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
        </div>
        <div>
          <h1>QR 찍고<br>내 캐릭터로 입장!</h1>
          <div class="count"><b id="count">0</b>명 입장</div>
          <div class="guests" id="guests"></div>
        </div>
      </div>`;
    drawQR($('#qr'), url);
  }
  const load = async () => {
    try {
      const info = await rpc('lobby_info');
      const countEl = $('#count');
      if (!countEl) return;
      countEl.textContent = info.players;
      setPeople(info.players);
      const box = $('#guests');
      const fresh = new Set(info.recent.map(r => r.id));
      if ([...shownNames].some(id => !fresh.has(id))) { box.innerHTML = ''; shownNames = new Set(); }
      let added = 0;
      info.recent.slice().reverse().forEach(r => {
        if (shownNames.has(r.id)) return;
        shownNames.add(r.id);
        box.prepend(member({ a: r.a, n: r.n }, 'idle', lobbyLoaded ? 0 : Math.random() * 0.6));
        added++;
      });
      while (box.children.length > 40) box.lastElementChild.remove();
      if (lobbyLoaded && added) for (let i = 0; i < Math.min(added, 4); i++) setTimeout(() => sfx.join(), i * 140);
      lobbyLoaded = true;
    } catch {}
  };
  load();
  lobbyTimer = setInterval(load, 2000);
}

async function drawQR(box, text) {
  try {
    const { default: QRCode } = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, text, { width: 600, margin: 1, color: { dark: '#1F0A0E', light: '#FFF7F0' } });
    box.replaceChildren(canvas);
  } catch {
    const img = new Image();
    img.alt = '참가 QR 코드';
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=8&color=1F0A0E&bgcolor=FFF7F0&data=${encodeURIComponent(text)}`;
    box.replaceChildren(img);
  }
}

// ---------- 문항 ----------
function renderQuestion(g) {
  const q = g.question;
  const key = `q:${g.q_index}:${g.started_at}`;
  if (view !== key) {
    view = key;
    stage.innerHTML = `
      <div class="qhead">
        <div class="qtext">${esc(q.text)}</div>
        <div class="clock ${q.time_limit ? '' : 'hidden'}" id="clock" aria-label="남은 시간"><span></span></div>
      </div>
      <div class="answers-count" id="ans"></div>
      <div class="sopts">
        ${q.options.map((o, i) => `
          <div class="sopt opt-${i}" data-i="${i}">
            <div class="fill" style="width:0"></div>
            <div class="head">
              <span class="badge">${LABELS[i]}</span>
              <span class="txt">${esc(o)}</span>
              <span class="cnt"></span>
              <button class="zoom-btn" type="button" data-zoom="${i}" aria-label="${LABELS[i]} 보기를 고른 사람 크게 보기" title="크게 보기 (숫자키 ${i + 1})">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M10.5 7.5v6M7.5 10.5h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="crowd"></div>
          </div>`).join('')}
      </div>
      <div class="banner" id="banner"></div>`;
  }
  const opts = [...stage.querySelectorAll('.sopt')];
  opts.forEach((el, i) => {
    const isCorrect = g.phase === 'reveal' && g.correct === i;
    el.classList.toggle('correct', isCorrect);
    el.classList.toggle('dim', g.phase === 'reveal' && g.correct != null && !isCorrect);
    el.querySelector('.badge').textContent = isCorrect ? '✓' : LABELS[i];
  });
  const showCrowd = g.phase === 'reveal' || q.kind === 'poll';
  stage.querySelector('.sopts').classList.toggle('show-crowd', showCrowd);
  stage.classList.toggle('crowd-mode', showCrowd);
  $('#banner').textContent =
    g.phase === 'closed' ? '응답 마감' :
    g.phase === 'reveal' && q.kind === 'poll' ? '투표 결과' : '';

  const clock = $('#clock');
  const tickClock = () => {
    if (!q.time_limit) return;
    const r = g.phase === 'question' ? remainingSec(g) : 0;
    clock.querySelector('span').textContent = r;
    clock.style.setProperty('--p', Math.max(0, r / q.time_limit));
    clock.classList.toggle('urgent', r <= 5);
    if (g.phase === 'question' && r !== lastSec) {
      if (r > 0 && r <= 5 && lastSec != null) sfx.tick(r <= 3);
      if (r === 0 && !timeupPlayed) { timeupPlayed = true; bgm.stop(); sfx.timeup(); }
      lastSec = r;
    }
  };
  tickClock();

  const showCounts = showCrowd;
  const load = async () => {
    try {
      const t = await rpc('get_tally');
      setPeople(t.players);
      if (t.q_index !== g.q_index) return;
      $('#ans').innerHTML = `<b>${t.voted}</b>명 응답 <span>/ ${t.players}명</span>`;
      if (showCounts && t.counts) {
        opts.forEach((el, i) => { el.querySelector('.cnt').textContent = `${t.counts[i]}명`; });
        if (showCrowd) await loadCrowd(g, opts);
      }
    } catch {}
  };
  load();
  let n = 0;
  tallyTimer = setInterval(() => { tickClock(); if (++n % 4 === 0) load(); }, 250);
}

// ---------- 돋보기: 한 보기를 고른 사람들만 화면 가득 크게 ----------
let crowdState = null;   // 마지막으로 불러온 군중 { g, groups, mood }
let zoomed = null;       // 열려 있는 보기 번호
let zoomKey = '';

function openZoom(i) {
  if (!crowdState || !crowdState.groups[i]) return;
  zoomed = i; zoomKey = '';
  let ov = $('#zoom');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'zoom'; ov.className = 'zoom-overlay';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `<div class="zoom-panel">
        <div class="zoom-head"><span class="badge"></span><span class="txt"></span><span class="cnt"></span>
          <button class="zoom-close" type="button" aria-label="닫기">닫기 <kbd>Esc</kbd></button></div>
        <div class="zoom-crowd"></div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.zoom-close')) closeZoom(); });
    document.body.append(ov);
  }
  paintZoom();
  ov.classList.add('open');
  ov.querySelector('.zoom-close').focus();
}

function closeZoom() {
  zoomed = null;
  $('#zoom')?.classList.remove('open');
}

function paintZoom() {
  const ov = $('#zoom');
  if (!ov || zoomed == null || !crowdState) return;
  const { g, groups, mood } = crowdState;
  const i = zoomed;
  const people = groups[i] || [];
  const m = mood(i);
  const panel = ov.querySelector('.zoom-panel');
  panel.className = `zoom-panel opt-${i} ${g.phase === 'reveal' && g.correct === i ? 'correct' : ''}`;
  ov.querySelector('.zoom-head .badge').textContent = g.phase === 'reveal' && g.correct === i ? '✓' : LABELS[i];
  ov.querySelector('.zoom-head .txt').textContent = g.question.options[i];
  ov.querySelector('.zoom-head .cnt').textContent = `${people.length}명`;
  const key = `${g.q_index}:${i}:${m}:${people.length}`;
  if (key === zoomKey) return;
  zoomKey = key;
  const box = ov.querySelector('.zoom-crowd');
  box.innerHTML = '';
  // 다 들어가는 가장 큰 크기로 (이름이 멀리서도 읽히게 최소 크기 보장, 넘치면 스크롤)
  requestAnimationFrame(() => {
    // 등장 애니메이션(scale) 영향을 받지 않는 clientWidth/Height 로 측정
    const w = box.clientWidth - 40, h = box.clientHeight - 40;
    const n = Math.max(1, people.length);
    const size = Math.max(64, Math.min(h * 0.62, 220, Math.floor(Math.sqrt((w * h) / (n * 1.75)) * 0.9)));
    box.style.setProperty('--s', `${size}px`);
    people.forEach((p, k) => box.append(member(p, m, Math.min(1, k * 0.02))));
  });
}

stage.addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]');
  if (b) openZoom(Number(b.dataset.zoom));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeZoom();
  const n = Number(e.key);
  const ready = game && (game.phase === 'reveal' || game.question?.kind === 'poll') && ['question', 'closed', 'reveal'].includes(game.phase);
  if (n >= 1 && n <= 6 && ready && game.question.options[n - 1] != null) {
    if (zoomed === n - 1) closeZoom(); else openZoom(n - 1);
  }
});

// 보기마다 그 보기를 고른 사람들의 캐릭터를 모아 보여 줌
async function loadCrowd(g, opts) {
  const list = await rpc('get_crowd');
  if (game !== g) return;
  const groups = opts.map(() => []);
  list.forEach(p => { if (groups[p.c]) groups[p.c].push(p); });
  const mood = i => g.phase !== 'reveal' ? 'idle'
    : g.question.kind === 'poll' || g.correct == null ? 'happy'
    : i === g.correct ? 'happy' : 'sad';
  crowdState = { g, groups, mood };
  if (zoomed != null) paintZoom();
  opts.forEach((el, i) => {
    const crowd = el.querySelector('.crowd');
    const people = groups[i];
    const key = `${mood(i)}:${people.length}`;
    if (crowd.dataset.key === key) return;
    const fresh = crowd.dataset.mood !== mood(i);
    crowd.dataset.key = key; crowd.dataset.mood = mood(i);
    // 인원 수에 맞춰 캐릭터 크기 결정
    const { width: w, height: h } = crowd.getBoundingClientRect();
    const n = Math.max(1, people.length);
    // 이름표(머리 위)까지 포함한 한 칸의 높이는 너비의 약 1.7배
    const size = Math.max(22, Math.min(h * 0.4, Math.floor(Math.sqrt((w * h) / (n * 1.75)) * 0.92)));
    crowd.style.setProperty('--s', `${size}px`);
    const have = fresh ? 0 : crowd.children.length;
    if (fresh) crowd.innerHTML = '';
    people.slice(have).forEach((p, k) => crowd.append(member(p, mood(i), have ? 0 : Math.min(1.4, k * 0.03))));
  });
}

// ---------- 순위 ----------
async function renderBoard(final) {
  const myView = final ? 'end' : 'board';
  view = myView;
  // 드럼롤이 울리는 동안 기다렸다가 순위를 펼침
  const delay = sound.unlocked && sound.sfxOn ? (final ? 2.2 : 1.6) : 0;
  stage.innerHTML = `<div class="board"><div class="board-head">${mascotSVG(final ? 'happy' : 'wow')}<h1>${final ? '최종 순위' : '현재 순위'}</h1></div></div>`;
  try {
    const lb = await rpc('get_leaderboard', { p_limit: 10 });
    if (view !== myView) return;
    const board = stage.querySelector('.board');
    if (!lb.length) { board.insertAdjacentHTML('beforeend', `<div class="empty">아직 참가자가 없어요</div>`); return; }
    // 10위부터 1위 순서로 등장
    board.insertAdjacentHTML('beforeend', lb.map((r, idx) => `
      <div class="r ${r.rank <= 3 ? `top${r.rank}` : ''}" style="animation-delay:${delay + (lb.length - 1 - idx) * 0.12}s">
        <span class="rk">${r.rank}</span>
        <span class="av">${avatarSVG(r.avatar, r.rank === 1 ? 'happy' : 'idle')}</span>
        <span class="nm">${esc(r.nickname)}</span>
        <span class="sc">${r.score.toLocaleString()}</span>
      </div>`).join(''));
  } catch {
    stage.innerHTML = `<div class="empty">순위를 불러오지 못했어요. 진행자 화면에서 다시 시도해 주세요.</div>`;
  }
}

syncClock();
watchGame(render, on => $('#conn').classList.toggle('on', on));
