// =====================================================================
//  아바타 시스템 — 꾸미기 스티커 스타일 (2등신 꼬마 캐릭터)
//  참가자가 고르는 7가지:
//    h  머리 모양   hc 머리 색   s 피부   e 눈   o 옷   oc 옷 색   a 소품
//  mood 로 표정을 덮어씀: 'idle' | 'happy'(정답) | 'sad'(오답) | 'sleep'(미응답) | 'wow'(두근)
// =====================================================================

export const PARTS = {
  h:  { label: '머리',   names: ['긴생머리', '단발', '양갈래', '똥머리', '숏컷', '곱슬', '폭탄머리', '웨이브장발'] },
  hc: { label: '머리색', names: ['초코', '흑발', '금발', '핑크', '라벤더', '민트', '하늘', '체리'] },
  s:  { label: '피부',   names: ['우유', '꿀', '코코아'] },
  e:  { label: '눈',     names: ['반짝', '푸른별', '초롱', '방긋', '새침', '퀭', '초록별', '별눈'] },
  f:  { label: '수염',   names: ['없음', '콧수염', '덥수룩', '염소', '까칠'] },
  o:  { label: '옷',     names: ['세일러', '후드', '블라우스', '셔츠', '프릴원피스', '티셔츠', '멜빵', '토가'] },
  a:  { label: '소품',   names: ['없음', '리본', '고양이귀', '천사날개', '안경', '꽃관', '베레모', '헤드폰', '별핀'] },
};
export const PART_KEYS = ['h', 'hc', 's', 'e', 'f', 'o', 'a'];

// 요즘 유행 프리셋 ㅋ — 갈색 웨이브 장발 + 턱수염 + 퀭한 눈 + 토가 + 천사날개
export const PRESETS = {
  밤티: { z: 12, h: 0, f: 0, b: 0 },
};

export const HAIR = ['#8A5634', '#3A3040', '#E9B949', '#F28DB2', '#A98BE6', '#5CC9A0', '#6CB4F0', '#D23A4C'];
export const SKIN = ['#FAD6BE', '#E2A878', '#A86E4A'];
export const CLOTH = ['#DB072F', '#4B7BFF', '#FFC93C', '#2ED39A', '#A98BFF', '#FF8FB1', '#FF8A3D', '#5CC8FF'];
const INK = '#2B1B24';
const LIP = '#C2414F';

function shade(hex, amt) {             // amt < 0 어둡게, > 0 밝게
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
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

function avatarVector(raw, mood = 'idle', cls = '', opt = {}) {
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
    ${opt.noFace ? '' : face(mood, a.e, iris, { skin, skinD, brow: hd })}
    ${facialHair(a.f, a.h === 6 || a.h === 5 ? hd : hc, hd)}
    ${a.a === 4 ? accessory(4, hc) : ''}
    ${hairFront(a.h, hc, hd)}
    ${a.a !== 4 ? accessory(a.a, hc) : ''}
  </svg>`;
}

// ---------- 브랜드 마스코트 (크림슨 말랑이) ----------
function mascotVector(mood = 'idle', cls = '') {
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


// =====================================================================
//  픽셀 캐릭터 (손으로 찍은 도트 인형)
//  40×62칸 도트 위에 부위별로 한 칸씩 찍어서 만들어요.
//   - 부위마다 4단 색(외곽선 · 그림자 · 기본 · 하이라이트)으로 칠하고
//   - 부위 테두리는 그 부위의 진한 색으로 외곽선을 둘러요 (머리카락은 진한 머리색, 피부는 진한 살색)
//   - 눈·입·소품은 도트 그림을 그대로 찍어요
//  화면에서는 image-rendering: pixelated 로 키워서 네모 도트가 또렷하게 보여요.
//  같은 모습은 처음 한 번만 그리고 저장해 둔 그림을 다시 써요.
// =====================================================================
const SW = 56, SH = 71;                                // 캐릭터 도트 크기 (머리 : 몸 ≈ 1 : 1)
const OUT_SCALE = 5;                                   // 그림 파일은 5배로 키워 저장 → 작게 보여도 도트가 깨지지 않음
const pxCache = new Map();
const canDraw = typeof document !== 'undefined';
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => '#' + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const ramp = (c, o = -0.55) => ({ o: shade(c, o), s: shade(c, -0.18), b: c, h: shade(c, 0.32) });
const flat = c => ({ o: c, s: c, b: c, h: c });

// 모양 도우미 (칸 좌표 x, y → 안에 있으면 true)
const ell = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const or = (...f) => (x, y) => f.some(t => t(x, y));
const and = (...f) => (x, y) => f.every(t => t(x, y));
const not = f => (x, y) => !f(x, y);
const bumpy = (cx, cy, rx, ry, k, amp) => (x, y) => { const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx); return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 + amp * Math.abs(Math.sin(a * k)); };
// 옆머리 가닥: 아래 끝이 뾰족
const lock = (x0, x1, y0, y1, cx) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 - Math.abs(x - cx);
const cut = (...pts) => not(or(...pts.map(([x, y]) => rect(x, y, x, y))));

class Sprite {
  constructor(w = SW, h = SH) { this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
  set(x, y, c) { if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
  // 모양 하나를 칠함: 테두리 = 외곽선, 오른쪽·아래 안쪽 = 그림자, 왼쪽·위 안쪽 = 하이라이트(선택)
  fill(test, r, o = {}) {
    const W = this.w, H = this.h, m = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x, y)) m[y * W + x] = 1;
    // 한 칸짜리 튀어나온 점·구멍 정리 (외곽선이 깨져 보이는 것 방지)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && m[yy * W + xx] === 1;
      const cnt = n(x - 1, y) + n(x + 1, y) + n(x, y - 1) + n(x, y + 1);
      if (m[i] && cnt <= 1) m[i] = 0; else if (!m[i] && cnt >= 3) m[i] = 1;
    }
    const M = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!M(x, y)) continue;
      const edge = !M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1);
      const openTop = o.noTopLine && !M(x, y - 1) && M(x - 1, y) && M(x + 1, y);
      let c;
      if (edge && !openTop && !o.noLine) c = r.o;
      else if (!M(x + 2, y) || !M(x, y + 2)) c = r.s;
      else if (o.hl && (!M(x - 2, y) || !M(x, y - 2))) c = r.h;
      else c = r.b;
      if (o.paint) c = o.paint(x, y, c, r) || c;
      this.set(x, y, c);
    }
    return this;
  }
  stamp(rows, x0, y0, pal, flip = false) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || !pal[ch]) return;
      this.set(x0 + (flip ? row.length - 1 - x : x), y0 + y, pal[ch]);
    }));
    return this;
  }
  url(k = OUT_SCALE) {
    const c = document.createElement('canvas'); c.width = this.w * k; c.height = this.h * k;
    const g = c.getContext('2d');
    this.px.forEach((col, i) => { if (col) { g.fillStyle = col; g.fillRect((i % this.w) * k, Math.floor(i / this.w) * k, k, k); } });
    return c.toDataURL('image/png');
  }
}

// ---------- 눈 · 입 도트 (왼쪽 눈 기준 10칸, 오른쪽은 좌우 뒤집어 찍음. 바깥쪽 = 왼쪽) ----------
// K 윗눈꺼풀·속눈썹 · P 눈동자 · D 진한 홍채 · I 홍채 · L 밝은 홍채 · W 반짝이 · E 흰자 · s 아래 속눈썹 · S 눈두덩
const EYES = {
  0: ['..KKKKKK..', '.KKKKKKKKK', 'KKPPPPWWWK', '.EPPPPWWWE', '.EDPPPPWDE', '.EDDPPDDDE', '.EIIDDIIIE', '.EIIIIIWIE', '..LLLLLLL.', '...LLLL...'],   // 반짝
  1: ['..........', '...PPPP...', '..PPPPWW..', '.PPPPPWWP.', '.PPPPPPPP.', '.PPPPPPPP.', '.PPWPPPPP.', '..PPPPPP..', '...PPPP...'],                       // 초롱
  2: ['..........', '..........', '..........', '..........', '..KKKKKK..', '.K......K.', 'K........K'],                                             // 방긋
  3: ['..........', '..........', 'KKKKKKKKKK', 'KKPPPPPWWK', '.EPPPPPWWE', '.EDDDDDIIE', '..LLLLLLL.', '....ss....'],                                 // 새침
  4: ['..........', '..........', '..........', 'SSSSSSSSSS', 'KKKKKKKKKK', '.EPPPWPPPE', '.EIIIIIIIE', '..LLLLLL..', '..SSSSSS..'],                     // 퀭
  happy: ['..........', '..........', '..........', '..........', '..KKKKKK..', '.K......K.', 'K........K'],
  sad: ['..........', '..........', 'KKKKKKKKKK', 'KKPPPPPWWK', '.EDDPPDDDE', '.EIIDDDIIE', '..LLLLLLL.'],
  sleep: ['..........', '..........', '..........', '..........', '..........', '..........', 'KKKKKKKKKK', '.K..K..K..'],
  wow: ['..KKKKKK..', '.KKKKKKKKK', 'KEEPPPPWWK', '.EPPPPPWWE', '.EPPPPPPPE', '.EDPPPPPDE', '.EIDDDDDIE', '..LLLLLLL.', '...LLLLL..'],
};
const MOUTHS = {
  idle: ['MM', 'mm'], happy: ['MMMMM', 'MPPPM', '.MMM.'], sad: ['.MMM.', 'M...M'], sleep: ['.m.'], wow: ['.MM.', 'MPPM', 'MPPM', '.MM.'],
};

// ---------- 머리 모양 (뒷머리 · 앞머리) ----------
const SKULL = ell(28, 22, 21, 19);
// 앞머리 끝: 뾰족뾰족한 가닥 (5칸마다 한 가닥)
const TIP = [0, 1, 3, 1, 0];
const fringe = (base, x) => base + TIP[(x + 1) % 5] - (x % 10 < 5 ? 0 : 1);
const strandLine = (base, x, y) => (x + 1) % 5 === 0 && y > base - 7;            // 가닥 사이 진한 선
const HAIRS = {
  0: { // 단발
    back: and(or(SKULL, rect(7, 22, 48, 46)), cut([7, 46], [48, 46], [8, 46], [47, 46], [7, 45], [48, 45])),
    front: or(and(SKULL, (x, y) => y < fringe(22, x)), lock(8, 12, 20, 46, 10), lock(43, 47, 20, 46, 45)),
    fb: 22,
  },
  1: { // 긴머리
    back: and(or(SKULL, rect(7, 22, 48, 62)), cut([7, 62], [48, 62], [8, 62], [47, 62], [7, 61], [48, 61])),
    front: or(and(SKULL, (x, y) => y < fringe(22, x)), lock(8, 12, 20, 58, 10), lock(43, 47, 20, 58, 45)),
    fb: 22, strands: true,
  },
  2: { // 양갈래
    back: or(SKULL, rect(7, 22, 48, 36), ell(5.5, 41, 5.5, 14), ell(50.5, 41, 5.5, 14)),
    front: or(and(SKULL, (x, y) => y < fringe(21, x)), lock(8, 11, 20, 38, 9), lock(44, 47, 20, 38, 46)),
    fb: 21, ties: [[1, 25], [48, 25]],
  },
  3: { // 똥머리
    back: or(SKULL, rect(7, 22, 48, 36)),
    front: or(and(SKULL, (x, y) => y < fringe(21, x)), lock(8, 11, 20, 38, 9), lock(44, 47, 20, 38, 46)),
    fb: 21, bun: ell(28, 6.5, 8, 6),
  },
  4: { // 숏컷
    back: or(ell(28, 21.5, 21, 18.5), rect(8, 22, 47, 33)),
    front: or(and(ell(28, 21.5, 21, 18.5), (x, y) => y < 14 + (x - 7) * 0.28 + TIP[x % 5]), rect(8, 18, 10, 33), rect(45, 18, 47, 33)),
    fb: 20,
  },
  5: { // 뽀글
    back: and(bumpy(28, 22, 22.5, 20.5, 8, 0.1), (x, y) => y < 47),
    front: and(ell(28, 22, 22, 20), (x, y) => y < 19 + 3 * Math.abs(Math.sin((x + 1) * 0.6)) || x < 11 || x > 44),
    curls: true,
  },
  6: { // 폭탄머리
    back: bumpy(28, 19, 27.4, 19.5, 9, 0.08),
    front: and(ell(28, 19, 27, 19), (x, y) => y < 18 + 3 * Math.abs(Math.sin((x + 2) * 0.55)) || x < 10 || x > 45),
    curls: true,
  },
  7: { // 웨이브 장발 (가르마)
    back: (x, y) => SKULL(x, y) || (y >= 20 && y <= 64 && x >= 6 - Math.round(Math.sin(y / 2.6) * 2) && x <= 49 + Math.round(Math.sin(y / 2.6 + 1) * 2)),
    front: (x, y) => (SKULL(x, y) && y < 12 + Math.abs(x + 0.5 - 28) * 0.62) || ((x <= 12 + Math.round(Math.sin(y / 2.6) * 1.5) || x >= 43 + Math.round(Math.sin(y / 2.6 + 1) * 1.5)) && y >= 14 && y <= 58 && x >= 5 && x <= 50),
    strands: true,
  },
};

// ---------- 옷 ----------
function drawOutfit(S, o, cl, sk) {
  const C = ramp(cl, -0.5), Wt = { o: '#8E8796', s: '#DCD8E4', b: '#FFFFFF', h: '#FFFFFF' };
  const navy = ramp('#3B4266', -0.45), shoe = ramp('#3A2A33', -0.4);
  const SK = { o: sk.o, s: sk.s, b: sk.b, h: sk.b };
  const legs = (r = SK) => { S.fill(rect(20, 55, 25, 65), r); S.fill(rect(30, 55, 35, 65), r); };
  const shoes = (r = shoe) => { S.fill(and(rect(19, 64, 26, 69), cut([19, 64], [26, 64])), r, { hl: true }); S.fill(and(rect(29, 64, 36, 69), cut([29, 64], [36, 64])), r, { hl: true }); };
  const socks = () => { S.fill(rect(20, 60, 25, 64), Wt, { noTopLine: true }); S.fill(rect(30, 60, 35, 64), Wt, { noTopLine: true }); };
  const arms = (sleeve, r = C) => {
    for (const x0 of [12, 39]) {
      S.fill(rect(x0, 42, x0 + 4, 53), SK);
      S.fill(and(rect(x0, 52, x0 + 4, 56), cut([x0, 56], [x0 + 4, 56])), SK);                         // 손
      if (sleeve) S.fill(and(rect(x0, 41, x0 + 4, sleeve), cut([x0 === 12 ? 12 : 43, 41])), r);
    }
  };
  const torso = (r, y1 = 54, x0 = 17, x1 = 38) => S.fill(and(rect(x0, 40, x1, y1), cut([x0, 40], [x1, 40], [x0 + 1, 40], [x1 - 1, 40])), r);
  const aline = (y0, y1, r, opts = {}) => S.fill((x, y) => y >= y0 && y <= y1 && Math.abs(x + 0.5 - 28) <= 10.5 + Math.max(0, (y - y0 - 4)) * 0.5, r, opts);
  const pants = r => { S.fill(rect(19, 52, 36, 57), r); S.fill(rect(20, 55, 26, 64), r); S.fill(rect(29, 55, 35, 64), r); };
  const collar = () => S.stamp(['wwww....wwww', '.wwwww.wwww.', '..www..www..'], 22, 40, { w: '#FFFFFF' });
  switch (o) {
    case 0: // 티셔츠 + 반바지
      legs(); socks(); shoes();
      S.fill(rect(18, 51, 37, 58), navy); S.fill(rect(27, 54, 28, 58), flat(navy.o));
      arms(46); torso(C, 52);
      S.stamp(['oooooooooo'], 23, 41, { o: C.o });
      break;
    case 1: // 원피스
      legs(); socks(); shoes();
      arms(44); aline(40, 59, C, { paint: (x, y, c) => y > 50 && c === C.b && x % 4 === 0 ? C.s : null });
      collar();
      S.stamp(['r.r', '.r.', 'r.r'], 27, 42, { r: C.o });
      break;
    case 2: // 후드티 + 바지
      shoes(); pants(navy); S.fill(rect(27, 57, 28, 64), flat(navy.o));
      arms(52); torso(C, 54, 16, 39);
      S.fill(and(ell(28, 41, 9, 3), (x, y) => y >= 40), C);
      S.stamp(['w....w', 'w....w', 'w....w', 'o....o'], 25, 42, { w: '#FFFFFF', o: '#B8B0C2' });
      S.stamp(['oooooooooooo'], 22, 49, { o: C.o });
      break;
    case 3: // 셔츠 + 넥타이
      shoes(); pants(navy); S.fill(rect(27, 57, 28, 64), flat(navy.o));
      arms(52, Wt); torso(Wt, 54);
      S.stamp(['WWW....WWW', '.WWW..WWW.', '..W....W..'], 23, 40, { W: '#C9C2D0' });
      S.stamp(['.tt.', '.tt.', 'tttt', 'tttt', 'tTTt', 'tTTt', '.TT.', '..T.'], 26, 41, { t: C.b, T: C.s });
      break;
    case 4: // 세일러
      legs(); socks(); shoes();
      arms(45, Wt); torso(Wt, 50);
      aline(49, 58, C, { paint: (x, y, c) => c === C.b && x % 2 === 0 ? C.s : null });
      S.stamp(['cccccccccccccccc', 'ccc.wwwwwwww.ccc', '.ccc.wwwwww.ccc.', '..ccc.wwww.ccc..', '...ccc.ww.ccc...', '....ccc..ccc....', '.....cccccc.....'], 20, 40, { c: C.b, w: '#FFFFFF' });
      S.stamp(['rr.rr', 'rrrrr', 'rr.rr', '.r.r.'], 26, 46, { r: '#DB072F' });
      break;
    case 5: // 멜빵
      legs(); socks(); shoes();
      arms(45, Wt); torso(Wt, 54);
      S.fill(or(rect(19, 47, 36, 58), rect(19, 40, 22, 47), rect(33, 40, 36, 47)), C);
      S.fill(rect(27, 54, 28, 58), flat(C.o));
      S.stamp(['yy', 'yy'], 20, 47, { y: '#FFC93C' }); S.stamp(['yy', 'yy'], 34, 47, { y: '#FFC93C' });
      S.stamp(['oooooo', 'o....o', 'oooooo'], 25, 50, { o: C.o });
      break;
    case 6: // 토가 (밤티)
      S.fill(rect(20, 64, 26, 68), ramp('#B9824E', -0.45)); S.fill(rect(29, 64, 35, 68), ramp('#B9824E', -0.45));
      arms(0);
      aline(40, 65, Wt, { paint: (x, y, c) => c === Wt.b && (x + y) % 6 === 0 && y > 44 ? Wt.s : null });
      S.fill((x, y) => y >= 40 && y <= 56 && Math.abs((x - 18) - (y - 40) * 1.2) <= 1.4, C);   // 어깨띠
      break;
  }
}

// ---------- 소품 ----------
const EAR = ['o.........', 'oo........', 'obo.......', 'obbo......', 'obpbo.....', 'obppbo....', 'obpppbo...', 'obppppbo..', 'obpppppbo.', 'obbbbbbbbo'];
function drawAccessory(S, a, hr) {
  const D = '#2B1B24';
  switch (a) {
    case 1: S.stamp(['ooo.....ooo', 'obbo...obbo', 'obbbo.obbbo', 'obhbbkbbhbo', 'obbbbkbbbbo', 'obbbo.obbbo', 'obbo...obbo', 'ooo.....ooo'], 36, 5, { o: '#A3123A', b: '#FF5C83', h: '#FFB3C6', k: '#C81E4A' }); break;
    case 2: S.stamp(['...o...', '..oyo..', 'ooyyyoo', 'oyyhyyo', '.oyyyo.', 'oyo.oyo', 'oo...oo'], 11, 13, { o: '#B57E00', y: '#FFD44D', h: '#FFF3B0' }); break;
    case 3: {
      const ring = ['..oooooooo..', '.o........o.', 'o..........o', 'o..........o', 'o..........o', 'o..........o', 'o..........o', '.o........o.', '..oooooooo..'];
      S.stamp(ring, 13, 25, { o: D }).stamp(ring, 31, 25, { o: D }).stamp(['oooooo'], 25, 28, { o: D });
      break;
    }
    case 4: {
      const pal = { o: hr.o, b: hr.b, p: '#FFB3C6' };
      S.stamp(EAR, 8, 0, pal).stamp(EAR, 38, 0, pal, true);
      break;
    }
    case 5: [[11, 10, '#FF8FB1'], [18, 7, '#FFD44D'], [25, 6, '#FFFFFF'], [32, 7, '#C9A8FF'], [39, 10, '#FF8FB1']]
      .forEach(([x, y, c]) => S.stamp(['.cc.', 'cyyc', 'cyyc', '.cc.'], x, y, { c, y: '#FFB000' }));
      break;
    case 6: { // 천사 날개 머리띠 + 금색 머리띠
      const wing = ['......oo', '....oowo', '..oowwwo', '.owwwwso', 'owwwsso.', 'owwsso..', '.osso...', '..oo....'];
      S.stamp(wing, 0, 13, { o: '#9C93A8', w: '#FFFFFF', s: '#DCD6E6' }).stamp(wing, 48, 13, { o: '#9C93A8', w: '#FFFFFF', s: '#DCD6E6' }, true);
      for (let x = 9; x <= 46; x++) { const y = Math.round(11 + ((x + 0.5 - 28) / 19) ** 2 * 4); S.set(x, y, '#FFD44D'); S.set(x, y + 1, '#E0A400'); }
      break;
    }
  }
}

function drawAvatar(a, mood) {
  const S = new Sprite();
  const hr = ramp(HAIR[a.hc], -0.5);
  if (HAIR[a.hc] === '#3B2A2E') { hr.o = '#1A1114'; hr.h = '#6B5560'; hr.s = '#2C1F23'; }
  const sk0 = SKIN[a.s], sk = { o: shade(sk0, -0.38), s: shade(sk0, -0.07), b: sk0, h: sk0 };
  const H = HAIRS[a.h] || HAIRS[0];
  const hairPaint = (x, y, c, r) => {
    if (c === r.o) return null;
    if (H.fb && strandLine(H.fb, x, y) && y < H.fb + 4) return r.s;
    if (H.strands && y > 34 && (x + 1) % 5 === 0) return r.s;
    if (H.curls && (x * 3 + y * 5) % 9 === 0) return r.h;
    if (H.curls && (x * 5 + y * 3) % 13 === 0) return r.s;
    return null;
  };

  // 1) 뒷머리 · 고양이귀(뒤) · 2) 몸 · 3) 얼굴
  S.fill(H.back, hr, { paint: hairPaint });
  if (H.bun) S.fill(H.bun, hr, { hl: true, paint: (x, y, c, r) => c !== r.o && (x + y) % 4 === 0 ? r.s : null });
  if (a.a === 4) drawAccessory(S, 4, hr);
  drawOutfit(S, a.o, CLOTH[a.oc], sk);
  S.fill(rect(25, 38, 30, 41), { o: sk.o, s: shade(sk0, -0.15), b: shade(sk0, -0.15), h: shade(sk0, -0.15) });   // 목
  S.fill(ell(28, 26, 17.5, 15.5), sk);

  const iris = HAIR[a.hc] === '#3B2A2E' ? '#6E6690' : mix(HAIR[a.hc], '#6B6585', 0.5);
  const pal = {
    K: '#22161C', P: '#1E1626', D: mix(iris, '#1E1626', 0.45), I: iris, L: mix(iris, '#FFFFFF', 0.45), W: '#FFFFFF', E: '#FFFFFF',
    s: shade(sk0, -0.3), S: shade(sk0, -0.14), M: '#D45F78', m: '#F09AAE', P2: '#FF8FA6', T: '#8FD0FF', B: hr.o,
  };
  const eyeRows = EYES[mood] || EYES[a.e] || EYES[0];
  const ey = 25;
  // 볼터치 (두 겹)
  if (!(a.e === 4 && mood === 'idle')) {
    const b1 = mix(sk0, '#FF6F91', 0.28), b2 = mix(sk0, '#FF6F91', 0.48);
    const blush = ['..bbbbb.', '.bBBBBBb', '.bBBBBBb', '..bbbbb.'];
    S.stamp(blush, 10, 33, { b: b1, B: b2 }).stamp(blush, 38, 33, { b: b1, B: b2 }, true);
  }
  S.stamp(eyeRows, 14, ey, pal);
  S.stamp(eyeRows, 32, ey, pal, true);
  if ([EYES[0], EYES.wow, EYES.sad].includes(eyeRows)) { S.set(13, ey + 1, pal.K); S.set(12, ey, pal.K); S.set(42, ey + 1, pal.K); S.set(43, ey, pal.K); }
  if (eyeRows === EYES[3]) { S.set(13, ey + 2, pal.K); S.set(12, ey + 1, pal.K); S.set(11, ey, pal.K); S.set(42, ey + 2, pal.K); S.set(43, ey + 1, pal.K); S.set(44, ey, pal.K); }
  if ((a.e === 4 && mood === 'idle') || mood === 'sad') S.stamp(['.....BB', '...BB..', '.BB....', 'B......'], 15, ey - 2, pal).stamp(['.....BB', '...BB..', '.BB....', 'B......'], 34, ey - 2, pal, true);
  if (mood === 'sad') S.stamp(['T', 'TT', 'TT'], 15, ey + 8, pal);
  S.set(28, 35, shade(sk0, -0.2));                                                  // 코
  const mouth = MOUTHS[mood] || MOUTHS.idle;
  const mx = 28 - Math.floor(mouth[0].length / 2), my = 38;
  if (!a.f || mood !== 'idle') S.stamp(mouth, mx, my, { M: pal.M, m: pal.m, P: pal.P2 });
  // 4) 수염
  const beard = { o: hr.o, s: hr.s, b: hr.b, h: hr.h };
  if (a.f === 2) S.fill(and(ell(28, 38, 16, 10.5), (x, y) => y >= 34), beard, { paint: (x, y, c, r) => c !== r.o && (x * 2 + y) % 4 === 0 ? r.s : null });
  if (a.f === 1 || a.f === 2) S.stamp(['oo..........oo', '.oobbbbbbbboo.', '..oooooooooo..'], 21, 35, { o: hr.o, b: hr.b });
  if (a.f === 3) S.fill(ell(28, 44, 3, 4), beard);
  if (a.f === 2 && mood !== 'idle') S.stamp(mouth, mx, my + 1, { M: pal.M, m: pal.m, P: pal.P2 });
  // 5) 앞머리 (얼굴 위에) + 천사링
  S.fill(and(H.front, H.back), hr, { hl: true, paint: hairPaint });
  for (let x = 12; x <= 43; x++) {
    const y = Math.round(10 + ((x + 0.5 - 28) / 15) ** 2 * 4);
    const here = S.get(x, y);
    if (here === hr.b || here === hr.h || here === hr.s) { S.set(x, y, hr.h); if (x % 3 === 1) S.set(x, y + 1, hr.h); }
  }
  if (H.ties) H.ties.forEach(([x, y]) => S.stamp(['oo..oo', 'opooop', 'oppkpo', 'opooop', 'oo..oo'], x, y, { o: '#A3123A', p: '#FF5C83', k: '#C81E4A' }));
  // 6) 소품 (고양이귀는 이미 뒤에 그림)
  if (a.a !== 4) drawAccessory(S, a.a, hr);
  return S;
}

function drawMascot(mood) {
  const S = new Sprite(24, 24);
  S.fill(ell(12, 12.5, 10.5, 10), ramp('#DB072F', -0.5), { hl: true });
  if (mood === 'happy') S.stamp(['.KK..KK.', 'K..KK..K'], 8, 10, { K: '#2B1B24' });
  else if (mood === 'sleep') S.stamp(['KKK..KKK'], 8, 11, { K: '#2B1B24' });
  else S.stamp(['WW..WW', 'WK..WK', 'KK..KK'], 9, 9, { W: '#FFFFFF', K: '#2B1B24' });
  S.stamp(['b......b'], 8, 14, { b: '#FF7E9A' });
  return S;
}

function pixelTag(key, draw, wrapCls) {
  let src = pxCache.get(key);
  if (!src && canDraw) { try { src = draw().url(); pxCache.set(key, src); } catch { src = ''; } }
  return `<span class="${wrapCls}" aria-hidden="true"><img class="px-img" src="${src || ''}" alt="" draggable="false"></span>`;
}

// (예전 도트 꾸미기 캐릭터 — 지금은 쓰지 않음)
function oldAvatarSVG(raw, mood = 'idle', cls = '') {
  const a = normAvatar(raw);
  const key = `a${mood}-${PART_KEYS.map(k => a[k]).join('')}`;
  return pixelTag(key, () => drawAvatar(a, mood), `av px ch-${mood} ${cls}`);
}

// =====================================================================
//  12간지 픽셀 캐릭터 (assets/zodiac) + 소품 (assets/acc)
//  avatar = { z: 띠 0~11 (12 = 밤티), h: 머리 소품, f: 얼굴 소품, b: 탈것·등 }
// =====================================================================
export const ZODIAC = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지', '밤티'];
export const BAMTI = 12;
export const ACC_SLOTS = [
  ['h', '머리', ['없음', '리본', '왕관', '고깔모자', '꽃관']],
  ['f', '얼굴', ['없음', '안경', '선글라스']],
  ['b', '탈것·등', ['없음', '빨간 자동차', '람보르기니', '포르쉐', '천사날개']],
];
const ACC_IMG = { h: [null, 0, 2, 3, 4], f: [null, 1, 5], b: [null, 6, 8, 9, 7] };
const ACC_RATIO = [0.805, 0.421, 0.769, 1.333, 0.524, 0.385, 0.789, 0.588, 0.656, 0.656];   // 소품 그림 높이/너비
// 소품별 붙이는 법: [기준, 너비(눈 사이 거리 배수), 위로 겹치는 비율, 옆으로 비킴]
const ACC_SPEC = [['top', 1.0, 0.3, 0.5], ['eye', 2.1], ['top', 1.0, 0.28, 0], ['top', 0.72, 0.18, 0.12], ['top', 1.9, 0.38, 0], ['eye', 2.0], ['car', 0.62], ['back', 3.0], ['car', 0.86], ['car', 0.86]];
// 띠별 얼굴 위치 [눈 가운데 x, 눈 높이 y, 두 눈 사이 거리, 머리 꼭대기 y] (정사각형 상자 대비 비율)
const FACE = [[0.5, 0.47, 0.34, 0.23], [0.49, 0.4, 0.35, 0.1], [0.48, 0.43, 0.38, 0.07], [0.5, 0.55, 0.3, 0.4], [0.46, 0.42, 0.34, 0.14], [0.46, 0.3, 0.34, 0.05], [0.38, 0.44, 0.34, 0.06], [0.5, 0.49, 0.34, 0.08], [0.5, 0.49, 0.34, 0.12], [0.49, 0.49, 0.36, 0.21], [0.52, 0.47, 0.34, 0.14], [0.47, 0.42, 0.36, 0.17], [0.5, 0.3, 0.17, 0.05]];
export const zodiacOfYear = y => ((y - 1900) % 12 + 12) % 12;   // 1900년 = 쥐띠

export function normAvatar(a = {}) {
  const n = (v, mx) => Number.isInteger(v) && v >= 0 && v <= mx ? v : 0;
  if (a && Number.isInteger(a.z)) return { z: n(a.z, 12), h: n(a.h, 4), f: n(a.f, 2), b: n(a.b, 4) };
  // 예전 캐릭터로 저장된 사람: 늘 같은 띠가 되도록
  const k = JSON.stringify(a || {}).split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  return { z: Math.abs(k) % 12, h: 0, f: 0, b: 0 };
}
export function randomAvatar() {
  const r = n => Math.floor(Math.random() * n);
  return { z: r(12), h: Math.random() < 0.5 ? 0 : r(5), f: Math.random() < 0.7 ? 0 : r(3), b: Math.random() < 0.7 ? 0 : r(5) };
}

function accTag(i, z) {
  const [kind, wm, yo, xo] = ACC_SPEC[i], [ex, ey, g, ht] = FACE[z];
  const pct = v => `${(v * 100).toFixed(1)}%`;
  let w, x, y;
  if (kind === 'car') { w = wm; x = 0.5 - w / 2; y = 1 - w * ACC_RATIO[i]; }
  else {
    w = wm * g;
    const h = w * ACC_RATIO[i];
    if (kind === 'eye') { x = ex - w / 2; y = ey - h / 2; }
    else if (kind === 'back') { x = ex - w / 2; y = ey + g * 0.15 - h / 2; }
    else { x = ex + xo * g - w / 2; y = ht - h * (1 - yo); }
  }
  return `<img class="px-acc acc-${kind}" src="assets/acc/a${i}.webp" alt="" draggable="false" style="width:${pct(w)};left:${pct(x)};top:${pct(y)}">`;
}

// 캐릭터 그림. 예전처럼 avatarSVG 라는 이름으로 어디서나 씀. 표정(mood)은 CSS 모션·효과로 표현
export function avatarSVG(raw, mood = 'idle', cls = '') {
  const a = normAvatar(raw);
  const accs = [['b', a.b], ['h', a.h], ['f', a.f]].filter(([, v]) => v).map(([k, v]) => accTag(ACC_IMG[k][v], a.z)).join('');
  const car = a.b >= 1 && a.b <= 3 ? (a.b === 1 ? ' car' : ' car car-big') : '';
  return `<span class="av px ch-${mood}${car} ${cls}" aria-hidden="true"><img class="px-img" src="assets/zodiac/z${a.z}.webp" alt="" draggable="false" decoding="async">${accs}</span>`;
}

// 마스코트 (픽셀)
export function mascotSVG(mood = 'idle', cls = '') {
  return pixelTag(`m${mood}`, () => drawMascot(mood), `ch mascot px ch-${mood} ${cls}`);
}
// 벡터 원본이 필요할 때 (디자인 시스템 문서 등)
export { avatarVector, mascotVector };
