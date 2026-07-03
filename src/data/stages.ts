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
      [{ enemy: 'slime', count: 5, interval: 1.0 }, { enemy: 'pinkling', count: 3, interval: 1.1 }],
      [{ enemy: 'slime', count: 4, interval: 0.9 }, { enemy: 'bunbun', count: 4, interval: 1.0 }, { enemy: 'spikeblob', count: 2, interval: 1.4 }],
    ],
  },
  {
    id: 2, theme: 'grassland', label: '초원 · 짐승들의 길목', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'cluck', count: 5, interval: 1.0 }, { enemy: 'dog', count: 4, interval: 0.9 }],
      [{ enemy: 'mushling', count: 6, interval: 0.9 }, { enemy: 'alpaca', count: 3, interval: 1.3 }],
      [{ enemy: 'hopper', count: 4, interval: 1.0 }, { enemy: 'monkroose', count: 3, interval: 1.2 }, { enemy: 'cactoro', count: 2, interval: 1.8 }],
    ],
  },
  {
    id: 3, theme: 'forest', label: '숲 · 골렘 출현', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'mushling', count: 6, interval: 0.8 }, { enemy: 'monkroose', count: 4, interval: 1.0 }],
      [{ enemy: 'mushlord', count: 4, interval: 1.1 }, { enemy: 'alpaca', count: 4, interval: 1.0 }, { enemy: 'beebee', count: 4, interval: 0.9 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'cactoro', count: 3, interval: 1.4 }, { enemy: 'mushling', count: 6, interval: 0.9 }],
    ],
  },
  {
    id: 4, theme: 'forest', label: '숲 · 벌집과 정령', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'beebee', count: 6, interval: 0.7 }, { enemy: 'pigeon', count: 4, interval: 0.9 }],
      [{ enemy: 'alpaking', count: 2, interval: 1.6 }, { enemy: 'monkroose', count: 5, interval: 0.9 }],
      [{ enemy: 'spirit', count: 2, interval: 1.5 }, { enemy: 'queenbee', count: 2, interval: 1.6 }, { enemy: 'cat', count: 4, interval: 1.0 }],
    ],
  },
  {
    id: 5, theme: 'cave', label: '동굴 · 박쥐 소굴', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'bat', count: 8, interval: 0.6 }, { enemy: 'hywirl', count: 4, interval: 0.9 }],
      [{ enemy: 'goleling', count: 4, interval: 1.1 }, { enemy: 'glub', count: 5, interval: 0.8 }],
      [{ enemy: 'bat', count: 6, interval: 0.6 }, { enemy: 'fishman', count: 4, interval: 1.1 }, { enemy: 'squidle', count: 2, interval: 1.6 }, { enemy: 'wraith', count: 2, interval: 1.6 }],
    ],
  },
  {
    id: 6, theme: 'cave', label: '동굴 심부 · 설산의 예티', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'glub', count: 8, interval: 0.5 }, { enemy: 'goleling', count: 4, interval: 1.0 }],
      [{ enemy: 'fishman', count: 5, interval: 0.9 }, { enemy: 'orcskull', count: 3, interval: 1.3 }, { enemy: 'wraith', count: 2, interval: 1.5 }],
      [{ enemy: 'yeti', count: 1, interval: 1 }, { enemy: 'glubking', count: 1, interval: 1 }, { enemy: 'bat', count: 8, interval: 0.6 }],
    ],
  },
  {
    id: 7, theme: 'volcano', label: '화산 · 용암 분출', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'imp', count: 10, interval: 0.5 }],
      [{ enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'bluefiend', count: 4, interval: 1.0 }],
      [{ enemy: 'orc', count: 3, interval: 1.3 }, { enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'hywirl', count: 4, interval: 0.8 }],
    ],
  },
  {
    id: 8, theme: 'volcano', label: '화산 · 엘리트 웨이브', captureElements: CAPTURE_ALL, difficultyJump: false,
    waves: [
      [{ enemy: 'bluefiend', count: 5, interval: 0.8 }, { enemy: 'imp', count: 8, interval: 0.5 }],
      [{ enemy: 'orc', count: 4, interval: 1.1 }, { enemy: 'drake', count: 2, interval: 1.6 }],
      [{ enemy: 'dino', count: 2, interval: 1.6 }, { enemy: 'orcskull', count: 4, interval: 1.0 }, { enemy: 'imp', count: 8, interval: 0.5 }],
    ],
  },
  {
    id: 9, theme: 'temple', label: '신전 · 미니보스 2연전', captureElements: CAPTURE_ALL, difficultyJump: true, boss: 'golem',
    waves: [
      [{ enemy: 'mushking', count: 1, interval: 1 }, { enemy: 'tribal', count: 4, interval: 1.1 }, { enemy: 'wizard', count: 2, interval: 1.5 }],
      [{ enemy: 'ninja', count: 3, interval: 1.2 }, { enemy: 'queenbee', count: 3, interval: 1.1 }, { enemy: 'cat', count: 4, interval: 0.9 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'alien', count: 2, interval: 1.6 }, { enemy: 'alpaking', count: 2, interval: 1.4 }],
    ],
  },
  {
    id: 10, theme: 'temple', label: '신전 심층 · 최종 보스', captureElements: CAPTURE_ALL, difficultyJump: false, boss: 'chimera',
    waves: [
      [{ enemy: 'tribal', count: 5, interval: 0.9 }, { enemy: 'ninja', count: 3, interval: 1.2 }, { enemy: 'wizard', count: 2, interval: 1.5 }],
      [{ enemy: 'alien', count: 3, interval: 1.3 }, { enemy: 'drake', count: 3, interval: 1.2 }, { enemy: 'spirit', count: 2, interval: 1.6 }],
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
