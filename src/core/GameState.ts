import type { Element } from './types';
import { MONSTERS, type BranchDef } from '../data/monsters';
import { CARD_BY_ID, cardsOfCharacter, type DeckCharacter } from '../data/cards';
import {
  BASE_HP, BOND_CAP, BOND_PER_STAGE, ELEMENTS, EVOLVE_MULT, LATE_BLOOM_MULT, LATE_BLOOM_STAGE3_JUMP,
  MANA_REGEN, MAX_MONSTERS, UNIT_BASE,
} from '../data/constants';

let _uid = 1;
const nextUid = () => `u${_uid++}`;

/** 저장 로드 후 uid 충돌 방지 — 로드된 uid들보다 큰 값에서 시작. */
export function bumpUidAbove(uids: string[]): void {
  for (const id of uids) {
    const n = Number(id.replace(/^u/, ''));
    if (Number.isFinite(n) && n >= _uid) _uid = n + 1;
  }
}

/** 덱에 장착 가능한 카드 수 (포켓몬식: 배운 것 중 5개만 들고 감) */
export const EQUIP_CAP = 5;

/** 보유 유닛 — 런 동안 유지되는 육성 모델. 획득은 드래프트뿐(§3). */
export interface OwnedUnit {
  uid: string;
  element: Element;
  level: number;
  stage: 1 | 2 | 3;
  xp: number;
  /** 분기 진화 형태 (§5.6). 3단 도달 시 2택1, 선택 전에는 null. */
  branch: 'A' | 'B' | null;
  /** 덱에 장착한 카드 id (최대 EQUIP_CAP) */
  equipped: string[];
  /** 유대(Bond) 누적 보너스 비율 0~BOND_CAP. 함께 스테이지를 클리어할수록 누적(§14). */
  bond: number;
}

export interface DerivedStats {
  hp: number;
  attack: number;
  range: number;
  attackSpeed: number;
  /** 유대 보너스 비율(표시용) */
  bond: number;
}

/** XP 곡선: 레벨 n → n+1 필요량 */
export function xpForLevel(level: number): number {
  return 20 + level * 12;
}

/** 유닛 진화 단계 계산 (레벨 기준) */
function stageForLevel(element: Element, level: number): 1 | 2 | 3 {
  const [e1, e2] = MONSTERS[element].evolveLevels;
  if (level >= e2) return 3;
  if (level >= e1) return 2;
  return 1;
}

/** 유닛 파생 스탯 (§14). 대기만성 보정 반영. */
export function deriveStats(unit: OwnedUnit): DerivedStats {
  const def = MONSTERS[unit.element];
  const mult = Math.pow(EVOLVE_MULT, unit.stage - 1);
  let hp = UNIT_BASE.hp * mult;
  let attack = UNIT_BASE.attack * mult;
  if (def.lateBloom) {
    if (unit.stage < 3) {
      hp *= LATE_BLOOM_MULT;
      attack *= LATE_BLOOM_MULT;
    } else {
      hp *= LATE_BLOOM_STAGE3_JUMP / EVOLVE_MULT; // 3단 점프 (×1.9 기준으로 치환)
      attack *= LATE_BLOOM_STAGE3_JUMP / EVOLVE_MULT;
    }
  }
  // 레벨당 성장(진화 사이 레벨도 체감되도록) + 유대 보너스(상한 BOND_CAP)
  const lv = 1 + (unit.level - 1) * 0.06;
  const bond = Math.min(BOND_CAP, unit.bond ?? 0);
  const growth = lv * (1 + bond);
  return {
    hp: Math.round(hp * growth),
    attack: Math.round(attack * growth),
    range: UNIT_BASE.range + (unit.stage - 1) * 0.6,
    attackSpeed: UNIT_BASE.attackSpeed + (unit.stage - 1) * 0.15,
    bond,
  };
}

export function unitName(unit: OwnedUnit): string {
  return MONSTERS[unit.element].stages[unit.stage - 1].name;
}

/** 선택한 분기 정의 (§5.6). 미선택/3단 미만이면 null. */
export function unitBranch(unit: OwnedUnit): BranchDef | null {
  if (unit.stage < 3 || !unit.branch) return null;
  return MONSTERS[unit.element].branches.find((b) => b.key === unit.branch) ?? null;
}

/** 렌더 팔레트 스왑 틴트 — 분기 선택 시 그 색 (색이 곧 빌드, §5.6). */
export function unitTint(unit: OwnedUnit): number | undefined {
  return unitBranch(unit)?.tint;
}

/**
 * 런 전역 상태. 순수 TS. 로그라이크 규칙: 기지 파괴 시 런 종료, 다음 런에서 리셋.
 * 주인공 없음(v3) — 무색 카드 5장은 '성(거점)' 공용 덱.
 */
export class GameState {
  baseHpMax = BASE_HP;
  baseHp = BASE_HP;
  gold = 0;
  stageIndex = 0; // 0-based (스테이지 1 = 0)

  // 유닛 로스터 (드래프트로만 획득, 최대 3)
  roster: OwnedUnit[] = [];
  /** 성(공용) 장착 카드 = 무색 5장 (최대 EQUIP_CAP) */
  heroEquipped: string[] = [];

  // 배치
  placementCap = 3;

  // 런타임 마나 (스테이지 시작 시 리셋)
  mana = 10;
  manaMax = 10;

  // 스탯 수정자 (갈림길 버프)
  unitAtkMult = 1;
  manaRegenMult = 1;
  /** 협동기 내부 쿨다운 감소(초) — 갈림길 버프 (§10) */
  synergyCdCut = 0;
  reviveAvailable = true;

  /** 반응 도감 (§7.3): 발견한 협동기 id */
  discovered: string[] = [];

  reset(): void {
    Object.assign(this, new GameState());
    this.heroEquipped = this.defaultEquip('hero', 1, null);
    this.mana = this.manaMax;
  }

  // ── 덱(학습/장착) 모델 ─────────────────────────────
  /**
   * 캐릭터가 해당 레벨에서 사용 가능한(학습한) 카드 id 목록.
   * 분기 시그니처 카드는 그 분기를 선택했을 때만 해금(§5.6).
   */
  learnedIdsFor(character: DeckCharacter, level: number, branch: 'A' | 'B' | null): string[] {
    return cardsOfCharacter(character)
      .filter((c) => c.learnLevel <= level && (!c.branch || c.branch === branch))
      .map((c) => c.id);
  }

  /** 기본 장착: 학습한 것 중 **가장 최신(고레벨) EQUIP_CAP개** — 강한 카드가 실제로 장착되도록. */
  private defaultEquip(character: DeckCharacter, level: number, branch: 'A' | 'B' | null): string[] {
    return this.learnedIdsFor(character, level, branch).slice(-EQUIP_CAP);
  }

  /** 빈 슬롯을 새로 학습한 카드로 채움 (기존 장착 유지, 채울 때는 최신 카드 우선) */
  private autoFillEquip(equipped: string[], character: DeckCharacter, level: number, branch: 'A' | 'B' | null): string[] {
    const learned = this.learnedIdsFor(character, level, branch);
    const out = equipped.filter((id) => learned.includes(id));
    for (const id of [...learned].reverse()) {
      if (out.length >= EQUIP_CAP) break;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  /** 전투 덱 = 성(무색) + 로스터 각자의 장착 카드 (총 최대 4×5=20장, §6) */
  battleDeck(): string[] {
    return [...this.heroEquipped, ...this.roster.flatMap((u) => u.equipped)];
  }

  // 캐릭터 관리(holder = 'hero' | uid)
  holderCharacter(id: string): DeckCharacter {
    return id === 'hero' ? 'hero' : (this.roster.find((u) => u.uid === id)?.element ?? 'hero');
  }
  holderLevel(id: string): number {
    return id === 'hero' ? 1 : (this.roster.find((u) => u.uid === id)?.level ?? 1);
  }
  holderBranch(id: string): 'A' | 'B' | null {
    return id === 'hero' ? null : (this.roster.find((u) => u.uid === id)?.branch ?? null);
  }
  equippedOf(id: string): string[] {
    return id === 'hero' ? this.heroEquipped : (this.roster.find((u) => u.uid === id)?.equipped ?? []);
  }
  setEquipped(id: string, ids: string[]): void {
    const learned = this.learnedIdsFor(this.holderCharacter(id), this.holderLevel(id), this.holderBranch(id));
    const valid = ids.filter((x) => learned.includes(x)).slice(0, EQUIP_CAP);
    if (id === 'hero') this.heroEquipped = valid;
    else { const u = this.roster.find((x) => x.uid === id); if (u) u.equipped = valid; }
  }

  /** 보유 몬스터가 가득 찼는가 */
  get monstersFull(): boolean {
    return this.roster.length >= MAX_MONSTERS;
  }

  hasElement(element: Element): boolean {
    return this.roster.some((u) => u.element === element);
  }

  /** 로스터 합류 (드래프트 전용, §3). 항상 1단부터 시작 → 육성으로 진화. */
  giveUnit(element: Element, level = 1): OwnedUnit | null {
    if (this.hasElement(element) || this.monstersFull) return null;
    const unit: OwnedUnit = { uid: nextUid(), element, level, stage: 1, xp: 0, branch: null, equipped: [], bond: 0 };
    unit.equipped = this.defaultEquip(element, level, null);
    this.roster.push(unit);
    return unit;
  }

  /** 스테이지 클리어 시 보유 유닛의 유대 누적(상한 BOND_CAP). 뚝심 육성 보상(§14). */
  growBond(): void {
    for (const u of this.roster) u.bond = Math.min(BOND_CAP, (u.bond ?? 0) + BOND_PER_STAGE);
  }

  // ── 드래프트(v3): 스테이지 1·2·3 시작 시 3택1 ─────────
  /** 이번 스테이지 시작에 드래프트가 필요한가 (1·2·3, 아직 그 스테이지분을 안 뽑음). */
  get needsDraft(): boolean {
    return this.stageIndex <= 2 && this.roster.length <= this.stageIndex;
  }

  /** 드래프트 후보: 미보유 5속성 중 최대 3종(무작위). */
  draftOptions(): Element[] {
    const owned = new Set(this.roster.map((u) => u.element));
    const pool = ELEMENTS.filter((e) => !owned.has(e));
    return pool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  }

  /** 드래프트 선택 → 로스터 합류 (1단·레벨1). */
  draftPick(element: Element): void {
    this.giveUnit(element, 1);
  }

  /** 드래프트에서 버려진(미보유) 속성 — §9 타락체 보스용. */
  unpickedElements(): Element[] {
    const owned = new Set(this.roster.map((u) => u.element));
    return ELEMENTS.filter((e) => !owned.has(e));
  }

  /**
   * 가지 않은 길 (§9): 버린 2종 → 9 중간보스(mid) / 10 최종보스(final) 배정.
   * 최종보스 우선순위: 빛/어둠이 버려졌으면 그쪽(어둠 우선) — 대기만성 = 후반 위협 테마.
   */
  corruptedBosses(): { mid: Element; final: Element } {
    const un = this.unpickedElements();
    if (un.length === 0) return { mid: 'dark', final: 'light' }; // 방어적 폴백 (정상 플레이 불가 케이스)
    const final = un.includes('dark') ? 'dark' : un.includes('light') ? 'light' : un[un.length - 1];
    const mid = un.find((e) => e !== final) ?? final;
    return { mid, final };
  }

  /**
   * 유닛 경험치 지급 → 레벨업/진화/스킬 학습.
   * 3단 도달 시 분기 미선택이면 needsBranch — 상위(Game)가 2택1 UI를 띄운다.
   */
  addUnitXp(unit: OwnedUnit, amount: number): { leveled: boolean; evolved: boolean; needsBranch: boolean; newCards: string[] } {
    unit.xp += amount;
    let leveled = false;
    let evolved = false;
    const newCards: string[] = [];
    while (unit.xp >= xpForLevel(unit.level)) {
      unit.xp -= xpForLevel(unit.level);
      unit.level++;
      leveled = true;
      const newStage = stageForLevel(unit.element, unit.level);
      if (newStage > unit.stage) { unit.stage = newStage; evolved = true; }
      // 이번 레벨에서 새로 학습하는 스킬 (분기 시그니처는 분기 선택 시 별도 안내)
      for (const c of cardsOfCharacter(unit.element)) {
        if (c.learnLevel === unit.level && (!c.branch || c.branch === unit.branch)) newCards.push(c.name);
      }
    }
    if (leveled) unit.equipped = this.autoFillEquip(unit.equipped, unit.element, unit.level, unit.branch);
    const needsBranch = unit.stage >= 3 && !unit.branch;
    return { leveled, evolved, needsBranch, newCards };
  }

  /** 분기 선택 (§5.6) → 시그니처 카드 해금 + 장착 보충. 반환: 해금된 시그니처 카드 이름. */
  chooseBranch(uid: string, key: 'A' | 'B'): string | null {
    const u = this.roster.find((x) => x.uid === uid);
    if (!u || u.stage < 3 || u.branch) return null;
    u.branch = key;
    u.equipped = this.autoFillEquip(u.equipped, u.element, u.level, u.branch);
    const br = MONSTERS[u.element].branches.find((b) => b.key === key)!;
    return CARD_BY_ID[br.signatureCardId]?.name ?? null;
  }

  /** 반응 도감 등록 (§7.3). 처음 본 협동기면 true. */
  discoverSynergy(id: string): boolean {
    if (this.discovered.includes(id)) return false;
    this.discovered.push(id);
    return true;
  }

  applyBuff(apply: string): void {
    switch (apply) {
      case 'atk10': this.unitAtkMult *= 1.1; break;
      case 'basehp20': this.baseHpMax += 20; this.baseHp += 20; break;
      case 'syncd': this.synergyCdCut += 0.5; break;
      case 'mana20': this.manaRegenMult *= 1.2; break;
    }
  }

  heal(amount: number): void {
    this.baseHp = Math.min(this.baseHpMax, this.baseHp + amount);
  }

  get manaRegen(): number {
    return MANA_REGEN * this.manaRegenMult;
  }

  cardName(id: string): string {
    return CARD_BY_ID[id]?.name ?? id;
  }
}

export const state = new GameState();
