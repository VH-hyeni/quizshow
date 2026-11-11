import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, TITLE } from './config.js';

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

// game 행을 실시간 구독. 연결이 끊겨도 주기적으로 다시 읽어 와서 화면이 멈추지 않게 함
export function watchGame(onChange, onConn = () => {}) {
  let last = null;
  let lastT = -Infinity;
  const apply = row => {
    if (!row) return;
    const t = parseTs(row.updated_at);
    if (t < lastT) return;
    const changed = t > lastT || JSON.stringify(row) !== JSON.stringify(last);
    last = row; lastT = t;
    if (changed) onChange(row);
  };
  const fetchNow = async () => {
    const { data, error } = await sb.from('game').select('*').eq('id', 1).single();
    if (!error) apply(data);
  };
  sb.channel('game-state')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game' }, p => apply(p.new))
    .subscribe(status => {
      onConn(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') fetchNow();
    });
  fetchNow();
  setInterval(fetchNow, 8000 + Math.random() * 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchNow(); });
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
