import { rpc, refreshGame, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE, joinUrl } from './common.js?v=20261119f';
import { parseQuestions, toText, SAMPLE, TEMPLATES, KIND_LABEL, kindOf, GAMES, fmtPlay, showOf, SHOW_LABEL, revealOf } from './questions-format.js?v=20261119f';
import { nextAction as flowNext, prevAction, hostActions, PHASE_NAME } from './flow.js?v=20261119f';
import { avatarSVG } from './characters.js?v=20261119f';

if (!configured) { showConfigError(); throw new Error('config.js not set'); }

document.title = `${TITLE} · 진행자`;
$('#title').textContent = `${TITLE} · 진행자`;

let pin = sessionStorage.getItem('qs.pin');
let questions = [];      // 서버에 저장된 문항 (정답 포함)
let game = null;
let busy = false;
let closeTimer = null;
let revealKey = null;

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
  loadGallery(); loadSets();
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
    // 이름이 있으면 문제셋에도 같이 저장
    const name = $('#set-name').value.trim();
    if (name) { try { await saveSet(true); } catch {} store.set('qs.liveSet', name); }
    else store.set('qs.liveSet', '');
    renderQList(); updateControls();
    msg($('#edit-msg'), `✔ ${name ? `'${name}' ` : ''}${n}개 문항으로 진행할 준비가 됐어요.`, 'ok');
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});

function renderQList() {
  const live = store.get('qs.liveSet');
  $('#qcount').textContent = questions.length ? `${live ? `· ${live} ` : ''}(${questions.length}개)` : '';
  if (!questions.length) { $('#qlist').innerHTML = '<li class="muted">문항을 아래에서 올려 주세요</li>'; return; }
  $('#qlist').innerHTML = questions.map((q, i) => `
    <li class="${game && game.q_index === i ? 'cur' : ''}" draggable="true" data-i="${i}">
      <span class="grip" title="끌어서 순서 바꾸기" aria-hidden="true">⠿</span>
      <span class="num">${i + 1}</span>
      <span class="t" title="${esc(q.text)}">${esc(q.text)}</span>
      <span class="tag k-${kindOf(q)}">${q.full ? "장표" : KIND_LABEL[kindOf(q)]}${kindOf(q) === 'quiz' ? ` · 정답 ${LABELS[q.answer]}` : kindOf(q) === 'ox' ? ` · ${q.answer === 0 ? 'O' : 'X'}` : ''}</span>
      ${q.kind !== 'game' && q.kind !== 'slide' ? `<span class="tag k-show">${SHOW_LABEL[showOf(q)]}</span>
        <button class="tag rv rv-${q.reveal || 'def'}" type="button" data-rv="${i}" title="이 문항의 정답 공개 방식 (눌러서 바꾸기)">${q.reveal === 'auto' ? '⚡ 자동 공개' : q.reveal === 'manual' ? '✋ 수동 공개' : `기본 (${game?.auto_reveal ? '자동' : '수동'})`}</button>` : ''}${q.image ? '<span class="tag k-show">🖼</span>' : ''}
      <span class="mv">
        <button class="mvb" type="button" data-mv="-1" data-at="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${i + 1}번 위로">▲</button>
        <button class="mvb" type="button" data-mv="1" data-at="${i}" ${i === questions.length - 1 ? 'disabled' : ''} aria-label="${i + 1}번 아래로">▼</button>
      </span>
      <button class="btn ghost sm" type="button" data-start="${i}">시작</button>
    </li>`).join('');
}

// ---------- 문항 순서 바꾸기 (▲▼ 버튼 또는 끌어서 놓기) ----------
async function moveQuestion(from, to) {
  if (from === to || to < 0 || to >= questions.length) return;
  if (game && ['question', 'closed'].includes(game.phase))
    return msg($('#edit-msg'), '문항이 진행 중일 땐 순서를 바꿀 수 없어요. 결과 공개 후나 대기 화면에서 바꿔 주세요.', 'err');
  if (game && game.phase !== 'lobby' && !moveOk) {
    if (!confirm('이미 진행한 문항이 있어요. 순서를 바꾸면 이전/다음 이동 때 지난 결과가 다른 번호로 보일 수 있어요. 그래도 바꿀까요?')) return;
    moveOk = true;
  }
  const next = questions.slice(); const [q] = next.splice(from, 1); next.splice(to, 0, q);
  applyQuestions(next, `✔ ${from + 1}번 → ${to + 1}번으로 옮겼어요.`);
}
// 바뀐 문항 목록을 진행 목록·편집기·(같은 이름이면) 문제셋에 반영
async function applyQuestions(next, okText) {
  try {
    await rpc('host_load_questions', { p_pin: pin, p_questions: next });
    questions = next;
    const body = toText(questions);
    $('#editor').value = body; store.set('qs.editor', body);
    if (store.get('qs.liveSet') && $('#set-name').value.trim() === store.get('qs.liveSet')) { try { await saveSet(true); } catch {} }
    renderQList(); updateControls();
    msg($('#edit-msg'), okText, 'ok');
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
}
// 문항별 정답 공개: 기본 → 자동 → 수동 → 기본
$('#qlist').addEventListener('click', e => {
  const b = e.target.closest('[data-rv]'); if (!b) return;
  const i = Number(b.dataset.rv);
  if (game && game.q_index === i && ['question', 'closed'].includes(game.phase))
    return msg($('#edit-msg'), '진행 중인 문항은 공개 방식을 바꿀 수 없어요. 아래 "정답 공개" 버튼으로 바로 공개하면 돼요.', 'err');
  const order = [undefined, 'auto', 'manual'];
  const cur = questions[i].reveal;
  const nv = order[(order.indexOf(cur) + 1) % 3];
  const next = questions.map((q, k) => { if (k !== i) return q; const c = { ...q }; if (nv) c.reveal = nv; else delete c.reveal; return c; });
  applyQuestions(next, `✔ ${i + 1}번 정답 공개: ${nv === 'auto' ? '자동' : nv === 'manual' ? '수동' : '기본 설정 따름'}`);
});
let moveOk = false, dragFrom = null;
$('#qlist').addEventListener('click', e => {
  const b = e.target.closest('[data-mv]'); if (!b) return;
  const i = Number(b.dataset.at); moveQuestion(i, i + Number(b.dataset.mv));
});
$('#qlist').addEventListener('dragstart', e => {
  const li = e.target.closest('li[data-i]'); if (!li) return;
  dragFrom = Number(li.dataset.i); li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
});
$('#qlist').addEventListener('dragover', e => {
  const li = e.target.closest('li[data-i]'); if (!li || dragFrom === null) return;
  e.preventDefault();
  const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  $('#qlist').querySelectorAll('.drop-before,.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  li.classList.add(after ? 'drop-after' : 'drop-before');
});
$('#qlist').addEventListener('drop', e => {
  const li = e.target.closest('li[data-i]'); if (!li || dragFrom === null) return;
  e.preventDefault();
  const over = Number(li.dataset.i), after = li.classList.contains('drop-after');
  let to = over + (after ? 1 : 0); if (dragFrom < to) to -= 1;
  const from = dragFrom; dragFrom = null; moveQuestion(from, to);
});
$('#qlist').addEventListener('dragend', () => {
  dragFrom = null;
  $('#qlist').querySelectorAll('.dragging,.drop-before,.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after'));
});

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
  try { await fn(); refreshGame(); msg($('#msg'), ''); }
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
    case 'question': if (k === 'slide') return '스크린 칠판에 발표 내용이 나와 있어요. 설명이 끝나면 다음으로!';
      return k === 'game' ? '참가자들이 게임 중이에요. 시간이 끝나면 자동으로 종료돼요.' : '참가자들이 답을 고르는 중이에요. 시간이 끝나면 자동으로 마감돼요.';
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
  const p = prevAction(game, A);
  $('#prev').textContent = p.label;
  $('#prev').disabled = busy || !p.run;
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
$('#prev').addEventListener('click', () => prevAction(game, A).run?.());

// ---------- 문제셋 (프로그램별 문항 보관) ----------
let sets = [], setId = Number(store.get('qs.setId')) || null, setSaved = null;
const setDirty = () => setSaved !== null && $('#editor').value !== setSaved;
async function loadSets() {
  if (!pin) return;
  try { sets = await rpc('host_list_sets', { p_pin: pin }) || []; } catch { return; }
  if (setId && !sets.some(x => x.id === setId)) setId = null;
  renderSets();
}
function renderSets() {
  $('#set-pick').innerHTML = '<option value="">새 문제셋</option>' + sets.map(x =>
    `<option value="${x.id}">${esc(x.name)} (${x.count}문항)</option>`).join('');
  $('#set-pick').value = setId || '';
  const cur = sets.find(x => x.id === setId);
  if (cur && document.activeElement !== $('#set-name')) $('#set-name').value = cur.name;
  $('#set-del').disabled = !setId;
}
async function saveSet(quiet = false) {
  const name = $('#set-name').value.trim();
  if (!name) { $('#set-name').focus(); throw new Error('문제셋 이름을 적어 주세요. (예: 송년회 1부)'); }
  const body = $('#editor').value;
  let count = 0; try { count = parseQuestions(body).length; } catch {}
  const cur = sets.find(x => x.id === setId);
  const id = await rpc('host_save_set', { p_pin: pin, p_name: name, p_body: body, p_count: count, p_id: cur && cur.name === name ? setId : null });   // 이름을 바꿔 저장하면 새 문제셋(복사본)
  setId = id; store.set('qs.setId', id); setSaved = body;
  await loadSets();
  if (!quiet) msg($('#edit-msg'), `✔ 문제셋 '${name}'에 저장했어요. (${count}문항) 진행하려면 "▶ 이 문항으로 진행하기"를 눌러 주세요.`, 'ok');
}
$('#set-save').addEventListener('click', () => saveSet().catch(err => msg($('#edit-msg'), err.message, 'err')));
$('#set-pick').addEventListener('change', async e => {
  const id = Number(e.target.value) || null;
  if (setDirty() && !confirm('편집기에 저장 안 한 내용이 있어요. 그래도 다른 문제셋을 열까요?')) { e.target.value = setId || ''; return; }
  if (!id) { newSet(); return; }
  try {
    const st = await rpc('host_get_set', { p_pin: pin, p_id: id });
    setId = id; store.set('qs.setId', id);
    $('#editor').value = st.body; store.set('qs.editor', st.body); setSaved = st.body;
    $('#set-name').value = st.name; renderSets();
    msg($('#edit-msg'), `'${st.name}' 문제셋을 열었어요. 진행하려면 "▶ 이 문항으로 진행하기"를 눌러 주세요.`, 'ok');
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});
function newSet() {
  setId = null; store.set('qs.setId', ''); setSaved = '';
  $('#set-name').value = ''; $('#editor').value = ''; store.set('qs.editor', '');
  renderSets(); $('#set-name').focus();
  msg($('#edit-msg'), '새 문제셋이에요. 이름을 적고 문항을 쓴 다음 "💾 문제셋 저장"을 눌러 주세요.', 'ok');
}
$('#set-new').addEventListener('click', () => {
  if (setDirty() && !confirm('편집기에 저장 안 한 내용이 있어요. 그래도 새로 만들까요?')) return;
  newSet();
});
$('#set-del').addEventListener('click', async () => {
  const cur = sets.find(x => x.id === setId); if (!cur) return;
  if (!confirm(`'${cur.name}' 문제셋을 지울까요? (지금 진행 중인 문항 목록은 그대로예요)`)) return;
  try { await rpc('host_delete_set', { p_pin: pin, p_id: cur.id }); setId = null; store.set('qs.setId', ''); setSaved = null; await loadSets(); $('#set-name').value = '';
    msg($('#edit-msg'), `'${cur.name}' 문제셋을 지웠어요.`, 'ok'); }
  catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});

// ---------- 이미지 올리기 · 갤러리 · PPT 장표 ----------
// 그림을 긴 쪽 maxSide 이하로 줄여 data URL 로 (webp, 안 되면 jpeg). 너무 크면 품질을 낮춰 다시
function toDataUrl(src, maxSide, q = 0.85) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0, c.width, c.height);
  let d = c.toDataURL('image/webp', q);
  if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', q);
  return d;
}
async function putImage(src, name, maxSide = 1600) {
  let data = toDataUrl(src, maxSide);
  for (const q of [0.75, 0.6, 0.5]) if (data.length > 1900000) data = toDataUrl(src, maxSide, q);
  if (data.length > 1900000) data = toDataUrl(src, Math.round(maxSide * 0.7), 0.6);
  const thumb = toDataUrl(src, 320, 0.7);
  return rpc('host_put_media', { p_pin: pin, p_data: data, p_thumb: thumb, p_name: name });
}
// PDF(파워포인트에서 PDF로 내보낸 것) → 장마다 그림
let pdfLib = null;
async function pdfPages(file, onPage) {
  if (!pdfLib) {
    pdfLib = await import('./assets/vendor/pdf.min.mjs');
    pdfLib.GlobalWorkerOptions.workerSrc = new URL('./assets/vendor/pdf.worker.min.mjs', location.href).href;
  }
  const doc = await pdfLib.getDocument({ data: await file.arrayBuffer() }).promise;
  if (doc.numPages > 60) throw new Error('PDF가 60장을 넘어요. 필요한 장표만 PDF로 다시 저장해 주세요.');
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 1920 / Math.max(v0.width, v0.height) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    await onPage(c, i, doc.numPages);
  }
}
// 편집기 끝(또는 커서 자리)에 글 넣기
function insertEditor(text, atEnd = false) {
  const ed = $('#editor');
  const pos = atEnd ? ed.value.length : (ed.selectionStart ?? ed.value.length);
  const before = ed.value.slice(0, pos);
  const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? (atEnd ? '\n' : '') : (atEnd ? '\n\n' : '\n');
  ed.value = before + pre + text + ed.value.slice(pos);
  store.set('qs.editor', ed.value);
}
const deckBlock = (id, n) => `S: 장표 ${n}\n장표: #${id}\n`;

// 장표 올리기 (PDF 여러 장 또는 그림 여러 장) → 문항 끝에 장표 발표로 추가
async function uploadDeck(files, out) {
  const ids = [];
  try {
    for (const f of files) {
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        await pdfPages(f, async (c, i, n) => {
          msg(out, `PDF 장표 변환 중… ${i} / ${n}`, 'ok');
          ids.push(await putImage(c, `${f.name} · ${i}쪽`, 1920));
        });
      } else {
        msg(out, `장표 올리는 중… ${ids.length + 1}`, 'ok');
        ids.push(await putImage(await createImageBitmap(f), f.name, 1920));
      }
    }
    const start = questions.filter(q => q.full).length;
    insertEditor(ids.map((id, i) => deckBlock(id, start + i + 1)).join('\n'), true);
    msg(out, `✔ 장표 ${ids.length}장을 문항 끝에 추가했어요. 문항 탭에서 "문항 저장"을 눌러 주세요.`, 'ok');
    loadGallery();
  } catch (err) { msg(out, (ids.length ? `${ids.length}장까지 올렸어요. ` : '') + err.message, 'err'); }
}
$('#deck-pick').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) uploadDeck(f, $('#edit-msg')); });
$('#gal-deck').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) uploadDeck(f, $('#gal-msg')); });

// 칠판용 이미지 한 장 → 커서 자리에 '이미지: #번호'
$('#img-pick').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    msg($('#edit-msg'), '이미지를 올리는 중…', 'ok');
    const id = await putImage(await createImageBitmap(f), f.name);
    insertEditor(`이미지: #${id}\n`);
    msg($('#edit-msg'), `✔ 이미지 #${id} 를 넣었어요. 발표(S:) 문항 안에 '이미지: #${id}' 줄이 있으면 칠판에 함께 나와요. "문항 저장"을 눌러 주세요.`, 'ok');
    loadGallery();
  } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
});
// 갤러리에서 여러 장 올리기 (문항에는 안 넣고 보관만)
$('#gal-pick').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  try {
    for (let i = 0; i < files.length; i++) {
      msg($('#gal-msg'), `올리는 중… ${i + 1} / ${files.length}`, 'ok');
      await putImage(await createImageBitmap(files[i]), files[i].name);
    }
    msg($('#gal-msg'), `✔ ${files.length}장을 올렸어요. 아래에서 칠판이나 장표로 넣을 수 있어요.`, 'ok');
    loadGallery();
  } catch (err) { msg($('#gal-msg'), err.message, 'err'); }
});

// 갤러리 목록
let media = [];
const usedIn = id => questions.map((q, i) => (q.image === `#${id}` ? i + 1 : 0)).filter(Boolean);
async function loadGallery() {
  if (!pin) return;
  try { media = await rpc('host_list_media', { p_pin: pin }) || []; } catch (err) { msg($('#gal-msg'), err.message, 'err'); return; }
  renderGallery();
}
function renderGallery() {
  $('#gal-count').textContent = media.length ? `${media.length}장` : '';
  $('#media-count').textContent = media.length || '';
  $('#gallery').innerHTML = media.length ? media.map(m => {
    const used = usedIn(m.id);
    return `<li class="gal-item" data-id="${m.id}">
      <button class="gal-thumb" type="button" data-act="view" title="크게 보기">
        ${m.thumb ? `<img src="${m.thumb}" alt="" loading="lazy">` : '<span class="gal-nothumb">미리보기 없음<br>(눌러서 보기)</span>'}
        <span class="gal-id">#${m.id}</span>
      </button>
      <div class="gal-meta"><span class="gal-name" title="${esc(m.name || '')}">${esc(m.name || '이름 없음')}</span>
        <span class="muted">${m.kb}KB${used.length ? ` · ${used.join(', ')}번 문항에 사용 중` : ''}</span></div>
      <div class="gal-btns">
        <button class="btn ghost sm" type="button" data-act="board">칠판에 넣기</button>
        <button class="btn ghost sm" type="button" data-act="deck">장표로 넣기</button>
        <button class="btn ghost sm gal-del" type="button" data-act="del" aria-label="삭제">삭제</button>
      </div>
    </li>`;
  }).join('') : '<li class="muted">아직 올린 이미지가 없어요. 위 버튼으로 올려 보세요.</li>';
}
const fullCache = new Map();
function fullImage(id) {
  if (!fullCache.has(id)) fullCache.set(id, rpc('get_media', { p_id: id }));
  return fullCache.get(id);
}
$('#gallery').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = Number(b.closest('.gal-item').dataset.id);
  const m = media.find(x => x.id === id);
  if (b.dataset.act === 'view') {
    $('#lb-img').removeAttribute('src'); $('#lb-cap').textContent = `#${id} · 불러오는 중…`;
    $('#lightbox').classList.remove('hidden');
    try { $('#lb-img').src = await fullImage(id); $('#lb-cap').textContent = `#${id} · ${m?.name || ''}`; }
    catch (err) { $('#lb-cap').textContent = err.message; }
  } else if (b.dataset.act === 'board') {
    insertEditor(`S: ${m?.name?.replace(/\.[a-z]+$/i, '') || '설명'}\n이미지: #${id}\n`, true);
    msg($('#gal-msg'), `✔ 칠판 발표로 문항 끝에 추가했어요. 문항 탭에서 글을 다듬고 "문항 저장"을 눌러 주세요.`, 'ok');
  } else if (b.dataset.act === 'deck') {
    insertEditor(deckBlock(id, questions.filter(q => q.full).length + 1), true);
    msg($('#gal-msg'), `✔ 장표로 문항 끝에 추가했어요. 문항 탭에서 "문항 저장"을 눌러 주세요.`, 'ok');
  } else if (b.dataset.act === 'del') {
    const used = usedIn(id);
    if (!confirm(`#${id} 이미지를 지울까요?${used.length ? `\n${used.join(', ')}번 문항에서 쓰고 있어서 그 문항엔 그림이 안 나와요.` : ''}`)) return;
    try { await rpc('host_delete_media', { p_pin: pin, p_id: id }); media = media.filter(x => x.id !== id); renderGallery(); }
    catch (err) { msg($('#gal-msg'), err.message, 'err'); }
  }
});
$('#gal-refresh').addEventListener('click', loadGallery);
$('#lightbox').addEventListener('click', () => $('#lightbox').classList.add('hidden'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#lightbox').classList.add('hidden'); });

// 채팅 지우기 (스크린 채팅창도 비워짐). 채팅은 이 버튼이나 초기화 전까지 계속 남아요
$('#chat-clear').addEventListener('click', () => {
  if (confirm('지금까지의 채팅을 모두 지울까요? 스크린 채팅창도 비워져요.'))
    act(() => rpc('host_clear_chat', { p_pin: pin }));
});

// 채팅 표시 방식: 오른쪽 채팅창 / 캐릭터 머리 위 픽셀 말풍선
$('#chat-mode').addEventListener('change', e => act(() => rpc('host_set_chat_mode', { p_pin: pin, p_mode: e.target.value })));

// 스크린 맵 바꾸기
$('#map-pick').addEventListener('change', e => act(() => rpc('host_set_map', { p_pin: pin, p_map: e.target.value })));

// 채팅 켜기/끄기 (댄스는 항상 허용)
$('#chat-toggle').addEventListener('click', () => {
  if (!game) return;
  act(() => rpc('host_set_chat', { p_pin: pin, p_on: game.chat_on === false }));
});

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.code === 'Space' || e.key === 'ArrowRight') { e.preventDefault(); nextAction().run?.(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); prevAction(game, A).run?.(); }
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
  if (document.activeElement !== $('#map-pick')) $('#map-pick').value = g.map || 'auto';
  if (document.activeElement !== $('#chat-mode')) $('#chat-mode').value = g.chat_mode || 'panel';
  $('#qpos').textContent = g.q_index >= 0 ? `${g.q_index + 1}번째 문제 (총 ${g.q_total}개)` : `문제 ${g.q_total}개 준비됨`;
  $('#curq').textContent = g.q_index >= 0 && g.question
    ? `[${KIND_LABEL[kindOf(g.question)]}] ${g.question.kind === 'game' ? (GAMES[g.question.game]?.name || g.question.text) : g.question.text}` : '';
  if (g.phase !== 'question') { clearTimeout(closeTimer); closeTimer = null; }
  syncSettings(g);
  // 자동 정답 공개: 마감되면 1.2초 뒤 공개
  if (g.phase === 'closed' && revealOf(g.question, g) && g.question?.kind !== 'slide' && revealKey !== g.started_at) {
    revealKey = g.started_at;
    const key = g.started_at;
    setTimeout(() => { if (game.phase === 'closed' && game.started_at === key) A.reveal(); }, 1200);
  }
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
  if (q.kind === 'slide') { $('#bars').innerHTML = ''; $('#answered').textContent = '발표 중'; return; }
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
  $('#ppl-count').textContent = people.length ? `${people.length}` : '';
  $('#ppl').innerHTML = list.length
    ? list.slice(0, 200).map(p => `<li class="${p.v ? 'on' : ''}">
        <span class="ppl-av">${avatarSVG(p.a)}</span><span class="ppl-n">${esc(p.n)}</span>
        <button type="button" class="star" data-vip="${p.id}" aria-pressed="${p.v}" title="${p.v ? '크게 보기 끄기' : '크게 보기'}">${p.v ? '★ 크게' : '☆ 크게'}</button>
        <button type="button" class="star spot" data-spot="${p.id}" aria-pressed="${game?.spotlight === p.id}" title="스포트라이트">🔦 ${game?.spotlight === p.id ? '비추는 중' : '비추기'}</button>
        <button type="button" class="star kick" data-kick="${p.id}" title="이 참가자 내보내기">내보내기</button></li>`).join('')
    : `<li class="muted">${q ? '찾는 이름이 없어요' : '아직 참가자가 없습니다'}</li>`;
}
$('#ppl-search').addEventListener('input', renderPeople);
$('#ppl').addEventListener('click', async e => {
  const k = e.target.closest('[data-kick]');
  if (k) {
    const p = people.find(x => x.id === k.dataset.kick);
    if (!p || !confirm(`'${p.n}' 님을 내보낼까요?\n표·점수·채팅이 지워지고, 같은 폰으로는 다시 들어올 수 없어요.\n(전체 초기화하면 다시 들어올 수 있어요)`)) return;
    k.disabled = true;
    try {
      await rpc('host_kick', { p_pin: pin, p_sid: p.id });
      people = people.filter(x => x !== p); renderPeople();
      msg($('#msg'), `${p.n} 님을 내보냈어요`, 'ok');
    } catch (err) { k.disabled = false; msg($('#msg'), err.message, 'err'); }
    return;
  }
  const b = e.target.closest('[data-vip]');
  if (!b) return;
  const p = people.find(x => x.id === b.dataset.vip);
  if (!p) return;
  p.v = !p.v; renderPeople();
  try { await rpc('host_set_vip', { p_pin: pin, p_sid: p.id, p_on: p.v }); }
  catch (err) { p.v = !p.v; renderPeople(); msg($('#msg'), err.message, 'err'); }
});

// ---------- 탭 ----------
document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tabs .tab').forEach(x => x.setAttribute('aria-selected', x === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
  try { localStorage.setItem('qs.hosttab', t.dataset.tab); } catch {}
  if (t.dataset.tab === 'm') loadGallery();
}));
try { const t = localStorage.getItem('qs.hosttab'); if (t) document.querySelector(`.tabs .tab[data-tab="${t}"]`)?.click(); } catch {}

// ---------- 화면 설정 (정답 공개 방식 · 대기 화면 문구) ----------
function syncSettings(g) {
  syncQr(g);
  document.querySelectorAll('input[name="auto-reveal"]').forEach(r => { r.checked = (r.value === '1') === !!g.auto_reveal; });
  const rv = g.question?.reveal, note = $('#rv-note');
  if (note) note.textContent = rv && g.q_index >= 0 && g.question?.kind !== 'slide' && g.question?.kind !== 'game'
    ? `지금 문항은 따로 ${rv === 'auto' ? '⚡ 자동' : '✋ 수동'} 공개로 정해져 있어요` : '';
  const t = $('#lobby-title'), sub = $('#lobby-sub');
  if (document.activeElement !== t && !t.dataset.dirty) t.value = g.lobby_title || '';
  if (document.activeElement !== sub && !sub.dataset.dirty) sub.value = g.lobby_sub || '';
  const sp = g.spotlight && people.find(p => p.id === g.spotlight);
  $('#spot-group').classList.toggle('hidden', !g.spotlight);
  $('#spot-who').textContent = sp ? sp.n : g.spotlight ? '비추는 중' : '';
  renderPeople();
}
const saveSettings = auto => act(() => rpc('host_set_settings', {
  p_pin: pin, p_auto_reveal: auto ?? !!game?.auto_reveal,
  p_lobby_title: $('#lobby-title').value, p_lobby_sub: $('#lobby-sub').value,
}));
document.querySelectorAll('input[name="auto-reveal"]').forEach(r => r.addEventListener('change', () => saveSettings(r.value === '1')));
['lobby-title', 'lobby-sub'].forEach(id => $('#' + id).addEventListener('input', e => { e.target.dataset.dirty = '1'; }));
$('#lobby-save').addEventListener('click', async () => {
  await saveSettings();
  delete $('#lobby-title').dataset.dirty; delete $('#lobby-sub').dataset.dirty;
  msg($('#msg'), '✔ 대기 화면 문구를 바꿨어요', 'ok');
});

// ---------- 진행 중 입장 QR 팝업 ----------
$('#qr-toggle').addEventListener('click', () => act(() => rpc('host_set_qr', { p_pin: pin, p_on: !game?.show_qr })));
function syncQr(g) {
  const b = $('#qr-toggle'); const on = !!g.show_qr;
  b.setAttribute('aria-pressed', on);
  b.textContent = on ? '📱 QR 내리기' : '📱 스크린에 QR 띄우기';
  b.classList.toggle('on', on);
}

// ---------- 스포트라이트 ----------
async function setSpot(id) { await act(() => rpc('host_spotlight', { p_pin: pin, p_sid: id })); }
$('#spot-off').addEventListener('click', () => setSpot(null));
$('#ppl').addEventListener('click', e => {
  const b = e.target.closest('[data-spot]');
  if (!b) return;
  setSpot(game?.spotlight === b.dataset.spot ? null : b.dataset.spot);
});
