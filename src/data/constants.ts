// 모든 매직 넘버는 여기로. 밸런싱은 이 파일과 각 data 파일만 수정. (§14 기준)
import type { Element, ElementOrNeutral, MarkType } from '../core/types';

/** 우드톤 팔레트 + 속성색 (ASSETS.md §3.2). Three.js/캔버스에서 쓸 16진수. */
export const COLORS = {
  woodDark: 0x3e2a1b,
  woodMid: 0x5c4028,
  woodLight: 0x8a6642,
  parchment: 0xefe3c2,
  gold: 0xd8a93b,
  goldBright: 0xf2ce6b,
  manaCrystal: 0x4fa8d8,
  hpRuby: 0xc0392b,
} as const;

/** 5속성 고정 목록 (드래프트/순회용) */
export const ELEMENTS: Element[] = ['fire', 'water', 'grass', 'light', 'dark'];

/** 속성 포인트 컬러 (폴백 캡슐/이펙트 틴트) */
export const ELEMENT_COLOR: Record<Element, number> = {
  fire: 0xe8632c,
  water: 0x3fa9bf,
  grass: 0x6fae4c,
  light: 0xf2ce6b,
  dark: 0x4a4e9e,
};

export const NEUTRAL_COLOR = 0xb8a888;

/** 속성 아이콘 (이모지 폴백 — Sora 아이콘 미완성 시) */
export const ELEMENT_ICON: Record<Element, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  light: '✨',
  dark: '🌑',
};

export const ELEMENT_NAME_KO: Record<Element, string> = {
  fire: '불',
  water: '물',
  grass: '풀',
  light: '빛',
  dark: '어둠',
};

export const MARK_ICON: Record<MarkType, string> = {
  burn: '🔥',
  wet: '💧',
  overgrowth: '🌿',
  curse: '🌑',
  bless: '✨',
};

/** 격자 전장 규격. 타일 = 정육면체. 경로는 직각(격자 정렬). */
export const TILE = 2;
export const GRID_COLS = 18;
export const GRID_ROWS = 12;

/** (col,row) 격자 셀 → 월드 XZ 중심 좌표 */
export function cellCenter(col: number, row: number): { x: number; z: number } {
  return { x: (col - (GRID_COLS - 1) / 2) * TILE, z: (row - (GRID_ROWS - 1) / 2) * TILE };
}

/** 경로 꼭짓점 (격자 셀, 직각으로만 꺾임). 마지막 = 기지. */
const PATH_CORNERS: [number, number][] = [
  [0, 3], [4, 3], [4, 8], [10, 8], [10, 3], [14, 3], [14, 8], [16, 8],
];

/** 꼭짓점 사이를 모든 격자 셀로 전개 (경로 타일 렌더/판정용) */
function expandCells(corners: [number, number][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [c1, r1] = corners[i + 1];
    let [c, r] = corners[i];
    const dc = Math.sign(c1 - c), dr = Math.sign(r1 - r);
    while (c !== c1 || r !== r1) { cells.push([c, r]); c += dc; r += dr; }
  }
  cells.push(corners[corners.length - 1]);
  return cells;
}

export const FIELD = {
  tile: TILE,
  cols: GRID_COLS,
  rows: GRID_ROWS,
  cellCenter,
  /** 적 진격 경로 (좌→우, 마지막이 기지) */
  path: PATH_CORNERS.map(([c, r]) => cellCenter(c, r)),
  /** 경로가 점유하는 격자 셀 집합 "col,row" */
  pathCellSet: new Set(expandCells(PATH_CORNERS).map(([c, r]) => `${c},${r}`)),
};

/** 유닛 고정 배치 슬롯 (경로 인접 잔디 셀). 주인공 포함 최대 4개 사용. §2 */
// 순서 = autoPlace 우선순위. 앞 3개가 진입/중앙/후반을 고르게 커버하도록 배치(경로 전반 방어).
export const UNIT_SLOTS: { x: number; z: number }[] = [
  { x: -11, z: -3 }, // 0 진입부
  { x: 1, z: -3 },   // 1 중앙
  { x: 9, z: -3 },   // 2 후반(기지 접근)
  { x: -7, z: 3 },   // 3 진입 보강
  { x: 1, z: 3 },    // 4 중앙 보강
  { x: -7, z: -3 },  // 5 예비
];

/** 임포트 GLB 텍스처 최대 해상도 (용량 절감). 초과 시 캔버스로 축소. */
export const MODEL_MAX_TEXTURE = 1024;

/** 카툰 렌더: GLB 머티리얼을 unlit(MeshBasic)로 변환 + 검은 외곽선(inverted hull). */
export const MODEL_UNLIT = true;
export const MODEL_OUTLINE = true;
/** 외곽선 두께 (뷰 공간 단위 ≈ 월드 단위, 모델 스케일과 무관하게 일정). */
export const MODEL_OUTLINE_THICKNESS = 0.022;

/** 포트레이트(PNG) 정규화 정사각형 한 변 px + 여백 비율 */
export const PORTRAIT_SIZE = 256;
export const PORTRAIT_PADDING = 0.08;
/** 흰 배경 누끼: 흰색과의 색거리(0~441)로 판정.
 *  LOW 이하 = 완전 투명(배경), HIGH 이상 = 캐릭터(보존), 사이 = 경계 페더. */
export const PORTRAIT_KEY_LOW = 26;
export const PORTRAIT_KEY_HIGH = 92;

/** 기지 / 주인공 기본치 (§14) */
export const BASE_HP = 160; // 후반 스웜/누수에 견디도록 상향(밸런스)
export const BASE_LEAK_NORMAL = 3;
export const BASE_LEAK_MINIBOSS = 20;
export const BASE_LEAK_BOSS = 100;

/** 적 반격: 근처 방어자(유닛/주인공)를 주기 타격 → 디펜스 성립(힐/보호막/부활 카드가 의미를 가짐). */
export const ENEMY = {
  attackSpeed: 0.8, // 초당 공격 횟수
  engageRange: 2.4, // 이 거리 내 방어자를 타격
} as const;

// 성(거점) 전투치 — 주인공 통합. 경로 끝의 성이 넓은 사거리로 후반 경로를 방어.
export const HERO = {
  hp: 120,
  attack: 12,
  attackSpeed: 1.3, // 초당 공격 횟수
  range: 7.5, // 성이 실질적 방어자가 되도록 넉넉히(경로 끝 커버)
} as const;

/** 최대 보유(포획) 몬스터 종류 수 → 주인공 포함 총 4캐릭터 */
export const MAX_MONSTERS = 3;

/** 유닛 1단 기본치 + 진화 배율 (§14) */
export const UNIT_BASE = {
  hp: 60,
  attack: 8,
  range: 3,
  attackSpeed: 1.0,
} as const;

export const EVOLVE_MULT = 1.6; // 진화당 스탯 배율
export const LATE_BLOOM_MULT = 0.8; // 빛/어둠 1단 보정
export const LATE_BLOOM_STAGE3_JUMP = 1.9; // 3단 도달 점프

/**
 * 유대(Bond) 성장 — 포켓몬식 "플레이어와 함께 크는" 추가 스탯 (§14).
 * 기본 레벨 성장과 별개로, 보유한 유닛이 스테이지를 함께 클리어할 때마다 소폭 누적.
 * 새로 모집하는 것보다 한 유닛을 뚝심있게 육성하는 쪽에 보너스를 주되, 상한으로 과함 방지.
 */
export const BOND_PER_STAGE = 0.025; // 스테이지 클리어당 유대 +2.5% (HP·공격)
export const BOND_CAP = 0.2; // 유대 보너스 상한 (+20%)

/** 마나 (§6) */
export const MANA_MAX = 10;
export const MANA_REGEN = 1.5; // 초당 (후반 고코스트 카드 대응)
export const HAND_SIZE = 5;

/** 부유(floating) 연출 파라미터 — 빛/어둠 정령류에만 적용. 나머지는 접지(애니메이션 추후). */
export const FLOAT = { height: 0.5, amp: 0.16, speed: 1.7 } as const;
/** 부유 속성인가 (빛/어둠 = 유령·정령류). */
export function isFloating(el: ElementOrNeutral): boolean {
  return el === 'light' || el === 'dark';
}

/** 표식 기본 파라미터 (§4.3) */
export const MARK: Record<MarkType, { duration: number; maxStacks: number }> = {
  burn: { duration: 4, maxStacks: 5 },
  wet: { duration: 5, maxStacks: 1 },
  overgrowth: { duration: 6, maxStacks: 1 },
  curse: { duration: 8, maxStacks: 5 },
  bless: { duration: 10, maxStacks: 3 },
};

export const BURN_DPS_PER_STACK = 3;
export const WET_SLOW = 0.2;
export const CURSE_DMG_PER_STACK = 0.05;
export const BLESS_BUFF_PER_STACK = 0.1;
export const OVERGROWTH_SLOW = 0.4;
export const OVERGROWTH_DPS = 4;

/** 협동기 내부 재발동 쿨다운 (§7.3) */
export const SYNERGY_COOLDOWN = 2;

/** 어둠 3단 처치 스택 (§5.4) */
export const DARK_KILL_STACK = 0.02;
export const DARK_KILL_STACK_MAX = 0.5;

/** 로직 고정 timestep */
export const FIXED_DT = 1 / 60;

/** 난이도 점프 스테이지에서 적 스탯 배율 (§10) */
export const DIFFICULTY_JUMP_MULT = 1.4;
