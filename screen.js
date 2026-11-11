import { rpc, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, serverNow, parseTs, LABELS, TITLE, joinUrl } from './common.js';
import { GAMES, KIND_LABEL, kindOf, fmtPlay, showOf, SHOW_LABEL } from './questions-format.js';
import { nextAction, hostActions } from './flow.js';
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
  updateCtrl();
  $('#chatpanel').classList.toggle('off', g.chat_on === false);
  if (['question', 'closed', 'reveal'].includes(g.phase)) return g.question?.kind === 'game' ? renderGameScreen(g) : renderQuestion(g);
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
  if (p.id) d.dataset.pid = p.id;     // 댄스를 출 때 이 사람을 찾는 표시
  if (p.v) d.classList.add('vip');    // 진행자가 지정한 '크게 보일 사람'
  d.dataset.mood = mood;
  d._a = p.a;
  return d;
}

function setMood(el, mood) {
  if (el.dataset.mood === mood) return;
  el.dataset.mood = mood;
  const body = el.querySelector('.pc-body');
  body.className = `pc-body mood-${mood}`;
  body.innerHTML = avatarSVG(el._a, mood);
  el.style.setProperty('--dur', `${(mood === 'happy' ? 0.7 : mood === 'sad' ? 2.2 : 1.1) + Math.random() * 0.5}s`);
}

// 사람 목록에 맞춰 칸 안의 아바타를 더하고 빼기 (이미 있는 사람은 그대로 두어 자연스럽게 이동)
function syncCrowd(box, people, mood, kind = 'card') {
  const m = box._m || (box._m = new Map());
  const want = new Set(people.map(p => p.id));
  for (const [id, el] of m) if (!want.has(id)) { el.remove(); m.delete(id); }
  let k = 0;
  for (const p of people) {
    const el = m.get(p.id);
    if (el) setMood(el, mood);
    else { const d = member(p, mood, Math.min(1.2, k++ * 0.03)); m.set(p.id, d); box.append(d); }
  }
  const w = box.clientWidth - 16, h = box.clientHeight - 8;
  const n = Math.max(1, people.length + people.filter(p => p.v).length * 3);   // 크게 보일 사람(2배 = 면적 4배)은 자리를 더 차지
  const size = kind === 'spect'
    ? Math.max(18, Math.min(h * (people.some(p => p.v) ? 0.3 : 0.58), Math.floor(Math.sqrt((w * h) / (n * 1.7)) * 0.95)))
    : Math.max(22, Math.min(h * (people.some(p => p.v) ? 0.27 : 0.4), Math.floor(Math.sqrt((w * h) / (n * 1.75)) * 0.92)));
  box.style.setProperty('--s', `${size}px`);
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
        box.prepend(member({ id: r.id, a: r.a, n: r.n, v: r.v }, 'idle', lobbyLoaded ? 0 : Math.random() * 0.6));
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
        <div class="qtext"><span class="kind-pill k-${kindOf(q)}">${KIND_LABEL[kindOf(q)]}</span>${showOf(q) === 'hidden' ? '<span class="kind-pill k-secret">비공개</span>' : ''}${esc(q.text)}</div>
        <div class="clock ${q.time_limit ? '' : 'hidden'}" id="clock" aria-label="남은 시간"><span></span></div>
      </div>
      <div class="answers-count" id="ans"></div>
      <div class="sopts ${q.ox ? 'ox' : ''}">
        ${q.options.map((o, i) => `
          <div class="sopt opt-${i}" data-i="${i}">
            <div class="fill" style="width:0"></div>
            <div class="head">
              <span class="badge">${q.ox ? (i === 0 ? '○' : '✕') : LABELS[i]}</span>
              <span class="txt">${q.ox ? (i === 0 ? '맞아요' : '아니에요') : esc(o)}</span>
              <span class="cnt"></span>
              <button class="zoom-btn" type="button" data-zoom="${i}" aria-label="${LABELS[i]} 보기를 고른 사람 크게 보기" title="크게 보기 (숫자키 ${i + 1})">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M10.5 7.5v6M7.5 10.5h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              </button>
            </div>
            <div class="crowd"></div>
            <div class="pct"></div>
          </div>`).join('')}
      </div>
      <div class="banner" id="banner"></div>
      <div class="spectators" id="spect"><span class="spec-label">구경 중 <b>0</b>명</span><div class="spec-crowd"></div></div>`;
  }
  const opts = [...stage.querySelectorAll('.sopt')];
  opts.forEach((el, i) => {
    const isCorrect = g.phase === 'reveal' && g.correct === i;
    el.classList.toggle('correct', isCorrect);
    el.classList.toggle('dim', g.phase === 'reveal' && g.correct != null && !isCorrect);
    el.querySelector('.badge').textContent = isCorrect ? '✓' : q.ox ? (i === 0 ? '○' : '✕') : LABELS[i];
  });
  // 공개 방식: live = 고르는 즉시 아바타 이동 · reveal = 정답 공개 때 · hidden = 끝까지 비공개(인원수 막대만)
  const mode = showOf(q);
  const showCrowd = crowdVisible(g);
  const showBars = mode === 'hidden' && g.phase === 'reveal';
  stage.querySelector('.sopts').classList.toggle('show-crowd', showCrowd);
  stage.querySelector('.sopts').classList.toggle('show-bars', showBars);
  stage.classList.toggle('crowd-mode', showCrowd || showBars);
  $('#spect .spec-label').firstChild.textContent = mode === 'hidden' ? '참가자 ' : '구경 중 ';
  $('#banner').textContent =
    g.phase === 'closed' ? '응답 마감' :
    g.phase === 'reveal' && mode === 'hidden' ? '누가 뭘 골랐는지는 비밀이에요' :
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

  const showCounts = showCrowd || g.phase === 'reveal' || mode === 'live';
  const load = async () => {
    try {
      const t = await rpc('get_tally');
      setPeople(t.players);
      if (t.q_index !== g.q_index) return;
      $('#ans').innerHTML = `<b>${t.voted}</b>명 응답 <span>/ ${t.players}명</span>`;
      if (showCounts && t.counts) {
        const total = Math.max(1, t.counts.reduce((a, b) => a + b, 0));
        opts.forEach((el, i) => {
          el.querySelector('.cnt').textContent = `${t.counts[i]}명`;
          el.querySelector('.fill').style.width = `${(t.counts[i] / total) * 100}%`;
          const pct = el.querySelector('.pct');
          if (pct) pct.textContent = `${Math.round((t.counts[i] / total) * 100)}%`;
        });
      }
      await loadCrowd(g, opts);
    } catch {}
  };
  load();
  let n = 0;
  tallyTimer = setInterval(() => { tickClock(); if (++n % 4 === 0) load(); }, 250);
}

// 보기 칸에 아바타를 모아 보여 줄지 (문항의 공개 방식에 따름)
function crowdVisible(g) {
  const mode = showOf(g.question || {});
  if (g.question?.kind === 'game' || mode === 'hidden') return false;
  return mode === 'live' || g.phase === 'reveal';
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
  const ready = game && ['question', 'closed', 'reveal'].includes(game.phase) && crowdVisible(game);
  if (n >= 1 && n <= 6 && ready && game.question.options[n - 1] != null) {
    if (zoomed === n - 1) closeZoom(); else openZoom(n - 1);
  }
});

// 보기마다 고른 사람들을 모으고, 아직 안 고른 사람은 아래 구경꾼 줄에 세움
async function loadCrowd(g, opts) {
  const list = await rpc('get_crowd');
  if (game !== g) return;
  const groups = opts.map(() => []);
  const spect = [];
  list.forEach(p => (p.c != null && groups[p.c] ? groups[p.c] : spect).push(p));
  const mood = i => g.phase !== 'reveal' ? 'idle'
    : g.question.kind === 'poll' || g.correct == null ? 'happy'
    : i === g.correct ? 'happy' : 'sad';
  crowdState = { g, groups, mood };
  if (zoomed != null) paintZoom();
  const showCrowd = crowdVisible(g);
  opts.forEach((el, i) => syncCrowd(el.querySelector('.crowd'), showCrowd ? groups[i] : [], mood(i)));
  const sp = $('#spect');
  if (sp) {
    sp.querySelector('.spec-label b').textContent = spect.length;
    sp.classList.toggle('none', !spect.length);
    syncCrowd(sp.querySelector('.spec-crowd'), spect, g.phase === 'reveal' ? 'sleep' : 'idle', 'spect');
  }
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
      <div class="r ${r.rank <= 3 && r.score > 0 ? `top${r.rank}` : ''}" style="animation-delay:${delay + (lb.length - 1 - idx) * 0.12}s">
        <span class="rk">${r.rank}</span>
        <span class="av">${avatarSVG(r.avatar, r.rank === 1 ? 'happy' : 'idle')}</span>
        <span class="nm">${esc(r.nickname)}</span>
        <span class="sc">${r.score.toLocaleString()}</span>
      </div>`).join(''));
  } catch {
    stage.innerHTML = `<div class="empty">순위를 불러오지 못했어요. 진행자 화면에서 다시 시도해 주세요.</div>`;
  }
}

// ---------- 미니게임 화면 ----------
function renderGameScreen(g) {
  const q = g.question;
  const info = GAMES[q.game] || GAMES.order;
  const key = `g:${g.q_index}:${g.started_at}`;
  if (view !== key) {
    view = key;
    stage.classList.remove('crowd-mode');
    stage.innerHTML = `
      <div class="qhead">
        <div class="qtext"><span class="kind-pill k-game">미니게임</span>${esc(info.name)}<div class="game-hint">${esc(info.hint)}${q.game === 'order' ? ` · 1부터 ${(q.size || 4) ** 2}까지` : q.game === 'tap' ? ` · ${q.duration || 10}초 동안` : ''}</div></div>
        <div class="clock" id="clock" aria-label="남은 시간"><span></span></div>
      </div>
      <div class="game-stage" id="gstage">
        <div class="game-countdown hidden" id="gcount"></div>
        <div class="game-live" id="glive"></div>
      </div>`;
  }
  const startAt = parseTs(g.started_at) + 3000;
  const clock = $('#clock'), gcount = $('#gcount');
  let lastN = null;
  const tickG = () => {
    const r = g.phase === 'question' ? remainingSec(g) : 0;
    clock.querySelector('span').textContent = r;
    clock.style.setProperty('--p', Math.max(0, r / (q.time_limit || 1)));
    clock.classList.toggle('urgent', r <= 5);
    const left = startAt - serverNow();
    if (g.phase === 'question' && left > -900) {
      const n = left > 0 ? String(Math.ceil(left / 1000)) : '시작!';
      gcount.classList.remove('hidden');
      if (n !== lastN) { lastN = n; gcount.textContent = n; gcount.classList.remove('pop'); void gcount.offsetWidth; gcount.classList.add('pop'); if (left > 0) sfx.tick(false); }
    } else gcount.classList.add('hidden');
    if (g.phase === 'question' && r === 0 && !timeupPlayed) { timeupPlayed = true; bgm.stop(); sfx.timeup(); }
  };
  tickG();
  const load = async () => {
    try {
      const b = await rpc('get_game_board', { p_limit: g.phase === 'reveal' ? 10 : 8 });
      if (game !== g) return;
      setPeople(b.players);
      paintGameBoard(g, b);
    } catch {}
  };
  load();
  let n = 0;
  tallyTimer = setInterval(() => { tickG(); if (++n % 4 === 0) load(); }, 250);
}

function paintGameBoard(g, b) {
  const q = g.question, live = $('#glive');
  if (!live) return;
  const fmt = v => fmtPlay(q.game, v);
  if (g.phase === 'reveal') {
    const [p1, p2, p3] = [1, 2, 3].map(r => b.top.find(x => x.rank === r) || null);
    const pod = (p, place) => p ? `<div class="pod pod-${place}"><span class="pod-name">${esc(p.n)}</span><div class="pod-av">${avatarSVG(p.a, 'happy')}</div>
        <div class="pod-block"><b>${place}</b><span>${fmt(p.v)}</span></div></div>` : `<div class="pod pod-${place} empty"><div class="pod-block"><b>${place}</b></div></div>`;
    const rest = b.top.filter(x => x.rank > 3);
    const key = JSON.stringify(b.top.map(x => [x.n, x.v]));
    if (live.dataset.key === key) return;
    live.dataset.key = key;
    live.innerHTML = b.top.length ? `<div class="podium">${pod(p2, 2)}${pod(p1, 1)}${pod(p3, 3)}</div>
      ${rest.length ? `<div class="game-rest">${rest.map(r => `<div class="gr"><b>${r.rank}</b><span class="gr-av">${avatarSVG(r.a)}</span><span class="nm">${esc(r.n)}</span><span class="v">${fmt(r.v)}</span></div>`).join('')}</div>` : ''}`
      : `<div class="empty">기록이 없어요</div>`;
    return;
  }
  const playing = g.phase === 'question' && q.game === 'tap' && !b.done;
  // 내용이 바뀌었을 때만 다시 그리고, 새로 들어온 사람만 떠오르게 (매초 깜빡임 방지)
  const key = JSON.stringify([g.phase, playing, b.done, b.players, b.top.map(r => [r.rank, r.n, r.v])]);
  if (live.dataset.key === key) return;
  live.dataset.key = key;
  const seen = live._seen || (live._seen = new Set());
  const rowKey = r => `${r.n}|${r.v}`;
  live.innerHTML = `<div class="game-progress"><b>${b.done}</b>명 기록 <span>/ ${b.players}명</span></div>
    ${playing ? `<div class="tap-hype">광클 중!!</div>` : `<div class="game-live-list">${b.top.map(r => `<div class="gl${seen.has(rowKey(r)) ? '' : ' new'}"><b>${r.rank}</b><span class="gl-av">${avatarSVG(r.a)}</span><span class="nm">${esc(r.n)}</span><span class="v">${fmt(r.v)}</span></div>`).join('')}</div>`}
    ${g.phase === 'closed' ? '<div class="banner">게임 종료! 결과를 기다려 주세요</div>' : ''}`;
  b.top.forEach(r => seen.add(rowKey(r)));
}

// ---------- 스크린에서 바로 진행하기 (진행자 PIN 필요) ----------
let ctrlPin = (() => { try { return localStorage.getItem('qs.screenpin'); } catch { return null; } })();
let ctrlBusy = false;
const ctrlA = hostActions(() => ctrlPin, async fn => {
  if (ctrlBusy) return;
  ctrlBusy = true; updateCtrl();
  try { await fn(); } catch (err) { $('#ctrl-msg').textContent = err.message; }
  finally { ctrlBusy = false; updateCtrl(); }
});

function updateCtrl() {
  const box = $('#ctrl');
  if (!box) return;
  box.classList.toggle('unlocked', !!ctrlPin);
  if (!ctrlPin) return;
  const n = nextAction(game, ctrlA);
  const b = $('#ctrl-next');
  b.textContent = `${n.label} ▶`;
  b.disabled = ctrlBusy || !n.run;
}

$('#ctrl-open').addEventListener('click', () => {
  if (ctrlPin) return;
  $('#ctrl').classList.toggle('asking');
  if ($('#ctrl').classList.contains('asking')) $('#ctrl-pin').focus();
});
$('#ctrl-form').addEventListener('submit', async e => {
  e.preventDefault();
  const p = $('#ctrl-pin').value.trim();
  try {
    await rpc('host_check', { p_pin: p });
    ctrlPin = p;
    try { localStorage.setItem('qs.screenpin', p); } catch {}
    $('#ctrl').classList.remove('asking');
    $('#ctrl-msg').textContent = '';
    $('#ctrl-pin').value = '';
    updateCtrl();
  } catch (err) { $('#ctrl-msg').textContent = err.message; }
});
$('#ctrl-next').addEventListener('click', () => nextAction(game, ctrlA).run?.());
$('#ctrl-lock').addEventListener('click', () => {
  ctrlPin = null;
  try { localStorage.removeItem('qs.screenpin'); } catch {}
  updateCtrl();
});
document.addEventListener('keydown', e => {
  if (!ctrlPin || document.activeElement?.tagName === 'INPUT') return;
  if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); nextAction(game, ctrlA).run?.(); }
});
if (ctrlPin) rpc('host_check', { p_pin: ctrlPin }).catch(() => { ctrlPin = null; try { localStorage.removeItem('qs.screenpin'); } catch {} updateCtrl(); });

// ---------- 채팅 · 댄스 ----------
let feedAfter = null, chatEpoch = null, feedBusy = false;
async function pollFeed() {
  if (document.hidden || feedBusy) return;
  feedBusy = true;
  try {
    let first = feedAfter == null;
    let f = await rpc('get_feed', { p_after: feedAfter ?? 0 });
    // 진행자가 '채팅 지우기'나 초기화를 했으면 채팅창을 비우고 처음부터 다시
    if (chatEpoch != null && f.epoch !== chatEpoch && !first) {
      $('#cp-list').innerHTML = '';
      first = true;
      f = await rpc('get_feed', { p_after: 0 });
    } else if (chatEpoch != null && f.epoch !== chatEpoch) $('#cp-list').innerHTML = '';
    chatEpoch = f.epoch;
    if (first) {
      // 스크린을 처음 열거나 새로고침: 지금까지의 채팅을 조용히 채워 넣음 (댄스는 건너뜀)
      f.items.forEach(it => showFeed(it, true));
      feedAfter = f.last;
    } else {
      f.items.forEach(it => showFeed(it));
      if (f.items.length) feedAfter = f.items.at(-1).k;
    }
  } catch {} finally { feedBusy = false; }
}

setInterval(pollFeed, 800);

function findAvatars(id) {
  return [...document.querySelectorAll(`.pc[data-pid="${id}"]`)].filter(el => el.offsetParent !== null);
}

function showFeed(it, quiet = false) {
  if (it.t === 1) {
    if (quiet) return;
    // 댄스: 화면에 보이는 그 사람 아바타가 3초 동안 춤춤
    findAvatars(it.id).forEach(el => {
      const body = el.querySelector('.pc-body');
      body.classList.remove('dance-d1', 'dance-d2', 'dance-d3'); void body.offsetWidth;
      body.classList.add(`dance-${it.b}`);
      el.classList.add('dancing');
      clearTimeout(el._dt);
      el._dt = setTimeout(() => { body.classList.remove(`dance-${it.b}`); el.classList.remove('dancing'); }, 3000);
    });
    return;
  }
  // 채팅: 오른쪽 채팅창에 쌓기
  const list = $('#cp-list');
  const row = document.createElement('div');
  row.className = 'cp-msg' + (it.v ? ' vip' : '') + (quiet ? ' old' : '');
  row.innerHTML = `<span class="cp-av">${avatarSVG(it.a)}</span><div class="cp-body"><b></b><span></span></div>`;
  row.querySelector('b').textContent = it.n;
  row.querySelector('.cp-body span').textContent = it.b;
  list.append(row);
  while (list.children.length > 100) list.firstElementChild.remove();
  list.scrollTop = list.scrollHeight;
  if (quiet) return;
  // 그 사람이 화면에 있으면 잠깐 반짝
  findAvatars(it.id).forEach(el => { el.classList.remove('spoke'); void el.offsetWidth; el.classList.add('spoke'); });
}

syncClock();
watchGame(render, on => $('#conn').classList.toggle('on', on));
