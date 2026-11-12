import { rpc, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE, joinUrl } from './common.js';
import { parseQuestions, toText, SAMPLE, TEMPLATES, KIND_LABEL, kindOf, GAMES, fmtPlay, showOf, SHOW_LABEL } from './questions-format.js';
import { nextAction as flowNext, hostActions, PHASE_NAME } from './flow.js';
import { avatarSVG } from './characters.js';

if (!configured) { showConfigError(); throw new Error('config.js not set'); }

document.title = `${TITLE} · 진행자`;
$('#title').textContent = `${TITLE} · 진행자`;

let pin = sessionStorage.getItem('qs.pin');
let questions = [];      // 서버에 저장된 문항 (정답 포함)
let game = null;
let busy = false;
let closeTimer = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function msg(el, text, kind = '') { el.textContent = text; el.className = `msg ${kind}`; }

// ---------- 로그인 ----------
$('#login').addEventListener('submit', async e => {
  e.preventDefault();
  const p = e.target.pin.value.trim();
  try {
    const res = await rpc('host_check', { p_pin: p });
    pin = p; sessionStorage.setItem('qs.pin', p);
    start(res.questions);
  } catch (err) { msg($('#login-msg'), err.message, 'err'); }
});

$('#logout').addEventListener('click', e => { e.preventDefault(); sessionStorage.removeItem('qs.pin'); location.reload(); });

if (pin) {
  rpc('host_check', { p_pin: pin }).then(r => start(r.questions)).catch(() => { sessionStorage.removeItem('qs.pin'); pin = null; });
}

let started = false;
function start(qs) {
  if (started) return;
  started = true;
  questions = qs || [];
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#link-screen').href = new URL('screen.html', location.href).href;
  $('#link-join').href = joinUrl();
  
  const saved = store.get('qs.editor');
  $('#editor').value = saved ?? (questions.length ? toText(questions) : SAMPLE);
  $('#editor').addEventListener('input', () => store.set('qs.editor', $('#editor').value));

  renderQList();
  syncClock();
  watchGame(g => { game = g; onGame(); }, on => $('#conn').classList.toggle('on', on));
  setInterval(tick, 250);
  setInterval(pollTally, 1000);
  setInterval(pollBoard, 5000);
  pollPeople();
  setInterval(pollPeople, 5000);
}

// ---------- 문항 편집 ----------
$('#sample').addEventListener('click', () => {
  if ($('#editor').value.trim() && !confirm('편집 중인 내용을 예시로 바꿀까요?')) return;
  $('#editor').value = SAMPLE; store.set('qs.editor', SAMPLE);
});

// 유형별 틀 추가 버튼
document.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => {
  const ed = $('#editor');
  const cur = ed.value.replace(/\s+$/, '');
  ed.value = (cur ? cur + '\n\n' : '') + TEMPLATES[b.dataset.tpl] + '\n';
  store.set('qs.editor', ed.value);
  ed.focus();
  ed.scrollTop = ed.scrollHeight;
  msg($('#edit-msg'), '맨 아래에 틀을 추가했어요. 내용을 고친 뒤 "문항 저장"을 눌러 주세요.', 'ok');
}));

$('#load-server').addEventListener('click', async () => {
  try {
    const r = await rpc('host_check', { p_pin: pin });
    questions = r.questions || [];
    if (!questions.length) return msg($('#edit-msg'), '서버에 저장된 문항이 없습니다.', 'err');
    $('#editor').value = toText(questions); store.set('qs.editor', $('#editor').value);
    renderQList();
    msg($('#edit-msg'), `${questions.length}개 문항을 불러왔습니다.`, 'ok');
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});

$('#upload').addEventListener('click', async () => {
  let qs;
  try { qs = parseQuestions($('#editor').value); }
  catch (err) { return msg($('#edit-msg'), err.message, 'err'); }
  if (game && ['question', 'closed'].includes(game.phase) &&
      !confirm('문항이 진행 중입니다. 그래도 문항 목록을 바꿀까요? (진행 중인 문항은 그대로 유지됩니다)')) return;
  try {
    const n = await rpc('host_load_questions', { p_pin: pin, p_questions: qs });
    questions = qs;
    renderQList(); updateControls();
    msg($('#edit-msg'), `✔ ${n}개 문항을 저장했습니다.`, 'ok');
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});

function renderQList() {
  $('#qcount').textContent = questions.length ? `(${questions.length}개)` : '';
  if (!questions.length) { $('#qlist').innerHTML = '<li class="muted">문항을 아래에서 올려 주세요</li>'; return; }
  $('#qlist').innerHTML = questions.map((q, i) => `
    <li class="${game && game.q_index === i ? 'cur' : ''}">
      <span class="num">${i + 1}</span>
      <span class="t" title="${esc(q.text)}">${esc(q.text)}</span>
      <span class="tag k-${kindOf(q)}">${KIND_LABEL[kindOf(q)]}${kindOf(q) === 'quiz' ? ` · 정답 ${LABELS[q.answer]}` : kindOf(q) === 'ox' ? ` · ${q.answer === 0 ? 'O' : 'X'}` : ''}</span>
      ${q.kind !== 'game' ? `<span class="tag k-show">${SHOW_LABEL[showOf(q)]}</span>` : ''}
      <button class="btn ghost sm" type="button" data-start="${i}">시작</button>
    </li>`).join('');
}

$('#qlist').addEventListener('click', e => {
  const b = e.target.closest('[data-start]');
  if (!b) return;
  const i = Number(b.dataset.start);
  if (game && ['question', 'closed'].includes(game.phase) && game.q_index !== i &&
      !confirm('진행 중인 문항이 있습니다. 바로 다른 문항으로 넘어갈까요?')) return;
  if (game && game.q_index === i && game.phase !== 'lobby' &&
      !confirm(`${i + 1}번 문항을 처음부터 다시 시작할까요? (이 문항의 응답은 지워집니다)`)) return;
  act(() => rpc('host_show_question', { p_pin: pin, p_index: i }));
});

// ---------- 진행 ----------
async function act(fn) {
  if (busy) return;
  busy = true; updateControls();
  try { await fn(); msg($('#msg'), ''); }
  catch (err) { msg($('#msg'), err.message, 'err'); }
  finally { busy = false; updateControls(); }
}

const A = hostActions(() => pin, act);
const nextAction = () => flowNext(game, A);

// 지금 무슨 상태이고 다음에 뭘 하면 되는지 한 줄로
function hintFor(g) {
  if (!g) return '';
  const k = g.question?.kind;
  switch (g.phase) {
    case 'lobby': return g.q_total ? '참가자들이 QR로 입장하는 중이에요. 다 모이면 위 버튼으로 시작하세요.' : '오른쪽에서 문항을 만들고 "문항 저장"부터 눌러 주세요.';
    case 'question': return k === 'game' ? '참가자들이 게임 중이에요. 시간이 끝나면 자동으로 종료돼요.' : '참가자들이 답을 고르는 중이에요. 시간이 끝나면 자동으로 마감돼요.';
    case 'closed': return k === 'poll' ? '마감됐어요. 결과를 공개하면 스크린에 아바타들이 모여요.' : k === 'game' ? '게임이 끝났어요. 결과를 공개하면 스크린에 순위가 나와요.' : '마감됐어요. 정답을 공개하면 스크린에 누가 뭘 골랐는지 나와요.';
    case 'reveal': return '스크린에서 결과를 보여 주는 중이에요. 다음으로 넘어가세요.';
    case 'leaderboard': return '스크린에 현재 순위가 나와 있어요.';
    case 'end': return '행사가 끝났어요. 다시 하려면 아래 "점수만 초기화"를 누르세요.';
  }
  return '';
}

function updateControls() {
  const n = nextAction();
  const btn = $('#next');
  btn.textContent = n.label;
  btn.disabled = busy || !n.run;
  $('#hint').textContent = hintFor(game);
  const ph = game?.phase;
  document.querySelectorAll('[data-act]').forEach(b => {
    const a = b.dataset.act;
    let ok = !busy && !!game;
    if (a === 'close') ok &&= ph === 'question';
    if (a === 'reveal') ok &&= ['question', 'closed'].includes(ph);
    b.disabled = !ok;
  });
}

$('#next').addEventListener('click', () => nextAction().run?.());

// 채팅 지우기 (스크린 채팅창도 비워짐). 채팅은 이 버튼이나 초기화 전까지 계속 남아요
$('#chat-clear').addEventListener('click', () => {
  if (confirm('지금까지의 채팅을 모두 지울까요? 스크린 채팅창도 비워져요.'))
    act(() => rpc('host_clear_chat', { p_pin: pin }));
});

// 채팅 켜기/끄기 (댄스는 항상 허용)
$('#chat-toggle').addEventListener('click', () => {
  if (!game) return;
  act(() => rpc('host_set_chat', { p_pin: pin, p_on: game.chat_on === false }));
});

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); nextAction().run?.(); }
});

document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  const a = b.dataset.act;
  if (a === 'close') A.close();
  else if (a === 'reveal') A.reveal();
  else if (a === 'leaderboard' || a === 'lobby' || a === 'end') A.phase(a);
  else if (a === 'reset-scores') {
    if (confirm('모든 점수와 응답을 지우고 대기 화면으로 돌아갑니다. 참가자는 그대로 남습니다. 계속할까요?'))
      act(() => rpc('host_reset', { p_pin: pin, p_keep_players: true }));
  } else if (a === 'reset-all') {
    if (confirm('참가자·점수·응답을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?'))
      act(() => rpc('host_reset', { p_pin: pin, p_keep_players: false }));
  }
}));


function onGame() {
  const g = game;
  $('#phase').textContent = PHASE_NAME[g.phase] || g.phase;
  $('#phase').classList.toggle('live', g.phase === 'question');
  $('#chat-toggle').textContent = g.chat_on === false ? '채팅 켜기 (지금 꺼짐)' : '채팅 끄기';
  $('#qpos').textContent = g.q_index >= 0 ? `${g.q_index + 1}번째 문제 (총 ${g.q_total}개)` : `문제 ${g.q_total}개 준비됨`;
  $('#curq').textContent = g.q_index >= 0 && g.question
    ? `[${KIND_LABEL[kindOf(g.question)]}] ${g.question.kind === 'game' ? (GAMES[g.question.game]?.name || g.question.text) : g.question.text}` : '';
  if (g.phase !== 'question') { clearTimeout(closeTimer); closeTimer = null; }
  renderQList();
  updateControls();
  pollTally();
  if (['reveal', 'leaderboard', 'end', 'lobby'].includes(g.phase)) pollBoard();
}

// 타이머 & 시간 종료 시 자동 마감 (네트워크 여유 1.5초 후)
function tick() {
  if (!game) return;
  const r = game.phase === 'question' ? remainingSec(game) : null;
  $('#timer').textContent = r == null ? '' : `${r}초`;
  if (r === 0 && !closeTimer) {
    const key = game.started_at;
    closeTimer = setTimeout(() => {
      if (game.phase === 'question' && game.started_at === key) A.close();
    }, 1500);
  }
}

let lastTally = null;
async function pollTally() {
  if (!game || document.hidden) return;
  try {
    const t = await rpc('get_tally', { p_pin: pin });
    lastTally = t;
    renderBars(t);
  } catch {}
}

function renderBars(t) {
  const g = game;
  $('#answered').textContent = `응답 ${t.voted}명 / 참가 ${t.players}명`;
  if (!g || g.q_index < 0 || !g.question || g.phase === 'lobby' && t.q_index < 0) { $('#bars').innerHTML = ''; return; }
  const q = g.question;
  if (q.kind === 'game') return renderGameBoard(g);
  const ans = questions[g.q_index]?.kind === 'quiz' ? questions[g.q_index]?.answer : null;
  const counts = t.counts || q.options.map(() => 0);
  const max = Math.max(1, ...counts);
  $('#bars').innerHTML = q.options.map((o, i) => `
    <div class="bar opt-${i} ${i === ans ? 'correct' : ''}">
      <span class="badge">${i === ans ? '✓' : LABELS[i]}</span>
      <div class="track"><div class="fill" style="width:${(counts[i] / max) * 100}%"></div><span class="name">${esc(o)}</span></div>
      <span class="n">${counts[i]}</span>
    </div>`).join('');
}

async function renderGameBoard(g) {
  try {
    const b = await rpc('get_game_board', { p_limit: 5 });
    if (game !== g) return;
    $('#bars').innerHTML = `<div class="game-board"><div class="muted">기록 ${b.done}명 / 참가 ${b.players}명</div>${
      b.top.map(r => `<div class="gb-row"><b>${r.rank}</b><span class="gb-av">${avatarSVG(r.a)}</span><span>${esc(r.n)}</span><span class="s">${fmtPlay(g.question.game, r.v)}</span></div>`).join('')
      || '<div class="muted">아직 기록이 없어요</div>'}</div>`;
  } catch {}
}

async function pollBoard() {
  if (!game || document.hidden) return;
  try {
    const lb = await rpc('get_leaderboard', { p_limit: 10 });
    $('#lb').innerHTML = lb.length
      ? lb.map(r => `<li><b>${r.rank}</b><span>${esc(r.nickname)}</span><span class="s">${r.score.toLocaleString()}점</span></li>`).join('')
      : '<li class="muted">아직 참가자가 없습니다</li>';
  } catch {}
}

// ---------- 참가자 목록 · 크게 보일 사람(★) ----------
let people = [];
async function pollPeople() {
  if (document.hidden) return;
  try { people = await rpc('host_people', { p_pin: pin }); renderPeople(); } catch {}
}
function renderPeople() {
  const q = $('#ppl-search').value.trim();
  const list = q ? people.filter(p => p.n.includes(q)) : people;
  const vips = people.filter(p => p.v).length;
  $('#ppl-count').textContent = people.length ? `(${people.length}명${vips ? ` · ★ ${vips}명` : ''})` : '';
  $('#ppl').innerHTML = list.length
    ? list.slice(0, 200).map(p => `<li class="${p.v ? 'on' : ''}">
        <span class="ppl-av">${avatarSVG(p.a)}</span><span class="ppl-n">${esc(p.n)}</span>
        <button type="button" class="star" data-vip="${p.id}" aria-pressed="${p.v}" title="${p.v ? '크게 보기 끄기' : '크게 보기'}">${p.v ? '★ 크게' : '☆'}</button></li>`).join('')
    : `<li class="muted">${q ? '찾는 이름이 없어요' : '아직 참가자가 없습니다'}</li>`;
}
$('#ppl-search').addEventListener('input', renderPeople);
$('#ppl').addEventListener('click', async e => {
  const b = e.target.closest('[data-vip]');
  if (!b) return;
  const p = people.find(x => x.id === b.dataset.vip);
  if (!p) return;
  p.v = !p.v; renderPeople();
  try { await rpc('host_set_vip', { p_pin: pin, p_sid: p.id, p_on: p.v }); }
  catch (err) { p.v = !p.v; renderPeople(); msg($('#msg'), err.message, 'err'); }
});
