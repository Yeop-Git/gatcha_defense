import rawCsv from './stages.csv?raw';

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
  /** 표시 이름 (stages.csv에서 편집) */
  label: string;
  /** 웨이브 목록 */
  waves: SpawnGroup[][];
  /** 난이도 점프 스테이지(3/6/9) — 적 HP 스케일 가산(DIFFICULTY_JUMP_MULT ≈ ×1.28/점프) */
  difficultyJump: boolean;
  /** mini = 미니보스 스테이지, final = 최종 보스(클리어 = 런 승리) */
  boss?: 'mini' | 'final';
}

/**
 * 웨이브(스폰) 구성 — 밸런싱은 여기서. 표시 이름/테마/보스/난이도점프는 stages.csv에서 편집.
 * (이름·테마 같은 표시/메타는 데이터 CSV로 분리해 비개발자도 수정 가능하게)
 */
const WAVES: Record<number, SpawnGroup[][]> = {
  1: [
    [{ enemy: 'slime', count: 4, interval: 1.2 }],
    [{ enemy: 'slime', count: 4, interval: 1.05 }, { enemy: 'pinkling', count: 2, interval: 1.2 }],
    [{ enemy: 'slime', count: 3, interval: 1.0 }, { enemy: 'bunbun', count: 3, interval: 1.1 }, { enemy: 'spikeblob', count: 1, interval: 1.5 }],
  ],
  2: [
    [{ enemy: 'cluck', count: 4, interval: 1.05 }, { enemy: 'dog', count: 3, interval: 1.0 }],
    [{ enemy: 'mushling', count: 5, interval: 0.95 }, { enemy: 'alpaca', count: 2, interval: 1.35 }],
    [{ enemy: 'hopper', count: 3, interval: 1.05 }, { enemy: 'monkroose', count: 2, interval: 1.25 }, { enemy: 'cactoro', count: 1, interval: 1.8 }],
  ],
  3: [
    [{ enemy: 'mushling', count: 6, interval: 0.8 }, { enemy: 'monkroose', count: 4, interval: 1.0 }],
    [{ enemy: 'mushking', count: 1, interval: 1 }, { enemy: 'mushlord', count: 3, interval: 1.1 }, { enemy: 'alpaca', count: 3, interval: 1.0 }, { enemy: 'beebee', count: 3, interval: 0.95 }],
    [{ enemy: 'golem', count: 1, interval: 1 }, { enemy: 'cactoro', count: 2, interval: 1.5 }, { enemy: 'mushling', count: 5, interval: 0.95 }],
  ],
  4: [
    [{ enemy: 'beebee', count: 6, interval: 0.7 }, { enemy: 'pigeon', count: 4, interval: 0.9 }],
    [{ enemy: 'alpaking', count: 2, interval: 1.6 }, { enemy: 'monkroose', count: 5, interval: 0.9 }],
    [{ enemy: 'spirit', count: 2, interval: 1.5 }, { enemy: 'queenbee', count: 2, interval: 1.6 }, { enemy: 'cat', count: 4, interval: 1.0 }],
  ],
  5: [
    [{ enemy: 'bat', count: 8, interval: 0.6 }, { enemy: 'hywirl', count: 4, interval: 0.9 }],
    [{ enemy: 'goleling', count: 4, interval: 1.1 }, { enemy: 'glub', count: 5, interval: 0.8 }],
    [{ enemy: 'bat', count: 6, interval: 0.6 }, { enemy: 'fishman', count: 4, interval: 1.1 }, { enemy: 'squidle', count: 2, interval: 1.6 }, { enemy: 'wraith', count: 2, interval: 1.6 }],
  ],
  6: [
    [{ enemy: 'glub', count: 8, interval: 0.5 }, { enemy: 'goleling', count: 4, interval: 1.0 }],
    [{ enemy: 'fishman', count: 5, interval: 0.9 }, { enemy: 'orcskull', count: 3, interval: 1.3 }, { enemy: 'wraith', count: 2, interval: 1.5 }],
    [{ enemy: 'yeti', count: 1, interval: 1 }, { enemy: 'glubking', count: 1, interval: 1 }, { enemy: 'bat', count: 8, interval: 0.6 }],
  ],
  7: [
    [{ enemy: 'imp', count: 10, interval: 0.5 }],
    [{ enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'bluefiend', count: 4, interval: 1.0 }],
    [{ enemy: 'orc', count: 3, interval: 1.3 }, { enemy: 'imp', count: 8, interval: 0.5 }, { enemy: 'hywirl', count: 4, interval: 0.8 }],
  ],
  8: [
    [{ enemy: 'bluefiend', count: 5, interval: 0.8 }, { enemy: 'imp', count: 8, interval: 0.5 }],
    [{ enemy: 'orc', count: 4, interval: 1.1 }, { enemy: 'drake', count: 2, interval: 1.6 }],
    [{ enemy: 'dino', count: 2, interval: 1.6 }, { enemy: 'orcskull', count: 4, interval: 1.0 }, { enemy: 'imp', count: 8, interval: 0.5 }],
  ],
  9: [
    [{ enemy: 'tribal', count: 4, interval: 1.1 }, { enemy: 'wizard', count: 2, interval: 1.5 }, { enemy: 'cat', count: 4, interval: 0.9 }],
    [{ enemy: 'ninja', count: 2, interval: 1.3 }, { enemy: 'queenbee', count: 3, interval: 1.2 }, { enemy: 'orcskull', count: 2, interval: 1.3 }],
    [{ enemy: 'warlord', count: 1, interval: 1 }, { enemy: 'alien', count: 1, interval: 1.8 }, { enemy: 'alpaking', count: 2, interval: 1.5 }],
  ],
  10: [
    [{ enemy: 'tribal', count: 5, interval: 0.9 }, { enemy: 'ninja', count: 3, interval: 1.2 }, { enemy: 'wizard', count: 2, interval: 1.5 }],
    [{ enemy: 'alien', count: 3, interval: 1.3 }, { enemy: 'drake', count: 3, interval: 1.2 }, { enemy: 'spirit', count: 2, interval: 1.6 }],
    // 최종 시련: 폭룡 단독은 허무 → 소수 호위(드레이크·에일리언)를 곁들여 긴장만 준다(과하지 않게).
    [{ enemy: 'tyrant', count: 1, interval: 1 }, { enemy: 'drake', count: 2, interval: 1.8 }, { enemy: 'alien', count: 2, interval: 2.0 }],
  ],
};

/** stages.csv(id,theme,name,difficultyJump,boss) + WAVES를 병합해 STAGES 생성. */
function parseStages(csv: string): StageDef[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: StageDef[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [id, theme, name, jump, boss] = lines[i].split(',').map((s) => s.trim());
    const n = Number(id);
    out.push({
      id: n,
      theme: theme as Theme,
      label: name,
      waves: WAVES[n] ?? [],
      difficultyJump: jump === '1',
      boss: boss ? (boss as 'mini' | 'final') : undefined,
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

export const STAGES: StageDef[] = parseStages(rawCsv);

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
  { id: 'egg', label: '운명의 알', desc: '50% 확률로 금화가 쏟아지고, 아니면 꽝.' },
  { id: 'altar', label: '저주받은 제단', desc: '성 HP 15를 바치고 골드 +50.' },
  // ── 도박 노드(양날/운): 큰 보상엔 큰 리스크 ──
  { id: 'roulette', label: '🎰 행운의 룰렛', desc: '가진 골드의 절반을 건다. 55% 확률로 2배, 45% 확률로 잃는다.' },
  { id: 'pact', label: '🩸 피의 계약', desc: '성 HP 40을 제물로 바쳐 모든 유닛의 공격력을 영구 +18% 올린다.' },
  { id: 'dice', label: '🎲 운명의 주사위', desc: '주사위를 굴린다. 6=강력한 영구 강화, 4·5=골드 +50, 1~3=골드 -20.' },
] as const;
