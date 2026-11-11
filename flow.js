// 진행 순서: "다음" 버튼이 지금 상태에서 무엇을 할지 (진행자 화면 · 스크린 화면 공용)
import { rpc } from './common.js';

export const PHASE_NAME = {
  lobby: '대기 중', question: '진행 중', closed: '마감됨', reveal: '결과 공개', leaderboard: '순위 발표', end: '종료',
};

export function hostActions(getPin, wrap = fn => fn()) {
  return {
    show: i => wrap(() => rpc('host_show_question', { p_pin: getPin(), p_index: i })),
    close: () => wrap(() => rpc('host_close', { p_pin: getPin() })),
    reveal: () => wrap(() => rpc('host_reveal', { p_pin: getPin() })),
    phase: p => wrap(() => rpc('host_set_phase', { p_pin: getPin(), p_phase: p })),
  };
}

// 반환: { label, run? }  run 이 없으면 지금은 누를 수 없는 상태
export function nextAction(g, A) {
  if (!g) return { label: '연결 중…' };
  const total = g.q_total, i = g.q_index, hasNext = i + 1 < total;
  const kind = g.question?.kind;
  const goNext = hasNext
    ? { label: `${i + 2}번 문제 시작`, run: () => A.show(i + 1) }
    : { label: '최종 결과 발표', run: () => A.phase('end') };
  switch (g.phase) {
    case 'lobby':
      if (!total) return { label: '먼저 문항을 저장해 주세요' };
      return goNext;
    case 'question':
      return { label: kind === 'game' ? '게임 종료' : '응답 마감', run: A.close };
    case 'closed':
      return { label: kind === 'poll' ? '투표 결과 공개' : kind === 'game' ? '게임 결과 공개' : '정답 공개', run: A.reveal };
    case 'reveal':
      if (kind === 'quiz' || kind === 'game') return { label: '순위 보기', run: () => A.phase('leaderboard') };
      return goNext;
    case 'leaderboard': return goNext;
    case 'end': return { label: '종료되었습니다' };
  }
  return { label: '-' };
}
