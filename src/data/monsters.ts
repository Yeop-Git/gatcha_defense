import type { Element } from '../core/types';

/** 진화 단계별 이름/역할 (가칭 — DESIGN.md §5) */
export interface MonsterStageDef {
  name: string;
  role: string;
}

/** 분기 진화 형태 (§5.6). 팔레트 스왑(색 오버라이드)으로 구현 — 새 3D 에셋 0개. */
export interface BranchDef {
  key: 'A' | 'B';
  name: string;
  /** 팔레트 스왑 틴트색 (material.color 곱) — 색이 곧 빌드 */
  tint: number;
  role: string;
  /** 분기 선택 시 해금되는 시그니처 카드 id (cards.ts) */
  signatureCardId: string;
}

export interface MonsterDef {
  element: Element;
  /** 3단계 이름/역할 */
  stages: [MonsterStageDef, MonsterStageDef, MonsterStageDef];
  /** 진화가 일어나는 레벨 [1→2, 2→3] */
  evolveLevels: [number, number];
  /** 빛/어둠 대기만성 보정 여부 (초반 ×0.8, 3단 점프) */
  lateBloom: boolean;
  /** 특수 능력 태그 (역할 연출/보너스 판정용) */
  traits: string[];
  /** 3단 도달 시 2택1 분기 (§5.6) */
  branches: [BranchDef, BranchDef];
}

export const MONSTERS: Record<Element, MonsterDef> = {
  water: {
    element: 'water',
    evolveLevels: [3, 6],
    lateBloom: false,
    traits: ['knockback', 'slow', 'shield'],
    stages: [
      { name: '방울북', role: '물방울탄·약감속·미세 넉백' },
      { name: '산호북', role: '파동 범위감속·확률 넉백·인접 아군 약보호막' },
      { name: '해수호', role: '강넉백 파도·광역 감속 장판·아군 보호막' },
    ],
    branches: [
      { key: 'A', name: '철갑형', tint: 0x4a6b8a, role: '짙은 강청 갑주 — 강보호막으로 전선을 고정하는 탱커', signatureCardId: 'water_iron' },
      { key: 'B', name: '해일형', tint: 0x7fe0ea, role: '밝은 아쿠아 — 강넉백·광역 감속 장판으로 흐름 제압', signatureCardId: 'water_whirl' },
    ],
  },
  grass: {
    element: 'grass',
    evolveLevels: [3, 6],
    lateBloom: false,
    traits: ['zone', 'root', 'heal'],
    stages: [
      { name: '새싹록', role: '씨앗탄·작은 풀 장판·약도트' },
      { name: '숲사슴', role: '덩굴 속박·씨앗 폭발·약회복' },
      { name: '수호록', role: '광역 속박·지속 회복·씨앗 장판 강화' },
    ],
    branches: [
      { key: 'A', name: '덩굴형', tint: 0x2e6b30, role: '짙은 딥그린 — 광역 속박·장판 점유 (들불·무성한 성장 특화)', signatureCardId: 'grass_spore' },
      { key: 'B', name: '개화형', tint: 0xf2a5c0, role: '연분홍 꽃빛 — 지속 회복·정화로 팀을 지탱하는 서포트', signatureCardId: 'grass_bloom' },
    ],
  },
  fire: {
    element: 'fire',
    evolveLevels: [3, 6],
    lateBloom: false,
    traits: ['burn', 'rapid', 'burst'],
    stages: [
      { name: '불꼬미', role: '불씨탄·약화상·빠른 공속' },
      { name: '화염호', role: '화염구 연사·화상 중첩·소범위 폭발' },
      { name: '구미염', role: '강화상 중첩·다중 타겟·폭발·화염 장판' },
    ],
    branches: [
      { key: 'A', name: '연사형', tint: 0xffb54a, role: '밝은 금노랑 — 초고공속 연사로 화상 스택 폭주', signatureCardId: 'fire_overheat' },
      { key: 'B', name: '폭발형', tint: 0xa8322e, role: '짙은 크림슨 — 대형 폭발·화염 장판 (들불 특화)', signatureCardId: 'fire_nova' },
    ],
  },
  dark: {
    element: 'dark',
    evolveLevels: [5, 9],
    lateBloom: true,
    traits: ['curse', 'drain', 'killstack'],
    stages: [
      { name: '루나비', role: '그림자탄·약저주 표식' },
      { name: '월희', role: '저주 중첩·방깎·둔화·표식 추가피해' },
      { name: '이클립사', role: '저주 폭발·흡수·처치 시 자기강화·광역 디버프' },
    ],
    branches: [
      { key: 'A', name: '저주형', tint: 0x8a4fd0, role: '짙은 보라 — 저주 중첩·방깎 극대 (일월식 빌드업)', signatureCardId: 'dark_verdict' },
      { key: 'B', name: '흡수형', tint: 0x6e2440, role: '검붉은 남색 — 흡혈·처치 스택 폭주, 하이리스크 캐리', signatureCardId: 'dark_thirst' },
    ],
  },
  light: {
    element: 'light',
    evolveLevels: [5, 9],
    lateBloom: true,
    traits: ['shield', 'heal', 'bless'],
    stages: [
      { name: '별비', role: '약빛탄·소회복·약보호막' },
      { name: '루멘', role: '아군 보호막·정화·약광역 회복·축복 표식' },
      { name: '세라핌', role: '강보호막·광역 회복+정화·아군 강화·광역 심판' },
    ],
    branches: [
      { key: 'A', name: '수호형', tint: 0xf5efd9, role: '백금 아이보리 — 강보호막·정화로 팀 생존 완성', signatureCardId: 'light_ward' },
      { key: 'B', name: '심판형', tint: 0xffd23e, role: '강렬한 금색 — 신성 폭딜, 어둠 특효 딜러', signatureCardId: 'light_sunfire' },
    ],
  },
};

/** element 순회용 고정 순서 */
export const ELEMENTS: Element[] = ['water', 'grass', 'fire', 'dark', 'light'];
