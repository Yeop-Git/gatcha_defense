import type { Element } from '../core/types';
import rawCsv from './monsters.csv?raw';

/** 진화 단계별 이름/역할 (가칭 — DESIGN.md §5) */
export interface MonsterStageDef {
  name: string;
  role: string;
}

export interface MonsterDef {
  element: Element;
  /** 3단계 이름/역할 */
  stages: [MonsterStageDef, MonsterStageDef, MonsterStageDef];
  /** 진화가 일어나는 레벨 [1→2, 2→3] */
  evolveLevels: [number, number];
  /** 빛/어둠 대기만성 보정 여부 (초반 ×0.8, 3단 점프) */
  lateBloom: boolean;
  /** 특수 능력 태그 (역할 연출/보너스 판정용) */
  traits: string[];
}

/**
 * 캐릭터(크리처) 데이터를 monsters.csv에서 로드.
 * 컬럼: element,stage,name,role,evolve1,evolve2,lateBloom,traits(;구분)
 * 밸런싱/이름/설명 수정은 CSV만 편집.
 */
function parseCsv(csv: string): Record<Element, MonsterDef> {
  const out = {} as Record<Element, MonsterDef>;
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = 1; i < lines.length; i++) {
    const [element, stageS, name, role, e1, e2, late, traits] = lines[i].split(',').map((s) => s.trim());
    const el = element as Element;
    const stage = Number(stageS);
    if (!out[el]) {
      out[el] = {
        element: el,
        stages: [undefined, undefined, undefined] as unknown as MonsterDef['stages'],
        evolveLevels: [Number(e1), Number(e2)],
        lateBloom: late === '1',
        traits: traits ? traits.split(';').map((t) => t.trim()).filter(Boolean) : [],
      };
    }
    out[el].stages[stage - 1] = { name, role };
  }
  return out;
}

export const MONSTERS: Record<Element, MonsterDef> = parseCsv(rawCsv);
