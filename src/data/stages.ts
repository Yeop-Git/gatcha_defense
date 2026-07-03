import type { Element } from '../core/types';

export type Theme = 'grassland' | 'forest' | 'cave' | 'volcano' | 'temple';

/** 한 웨이브의 스폰 구성 */
export interface SpawnGroup {
  enemy: string; // ENEMIES key
  count: number;
  interval: number; // 스폰 간격(초)
}

export interface StageDef {
  id: number;
  theme: Theme;
  label: string;
  /** 웨이브1에 등장하는 포획 가능 야생 몬스터 속성 (없으면 포획 웨이브 없음) */
  captureElements: Element[];
  /** 웨이브 목록 (웨이브1 = 포획 웨이브면 captureElements로 대체 스폰) */
  waves: SpawnGroup[][];
  /** 난이도 점프 스테이지(3/6/9) — 적 스탯 ×1.4 */
  difficultyJump: boolean;
  boss?: 'golem' | 'chimera';
}

/** 모든 스테이지 웨이브1에 등장하는 포획 대상 = 5속성 전부(각 캐릭터의 1단). §9 */
const CAPTURE_ALL: Element[] = ['fire', 'water', 'grass', 'light', 'dark'];

// 난이도 점프 배율을 반영하기 위한 스탯 스케일 헬퍼는 WaveSystem에서 적용.
export const STAGES: StageDef[] = [
  {
    id: 1, theme: 'grassland', label: '초원 · 튜토리얼', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'slime', count: 4, interval: 1.2 }],
      [{ enemy: 'slime', count: 6, interval: 1.0 }],
      [{ enemy: 'slime', count: 4, interval: 0.9 }, { enemy: 'imp', count: 3, interval: 1.1 }],
    ],
  },
  {
    id: 2, theme: 'grassland', label: '초원 · 사슴의 숲길', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'slime', count: 5, interval: 1.0 }],
      [{ enemy: 'imp', count: 5, interval: 0.9 }],
      [{ enemy: 'slime', count: 5, interval: 0.8 }, { enemy: 'shellguard', count: 2, interval: 1.6 }],
    ],
  },
  {
    id: 3, theme: 'forest', label: '숲 · 골렘 출현', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'slime', count: 6, interval: 0.9 }, { enemy: 'imp', count: 4, interval: 1.0 }],
      [{ enemy: 'shellguard', count: 3, interval: 1.4 }, { enemy: 'imp', count: 5, interval: 0.8 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'slime', count: 6, interval: 1.0 }],
    ],
  },
  {
    id: 4, theme: 'forest', label: '숲 · 별빛 정령', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'imp', count: 6, interval: 0.8 }],
      [{ enemy: 'shellguard', count: 4, interval: 1.2 }, { enemy: 'bat', count: 4, interval: 0.9 }],
      [{ enemy: 'spirit', count: 2, interval: 1.5 }, { enemy: 'imp', count: 6, interval: 0.8 }],
    ],
  },
  {
    id: 5, theme: 'cave', label: '동굴 · 달 유령', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'bat', count: 8, interval: 0.6 }],
      [{ enemy: 'shellguard', count: 4, interval: 1.1 }, { enemy: 'spirit', count: 2, interval: 1.6 }],
      [{ enemy: 'bat', count: 6, interval: 0.6 }, { enemy: 'imp', count: 6, interval: 0.8 }],
    ],
  },
  {
    id: 6, theme: 'cave', label: '동굴 심부 · 미니보스', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'bat', count: 8, interval: 0.5 }, { enemy: 'imp', count: 6, interval: 0.7 }],
      [{ enemy: 'shellguard', count: 5, interval: 1.0 }, { enemy: 'spirit', count: 3, interval: 1.4 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'bat', count: 8, interval: 0.6 }],
    ],
  },
  {
    id: 7, theme: 'volcano', label: '화산 · 용암 분출', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'imp', count: 10, interval: 0.5 }],
      [{ enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'shellguard', count: 4, interval: 1.1 }],
      [{ enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'bat', count: 6, interval: 0.6 }, { enemy: 'spirit', count: 2, interval: 1.6 }],
    ],
  },
  {
    id: 8, theme: 'volcano', label: '화산 · 엘리트 웨이브', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'shellguard', count: 6, interval: 0.9 }, { enemy: 'imp', count: 8, interval: 0.5 }],
      [{ enemy: 'spirit', count: 4, interval: 1.2 }, { enemy: 'bat', count: 8, interval: 0.5 }],
      [{ enemy: 'imp', count: 10, interval: 0.4 }, { enemy: 'shellguard', count: 5, interval: 1.0 }],
    ],
  },
  {
    id: 9, theme: 'temple', label: '신전 · 미니보스 2연전', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'spirit', count: 3, interval: 1.3 }],
      [{ enemy: 'shellguard', count: 6, interval: 0.8 }, { enemy: 'bat', count: 8, interval: 0.5 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'imp', count: 10, interval: 0.5 }],
    ],
  },
  {
    id: 10, theme: 'temple', label: '신전 심층 · 최종 보스', captureElements: CAPTURE_ALL, difficultyJump: false, boss: 'chimera',
    waves: [
      [{ enemy: 'spirit', count: 4, interval: 1.0 }, { enemy: 'bat', count: 8, interval: 0.5 }],
      [{ enemy: 'shellguard', count: 6, interval: 0.8 }, { enemy: 'imp', count: 10, interval: 0.4 }],
      [{ enemy: 'chimera', count: 1, interval: 1 }],
    ],
  },
];

/** 갈림길 버프 노드 3택1 풀 */
export interface BuffOption {
  id: string;
  label: string;
  apply: string; // GameState에서 해석
}

export const BUFF_NODES: BuffOption[] = [
  { id: 'atk', label: '전 유닛 공격 +10%', apply: 'atk10' },
  { id: 'basehp', label: '기지 HP +20', apply: 'basehp20' },
  { id: 'capbonus', label: '포획 성공률 +20%', apply: 'capbonus' },
  { id: 'mana', label: '마나 재생 +20%', apply: 'mana20' },
];

/** 이벤트 노드 (§10) */
export const EVENT_NODES = [
  { id: 'merchant', label: '수상한 상인', desc: '카드 1장을 무료로 얻는다.' },
  { id: 'hotspring', label: '몬스터 온천', desc: '모든 유닛 Lv +1.' },
  { id: 'egg', label: '운명의 알', desc: '50% 랜덤 카드 획득 / 50% 꽝.' },
  { id: 'altar', label: '저주받은 제단', desc: '기지 HP -15, 희귀 카드 1장.' },
] as const;
