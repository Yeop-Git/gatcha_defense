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
  /** 웨이브 목록 */
  waves: SpawnGroup[][];
  /** 난이도 점프 스테이지(3/6/9) — 적 HP 스케일 가산(DIFFICULTY_JUMP_MULT ≈ ×1.28/점프) */
  difficultyJump: boolean;
  /** mini = 미니보스 스테이지, final = 최종 보스(클리어 = 런 승리) */
  boss?: 'mini' | 'final';
}

export const STAGES: StageDef[] = [
  {
    id: 1, theme: 'grassland', label: '초원 · 튜토리얼', difficultyJump: false,
    waves: [
      [{ enemy: 'slime', count: 4, interval: 1.2 }],
      [{ enemy: 'slime', count: 5, interval: 1.0 }, { enemy: 'pinkling', count: 3, interval: 1.1 }],
      [{ enemy: 'slime', count: 4, interval: 0.9 }, { enemy: 'bunbun', count: 4, interval: 1.0 }, { enemy: 'spikeblob', count: 2, interval: 1.4 }],
    ],
  },
  {
    id: 2, theme: 'grassland', label: '초원 · 짐승들의 길목', difficultyJump: false,
    waves: [
      [{ enemy: 'cluck', count: 5, interval: 1.0 }, { enemy: 'dog', count: 4, interval: 0.9 }],
      [{ enemy: 'mushling', count: 6, interval: 0.9 }, { enemy: 'alpaca', count: 3, interval: 1.3 }],
      [{ enemy: 'hopper', count: 4, interval: 1.0 }, { enemy: 'monkroose', count: 3, interval: 1.2 }, { enemy: 'cactoro', count: 2, interval: 1.8 }],
    ],
  },
  {
    id: 3, theme: 'forest', label: '숲 · 골렘 출현', difficultyJump: true, boss: 'mini',
    waves: [
      [{ enemy: 'mushling', count: 6, interval: 0.8 }, { enemy: 'monkroose', count: 4, interval: 1.0 }],
      [{ enemy: 'mushlord', count: 4, interval: 1.1 }, { enemy: 'alpaca', count: 4, interval: 1.0 }, { enemy: 'beebee', count: 4, interval: 0.9 }],
      [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'cactoro', count: 3, interval: 1.4 }, { enemy: 'mushling', count: 6, interval: 0.9 }],
    ],
  },
  {
    id: 4, theme: 'forest', label: '숲 · 벌집과 정령', difficultyJump: false,
    waves: [
      [{ enemy: 'beebee', count: 6, interval: 0.7 }, { enemy: 'pigeon', count: 4, interval: 0.9 }],
      [{ enemy: 'alpaking', count: 2, interval: 1.6 }, { enemy: 'monkroose', count: 5, interval: 0.9 }],
      [{ enemy: 'spirit', count: 2, interval: 1.5 }, { enemy: 'queenbee', count: 2, interval: 1.6 }, { enemy: 'cat', count: 4, interval: 1.0 }],
    ],
  },
  {
    id: 5, theme: 'cave', label: '동굴 · 박쥐 소굴', difficultyJump: false,
    waves: [
      [{ enemy: 'bat', count: 8, interval: 0.6 }, { enemy: 'hywirl', count: 4, interval: 0.9 }],
      [{ enemy: 'goleling', count: 4, interval: 1.1 }, { enemy: 'glub', count: 5, interval: 0.8 }],
      [{ enemy: 'bat', count: 6, interval: 0.6 }, { enemy: 'fishman', count: 4, interval: 1.1 }, { enemy: 'squidle', count: 2, interval: 1.6 }, { enemy: 'wraith', count: 2, interval: 1.6 }],
    ],
  },
  {
    id: 6, theme: 'cave', label: '동굴 심부 · 설산의 예티', difficultyJump: true, boss: 'mini',
    waves: [
      [{ enemy: 'glub', count: 8, interval: 0.5 }, { enemy: 'goleling', count: 4, interval: 1.0 }],
      [{ enemy: 'fishman', count: 5, interval: 0.9 }, { enemy: 'orcskull', count: 3, interval: 1.3 }, { enemy: 'wraith', count: 2, interval: 1.5 }],
      [{ enemy: 'yeti', count: 1, interval: 1 }, { enemy: 'glubking', count: 1, interval: 1 }, { enemy: 'bat', count: 8, interval: 0.6 }],
    ],
  },
  {
    id: 7, theme: 'volcano', label: '화산 · 용암 분출', difficultyJump: false,
    waves: [
      [{ enemy: 'imp', count: 10, interval: 0.5 }],
      [{ enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'bluefiend', count: 4, interval: 1.0 }],
      [{ enemy: 'orc', count: 3, interval: 1.3 }, { enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'hywirl', count: 4, interval: 0.8 }],
    ],
  },
  {
    id: 8, theme: 'volcano', label: '화산 · 엘리트 웨이브', difficultyJump: false,
    waves: [
      [{ enemy: 'bluefiend', count: 5, interval: 0.8 }, { enemy: 'imp', count: 8, interval: 0.5 }],
      [{ enemy: 'orc', count: 4, interval: 1.1 }, { enemy: 'drake', count: 2, interval: 1.6 }],
      [{ enemy: 'dino', count: 2, interval: 1.6 }, { enemy: 'orcskull', count: 4, interval: 1.0 }, { enemy: 'imp', count: 8, interval: 0.5 }],
    ],
  },
  {
    // 스테이지 보스 = 해골 군주(무진화 단독 개체). HP 0 시 3초 기절 창에서만 포획 가능.
    id: 9, theme: 'temple', label: '신전 · 해골 군주', difficultyJump: true, boss: 'mini',
    waves: [
      [{ enemy: 'tribal', count: 4, interval: 1.1 }, { enemy: 'wizard', count: 2, interval: 1.5 }, { enemy: 'cat', count: 4, interval: 0.9 }],
      [{ enemy: 'ninja', count: 2, interval: 1.3 }, { enemy: 'queenbee', count: 3, interval: 1.2 }, { enemy: 'orcskull', count: 2, interval: 1.3 }],
      [{ enemy: 'warlord', count: 1, interval: 1 }, { enemy: 'alien', count: 1, interval: 1.8 }, { enemy: 'alpaking', count: 2, interval: 1.5 }],
    ],
  },
  {
    // 최종보스 = 폭룡 티라노(무진화 단독 개체). 클리어 = 런 승리.
    id: 10, theme: 'temple', label: '신전 심층 · 폭룡의 둥지', difficultyJump: false, boss: 'final',
    waves: [
      [{ enemy: 'tribal', count: 5, interval: 0.9 }, { enemy: 'ninja', count: 3, interval: 1.2 }, { enemy: 'wizard', count: 2, interval: 1.5 }],
      [{ enemy: 'alien', count: 3, interval: 1.3 }, { enemy: 'drake', count: 3, interval: 1.2 }, { enemy: 'spirit', count: 2, interval: 1.6 }],
      [{ enemy: 'tyrant', count: 1, interval: 1 }],
    ],
  },
];

/** 갈림길 버프 노드 3택1 풀 (§10) */
export interface BuffOption {
  id: string;
  label: string;
  apply: string; // GameState에서 해석
}

export const BUFF_NODES: BuffOption[] = [
  { id: 'atk', label: '⚔️ 공격력 +12%', apply: 'atk' },
  { id: 'range', label: '🎯 사거리 +0.6', apply: 'range' },
  { id: 'aspd', label: '⚡ 공격속도 +0.12', apply: 'aspd' },
  { id: 'crit', label: '💥 치명타 확률 +6%', apply: 'crit' },
  { id: 'critdmg', label: '🔥 치명타 피해 +25%', apply: 'critdmg' },
];

/** 이벤트 노드 (§10) */
export const EVENT_NODES = [
  { id: 'merchant', label: '수상한 상인', desc: '희귀한 물건을 헐값에 넘긴다. 골드 +40.' },
  { id: 'hotspring', label: '몬스터 온천', desc: '모든 유닛이 경험치를 얻는다.' },
  { id: 'egg', label: '운명의 알', desc: '50% 금화 잭팟 / 50% 꽝.' },
  { id: 'altar', label: '저주받은 제단', desc: '성 HP 15를 바치고 골드 +50.' },
] as const;
