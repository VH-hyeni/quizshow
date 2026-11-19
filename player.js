import { rpc, $, esc, jitter, configured, showConfigError, watchGame, syncClock, remainingSec, serverNow, parseTs, LABELS, TITLE } from './common.js?v=20261119f';
import { GAMES, KIND_LABEL, kindOf, fmtPlay } from './questions-format.js?v=20261119f';
import { avatarSVG, normAvatar, randomAvatar, PEOPLE, ACC_SLOTS, BAMTI, HAIR_COLORS } from './characters.js?v=20261119f';

if (!configured) { showConfigError(); throw new Error('config.js not set'); }

document.title = `${TITLE} 참가`;
$('#title').textContent = TITLE;

const view = $('#view');
let kicked = false, kickSeen = null;   // 진행자가 내보냈는지
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

let myId = store.get('qs.id');
if (!myId) { myId = uuid(); store.set('qs.id', myId); }
let nick = store.get('qs.nick');
let avatar = (() => { try { const a = JSON.parse(store.get('qs.avatar')); return a ? normAvatar(a) : null; } catch { return null; } })() || randomAvatar();
let game = null;
let tick = null;
let renderSeq = 0;               // 비동기 응답이 늦게 와서 화면을 덮어쓰지 않도록

const qkey = g => `qs.pick.${g.q_index}.${g.started_at}`;
const getPick = g => { const v = store.get(qkey(g)); return v == null ? null : Number(v); };
const setPick = (g, c) => store.set(qkey(g), String(c));
const me = (mood = 'idle', cls = '') => avatarSVG(avatar, mood, cls);
const meBig = (mood = 'idle', motion = 'bob') => `<div class="me-big ${motion}"><div class="stage-av">${avatarSVG(avatar, mood, 'sticker')}</div><span class="nametag">${esc(nick || '')}</span></div>`;

function showMe() {
  $('#me').classList.toggle('hidden', !nick);
  $('#me-name').textContent = nick || '';
  $('#me-avatar').innerHTML = nick ? me() : '';
}

$('#rename').addEventListener('click', () => { nick = null; store.del('qs.nick'); showMe(); renderJoin(true); });

// ---------- 참가: 내 캐릭터 만들기 ----------
function renderJoin(force = false) {
  if (!force && view.querySelector('.join-form')) return;
  clearInterval(tick);
  view.innerHTML = `
    <form class="join-form maker" autocomplete="off">
      <div class="preview"><div class="stage-av bob" id="pv"></div><span class="nametag" id="pv-name">이름을 지어 주세요</span></div>
      <input id="nick" name="nick" maxlength="20" placeholder="아바타 이름 (최대 20자)" enterkeyhint="done" required aria-label="아바타 이름">
      <div class="err"></div>
      <div class="tabs" id="tabs" role="tablist"></div>
      <div id="pickers"></div>
      <div class="maker-actions">
        <button class="btn ghost" type="button" id="rand">랜덤</button>
        <button class="btn ghost bamti" type="button" id="bamti">밤티 되기</button>
        <button class="btn" type="submit">입장하기</button>
      </div>
    </form>`;
  const form = view.querySelector('form');
  const input = form.nick;
  input.value = store.get('qs.lastnick') || '';
  const showName = () => { $('#pv-name').textContent = input.value.trim() || '이름을 지어 주세요'; $('#pv-name').classList.toggle('empty', !input.value.trim()); };
  input.addEventListener('input', showName);
  showName();

  const TABS = [['z', '캐릭터', PEOPLE], ...ACC_SLOTS];
  let tab = 'z';
  const paint = () => {
    $('#pv').innerHTML = avatarSVG(avatar, 'idle', 'sticker');
    $('#tabs').innerHTML = TABS.map(([k, label]) =>
      `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${label}</button>`).join('');
    const list = TABS.find(t => t[0] === tab)[2];
    $('#pickers').innerHTML = `<div class="picks parts">${list.map((n, i) =>
      `<button type="button" class="pick" data-k="${tab}" data-v="${i}" aria-pressed="${avatar[tab] === i}">${avatarSVG({ ...avatar, [tab]: i })}<span>${n}</span></button>`).join('')}</div>`;
  };
  paint();
  const wiggle = () => { const el = $('#pv .av'); el.classList.remove('wiggle'); void el.offsetWidth; el.classList.add('wiggle'); };
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) { tab = t.dataset.tab; paint(); }
  });
  $('#pickers').addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (!b) return;
    avatar = { ...avatar, [b.dataset.k]: Number(b.dataset.v) };
    paint(); wiggle();
  });
  $('#bamti').addEventListener('click', () => {
    avatar = { z: BAMTI, c: 0, h: 0, f: 0, b: 0 };
    if (!input.value.trim()) { input.value = '밤티'; showName(); }
    paint(); wiggle();
  });
  $('#rand').addEventListener('click', () => { avatar = randomAvatar(); paint(); wiggle(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    form.querySelector('.err').textContent = '';
    try {
      await rpc('join_game', { p_id: myId, p_nickname: name, p_avatar: avatar });
      nick = name;
      store.set('qs.nick', name); store.set('qs.lastnick', name); store.set('qs.avatar', JSON.stringify(avatar));
      showMe();
      updateSocial();
      lastKey = null; if (game) render(game);
    } catch (err) {
      if (/KICKED/.test(err.message)) return showKicked();
      form.querySelector('.err').textContent = err.message;
      btn.disabled = false;
    }
  });
}

async function rejoin() {
  if (!nick) return;
  try { await rpc('join_game', { p_id: myId, p_nickname: nick, p_avatar: avatar }); }
  catch (err) { if (/KICKED/.test(err.message)) showKicked(); throw err; }
}

// ---------- 진행자가 내보낸 경우 ----------
function showKicked() {
  kicked = true;
  clearInterval(tick);
  $('#social')?.classList.add('hidden');
  $('#me')?.classList.add('hidden');
  document.body.classList.remove('has-chatlog');
  view.innerHTML = `<div class="center kicked"><div class="kicked-mark" aria-hidden="true">🚪</div>
    <h2>퇴장 처리되었어요</h2><p class="muted">진행자가 이 참가자를 내보냈어요.<br>잘못된 경우라면 진행자에게 말해 주세요.</p></div>`;
}
async function checkKicked() {
  try { await myStatus(); } catch {}
}
// 내 상태 가져오기. 내보내진 상태면 퇴장 화면을 띄우고 멈춤
async function myStatus() {
  const st = await rpc('my_status', { p_id: myId });
  if (st?.kicked) { showKicked(); throw new Error('KICKED'); }
  return st;
}

// ---------- 화면 그리기 ----------
var lastKey = null;
function render(g) {
  const prev = game;
  game = g;
  if (kicked) return;
  // 누군가 내보내졌으면 내가 그 사람인지 한 번 확인 (100명이 몰리지 않게 조금씩 흩어서)
  if (nick && kickSeen != null && g.kick_epoch !== kickSeen) setTimeout(checkKicked, Math.random() * 1500);
  kickSeen = g.kick_epoch ?? 0;
  updateSocial();
  if (!nick) return renderJoin();
  // 진행자가 채팅·맵만 바꾼 경우처럼 진행 단계가 그대로면 화면을 다시 그리지 않음
  // (100명이 한꺼번에 서버에 다시 물어보는 일을 막고, 고르던 화면도 그대로 유지)
  const key = `${g.phase}:${g.q_index}:${g.started_at}:${g.correct}:${nick}`;
  if (prev && key === lastKey) return;
  lastKey = key;
  clearInterval(tick);
  const seq = ++renderSeq;
  switch (g.phase) {
    case 'question':
    case 'closed':      return g.question?.kind === 'slide' ? renderSlidePhone(g) : g.question?.kind === 'game' ? renderGame(g, seq) : renderQuestion(g);
    case 'reveal':      return g.question?.kind === 'slide' ? renderSlidePhone(g) : g.question?.kind === 'game' ? renderGameResult(g, seq) : renderReveal(g, seq);
    case 'leaderboard': return renderRank(g, seq, false);
    case 'end':         return renderRank(g, seq, true);
    default:            return renderLobby(g);
  }
}

function renderLobby(g) {
  view.innerHTML = `
    <div class="center">
      ${meBig(g.q_index < 0 ? 'idle' : 'sleep', 'bob')}
      <div class="hero">${g.q_index < 0 ? '곧 시작합니다' : '잠시 쉬어 갑니다'}</div>
      <div class="sub">${g.q_index < 0 ? '내 캐릭터가 앞쪽 화면에 등장했어요' : '문제가 나오면 이 화면에 보기가 떠요'}</div>
    </div>`;
}

function optionButtons(g, pick, revealCorrect = null) {
  return g.question.options.map((o, i) => {
    let cls = `opt opt-${i}`;
    if (pick != null) cls += i === pick ? ' picked' : ' dim';
    if (revealCorrect != null) cls = `opt opt-${i}` + (i === revealCorrect ? ' picked' : ' dim');
    if (g.question.ox) return `<button class="${cls} ox" data-i="${i}" type="button" aria-label="${i === 0 ? 'O 맞다' : 'X 아니다'}"><span class="ox-mark">${i === 0 ? '○' : '✕'}</span></button>`;
    return `<button class="${cls}" data-i="${i}" type="button"><span class="badge">${LABELS[i]}</span><span class="txt">${esc(o)}</span></button>`;
  }).join('');
}

function metaRow(g, withTimer = false) {
  const k = g.question ? kindOf(g.question) : 'quiz';
  return `<div class="qmeta">
    <span class="pill k-${k}">${KIND_LABEL[k]}</span>
    <span>${g.q_index + 1}번째 문제 (총 ${g.q_total}개)</span>
    ${withTimer ? '<span class="timer"></span>' : ''}
  </div>`;
}

// 발표 중: 폰은 칠판 제목만 보여 주고 스크린을 보게
function renderSlidePhone(g) {
  view.innerHTML = `
    <div class="center">
      ${meBig('happy', 'bob')}
      <div class="slide-chip">📋 발표 중</div>
      <div class="hero">${esc(g.question.text)}</div>
      <div class="sub">스크린의 칠판을 봐 주세요</div>
    </div>`;
}

function renderQuestion(g) {
  const q = g.question;
  const pick = getPick(g);
  const closed = g.phase === 'closed';
  view.innerHTML = `
    ${metaRow(g, true)}
    <div class="qtext">${esc(q.text)}</div>
    <div class="options ${q.ox ? 'ox-grid' : ''}">${optionButtons(g, pick)}</div>
    <div class="status"></div>`;
  const status = view.querySelector('.status');
  const btns = [...view.querySelectorAll('.opt')];
  const lock = () => btns.forEach(b => (b.disabled = true));

  if (closed) {
    lock();
    if (pick == null) btns.forEach(b => b.classList.add('dim'));
    status.textContent = pick == null ? '응답이 마감되었어요.' : '마감되었습니다. 결과를 기다려 주세요.';
    return;
  }
  if (pick != null) { lock(); status.textContent = '제출 완료! 결과를 기다려 주세요.'; }

  const timerEl = view.querySelector('.timer');
  const updateTimer = () => {
    const r = remainingSec(g);
    if (r == null) { timerEl.textContent = ''; return; }
    timerEl.textContent = `${r}초`;
    timerEl.classList.toggle('urgent', r <= 5);
    if (r <= 0 && getPick(g) == null) { lock(); status.textContent = '시간이 끝났어요.'; clearInterval(tick); }
  };
  updateTimer();
  tick = setInterval(updateTimer, 250);

  btns.forEach(b => b.addEventListener('click', async () => {
    if (getPick(g) != null || b.disabled) return;
    const choice = Number(b.dataset.i);
    lock();
    btns.forEach((x, i) => x.classList.add(i === choice ? 'picked' : 'dim'));
    status.textContent = '제출 중…';
    try {
      let res = await rpc('submit_vote', { p_id: myId, p_choice: choice });
      if (res === 'unknown_player') { await rejoin(); res = await rpc('submit_vote', { p_id: myId, p_choice: choice }); }
      if (res === 'ok') {
        setPick(g, choice);
        status.textContent = '제출 완료! 결과를 기다려 주세요.';
      } else if (res === 'already') {
        const st = await myStatus();
        if (st?.choice != null) {
          setPick(g, st.choice);
          btns.forEach((x, i) => { x.classList.toggle('picked', i === st.choice); x.classList.toggle('dim', i !== st.choice); });
        }
        status.textContent = '이미 제출했어요.';
      } else {
        status.textContent = res === 'timeout' ? '시간이 끝났어요.' : '지금은 제출할 수 없어요.';
      }
    } catch (err) {
      // 네트워크 오류: 다시 고를 수 있게 풀어 줌
      btns.forEach((x, i) => { x.disabled = false; x.classList.remove('picked', 'dim'); });
      status.textContent = '전송 실패. 다시 눌러 주세요.';
    }
  }));
}

async function fetchStatus() {
  let st = await myStatus();
  if (!st) { await rejoin(); st = await myStatus(); }
  return st;
}

async function renderReveal(g, seq) {
  const q = g.question;
  const local = getPick(g);
  view.innerHTML = `${metaRow(g)}<div class="center">${meBig('wow', 'bob')}<div class="sub">결과를 확인하고 있어요</div></div>`;
  await jitter(1600);   // 100명이 같은 순간에 몰리지 않게 조금씩 나눠서 물어봄
  let st = null;
  try { st = await fetchStatus(); } catch {}
  if (seq !== renderSeq || kicked) return;
  const pick = st?.choice ?? local;
  const myLine = pick != null
    ? `<div class="answer-line muted">내 선택 <b>${LABELS[pick]}. ${esc(q.options[pick])}</b></div>`
    : '';

  if (q.kind === 'poll') {
    view.innerHTML = `${metaRow(g)}
      <div class="center">
        ${meBig(pick != null ? 'happy' : 'sleep', 'hop')}
        <div class="verdict gold">${pick != null ? '투표 완료' : '투표 마감'}</div>
        ${myLine || '<div class="answer-line muted">이번 투표에는 참여하지 않았어요</div>'}
        <div class="sub">전체 결과는 앞쪽 화면에 나와요</div>
      </div>`;
    return;
  }
  const ok = pick != null && pick === g.correct;
  const state = pick == null ? 'none' : ok ? 'good' : 'bad';
  view.innerHTML = `${metaRow(g)}
    <div class="center">
      ${meBig({ none: 'sleep', good: 'happy', bad: 'sad' }[state], 'hop')}
      <div class="verdict ${state}">${{ none: '시간 초과', good: '정답!', bad: '오답' }[state]}</div>
      <div class="answer-line muted">정답 <b>${LABELS[g.correct]}. ${esc(q.options[g.correct])}</b></div>
      ${state === 'bad' ? myLine : ''}
      ${st ? `<div class="stats">
        <div class="stat"><b>${st.score.toLocaleString()}</b><span>누적 점수</span></div>
        <div class="stat"><b>${st.rank}위</b><span>${st.players}명 중</span></div>
      </div>` : ''}
    </div>`;
}

async function renderRank(g, seq, final) {
  view.innerHTML = `<div class="center">${meBig('wow', 'bob')}<div class="sub">순위를 집계하고 있어요</div></div>`;
  await jitter(1600);
  let st = null;
  try { st = await fetchStatus(); } catch {}
  if (seq !== renderSeq || kicked) return;
  const podium = st && st.rank <= 3;
  view.innerHTML = `
    <div class="center">
      ${meBig(podium ? 'happy' : 'idle', 'hop')}
      <div class="verdict ${podium ? 'gold' : ''}">${final ? '최종 순위' : '지금 내 순위'}</div>
      ${st ? `<div class="stats">
        <div class="stat ${podium ? 'hl' : ''}"><b>${st.rank}위</b><span>${st.players}명 중</span></div>
        <div class="stat"><b>${st.score.toLocaleString()}</b><span>점수 (정답 ${st.correct}개)</span></div>
      </div>` : '<div class="sub">순위를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</div>'}
      ${final ? '<div class="sub">참여해 주셔서 감사합니다</div>' : ''}
    </div>`;
}

// ---------- 미니게임 ----------
const playKey = g => `qs.play.${g.q_index}.${g.started_at}`;

function rng(seed) {                 // 모두 같은 배치를 보도록 같은 seed 로 섞음
  let a = Number(seed) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function renderGame(g, seq) {
  const q = g.question;
  const info = GAMES[q.game] || GAMES.order;
  const alive = () => seq === renderSeq;
  view.innerHTML = `${metaRow(g, true)}
    <div class="game-head"><div class="game-title">${esc(info.name)}</div><div class="sub">${info.hint}</div></div>
    <div class="game-area" id="ga"></div>
    <div class="status" id="gs"></div>`;
  const ga = $('#ga'), gs = $('#gs');
  const timerEl = view.querySelector('.timer');
  tick = setInterval(() => {
    const r = remainingSec(g);
    if (timerEl) { timerEl.textContent = r == null ? '' : `${r}초`; timerEl.classList.toggle('urgent', r != null && r <= 5); }
  }, 250);

  const saved = store.get(playKey(g));
  if (saved != null) return showPlayed(g, Number(saved), seq);
  if (g.phase === 'closed') { ga.innerHTML = `<div class="game-big">게임 종료</div>`; gs.textContent = '이번 게임에는 기록이 없어요.'; return; }

  const startAt = parseTs(g.started_at) + 3000;     // 모두 같은 순간에 시작 (3초 카운트다운)
  const begin = { order: playOrder, reaction: playReaction, tap: playTap }[q.game] || playOrder;
  const countdown = () => {
    if (!alive()) return;
    const left = startAt - serverNow();
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (ga.dataset.n !== String(n)) { ga.dataset.n = n; ga.innerHTML = `<div class="game-count">${n}</div>`; }
      return requestAnimationFrame(countdown);
    }
    if (remainingSec(g) === 0) { ga.innerHTML = `<div class="game-big">시간 종료</div>`; return; }
    begin(g, ga, gs, alive);
  };
  countdown();
}

async function finishPlay(g, value, seq) {
  store.set(playKey(g), String(value));
  try {
    let res = await rpc('submit_game', { p_id: myId, p_value: value });
    if (res === 'unknown_player') { await rejoin(); res = await rpc('submit_game', { p_id: myId, p_value: value }); }
    if (res === 'timeout' || res === 'closed') { $('#gs') && ($('#gs').textContent = '아쉽게도 시간이 지나 기록되지 않았어요.'); return; }
  } catch { /* 네트워크 오류: 아래 화면은 보여 줌 */ }
  showPlayed(g, value, seq);
}

async function showPlayed(g, value, seq) {
  const ga = $('#ga'), gs = $('#gs');
  if (!ga) return;
  ga.innerHTML = `<div class="game-done">${meBig('happy', 'hop')}<div class="game-record">${fmtPlay(g.question.game, value)}</div></div>`;
  gs.textContent = '순위 확인 중…';
  await jitter(700);
  if (seq !== renderSeq || kicked) return;
  try {
    const st = await myStatus();
    if (seq !== renderSeq || kicked) return;
    gs.textContent = st?.play_rank ? `지금까지 ${st.play_rank}위예요! 결과 발표를 기다려 주세요.` : '결과 발표를 기다려 주세요.';
  } catch { gs.textContent = '결과 발표를 기다려 주세요.'; }
}

function playOrder(g, ga, gs, alive) {
  const size = g.question.size || 4, N = size * size;
  const nums = Array.from({ length: N }, (_, i) => i + 1);
  const rand = rng(g.question.seed);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  ga.innerHTML = `<div class="next-num">다음 숫자 <b id="nn">1</b></div>
    <div class="num-grid" style="--n:${size}">${nums.map(v => `<button class="cell" type="button" data-v="${v}">${v}</button>`).join('')}</div>`;
  let next = 1;
  const t0 = performance.now();
  const seq = renderSeq;
  gs.textContent = '';
  ga.querySelector('.num-grid').addEventListener('pointerdown', e => {
    const c = e.target.closest('.cell');
    if (!c || c.disabled || !alive()) return;
    e.preventDefault();
    if (Number(c.dataset.v) === next) {
      c.classList.add('hit'); c.disabled = true; next++;
      if (next > N) return finishPlay(g, Math.round(performance.now() - t0), seq);
      $('#nn').textContent = next;
    } else {
      c.classList.remove('miss'); void c.offsetWidth; c.classList.add('miss');
      navigator.vibrate?.(40);
    }
  });
}

function playReaction(g, ga, gs, alive) {
  const goAt = parseTs(g.started_at) + 3000 + (g.question.delay_ms || 3000);
  ga.innerHTML = `<button class="react wait" id="rb" type="button">기다리세요…<small>초록색이 되면 터치!</small></button>`;
  const rb = $('#rb');
  const seq = renderSeq;
  let shownAt = null, done = false;
  const end = v => { if (done) return; done = true; finishPlay(g, v, seq); };
  rb.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (done) return;
    if (shownAt == null) { rb.className = 'react foul'; rb.innerHTML = '부정 출발!<small>너무 빨랐어요</small>'; return end(3000); }
    end(Math.max(50, Math.round(performance.now() - shownAt)));
  });
  const loop = () => {
    if (!alive() || done) return;
    if (shownAt == null && serverNow() >= goAt) {
      rb.className = 'react go'; rb.innerHTML = '지금!';
      shownAt = performance.now();
      setTimeout(() => end(3000), 3000);           // 3초 안에 안 누르면 기록 3초
    }
    requestAnimationFrame(loop);
  };
  loop();
}

function playTap(g, ga, gs, alive) {
  const dur = (g.question.duration || 10) * 1000;
  ga.innerHTML = `<div class="tap-count" id="tc">0</div><button class="tap-btn" id="tb" type="button">눌러!</button><div class="tap-time" id="tt"></div>`;
  const tb = $('#tb'), tc = $('#tc'), tt = $('#tt');
  const seq = renderSeq;
  const endAt = performance.now() + dur;
  let count = 0, over = false;
  tb.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (over) return;
    count++;
    tc.textContent = count;
    tb.classList.remove('pop'); void tb.offsetWidth; tb.classList.add('pop');
  });
  const loop = () => {
    if (!alive() || over) return;
    const left = endAt - performance.now();
    tt.textContent = `${Math.max(0, left / 1000).toFixed(1)}초`;
    if (left <= 0) { over = true; tb.disabled = true; tb.textContent = '끝!'; return finishPlay(g, count, seq); }
    requestAnimationFrame(loop);
  };
  loop();
}

async function renderGameResult(g, seq) {
  view.innerHTML = `${metaRow(g)}<div class="center">${meBig('wow', 'bob')}<div class="sub">결과를 확인하고 있어요</div></div>`;
  await jitter(1000);
  let st = null;
  try { st = await fetchStatus(); } catch {}
  if (seq !== renderSeq || kicked) return;
  const info = GAMES[g.question.game] || GAMES.order;
  const played = st?.play != null;
  const top3 = played && st.play_rank <= 3;
  view.innerHTML = `${metaRow(g)}
    <div class="center">
      ${meBig(!played ? 'sleep' : top3 ? 'happy' : 'idle', 'hop')}
      <div class="verdict ${top3 ? 'gold' : played ? '' : 'none'}">${played ? `${st.play_rank}위!` : '기록 없음'}</div>
      <div class="answer-line">${esc(info.name)} ${played ? `<b>${fmtPlay(g.question.game, st.play)}</b>` : ''}</div>
      ${st ? `<div class="stats">
        <div class="stat"><b>${st.score.toLocaleString()}</b><span>누적 점수</span></div>
        <div class="stat"><b>${st.rank}위</b><span>${st.players}명 중</span></div>
      </div>` : ''}
    </div>`;
}

// ---------- 리액션 · 말풍선 채팅 ----------
function updateSocial() {
  const g = game;
  const playing = g && g.phase === 'question' && g.question?.kind === 'game';   // 게임 중엔 손가락이 바쁘니 숨김
  const show = !!nick && !playing && !kicked;
  $('#social').classList.toggle('hidden', !show);
  document.body.classList.toggle('has-social', show);
  const chatOn = g ? g.chat_on !== false : true;
  $('#chat-toggle').classList.toggle('hidden', !chatOn);
  if (!chatOn) $('#chat-row').classList.add('hidden');
  if (typeof syncChatLog === 'function') syncChatLog();
}

let socialMsgTimer = null;
function socialMsg(text) {
  const el = $('#social-msg');
  el.textContent = text;
  clearTimeout(socialMsgTimer);
  socialMsgTimer = setTimeout(() => (el.textContent = ''), 2200);
}

async function sendFeed(kind, body) {
  let r = await rpc('send_feed', { p_id: myId, p_kind: kind, p_body: body });
  if (r === 'unknown_player') { await rejoin(); r = await rpc('send_feed', { p_id: myId, p_kind: kind, p_body: body }); }
  return r;
}

// 댄스: 스크린 속 내 아바타가 3초 동안 춤춰요. 폰에서도 내 아바타가 같이 춤춰요
function danceHere(d) {
  document.querySelectorAll('.me-big .stage-av, #me-avatar').forEach(el => {
    el.classList.remove('dance-d1', 'dance-d2', 'dance-d3'); void el.offsetWidth;
    el.classList.add(`dance-${d}`);
    clearTimeout(el._dt);
    el._dt = setTimeout(() => el.classList.remove(`dance-${d}`), 3000);
  });
}
$('#social').addEventListener('click', async e => {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  danceHere(b.dataset.d);
  try {
    const r = await sendFeed(1, b.dataset.d);
    if (r === 'ok') socialMsg('스크린에서 내 아바타가 춤추는 중!');
    else if (r === 'slow') socialMsg('춤이 끝나면 다시 눌러 주세요');
  } catch {}
});
$('#chat-toggle').addEventListener('click', () => {
  const row = $('#chat-row');
  row.classList.toggle('hidden');
  syncChatLog();
  if (!row.classList.contains('hidden')) $('#chat-in').focus();
});

// ---------- 다른 사람 채팅 보기 ----------
// 채팅창을 열었을 때(또는 띠별 수다 중)에만 2.5초마다 새 채팅을 가져와요.
// 100명이 늘 가져오면 서버가 바빠지니까, 보고 있을 때만 + 새로 온 것만 받아요.
let feedAfter = null, feedBusy = false;
const chatOpen = () => !$('#chat-row').classList.contains('hidden') && !$('#social').classList.contains('hidden');
function syncChatLog() {
  const open = chatOpen();
  $('#chat-log').classList.toggle('hidden', !open);
  document.body.classList.toggle('has-chatlog', open);
  if (open) pollChat();
}
async function pollChat() {
  if (!chatOpen() || document.hidden || feedBusy) return;
  feedBusy = true;
  try {
    const f = await rpc('get_feed', { p_after: feedAfter ?? 0 });
    const list = $('#chat-log');
    if (feedAfter == null || f.epoch !== list._epoch) { list.innerHTML = ''; list._epoch = f.epoch; }
    f.items.filter(it => it.t === 0).slice(-30).forEach(it => {
      const li = document.createElement('li');
      const same = false;
      li.className = (it.v ? 'vip ' : '') + (same ? 'same' : '');
      li.innerHTML = `<span class="cl-av">${avatarSVG(it.a)}</span><b></b><span class="cl-t"></span>`;
      li.querySelector('b').textContent = (it.v ? '★ ' : '') + it.n;
      li.querySelector('.cl-t').textContent = it.b;
      list.append(li);
    });
    while (list.children.length > 40) list.firstElementChild.remove();
    if (f.items.length || feedAfter == null) list.scrollTop = list.scrollHeight;
    feedAfter = f.last;
  } catch {} finally { feedBusy = false; }
}
setInterval(pollChat, 2500);
$('#chat-row').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#chat-in').value.trim();
  if (!text) return;
  try {
    const r = await sendFeed(0, text);
    if (r === 'ok') { $('#chat-in').value = ''; socialMsg('스크린 채팅창에 올라갔어요!'); pollChat(); }
    else if (r === 'slow') socialMsg('3초 뒤에 다시 보내 주세요');
    else if (r === 'off') { socialMsg('지금은 채팅이 꺼져 있어요'); $('#chat-row').classList.add('hidden'); }
    else socialMsg('보내지 못했어요');
  } catch { socialMsg('보내지 못했어요. 다시 눌러 주세요'); }
});

// ---------- 시작 ----------
showMe();
if (!nick) renderJoin();
else rejoin().catch(() => {});
syncClock();
if (nick) checkKicked();
watchGame(render, on => $('#conn').classList.toggle('on', on), { realtime: false, pollMs: 1200 });
