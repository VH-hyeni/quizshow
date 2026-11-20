import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, TITLE } from './config.js?v=20261120a';

export { TITLE };
// 주소 끝의 '/', '/rest/v1' 같은 꼬리나 'NEXT_PUBLIC_..=' 같은 앞부분이 같이 복사돼도 바로잡음
function cleanUrl(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/https?:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);
  if (m) return m[0];
  const dash = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);   // 대시보드 주소를 복사한 경우
  if (dash) return `https://${dash[1]}.supabase.co`;
  try { return new URL(s.slice(s.indexOf('http'))).origin; } catch { return s; }
}
function cleanKey(raw) {
  const s = String(raw || '').trim();
  return s.includes('=') && /^[A-Z_]+=/.test(s) ? s.slice(s.indexOf('=') + 1).trim() : s;
}
const URL_ = cleanUrl(SUPABASE_URL);
const KEY_ = cleanKey(SUPABASE_KEY);

export const configured = !URL_.includes('YOUR-PROJECT') && !KEY_.startsWith('YOUR-');

export const sb = configured
  ? createClient(URL_, KEY_, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || String(error));
  return data;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const jitter = (max = 800) => sleep(Math.random() * max);

// Postgres 타임스탬프를 모든 브라우저(사파리 포함)에서 안전하게 파싱
export function parseTs(s) {
  if (!s) return NaN;
  let t = String(s).replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/[+-]\d\d$/.test(t)) t += ':00';
  if (!/(Z|[+-]\d\d:\d\d)$/.test(t)) t += 'Z';
  return new Date(t).getTime();
}

// 서버 시계와 내 기기 시계 차이 보정 (타이머가 기기마다 다르게 보이지 않도록)
let clockOffset = 0;
export async function syncClock() {
  try {
    const t0 = Date.now();
    const s = await rpc('server_now');
    const t1 = Date.now();
    clockOffset = parseTs(s) - (t0 + t1) / 2;
  } catch { /* 실패해도 기기 시계 사용 */ }
}
export const serverNow = () => Date.now() + clockOffset;

// 남은 시간(초). 제한시간 없는 문항이면 null
export function remainingSec(game) {
  const lim = game?.question?.time_limit || 0;
  if (!lim || !game.started_at) return null;
  const end = parseTs(game.started_at) + lim * 1000;
  return Math.max(0, Math.ceil((end - serverNow()) / 1000));
}

// game 상태 따라가기
// - 스크린·진행자(몇 대뿐): 실시간 구독 + 2초마다 '바뀌었나?'만 가볍게 확인
// - 참가자 폰(100대): 실시간 구독을 쓰지 않고 1초 남짓마다 '바뀌었나?'(updated_at 한 칸)만 확인 → 바뀌었을 때만 전체를 받아요.
//   Supabase 무료 요금제는 실시간 메시지가 초당 100개로 제한돼서, 100대가 구독하면 진행 버튼 한 번에
//   한도를 넘겨 스크린까지 늦어질 수 있어요. 폰을 빼면 실시간은 스크린·진행자 전용이 돼서 안정적이에요.
export let refreshGame = () => {};
export function watchGame(onChange, onConn = () => {}, { realtime = true, pollMs = 2000 } = {}) {
  let last = null;
  let lastT = -Infinity;
  let ok = null;
  const setOk = v => { if (v !== ok) { ok = v; onConn(v); } };
  const apply = row => {
    if (!row) return;
    const t = parseTs(row.updated_at);
    if (t < lastT) return;
    const changed = t > lastT || JSON.stringify(row) !== JSON.stringify(last);
    last = row; lastT = t;
    if (changed) onChange(row);
  };
  let busy = false;
  const fetchNow = async () => {
    const { data, error } = await sb.from('game').select('*').eq('id', 1).single();
    if (error) { setOk(false); return; }
    setOk(true); apply(data);
  };
  // 가벼운 확인: updated_at 한 칸만 받아서 바뀌었으면 전체를 받음
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const { data, error } = await sb.from('game').select('updated_at').eq('id', 1).single();
      if (error) { setOk(false); return; }
      setOk(true);
      if (parseTs(data.updated_at) > lastT) await fetchNow();
    } catch { setOk(false); } finally { busy = false; }
  };
  refreshGame = () => fetchNow().catch(() => {});
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    const wait = pollMs * (0.8 + Math.random() * 0.4) * (ok === false ? 2 : 1);
    timer = setTimeout(async () => { if (!document.hidden) await check(); schedule(); }, wait);
  };
  if (realtime) {
    sb.channel('game-state')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game' }, p => apply(p.new))
      .subscribe(status => { if (status === 'SUBSCRIBED') fetchNow().catch(() => {}); });
  }
  fetchNow().catch(() => setOk(false));
  schedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchNow().catch(() => {}); });
  return { refresh: fetchNow, get: () => last };
}

export function showConfigError() {
  document.body.innerHTML = `
    <div class="setup-error">
      <h1>설정이 필요합니다</h1>
      <p><code>config.js</code> 파일에 Supabase URL과 키를 넣어 주세요.<br>자세한 방법은 README.md를 참고하세요.</p>
    </div>`;
}

export function joinUrl() {
  return new URL('index.html', location.href).href.replace(/index\.html$/, '');
}
