import * as THREE from 'three';
import type { Scene } from '../render/Scene';
import { type GameState, type OwnedUnit, displayName, deriveStats, unitName } from '../core/GameState';
import type { StageDef } from '../data/stages';
import type { Element, ElementOrNeutral, MarkType, Vec2 } from '../core/types';
import { ENEMIES, creatureEnemyId } from '../data/enemies';
import { MONSTERS } from '../data/monsters';
import { makeCreature, makeEnemy, disposeCreatureView } from '../render/fallback';
import { unitHeight, CAPTURED_BOSS_SCALE, setStageLayout } from '../data/constants';
import { CARD_BY_ID, type CardEffect, type CardElement } from '../data/cards';
import {
  UNIT_SLOTS,
  BASE_LEAK_NORMAL,
  BASE_LEAK_MINIBOSS,
  BASE_LEAK_BOSS,
  SIEGE,
  ENEMY_ATTACK,
  BURN_DPS_PER_STACK,
  REACTION,
  ELEMENTS,
  HERO,
  DARK_KILL_STACK,
  DARK_KILL_STACK_MAX,
  ELEMENT_COLOR,
  NEUTRAL_COLOR,
  GRASS_MANA_REGEN,
  BASE_HEAL_CD,
  CAPTURE,
  CAPTURE_CARD_ID,
  CAPTURE_RADIUS,
  XP_REWARD,
  GOLD_REWARD,
  goldStageMult,
  HAND_SIZE,
  AUTO_DRAW_INTERVAL,
  MAX_MONSTERS,
} from '../data/constants';
import { CaptureOrb } from '../entities/CaptureOrb';
import { Enemy } from '../entities/Enemy';
import { Monster } from '../entities/Monster';
import { Projectile } from '../entities/Projectile';
import { GroundZone, type ZoneKind } from '../entities/GroundZone';
import { affinity } from './affinity';
import { findReaction, type Reaction } from './reactions';
import { DeckSystem } from './DeckSystem';
import { bus } from '../core/events';
import { playSfx } from '../audio/Sfx';
import { unlockEnemy } from '../core/Dex';

type Phase = 'placement' | 'wave' | 'stageClear' | 'lost' | 'won';
interface SpawnEvent { t: number; enemy: string }
interface GrowthEvent { uid: string; from: string; to: string; element: Element; evolved: boolean; gains: { uid: string; cardId: string }[] }

const colorOf = (el: ElementOrNeutral): number => (el === 'neutral' ? NEUTRAL_COLOR : ELEMENT_COLOR[el]);

export class Battle {
  phase: Phase = 'placement';
  units: Monster[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  zones: GroundZone[] = [];
  captureOrbs: CaptureOrb[] = [];
  deck: DeckSystem;

  waveIndex = 0;
  private waveClock = 0;
  /** 현재 웨이브의 덱 스냅샷 — 웨이브 도중 포획한 유닛 카드는 다음 웨이브부터 반영(즉시 유입 방지). */
  private waveDeck: string[] = [];
  private spawnQueue: SpawnEvent[] = [];
  private healTimer = 0;
  private hasDarkS3 = false;
  private time = 0;
  private castleCd = 0;
  private atkSfxAt = -1; // 평타 효과음 스로틀
  /** 이번 웨이브에 쓰러진(필드 이탈) 유닛 uid — 다음 배치 페이즈에 부활 재배치. */
  private downedUids = new Set<string>();
  /** 연속 처치 콤보 (2.2초 윈도우). 5의 배수마다 골드 보너스 + 화려한 표시. */
  private combo = 0;
  private comboTimer = 0;
  private unitGhost: THREE.Group | null = null; // 배치 드래그 반투명 미리보기 모델
  private growthEvents: GrowthEvent[] = [];
  private autoDrawTimer = 0;

  constructor(private scene: Scene, private state: GameState, public stage: StageDef, private hpScale: number, private atkScale = 1, skipAutoPlace = false) {
    setStageLayout(stage.id - 1); // 스테이지별 경로/슬롯 적용 (FIELD.path·UNIT_SLOTS 인플레이스 교체)
    scene.setStage(stage.id, stage.theme); // 스테이지 고유 팔레트/장식 밀도
    scene.rebuildMap();
    this.deck = new DeckSystem(state.manaMax, state.manaRegen);
    this.state.placementCap = MAX_MONSTERS;
    // 튜토리얼 첫 전투에선 자동 배치를 건너뛴다 — "배치하라"는 안내와 실제 상태가 어긋나지 않게(직접 배치 유도).
    if (!skipAutoPlace) this.autoPlace();
    this.hasDarkS3 = state.roster.some((u) => u.element === 'dark' && u.stage >= 3);
    bus.emit('stage:start', { stage: stage.id });
  }

  private castleXZ(): Vec2 {
    return { x: this.scene.base.position.x, z: this.scene.base.position.z };
  }

  private slotFree(slot: number): boolean {
    return !this.units.some((m) => m.slot === slot);
  }

  private firstFreeSlot(): number {
    for (let i = 0; i < UNIT_SLOTS.length; i++) if (this.slotFree(i)) return i;
    return -1;
  }

  private placementLimit(): number {
    return Math.min(MAX_MONSTERS, this.state.placementCap, UNIT_SLOTS.length);
  }

  private syncPlacement(): void {
    const allowed = new Set(this.state.roster.slice(0, MAX_MONSTERS).map((u) => u.uid));
    const seenSlots = new Set<number>();
    const seenUnits = new Set<string>();
    for (let i = this.units.length - 1; i >= 0; i--) {
      const m = this.units[i];
      const invalid =
        !allowed.has(m.unit.uid) ||
        m.slot < 0 ||
        m.slot >= UNIT_SLOTS.length ||
        seenSlots.has(m.slot) ||
        seenUnits.has(m.unit.uid) ||
        i >= this.placementLimit();
      if (invalid) {
        m.dispose(this.scene.entities);
        this.units.splice(i, 1);
        continue;
      }
      seenSlots.add(m.slot);
      seenUnits.add(m.unit.uid);
    }
  }

  private autoPlace(): void {
    this.syncPlacement();
    const sorted = [...this.state.roster].sort((a, b) => b.stage - a.stage || b.level - a.level);
    for (const u of sorted.slice(0, this.placementLimit())) {
      const slot = this.firstFreeSlot();
      if (slot >= 0) this.placeUnit(u, slot);
    }
  }

  placeUnit(unit: OwnedUnit, slot: number): boolean {
    this.syncPlacement();
    if (slot < 0 || slot >= UNIT_SLOTS.length || !this.slotFree(slot)) return false;
    if (this.units.some((m) => m.unit.uid === unit.uid)) return false;
    if (this.units.length >= this.placementLimit()) return false;
    const s = UNIT_SLOTS[slot];
    const m = new Monster(unit, slot, s.x, s.z, this.state.unitAtkMult);
    this.units.push(m);
    this.scene.entities.add(m.view);
    bus.emit('unit:placed', { uid: unit.uid, slot });
    return true;
  }

  removeUnit(slot: number): void {
    const i = this.units.findIndex((m) => m.slot === slot);
    if (i >= 0) {
      this.units[i].dispose(this.scene.entities);
      this.units.splice(i, 1);
    }
  }

  removeUnitByUid(uid: string): void {
    const i = this.units.findIndex((m) => m.unit.uid === uid);
    if (i >= 0) {
      this.units[i].dispose(this.scene.entities);
      this.units.splice(i, 1);
    }
  }

  /**
   * 포획 직후 로스터에 합류한 유닛을 빈 슬롯에 즉시 배치(전투 중 영입 가시화).
   * 슬롯이 없으면 로스터에만 남고 다음 배치 페이즈에서 배치. (전투 중이 아니어도 안전.)
   */
  deployCaptured(unit: OwnedUnit): void {
    this.syncPlacement();
    if (this.units.some((m) => m.unit.uid === unit.uid)) return;
    if (this.units.length >= this.placementLimit()) return;
    const slot = this.firstFreeSlot();
    if (slot >= 0) this.placeUnit(unit, slot);
  }

  placeablesState(): { id: string; name: string; element: ElementOrNeutral; placed: boolean; dead: boolean; kind: 'creature' | 'enemy'; species?: string; stage: 1 | 2 | 3; level: number; hp: number; maxHp: number; shield: number }[] {
    this.syncPlacement();
    return this.state.roster.map((u) => {
      const live = this.units.find((m) => m.unit.uid === u.uid);
      const down = this.downedUids.has(u.uid);
      // 배치된 유닛은 필드의 실시간 HP, 그 외(미배치·미다운)는 최대 HP. 다운은 HP 0.
      const maxHp = live ? Math.round(live.maxHp) : Math.round(deriveStats(u).hp);
      const hp = live ? Math.max(0, Math.round(live.hp)) : down ? 0 : maxHp;
      return {
        id: u.uid,
        name: displayName(u),
        element: u.element,
        placed: !!live,
        dead: down,
        kind: u.kind,
        species: u.species,
        stage: u.stage,
        level: u.level,
        hp,
        maxHp,
        shield: live ? Math.max(0, Math.round(live.shield)) : 0,
      };
    });
  }

  placeableRange(id: string): number {
    const live = this.units.find((m) => m.unit.uid === id);
    if (live) return live.stats.range;
    const unit = this.state.roster.find((u) => u.uid === id);
    return unit ? deriveStats(unit).range : 3;
  }

  togglePlace(id: string): void {
    if (this.phase !== 'placement') return;
    const placed = this.units.find((m) => m.unit.uid === id);
    if (placed) { this.removeUnit(placed.slot); return; }
    const unit = this.state.roster.find((u) => u.uid === id);
    if (!unit) return;
    if (this.units.length >= this.placementLimit()) {
      bus.emit('warn', { text: `유닛은 최대 ${this.placementLimit()}마리까지 배치할 수 있습니다.` });
      return;
    }
    const slot = this.firstFreeSlot();
    if (slot >= 0) this.placeUnit(unit, slot);
  }

  placeUnitAtNearest(id: string, x: number, z: number): boolean {
    if (this.phase !== 'placement') return false;
    const slot = this.nearestSlot(x, z);
    const placed = this.units.find((m) => m.unit.uid === id);
    if (placed) return this.moveUnitToSlot(placed, slot);
    const unit = this.state.roster.find((u) => u.uid === id);
    if (!unit) return false;
    if (this.units.length >= this.placementLimit()) {
      bus.emit('warn', { text: `유닛은 최대 ${this.placementLimit()}마리까지 배치할 수 있습니다.` });
      return false;
    }
    const occupant = this.units.find((m) => m.slot === slot);
    if (occupant) this.removeUnit(occupant.slot);
    return this.placeUnit(unit, slot);
  }

  slotOccupant(slot: number): Monster | undefined {
    return this.units.find((m) => m.slot === slot);
  }

  placedUnit(uid: string): Monster | null {
    return this.units.find((m) => m.unit.uid === uid) ?? null;
  }

  unitNear(x: number, z: number, maxDist: number): Monster | null {
    let best: Monster | null = null;
    let bd = maxDist * maxDist;
    for (const m of this.units) {
      const d = (m.pos.x - x) ** 2 + (m.pos.z - z) ** 2;
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  // ── 배치 드래그: 반투명 캐릭터 모델 미리보기 (직관적 배치) ──
  /** 드래그 중인 유닛의 반투명 모델을 필드에 생성(위치는 moveUnitGhost로). */
  showUnitGhost(id: string): void {
    this.hideUnitGhost();
    if (this.units.some((m) => m.unit.uid === id)) return;
    const u = this.state.roster.find((x) => x.uid === id);
    if (!u) return;
    let g: THREE.Group;
    if (u.kind === 'enemy') {
      const edef = ENEMIES[u.species ?? ''] ?? ENEMIES.slime;
      const bossy = edef.tier === 'boss' || edef.tier === 'miniboss';
      const h = unitHeight(u.stage) * (bossy ? CAPTURED_BOSS_SCALE : 1);
      g = edef.creatureStage
        ? makeCreature(edef.element as Element, h / 1.85, edef.creatureStage)
        : makeEnemy(edef.element, edef.radius, edef.flying, edef.model, 'idle', h);
    } else {
      g = makeCreature(u.element, unitHeight(u.stage) / 1.85, u.stage);
    }
    g.position.set(0, -200, 0); // 위치 지정 전엔 화면 밖
    this.ghostOpacity(g);
    this.scene.entities.add(g);
    this.unitGhost = g;
  }

  moveUnitGhost(x: number, z: number): void {
    if (!this.unitGhost) return;
    this.unitGhost.position.set(x, 0, z);
    this.ghostOpacity(this.unitGhost); // 모델 비동기 로드 후에도 반투명 유지
  }

  hideUnitGhost(): void {
    if (!this.unitGhost) return;
    this.scene.entities.remove(this.unitGhost);
    disposeCreatureView(this.unitGhost);
    this.unitGhost = null;
  }

  /** 그룹의 모든 메시를 반투명 처리(아웃라인은 숨김). */
  private ghostOpacity(g: THREE.Group): void {
    g.traverse((o) => {
      if (o.userData.outline) { o.visible = false; return; }
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) { m.transparent = true; m.opacity = 0.45; m.depthWrite = false; }
      }
    });
  }

  nearestSlot(x: number, z: number): number {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < UNIT_SLOTS.length; i++) {
      const s = UNIT_SLOTS[i];
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  moveUnitToSlot(m: Monster, toSlot: number): boolean {
    if (this.phase !== 'placement') { this.resnapUnit(m); return false; }
    if (toSlot < 0 || toSlot >= UNIT_SLOTS.length || m.slot === toSlot) { this.resnapUnit(m); return false; }
    const occupant = this.units.find((u) => u !== m && u.slot === toSlot);
    const fromSlot = m.slot;
    this.setUnitSlot(m, toSlot);
    if (occupant) this.setUnitSlot(occupant, fromSlot);
    return true;
  }

  resnapUnit(m: Monster): void {
    this.setUnitSlot(m, m.slot);
  }

  private setUnitSlot(m: Monster, slot: number): void {
    const s = UNIT_SLOTS[slot];
    m.slot = slot;
    m.pos.set(s.x, 0, s.z);
    m.view.position.x = s.x;
    m.view.position.z = s.z;
  }

  get totalWaves(): number {
    return this.stage.waves.length;
  }

  consumeGrowthEvents(): GrowthEvent[] {
    const out = this.growthEvents;
    this.growthEvents = [];
    return out;
  }

  /** 웨이브 보너스 버프 적용 후 배치된 유닛 스탯 즉시 갱신. */
  refreshUnitStats(): void {
    for (const m of this.units) m.refreshStats();
  }

  beginWave(): void {
    if (this.phase !== 'placement') return;
    this.waveDeck = this.state.battleDeck(); // 이번 웨이브 덱 고정 스냅샷
    // 원정대가 가득 차도 포획구는 계속 나온다(만석이면 던질 때 교체/놓아주기 모달로 처리).
    this.deck.drawHand(this.waveDeck, HAND_SIZE, [CAPTURE_CARD_ID]);
    this.phase = 'wave';
    this.waveClock = 0;
    this.autoDrawTimer = 0;
    this.spawnQueue = [];
    const groups = this.stage.waves[this.waveIndex] ?? [];
    for (const g of groups) {
      for (let k = 0; k < g.count; k++) this.spawnQueue.push({ t: k * g.interval, enemy: g.enemy });
    }
    // 야생 크리처는 희귀 등장: 미보유 속성만, 스테이지당 1마리(1웨이브에서만).
    // 5속성을 모두 보유하면 더는 등장하지 않는다.
    if (this.waveIndex === 0) {
      const owned = new Set(this.state.roster.filter((u) => u.kind === 'creature').map((u) => u.element));
      const unowned = ELEMENTS.filter((el) => !owned.has(el));
      if (unowned.length) {
        const creStage: 1 | 2 | 3 = this.stage.id <= 3 ? 1 : this.stage.id <= 8 ? 2 : 3;
        const creEl = unowned[this.stage.id % unowned.length];
        this.spawnQueue.push({ t: 2.5, enemy: creatureEnemyId(creEl, creStage) });
      }
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    playSfx('wave');
    bus.emit('wave:start', { stage: this.stage.id, wave: this.waveIndex + 1, total: this.totalWaves });
  }

  private spawn(ev: SpawnEvent): void {
    const def = ENEMIES[ev.enemy] ?? ENEMIES.slime;
    if (!def.creatureStage) unlockEnemy(def.id); // 도감: 조우한 적 해금(야생 크리처 변종 제외)
    const e = new Enemy(def, this.hpScale, this.atkScale);
    this.scene.entities.add(e.view);
    this.enemies.push(e);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    this.deck.bonusRegen = this.units.filter((m) => m.alive && m.element === 'grass').length * GRASS_MANA_REGEN;
    this.deck.regenMana(dt);
    this.deck.updateCooldowns(dt);
    this.updateAutoDraw(dt);
    this.refreshCaptureAccess();
    this.updateCastleAttack(dt);
    this.scene.setBaseHp(this.state.baseHp / this.state.baseHpMax);

    if (this.phase === 'wave') {
      this.waveClock += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveClock) this.spawn(this.spawnQueue.shift()!);
    }

    this.updateUnits(dt);
    this.updateEnemies(dt, this.time);
    this.updateProjectiles(dt);
    this.updateCaptureOrbs(dt);
    this.updateZones(dt, this.time);
    this.updateHealers(dt);
    this.scene.vfx.update(dt);

    if (this.state.baseHp <= 0 && this.phase !== 'lost' && this.phase !== 'won') {
      this.phase = 'lost';
      bus.emit('base:destroyed', {});
      bus.emit('run:lose', {});
      return;
    }
    if (this.phase === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) this.onWaveClear();
  }

  private refreshCaptureAccess(): void {
    if (this.phase !== 'wave') return;
    // 만석이어도 포획구를 회수해준다 — 던지면 교체/놓아주기 흐름으로 이어진다. (보스/미니는 포획 불가라 대상에서 제외)
    const hasTarget = this.enemies.some((e) => e.alive && !e.isBoss && !e.isMini);
    if (!hasTarget) return;
    if (this.deck.ensureInHand(CAPTURE_CARD_ID, this.waveDeck, HAND_SIZE)) {
      bus.emit('toast', { text: '포획구를 회수했습니다.', kind: 'info' });
    }
  }

  private updateAutoDraw(dt: number): void {
    if (this.phase !== 'wave') return;
    if (this.deck.hand.length >= HAND_SIZE) {
      this.autoDrawTimer = 0;
      return;
    }
    this.autoDrawTimer += dt;
    if (this.autoDrawTimer < AUTO_DRAW_INTERVAL) return;
    this.autoDrawTimer = 0;
    const before = this.deck.hand.length;
    this.deck.refillTo(this.waveDeck, Math.min(HAND_SIZE, before + 1));
    if (this.deck.hand.length > before) bus.emit('card:draw', {});
  }

  get autoDrawFrac(): number {
    if (this.phase !== 'wave' || this.deck.hand.length >= HAND_SIZE) return 0;
    return Math.max(0, Math.min(1, this.autoDrawTimer / AUTO_DRAW_INTERVAL));
  }

  private onWaveClear(): void {
    this.awardWaveXp();
    bus.emit('wave:clear', { stage: this.stage.id, wave: this.waveIndex + 1 });
    this.waveIndex++;
    if (this.waveIndex >= this.totalWaves) {
      // 스테이지 클리어: 다음 스테이지 Battle이 로스터를 풀피로 재생성하므로 회복·부활이 자동 이뤄진다.
      this.phase = this.stage.boss === 'final' ? 'won' : 'stageClear';
      if (this.stage.boss === 'final') bus.emit('run:win', {});
      else bus.emit('stage:clear', { stage: this.stage.id });
    } else {
      // 웨이브 사이: 회복·부활 없음 — HP와 다운 상태가 스테이지 내내 그대로 이어진다(웨이브 간 소모전).
      this.phase = 'placement';
    }
  }

  private updateUnits(dt: number): void {
    for (const m of this.units) {
      m.update(dt, this.time);
      const target = this.frontTargetInRange(m.pos.x, m.pos.z, m.stats.range, m.element === 'dark');
      const face = target ?? this.nearestEnemy(m.pos.x, m.pos.z);
      if (face) m.faceTowards(face.pos.x, face.pos.z);
      if (m.atkCd > 0 || !target) continue;
      m.atkCd = 1 / m.effAttackSpeed();
      this.fireUnitShot(m, target);
    }
  }

  private fireUnitShot(m: Monster, target: Enemy): void {
    const color = ELEMENT_COLOR[m.element];
    // 아군 평타 효과음 (여러 유닛 동시 발사 시 스로틀로 과다 재생 방지)
    if (this.time - this.atkSfxAt > 0.11) { playSfx('attack', { vary: 0.06 }); this.atkSfxAt = this.time; }
    let power = m.attackPower();
    if (m.element === 'dark' && this.hasDarkS3) power *= 1 + this.state.darkKillStacks;
    // 치명타 판정 (평타). 발사 시점 스탯 기준.
    const crit = Math.random() < m.stats.critChance;
    if (crit) power *= m.stats.critDmg;
    m.faceTowards(target.pos.x, target.pos.z);
    const stage = m.unit.stage;
    this.scene.vfx.burst(m.pos.x, m.pos.z, color, 5, 1.3, 1.3);
    const p = new Projectile(m.view.position, target, color, 15, false, (hit) => {
      if (!hit) return;
      const dealt = this.hitEnemy(hit, power, m.element, stage);
      this.applyCapturedAttackPassive(m, hit, power, stage);
      // 타격감: 명중 순간 임팩트 팝(코어 플래시 + 색 스파크 + 링). 치명타는 더 크고 흰 스파크.
      this.scene.vfx.impact(hit.pos.x, hit.pos.z, color, crit ? 1.5 : 0.85, crit);
      if (crit) this.scene.vfx.floatText(hit.pos.x, hit.pos.z + 0.5, `⚡${dealt}`, '#ff5a3c');
      if (m.element === 'fire') this.applyMark(hit, 'burn', 1, stage);
      else if (m.element === 'water') { this.applyMark(hit, 'wet', 1, stage); hit.knockback(0.4); }
      else if (m.element === 'dark') this.applyMark(hit, 'curse', 1, stage);
      else if (m.element === 'grass') this.applyMark(hit, 'overgrowth', 1, stage);
      else if (m.element === 'light') this.lightSupport(m);
    });
    this.projectiles.push(p);
    this.scene.entities.add(p.mesh);
  }

  private applyCapturedAttackPassive(m: Monster, hit: Enemy, power: number, stage: number): void {
    const tier = m.capturedTier();
    if (!tier) return;
    const color = ELEMENT_COLOR[m.element];
    if (tier === 'swarm') {
      if (Math.random() < 0.35) {
        this.hitEnemy(hit, power * 0.45, m.element, stage);
        this.scene.vfx.floatText(hit.pos.x, hit.pos.z, '추가타', '#f2ce6b');
      }
      return;
    }
    if (tier === 'flyer') {
      const extra = this.enemiesInRadius(hit.pos.x, hit.pos.z, 3.2).find((e) => e !== hit);
      if (extra) {
        this.hitEnemy(extra, power * 0.35, m.element, stage);
        this.scene.vfx.burst(extra.pos.x, extra.pos.z, color, 5, 1.6, 0.8);
      }
      return;
    }
    if (tier === 'tank') {
      hit.knockback(0.75);
      hit.applyRoot(0.35);
      this.scene.vfx.floatText(hit.pos.x, hit.pos.z, '저지', '#9fd8ff');
      return;
    }
    if (tier === 'healer') {
      // 기존 power*0.1은 성 205HP 기준 ~1HP로 노이즈 → *0.4로 상향해 힐러 포획이 실효를 갖게.
      this.repairBase(power * 0.4, 0xf2ce6b);
      if (Math.random() < 0.3) m.bless(1);
      return;
    }
    if (tier === 'elite' || tier === 'miniboss' || tier === 'boss') {
      const radius = tier === 'elite' ? 2.1 : tier === 'miniboss' ? 2.7 : 3.2;
      const splash = tier === 'elite' ? 0.28 : tier === 'miniboss' ? 0.38 : 0.46;
      for (const e of this.enemiesInRadius(hit.pos.x, hit.pos.z, radius)) {
        if (e !== hit) this.hitEnemy(e, power * splash, m.element, stage);
      }
      this.scene.vfx.ring(hit.pos.x, hit.pos.z, color, radius, 0.25);
    }
  }

  private lightSupport(m: Monster): void {
    this.repairBase(m.stats.attack * 0.18, 0xf2ce6b);
    if (Math.random() < 0.25) m.bless(1);
  }

  private updateEnemies(dt: number, t: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.zoneSlow = 0;
      if (!e.def.flying) {
        for (const z of this.zones) {
          if (!z.contains(e.pos.x, e.pos.z)) continue;
          e.zoneSlow = Math.max(e.zoneSlow, z.slow);
          if (z.root > 0) e.applyRoot(0.2);
          if (z.dps > 0) this.damageDot(e, z.dps * dt, z.element);
        }
      }
      if (e.reactionCd > 0) e.reactionCd -= dt;
      const burn = e.marks.stacks('burn');
      if (burn > 0) this.damageDot(e, burn * BURN_DPS_PER_STACK * dt, 'fire');
      // 덩굴(overgrowth)은 더 이상 DoT가 아니다 — 이동 속박(Enemy.speedMult/update의 주기적 뿌리)으로 작동.
      if (e.ignoreUnitTimer > 0) {
        e.ignoreUnitTimer -= dt;
        if (e.ignoreUnitTimer <= 0) {
          e.ignoreUnitUid = null;
          e.engageHits = 0;
        }
      }

      // 아군 유닛 교전: 일반 적이 사거리 내 아군을 만나면 진격을 멈추고 공격한다(보스/미니보스 제외).
      const foe = (!e.isBoss && !e.isMini && !e.stunned && !e.atBase && e.fearTimer <= 0)
        ? this.nearestUnitInRange(e, ENEMY_ATTACK.range) : null;
      e.engaging = !!foe;

      e.update(dt, t);
      if (e.justStunned) {
        // 보스/미니보스는 포획 불가 — HP0에서 즉사 대신 잠깐 기절(비틀거림) 연출만 남기고 소멸한다.
        e.justStunned = false;
        bus.emit('toast', { text: `⚡ ${e.def.name}이(가) 쓰러집니다!`, kind: 'good' });
        this.scene.vfx.ring(e.pos.x, e.pos.z, 0xf2ce6b, 3.5, 0.5);
      }
      if (foe && e.alive) {
        e.unitAtkCd -= dt;
        if (e.unitAtkCd <= 0) {
          e.unitAtkCd = ENEMY_ATTACK.interval;
          this.enemyStrikeUnit(e, foe);
        }
      }
      if (e.reachedBase) {
        // 일반 적은 atBase 공성으로 전환하므로 여기엔 보스/미니보스만 도달한다. 기존 루프백 유지.
        this.leak(e);
        if (e.isBoss || e.isMini) {
          e.resetToPathStart();
          bus.emit('toast', { text: `${e.def.name}이 성을 타격하고 다시 진격합니다.`, kind: 'bad' });
          continue;
        }
        this.despawn(i);
        continue;
      }
      if (e.atBase && e.alive) {
        // 성문 공성: 제자리에서 자기 attack 값으로 성을 주기 타격(첫 타는 도달 즉시). 처치해야 멈춘다.
        e.siegeTimer -= dt;
        if (e.siegeTimer <= 0) {
          e.siegeTimer = SIEGE.interval;
          e.playAttackAnim();
          this.siegeStrike(e);
        }
      }
      if (!e.alive) {
        if (!e.dying) {
          this.onKill(e);
          const dur = e.beginDeath();
          if (dur > 0) { e.dying = true; e.deathTimer = Math.min(dur, 1.0); }
          else { this.despawn(i); continue; }
        }
        e.deathTimer -= dt;
        const mx = e.view.userData.mixer as THREE.AnimationMixer | undefined;
        if (mx) mx.update(dt);
        if (e.deathTimer <= 0) this.despawn(i);
      }
    }
  }

  private updateHealers(dt: number): void {
    this.healTimer -= dt;
    if (this.healTimer > 0) return;
    this.healTimer = 1;
    const healers = this.enemies.filter((e) => e.def.healer && e.alive);
    if (!healers.length) return;
    for (const e of this.enemies) {
      // 힐러/보스/미니보스는 회복 대상 제외 — 미니보스가 계속 회복돼 포획 기절창을 못 여는 버그 방지.
      if (!e.alive || e.def.healer || e.isBoss || e.isMini) continue;
      if (healers.some((h) => e.pos.distanceTo(h.pos) < 5)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04);
    }
  }

  /** 적 사거리 내 가장 가까운 살아있는 아군 유닛. */
  private nearestUnitInRange(e: Enemy, range: number): Monster | null {
    let best: Monster | null = null;
    let bd = range * range;
    for (const m of this.units) {
      if (!m.alive) continue;
      if (e.ignoreUnitTimer > 0 && e.ignoreUnitUid === m.unit.uid) continue;
      const d = (m.pos.x - e.pos.x) ** 2 + (m.pos.z - e.pos.z) ** 2;
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  /** 적 → 아군 유닛 타격: 붉은 피격 숫자·플래시로 "맞고 있다"를 확실히 전달. 0이면 다운. */
  private enemyStrikeUnit(e: Enemy, m: Monster): void {
    e.playAttackAnim();
    e.view.rotation.y = Math.atan2(m.pos.x - e.pos.x, m.pos.z - e.pos.z);
    const dealt = m.takeDamage(e.attack);
    playSfx('hit', { vary: 0.08 });
    this.scene.vfx.floatText(m.pos.x, m.pos.z + 0.4, `-${dealt}`, '#ff6a6a');
    this.scene.vfx.burst(m.pos.x, m.pos.z, 0xff5a4a, 7, 2.0, 0.9);
    this.scene.vfx.ring(m.pos.x, m.pos.z, 0xd23b3b, 1.2, 0.2);
    this.scene.vfx.ring(e.pos.x, e.pos.z, 0xff8a4a, 0.8, 0.14);
    if (!m.alive) {
      e.engageHits = 0;
      e.ignoreUnitUid = null;
      e.ignoreUnitTimer = 0;
      this.downUnit(m);
      return;
    }
    e.engageHits++;
    if (e.engageHits >= ENEMY_ATTACK.hitsBeforeLeave) {
      e.engageHits = 0;
      e.ignoreUnitUid = m.unit.uid;
      e.ignoreUnitTimer = ENEMY_ATTACK.leaveDuration;
      e.engaging = false;
      this.scene.vfx.floatText(e.pos.x, e.pos.z + 0.8, '전진', '#f2ce6b');
    }
  }

  /** 유닛 다운: 회색 폭발 + 경고 토스트 + 타격음. 필드에서 이탈, 다음 배치 페이즈에 부활. */
  private downUnit(m: Monster): void {
    playSfx('leak');
    bus.emit('warn', { text: `${displayName(m.unit)}이(가) 쓰러졌습니다!` });
    this.scene.vfx.burst(m.pos.x, m.pos.z, 0x9a9a9a, 16, 3, 1.2);
    this.scene.vfx.ring(m.pos.x, m.pos.z, 0xc0392b, 3, 0.5);
    this.downedUids.add(m.unit.uid);
    this.removeUnitByUid(m.unit.uid);
  }


  /** 성문 공성 타격: 일반 적이 성에 도달해 자기 attack 값으로 성을 때린다(반복). attack 값을 의미있게. */
  private siegeStrike(e: Enemy): void {
    const amt = Math.max(1, Math.round(e.attack * SIEGE.attackMult));
    this.state.baseHp = Math.max(0, this.state.baseHp - amt);
    playSfx('leak');
    bus.emit('base:damage', { amount: amt, hp: this.state.baseHp });
    const base = this.scene.base.position;
    this.scene.vfx.floatText(base.x, base.z, `-${amt}`, '#ff6a6a');
    this.scene.vfx.ring(base.x, base.z, 0xc0392b, 2.6, 0.28);
  }

  private leak(e: Enemy): void {
    const amt = e.def.leak === 'boss' ? BASE_LEAK_BOSS : e.def.leak === 'miniboss' ? BASE_LEAK_MINIBOSS : BASE_LEAK_NORMAL;
    this.state.baseHp = Math.max(0, this.state.baseHp - amt);
    playSfx('leak');
    bus.emit('base:damage', { amount: amt, hp: this.state.baseHp });
    this.scene.vfx.floatText(this.scene.base.position.x, this.scene.base.position.z, `-${amt}`, '#ff6a6a');
    this.scene.vfx.ring(this.scene.base.position.x, this.scene.base.position.z, 0xc0392b, 4, 0.4);
  }

  private onKill(e: Enemy): void {
    bus.emit('enemy:killed', { element: e.element, x: e.pos.x, z: e.pos.z, isBoss: e.isBoss });
    this.scene.vfx.burst(e.pos.x, e.pos.z, ELEMENT_COLOR[e.element === 'neutral' ? 'light' : e.element] ?? 0xffffff, 10);
    // 후반 골드 인플레이션 억제: 스테이지 진행도 배율을 처치·콤보 골드 모두에 적용(초반 1.0 → 후반 대폭 감쇠).
    const goldMult = goldStageMult(this.stage.id);
    const baseKill = e.isBoss ? GOLD_REWARD.kill.boss : e.isMini ? GOLD_REWARD.kill.mini : GOLD_REWARD.kill.normal;
    this.state.gold += Math.max(1, Math.round(baseKill * goldMult));
    this.awardKillXp(e);
    if (this.hasDarkS3) this.state.darkKillStacks = Math.min(DARK_KILL_STACK_MAX, this.state.darkKillStacks + DARK_KILL_STACK);
    // 연속 처치 콤보: 5의 배수마다 골드 보너스 + 화려한 표시(간단한 손맛 요소).
    this.combo++;
    this.comboTimer = 2.2;
    if (this.combo >= GOLD_REWARD.comboStep && this.combo % GOLD_REWARD.comboStep === 0) {
      // 콤보 보상: floor(combo/5)*5 (20콤보 +20G). 후반엔 콤보가 폭증하므로 동일 배율로 감쇠시킨다.
      const bonus = Math.max(1, Math.round(Math.floor(this.combo / GOLD_REWARD.comboStep) * GOLD_REWARD.comboBonusPer * goldMult));
      this.state.gold += bonus;
      this.scene.vfx.floatText(e.pos.x, e.pos.z + 1.5, `${this.combo} 콤보! +${bonus}G`, '#f2ce6b');
      this.scene.vfx.ring(e.pos.x, e.pos.z, 0xf2ce6b, 3, 0.4);
      playSfx('coin');
    }
  }

  private despawn(i: number): void {
    this.enemies[i].dispose(this.scene.entities);
    this.enemies.splice(i, 1);
  }

  hitEnemy(e: Enemy, amount: number, element: ElementOrNeutral, _stage: number, opts: { ignoreDef?: boolean; darkBonus?: number } = {}): number {
    let mult = affinity(element, e.element);
    if (opts.darkBonus && e.element === 'dark') mult *= opts.darkBonus;
    const dealt = e.applyDamage(amount * mult, opts.ignoreDef);
    this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt), mult > 1.1 ? '#ffd84f' : mult < 0.9 ? '#9fb4c4' : '#ffffff');
    // 상성 피드백(간헐 표시로 스팸 방지) — 숨겨져 있던 속성 상성을 플레이 중에 학습시킨다.
    if (mult > 1.1 && Math.random() < 0.12) this.scene.vfx.floatText(e.pos.x, e.pos.z + 0.95, '효과적!', '#ffd84f');
    else if (mult < 0.9 && Math.random() < 0.12) this.scene.vfx.floatText(e.pos.x, e.pos.z + 0.95, '약함…', '#9fb4c4');
    return dealt;
  }

  private damageDot(e: Enemy, amount: number, _element: Element): void {
    e.applyDamage(amount);
  }

  /**
   * 표식 적용의 단일 경로 — 적에게 붙는 모든 표식은 여기를 거친다(CLAUDE.md 원칙 5의 "단일 판정").
   * 새 표식을 붙이기 전에 반응(시너지)을 판정: 이미 다른 속성 표식이 있으면 반응이 터지고 두 표식을 소모한다.
   */
  private applyMark(e: Enemy, type: MarkType, stacks: number, sourceStage: number): void {
    if (e.reactionCd <= 0) {
      const r = findReaction(type, (m) => e.marks.has(m));
      if (r) {
        // 두 표식을 소모하고 반응 폭발. 새 표식(type)은 붙이지 않는다(소모된 것으로 간주).
        e.marks.remove(r.a);
        e.marks.remove(r.b);
        e.reactionCd = REACTION.cooldown;
        this.triggerReaction(e, r);
        return;
      }
    }
    e.marks.add(type, stacks, sourceStage);
  }

  /** 반응 효과 실행 — reactions.ts의 선언형 필드를 공용 헬퍼로 처리(조합별 분기 없음). */
  private triggerReaction(origin: Enemy, r: Reaction): void {
    const scale = 1 + this.state.stageIndex * REACTION.dmgPerStagePct;
    const { x, z } = origin.pos;
    const affected = this.enemiesInRadius(x, z, r.radius);
    if (r.damage) {
      const dmg = Math.round(r.damage * scale);
      for (const e of affected) {
        const dealt = e.applyDamage(dmg, true);
        this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt), '#ffffff');
      }
    }
    if (r.spread) for (const e of affected) e.marks.add(r.spread.mark, r.spread.stacks, origin.marks.sourceStage(r.spread.mark) || 1);
    if (r.root) for (const e of affected) e.applyRoot(r.root);
    if (r.slow) for (const e of affected) e.applySlow(r.slow.pct, r.slow.duration);
    // 연출: 반응 이름 플로팅 + 컬러 링/버스트 + 살짝 흔들림.
    this.scene.vfx.floatText(x, z + 1.1, `${r.icon} ${r.name}`, `#${r.color.toString(16).padStart(6, '0')}`);
    this.scene.vfx.ring(x, z, r.color, Math.min(r.radius, 9), 0.5);
    this.scene.vfx.burst(x, z, r.color, 16);
    this.scene.vfx.impact(x, z, r.color, 1.4, true);
    playSfx('select');
    bus.emit('reaction:fired', { name: r.name });
  }

  enemiesInRadius(x: number, z: number, r: number): Enemy[] {
    return this.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) <= r);
  }

  private repairBase(amount: number, color = 0x6fae4c): void {
    const before = this.state.baseHp;
    this.state.heal(amount);
    const healed = Math.round(this.state.baseHp - before);
    const base = this.scene.base.position;
    if (healed > 0) this.scene.vfx.floatText(base.x, base.z, `+${healed}`, '#6fae4c');
    this.scene.vfx.ring(base.x, base.z, color, 3.5, 0.5);
    this.scene.setBaseHp(this.state.baseHp / this.state.baseHpMax);
  }

  private healAnyAllies(amount: number): void {
    for (const m of this.units) {
      if (!m.alive) continue;
      const before = m.hp;
      m.heal(amount);
      const healed = Math.round(m.hp - before);
      if (healed <= 0) continue;
      this.scene.vfx.floatText(m.pos.x, m.pos.z + 0.6, `+${healed}`, '#6fae4c');
      this.scene.vfx.burst(m.pos.x, m.pos.z, 0x8fe06a, 6);
    }
  }

  private awardKillXp(e: Enemy): void {
    const amount = XP_REWARD.kill[e.def.tier] ?? XP_REWARD.kill.normal;
    const recipients = this.units.filter((m) => m.alive).map((m) => m.unit);
    if (!recipients.length) return;
    for (const unit of recipients) this.addUnitXpDeferred(unit, amount);
    this.scene.vfx.floatText(e.pos.x, e.pos.z + 0.75, `XP +${amount}`, '#9fd8ff');
  }

  private awardWaveXp(): void {
    const amount = XP_REWARD.waveBase
      + this.stage.id * XP_REWARD.wavePerStage
      + (this.waveIndex + 1) * XP_REWARD.wavePerIndex
      + (this.waveIndex + 1 >= this.totalWaves ? XP_REWARD.finalWaveBonus : 0);
    for (const unit of this.state.roster) this.addUnitXpDeferred(unit, amount);
    bus.emit('toast', { text: `웨이브 보상: 전원 XP +${amount}`, kind: 'good' });
  }

  private addUnitXpDeferred(unit: OwnedUnit, amount: number): void {
    const from = unitName(unit);
    const r = this.state.addUnitXp(unit, amount);
    if (r.evolved) {
      const key = this.state.evolveKeySkill(unit);
      if (key && !r.gains.some((g) => g.cardId === key)) r.gains.push({ uid: unit.uid, cardId: key });
    }
    if (!r.evolved && r.gains.length === 0) return;
    this.growthEvents.push({
      uid: unit.uid,
      from,
      to: unitName(unit),
      element: unit.element,
      evolved: r.evolved,
      gains: r.gains,
    });
  }

  private nearestEnemy(x: number, z: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private frontTargetInRange(x: number, z: number, range: number, preferCursed = false): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d > range) continue;
      let score = e.progress();
      if (preferCursed && e.marks.has('curse')) score += 1;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private updateCastleAttack(dt: number): void {
    if (this.castleCd > 0) { this.castleCd -= dt; return; }
    const base = this.scene.base.position;
    const inRange = this.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - base.x, e.pos.z - base.z) <= HERO.range);
    if (!inRange.length) return;
    this.castleCd = 1 / HERO.attackSpeed;
    const target = inRange.sort((a, b) => b.progress() - a.progress())[0];
    const dealt = target.applyDamage(HERO.attack);
    this.scene.vfx.floatText(target.pos.x, target.pos.z, String(dealt));
    const p = new Projectile(base, target, 0xffe08a, 16, false, (hit) => {
      if (hit) this.scene.vfx.burst(hit.pos.x, hit.pos.z, 0xffe08a, 6, 2, 1);
    });
    this.projectiles.push(p);
    this.scene.entities.add(p.mesh);
    this.scene.vfx.ring(base.x, base.z, 0xffe08a, 2.4, 0.25);
  }

  private frontEnemyPoint(): Vec2 | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!best || e.progress() > best.progress()) best = e;
    }
    return best ? { x: best.pos.x, z: best.pos.z } : null;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) {
        p.dispose(this.scene.entities);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateZones(dt: number, t: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.update(dt, t);
      if (z.dead) {
        z.dispose(this.scene.zones);
        this.zones.splice(i, 1);
      }
    }
  }

  addZone(kind: ZoneKind, element: Element, x: number, z: number, radius: number, duration: number, opts: { slow?: number; dps?: number; root?: number }): void {
    const zone = new GroundZone(kind, element, x, z, radius, duration, opts);
    this.zones.push(zone);
    this.scene.zones.add(zone.view);
  }

  playCard(id: string, point?: Vec2): boolean {
    const def = CARD_BY_ID[id];
    if (!def) return false;
    let pt = point;
    if ((def.target === 'point' || def.target === 'enemy-area') && !pt) pt = this.frontEnemyPoint() ?? this.castleXZ();
    if (!this.deck.consume(id)) return false;
    this.applyCardEffect(def.effect, def.element, pt);
    if (this.deck.hand.length === 0) this.deck.refillTo(this.waveDeck, HAND_SIZE);
    if (def.effect.kind === 'baseHeal') this.deck.setCooldown(id, BASE_HEAL_CD);
    if (def.effect.kind === 'capture') this.deck.setCooldown(id, CAPTURE.cooldown);
    // 카드 속성별로 음높이를 살짝 달리해 시전음 차별화 (불=높게, 어둠=낮게).
    const CARD_PITCH: Record<string, number> = { fire: 1.16, water: 1.0, grass: 1.08, light: 1.22, dark: 0.85, normal: 1.0, neutral: 1.0 };
    if (def.effect.kind === 'capture') playSfx('select');
    else playSfx('card', { pitch: CARD_PITCH[def.element] ?? 1 });
    bus.emit('card:played', { id });
    return true;
  }

  private maxStageOwned(el: Element): number {
    return this.state.roster.filter((u) => u.element === el).reduce((mx, u) => Math.max(mx, u.stage), 1);
  }

  private applyCardEffect(fx: CardEffect, cardEl: CardElement, point?: Vec2): void {
    const p = point ?? this.castleXZ();
    const stage = cardEl === 'normal' ? 1 : this.maxStageOwned(cardEl);
    switch (fx.kind) {
      case 'damage':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          this.hitEnemy(e, fx.amount, fx.element, stage);
          if (fx.mark) this.applyMark(e, fx.mark, fx.markStacks ?? 1, stage);
          if (fx.knockback) e.knockback(fx.knockback);
        }
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), Math.min(fx.radius, 9), 0.4);
        this.scene.vfx.impact(p.x, p.z, colorOf(fx.element), Math.min(2.2, 1 + fx.radius * 0.18), fx.radius >= 5);
        if (fx.radius >= 5) this.scene.shake(0.35); // 초신성급 광역 폭발만 화면 흔들림
        break;
      case 'chain': {
        const d2 = (e: Enemy) => (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
        for (const e of this.enemiesInRadius(p.x, p.z, 8).sort((a, b) => d2(a) - d2(b)).slice(0, fx.targets)) {
          this.hitEnemy(e, fx.amount, fx.element, stage);
          if (fx.mark) this.applyMark(e, fx.mark, fx.markStacks ?? 1, stage);
          this.scene.vfx.burst(e.pos.x, e.pos.z, colorOf(fx.element), 8);
        }
        break;
      }
      case 'zone':
        this.addZone(fx.zone, fx.element, p.x, p.z, fx.radius, fx.duration, { slow: fx.slow, dps: fx.dps, root: fx.root });
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), fx.radius, 0.4);
        break;
      case 'markArea':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) this.applyMark(e, fx.mark, fx.stacks, stage);
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), Math.min(fx.radius, 9), 0.4);
        break;
      case 'defDown':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          e.defDownPct = fx.pct;
          e.defDownTimer = fx.duration;
          this.applyMark(e, 'curse', 1, stage);
        }
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, fx.radius, 0.4);
        break;
      case 'drain': {
        let total = 0;
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          total += this.hitEnemy(e, fx.amount, fx.element, stage);
          this.applyMark(e, 'curse', 1, stage);
        }
        // 어둠 흡수: 성이 아니라 원정대 전원의 HP를 흡수 피해 일부만큼 회복.
        const drainHeal = Math.round(total * fx.drainPct);
        if (drainHeal > 0) {
          this.healAnyAllies(drainHeal);
          bus.emit('toast', { text: `생명력 흡수! 아군 전원 HP +${drainHeal}`, kind: 'good' });
        }
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, Math.min(fx.radius, 9), 0.4);
        break;
      }
      case 'eclipseVerdict':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          const cs = e.marks.stacks('curse');
          // 저주 스택이 높을수록 치명적 — 쌓인 저주를 모두 터뜨려 스택당 큰 피해로 환산.
          if (cs >= 1) { e.applyDamage(cs * 30, true); e.marks.remove('curse'); }
          if (!e.isBoss && !e.isMini && e.hp / e.maxHp <= fx.executePct) e.applyDamage(e.hp + 1, true);
          this.scene.vfx.burst(e.pos.x, e.pos.z, 0x4a4e9e, 12);
        }
        this.scene.vfx.ring(p.x, p.z, 0x4a4e9e, Math.min(fx.radius, 9), 0.6);
        this.scene.vfx.impact(p.x, p.z, 0x4a4e9e, 2.2, true);
        this.scene.shake(0.5); // 일식선고(어둠 궁극)
        break;
      case 'blessOne': {
        const target = this.units.filter((m) => m.alive).sort((a, b) => b.stats.attack - a.stats.attack)[0];
        if (target) { target.bless(fx.stacks); this.scene.vfx.burst(target.pos.x, target.pos.z, 0xf2ce6b, 8); }
        break;
      }
      case 'blessAll': {
        // 빛: 전군에 축복(공격력 버프) 부여.
        const allies = this.units.filter((m) => m.alive);
        allies.forEach((m) => { m.bless(fx.stacks); this.scene.vfx.burst(m.pos.x, m.pos.z, 0xf2ce6b, 6); });
        if (allies.length) bus.emit('toast', { text: '전군이 빛의 축복을 받았습니다.', kind: 'good' });
        break;
      }
      case 'healUnits': {
        // 빛(주)·풀/물(보조): 살아있는 아군 유닛 HP 회복. base>0이면 성도 함께 수리.
        let healed = 0;
        for (const m of this.units) {
          if (!m.alive) continue;
          const before = m.hp;
          m.heal(fx.amount);
          if (m.hp > before) { healed++; this.scene.vfx.floatText(m.pos.x, m.pos.z + 0.6, `+${Math.round(m.hp - before)}`, '#6fae4c'); this.scene.vfx.burst(m.pos.x, m.pos.z, 0x8fe06a, 6); }
        }
        if (fx.base > 0) this.repairBase(fx.base);
        if (healed || fx.base > 0) bus.emit('toast', { text: '아군을 치유했습니다.', kind: 'good' });
        break;
      }
      case 'shieldUnits': {
        // 물: 살아있는 아군 유닛에 보호막 부여(피격 시 HP보다 먼저 흡수).
        let count = 0;
        for (const m of this.units) {
          if (!m.alive) continue;
          m.addShield(fx.amount);
          count++;
          this.scene.vfx.floatText(m.pos.x, m.pos.z + 0.6, `+${fx.amount}🛡️`, '#9fd8ff');
          this.scene.vfx.burst(m.pos.x, m.pos.z, 0x9fd8ff, 6);
        }
        if (count) bus.emit('toast', { text: '아군이 물의 보호막을 얻었습니다.', kind: 'good' });
        break;
      }
      case 'reviveUnit': {
        // 빛: 이번 웨이브에 쓰러진(필드 이탈) 아군을 즉시 빈 슬롯에 재배치하고 최대 HP의 hpPct로 되살린다.
        let revived = 0;
        for (const uid of [...this.downedUids]) {
          if (fx.max > 0 && revived >= fx.max) break; // max=0 = 전원 부활, >0 = 인원 제한(성능 하향).
          if (this.units.length >= this.placementLimit()) break;
          const unit = this.state.roster.find((u) => u.uid === uid);
          if (!unit) { this.downedUids.delete(uid); continue; }
          const slot = this.firstFreeSlot();
          if (slot < 0) break;
          if (!this.placeUnit(unit, slot)) continue;
          this.downedUids.delete(uid);
          const m = this.units.find((x) => x.unit.uid === uid);
          if (m) {
            m.hp = Math.max(1, Math.round(m.maxHp * fx.hpPct));
            this.scene.vfx.ring(m.pos.x, m.pos.z, 0xf2ce6b, 2.0, 0.6);
            this.scene.vfx.burst(m.pos.x, m.pos.z, 0xf2ce6b, 16);
            this.scene.vfx.floatText(m.pos.x, m.pos.z + 0.8, '부활!', '#f2ce6b');
          }
          revived++;
        }
        if (revived) bus.emit('toast', { text: `아군 ${revived}명을 되살렸습니다.`, kind: 'good' });
        else if (fx.fallbackDraw > 0) { this.deck.drawCards(fx.fallbackDraw); bus.emit('toast', { text: `되살릴 아군이 없어 카드 ${fx.fallbackDraw}장을 뽑습니다.`, kind: 'info' }); }
        else bus.emit('toast', { text: '되살릴 아군이 없습니다.', kind: 'info' });
        break;
      }
      case 'rally':
        this.deck.refillTo(this.waveDeck, HAND_SIZE);
        break;
      case 'baseHeal':
        this.repairBase(fx.amount);
        this.healAnyAllies(fx.amount);
        bus.emit('toast', { text: `성/아군 HP +${fx.amount}`, kind: 'good' });
        break;
      case 'overheat':
        this.units.filter((m) => m.element === 'fire').forEach((m) => { m.overheatMult = fx.mult; m.overheatTimer = fx.duration; });
        bus.emit('toast', { text: '오버히트! 불 유닛이 강화됩니다.', kind: 'good' });
        break;
      case 'draw': {
        this.deck.drawCards(fx.n);
        break;
      }
      case 'coinflip':
        if (Math.random() < 0.5) { this.state.gold += 20; bus.emit('toast', { text: '동전 앞면! 골드 +20', kind: 'good' }); }
        else bus.emit('toast', { text: '동전 뒷면. 아무 일도 일어나지 않았습니다.', kind: 'bad' });
        break;
      case 'bind':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) e.applyRoot(fx.duration);
        this.scene.vfx.ring(p.x, p.z, 0xb8a888, fx.radius, 0.5);
        this.scene.vfx.burst(p.x, p.z, 0xb8a888, 12);
        break;
      case 'haste':
        this.units.forEach((m) => { m.applyHaste(fx.mult, fx.duration); this.scene.vfx.burst(m.pos.x, m.pos.z, 0xf2ce6b, 6); });
        break;
      case 'manaGain':
        // 물: 마나 즉시 보충 (+선택적 카드 드로우)
        this.deck.mana = Math.min(this.deck.manaMax, this.deck.mana + fx.amount);
        bus.emit('mana:change', { mana: this.deck.mana, max: this.deck.manaMax });
        if (fx.draw && fx.draw > 0) this.deck.drawCards(fx.draw);
        bus.emit('toast', { text: fx.draw ? `마나 +${fx.amount}, 카드 +${fx.draw}` : `마나 +${fx.amount}`, kind: 'good' });
        this.scene.vfx.ring(this.castleXZ().x, this.castleXZ().z, ELEMENT_COLOR.water, 2.4, 0.4);
        break;
      case 'block':
        // 풀: 덩굴 벽 — 적 이동을 막는 지속 속박 장판(블록)
        this.addZone('overgrowth', fx.element, p.x, p.z, fx.radius, fx.duration, { slow: fx.slow ?? 0.9, dps: fx.dps ?? 3, root: fx.duration });
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.grass, fx.radius, 0.5);
        this.scene.vfx.burst(p.x, p.z, ELEMENT_COLOR.grass, 16);
        break;
      case 'capture': {
        const orb = new CaptureOrb(this.castleXZ(), p, CAPTURE.orbDuration, CAPTURE.arcHeight, (land) => this.resolveCapture(land, fx.radius));
        this.captureOrbs.push(orb);
        this.scene.entities.add(orb.view);
        break;
      }
    }
  }

  private updateCaptureOrbs(dt: number): void {
    for (let i = this.captureOrbs.length - 1; i >= 0; i--) {
      const o = this.captureOrbs[i];
      o.update(dt);
      if (o.dead) { o.dispose(this.scene.entities); this.captureOrbs.splice(i, 1); }
    }
  }

  captureHint(x: number, z: number): { status: 'catch' | 'none'; radius: number; label: string } {
    // resolveCapture와 동일 규칙으로 '실제 잡히는 대상'을 먼저 고른다(보스/미니는 포획 불가라 후보에서 제외).
    // 이렇게 해야 프리뷰 링이 가리키는 대상 = 실제 포획 대상이 되어 "왜 저게 잡히지?" 불일치가 없다.
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dying || e.isBoss || e.isMini) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const radius = CAPTURE_RADIUS[best.def.tier] ?? 1.4;
      if (bd <= radius) return { status: 'catch', radius, label: `${best.def.name}: 포획 가능` };
      return { status: 'none', radius, label: `${best.def.name}: 범위 밖` };
    }
    return { status: 'none', radius: 1.4, label: '대상 없음' };
  }

  private resolveCapture(p: Vec2, nominalRadius: number): void {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dying || e.isBoss || e.isMini) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { this.captureMiss(p, '대상이 없습니다'); return; }
    const radius = CAPTURE_RADIUS[best.def.tier] ?? nominalRadius;
    if (bd <= radius) this.captureEnemy(best);
    else this.captureMiss(p, '범위 밖입니다');
  }

  private captureMiss(p: Vec2, why: string): void {
    playSfx('captureFail');
    this.scene.vfx.ring(p.x, p.z, 0xf2ce6b, 1.0, 0.3);
    this.scene.vfx.burst(p.x, p.z, 0xd23b3b, 6);
    bus.emit('toast', { text: `포획 실패: ${why}`, kind: 'bad' });
  }

  private captureEnemy(e: Enemy): void {
    playSfx('capture');
    const r = this.state.registerCapture(e.def.id);
    const dex = r.firstTime ? '도감 신규 등록' : `포획 ${r.count}회`;
    // 포획 성공 신호(모든 분기 공통) — 튜토리얼 포획 단계는 이 이벤트로 1회 포획 시 완료된다.
    bus.emit('capture:success', { species: e.def.id, name: e.def.name });

    // 야생 크리처: 같은 속성 '크리처' 보유 시 흡수 강화(별도 유닛 X), 미보유 시 새 크리처로 합류.
    if (e.def.creatureStage) {
      const el = e.def.element as Element;
      if (this.state.hasCreatureElement(el)) {
        const absorbed = this.state.absorbCreatureDuplicate(el);
        if (absorbed) { this.onCaptureAbsorb(absorbed, e, dex); return; }
      }
      const evo = MONSTERS[el].evolveLevels;
      const lvl = e.def.creatureStage >= 3 ? evo[1] : e.def.creatureStage === 2 ? evo[0] : 1;
      const joined = this.state.giveUnit(el, lvl);
      if (joined) { this.deployCaptured(joined); bus.emit('toast', { text: `포획 성공! 야생 ${displayName(joined)}이(가) 원정대에 합류했습니다. (${dex})`, kind: 'good' }); }
      else if (this.state.monstersFull) {
        // 만석: 적과 동일하게 편입/놓아주기 모달로 위임 (인원 상관없이 교체 편입 가능).
        bus.emit('toast', { text: `포획 성공! ${e.def.name} (${dex})`, kind: 'good' });
        bus.emit('capture:full', { species: e.def.id, name: e.def.name });
      } else {
        bus.emit('toast', { text: `포획 성공! ${e.def.name} (${dex})`, kind: 'good' });
      }
      this.captureFx(e);
      return;
    }

    const absorbed = this.state.absorbCapturedEnemy(e.def.id);
    if (absorbed) { this.onCaptureAbsorb(absorbed, e, dex); return; }
    const joined = this.state.giveEnemyUnit(e.def.id, this.state.stageIndex + 1);
    if (joined) { this.deployCaptured(joined); bus.emit('toast', { text: `포획 성공! ${e.def.name}이 원정대에 합류했습니다. (${dex})`, kind: 'good' }); }
    else if (this.state.monstersFull) {
      // 만석 처리는 capture:full 모달(편입/놓아주기)에 위임 — 여기선 도감 등록만 알린다.
      bus.emit('toast', { text: `포획 성공! ${e.def.name} (${dex})`, kind: 'good' });
      bus.emit('capture:full', { species: e.def.id, name: e.def.name });
    } else {
      bus.emit('toast', { text: `포획 성공! ${e.def.name} (${dex})`, kind: 'good' });
    }
    this.captureFx(e);
  }

  /** 흡수 강화 공통 처리(토스트·성장 이벤트·이펙트·디스폰). enemy/야생 크리처 공용. */
  private onCaptureAbsorb(absorbed: NonNullable<ReturnType<GameState['absorbCapturedEnemy']>>, e: Enemy, dex: string): void {
    // 원정대 전원이 보너스를 받으므로 배치된 유닛 스탯을 모두 갱신.
    this.refreshUnitStats();
    const bondPct = Math.round(absorbed.bondGain * 100);
    const evolvedText = absorbed.evolved ? ` ${absorbed.from}이(가) ${absorbed.to}(으)로 진화했습니다.` : '';
    const partyText = absorbed.others.length ? ` 원정대 전원도 XP +${absorbed.xp}를 받았습니다.` : '';
    bus.emit('toast', { text: `포획 성공! ${e.def.name}의 힘을 ${displayName(absorbed.unit)}이(가) 흡수했습니다. XP +${absorbed.xp}, 유대 +${bondPct}%.${partyText} (${dex})${evolvedText}`, kind: 'good' });
    if (absorbed.evolved || absorbed.gains.length) {
      bus.emit('unit:grown', { uid: absorbed.unit.uid, from: absorbed.from, to: unitName(absorbed.unit), element: absorbed.unit.element, evolved: absorbed.evolved, gains: absorbed.gains });
    }
    // 보너스로 성장(진화/스킬 학습)한 동료들도 성장 연출·시그니처 학습 큐에 통지.
    for (const o of absorbed.others) {
      if (o.evolved || o.gains.length) {
        bus.emit('unit:grown', { uid: o.uid, from: o.from, to: o.to, element: o.element, evolved: o.evolved, gains: o.gains });
      }
    }
    this.captureFx(e);
  }

  private captureFx(e: Enemy): void {
    this.scene.vfx.ring(e.pos.x, e.pos.z, 0xf2ce6b, 2.2, 0.5);
    this.scene.vfx.burst(e.pos.x, e.pos.z, 0xf2ce6b, 20);
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.despawn(i);
  }

  finish(): void {
    this.hideUnitGhost();
    for (const m of [...this.units]) m.dispose(this.scene.entities);
    for (const e of [...this.enemies]) e.dispose(this.scene.entities);
    for (const p of [...this.projectiles]) p.dispose(this.scene.entities);
    for (const z of [...this.zones]) z.dispose(this.scene.zones);
    for (const o of [...this.captureOrbs]) o.dispose(this.scene.entities);
    this.units = [];
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.captureOrbs = [];
  }
}
