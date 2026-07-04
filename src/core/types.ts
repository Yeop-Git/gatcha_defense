// 프로젝트 전역 공유 타입. CLAUDE.md 코딩 컨벤션의 고정 유니온 타입을 여기서 관리.

/** 5속성 고정 유니온 */
export type Element = 'fire' | 'water' | 'grass' | 'light' | 'dark';

/** 무속성(주인공/골렘)을 포함한 확장 속성 */
export type ElementOrNeutral = Element | 'neutral';

/** 표식 타입 고정 유니온 (§4.3) */
export type MarkType = 'burn' | 'wet' | 'overgrowth' | 'curse' | 'bless';

/** 카드/장판이 지점을 겨냥할 때의 좌표 (게임 평면 XZ) */
export interface Vec2 {
  x: number;
  z: number;
}

/** 스테이지 노드 종류 (갈림길) */
export type NodeKind = 'battle' | 'buff' | 'event';

/** 카드 타깃 방식 */
export type CardTarget =
  | 'point' // 지점 클릭 (장판/광역)
  | 'ally-all' // 아군 전체
  | 'ally-one' // 아군 1체 (자동: 가장 앞)
  | 'self' // 즉발/드로우 등
  | 'enemy-area'; // 지점 주변 적

/** 이벤트 버스 페이로드 맵 — 시스템 간 느슨한 결합 */
export interface GameEvents {
  'wave:start': { stage: number; wave: number; total: number };
  'wave:clear': { stage: number; wave: number };
  'stage:clear': { stage: number };
  'stage:start': { stage: number };
  'base:damage': { amount: number; hp: number };
  'base:destroyed': {};
  'enemy:killed': { element: ElementOrNeutral; x: number; z: number; isBoss: boolean };
  'card:played': { id: string };
  'mana:change': { mana: number; max: number };
  'toast': { text: string; kind?: 'good' | 'bad' | 'info' };
  'run:win': {};
  'run:lose': {};
  /** 포획했으나 로스터가 가득 → 상위(Game)가 '오래된 2 + 신규' 버리기 모달을 띄운다. */
  'capture:full': { species: string; name: string };
  'unit:grown': { uid: string; from: string; to: string; element: Element; evolved: boolean; gains: { uid: string; cardId: string }[] };
}
