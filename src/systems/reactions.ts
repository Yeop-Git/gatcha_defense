import type { MarkType } from '../core/types';

/**
 * 표식 반응(시너지) — 단일 판정 테이블.
 *
 * CLAUDE.md 원칙 5: 협동기는 도입 시 systems/에 "단일 판정 시스템"으로 넣고 조합별 하드코딩 금지.
 * → 반응은 여기 REACTIONS 데이터 테이블 하나로만 정의하고, Battle은 이 테이블을 읽어
 *   Battle.applyMark()의 단일 경로에서만 판정한다(마크가 적용되는 모든 곳이 한 함수를 거친다).
 *
 * 규칙: 서로 다른 속성 표식이 같은 적에게 겹치는 순간(두 번째 표식이 붙을 때) 반응이 1회 터진다.
 *  - 반응은 관여한 두 표식을 소모(consume)한다 → 무한 재폭발 방지 + "쌓고 터뜨리는" 리듬.
 *  - 효과는 선언형 필드(declarative)로만 기술한다. 실행은 Battle.triggerReaction()이 공용 헬퍼로 처리.
 *
 * 큐레이션(6쌍 중 4쌍만) — 다섯 속성이 모두 반응에 참여하되, 조합마다 뚜렷이 다른 결과:
 *   🔥+💧 증기폭발 : 두 표식 소모 → 광역 폭발 피해              (불↔물)
 *   🔥+🍃 들불     : 두 표식 소모 → 주변에 화상 전파 + 즉발 피해   (불↔풀)
 *   🌑+🍃 얽힘의 저주: 두 표식 소모 → 대상 강력 속박 + 저주 폭발   (어둠↔풀)
 *   🌑+💧 침식     : 두 표식 소모 → 광역 강감속 + 주변 저주 확산   (어둠↔물)
 *   (🔥+🌑, 💧+🍃 는 반응 없음 — 의도적 큐레이션)
 */
export interface Reaction {
  /** 관여 표식 한 쌍 (순서 무관 — Battle이 양방향 조회) */
  a: MarkType;
  b: MarkType;
  name: string;
  icon: string;
  /** 이펙트 색(가산 스프라이트 링/버스트) */
  color: number;
  /** 효과 반경(월드 단위) */
  radius: number;
  /** 대상+반경 광역 즉발 피해(스테이지 스케일이 Battle에서 곱해짐). 없으면 0. */
  damage?: number;
  /** 반경 내 적에게 이 표식을 전파(스택). */
  spread?: { mark: MarkType; stacks: number };
  /** 대상+반경 적을 이 시간(초)만큼 속박(root). */
  root?: number;
  /** 반경 내 적에게 지속 감속 부여. */
  slow?: { pct: number; duration: number };
}

export const REACTIONS: Reaction[] = [
  {
    a: 'burn', b: 'wet', name: '증기 폭발', icon: '💨', color: 0x9fe0ff,
    radius: 3.0, damage: 34,
  },
  {
    a: 'burn', b: 'overgrowth', name: '들불', icon: '🔥', color: 0xff7a2c,
    radius: 3.2, damage: 20, spread: { mark: 'burn', stacks: 2 },
  },
  {
    a: 'curse', b: 'overgrowth', name: '얽힘의 저주', icon: '☠️', color: 0x7d4bd8,
    radius: 2.8, damage: 26, root: 1.8,
  },
  {
    a: 'curse', b: 'wet', name: '침식', icon: '🌀', color: 0x4a6bd8,
    radius: 3.4, slow: { pct: 0.5, duration: 4 }, spread: { mark: 'curse', stacks: 1 },
  },
];

/** 빠른 조회: 정렬된 "a|b" 키 → Reaction. (순서 무관) */
const KEY = (x: MarkType, y: MarkType) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const BY_PAIR = new Map<string, Reaction>();
for (const r of REACTIONS) BY_PAIR.set(KEY(r.a, r.b), r);

/**
 * 새로 붙는 표식 `incoming`이, 적이 이미 지닌 표식 `existing` 중 하나와 반응을 이루는지 찾는다.
 * `has(mark)`는 해당 적이 그 표식을 지녔는지 판정하는 콜백.
 * 반응이 있으면 Reaction을, 없으면 undefined.
 */
export function findReaction(incoming: MarkType, has: (m: MarkType) => boolean): Reaction | undefined {
  for (const r of REACTIONS) {
    const other = r.a === incoming ? r.b : r.b === incoming ? r.a : null;
    if (other && has(other)) return r;
  }
  return undefined;
}
