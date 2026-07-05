import { state, bumpUidAbove, type GameState } from './GameState';

const KEY = 'monster-keepers-run-v2';

/** 런 스냅샷 1개 저장 (localStorage). 직렬화 가능한 필드만. */
export function saveRun(): void {
  try {
    const snap = {
      baseHpMax: state.baseHpMax, baseHp: state.baseHp, gold: state.gold, stageIndex: state.stageIndex,
      roster: state.roster, heroEquipped: state.heroEquipped, placementCap: state.placementCap,
      unitAtkMult: state.unitAtkMult, manaRegenMult: state.manaRegenMult,
      // 스탯 강화(강화 노드·상점)로 오르는 보너스 — 누락 시 이어하기에서 초기화되던 버그.
      rangeBonus: state.rangeBonus, aspdBonus: state.aspdBonus,
      critChanceBonus: state.critChanceBonus, critDmgBonus: state.critDmgBonus,
      manaMax: state.manaMax,
      darkKillStacks: state.darkKillStacks,
      captured: state.captured,
      gapSpecials: state.gapSpecials, specialPending: state.specialPending,
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
    state.captured = state.captured ?? {};
    state.darkKillStacks = state.darkKillStacks ?? 0;
    state.gapSpecials = state.gapSpecials ?? [];
    state.specialPending = state.specialPending ?? false;
    for (const u of state.roster) {
      u.discarded = u.discarded ?? [];
      u.kind = u.kind ?? 'creature';
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
