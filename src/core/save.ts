import { state, bumpUidAbove, type GameState } from './GameState';

const KEY = 'monster-keepers-run-v2';

/** 런 스냅샷 1개 저장 (localStorage). 직렬화 가능한 필드만. */
export function saveRun(): void {
  try {
    const snap = {
      baseHpMax: state.baseHpMax, baseHp: state.baseHp, gold: state.gold, stageIndex: state.stageIndex,
      roster: state.roster, heroEquipped: state.heroEquipped, placementCap: state.placementCap,
      unitAtkMult: state.unitAtkMult, manaRegenMult: state.manaRegenMult, synergyCdCut: state.synergyCdCut,
      darkKillStacks: state.darkKillStacks, discovered: state.discovered,
    };
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* 저장 실패는 무시 (진행 우선) */
  }
}

/** 저장된 런이 있는가 (타이틀 '이어하기' 노출용) */
export function hasRun(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function loadRun(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw) as Partial<GameState>;
    state.reset();
    Object.assign(state, snap);
    // 구버전 스냅샷 방어: 새 필드 기본값 보장
    state.discovered = state.discovered ?? [];
    state.synergyCdCut = state.synergyCdCut ?? 0;
    state.darkKillStacks = state.darkKillStacks ?? 0;
    for (const u of state.roster) {
      u.branch = u.branch ?? null;
      u.discarded = u.discarded ?? [];
    }
    // 로드된 uid와 새 uid 충돌 방지
    bumpUidAbove(state.roster.map((u) => u.uid));
    return true;
  } catch {
    return false;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
