import type { Element } from '../core/types';
import type { EnemyDef } from './enemies';
import { MONSTERS } from './monsters';

/**
 * 가지 않은 길 (§9) — 드래프트에서 버린 2종이 타락체(Corrupted) 보스로 회귀.
 * 구현: 원본 캐릭터 3단 GLB clone + 어둠 물든 팔레트 스왑(§5.6 재사용). 새 3D 에셋 0개.
 *   - 스테이지 9 중간보스 = 타락체 A (버린 종 1, 스킬 강화판)
 *   - 스테이지 10 최종보스 = 타락체 B (버린 종 2, 2페이즈: P1 타락 → P2 완전 월식 폭주)
 * 최종보스 우선순위: 빛/어둠이 버려졌으면 그쪽(대기만성 = 후반 위협 테마).
 */

/** 타락체 팔레트 스왑 틴트 (원본 색 × 이 색 = 어둠에 물든 모습) */
export const CORRUPT_TINT = 0x8a5fae;
/** P2 완전 월식 폭주 틴트 (더 깊은 어둠) */
export const CORRUPT_TINT_P2 = 0x5a2f7e;

/** 웨이브 데이터에서 쓰는 동적 보스 자리표시 id. Battle.spawn이 버린 속성으로 치환. */
export const CORRUPT_MID_ID = 'corrupt_mid';
export const CORRUPT_FINAL_ID = 'corrupt_final';

/** 타락체 시그니처 스킬 (원본 캐릭터 스킬의 적 AI 재활용, §9) */
export interface CorruptSkill {
  name: string;
  kind: 'firezone' | 'tidalwave' | 'thornheal' | 'darkdrain' | 'judgment';
  /** 발동 주기(초). P2에서는 절반. */
  interval: number;
  power: number;
  desc: string;
}

export const CORRUPT_SKILL: Record<Element, CorruptSkill> = {
  fire: { name: '타락한 폭염', kind: 'firezone', interval: 7, power: 10, desc: '유닛 발밑에 화염 장판을 만든다' },
  water: { name: '검은 해일', kind: 'tidalwave', interval: 7, power: 14, desc: '주변 유닛 전체에 파도 충격' },
  grass: { name: '타락한 재생', kind: 'thornheal', interval: 6, power: 0.04, desc: '최대 HP의 일부를 회복한다' },
  dark: { name: '심연의 흡수', kind: 'darkdrain', interval: 6, power: 16, desc: '가장 강한 유닛에게서 생명력을 흡수' },
  light: { name: '거짓된 심판', kind: 'judgment', interval: 7, power: 12, desc: '모든 유닛에 신성 피해' },
};

/** 타락체 이름: "타락한 + 3단 이름" (팔레트 스왑이 곧 정체성) */
export function corruptName(el: Element): string {
  return `타락한 ${MONSTERS[el].stages[2].name}`;
}

/**
 * 타락체 EnemyDef 동적 생성 (§14: 원본 3단 스탯 기반 × 보스 배율).
 * hp는 스테이지 hpScale이 별도로 곱해지므로 기존 미니보스/키메라 기준선에 맞춤.
 */
export function corruptedDef(el: Element, role: 'mid' | 'final'): EnemyDef {
  const mid = role === 'mid';
  return {
    id: mid ? CORRUPT_MID_ID : CORRUPT_FINAL_ID,
    name: corruptName(el),
    element: el,
    hp: mid ? 460 : 1550,
    speed: mid ? 0.75 : 0.7,
    attack: mid ? 14 : 20,
    leak: mid ? 'miniboss' : 'boss',
    radius: mid ? 1.5 : 2.0,
    tier: mid ? 'miniboss' : 'boss',
    desc: `버려진 수호 몬스터가 월식에 물들어 돌아왔다 — ${CORRUPT_SKILL[el].desc}.`,
  };
}
