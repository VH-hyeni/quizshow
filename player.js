import { rpc, $, esc, jitter, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE } from './common.js';
import { avatarSVG, normAvatar, randomAvatar, PARTS, PART_KEYS, PRESETS, HAIR, SKIN, CLOTH } from './characters.js';

if (!configured) { showConfigError(); throw new Error('config.js not set'); }

document.title = `${TITLE} 참가`;
$('#title').textContent = TITLE;

const view = $('#view');
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
let avatar = (() => { try { return normAvatar(JSON.parse(store.get('qs.avatar'))); } catch { return null; } })() || randomAvatar();
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

  const SWATCH = { hc: HAIR, s: SKIN, oc: CLOTH };
  let tab = 'h';
  const thumb = (k, i) => SWATCH[k]
    ? `<span class="swatch" style="background:${SWATCH[k][i]}"></span>`
    : avatarSVG({ ...avatar, [k]: i }, 'idle');
  const paint = () => {
    $('#pv').innerHTML = avatarSVG(avatar, 'idle', 'sticker');
    $('#tabs').innerHTML = PART_KEYS.map(k =>
      `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${PARTS[k].label}</button>`).join('');
    $('#pickers').innerHTML = `<div class="picks ${SWATCH[tab] ? 'swatches' : ''}">${PARTS[tab].names.map((n, i) =>
      `<button type="button" class="pick" data-k="${tab}" data-v="${i}" aria-pressed="${avatar[tab] === i}">${thumb(tab, i)}<span>${n}</span></button>`).join('')}</div>`;
  };
  paint();
  $('#tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab');
    if (t) { tab = t.dataset.tab; paint(); }
  });
  $('#pickers').addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (!b) return;
    avatar = { ...avatar, [b.dataset.k]: Number(b.dataset.v) };
    paint();
    $('#pv svg').classList.add('wiggle');
  });
  $('#bamti').addEventListener('click', () => {
    avatar = { ...PRESETS['밤티'] };
    if (!input.value.trim()) { input.value = '밤티'; showName(); }
    paint(); $('#pv svg').classList.add('wiggle');
  });
  $('#rand').addEventListener('click', () => { avatar = randomAvatar(); paint(); $('#pv svg').classList.add('wiggle'); });

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
      if (game) render(game);
    } catch (err) {
      form.querySelector('.err').textContent = err.message;
      btn.disabled = false;
    }
  });
}

async function rejoin() {
  if (nick) await rpc('join_game', { p_id: myId, p_nickname: nick, p_avatar: avatar });
}

// ---------- 화면 그리기 ----------
function render(g) {
  game = g;
  clearInterval(tick);
  if (!nick) return renderJoin();
  const seq = ++renderSeq;
  switch (g.phase) {
    case 'question':
    case 'closed':      return renderQuestion(g);
    case 'reveal':      return renderReveal(g, seq);
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
    return `<button class="${cls}" data-i="${i}" type="button"><span class="badge">${LABELS[i]}</span><span class="txt">${esc(o)}</span></button>`;
  }).join('');
}

function metaRow(g, withTimer = false) {
  const poll = g.question?.kind === 'poll';
  return `<div class="qmeta">
    <span class="pill ${poll ? 'butter' : ''}">${poll ? '투표' : '퀴즈'}</span>
    <span>${g.q_index + 1}번째 문제 (총 ${g.q_total}개)</span>
    ${withTimer ? '<span class="timer"></span>' : ''}
  </div>`;
}

function renderQuestion(g) {
  const q = g.question;
  const pick = getPick(g);
  const closed = g.phase === 'closed';
  view.innerHTML = `
    ${metaRow(g, true)}
    <div class="qtext">${esc(q.text)}</div>
    <div class="options">${optionButtons(g, pick)}</div>
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
        const st = await rpc('my_status', { p_id: myId });
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
  let st = await rpc('my_status', { p_id: myId });
  if (!st) { await rejoin(); st = await rpc('my_status', { p_id: myId }); }
  return st;
}

async function renderReveal(g, seq) {
  const q = g.question;
  const local = getPick(g);
  view.innerHTML = `${metaRow(g)}<div class="center">${meBig('wow', 'bob')}<div class="sub">결과를 확인하고 있어요</div></div>`;
  await jitter(1000);
  let st = null;
  try { st = await fetchStatus(); } catch {}
  if (seq !== renderSeq) return;
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
  await jitter(1000);
  let st = null;
  try { st = await fetchStatus(); } catch {}
  if (seq !== renderSeq) return;
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

// ---------- 시작 ----------
showMe();
if (!nick) renderJoin();
else rejoin().catch(() => {});
syncClock();
watchGame(render, on => $('#conn').classList.toggle('on', on));
