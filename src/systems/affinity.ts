import type { Element, ElementOrNeutral } from '../core/types';

/**
 * 상성표 (§4.1). 공격자 기준 배율.
 * 불→풀→물→불 순환, 빛↔어둠 상호 1.5배. 무속성은 항상 1.0.
 */
const TABLE: Record<Element, Record<Element, number>> = {
  fire: { fire: 1.0, water: 0.5, grass: 1.5, light: 1.0, dark: 1.0 },
  water: { fire: 1.5, water: 1.0, grass: 0.5, light: 1.0, dark: 1.0 },
  grass: { fire: 0.5, water: 1.5, grass: 1.0, light: 1.0, dark: 1.0 },
  light: { fire: 1.0, water: 1.0, grass: 1.0, light: 1.0, dark: 1.5 },
  dark: { fire: 1.0, water: 1.0, grass: 1.0, light: 1.5, dark: 1.0 },
};

export function affinity(attacker: ElementOrNeutral, defender: ElementOrNeutral): number {
  if (attacker === 'neutral' || defender === 'neutral') return 1.0;
  return TABLE[attacker][defender];
}
