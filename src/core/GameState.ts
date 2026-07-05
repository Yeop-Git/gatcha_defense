import type { Element, ElementOrNeutral } from './types';
import { MONSTERS } from '../data/monsters';
import { ENEMIES, type EnemyTier } from '../data/enemies';
import { CARD_BY_ID, cardsOfCharacter, type CardDef, type DeckCharacter } from '../data/cards';
import { ITEM_BY_ID, type ItemEffect } from '../data/items';
import { unlockCreature } from './Dex';
import {
  BASE_HP, BOND_CAP, BOND_PER_STAGE, CAPTURE, ELEMENTS, ENEMY_EVOLVE_LEVEL, EVOLVE_MULT, LATE_BLOOM_MULT, LATE_BLOOM_STAGE3_JUMP,
  CRIT, LEVEL_GROWTH_PER, MANA_MAX, MANA_REGEN, MAX_LEVEL, ENEMY_MAX_LEVEL, MAX_MONSTERS, UNIT_BASE, STAGE_HP_FLOOR_PER,
} from '../data/constants';

/** 유닛 종류별 만렙: 크리처 30, 포획 적 25 (에너미 육성 상한을 낮춰 차등). */
export function maxLevelFor(kind: OwnedUnit['kind']): number {
  return kind === 'enemy' ? ENEMY_MAX_LEVEL : MAX_LEVEL;
}

/** 무속성 적을 플레이어블 유닛으로 쓸 때의 대체 속성 (마크/색 판정용). */
export function asElement(el: ElementOrNeutral): Element {
  return el === 'neutral' ? 'grass' : el;
}

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

/** 모험 지도의 스테이지 사이(갭) 특수 노드 종류. */
export type SpecialKind = 'shop' | 'event' | 'rest';

/** 보유 유닛 — 런 동안 유지되는 육성 모델. creature=드래프트, enemy=포획. */
export interface OwnedUnit {
  uid: string;
  /** 출처: creature(드래프트, 3단 진화) 또는 enemy(포획, 2단/무진화). */
  kind: 'creature' | 'enemy';
  /** enemy일 때 적 도감 species id (ENEMIES). creature는 undefined. */
  species?: string;
  /** 속성 (creature=고유, enemy=플레이 속성; 무속성 적은 asElement로 대체). */
  element: Element;
  level: number;
  stage: 1 | 2 | 3;
  xp: number;
  /** 사용자 지정 이름 (뷰어에서 편집). 없으면 단계 기본 이름. */
  nickname?: string;
  /** 덱에 장착한 카드 id (최대 EQUIP_CAP, 앞쪽 = 오래된 순) */
  equipped: string[];
  /** 카드 교체에서 버린 카드 id — 이 런에서는 다시 쓸 수 없음 */
  discarded: string[];
  /** 유대(Bond) 누적 보너스 비율 0~BOND_CAP. 함께 스테이지를 클리어할수록 누적(§14). */
  bond: number;
  /** 지닌 도구(held item) id — 상점에서 구매·장착. 스탯 보너스(items.ts). 없으면 undefined. */
  item?: string;
}

/** 카드 획득 이벤트 — 연출/교체 선택 큐용 (레벨업·분기 시그니처) */
export interface CardGain {
  uid: string;
  cardId: string;
}

/** 성장 통지용 유닛 정보 (중복 포획 보너스 확산 시 성장한 동료들). */
export interface GrownInfo {
  uid: string;
  from: string;
  to: string;
  element: Element;
  evolved: boolean;
  gains: CardGain[];
}

export interface DerivedStats {
  hp: number;
  attack: number;
  range: number;
  attackSpeed: number;
  /** 치명타 확률 0~1 */
  critChance: number;
  /** 치명타 피해 배율 (예: 1.8 = +80%) */
  critDmg: number;
  /** 유대 보너스 비율(표시용) */
  bond: number;
}

/** 레벨/진화에 따른 치명타 스탯 (레벨업=부드럽게, 진화=든든하게). */
function critFor(level: number, stage: number): { critChance: number; critDmg: number } {
  return {
    critChance: Math.min(CRIT.chanceMax, CRIT.chanceBase + (level - 1) * CRIT.chancePerLevel + (stage - 1) * CRIT.chancePerStage),
    critDmg: CRIT.dmgBase + (level - 1) * CRIT.dmgPerLevel + (stage - 1) * CRIT.dmgPerStage,
  };
}

/** 유닛이 지닌 도구(held item)의 스탯 효과 (없으면 빈 효과). */
function itemEffectOf(unit: OwnedUnit): ItemEffect {
  return (unit.item ? ITEM_BY_ID[unit.item]?.effect : undefined) ?? {};
}

/** XP 곡선: 레벨 n → n+1 필요량. 만렙 30 확장 + 레벨업 완화(기존 20+12n에서 상향). */
export function xpForLevel(level: number): number {
  return 40 + level * 18;
}

/** 유닛 진화 단계 계산 (레벨 기준) */
function stageForLevel(element: Element, level: number): 1 | 2 | 3 {
  const [e1, e2] = MONSTERS[element].evolveLevels;
  if (level >= e2) return 3;
  if (level >= e1) return 2;
  return 1;
}

/**
 * 포획 유닛 tier별 플레이 기준 스탯. 원본 도감 HP(보스 1200·미니보스 520 등)를 그대로 쓰면
 * 포획 보스가 만렙 크리처를 2~3배 압도해 밸런스가 붕괴하므로, tier 기반 기준치로 정규화한다.
 */
// 역할 분리: 포획 적은 '전선 바디'다 — 크리처(캐스터)보다 확연히 단단하게. tank/normal/elite HP를 크게 올려
// 원정대의 벽·속도방지턱 역할을 확실히 하고, 얕은 스킬 대신 맷집+tier 패시브로 값을 한다.
const PLAY_BASE_HP: Record<EnemyTier, number> = { swarm: 52, flyer: 48, normal: 88, tank: 155, healer: 78, elite: 135, miniboss: 210, boss: 270 };
// 포획체가 원정대 슬롯값을 하도록 상위 tier 공격력 상향(포획=핵심 루프). 미니보스/보스는 포획의 정점이라 트로피값을 준다.
const PLAY_BASE_ATK: Record<EnemyTier, number> = { swarm: 9, flyer: 9, normal: 11, tank: 11, healer: 7, elite: 17, miniboss: 26, boss: 34 };

/** 포획 enemy 유닛 파생 스탯 — tier 기준 스탯 × 레벨/유대 성장(도감 원본 HP 미사용). */
function deriveEnemyStats(unit: OwnedUnit): DerivedStats {
  const def = ENEMIES[unit.species ?? ''] ?? ENEMIES.slime;
  const lv = 1 + (unit.level - 1) * LEVEL_GROWTH_PER;
  const bond = Math.min(BOND_CAP, unit.bond ?? 0);
  const growth = lv * (1 + bond);
  const c = critFor(unit.level, unit.stage);
  const ie = itemEffectOf(unit);
  const stageFloor = 1 + STAGE_HP_FLOOR_PER * state.stageIndex; // 스테이지 진행에 따른 생존 바닥
  return {
    hp: Math.round(PLAY_BASE_HP[def.tier] * growth * stageFloor),
    attack: Math.round(PLAY_BASE_ATK[def.tier] * growth * state.unitAtkMult * (1 + (ie.atkMult ?? 0))),
    range: UNIT_BASE.range + (def.flying ? 0.6 : 0) + (unit.stage - 1) * 0.4 + (unit.level - 1) * 0.015 + state.rangeBonus + (ie.range ?? 0),
    // 크리처와 동일하게 진화 단계(stage) 공속 보너스를 부여 — 누락 시 포획체가 상시 열세.
    attackSpeed: UNIT_BASE.attackSpeed + (unit.stage - 1) * 0.15 + (unit.level - 1) * 0.008 + state.aspdBonus + (ie.aspd ?? 0),
    critChance: Math.min(0.6, c.critChance + state.critChanceBonus + (ie.critChance ?? 0)),
    critDmg: c.critDmg + state.critDmgBonus + (ie.critDmg ?? 0),
    bond,
  };
}

/** 유닛 파생 스탯 (§14). 대기만성 보정 반영. */
export function deriveStats(unit: OwnedUnit): DerivedStats {
  if (unit.kind === 'enemy') return deriveEnemyStats(unit);
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
  const lv = 1 + (unit.level - 1) * LEVEL_GROWTH_PER;
  const bond = Math.min(BOND_CAP, unit.bond ?? 0);
  const growth = lv * (1 + bond);
  const c = critFor(unit.level, unit.stage);
  const ie = itemEffectOf(unit);
  const stageFloor = 1 + STAGE_HP_FLOOR_PER * state.stageIndex; // 스테이지 진행에 따른 생존 바닥
  return {
    hp: Math.round(hp * growth * stageFloor),
    attack: Math.round(attack * growth * state.unitAtkMult * (1 + (ie.atkMult ?? 0))),
    range: UNIT_BASE.range + (unit.stage - 1) * 0.6 + (unit.level - 1) * 0.015 + state.rangeBonus + (ie.range ?? 0),
    attackSpeed: UNIT_BASE.attackSpeed + (unit.stage - 1) * 0.15 + (unit.level - 1) * 0.008 + state.aspdBonus + (ie.aspd ?? 0),
    critChance: Math.min(0.6, c.critChance + state.critChanceBonus + (ie.critChance ?? 0)),
    critDmg: c.critDmg + state.critDmgBonus + (ie.critDmg ?? 0),
    bond,
  };
}

export function unitName(unit: OwnedUnit): string {
  if (unit.kind === 'enemy') return ENEMIES[unit.species ?? '']?.name ?? '???';
  return MONSTERS[unit.element].stages[unit.stage - 1].name;
}

/** 표기 이름: 사용자 지정 닉네임 우선, 없으면 단계 기본 이름. */
export function displayName(unit: OwnedUnit): string {
  return unit.nickname?.trim() ? unit.nickname.trim() : unitName(unit);
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

  // 배치 (creature + 포획 enemy 합쳐 최대 MAX_MONSTERS)
  placementCap = MAX_MONSTERS;

  // 마나 상한 (런타임 마나는 DeckSystem이 스테이지 단위로 관리)
  manaMax = MANA_MAX;

  // 스탯 수정자 (웨이브 보너스 버프 — 5스탯)
  unitAtkMult = 1;
  rangeBonus = 0;
  aspdBonus = 0;
  critChanceBonus = 0;
  critDmgBonus = 0;
  manaRegenMult = 1;
  /** 어둠 3단 처치 스택 (§5.4) — 런 내 영구 누적, 공격력 +비율 (상한 DARK_KILL_STACK_MAX) */
  darkKillStacks = 0;

  /** 포획 도감/카운트: 적 species id → 누적 포획 수 (중복 포획 = XP 가속 재료). */
  captured: Record<string, number> = {};

  /**
   * 모험 지도 트랙: 스테이지 사이 갭(0..N-2)마다의 특수 노드 종류(상점/사건/야영).
   * 런 시작 시 1회 생성·저장(재현 안정). 인덱스 g = 스테이지 g와 g+1 사이.
   */
  gapSpecials: SpecialKind[] = [];
  /** 직전 스테이지 클리어 후 아직 방문하지 않은 특수 노드가 있는가(그 노드가 현재 위치). */
  specialPending = false;

  reset(): void {
    Object.assign(this, new GameState());
    this.heroEquipped = this.defaultEquip('hero', 1);
  }

  // ── 덱(학습/장착) 모델 ─────────────────────────────
  /**
   * 캐릭터가 해당 레벨에서 사용 가능한(학습한) 카드 id 목록. 버린 카드는 제외.
   */
  learnedIdsFor(character: DeckCharacter, level: number, discarded: string[] = []): string[] {
    return cardsOfCharacter(character)
      .filter((c) => c.learnLevel <= level && !discarded.includes(c.id))
      .map((c) => c.id);
  }

  /** 기본 장착: 학습한 것 중 **가장 최신(고레벨) EQUIP_CAP개** — 강한 카드가 실제로 장착되도록. */
  private defaultEquip(character: DeckCharacter, level: number): string[] {
    return this.learnedIdsFor(character, level).slice(-EQUIP_CAP);
  }

  private enemyCardScore(card: CardDef, tier: EnemyTier): number {
    let score = card.learnLevel * 2 - card.cost * 0.15;
    const kind = card.effect.kind;
    if (tier === 'swarm' || tier === 'flyer') {
      if (card.cost <= 2) score += 4;
      if (kind === 'chain' || kind === 'damage') score += 3;
      if (kind === 'markArea') score += 2;
    } else if (tier === 'tank') {
      if (kind === 'zone' || kind === 'defDown' || kind === 'markArea') score += 4;
      if (kind === 'damage' && card.cost >= 2) score += 1.5;
    } else if (tier === 'healer') {
      if (kind === 'blessOne' || kind === 'blessAll' || kind === 'healUnits' || kind === 'shieldUnits' || kind === 'reviveUnit' || kind === 'drain') score += 5;
      if (kind === 'markArea' || kind === 'defDown') score += 1.5;
    } else if (tier === 'elite' || tier === 'miniboss' || tier === 'boss') {
      if (kind === 'damage' || kind === 'drain') score += 4;
      if (card.cost >= 3) score += 2;
      if (card.effect.kind === 'zone') score += 1.5;
    } else {
      if (kind === 'damage' || kind === 'zone' || kind === 'markArea') score += 2;
    }
    return score;
  }

  private defaultEnemyEquip(element: Element, tier: EnemyTier, level: number): string[] {
    return cardsOfCharacter(`e_${element}` as DeckCharacter)
      .filter((c) => c.learnLevel <= level)
      .sort((a, b) => this.enemyCardScore(b, tier) - this.enemyCardScore(a, tier) || a.learnLevel - b.learnLevel)
      .slice(0, EQUIP_CAP)
      .sort((a, b) => a.learnLevel - b.learnLevel || a.cost - b.cost)
      .map((c) => c.id);
  }

  /** 전투 덱 = 성(무색) + 로스터 각자의 장착 카드 (총 최대 4×5=20장, §6) */
  battleDeck(): string[] {
    return [...this.heroEquipped, ...this.roster.flatMap((u) => u.equipped)];
  }

  // 캐릭터 관리(holder = 'hero' | uid)
  holderCharacter(id: string): DeckCharacter {
    if (id === 'hero') return 'hero';
    const u = this.roster.find((x) => x.uid === id);
    if (!u) return 'hero';
    // 포획 적은 속성별 공용 풀(e_속성), 크리처는 고유 속성 풀.
    return u.kind === 'enemy' ? (`e_${u.element}` as DeckCharacter) : u.element;
  }
  holderLevel(id: string): number {
    return id === 'hero' ? 1 : (this.roster.find((u) => u.uid === id)?.level ?? 1);
  }
  equippedOf(id: string): string[] {
    return id === 'hero' ? this.heroEquipped : (this.roster.find((u) => u.uid === id)?.equipped ?? []);
  }
  holderDiscarded(id: string): string[] {
    return id === 'hero' ? [] : (this.roster.find((u) => u.uid === id)?.discarded ?? []);
  }
  setEquipped(id: string, ids: string[]): void {
    const learned = this.learnedIdsFor(this.holderCharacter(id), this.holderLevel(id), this.holderDiscarded(id));
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

  /** 같은 속성의 '크리처'를 이미 보유했는가 (드래프트/야생 크리처는 속성당 1마리). */
  hasCreatureElement(element: Element): boolean {
    return this.roster.some((u) => u.kind === 'creature' && u.element === element);
  }

  /** 로스터 합류 (드래프트/야생 크리처 합류). level에 맞는 진화 단계로 시작. */
  giveUnit(element: Element, level = 1): OwnedUnit | null {
    // 같은 속성 '크리처'만 중복 차단 — 같은 속성의 포획 적이 있어도 야생 크리처는 합류 가능(버그 수정).
    if (this.hasCreatureElement(element) || this.monstersFull) return null;
    const stage = stageForLevel(element, level);
    const unit: OwnedUnit = { uid: nextUid(), kind: 'creature', element, level, stage, xp: 0, equipped: [], discarded: [], bond: 0 };
    unit.equipped = this.defaultEquip(element, level);
    this.roster.push(unit);
    unlockCreature(element, 1); // 도감: 소유 크리처 해금
    if (stage > 1) unlockCreature(element, stage);
    return unit;
  }

  /**
   * 포획 enemy를 로스터에 편입 (배치·전투 가능). 가득이면 null(도감만 등록).
   * enemy 유닛은 아직 스킬 카드가 없고 자동 공격만 한다(스킬 풀은 후속). 항상 1단·레벨1 시작.
   */
  giveEnemyUnit(speciesId: string, startLevel = 1): OwnedUnit | null {
    const def = ENEMIES[speciesId];
    if (!def || this.monstersFull) return null;
    // 진행도에 맞춰 시작 레벨 부여 → 즉전력. 진화 레벨 이상이면 진화형으로 합류.
    let sp = speciesId;
    let stage: 1 | 2 | 3 = 1;
    if (def.evolvesTo && startLevel >= ENEMY_EVOLVE_LEVEL && ENEMIES[def.evolvesTo]) { sp = def.evolvesTo; stage = 2; }
    const el = asElement(ENEMIES[sp].element);
    const unit: OwnedUnit = {
      uid: nextUid(), kind: 'enemy', species: sp, element: el,
      level: startLevel, stage, xp: 0, equipped: [], discarded: [], bond: 0,
    };
    unit.equipped = this.defaultEnemyEquip(el, ENEMIES[sp].tier, startLevel);
    this.roster.push(unit);
    return unit;
  }

  /** 한 유닛에 중복 포획 보너스(XP/유대) 지급 후 성장 결과 반환. 진화 시 각성 시그니처 포함. */
  private applyDuplicateBonus(unit: OwnedUnit): { from: string; to: string; evolved: boolean; gains: CardGain[]; bondGain: number } {
    const from = unitName(unit);
    const beforeBond = unit.bond ?? 0;
    unit.bond = Math.min(BOND_CAP, beforeBond + CAPTURE.duplicateBond);
    const result = this.addUnitXp(unit, CAPTURE.duplicateXp);
    // 중복 포획 흡수로 진화하면 스테이지 클리어 진화와 동일하게 각성 시그니처를 부여(누락 버그 수정).
    if (result.evolved) {
      const key = this.evolveKeySkill(unit);
      if (key && !result.gains.some((g) => g.cardId === key)) result.gains.push({ uid: unit.uid, cardId: key });
    }
    return { from, to: unitName(unit), evolved: result.evolved, gains: result.gains, bondGain: unit.bond - beforeBond };
  }

  /** 중복 포획 보너스를 primary 외 원정대 전원에게도 지급. 성장(레벨업/진화/스킬)한 동료 목록 반환. */
  private spreadDuplicateBonus(primary: OwnedUnit): GrownInfo[] {
    const out: GrownInfo[] = [];
    for (const u of this.roster) {
      if (u.uid === primary.uid) continue;
      const beforeLevel = u.level;
      const r = this.applyDuplicateBonus(u);
      if (r.evolved || r.gains.length || u.level > beforeLevel) {
        out.push({ uid: u.uid, from: r.from, to: r.to, element: u.element, evolved: r.evolved, gains: r.gains });
      }
    }
    return out;
  }

  absorbCapturedEnemy(speciesId: string): { unit: OwnedUnit; from: string; to: string; evolved: boolean; gains: CardGain[]; xp: number; bondGain: number; others: GrownInfo[] } | null {
    const captured = ENEMIES[speciesId];
    if (!captured) return null;
    const unit = this.roster.find((u) => {
      if (u.kind !== 'enemy' || !u.species) return false;
      const owned = ENEMIES[u.species];
      return u.species === speciesId || captured.evolvesTo === u.species || owned?.evolvesTo === speciesId;
    });
    if (!unit) return null;
    const r = this.applyDuplicateBonus(unit);
    // 동일 캐릭터 중복 포획 시 매칭 유닛뿐 아니라 원정대 전원에게 보너스 지급.
    const others = this.spreadDuplicateBonus(unit);
    return { unit, from: r.from, to: r.to, evolved: r.evolved, gains: r.gains, xp: CAPTURE.duplicateXp, bondGain: r.bondGain, others };
  }

  /** 야생 크리처(같은 속성 보유) 중복 포획 흡수 — 해당 크리처에 XP/유대 강화(별도 유닛 미생성). */
  absorbCreatureDuplicate(element: Element): { unit: OwnedUnit; from: string; to: string; evolved: boolean; gains: CardGain[]; xp: number; bondGain: number; others: GrownInfo[] } | null {
    const unit = this.roster.find((u) => u.kind === 'creature' && u.element === element);
    if (!unit) return null;
    const r = this.applyDuplicateBonus(unit);
    const others = this.spreadDuplicateBonus(unit);
    return { unit, from: r.from, to: r.to, evolved: r.evolved, gains: r.gains, xp: CAPTURE.duplicateXp, bondGain: r.bondGain, others };
  }

  /** 스테이지 클리어 시 보유 유닛의 유대 누적(상한 BOND_CAP). 뚝심 육성 보상(§14). */
  growBond(): void {
    for (const u of this.roster) u.bond = Math.min(BOND_CAP, (u.bond ?? 0) + BOND_PER_STAGE);
  }

  /** 진화 각성 시 배우는 핵심 스킬 (진화 단계별 시그니처). [2단, 3단]. */
  private static readonly CREATURE_KEY: Record<Element, [string, string]> = {
    water: ['water_tide', 'water_iron'],
    fire: ['fire_zone', 'fire_nova'],
    grass: ['grass_bush', 'grass_spore'],
    dark: ['dark_burst', 'dark_verdict'],
    light: ['light_smite', 'light_sunfire'],
  };
  // 역할 분리: 포획 적 2단 각성 = 전선 바디의 시그니처(값싼 자가 강화/보호/흡수). 크리처처럼 광역 폭격 주문이 아님.
  private static readonly ENEMY_KEY: Record<Element, string> = {
    fire: 'e_fire_rage', water: 'e_water_bulwark', grass: 'e_grass_regen', light: 'e_light_aegis', dark: 'e_dark_leech',
  };
  /** 방금 진화한 유닛이 각성으로 배울 핵심 스킬 id. 없으면 null. */
  evolveKeySkill(unit: OwnedUnit): string | null {
    if (unit.kind === 'enemy') return unit.stage === 2 ? GameState.ENEMY_KEY[unit.element] : null;
    const pair = GameState.CREATURE_KEY[unit.element];
    return unit.stage >= 3 ? pair[1] : unit.stage === 2 ? pair[0] : null;
  }

  // ── 드래프트(v4): 스테이지 1 시작 시 1회 3택1 (이후 캐릭터는 포획으로만) ──
  /** 스테이지 1 시작 시 아직 스타터를 안 뽑았으면 드래프트. */
  get needsDraft(): boolean {
    return this.stageIndex === 0 && this.roster.length === 0;
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

  /**
   * 유닛 경험치 지급 → 레벨업/진화/스킬 학습.
   * 새로 배운 카드는 자동 장착하지 않고 gains로 반환 — Game이 획득 연출/교체 선택 큐로 처리.
   */
  addUnitXp(unit: OwnedUnit, amount: number): { leveled: boolean; evolved: boolean; gains: CardGain[] } {
    unit.xp += amount;
    let leveled = false;
    let evolved = false;
    const gains: CardGain[] = [];
    const cap = maxLevelFor(unit.kind); // 크리처 30 / 에너미 25
    while (unit.level < cap && unit.xp >= xpForLevel(unit.level)) {
      unit.xp -= xpForLevel(unit.level);
      unit.level++;
      leveled = true;
      // enemy: 쌍 라인은 2단 진화(모델·스탯·속성 교체), 단독/보스체는 무진화.
      if (unit.kind === 'enemy') {
        const edef = ENEMIES[unit.species ?? ''];
        if (edef?.evolvesTo && unit.stage < 2 && unit.level >= ENEMY_EVOLVE_LEVEL) {
          const evo = ENEMIES[edef.evolvesTo];
          if (evo) {
            unit.species = edef.evolvesTo;
            unit.stage = 2;
            unit.element = asElement(evo.element);
            evolved = true;
          }
        }
        // 속성별 공용 풀에서 이번 레벨 스킬 학습
        for (const c of cardsOfCharacter(`e_${unit.element}` as DeckCharacter)) {
          if (c.learnLevel === unit.level) gains.push({ uid: unit.uid, cardId: c.id });
        }
        continue;
      }
      const newStage = stageForLevel(unit.element, unit.level);
      if (newStage > unit.stage) { unit.stage = newStage; evolved = true; unlockCreature(unit.element, newStage); }
      // 이번 레벨에서 새로 학습하는 스킬
      for (const c of cardsOfCharacter(unit.element)) {
        if (c.learnLevel === unit.level) gains.push({ uid: unit.uid, cardId: c.id });
      }
    }
    if (unit.level >= cap) unit.xp = 0; // 만렙: XP 바 오버플로 방지
    return { leveled, evolved, gains };
  }

  /**
   * 카드 획득 처리 (항상 캐릭터당 EQUIP_CAP장 유지).
   * 자리가 있으면 즉시 장착('added'), 가득이면 교체 선택 필요('replace') — 후보 = 오래된 3장 + 신규.
   */
  acquireCard(uid: string, cardId: string): { result: 'added' | 'replace' | 'skip'; options?: string[] } {
    const u = this.roster.find((x) => x.uid === uid);
    if (!u || u.equipped.includes(cardId) || u.discarded.includes(cardId)) return { result: 'skip' };
    if (u.equipped.length < EQUIP_CAP) {
      u.equipped.push(cardId);
      return { result: 'added' };
    }
    return { result: 'replace', options: [...u.equipped.slice(0, 3), cardId] };
  }

  /**
   * 교체 선택 확정: discardId를 버린다. 신규 카드를 버리면 장착 불변,
   * 기존 카드를 버리면 신규 카드가 그 자리에 들어간다(항상 5장 유지).
   */
  resolveCardReplace(uid: string, newId: string, discardId: string): void {
    const u = this.roster.find((x) => x.uid === uid);
    if (!u) return;
    u.discarded.push(discardId);
    if (discardId !== newId) {
      u.equipped = u.equipped.filter((id) => id !== discardId);
      u.equipped.push(newId);
    }
  }

  /** 닉네임 설정 (뷰어에서 편집). 공백/초과 길이는 정리, 빈 값이면 기본 이름 복귀. */
  setNickname(uid: string, name: string): void {
    const u = this.roster.find((x) => x.uid === uid);
    if (!u) return;
    const clean = name.trim().slice(0, 8);
    u.nickname = clean.length ? clean : undefined;
  }

  /** 포획 등록 (도감 + 중복 카운트). 반환: 처음 잡은 종이면 firstTime, 누적 count. */
  registerCapture(speciesId: string): { firstTime: boolean; count: number } {
    const prev = this.captured[speciesId] ?? 0;
    this.captured[speciesId] = prev + 1;
    return { firstTime: prev === 0, count: prev + 1 };
  }

  /** 포획한 고유 종 수 (도감 진척). */
  get capturedCount(): number {
    return Object.keys(this.captured).length;
  }

  applyBuff(apply: string): void {
    switch (apply) {
      case 'atk': this.unitAtkMult *= 1.12; break;
      case 'range': this.rangeBonus += 0.6; break;
      case 'aspd': this.aspdBonus += 0.12; break;
      case 'crit': this.critChanceBonus += 0.06; break;
      case 'critdmg': this.critDmgBonus += 0.25; break;
      // 도박 이벤트(피의 계약): 전 유닛 공격력 영구 +18%.
      case 'pact_atk': this.unitAtkMult *= 1.18; break;
      // 하위호환 (구버전 노드/세이브)
      case 'atk10': this.unitAtkMult *= 1.1; break;
      case 'basehp20': this.baseHpMax += 20; this.baseHp += 20; break;
      case 'mana20': this.manaRegenMult *= 1.2; break;
    }
  }

  heal(amount: number): void {
    this.baseHp = Math.min(this.baseHpMax, this.baseHp + amount);
  }

  /** 골드 차감(상점). 잔액 부족이면 false, 성공 시 차감 후 true. */
  spendGold(cost: number): boolean {
    if (this.gold < cost) return false;
    this.gold -= cost;
    return true;
  }

  /** 도구 장착(상점). 기존 도구는 교체. 반환: 교체된 이전 도구 이름(없으면 null). */
  giveItem(uid: string, itemId: string): string | null {
    const u = this.roster.find((x) => x.uid === uid);
    if (!u) return null;
    const prev = u.item ? (ITEM_BY_ID[u.item]?.name ?? null) : null;
    u.item = itemId;
    return prev;
  }

  get manaRegen(): number {
    return MANA_REGEN * this.manaRegenMult;
  }

  cardName(id: string): string {
    return CARD_BY_ID[id]?.name ?? id;
  }
}

export const state = new GameState();
