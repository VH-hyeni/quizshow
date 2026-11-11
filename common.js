import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, TITLE } from './config.js';

export { TITLE };
export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_KEY.startsWith('YOUR-');

export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
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
