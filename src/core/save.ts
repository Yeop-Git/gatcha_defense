import { state, bumpUidAbove, type GameState } from './GameState';
import { MAX_MONSTERS } from '../data/constants';

const KEY = 'monster-keepers-run-v2';
// 스테이지 시작 시점 체크포인트 — 사망 시 이 시점으로 되돌려 "그 스테이지부터 재도전"(로그라이크 폐지).
const CHECKPOINT_KEY = 'monster-keepers-checkpoint-v1';

/** 직렬화 가능한 런 스냅샷 객체 생성. */
function snapshot(): Record<string, unknown> {
  return {
    baseHpMax: state.baseHpMax, baseHp: state.baseHp, gold: state.gold, stageIndex: state.stageIndex,
    roster: state.roster.slice(0, MAX_MONSTERS), heroEquipped: state.heroEquipped,
    unitAtkMult: state.unitAtkMult, manaRegenMult: state.manaRegenMult,
    // 스탯 강화(강화 노드·상점)로 오르는 보너스 — 누락 시 이어하기에서 초기화되던 버그.
    rangeBonus: state.rangeBonus, aspdBonus: state.aspdBonus,
    critChanceBonus: state.critChanceBonus, critDmgBonus: state.critDmgBonus,
    manaMax: state.manaMax,
    darkKillStacks: state.darkKillStacks,
    captured: state.captured,
    gapSpecials: state.gapSpecials, specialPending: state.specialPending,
  };
}

/** 런 스냅샷 1개 저장 (localStorage). 직렬화 가능한 필드만. */
export function saveRun(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot()));
  } catch {
    /* 저장 실패는 무시 (진행 우선) */
  }
}

/** 스테이지 시작 시점 체크포인트 저장 — 사망 시 되돌릴 재도전 기준점. */
export function saveCheckpoint(): void {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(snapshot()));
  } catch {
    /* 저장 실패는 무시 */
  }
}

/**
 * 사망 시: 스테이지 시작 체크포인트로 상태 복원(그 스테이지부터 재도전).
 * 체크포인트가 없으면(구버전 등) 마지막 자동저장으로 폴백. 세이브는 유지한다.
 */
export function restoreCheckpoint(): boolean {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY) ?? localStorage.getItem(KEY);
    if (!raw) return false;
    applySnapshot(JSON.parse(raw) as Partial<GameState>);
    saveRun(); // 복원된 상태를 자동저장에도 반영(다음 이어하기 일관성)
    return true;
  } catch {
    return false;
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

/** 스냅샷을 state에 적용 (reset 후 병합 + 구버전 방어 + uid 충돌 방지). */
function applySnapshot(snap: Partial<GameState>): void {
  state.reset();
  Object.assign(state, snap);
  state.placementCap = MAX_MONSTERS;
  state.roster = (state.roster ?? []).slice(0, MAX_MONSTERS);
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
}

export function loadRun(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    applySnapshot(JSON.parse(raw) as Partial<GameState>);
    return true;
  } catch {
    return false;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    /* noop */
  }
}
