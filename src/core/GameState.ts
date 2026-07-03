import type { Element } from './types';
import { MONSTERS } from '../data/monsters';
import { CARD_BY_ID, cardsOfCharacter, type DeckCharacter } from '../data/cards';
import {
  BASE_HP, BOND_CAP, BOND_PER_STAGE, EVOLVE_MULT, LATE_BLOOM_MULT, LATE_BLOOM_STAGE3_JUMP,
  MANA_REGEN, MAX_MONSTERS, UNIT_BASE,
} from '../data/constants';

let _uid = 1;
const nextUid = () => `u${_uid++}`;

/** 덱에 장착 가능한 카드 수 (포켓몬식: 배운 것 중 5개만 들고 감) */
export const EQUIP_CAP = 5;

/** 보유(포획한) 유닛 — 런 동안 유지되는 육성 모델 */
export interface OwnedUnit {
  uid: string;
  element: Element;
  level: number;
  stage: 1 | 2 | 3;
  xp: number;
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

/**
 * 런 전역 상태. 순수 TS. 로그라이크 규칙: 사망/기지파괴 시 런 종료, 다음 런에서 리셋.
 */
export class GameState {
  baseHpMax = BASE_HP;
  baseHp = BASE_HP;
  gold = 0;
  stageIndex = 0; // 0-based (스테이지 1 = 0)

  // 성(거점) = 플레이어 진행. 전투 HP는 baseHp로 통합(주인공 삭제).
  heroLevel = 1;
  heroXp = 0;
  heroSkills: string[] = [];

  // 유닛 로스터
  roster: OwnedUnit[] = [];
  /** 주인공 장착 카드 (최대 EQUIP_CAP) */
  heroEquipped: string[] = [];

  // 배치
  placementCap = 3;

  // 런타임 마나 (스테이지 시작 시 리셋)
  mana = 10;
  manaMax = 10;

  // 스탯 수정자 (버프/스킬)
  unitAtkMult = 1;
  heroRangeBonus = 0;
  captureBonus = 0;
  manaRegenMult = 1;
  drawBonus = 0;
  flagWhirl = false;
  flagWarcry = false;
  flagThrowBoost = false;
  reviveAvailable = true;

  reset(): void {
    Object.assign(this, new GameState());
    // 시작: 주인공만 (기본 스킬 3개 장착). 몬스터는 포획으로 최대 3종(=총 4캐릭터).
    this.heroEquipped = this.defaultEquip('hero', this.heroLevel);
    this.mana = this.manaMax;
  }

  // ── 덱(학습/장착) 모델 ─────────────────────────────
  /** 캐릭터가 해당 레벨에서 사용 가능한(학습한) 카드 id 목록 */
  learnedIdsFor(character: DeckCharacter, level: number): string[] {
    return cardsOfCharacter(character).filter((c) => c.learnLevel <= level).map((c) => c.id);
  }

  /** 기본 장착: 학습한 것 중 **가장 최신(고레벨) EQUIP_CAP개** — 강한 카드가 실제로 장착되도록. */
  private defaultEquip(character: DeckCharacter, level: number): string[] {
    return this.learnedIdsFor(character, level).slice(-EQUIP_CAP);
  }

  /** 빈 슬롯을 새로 학습한 카드로 채움 (기존 장착 유지, 채울 때는 최신 카드 우선) */
  private autoFillEquip(equipped: string[], character: DeckCharacter, level: number): string[] {
    const learned = this.learnedIdsFor(character, level);
    const out = equipped.filter((id) => learned.includes(id));
    for (const id of [...learned].reverse()) {
      if (out.length >= EQUIP_CAP) break;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  /** 전투 덱 = 주인공 + 로스터 각자의 장착 카드 (총 최대 4×5=20장) */
  battleDeck(): string[] {
    return [...this.heroEquipped, ...this.roster.flatMap((u) => u.equipped)];
  }

  // 캐릭터 관리(holder = 'hero' | uid)
  holderCharacter(id: string): DeckCharacter {
    return id === 'hero' ? 'hero' : (this.roster.find((u) => u.uid === id)?.element ?? 'hero');
  }
  holderLevel(id: string): number {
    return id === 'hero' ? this.heroLevel : (this.roster.find((u) => u.uid === id)?.level ?? 1);
  }
  equippedOf(id: string): string[] {
    return id === 'hero' ? this.heroEquipped : (this.roster.find((u) => u.uid === id)?.equipped ?? []);
  }
  setEquipped(id: string, ids: string[]): void {
    const learned = this.learnedIdsFor(this.holderCharacter(id), this.holderLevel(id));
    const valid = ids.filter((x) => learned.includes(x)).slice(0, EQUIP_CAP);
    if (id === 'hero') this.heroEquipped = valid;
    else { const u = this.roster.find((x) => x.uid === id); if (u) u.equipped = valid; }
  }

  /** 보유 몬스터가 가득 찼는가 (신규 포획 불가) */
  get monstersFull(): boolean {
    return this.roster.length >= MAX_MONSTERS;
  }

  hasElement(element: Element): boolean {
    return this.roster.some((u) => u.element === element);
  }

  /**
   * 야생 포획 → 로스터 합류. level = 야생 레벨(스테이지에 따라 상승).
   * **단계는 항상 1단(진화 안 됨)** — 후반에 잡아도 "첫번째 단계"로 들어와 이후 육성으로 진화(§9).
   */
  giveUnit(element: Element, level = 1): OwnedUnit | null {
    if (this.monstersFull && !this.hasElement(element)) return null; // 최대 3종
    if (this.hasElement(element)) {
      const u = this.roster.find((x) => x.element === element)!;
      this.addUnitXp(u, 40 + level * 15); // 중복: 레벨 비례 경험치로 전환
      return u;
    }
    const unit: OwnedUnit = { uid: nextUid(), element, level, stage: 1, xp: 0, equipped: [], bond: 0 };
    unit.equipped = this.defaultEquip(element, level); // 레벨에 맞는 기본 스킬 장착
    this.roster.push(unit);
    return unit;
  }

  /** 스테이지 클리어 시 보유 유닛의 유대 누적(상한 BOND_CAP). 새 유닛일수록 낮게 시작 → 뚝심 육성 보상. */
  growBond(): void {
    for (const u of this.roster) u.bond = Math.min(BOND_CAP, (u.bond ?? 0) + BOND_PER_STAGE);
  }

  /** 유닛 경험치 지급 → 레벨업/진화/스킬 학습. 반환: 새로 배운 카드 이름들 */
  addUnitXp(unit: OwnedUnit, amount: number): { leveled: boolean; evolved: boolean; newCards: string[] } {
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
      // 이번 레벨에서 새로 학습하는 스킬 (레벨업마다 +2)
      for (const c of cardsOfCharacter(unit.element)) if (c.learnLevel === unit.level) newCards.push(c.name);
    }
    if (leveled) unit.equipped = this.autoFillEquip(unit.equipped, unit.element, unit.level);
    return { leveled, evolved, newCards };
  }

  /** 주인공 경험치 (스테이지 클리어) → 레벨업 시 스킬 학습 + 장착 보충. 반환: 레벨업 여부 */
  addHeroXp(amount: number): boolean {
    this.heroXp += amount;
    let leveled = false;
    while (this.heroXp >= xpForLevel(this.heroLevel) * 1.5) {
      this.heroXp -= xpForLevel(this.heroLevel) * 1.5;
      this.heroLevel++;
      leveled = true;
    }
    if (leveled) this.heroEquipped = this.autoFillEquip(this.heroEquipped, 'hero', this.heroLevel);
    return leveled;
  }

  applyHeroSkill(apply: string): void {
    switch (apply) {
      case 'whirl': this.flagWhirl = true; break;
      case 'herorange': this.heroRangeBonus += 1.5; break;
      case 'capture15': this.captureBonus += 0.15; break;
      case 'warcry': this.flagWarcry = true; break;
      case 'basehp25': this.heal(25); break;
      case 'throwboost': this.flagThrowBoost = true; break;
      case 'draw1': this.drawBonus += 1; break;
      case 'mana20': this.manaRegenMult *= 1.2; break;
    }
  }

  applyBuff(apply: string): void {
    switch (apply) {
      case 'atk10': this.unitAtkMult *= 1.1; break;
      case 'basehp20': this.baseHpMax += 20; this.baseHp += 20; break;
      case 'capbonus': this.captureBonus += 0.2; break;
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
