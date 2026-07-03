// 주인공 공용 스킬 풀 (§3). 레벨업 시 3택1. 효과는 GameState 스탯/플래그에 반영.

export interface HeroSkillDef {
  id: string;
  name: string;
  desc: string;
  /** 즉시 반영되는 패시브 스탯 변경 키 (GameState.applyHeroSkill 해석) */
  apply: string;
}

export const HERO_SKILLS: HeroSkillDef[] = [
  { id: 'whirl', name: '회전베기', desc: '기본 공격이 360° 광역으로', apply: 'whirl' },
  { id: 'reach', name: '원거리 조준', desc: '주인공 사거리 +1.5', apply: 'herorange' },
  { id: 'capture_master', name: '포획 장인', desc: '포획 성공률 +15%', apply: 'capture15' },
  { id: 'warcry', name: '전장의 함성', desc: '주변 아군 공속 +25%', apply: 'warcry' },
  { id: 'first_aid', name: '응급 처치', desc: '기지 HP 즉시 +25', apply: 'basehp25' },
  { id: 'throw_boost', name: '투척 강화', desc: '포획구 적중 시 피해+슬로우', apply: 'throwboost' },
  { id: 'card_mastery', name: '카드 숙련', desc: '스테이지 드로우 +1', apply: 'draw1' },
  { id: 'mana_spring', name: '마나 샘', desc: '마나 재생 +20%', apply: 'mana20' },
];
