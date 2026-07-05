/**
 * 도구(held item) — 캐릭터 1마리가 하나씩 지닐 수 있는 장비. 상점에서 골드로 구매.
 * 유닛은 불사(방어 포탑)이므로 방어 스탯 대신 공격/유틸 위주로 구성.
 * 효과는 deriveStats에서 합산 적용. 밸런싱은 이 파일만 수정.
 */
export interface ItemEffect {
  atkMult?: number;    // 공격력 배수 가산 (0.15 = +15%)
  range?: number;      // 사거리 가산
  aspd?: number;       // 공격 속도 가산
  critChance?: number; // 치명타 확률 가산
  critDmg?: number;    // 치명타 피해 가산
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  effect: ItemEffect;
}

export const ITEMS: ItemDef[] = [
  { id: 'sword', name: '연마된 검', icon: '🗡️', desc: '공격력 +15%', cost: 55, effect: { atkMult: 0.15 } },
  { id: 'lens', name: '수정 렌즈', icon: '🔭', desc: '사거리 +0.8', cost: 45, effect: { range: 0.8 } },
  { id: 'boots', name: '신속의 부츠', icon: '👢', desc: '공격 속도 +0.15', cost: 50, effect: { aspd: 0.15 } },
  { id: 'claw', name: '맹수의 발톱', icon: '🐾', desc: '치명타 확률 +8%', cost: 55, effect: { critChance: 0.08 } },
  { id: 'charm', name: '광폭의 부적', icon: '🔥', desc: '치명타 피해 +35%', cost: 50, effect: { critDmg: 0.35 } },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
