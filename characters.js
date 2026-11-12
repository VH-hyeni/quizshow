// =====================================================================
//  아바타 시스템 — 꾸미기 스티커 스타일 (2등신 꼬마 캐릭터)
//  참가자가 고르는 7가지:
//    h  머리 모양   hc 머리 색   s 피부   e 눈   o 옷   oc 옷 색   a 소품
//  mood 로 표정을 덮어씀: 'idle' | 'happy'(정답) | 'sad'(오답) | 'sleep'(미응답) | 'wow'(두근)
// =====================================================================

export const PARTS = {
  h:  { label: '머리',   names: ['단발', '긴머리', '양갈래', '똥머리', '숏컷', '뽀글', '폭탄머리', '웨이브장발'] },
  hc: { label: '머리색', names: ['흑갈', '초코', '허니', '핑크', '라벤더', '민트', '하늘', '체리'] },
  s:  { label: '피부',   names: ['우유', '복숭아', '꿀', '코코아'] },
  e:  { label: '눈',     names: ['반짝', '초롱', '방긋', '새침', '퀭'] },
  f:  { label: '수염',   names: ['없음', '콧수염', '턱수염', '염소수염'] },
  o:  { label: '옷',     names: ['티셔츠', '원피스', '후드', '셔츠', '세일러', '멜빵', '토가'] },
  oc: { label: '옷색',   names: ['크림슨', '블루', '버터', '민트', '라일락', '핑크', '탠저린', '스카이'] },
  a:  { label: '소품',   names: ['없음', '리본', '별핀', '안경', '고양이귀', '꽃관', '천사날개'] },
};
export const PART_KEYS = ['h', 'hc', 's', 'e', 'f', 'o', 'oc', 'a'];

// 요즘 유행 프리셋 ㅋ — 갈색 웨이브 장발 + 턱수염 + 퀭한 눈 + 토가 + 천사날개
export const PRESETS = {
  밤티: { h: 7, hc: 1, s: 1, e: 4, f: 2, o: 6, oc: 2, a: 6 },
};

export const HAIR = ['#3B2A2E', '#7B4A2E', '#F1BE5A', '#FF8FB1', '#A98BFF', '#4FD1A8', '#5CB8FF', '#D8203F'];
export const SKIN = ['#FFE7DA', '#FCD5BC', '#E6AF87', '#A8714D'];
export const CLOTH = ['#DB072F', '#4B7BFF', '#FFC93C', '#2ED39A', '#A98BFF', '#FF8FB1', '#FF8A3D', '#5CC8FF'];
const INK = '#2B1B24';
const LIP = '#C2414F';

function shade(hex, amt) {             // amt < 0 어둡게, > 0 밝게
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
}

export function normAvatar(a = {}) {
  const max = { h: 7, hc: 7, s: 3, e: 4, f: 3, o: 6, oc: 7, a: 6 };
  const out = {};
  for (const k of PART_KEYS) out[k] = Number.isInteger(a?.[k]) && a[k] >= 0 && a[k] <= max[k] ? a[k] : 0;
  return out;
}

export function randomAvatar() {
  const r = n => Math.floor(Math.random() * n);
  const f = Math.random() < 0.75 ? 0 : 1 + r(3);   // 수염은 가끔만
  return { h: r(8), hc: r(8), s: r(4), e: r(5), f, o: r(7), oc: r(8), a: r(7) };
}

// ---------- 머리 ----------
function hairBack(h, c, d) {
  const st = `fill="${c}" stroke="${d}" stroke-width="1.4" stroke-linejoin="round"`;
  switch (h) {
    case 0: return `<path ${st} d="M21 46C21 23 34 14 50 14s29 9 29 32v20q0 6-6 6H27q-6 0-6-6z"/>`;
    case 1: return `<path ${st} d="M20 46C20 21 34 13 50 13s30 8 30 33l3 54q0 6-6 6H23q-6 0-6-6z"/>`;
    case 2: return `<path ${st} d="M22 46C22 23 35 15 50 15s28 8 28 31v12H22z"/>
      <path ${st} d="M20 50q-11 4-10 22t9 24q8-6 8-22t-7-24z"/><path ${st} d="M80 50q11 4 10 22t-9 24q-8-6-8-22t7-24z"/>
      <circle cx="21" cy="50" r="4.2" fill="#FF6F91" stroke="${INK}" stroke-width="1.2"/><circle cx="79" cy="50" r="4.2" fill="#FF6F91" stroke="${INK}" stroke-width="1.2"/>`;
    case 3: return `<circle ${st} cx="50" cy="13" r="11"/><path ${st} d="M22 46C22 23 35 15 50 15s28 8 28 31v10H22z"/>`;
    case 4: return `<path ${st} d="M23 46C23 22 36 14 50 14s27 8 27 32l-1 10H24z"/>`;
    case 5: {
      const pts = [[24, 62], [20, 50], [21, 37], [27, 26], [36, 18], [50, 15], [64, 18], [73, 26], [79, 37], [80, 50], [76, 62]];
      return pts.map(([x, y]) => `<circle ${st} cx="${x}" cy="${y}" r="10"/>`).join('');
    }
    case 6: { // 폭탄머리: 크고 들쭉날쭉한 뽀글 구름
      const pts = [[20, 64, 12], [12, 52, 13], [12, 37, 14], [19, 22, 14], [32, 10, 15], [50, 5, 16], [68, 10, 15], [81, 22, 14], [88, 37, 14], [88, 52, 13], [80, 64, 12],
                   [30, 22, 12], [50, 15, 12], [70, 22, 12]];
      return pts.map(([x, y, r]) => `<circle ${st} cx="${x}" cy="${y}" r="${r}"/>`).join('');
    }
    case 7: // 웨이브 장발 (가운데 가르마, 어깨 아래까지 풍성하게)
      return `<path ${st} d="M18 44C16 20 33 11 50 11s34 9 32 33c4 13-2 21 4 33 5 11-3 21 0 31H14c3-10-5-20 0-31 6-12 0-20 4-33z"/>
        <path d="M22 70q4 10-1 20M78 70q-4 10 1 20M30 84q3 8 0 16M70 84q-3 8 0 16" fill="none" stroke="${d}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return '';
}

function hairFront(h, c, d) {
  const st = `fill="${c}" stroke="${d}" stroke-width="1.4" stroke-linejoin="round"`;
  const shine = `<path d="M33 25q17-9 34 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round"/>`;
  const sides = `<path ${st} d="M24 40q-4 16 1 30l6-2q-4-13-2-28z"/><path ${st} d="M76 40q4 16-1 30l-6-2q4-13 2-28z"/>`;
  switch (h) {
    case 0: return `${sides}<path ${st} d="M23 44C22 24 35 16 50 16s28 8 27 28c-5-8-10-10-14-5-2-6-8-8-13-2-5-6-11-4-13 2-4-5-9-3-14 5z"/>${shine}`;
    case 1: return `${sides}<path ${st} d="M23 46C21 23 36 15 52 16c16 1 27 11 25 30-7-13-19-17-37-12-8 2-13 6-17 12z"/>${shine}`;
    case 2: return `<path ${st} d="M23 44C22 24 35 16 50 16s28 8 27 28v-6q-27-9-54 0z"/>${shine}`;
    case 3: return `${sides}<path ${st} d="M23 44C22 24 35 16 50 16s28 8 27 28c-6-9-14-11-20-6-3-5-10-6-14 0-5-5-12-3-16 2-3-2-5 0-4 4z"/>${shine}`;
    case 4: return `<path ${st} d="M22 44C21 22 35 13 50 13s30 9 28 31l-5-10-4 7-4-10-5 8-4-10-6 9-4-9-5 9-4-7-5 9-3-6z"/>${shine}`;
    case 5: return [[28, 31], [36, 26], [45, 24], [55, 24], [64, 26], [72, 31]].map(([x, y]) => `<circle ${st} cx="${x}" cy="${y}" r="8"/>`).join('') + shine;
    case 6: return [[25, 34, 9], [32, 26, 10], [42, 22, 10], [52, 21, 10], [62, 23, 10], [70, 28, 9], [76, 36, 8]].map(([x, y, r]) => `<circle ${st} cx="${x}" cy="${y}" r="${r}"/>`).join('')
      + `<path d="M36 14l-3-6M50 9V2M64 14l3-6M20 26l-6-3M80 26l6-3" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>` + shine;
    case 7: return `<path ${st} d="M50 16c-10 0-22 6-26 20-3 10-1 20-3 30l6-2c2-12 2-24 9-33 4-6 9-10 14-13z"/>
      <path ${st} d="M50 16c10 0 22 6 26 20 3 10 1 20 3 30l-6-2c-2-12-2-24-9-33-4-6-9-10-14-13z"/>
      <path ${st} d="M23 58c-6 12 3 22-3 34l7 2c5-12-4-22 2-34z"/><path ${st} d="M77 58c6 12-3 22 3 34l-7 2c-5-12 4-22-2-34z"/>
      <path d="M32 30q-4 8-5 18M68 30q4 8 5 18" fill="none" stroke="${d}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M36 22q-7 5-9 12M64 22q7 5 9 12" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  return '';
}

// ---------- 옷 ----------
function outfit(o, c, skin) {
  const d = shade(c, -0.28);
  const st = `fill="${c}" stroke="${d}" stroke-width="1.4" stroke-linejoin="round"`;
  const white = `fill="#FFFFFF" stroke="#C9C3D2" stroke-width="1.4" stroke-linejoin="round"`;
  const hands = `<circle cx="27" cy="102" r="4.6" fill="${skin}" stroke="${shade(skin, -0.25)}" stroke-width="1.2"/><circle cx="73" cy="102" r="4.6" fill="${skin}" stroke="${shade(skin, -0.25)}" stroke-width="1.2"/>`;
  const torso = s => `<path ${s} d="M29 109l1-19q2-15 16-18h8q14 3 16 18l1 19q-21 4-42 0z"/><path ${s} d="M31 84q-6 6-6 18h6l2-12z"/><path ${s} d="M69 84q6 6 6 18h-6l-2-12z"/>`;
  switch (o) {
    case 0: return torso(st) + `<path d="M45 72q5 6 10 0" fill="${skin}"/>` + hands;
    case 1: return `<path ${st} d="M24 114l8-32q4-10 14-11h8q10 1 14 11l8 32z"/><path ${st} d="M31 84q-6 6-6 18h6l2-12z"/><path ${st} d="M69 84q6 6 6 18h-6l-2-12z"/>
      <path d="M36 88h28" stroke="${d}" stroke-width="2.4"/><circle cx="50" cy="88" r="2.6" fill="#fff"/>
      <path ${white} d="M43 71q7 8 14 0l3 4q-10 8-20 0z"/>` + hands;
    case 2: return `<path ${st} d="M36 74q14-10 28 0l-4 6q-10-6-20 0z"/>` + torso(st) +
      `<path d="M46 76v10M54 76v10" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M39 96h22v8H39z" fill="${d}" opacity=".35"/>` + hands;
    case 3: return torso(white) + `<path d="M50 74l-4 4 4 20 4-20z" ${st}/><path ${white} d="M44 71l6 5-4 5-6-6zM56 71l-6 5 4 5 6-6z"/>` + hands;
    case 4: return `<path ${st} d="M31 104h38l5 14H26z"/><path d="M38 105l-3 12M50 105v12M62 105l3 12" stroke="${d}" stroke-width="1.2"/>` + torso(white) + `<path ${st} d="M35 76q15 12 30 0l3 8q-18 8-36 0z"/><path d="M46 82l4 6 4-6z" fill="#DB072F"/>` + hands;
    case 6: { // 토가: 한쪽 어깨를 드러낸 하얀 천 + 검은 끈 벨트 + 금 장식
      const skinD = shade(skin, -0.22);
      const cloth = `fill="#FFFDF8" stroke="#D8D0C4" stroke-width="1.4" stroke-linejoin="round"`;
      return `<path fill="${skin}" stroke="${skinD}" stroke-width="1.2" d="M31 84q-6 6-6 18h6l2-12z"/>
        <path ${cloth} d="M29 118l2-30q3-8 9-10L62 72q8 3 8 16l3 30z"/><path ${cloth} d="M69 84q6 6 6 18h-6l-2-12z"/>
        <path fill="${skin}" d="M33 86q2-9 9-11l-4 10z"/>
        <path d="M40 80l22-6M38 98q12-10 30-14M36 108q14-8 30-10" fill="none" stroke="#E6DED2" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M30 94q20 4 40 0" fill="none" stroke="#2B2B33" stroke-width="3.4" stroke-linecap="round"/><path d="M44 96l-2 10M48 96l1 9" stroke="#2B2B33" stroke-width="2" stroke-linecap="round"/>
        <circle cx="63" cy="75" r="2.8" fill="#F2C14E" stroke="#B88A1E" stroke-width="1"/><path d="M26 93h7" stroke="#F2C14E" stroke-width="3" stroke-linecap="round"/>` + hands;
    }
    case 5: return torso(white) + `<path ${st} d="M37 88h26v22H37z"/><path d="M39 88l-5-14M61 88l5-14" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="40" cy="91" r="1.6" fill="#fff"/><circle cx="60" cy="91" r="1.6" fill="#fff"/>` + hands;
  }
  return '';
}

// ---------- 다리 & 신발 (전신 2등신) ----------
function legs(o, c, skin) {
  const skinD = shade(skin, -0.22);
  const pantsByOutfit = { 0: '#4A5E9A', 2: '#3B3F52', 3: '#2F3550', 5: c };
  const pants = pantsByOutfit[o];
  const shoe = `fill="#2B2B33"`;
  const shoes = `<path ${shoe} d="M35 128q0-5 6-5h6v8H37q-2 0-2-3zM65 128q0-5-6-5h-6v8h10q2 0 2-3z"/>`;
  if (pants) {
    const d = shade(pants, -0.3);
    return `<path fill="${pants}" stroke="${d}" stroke-width="1.3" d="M37 106h12v20h-11zM51 106h12l-1 20H51z"/>` + shoes;
  }
  // 맨다리: 원피스·세일러(치마)·토가
  const sandals = o === 6;
  return `<path fill="${skin}" stroke="${skinD}" stroke-width="1.2" d="M39 108h9v19h-9zM52 108h9v19h-9z"/>` +
    (sandals
      ? `<path fill="${skin}" stroke="${skinD}" stroke-width="1.2" d="M36 129q0-4 5-4h7v6H38q-2 0-2-2zM64 129q0-4-5-4h-7v6h10q2 0 2-2z"/>
         <path d="M39 126l8 3M61 126l-8 3M40 122h8M52 122h8" stroke="#8A5A2B" stroke-width="1.6" stroke-linecap="round"/>`
      : `<path fill="#FFFFFF" d="M39 118h9v6h-9zM52 118h9v6h-9z"/>` + shoes);
}

// ---------- 얼굴 ----------
const L = 39, R = 61, EY = 50;
function eyes(e, iris, cx = {}) {
  const one = x => {
    switch (e) {
      case 1: return `<ellipse cx="${x}" cy="${EY}" rx="3.6" ry="4.6" fill="${INK}"/><circle cx="${x + 1.2}" cy="${EY - 1.6}" r="1.4" fill="#fff"/>`;
      case 2: return `<path d="M${x - 5} ${EY + 1}q5-6 10 0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
      case 3: return `<ellipse cx="${x}" cy="${EY + 1}" rx="4.2" ry="5.2" fill="${INK}"/><ellipse cx="${x}" cy="${EY + 2.6}" rx="3" ry="2.8" fill="${iris}"/>
        <circle cx="${x + 1.5}" cy="${EY - 1}" r="1.6" fill="#fff"/>
        <path d="M${x - 5.5} ${EY - 2.5}q5.5-5 11 0" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M${x < 50 ? x - 5.5 : x + 5.5} ${EY - 2.5}l${x < 50 ? -2.6 : 2.6} -2.2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
      case 4: { // 퀭: 반쯤 감긴 눈 + 다크서클 + 처진 눈썹
        const L2 = x < 50;
        return `<ellipse cx="${x}" cy="${EY + 2}" rx="4.6" ry="5" fill="${INK}"/><ellipse cx="${x}" cy="${EY + 3.6}" rx="3.2" ry="2.6" fill="${iris}"/>
          <circle cx="${x + 1.4}" cy="${EY + 1.6}" r="1.2" fill="#fff"/>
          <path d="M${x - 6.5} ${EY - 5.5}h13v6.2q-6.5-1.6-13 0z" fill="${cx.skin}"/>
          <path d="M${x - 6.5} ${EY + 0.7}q6.5-1.8 13 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M${x - 5} ${EY + 8}q5 3 10 0" fill="none" stroke="${cx.skinD}" stroke-width="1.6" stroke-linecap="round"/>
          <path d="M${L2 ? x - 7 : x + 7} ${EY - 6}L${L2 ? x + 5 : x - 5} ${EY - 10}" stroke="${cx.brow}" stroke-width="2.6" stroke-linecap="round"/>`;
      }
      default: return `<ellipse cx="${x}" cy="${EY + 1}" rx="5.4" ry="6.8" fill="${INK}"/><ellipse cx="${x}" cy="${EY + 3.4}" rx="4.2" ry="3.8" fill="${iris}"/>
        <circle cx="${x + 2}" cy="${EY - 2}" r="2.3" fill="#fff"/><circle cx="${x - 2}" cy="${EY + 4}" r="1.1" fill="#fff"/>
        <path d="M${x - 7} ${EY - 4}q7-7 14 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
  };
  return `<g class="ch-eyes">${one(L)}${one(R)}</g>`;
}

function face(mood, e, iris, cx) {
  const blush = `<ellipse cx="32" cy="58" rx="5" ry="3" fill="#FF7E9A" opacity=".45"/><ellipse cx="68" cy="58" rx="5" ry="3" fill="#FF7E9A" opacity=".45"/>`;
  switch (mood) {
    case 'happy':
      return blush.replace(/\.45/g, '.7') + `<g fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"><path d="M${L - 5} ${EY + 1}q5-7 10 0"/><path d="M${R - 5} ${EY + 1}q5-7 10 0"/></g>
        <path d="M44 58q6 9 12 0z" fill="${LIP}"/><path d="M47 61q3 2 6 0" fill="#FF9FB0"/>`;
    case 'sad':
      return blush + `<g fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><path d="M${L - 5} ${EY - 1}q5 5 10 0"/><path d="M${R - 5} ${EY - 1}q5 5 10 0"/>
        <path d="M${L - 5} ${EY - 8}l9 3"/><path d="M${R + 5} ${EY - 8}l-9 3"/><path d="M46 62q4-4 8 0"/></g>
        <path d="M${L - 3} ${EY + 4}q2.4 5 0 7q-2.4-2 0-7z" fill="#8FD0FF"/>`;
    case 'sleep':
      return blush + `<g fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><path d="M${L - 5} ${EY + 1}h10"/><path d="M${R - 5} ${EY + 1}h10"/></g>
        <ellipse cx="50" cy="60" rx="1.8" ry="2.2" fill="${LIP}"/>`;
    case 'wow':
      return blush + eyes(0, iris) + `<ellipse cx="50" cy="60" rx="2.6" ry="3.2" fill="${LIP}"/>`;
    default:
      return (e === 4 ? '' : blush) + eyes(e, iris, cx) + `<path d="M47 59q3 3 6 0" fill="none" stroke="${LIP}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
}

// ---------- 수염 ----------
function facialHair(f, c, d) {
  const st = `fill="${c}" stroke="${d}" stroke-width="1.1" stroke-linejoin="round"`;
  const stache = `<path ${st} d="M50 55c-3-2-9-2-12 2 3 0 6 1 8 2 2 0 3-1 4-2 1 1 2 2 4 2 2-1 5-2 8-2-3-4-9-4-12-2z"/>`;
  switch (f) {
    case 1: return stache;
    case 2: return `<path ${st} opacity=".92" d="M25 48c0 17 11 30 25 30s25-13 25-30c-3 9-9 15-16 15-3-2-6-3-9-3s-6 1-9 3c-7 0-13-6-16-15z"/>`
      + `<path d="M50 63v6M44 64l-1 5M56 64l1 5" stroke="${d}" stroke-width="1" stroke-linecap="round" opacity=".6"/>` + stache;
    case 3: return `<path ${st} d="M44 65c0 6 3 11 6 12 3-1 6-6 6-12-3 2-9 2-12 0z"/>` + stache;
  }
  return '';
}

// ---------- 소품 ----------
function accessory(a, hairColor) {
  switch (a) {
    case 1: return `<g transform="translate(67 19) rotate(14)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round">
      <path d="M0 0l-12-8q-3 8 0 16zM0 0l12-8q3 8 0 16z" fill="#FF5C83"/><circle r="3.6" fill="#FF5C83"/></g>`;
    case 2: return `<path transform="translate(30 25) scale(.55)" d="M0-12l3.5 7.5 8 1-6 5.5 1.6 8L0 6l-7.1 4 1.6-8-6-5.5 8-1z" fill="#FFC93C" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case 3: return `<g fill="rgba(255,255,255,.22)" stroke="${INK}" stroke-width="1.8"><circle cx="${L}" cy="${EY + 1}" r="8.4"/><circle cx="${R}" cy="${EY + 1}" r="8.4"/><path d="M${L + 8.4} ${EY}h5.2" fill="none"/></g>`;
    case 4: {
      const d = shade(hairColor, -0.3);
      return `<g stroke="${d}" stroke-width="1.4" stroke-linejoin="round"><path d="M24 30l2-20 14 10z" fill="${hairColor}"/><path d="M76 30l-2-20-14 10z" fill="${hairColor}"/></g>
        <path d="M27 25l1-9 7 5zM73 25l-1-9-7 5z" fill="#FFB3C6"/>`;
    }
    case 5: return [[28, 27, '#FF8FB1'], [37, 20, '#FFC93C'], [50, 17, '#FFFFFF'], [63, 20, '#A98BFF'], [72, 27, '#FF8FB1']]
      .map(([x, y, c]) => `<g transform="translate(${x} ${y})"><circle r="3.4" cx="-2.6" fill="${c}"/><circle r="3.4" cx="2.6" fill="${c}"/><circle r="3.4" cy="-2.6" fill="${c}"/><circle r="3.4" cy="2.6" fill="${c}"/><circle r="2" fill="#FFC93C"/></g>`).join('')
      + `<path d="M25 30q3-2 5-1M70 29q3-1 5 1" stroke="#2ED39A" stroke-width="2" fill="none"/>`;
    case 6: { // 천사날개 머리띠: 금빛 띠 + 양옆 하얀 날개
      const wing = `<path d="M0 0c-6-4-14-4-18 1 4 0 7 1 8 3-4 0-8 1-10 4 5-1 9 0 11 2-3 1-5 3-6 6 6-2 12-6 15-12z" fill="#FFFFFF" stroke="#C9C3D2" stroke-width="1.2" stroke-linejoin="round"/>`;
      return `<path d="M24 30q26-18 52 0" fill="none" stroke="#B88A1E" stroke-width="5" stroke-linecap="round"/>
        <path d="M24 30q26-18 52 0" fill="none" stroke="#F6D06E" stroke-width="3" stroke-linecap="round"/>
        <g transform="translate(25 27) rotate(-10)">${wing}</g><g transform="translate(75 27) scale(-1 1) rotate(-10)">${wing}</g>`;
    }
  }
  return '';
}

export function avatarSVG(raw, mood = 'idle', cls = '') {
  const a = normAvatar(raw);
  const hc = HAIR[a.hc], hd = shade(hc, -0.32);
  const skin = SKIN[a.s], skinD = shade(skin, -0.22);
  const iris = shade(HAIR[a.hc] === '#3B2A2E' ? '#8A5BD6' : HAIR[a.hc], 0.15);
  return `<svg class="av ch-${mood} ${cls}" viewBox="0 0 100 136" aria-hidden="true">
    ${hairBack(a.h, hc, hd)}
    ${legs(a.o, CLOTH[a.oc], skin)}
    ${outfit(a.o, CLOTH[a.oc], skin)}
    <path d="M45 64h10v9q-5 3-10 0z" fill="${skinD}"/>
    <ellipse cx="50" cy="47" rx="27" ry="25" fill="${skin}" stroke="${skinD}" stroke-width="1.4"/>
    ${face(mood, a.e, iris, { skin, skinD, brow: hd })}
    ${facialHair(a.f, a.h === 6 || a.h === 5 ? hd : hc, hd)}
    ${a.a === 4 ? accessory(4, hc) : ''}
    ${hairFront(a.h, hc, hd)}
    ${a.a !== 4 ? accessory(a.a, hc) : ''}
  </svg>`;
}

// ---------- 브랜드 마스코트 (크림슨 말랑이) ----------
export function mascotSVG(mood = 'idle', cls = '') {
  const eyesM = mood === 'happy'
    ? `<g fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"><path d="M31 52q7-9 14 0"/><path d="M55 52q7-9 14 0"/></g>`
    : mood === 'sleep'
    ? `<g fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M32 52h12"/><path d="M56 52h12"/></g>`
    : `<g class="ch-eyes"><ellipse cx="38" cy="50" rx="7.5" ry="9" fill="#fff"/><ellipse cx="62" cy="50" rx="7.5" ry="9" fill="#fff"/>
       <circle cx="39" cy="52" r="4.2" fill="${INK}"/><circle cx="63" cy="52" r="4.2" fill="${INK}"/></g>`;
  return `<svg class="ch mascot ch-${mood} ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="51" r="40" fill="#DB072F"/>${eyesM}
    <ellipse cx="27" cy="63" rx="6" ry="3.5" fill="#fff" opacity=".35"/><ellipse cx="73" cy="63" rx="6" ry="3.5" fill="#fff" opacity=".35"/></svg>`;
}
