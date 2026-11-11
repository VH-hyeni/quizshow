// 문항 텍스트 형식 <-> JSON 변환
//
//   Q: 한국의 수도는?          ← 정답 퀴즈 (객관식)
//   - 부산
//   * 서울                     ← * 표시가 정답
//   - 대구
//   T: 15                      ← 제한시간(초). 생략 시 20초
//
//   OX: 지구는 둥글다           ← OX 퀴즈
//   정답: O
//
//   P: 점심 메뉴 투표           ← 투표 (선호도 조사, 정답 없음, 생략 시 시간 무제한)
//   - 한식
//   - 중식
//
//   공개: 실시간                ← (선택) 누가 뭘 골랐는지 보여 주는 방식
//                                 실시간 = 고르는 즉시 · 정답때 = 정답 공개 때 · 비공개 = 끝까지 안 보임(인원수만)
//                                 생략하면 퀴즈는 정답때, 투표는 실시간
//
//   G: 숫자순서                 ← 미니게임: 숫자순서 / 반응속도 / 광클
//   크기: 4                     ← 숫자순서 판 크기 (4 = 4×4 = 1~16)
//   T: 10                       ← 광클: 누르는 시간(초) / 숫자순서: 제한시간(초)
//
// 빈 줄로 문항을 구분하고, # 으로 시작하는 줄은 메모(무시)입니다.

export const GAMES = {
  order:    { name: '숫자 순서 터치', words: ['숫자순서', '숫자', '순서', 'order'], hint: '1부터 순서대로 빨리 누르세요' },
  reaction: { name: '반응속도 테스트', words: ['반응속도', '반응', 'reaction'], hint: '초록색으로 바뀌는 순간 터치!' },
  tap:      { name: '광클 대결', words: ['광클', '연타', 'tap'], hint: '시간 안에 최대한 많이 누르세요' },
};

export const KIND_LABEL = { quiz: '정답 퀴즈', ox: 'OX 퀴즈', poll: '투표', game: '미니게임' };
export const SHOW_LABEL = { live: '실시간 공개', reveal: '정답 때 공개', hidden: '비공개' };
export const showOf = q => q.show || (q.kind === 'poll' ? 'live' : 'reveal');
const SHOW_WORDS = { live: ['실시간', '바로', '즉시', 'live'], reveal: ['정답때', '정답', '나중', '공개때', 'reveal'], hidden: ['비공개', '익명', '숨김', 'hidden'] };
export const kindOf = q => (q.kind === 'game' ? 'game' : q.kind === 'poll' ? 'poll' : q.ox ? 'ox' : 'quiz');

// 진행자 화면의 "추가" 버튼이 편집기에 넣어 주는 틀
export const TEMPLATES = {
  quiz: `Q: 문제를 입력하세요\n- 보기 1\n* 정답 보기\n- 보기 3\n- 보기 4\nT: 20\n공개: 정답때`,
  ox:   `OX: 참인지 거짓인지 맞혀 보세요\n정답: O`,
  poll: `P: 어떤 걸 더 좋아하세요?\n- 선택지 1\n- 선택지 2\n- 선택지 3\n공개: 실시간`,
  order: `G: 숫자순서\n크기: 4`,
  reaction: `G: 반응속도`,
  tap: `G: 광클\nT: 10`,
};

export const SAMPLE = `# 예시 문항입니다. 자유롭게 고쳐 쓰세요.

Q: 대한민국의 수도는?
- 부산
* 서울
- 대구
- 인천
T: 15

OX: 바나나는 나무에서 자란다
정답: X

G: 숫자순서
크기: 4

Q: 물의 화학식은?
* H2O
- CO2
T: 10

G: 반응속도

P: 오늘 행사, 어떠셨나요?
- 최고예요
- 좋아요
- 보통이에요
- 아쉬워요
공개: 비공개

G: 광클
T: 10
`;

function gameKey(word) {
  const w = String(word || '').replace(/\s/g, '').toLowerCase();
  return Object.keys(GAMES).find(k => GAMES[k].words.some(x => w.startsWith(x.toLowerCase())));
}

export function parseQuestions(text) {
  const blocks = String(text).replace(/\r/g, '').split(/\n[ \t]*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!lines.length) continue;
    const n = out.length + 1;
    const q = { kind: null, text: '', options: [] };
    let answer = null, ox = false, size = null, t = null, show = null;
    for (const line of lines) {
      let m;
      if ((m = line.match(/^(OX|Q|P|G)\s*[:：]\s*(.*)$/i))) {
        if (q.kind) throw new Error(`${n}번 문항: 문제 줄(Q:/OX:/P:/G:)이 두 번 나왔어요. 문항 사이에 빈 줄을 넣어 주세요.`);
        const tag = m[1].toUpperCase();
        if (tag === 'G') {
          const [first, ...rest] = m[2].trim().split(/\s+/);
          const g = gameKey(first);
          if (!g) throw new Error(`${n}번 문항: 미니게임은 숫자순서 / 반응속도 / 광클 중에서 골라 주세요.`);
          q.kind = 'game'; q.game = g; q.text = rest.join(' ') || GAMES[g].name;
        } else {
          q.kind = tag === 'P' ? 'poll' : 'quiz';
          ox = tag === 'OX';
          q.text = m[2].trim();
        }
      } else if ((m = line.match(/^T\s*[:：]\s*(\d+)\s*(초|s)?$/i))) {
        t = Number(m[1]);
      } else if ((m = line.match(/^공개\s*[:：]\s*(.+)$/))) {
        const w = m[1].replace(/\s/g, '').toLowerCase();
        show = Object.keys(SHOW_WORDS).find(k => SHOW_WORDS[k].some(x => w.startsWith(x)));
        if (!show) throw new Error(`${n}번 문항: 공개 방식은 실시간 / 정답때 / 비공개 중에서 골라 주세요.`);
      } else if ((m = line.match(/^크기\s*[:：]\s*(\d+)/))) {
        size = Number(m[1]);
      } else if ((m = line.match(/^정답\s*[:：]\s*([OoXx0○×])/))) {
        answer = /[Oo0○]/.test(m[1]) ? 0 : 1;
      } else if ((m = line.match(/^([-*])\s*(.+)$/))) {
        if (m[1] === '*') {
          if (answer != null) throw new Error(`${n}번 문항: 정답(*)이 두 개 이상이에요.`);
          answer = q.options.length;
        }
        q.options.push(m[2].trim());
      } else if (q.kind && q.kind !== 'game' && !q.options.length) {
        q.text += '\n' + line;
      } else {
        throw new Error(`${n}번 문항: 이해할 수 없는 줄 → "${line}"`);
      }
    }
    if (!q.kind) throw new Error(`${n}번 문항: Q: / OX: / P: / G: 로 시작하는 문제 줄이 없어요.`);

    if (q.kind === 'game') {
      const g = { kind: 'game', game: q.game, text: q.text };
      if (q.game === 'order') {
        if (size != null) { if (size < 3 || size > 6) throw new Error(`${n}번 문항: 숫자순서 크기는 3~6이에요.`); g.size = size; }
        if (t != null) { if (t < 10 || t > 180) throw new Error(`${n}번 문항: 숫자순서 제한시간은 10~180초예요.`); g.time_limit = t; }
      }
      if (q.game === 'tap' && t != null) {
        if (t < 3 || t > 60) throw new Error(`${n}번 문항: 광클 시간은 3~60초예요.`);
        g.duration = t;
      }
      out.push(g);
      continue;
    }

    if (!q.text) throw new Error(`${n}번 문항: 문제 내용이 비어 있어요.`);
    if (ox) {
      if (q.options.length) {
        const o = q.options.map(x => x.toUpperCase());
        if (o.length !== 2 || o[0] !== 'O' || o[1] !== 'X') throw new Error(`${n}번 문항: OX 퀴즈는 보기 없이 "정답: O" 또는 "정답: X" 한 줄만 쓰면 돼요.`);
      }
      q.options = ['O', 'X'];
      q.ox = true;
    }
    if (q.options.length < 2 || q.options.length > 6) throw new Error(`${n}번 문항: 보기는 2~6개여야 해요. (지금 ${q.options.length}개)`);
    if (q.options.some(o => o.length > 80)) throw new Error(`${n}번 문항: 보기는 80자 이내로 써 주세요.`);
    if (t != null) {
      if (t > 600) throw new Error(`${n}번 문항: 제한시간은 600초 이하로 해 주세요.`);
      q.time_limit = t;
    }
    if (show) q.show = show;
    if (q.kind === 'quiz') {
      if (answer == null) throw new Error(ox ? `${n}번 문항: "정답: O" 또는 "정답: X" 줄을 넣어 주세요.` : `${n}번 문항: 정답 보기 앞에 * 를 붙여 주세요. (투표라면 Q: 대신 P:)`);
      q.answer = answer;
    }
    delete q.game;
    if (!q.ox) delete q.ox;
    out.push(q);
  }
  if (!out.length) throw new Error('문항이 하나도 없어요.');
  return out;
}

export function toText(questions) {
  return questions.map(q => {
    if (q.kind === 'game') {
      const g = GAMES[q.game] || GAMES.order;
      const lines = [`G: ${g.words[0]}${q.text && q.text !== g.name ? ' ' + q.text : ''}`];
      if (q.game === 'order' && q.size) lines.push(`크기: ${q.size}`);
      if (q.game === 'order' && q.time_limit) lines.push(`T: ${q.time_limit}`);
      if (q.game === 'tap' && q.duration) lines.push(`T: ${q.duration}`);
      return lines.join('\n');
    }
    if (q.ox) {
      const lines = [`OX: ${q.text}`, `정답: ${q.answer === 1 ? 'X' : 'O'}`];
      if (q.time_limit != null) lines.push(`T: ${q.time_limit}`);
      if (q.show) lines.push(`공개: ${{ live: '실시간', reveal: '정답때', hidden: '비공개' }[q.show]}`);
      return lines.join('\n');
    }
    const quiz = q.kind !== 'poll';
    const lines = [`${quiz ? 'Q' : 'P'}: ${q.text}`];
    q.options.forEach((o, i) => lines.push(`${quiz && i === q.answer ? '*' : '-'} ${o}`));
    if (q.time_limit != null) lines.push(`T: ${q.time_limit}`);
    if (q.show) lines.push(`공개: ${{ live: '실시간', reveal: '정답때', hidden: '비공개' }[q.show]}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

// 미니게임 기록을 사람이 읽는 말로
export function fmtPlay(game, v) {
  if (v == null) return '-';
  if (game === 'tap') return `${Math.round(v)}회`;
  if (game === 'reaction') return v >= 3000 ? '부정 출발' : `${Math.round(v)}ms`;
  return `${(v / 1000).toFixed(2)}초`;
}
