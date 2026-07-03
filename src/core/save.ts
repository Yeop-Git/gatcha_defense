import { state, type GameState } from './GameState';

const KEY = 'monster-keepers-run-v1';

/** 런 스냅샷 1개 저장 (localStorage). 직렬화 가능한 필드만. */
export function saveRun(): void {
  try {
    const snap = {
      baseHpMax: state.baseHpMax, baseHp: state.baseHp, gold: state.gold, stageIndex: state.stageIndex,
      heroLevel: state.heroLevel, heroXp: state.heroXp, heroSkills: state.heroSkills,
      roster: state.roster, heroEquipped: state.heroEquipped, placementCap: state.placementCap,
      unitAtkMult: state.unitAtkMult, heroRangeBonus: state.heroRangeBonus, captureBonus: state.captureBonus,
      manaRegenMult: state.manaRegenMult, drawBonus: state.drawBonus,
      flagWhirl: state.flagWhirl, flagWarcry: state.flagWarcry, flagThrowBoost: state.flagThrowBoost,
      reviveAvailable: state.reviveAvailable,
    };
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* 저장 실패는 무시 (진행 우선) */
  }
}

export function loadRun(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw) as Partial<GameState>;
    Object.assign(state, snap);
    state.mana = state.manaMax;
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
