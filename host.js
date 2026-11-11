import { rpc, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE, joinUrl } from './common.js';
import { parseQuestions, toText, SAMPLE } from './questions-format.js';

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
}

// ---------- 문항 편집 ----------
$('#sample').addEventListener('click', () => {
  if ($('#editor').value.trim() && !confirm('편집 중인 내용을 예시로 바꿀까요?')) return;
  $('#editor').value = SAMPLE; store.set('qs.editor', SAMPLE);
});

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
      <span class="tag ${q.kind === 'poll' ? 'poll' : 'quiz'}">${q.kind === 'poll' ? '투표' : `정답 ${LABELS[q.answer]}`}</span>
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

const A = {
  show: i => act(() => rpc('host_show_question', { p_pin: pin, p_index: i })),
  close: () => act(() => rpc('host_close', { p_pin: pin })),
  reveal: () => act(() => rpc('host_reveal', { p_pin: pin })),
  phase: p => act(() => rpc('host_set_phase', { p_pin: pin, p_phase: p })),
};

function nextAction() {
  const g = game;
  if (!g) return { label: '연결 중…' };
  const total = g.q_total, i = g.q_index, hasNext = i + 1 < total;
  const goNext = hasNext
    ? { label: `${i + 2}번 문제 시작`, run: () => A.show(i + 1) }
    : { label: '최종 결과 발표', run: () => A.phase('end') };
  switch (g.phase) {
    case 'lobby':
      if (!total) return { label: '먼저 문항을 저장해 주세요' };
      return goNext;
    case 'question': return { label: '응답 마감', run: A.close };
    case 'closed': return { label: g.question?.kind === 'poll' ? '투표 결과 공개' : '정답 공개', run: A.reveal };
    case 'reveal':
      if (g.question?.kind === 'quiz') return { label: '순위 보기', run: () => A.phase('leaderboard') };
      return goNext;
    case 'leaderboard': return goNext;
    case 'end': return { label: '종료되었습니다' };
  }
  return { label: '-' };
}

function updateControls() {
  const n = nextAction();
  const btn = $('#next');
  btn.textContent = n.label;
  btn.disabled = busy || !n.run;
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

const PHASE_NAME = { lobby: '대기 중', question: '응답 받는 중', closed: '마감됨', reveal: '결과 공개', leaderboard: '순위 발표', end: '종료' };

function onGame() {
  const g = game;
  $('#phase').textContent = PHASE_NAME[g.phase] || g.phase;
  $('#phase').classList.toggle('live', g.phase === 'question');
  $('#qpos').textContent = g.q_index >= 0 ? `${g.q_index + 1}번째 문제 (총 ${g.q_total}개)` : `문제 ${g.q_total}개 준비됨`;
  $('#curq').textContent = g.q_index >= 0 && g.question ? g.question.text : '';
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

async function pollBoard() {
  if (!game || document.hidden) return;
  try {
    const lb = await rpc('get_leaderboard', { p_limit: 10 });
    $('#lb').innerHTML = lb.length
      ? lb.map(r => `<li><b>${r.rank}</b><span>${esc(r.nickname)}</span><span class="s">${r.score.toLocaleString()}점</span></li>`).join('')
      : '<li class="muted">아직 참가자가 없습니다</li>';
  } catch {}
}
