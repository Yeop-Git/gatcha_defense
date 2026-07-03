import type { Element, ElementOrNeutral } from '../core/types';

export interface EnemyDef {
  id: string;
  name: string;
  element: ElementOrNeutral;
  hp: number;
  speed: number; // 월드/초
  attack: number; // 기지 도달 시가 아니라, 근처 유닛/주인공 반격용
  /** 비행: 지상 장판(풀/화염/감속) 무시 (박쥐) */
  flying?: boolean;
  /** 주변 적 회복 (정령) */
  healer?: boolean;
  leak: 'normal' | 'miniboss' | 'boss';
  radius: number;
  /** public/assets/models/enemies/ 안의 GLTF 파일명. 없으면 속성 색 폴백 도형. */
  model?: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { id: 'slime', name: '슬라임', element: 'grass', hp: 30, speed: 1.5, attack: 4, leak: 'normal', radius: 0.7, model: 'GreenBlob.gltf' },
  imp: { id: 'imp', name: '임프', element: 'fire', hp: 24, speed: 2.6, attack: 5, leak: 'normal', radius: 0.6, model: 'Demon.gltf' },
  shellguard: { id: 'shellguard', name: '조개병정', element: 'water', hp: 70, speed: 1.1, attack: 6, leak: 'normal', radius: 0.8, model: 'Squidle.gltf' },
  bat: { id: 'bat', name: '박쥐', element: 'dark', hp: 18, speed: 2.2, attack: 4, flying: true, leak: 'normal', radius: 0.6, model: 'Birb.gltf' },
  spirit: { id: 'spirit', name: '정령', element: 'light', hp: 40, speed: 1.4, attack: 3, healer: true, leak: 'normal', radius: 0.7, model: 'Ghost.gltf' },
  golem: { id: 'golem', name: '골렘', element: 'neutral', hp: 400, speed: 0.8, attack: 12, leak: 'miniboss', radius: 1.4, model: 'Goleling_Evolved.gltf' },
  chimera: { id: 'chimera', name: '일월식의 키메라', element: 'light', hp: 1600, speed: 0.7, attack: 20, leak: 'boss', radius: 2.2, model: 'Dragon_Evolved.gltf' },
};

/** 야생(포획 가능) 몬스터는 플레이어블 5종의 야생 버전 — 스테이지가 지정 */
export const WILD_HP: Record<Element, number> = {
  water: 55,
  grass: 50,
  fire: 45,
  dark: 60,
  light: 55,
};
