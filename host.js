import { rpc, refreshGame, $, esc, configured, showConfigError, watchGame, syncClock, remainingSec, LABELS, TITLE, joinUrl } from './common.js?v=20261120f';
import { parseQuestions, toText, SAMPLE, TEMPLATES, KIND_LABEL, kindOf, GAMES, fmtPlay, showOf, SHOW_LABEL, revealOf, ytId } from './questions-format.js?v=20261120f';
import { nextAction as flowNext, prevAction, hostActions, PHASE_NAME } from './flow.js?v=20261120f';
import { avatarSVG } from './characters.js?v=20261120f';
import { playSong, stopSong, onSong, songState } from './songplayer.js?v=20261120f';

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
  
  syncText();

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
// 문항 목록이 곧 편집 대상이에요. 문항을 누르면 아래에서 자세히 고치고, 고치면 잠깐 뒤 자동 저장돼요.
$('#sample').addEventListener('click', () => {
  if ($('#editor').value.trim() && !confirm('텍스트 편집 칸을 예시로 바꿀까요? ("텍스트 적용"을 눌러야 반영돼요)')) return;
  $('#editor').value = SAMPLE;
});
// ＋ 추가 버튼: 틀을 문항으로 바로 추가 (고른 문항 바로 뒤, 없으면 맨 끝)
document.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => {
  addQuestions([blankOf(b.dataset.tpl)]);
}));
// 고급: 텍스트로 한꺼번에 적용
$('#upload').addEventListener('click', async () => {
  let qs;
  try { qs = parseQuestions($('#editor').value); }
  catch (err) { return msg($('#edit-msg'), err.message, 'err'); }
  if (game && ['question', 'closed'].includes(game.phase) &&
      !confirm('문항이 진행 중입니다. 그래도 문항 목록을 바꿀까요? (진행 중인 문항은 그대로 유지됩니다)')) return;
  questions = qs; sel = null; renderDetail();
  await commitNow(`✔ 텍스트 내용을 적용했어요. (${qs.length}문항)`);
});

function renderQList() {
  const live = sets.find(x => x.id === setId)?.name;
  $('#qcount').textContent = questions.length ? `${live ? `· ${live} ` : ''}(${questions.length}개)` : '';
  if (!questions.length) { $('#qlist').innerHTML = '<li class="muted">아래 ＋ 추가 버튼으로 문항을 만들어 주세요</li>'; return; }
  $('#qlist').innerHTML = questions.map((q, i) => `
    <li class="${game && game.q_index === i ? 'cur' : ''}${sel === i ? ' sel' : ''}${badIdx === i ? ' bad' : ''}" draggable="true" data-i="${i}" data-pick="${i}">
      <span class="grip" title="끌어서 순서 바꾸기" aria-hidden="true">⠿</span>
      <span class="num">${i + 1}</span>
      <span class="t" title="${esc(q.text)}">${esc(q.text) || '<i class="muted">(제목 없음)</i>'}</span>
      <span class="tag k-${kindOf(q)}">${q.full ? "장표" : KIND_LABEL[kindOf(q)]}${kindOf(q) === 'quiz' ? ` · 정답 ${LABELS[q.answer]}` : kindOf(q) === 'ox' ? ` · ${q.answer === 0 ? 'O' : 'X'}` : kindOf(q) === 'typed' ? ` · ${esc((q.answers || [])[0] || '?')}` : ''}</span>
      ${q.audio ? `<span class="tag k-song" title="노래 문항">🎵${q.chorus?.src ? '+싸비' : ''}</span>` : ''}
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
  const cur = sel != null ? questions[sel] : null;
  questions = next;
  if (cur) sel = questions.indexOf(cur);
  if (sel < 0) sel = null;
  renderDetail();
  await commitNow(okText);
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
// 문제셋을 열면 그 문항들이 바로 진행 목록이 돼요. 열려 있는 문제셋은 고칠 때마다 같이 자동 저장돼요.
let sets = [], setId = Number(store.get('qs.setId')) || null;
async function loadSets() {
  if (!pin) return;
  try { sets = await rpc('host_list_sets', { p_pin: pin }) || []; } catch { return; }
  if (setId && !sets.some(x => x.id === setId)) setId = null;
  renderSets();
}
function renderSets() {
  $('#set-pick').innerHTML = '<option value="">(문제셋 없음)</option>' + sets.map(x =>
    `<option value="${x.id}">${esc(x.name)} (${x.count}문항)</option>`).join('');
  $('#set-pick').value = setId || '';
  const cur = sets.find(x => x.id === setId);
  if (document.activeElement !== $('#set-name')) $('#set-name').value = cur ? cur.name : '';
  $('#set-del').disabled = !setId;
}
async function saveSet(quiet = false) {
  const name = $('#set-name').value.trim();
  if (!name) { $('#set-name').focus(); throw new Error('문제셋 이름을 적어 주세요. (예: 송년회 1부)'); }
  const body = toText(questions);
  const cur = sets.find(x => x.id === setId);
  const id = await rpc('host_save_set', { p_pin: pin, p_name: name, p_body: body, p_count: questions.length, p_id: cur && cur.name === name ? setId : null });   // 이름을 바꿔 저장하면 새 문제셋(복사본)
  setId = id; store.set('qs.setId', id);
  await loadSets();
  if (!quiet) msg($('#edit-msg'), `✔ 문제셋 '${name}'에 저장했어요. (${questions.length}문항) 앞으로 고치는 내용도 여기에 자동 저장돼요.`, 'ok');
}
$('#set-save').addEventListener('click', () => saveSet().catch(err => msg($('#edit-msg'), err.message, 'err')));
const midShow = () => game && game.q_index >= 0 && game.phase !== 'lobby';
$('#set-pick').addEventListener('change', async e => {
  const id = Number(e.target.value) || null;
  if (!id) { setId = null; store.set('qs.setId', ''); renderSets(); return; }
  if (!setId && questions.length && !confirm('지금 문항 목록은 문제셋으로 저장돼 있지 않아요. 그래도 다른 문제셋을 열까요?')) { e.target.value = ''; return; }
  if (midShow() && !confirm('진행 중이에요. 문제셋을 열면 진행 목록이 그 문제셋으로 바뀌어요. 계속할까요?')) { e.target.value = setId || ''; return; }
  try {
    const st = await rpc('host_get_set', { p_pin: pin, p_id: id });
    const qs = parseQuestions(st.body || '');
    setId = id; store.set('qs.setId', id);
    questions = qs; sel = null; renderDetail(); renderSets();
    await commitNow(`'${st.name}' 문제셋을 열었어요. (${qs.length}문항)`, false);
  } catch (err) { e.target.value = setId || ''; msg($('#edit-msg'), err.message, 'err'); }
});
$('#set-new').addEventListener('click', () => {
  if (!setId && questions.length && !confirm('지금 문항 목록은 문제셋으로 저장돼 있지 않아요. 비우고 새로 만들까요?\n(먼저 이름을 적고 💾 저장을 누르면 보관돼요)')) return;
  setId = null; store.set('qs.setId', '');
  questions = []; sel = null; badIdx = null;
  renderSets(); renderQList(); renderDetail(); syncText(); setSaveState('');
  $('#set-name').focus();
  msg($('#edit-msg'), '새 문제셋이에요. 이름을 적고 ＋ 추가로 문항을 만든 다음 💾 저장을 눌러 주세요.', 'ok');
});
$('#set-del').addEventListener('click', async () => {
  const cur = sets.find(x => x.id === setId); if (!cur) return;
  if (!confirm(`'${cur.name}' 문제셋을 지울까요? (지금 문항 목록은 그대로예요)`)) return;
  try { await rpc('host_delete_set', { p_pin: pin, p_id: cur.id }); setId = null; store.set('qs.setId', ''); await loadSets();
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
const deckOf = (id, n) => ({ kind: 'slide', text: `장표 ${n}`, lines: [], image: `#${id}`, full: true });

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
    addQuestions(ids.map((id, i) => deckOf(id, start + i + 1)), false);
    msg(out, `✔ 장표 ${ids.length}장을 문항 목록에 추가했어요.`, 'ok');
    loadGallery();
  } catch (err) { msg(out, (ids.length ? `${ids.length}장까지 올렸어요. ` : '') + err.message, 'err'); }
}
$('#deck-pick').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) uploadDeck(f, $('#edit-msg')); });
$('#gal-deck').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) uploadDeck(f, $('#gal-msg')); });

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
const usedIn = id => questions.map((q, i) => ([q.image, q.audio?.src, q.chorus?.src].includes(`#${id}`) ? i + 1 : 0)).filter(Boolean);
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
        ${m.audio ? '<span class="gal-nothumb gal-audio">🎵<br>노래 구간<br>(눌러서 듣기)</span>' : m.thumb ? `<img src="${m.thumb}" alt="" loading="lazy">` : '<span class="gal-nothumb">미리보기 없음<br>(눌러서 보기)</span>'}
        <span class="gal-id">#${m.id}</span>
      </button>
      <div class="gal-meta"><span class="gal-name" title="${esc(m.name || '')}">${esc(m.name || '이름 없음')}</span>
        <span class="muted">${m.kb}KB${used.length ? ` · ${used.join(', ')}번 문항에 사용 중` : ''}</span></div>
      <div class="gal-btns">
        ${m.audio ? '' : `<button class="btn ghost sm" type="button" data-act="board">칠판에 넣기</button>
        <button class="btn ghost sm" type="button" data-act="deck">장표로 넣기</button>`}
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
  if (b.dataset.act === 'view' && m?.audio) { playSong({ src: `#${id}` }, `gal:${Date.now()}`); return; }
  if (b.dataset.act === 'view') {
    $('#lb-img').removeAttribute('src'); $('#lb-cap').textContent = `#${id} · 불러오는 중…`;
    $('#lightbox').classList.remove('hidden');
    try { $('#lb-img').src = await fullImage(id); $('#lb-cap').textContent = `#${id} · ${m?.name || ''}`; }
    catch (err) { $('#lb-cap').textContent = err.message; }
  } else if (b.dataset.act === 'board') {
    addQuestions([{ kind: 'slide', text: m?.name?.replace(/\.[a-z]+$/i, '') || '설명', lines: [], image: `#${id}` }], false);
    msg($('#gal-msg'), `✔ 칠판 발표로 문항 목록에 추가했어요. 문항 탭에서 글을 다듬어 주세요.`, 'ok');
  } else if (b.dataset.act === 'deck') {
    addQuestions([deckOf(id, questions.filter(q => q.full).length + 1)], false);
    msg($('#gal-msg'), `✔ 장표로 문항 목록에 추가했어요.`, 'ok');
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
$('#font-q').addEventListener('change', e => act(() => rpc('host_set_font', { p_pin: pin, p_target: 'q', p_font: e.target.value })));
$('#font-opt').addEventListener('change', e => act(() => rpc('host_set_font', { p_pin: pin, p_target: 'opt', p_font: e.target.value })));
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
  if (document.activeElement !== $('#font-q')) $('#font-q').value = g.font_q || 'pixel';
  if (document.activeElement !== $('#font-opt')) $('#font-opt').value = g.font_opt || 'pixel';
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
        <button type="button" class="star kick" data-kick="${p.id}" title="내보내기 — 같은 폰으로 다시 들어올 수 있어요">내보내기</button>
        <button type="button" class="star kick ban" data-ban="${p.id}" title="추방 — 같은 폰으로 다시 못 들어와요">추방</button></li>`).join('')
    : `<li class="muted">${q ? '찾는 이름이 없어요' : '아직 참가자가 없습니다'}</li>`;
}
$('#ppl-search').addEventListener('input', renderPeople);
// 추방한 사람 목록 · 풀기
async function loadBanned() {
  if (!pin) return;
  let list = [];
  try { list = await rpc('host_list_banned', { p_pin: pin }) || []; } catch { return; }
  $('#banned').classList.toggle('hidden', !list.length);
  $('#banned-list').innerHTML = list.map(b => `<li><span>${esc(b.n || '이름 없음')}</span>
    <button class="btn ghost sm" type="button" data-unban="${b.id}">추방 풀기</button></li>`).join('');
}
$('#banned-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-unban]'); if (!b) return;
  try { await rpc('host_unban', { p_pin: pin, p_sid: b.dataset.unban }); loadBanned(); msg($('#msg'), '추방을 풀었어요. 그 폰으로 다시 들어올 수 있어요.', 'ok'); }
  catch (err) { msg($('#msg'), err.message, 'err'); }
});
$('#ppl').addEventListener('click', async e => {
  const k = e.target.closest('[data-kick],[data-ban]');
  if (k) {
    const ban = !!k.dataset.ban;
    const p = people.find(x => x.id === (k.dataset.kick || k.dataset.ban));
    if (!p) return;
    const q = ban
      ? `'${p.n}' 님을 추방할까요?\n표·점수·채팅이 지워지고, 같은 폰으로는 다시 들어올 수 없어요.\n(참가자 탭 아래 '추방한 사람'에서 풀 수 있어요)`
      : `'${p.n}' 님을 내보낼까요?\n표·점수·채팅이 지워져요. 그 폰에 '다시 들어가기' 버튼이 떠서 원하면 다시 들어올 수 있어요.`;
    if (!confirm(q)) return;
    k.disabled = true;
    try {
      await rpc('host_kick', { p_pin: pin, p_sid: p.id, p_permanent: ban });
      people = people.filter(x => x !== p); renderPeople();
      msg($('#msg'), ban ? `${p.n} 님을 추방했어요` : `${p.n} 님을 내보냈어요 (다시 들어올 수 있어요)`, 'ok');
      if (ban) loadBanned();
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
  if (t.dataset.tab === 'p') loadBanned();
}));
try { const t = localStorage.getItem('qs.hosttab'); if (t) document.querySelector(`.tabs .tab[data-tab="${t}"]`)?.click(); } catch {}

// ---------- 화면 설정 (정답 공개 방식 · 대기 화면 문구) ----------
function syncSettings(g) {
  syncQr(g);
  const q = g.question, live = q && ['question', 'closed', 'reveal'].includes(g.phase);
  const hasSong = live && (q.audio?.src || (g.phase === 'reveal' && q.chorus?.src));
  $('#song-group').classList.toggle('hidden', !hasSong);
  if (hasSong) $('#song-what').textContent = g.phase === 'reveal' && q.chorus?.src ? '지금은 싸비가 나와요' : '지금은 도입부가 나와요';
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

// ---------- 노래 다시 듣기 ----------
$('#song-replay').addEventListener('click', () => act(() => rpc('host_replay_audio', { p_pin: pin })));

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


// =====================================================================
// 문항 상세 편집 (목록에서 문항을 누르면 아래에 폼이 열려요)
// =====================================================================
let sel = null, badIdx = null, commitTimer = null, commitSeq = 0;
const T_KINDS = [['quiz', '정답 퀴즈 (객관식)'], ['typed', '주관식 (직접 적기)'], ['song', '🎵 노래 퀴즈 (객관식)'], ['songw', '🎵 노래 주관식'], ['ox', 'OX 퀴즈'], ['poll', '투표'], ['slide', '발표(칠판)'], ['deck', '장표(화면 가득)'],
                 ['order', '미니게임 · 숫자 순서'], ['reaction', '미니게임 · 반응속도'], ['tap', '미니게임 · 광클']];
// 목록·드롭다운에 보이는 종류 (노래가 붙은 퀴즈는 '노래 퀴즈')
const dispType = q => { const t = typeOf(q); return q.audio && t === 'quiz' ? 'song' : q.audio && t === 'typed' ? 'songw' : t; };
const typeOf = q => q.kind === 'game' ? q.game : q.kind === 'slide' ? (q.full ? 'deck' : 'slide') : kindOf(q);   // kindOf: quiz·typed·ox·poll
function blankOf(t) {
  if (t === 'deck') return { kind: 'slide', text: '장표', lines: [], full: true };
  const q = parseQuestions(TEMPLATES[t])[0];
  if (t === 'song' || t === 'songw') q.audio = { src: '' };     // 노래를 넣기 전엔 '노래를 넣어 주세요'로 안내
  return q;
}
function syncText() { const t = questions.length ? toText(questions) : ''; if ($('#editor').value !== t) $('#editor').value = t; }
function setSaveState(t, kind = '') { const el = $('#save-state'); el.textContent = t; el.className = `save-state ${kind}`; }

// 입력 칸을 고칠 때 쓰는 친절한 검사 (나머지는 parseQuestions 가 확인)
function checkOne(q, i) {
  const n = `${i + 1}번 문항`, t = typeOf(q);
  if (q.kind === 'slide') {
    if (t === 'deck' && !q.image) return `${n}: 장표 그림을 골라 주세요.`;
    return null;
  }
  if (q.kind === 'game') return null;
  if (!String(q.text || '').trim()) return `${n}: 문제를 적어 주세요.`;
  if (q.audio && !q.audio.src) return `${n}: 노래를 넣어 주세요 (MP3 올리기 또는 유튜브 링크).`;
  if (q.audio?.src && !/^#\d+$/.test(q.audio.src) && !ytId(q.audio.src)) return `${n}: 유튜브 주소를 확인해 주세요.`;
  if (q.chorus && !q.chorus.src) return `${n}: 싸비를 넣거나 '싸비 빼기'를 눌러 주세요.`;
  if (q.chorus?.src && !/^#\d+$/.test(q.chorus.src) && !ytId(q.chorus.src)) return `${n}: 싸비 유튜브 주소를 확인해 주세요.`;
  if (t === 'typed') return (q.answers || []).some(a => String(a).trim()) ? null : `${n}: 정답을 적어 주세요.`;
  if (t !== 'ox') {
    if (q.options.some(o => !String(o).trim())) return `${n}: 비어 있는 보기가 있어요. 채우거나 ✕로 지워 주세요.`;
    if (t === 'quiz' && (q.answer == null || q.answer >= q.options.length)) return `${n}: 정답 보기를 골라 주세요 (보기 왼쪽 동그라미).`;
  }
  return null;
}
function validate() {
  for (let i = 0; i < questions.length; i++) { const e = checkOne(questions[i], i); if (e) return { i, e }; }
  try { parseQuestions(toText(questions)); } catch (err) {
    const m = String(err.message).match(/^(\d+)번/); return { i: m ? Number(m[1]) - 1 : null, e: err.message };
  }
  return null;
}
// 고친 뒤 0.7초 동안 손을 떼면 저장
function scheduleCommit() {
  clearTimeout(commitTimer);
  syncText();
  setSaveState('고치는 중…');
  commitTimer = setTimeout(() => commitNow(), 700);
}
async function commitNow(okText = '', saveToSet = true) {
  clearTimeout(commitTimer);
  syncText();
  if (!questions.length) { renderQList(); setSaveState(''); return; }
  const bad = validate();
  badIdx = bad ? bad.i : null;
  renderQList();
  if (bad) { setSaveState('⚠ 저장 안 됨', 'err'); msg($('#edit-msg'), bad.e, 'err'); return; }
  const qs = parseQuestions(toText(questions));
  const seq = ++commitSeq;
  setSaveState('저장 중…');
  try {
    await rpc('host_load_questions', { p_pin: pin, p_questions: qs });
    if (saveToSet && setId) { try { await saveSet(true); } catch {} }
    if (seq !== commitSeq) return;
    updateControls();
    setSaveState(`✓ 저장됨${setId ? ' · 문제셋에도' : ''}`, 'ok');
    if (okText) msg($('#edit-msg'), okText, 'ok'); else if ($('#edit-msg').classList.contains('err')) msg($('#edit-msg'), '');
  } catch (err) { setSaveState('⚠ 저장 안 됨', 'err'); msg($('#edit-msg'), err.message, 'err'); }
}
function addQuestions(list, select = true) {
  const at = sel != null ? sel + 1 : questions.length;
  questions.splice(at, 0, ...list);
  if (select) sel = at;
  renderQList(); renderDetail();
  if (select) $('#qdetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  commitNow(list.length > 1 ? `✔ ${list.length}개 문항을 추가했어요.` : `✔ ${at + 1}번에 문항을 추가했어요. 아래에서 내용을 고쳐 주세요.`);
}

// 목록에서 문항 누르기 → 상세 열기 (버튼·손잡이 누른 건 빼고)
$('#qlist').addEventListener('click', e => {
  if (e.target.closest('button, .grip')) return;
  const li = e.target.closest('li[data-pick]'); if (!li) return;
  const i = Number(li.dataset.pick);
  sel = sel === i ? null : i;
  renderQList(); renderDetail();
  if (sel != null) $('#qdetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

const optRow = (q, o, k, quiz) => `
  <div class="qd-opt">
    ${quiz ? `<label class="qd-ans" title="정답으로 정하기"><input type="radio" name="qd-ans" value="${k}" ${q.answer === k ? 'checked' : ''}><span>${LABELS[k]}</span></label>`
           : `<span class="qd-ans no">${LABELS[k]}</span>`}
    <input data-opt="${k}" value="${esc(o)}" maxlength="80" placeholder="보기 ${k + 1}">
    <button class="qd-x" type="button" data-delopt="${k}" ${q.options.length <= 2 ? 'disabled' : ''} aria-label="보기 ${k + 1} 지우기">✕</button>
  </div>`;
const sel3 = (f, val, opts) => `<select data-f="${f}">${opts.map(([v, l]) => `<option value="${v}" ${String(val ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

function imagePicker(q, deck) {
  const id = /^#\d+$/.test(q.image || '') ? Number(q.image.slice(1)) : null;
  const m = id ? media.find(x => x.id === id) : null;
  const pv = q.image ? (m?.thumb ? `<img src="${m.thumb}" alt="">` : `<span class="qd-img-ph" data-loadimg="${esc(q.image)}">${esc(q.image)}</span>`)
                     : `<span class="qd-img-ph">${deck ? '장표 그림이 없어요' : '그림 없음'}</span>`;
  return `<div class="qd-img ${deck ? 'deck' : ''}">
    <div class="qd-img-pv">${pv}</div>
    <div class="qd-img-btns">
      <button class="btn ghost sm" type="button" data-imgact="pick">🖼 갤러리에서 고르기</button>
      <label class="btn ghost sm img-btn">⬆ 새로 올리기<input type="file" data-imgact="up" accept="image/*${deck ? ',application/pdf,.pdf' : ''}" hidden></label>
      ${q.image ? '<button class="btn ghost sm" type="button" data-imgact="clear">빼기</button>' : ''}
    </div>
  </div>`;
}

function renderDetail() {
  const box = $('#qdetail');
  if (sel == null || !questions[sel]) { sel = null; box.innerHTML = '<p class="muted qd-empty">문항을 누르면 여기에서 자세히 고칠 수 있어요.</p>'; box.classList.remove('open'); return; }
  const q = questions[sel], t = typeOf(q), running = game && game.q_index === sel && ['question', 'closed', 'reveal'].includes(game.phase);
  box.classList.add('open');
  let body = '';
  if (t === 'quiz' || t === 'poll') {
    body = `
      <label class="qd-field"><span>문제</span><textarea data-f="text" rows="2" maxlength="300" placeholder="문제를 적어 주세요">${esc(q.text)}</textarea></label>
      <div class="qd-field"><span>보기 ${t === 'quiz' ? '<small class="muted">· 동그라미를 눌러 정답 고르기</small>' : ''}</span>
        <div class="qd-opts">${q.options.map((o, k) => optRow(q, o, k, t === 'quiz')).join('')}</div>
        ${q.options.length < 6 ? '<button class="btn ghost sm qd-addopt" type="button" data-addopt>＋ 보기 추가</button>' : ''}
      </div>`;
  } else if (t === 'typed') {
    body = `
      <label class="qd-field"><span>문제</span><textarea data-f="text" rows="2" maxlength="300" placeholder="예: 이 노래의 제목은?">${esc(q.text)}</textarea></label>
      <label class="qd-field"><span>정답 <small class="muted">· 여러 표기를 / 로 나눠 적으면 모두 정답 (띄어쓰기·대소문자 무시)</small></span>
        <input data-f="answers" maxlength="300" value="${esc((q.answers || []).join(' / '))}" placeholder="예: 좋은 날 / Good Day"></label>`;
  } else if (t === 'ox') {
    body = `
      <label class="qd-field"><span>문제</span><textarea data-f="text" rows="2" maxlength="300">${esc(q.text)}</textarea></label>
      <div class="qd-field"><span>정답</span><div class="qd-ox">
        <label><input type="radio" name="qd-ox" value="0" ${q.answer === 0 ? 'checked' : ''}><b>O</b></label>
        <label><input type="radio" name="qd-ox" value="1" ${q.answer === 1 ? 'checked' : ''}><b>X</b></label></div></div>`;
  } else if (t === 'slide') {
    body = `
      <label class="qd-field"><span>칠판 제목</span><input data-f="text" maxlength="100" value="${esc(q.text)}"></label>
      <label class="qd-field"><span>설명 <small class="muted">· 한 줄씩, - 로 시작하면 글머리표 (12줄까지)</small></span>
        <textarea data-f="lines" rows="5" placeholder="여기에 설명을 한 줄씩 적어요">${esc((q.lines || []).join('\n'))}</textarea></label>
      <div class="qd-field"><span>그림 <small class="muted">· 칠판 오른쪽에 함께 나와요</small></span>${imagePicker(q, false)}</div>`;
  } else if (t === 'deck') {
    body = `
      <div class="qd-field"><span>장표 <small class="muted">· 스크린 가득 보여요. PDF를 올리면 장마다 문항이 하나씩 추가돼요</small></span>${imagePicker(q, true)}</div>
      <label class="qd-field"><span>목록 이름 <small class="muted">· 스크린엔 안 보여요</small></span><input data-f="text" maxlength="100" value="${esc(q.text)}"></label>`;
  } else {
    body = `<label class="qd-field"><span>제목 <small class="muted">· 비우면 "${GAMES[t].name}"</small></span><input data-f="gtext" maxlength="60" value="${esc(q.text === GAMES[t].name ? '' : q.text)}" placeholder="${GAMES[t].name}"></label>
      <p class="muted qd-hint">${GAMES[t].hint}</p>`;
    if (t === 'order') body += `<div class="qd-grid">
      <label class="qd-field"><span>판 크기</span>${sel3('size', q.size ?? 4, [['3', '3×3 (1~9)'], ['4', '4×4 (1~16)'], ['5', '5×5 (1~25)'], ['6', '6×6 (1~36)']])}</label>
      <label class="qd-field"><span>제한시간(초)</span><input data-f="time_limit" type="number" min="10" max="180" value="${q.time_limit ?? ''}" placeholder="기본"></label></div>`;
    if (t === 'tap') body += `<label class="qd-field qd-short"><span>누르는 시간(초)</span><input data-f="duration" type="number" min="3" max="60" value="${q.duration ?? 10}"></label>`;
  }
  if (['quiz', 'ox', 'poll', 'typed'].includes(t)) body += `<div class="qd-field"><span>그림 <small class="muted">· 문제와 함께 스크린에 크게 나와요 (선택)</small></span>${imagePicker(q, false)}</div>`;
  if (['quiz', 'ox', 'poll', 'typed'].includes(t)) body += songEditor(q);
  if (['quiz', 'ox', 'poll', 'typed'].includes(t)) body += `
    <div class="qd-grid">
      <label class="qd-field"><span>제한시간(초)</span><input data-f="time_limit" type="number" min="0" max="600" value="${q.time_limit ?? ''}" placeholder="${t === 'poll' ? '없음' : '20'}"></label>
      ${t === 'typed' ? '' : `<label class="qd-field"><span>누가 뭘 골랐는지</span>${sel3('show', q.show || '', [['', `기본 (${t === 'poll' ? '실시간' : '정답 때'})`], ['live', '실시간 공개'], ['reveal', '정답 때 공개'], ['hidden', '비공개 (인원수만)']])}</label>`}
      <label class="qd-field"><span>정답 공개</span>${sel3('reveal', q.reveal || '', [['', `기본 (${game?.auto_reveal ? '자동' : '수동'})`], ['auto', '⚡ 자동 (시간 끝나면)'], ['manual', '✋ 수동 (버튼)']])}</label>
    </div>`;
  box.innerHTML = `
    <div class="qd-head">
      <b class="qd-num">${sel + 1}번</b>
      <select class="qd-type" data-type aria-label="문항 종류">${T_KINDS.map(([v, l]) => `<option value="${v}" ${v === dispType(q) ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="qd-sp"></span>
      <button class="btn ghost sm" type="button" data-qact="dup">복제</button>
      <button class="btn ghost sm qd-del" type="button" data-qact="del">삭제</button>
      <button class="btn ghost sm" type="button" data-qact="close" aria-label="닫기">닫기</button>
    </div>
    ${running ? '<p class="qd-note">지금 스크린에 나오는 문항이에요. 고친 내용은 다음에 이 문항을 시작할 때 반영돼요.</p>' : ''}
    <div class="qd-body">${body}</div>`;
  box.querySelectorAll('[data-loadimg]').forEach(async el => {
    const src = el.dataset.loadimg;
    try { const u = /^#\d+$/.test(src) ? await fullImage(Number(src.slice(1))) : src; if (u) el.outerHTML = `<img src="${u}" alt="">`; } catch {}
  });
}

// 입력 → 바로 문항에 반영 (폼은 다시 그리지 않아서 입력이 끊기지 않아요)
$('#qdetail').addEventListener('input', e => {
  if (sel == null) return;
  const q = questions[sel], el = e.target;
  if (el.dataset.opt != null) q.options[Number(el.dataset.opt)] = el.value.replace(/^\s+/, '');
  else if (el.dataset.f) {
    const f = el.dataset.f, v = el.value;
    if (f === 'text') q.text = v.replace(/\n{2,}/g, '\n').replace(/^\s+/, '');
    else if (f === 'gtext') q.text = v.trim() || GAMES[q.game].name;
    else if (f === 'lines') q.lines = v.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12).map(x => x.slice(0, 120));
    else if (f === 'time_limit' || f === 'duration' || f === 'size') { if (v === '') delete q[f]; else q[f] = Number(v); }
    else if (f === 'show' || f === 'reveal') { if (v) q[f] = v; else delete q[f]; }
    else if (f === 'answers') q.answers = v.split(/\s*[\/|]\s*/).map(x => x.trim()).filter(Boolean).slice(0, 10);
    else if (/^(audio|chorus)\.(src|start|len)$/.test(f)) {
      const [slot, k] = f.split('.'); q[slot] = q[slot] || { src: '' };
      if (k === 'src') {
        q[slot].src = v.trim();
        const tb = $('#qdetail').querySelector(`button[data-song="test"][data-slot="${slot}"]`); if (tb) tb.disabled = !ytId(v);
      }
      else if (v === '') delete q[slot][k]; else q[slot][k] = Number(v);
    }
  } else if (el.name === 'qd-ans') q.answer = Number(el.value);
  else if (el.name === 'qd-ox') q.answer = Number(el.value);
  else return;
  renderQList();
  scheduleCommit();
});
$('#qdetail').addEventListener('change', async e => {
  if (sel == null) return;
  const el = e.target;
  if (el.matches('[data-type]')) {
    const old = questions[sel], nq = blankOf(el.value);
    const keepText = old.text && !(old.kind === 'game') && !(el.value in GAMES);
    if (keepText && nq.kind !== 'game') nq.text = old.text;
    if (old.options?.length && (nq.kind === 'quiz' || nq.kind === 'poll') && !nq.ox && !old.ox) nq.options = old.options.slice(0, 6);
    if (nq.kind === 'quiz' && !nq.ox && (nq.answer == null || nq.answer >= nq.options.length)) nq.answer = 0;
    if (old.image && nq.kind === 'slide') nq.image = old.image;
    // 노래 종류끼리 바꿀 땐 노래를 그대로, 노래 없는 종류로 바꾸면 노래를 빼요
    const songT = ['song', 'songw'].includes(el.value);
    if (songT) { if (old.audio) nq.audio = old.audio; if (old.chorus) nq.chorus = old.chorus; }
    else { delete nq.audio; delete nq.chorus; }
    if (old.image && nq.kind !== 'game' && nq.kind !== 'slide') nq.image = old.image;
    if (nq.typed && old.typed) nq.answers = old.answers;
    if (nq.typed && !old.typed && old.kind === 'quiz' && !old.ox && old.options?.[old.answer]) nq.answers = [old.options[old.answer]];
    questions[sel] = nq; renderQList(); renderDetail(); scheduleCommit();
  } else if (el.matches('[data-imgact="up"]')) {
    const files = [...el.files]; el.value = '';
    if (!files.length) return;
    const q = questions[sel];
    try {
      if (files.some(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name))) {
        // 장표 자리에서 PDF를 올리면: 첫 장은 이 문항에, 나머지는 바로 뒤에 새 장표로
        const ids = [];
        await pdfPages(files[0], async (c, i, n) => { msg($('#edit-msg'), `PDF 장표 변환 중… ${i} / ${n}`, 'ok'); ids.push(await putImage(c, `${files[0].name} · ${i}쪽`, 1920)); });
        q.image = `#${ids[0]}`;
        const start = questions.filter(x => x.full).length;
        questions.splice(sel + 1, 0, ...ids.slice(1).map((id, k) => deckOf(id, start + k + 1)));
        msg($('#edit-msg'), `✔ 장표 ${ids.length}장을 넣었어요.`, 'ok');
      } else {
        msg($('#edit-msg'), '그림을 올리는 중…', 'ok');
        q.image = `#${await putImage(await createImageBitmap(files[0]), files[0].name, typeOf(q) === 'deck' ? 1920 : 1600)}`;
        msg($('#edit-msg'), '✔ 그림을 넣었어요.', 'ok');
      }
      await loadGallery(); renderQList(); renderDetail(); commitNow();
    } catch (err) { msg($('#edit-msg'), err.message, 'err'); }
  }
});
$('#qdetail').addEventListener('click', e => {
  if (sel == null) return;
  const b = e.target.closest('[data-qact],[data-addopt],[data-delopt],[data-imgact]'); if (!b) return;
  const q = questions[sel];
  if (b.dataset.qact === 'close') { sel = null; renderQList(); renderDetail(); }
  else if (b.dataset.qact === 'dup') { addQuestions([JSON.parse(JSON.stringify(q))]); }
  else if (b.dataset.qact === 'del') {
    if (game && game.q_index === sel && ['question', 'closed'].includes(game.phase)) return msg($('#edit-msg'), '진행 중인 문항은 지울 수 없어요.', 'err');
    if (!confirm(`${sel + 1}번 문항을 지울까요?`)) return;
    questions.splice(sel, 1); sel = null; renderQList(); renderDetail(); commitNow('문항을 지웠어요.');
  }
  else if (b.dataset.addopt != null) { q.options.push(''); renderDetail(); $('#qdetail').querySelector(`[data-opt="${q.options.length - 1}"]`)?.focus(); scheduleCommit(); }
  else if (b.dataset.delopt != null) {
    const k = Number(b.dataset.delopt); q.options.splice(k, 1);
    if (q.kind === 'quiz' && q.answer != null) { if (q.answer === k) q.answer = undefined; else if (q.answer > k) q.answer--; }
    renderDetail(); renderQList(); scheduleCommit();
  }
  else if (b.dataset.imgact === 'clear') { delete q.image; renderDetail(); renderQList(); scheduleCommit(); }
  else if (b.dataset.imgact === 'pick') openPicker(id => { q.image = `#${id}`; renderDetail(); renderQList(); commitNow('✔ 그림을 넣었어요.'); });
});

// 갤러리에서 고르기 (작은 창)
let pickCb = null;
async function openPicker(cb) {
  pickCb = cb;
  if (!media.length) await loadGallery();
  const pics = media.filter(m => !m.audio);
  $('#picker-grid').innerHTML = pics.length ? pics.map(m => `<button type="button" class="pk-item" data-pk="${m.id}" title="${esc(m.name || '')}">
      ${m.thumb ? `<img src="${m.thumb}" alt="">` : '<span class="gal-nothumb">미리보기 없음</span>'}<span class="gal-id">#${m.id}</span></button>`).join('')
    : '<p class="muted">아직 올린 그림이 없어요. "새로 올리기"를 눌러 주세요.</p>';
  $('#picker').classList.remove('hidden');
}
$('#picker').addEventListener('click', e => {
  const b = e.target.closest('[data-pk]');
  if (b) { $('#picker').classList.add('hidden'); pickCb?.(Number(b.dataset.pk)); return; }
  if (e.target === $('#picker') || e.target.closest('[data-pkclose]')) $('#picker').classList.add('hidden');
});


// =====================================================================
// 노래 넣기: 유튜브 링크 또는 MP3 에서 구간 잘라 올리기 (도입부 = 문제 낼 때, 싸비 = 정답 공개 때)
// =====================================================================
let songBuf = null, songFileName = '', cutSlot = null;    // 마지막으로 연 MP3 (도입부·싸비를 같은 파일에서 자를 수 있게)
function songSlot(q, slot) {
  const a = q[slot], title = slot === 'audio' ? '🎵 도입부 <small class="muted">· 문제가 시작되면 스크린에서 나와요</small>' : '🎶 싸비 <small class="muted">· 정답 공개 때 나와요 (선택)</small>';
  if (!a) return `<div class="song-slot empty"><span class="ss-title">${title}</span>
      <div class="ss-btns"><button class="btn ghost sm" type="button" data-song="add" data-slot="${slot}">＋ ${slot === 'audio' ? '노래' : '싸비'} 넣기</button></div></div>`;
  const yt = ytId(a.src), mp3 = /^#\d+$/.test(a.src);
  const mode = a.mode || (yt || (a.src && !mp3) ? 'yt' : 'mp3');
  const cutting = cutSlot === slot && songBuf;
  return `<div class="song-slot" data-slot="${slot}">
    <div class="ss-head"><span class="ss-title">${title}</span>
      <div class="seg ss-seg"><label><input type="radio" name="sm-${slot}" data-song="mode" data-slot="${slot}" value="mp3" ${mode === 'mp3' ? 'checked' : ''}><span>MP3</span></label><label><input type="radio" name="sm-${slot}" data-song="mode" data-slot="${slot}" value="yt" ${mode === 'yt' ? 'checked' : ''}><span>유튜브</span></label></div>
      <button class="btn ghost sm ss-del" type="button" data-song="del" data-slot="${slot}">${slot === 'audio' ? '노래 빼기' : '싸비 빼기'}</button></div>
    ${mode === 'yt' ? `
      <div class="qd-grid ss-yt">
        <label class="qd-field ss-url"><span>유튜브 주소</span><input data-f="${slot}.src" value="${esc(mp3 ? '' : a.src)}" placeholder="https://youtu.be/..."></label>
        <label class="qd-field"><span>시작 (초)</span><input data-f="${slot}.start" type="number" min="0" step="0.5" value="${a.start ?? ''}" placeholder="0"></label>
        <label class="qd-field"><span>들려줄 길이 (초)</span><input data-f="${slot}.len" type="number" min="2" max="60" value="${a.len ?? ''}" placeholder="10"></label>
      </div>
      <div class="ss-btns"><button class="btn ghost sm" type="button" data-song="test" data-slot="${slot}" ${yt ? '' : 'disabled'}>▶ 이 구간 미리 듣기</button>
        <span class="muted ss-tip">${a.src && !yt ? '⚠ 유튜브 주소가 아니에요' : '영상에 따라 퍼가기가 막혀 있으면 안 나올 수 있어요 → 그땐 MP3로'}</span></div>`
    : `
      ${mp3 && !cutting ? `<div class="ss-btns"><span class="ss-have">✔ MP3 구간 ${esc(a.src)}${a.len ? ` · ${a.len}초` : ''}</span>
          <button class="btn ghost sm" type="button" data-song="test" data-slot="${slot}">▶ 듣기</button>
          ${songBuf ? `<button class="btn ghost sm" type="button" data-song="recut" data-slot="${slot}">✂ ${esc(songFileName)}에서 다시 자르기</button>` : ''}</div>` : ''}
      ${cutting ? songCutter(slot) : `<div class="ss-btns">
          <label class="btn ghost sm img-btn">🎵 MP3 파일 고르기<input type="file" data-song="file" data-slot="${slot}" accept="audio/*,.mp3,.m4a,.wav,.ogg" hidden></label>
          ${songBuf && !mp3 ? `<button class="btn ghost sm" type="button" data-song="recut" data-slot="${slot}">✂ ${esc(songFileName)}에서 자르기</button>` : ''}
          <span class="muted ss-tip">노래 파일을 고르면 들려줄 부분만 잘라서 올려요 (최대 30초)</span></div>`}`}
  </div>`;
}
function songCutter(slot) {
  const dur = songBuf.duration, c = cutState[slot] || (cutState[slot] = { start: slot === 'chorus' ? Math.min(60, Math.max(0, dur * 0.3)) : 0, len: slot === 'chorus' ? 15 : 10 });
  return `<div class="cutter" data-slot="${slot}">
    <div class="cut-file">✂ <b>${esc(songFileName)}</b> <span class="muted">(${fmtT(dur)})</span></div>
    <input class="cut-range" type="range" min="0" max="${Math.max(0, dur - 1).toFixed(1)}" step="0.5" value="${c.start}" data-cut="start" data-slot="${slot}" aria-label="시작 위치">
    <div class="qd-grid">
      <label class="qd-field"><span>시작 (초)</span><input type="number" min="0" max="${dur.toFixed(1)}" step="0.5" value="${c.start}" data-cut="start" data-slot="${slot}"></label>
      <label class="qd-field"><span>길이 (초, 최대 30)</span><input type="number" min="2" max="30" step="1" value="${c.len}" data-cut="len" data-slot="${slot}"></label>
    </div>
    <div class="ss-btns">
      <button class="btn ghost sm" type="button" data-song="cutplay" data-slot="${slot}">▶ 구간 미리 듣기</button>
      <button class="btn secondary sm" type="button" data-song="cutsave" data-slot="${slot}">✂ 이 구간으로 저장</button>
      <button class="btn ghost sm" type="button" data-song="cutcancel" data-slot="${slot}">취소</button>
    </div>
  </div>`;
}
const cutState = {};
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function songEditor(q) {
  return `<div class="qd-field song-ed"><span>노래 <small class="muted">· 스크린 컴퓨터 스피커로만 나와요</small></span>
    ${songSlot(q, 'audio')}${q.audio ? songSlot(q, 'chorus') : ''}</div>`;
}

// 미리 듣기 (진행자 컴퓨터에서)
let previewSrc = null, previewCtx = null;
function stopPreview() { stopSong(); if (previewSrc) { try { previewSrc.stop(); } catch {} previewSrc = null; } }
async function playBufRange(start, len) {
  stopPreview();
  previewCtx = previewCtx || new (window.AudioContext || window.webkitAudioContext)();
  await previewCtx.resume();
  const s = previewCtx.createBufferSource(); s.buffer = songBuf; s.connect(previewCtx.destination);
  s.start(0, start, len); previewSrc = s;
}
// 구간을 24kHz 모노 WAV 로 (앞뒤 0.3초 페이드)
async function cutToWav(start, len) {
  const sr = 24000, n = Math.ceil(len * sr);
  const off = new OfflineAudioContext(1, n, sr);
  const src = off.createBufferSource(); src.buffer = songBuf;
  const g = off.createGain();
  g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, 0.3);
  g.gain.setValueAtTime(1, Math.max(0.3, len - 0.4)); g.gain.linearRampToValueAtTime(0, len);
  src.connect(g); g.connect(off.destination); src.start(0, start, len);
  const buf = await off.startRendering();
  const pcm = buf.getChannelData(0), bytes = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(bytes);
  const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const blob = new Blob([bytes], { type: 'audio/wav' });
  return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}
$('#qdetail').addEventListener('click', async e => {
  const b = e.target.closest('button[data-song]'); if (!b || sel == null) return;
  const q = questions[sel], slot = b.dataset.slot, act = b.dataset.song;
  if (act === 'add') { q[slot] = { src: '' }; renderDetail(); scheduleCommit(); }
  else if (act === 'del') {
    stopPreview();
    if (slot === 'audio') { delete q.audio; delete q.chorus; } else delete q.chorus;
    if (cutSlot === slot) cutSlot = null;
    renderDetail(); renderQList(); scheduleCommit();
  }
  else if (act === 'test') { stopPreview(); playSong(q[slot], `preview:${Date.now()}`); msg($('#edit-msg'), '진행자 컴퓨터에서 미리 듣는 중이에요.', 'ok'); }
  else if (act === 'recut') { cutSlot = slot; renderDetail(); }
  else if (act === 'cutcancel') { stopPreview(); cutSlot = null; renderDetail(); }
  else if (act === 'cutplay') { const c = cutState[slot]; playBufRange(c.start, c.len); }
  else if (act === 'cutsave') {
    const c = cutState[slot];
    b.disabled = true; stopPreview();
    try {
      msg($('#edit-msg'), '구간을 자르고 올리는 중…', 'ok');
      const data = await cutToWav(c.start, Math.min(30, c.len));
      const id = await rpc('host_put_media', { p_pin: pin, p_data: data, p_thumb: null, p_name: `${songFileName} ${fmtT(c.start)}~ (${slot === 'audio' ? '도입부' : '싸비'})` });
      q[slot] = { src: `#${id}`, len: Math.min(30, c.len) };
      cutSlot = null; renderDetail(); renderQList(); commitNow(`✔ ${slot === 'audio' ? '도입부' : '싸비'} ${c.len}초를 저장했어요.`);
      loadGallery();
    } catch (err) { b.disabled = false; msg($('#edit-msg'), err.message, 'err'); }
  }
});
$('#qdetail').addEventListener('change', async e => {
  const el = e.target; if (sel == null) return;
  const q = questions[sel];
  if (el.matches('input[data-song="mode"]')) {
    const slot = el.dataset.slot; q[slot] = { src: '', mode: el.value };
    cutSlot = null; renderDetail(); scheduleCommit();
  } else if (el.matches('input[data-song="file"]')) {
    const f = el.files?.[0]; el.value = ''; if (!f) return;
    try {
      msg($('#edit-msg'), '노래 파일을 여는 중…', 'ok');
      previewCtx = previewCtx || new (window.AudioContext || window.webkitAudioContext)();
      songBuf = await previewCtx.decodeAudioData(await f.arrayBuffer());
      songFileName = f.name.replace(/\.[a-z0-9]+$/i, '');
      delete cutState.audio; delete cutState.chorus;
      cutSlot = el.dataset.slot; renderDetail();
      msg($('#edit-msg'), '들려줄 부분의 시작 위치와 길이를 정하고 "이 구간으로 저장"을 눌러 주세요.', 'ok');
    } catch { msg($('#edit-msg'), '이 파일은 열 수 없어요. MP3·M4A·WAV 파일로 해 주세요.', 'err'); }
  }
});
$('#qdetail').addEventListener('input', e => {
  const el = e.target; if (!el.dataset.cut) return;
  const slot = el.dataset.slot, c = cutState[slot]; if (!c) return;
  const v = Number(el.value); if (Number.isNaN(v)) return;
  if (el.dataset.cut === 'start') c.start = Math.max(0, Math.min(songBuf.duration - 1, v));
  else c.len = Math.max(2, Math.min(30, v));
  const box = el.closest('.cutter');
  box.querySelectorAll(`[data-cut="${el.dataset.cut}"]`).forEach(x => { if (x !== el) x.value = el.dataset.cut === 'start' ? c.start : c.len; });
});
