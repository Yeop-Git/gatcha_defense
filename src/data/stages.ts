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
  // 밸런스(중반~후반 강화): 4스테이지부터 물량↑·간격↓로 킬 처리량을 넘겨 상당수가 성문까지 새어들도록.
  // 포탑 대폭 너프와 맞물려 "성이 자주 위협받는" 긴장을 만든다. 온보딩(1~3)은 미변경.
  4: [
    [{ enemy: 'beebee', count: 8, interval: 0.6 }, { enemy: 'pigeon', count: 5, interval: 0.8 }],
    [{ enemy: 'alpaking', count: 2, interval: 1.5 }, { enemy: 'monkroose', count: 7, interval: 0.8 }],
    [{ enemy: 'spirit', count: 2, interval: 1.4 }, { enemy: 'queenbee', count: 3, interval: 1.4 }, { enemy: 'cat', count: 6, interval: 0.85 }],
  ],
  5: [
    [{ enemy: 'bat', count: 10, interval: 0.5 }, { enemy: 'hywirl', count: 5, interval: 0.8 }],
    [{ enemy: 'goleling', count: 5, interval: 1.0 }, { enemy: 'glub', count: 7, interval: 0.7 }],
    [{ enemy: 'bat', count: 8, interval: 0.5 }, { enemy: 'fishman', count: 5, interval: 1.0 }, { enemy: 'squidle', count: 3, interval: 1.4 }, { enemy: 'wraith', count: 3, interval: 1.4 }],
  ],
  6: [
    [{ enemy: 'glub', count: 14, interval: 0.4 }, { enemy: 'goleling', count: 6, interval: 0.8 }],
    [{ enemy: 'fishman', count: 9, interval: 0.7 }, { enemy: 'orcskull', count: 5, interval: 1.0 }, { enemy: 'wraith', count: 4, interval: 1.2 }],
    [{ enemy: 'yeti', count: 1, interval: 1 }, { enemy: 'glubking', count: 1, interval: 1 }, { enemy: 'bat', count: 16, interval: 0.42 }, { enemy: 'fishman', count: 5, interval: 0.8 }],
  ],
  7: [
    [{ enemy: 'imp', count: 18, interval: 0.38 }],
    [{ enemy: 'imp', count: 13, interval: 0.4 }, { enemy: 'bluefiend', count: 8, interval: 0.8 }],
    [{ enemy: 'orc', count: 5, interval: 1.0 }, { enemy: 'imp', count: 16, interval: 0.38 }, { enemy: 'hywirl', count: 8, interval: 0.6 }],
  ],
  8: [
    [{ enemy: 'bluefiend', count: 9, interval: 0.6 }, { enemy: 'imp', count: 13, interval: 0.4 }],
    [{ enemy: 'orc', count: 7, interval: 0.9 }, { enemy: 'drake', count: 4, interval: 1.3 }],
    [{ enemy: 'dino', count: 4, interval: 1.3 }, { enemy: 'orcskull', count: 7, interval: 0.8 }, { enemy: 'imp', count: 13, interval: 0.4 }],
  ],
  9: [
    [{ enemy: 'tribal', count: 7, interval: 0.9 }, { enemy: 'wizard', count: 4, interval: 1.2 }, { enemy: 'cat', count: 8, interval: 0.7 }],
    [{ enemy: 'ninja', count: 4, interval: 1.1 }, { enemy: 'queenbee', count: 5, interval: 0.9 }, { enemy: 'orcskull', count: 5, interval: 1.0 }],
    [{ enemy: 'warlord', count: 1, interval: 1 }, { enemy: 'alien', count: 3, interval: 1.5 }, { enemy: 'alpaking', count: 4, interval: 1.2 }, { enemy: 'ninja', count: 3, interval: 1.1 }],
  ],
  10: [
    [{ enemy: 'tribal', count: 8, interval: 0.7 }, { enemy: 'ninja', count: 5, interval: 0.9 }, { enemy: 'wizard', count: 4, interval: 1.2 }],
    [{ enemy: 'alien', count: 5, interval: 1.0 }, { enemy: 'drake', count: 5, interval: 0.9 }, { enemy: 'spirit', count: 4, interval: 1.3 }],
    // 최종 시련: 폭룡 + 호위(드레이크·에일리언)를 늘려 마지막 압박을 확실히 준다.
    [{ enemy: 'tyrant', count: 1, interval: 1 }, { enemy: 'drake', count: 4, interval: 1.5 }, { enemy: 'alien', count: 4, interval: 1.6 }],
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
