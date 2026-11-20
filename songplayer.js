// =====================================================================
//  노래 맞히기: 스크린에서 노래 구간 틀기 (올린 MP3 '#번호' 또는 유튜브)
//  - 소리는 스크린 컴퓨터에서만 나와요 (폰 100대가 따로 틀면 박자가 어긋나서)
// =====================================================================
import { rpc } from './common.js?v=20261120a';
import { ytId } from './questions-format.js?v=20261120a';

const cache = new Map();            // '#12' → data URL
let audio = null, yt = null, stopTimer = null, listeners = new Set(), playingKey = null;

export const songState = { playing: false, blocked: false };
export function onSong(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach(f => { try { f(songState); } catch {} });

async function srcOf(src) {
  if (!/^#\d+$/.test(src)) return null;
  if (!cache.has(src)) cache.set(src, rpc('get_media', { p_id: Number(src.slice(1)) }).catch(e => { cache.delete(src); throw e; }));
  return cache.get(src);
}
// 미리 받아 두기 (문항이 뜨기 전에)
export function preloadSong(a) { if (a?.src && /^#\d+$/.test(a.src)) srcOf(a.src).catch(() => {}); }

export function stopSong() {
  clearTimeout(stopTimer);
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
  if (yt) { yt.remove(); yt = null; }
  playingKey = null;
  if (songState.playing) { songState.playing = false; emit(); }
}

// a = { src, start, len }. 올린 MP3 는 이미 잘라 둔 구간이라 처음부터 끝까지(또는 len 초)
export async function playSong(a, key = '') {
  stopSong();
  if (!a?.src) return;
  playingKey = key;
  songState.blocked = false;
  const id = ytId(a.src);
  const start = Number(a.start) || 0;
  const len = Number(a.len) || (id ? 10 : 0);
  if (id) {
    yt = document.createElement('iframe');
    yt.className = 'yt-hidden';
    yt.allow = 'autoplay; encrypted-media';
    yt.title = '노래';
    const end = len ? `&end=${Math.ceil(start + len)}` : '';
    yt.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=0&disablekb=1&playsinline=1&rel=0&start=${Math.floor(start)}${end}`;
    document.body.appendChild(yt);
    songState.playing = true; emit();
    stopTimer = setTimeout(() => { if (playingKey === key) stopSong(); }, (len || 10) * 1000 + 2500);   // 로딩 여유
    return;
  }
  let url;
  try { url = await srcOf(a.src); } catch { return; }
  if (playingKey !== key || !url) return;
  audio = new Audio(url);
  audio.currentTime = start;
  audio.onended = () => { if (playingKey === key) stopSong(); };
  try {
    await audio.play();
    songState.playing = true; emit();
    if (len) stopTimer = setTimeout(() => { if (playingKey === key) stopSong(); }, len * 1000);
  } catch {
    // 브라우저가 클릭 전 소리를 막음 → 스크린에 '눌러서 듣기' 표시
    songState.blocked = true; songState.playing = false; emit();
  }
}

// 스크린에 보이는 CD 플레이어
export function cdHTML(caption = '노래를 잘 들어 보세요') {
  return `<div class="cdp" id="cdp">
    <div class="cdp-deck">
      <div class="cdp-disc"><div class="cdp-shine"></div><div class="cdp-label"><span>♪</span></div><div class="cdp-hole"></div></div>
      <div class="cdp-arm"><i></i></div>
    </div>
    <div class="cdp-side">
      <div class="cdp-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="cdp-cap" id="cdp-cap">${caption}</div>
      <button class="cdp-play" id="cdp-play" type="button">▶ 다시 듣기</button>
    </div>
  </div>`;
}
