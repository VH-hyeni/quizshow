// 문항 텍스트 형식 <-> JSON 변환
//
//   Q: 한국의 수도는?          ← 퀴즈 문항
//   - 부산
//   * 서울                     ← * 표시가 정답
//   - 대구
//   T: 15                      ← 제한시간(초). 생략 시 퀴즈 20초
//
//   P: 점심 메뉴 투표           ← 투표 문항 (정답 없음, 생략 시 시간 무제한)
//   - 한식
//   - 중식
//
// 빈 줄로 문항을 구분하고, # 으로 시작하는 줄은 메모(무시)입니다.

export const SAMPLE = `# 예시 문항입니다. 자유롭게 고쳐 쓰세요.

Q: 대한민국의 수도는?
- 부산
* 서울
- 대구
- 인천
T: 15

Q: 다음 중 가장 큰 행성은?
- 지구
- 화성
* 목성
- 금성

Q: 물의 화학식은?
* H2O
- CO2
T: 10

P: 오늘 행사, 어떠셨나요?
- 최고예요
- 좋아요
- 보통이에요
- 아쉬워요
`;

export function parseQuestions(text) {
  const blocks = String(text).replace(/\r/g, '').split(/\n[ \t]*\n/);
  const out = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!lines.length) continue;
    const n = out.length + 1;
    const q = { kind: null, text: '', options: [] };
    let answer = null;
    for (const line of lines) {
      let m;
      if ((m = line.match(/^([QP])\s*[:：]\s*(.*)$/i))) {
        if (q.kind) throw new Error(`${n}번 문항: Q:/P: 줄이 두 번 나왔어요. 문항 사이에 빈 줄을 넣어 주세요.`);
        q.kind = m[1].toUpperCase() === 'P' ? 'poll' : 'quiz';
        q.text = m[2].trim();
      } else if ((m = line.match(/^T\s*[:：]\s*(\d+)\s*(초|s)?$/i))) {
        q.time_limit = Number(m[1]);
      } else if ((m = line.match(/^([-*])\s*(.+)$/))) {
        if (m[1] === '*') {
          if (answer != null) throw new Error(`${n}번 문항: 정답(*)이 두 개 이상이에요.`);
          answer = q.options.length;
        }
        q.options.push(m[2].trim());
      } else if (q.kind && !q.options.length) {
        q.text += '\n' + line;                       // 여러 줄 문제
      } else {
        throw new Error(`${n}번 문항: 이해할 수 없는 줄 → "${line}"`);
      }
    }
    if (!q.kind) throw new Error(`${n}번 문항: Q: 또는 P: 로 시작하는 문제 줄이 없어요.`);
    if (!q.text) throw new Error(`${n}번 문항: 문제 내용이 비어 있어요.`);
    if (q.options.length < 2 || q.options.length > 6) throw new Error(`${n}번 문항: 보기는 2~6개여야 해요. (지금 ${q.options.length}개)`);
    if (q.options.some(o => o.length > 80)) throw new Error(`${n}번 문항: 보기는 80자 이내로 써 주세요.`);
    if (q.time_limit != null && q.time_limit > 600) throw new Error(`${n}번 문항: 제한시간은 600초 이하로 해 주세요.`);
    if (q.kind === 'quiz') {
      if (answer == null) throw new Error(`${n}번 문항: 정답 보기 앞에 * 를 붙여 주세요. (투표라면 Q: 대신 P:)`);
      q.answer = answer;
    }
    if (q.time_limit == null) delete q.time_limit;
    out.push(q);
  }
  if (!out.length) throw new Error('문항이 하나도 없어요.');
  return out;
}

export function toText(questions) {
  return questions.map(q => {
    const quiz = q.kind !== 'poll';
    const lines = [`${quiz ? 'Q' : 'P'}: ${q.text}`];
    q.options.forEach((o, i) => lines.push(`${quiz && i === q.answer ? '*' : '-'} ${o}`));
    if (q.time_limit != null) lines.push(`T: ${q.time_limit}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}
