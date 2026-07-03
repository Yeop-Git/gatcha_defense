import type { Element, MarkType } from '../core/types';

/**
 * 협동기 = 표식 위에 다른 속성 반응 (§7.1). 단일 규칙:
 *   트리거(적이 가진 표식/장판) + 반응(다른 속성 공격 적중) → 효과 + (선택)트리거 소모.
 * SynergySystem 하나가 이 선언만으로 모든 조합을 판정한다. 조합별 if 금지.
 */
export interface SynergyDef {
  id: string;
  name: string;
  a: Element; // 트리거 속성 (표식 남긴 쪽)
  b: Element; // 반응 속성 (공격한 쪽)
  /** 트리거 조건: 대상에게 있어야 할 표식과 최소 중첩 */
  trigger: { mark: MarkType; minStacks?: number };
  /** 반응 조건: 이 속성 공격이 적중해야 발동 */
  reaction: Element;
  /** 효과 핸들러 키 (SynergySystem effectHandlers) */
  effect: string;
  /** 트리거 표식/장판을 소모하는가 (필수화 방지) */
  consumesTrigger: boolean;
  /** 양쪽 유닛 최소 진화 단계 (3단 전용 = 3) */
  minStage: number;
  /** 1단끼리 약화판(효과 50%) 허용 여부 */
  weakAtStage1: boolean;
  /** 반응 도감(§7.3) 설명 — 발견 후 표시 */
  desc: string;
}

export const SYNERGIES: SynergyDef[] = [
  // ── MVP 3종 ──
  {
    id: 'wildfire', name: '들불', a: 'grass', b: 'fire',
    trigger: { mark: 'overgrowth' }, reaction: 'fire',
    effect: 'wildfire', consumesTrigger: true, minStage: 1, weakAtStage1: true,
    desc: '풀 장판 위에 불 공격 — 장판이 화염으로 타올라 광역 화상 (장판 소모)',
  },
  {
    id: 'lush_growth', name: '무성한 성장', a: 'grass', b: 'water',
    trigger: { mark: 'overgrowth' }, reaction: 'water',
    effect: 'lushGrowth', consumesTrigger: false, minStage: 1, weakAtStage1: true,
    desc: '풀 장판 위에 물 공격 — 장판이 넓어지고 감속이 강해진다',
  },
  {
    id: 'eclipse', name: '일월식', a: 'dark', b: 'light',
    trigger: { mark: 'curse', minStacks: 4 }, reaction: 'light',
    // 양쪽 3단(Lv9) 요구는 20~30분 런에서 사실상 도달 불가 → 2단으로 완화(헤드라인 협동기 실사용).
    effect: 'eclipse', consumesTrigger: true, minStage: 2, weakAtStage1: false,
    desc: '저주 가득한 적에 심판의 빛 — 전장의 모든 표식이 폭발하고 아군은 보호받는다',
  },
  // ── P1 (확장) ──
  {
    id: 'steam_veil', name: '증기 장막', a: 'water', b: 'fire',
    trigger: { mark: 'wet' }, reaction: 'fire',
    effect: 'steamVeil', consumesTrigger: true, minStage: 2, weakAtStage1: false,
    desc: '젖은 적에 불 공격 — 증기 안개가 적을 크게 늦춘다',
  },
  {
    id: 'cursed_vine', name: '저주받은 덩굴', a: 'grass', b: 'dark',
    trigger: { mark: 'overgrowth' }, reaction: 'dark',
    effect: 'cursedVine', consumesTrigger: false, minStage: 2, weakAtStage1: false,
    desc: '덩굴에 얽힌 적에 어둠 공격 — 저주가 덩굴을 타고 번진다',
  },
  {
    id: 'black_flame', name: '검은 불꽃', a: 'dark', b: 'fire',
    trigger: { mark: 'curse', minStacks: 1 }, reaction: 'fire',
    effect: 'blackFlame', consumesTrigger: false, minStage: 2, weakAtStage1: false,
    desc: '저주받은 적에 불 공격 — 방어를 무시하는 검은 화염',
  },
];
