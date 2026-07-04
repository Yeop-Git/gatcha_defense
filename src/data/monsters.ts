import type { Element } from '../core/types';

/** 진화 단계별 이름/역할 (가칭 — DESIGN.md §5) */
export interface MonsterStageDef {
  name: string;
  role: string;
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
  },
};
