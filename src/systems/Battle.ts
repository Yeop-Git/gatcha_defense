import * as THREE from 'three';
import type { Scene } from '../render/Scene';
import { type GameState, type OwnedUnit, displayName, deriveStats, unitName } from '../core/GameState';
import type { StageDef } from '../data/stages';
import type { Element, ElementOrNeutral, Vec2 } from '../core/types';
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
  BURN_DPS_PER_STACK,
  OVERGROWTH_DPS,
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
} from '../data/constants';
import { CaptureOrb } from '../entities/CaptureOrb';
import { Enemy } from '../entities/Enemy';
import { Monster } from '../entities/Monster';
import { Projectile } from '../entities/Projectile';
import { GroundZone, type ZoneKind } from '../entities/GroundZone';
import { affinity } from './affinity';
import { DeckSystem } from './DeckSystem';
import { bus } from '../core/events';
import { playSfx } from '../audio/Sfx';
import { unlockEnemy } from '../core/Dex';

type Phase = 'placement' | 'wave' | 'bonus' | 'stageClear' | 'lost' | 'won';
interface SpawnEvent { t: number; enemy: string }

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
  private unitGhost: THREE.Group | null = null; // 배치 드래그 반투명 미리보기 모델

  constructor(private scene: Scene, private state: GameState, public stage: StageDef, private hpScale: number) {
    setStageLayout(stage.id - 1); // 스테이지별 경로/슬롯 적용 (FIELD.path·UNIT_SLOTS 인플레이스 교체)
    scene.setStage(stage.id, stage.theme); // 스테이지 고유 팔레트/장식 밀도
    scene.rebuildMap();
    this.deck = new DeckSystem(state.manaMax, state.manaRegen);
    this.autoPlace();
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

  private autoPlace(): void {
    const sorted = [...this.state.roster].sort((a, b) => b.stage - a.stage || b.level - a.level);
    for (const u of sorted.slice(0, this.state.placementCap)) {
      const slot = this.firstFreeSlot();
      if (slot >= 0) this.placeUnit(u, slot);
    }
  }

  placeUnit(unit: OwnedUnit, slot: number): boolean {
    if (slot < 0 || slot >= UNIT_SLOTS.length || !this.slotFree(slot)) return false;
    if (this.units.some((m) => m.unit.uid === unit.uid)) return false;
    if (this.units.length >= this.state.placementCap) return false;
    const s = UNIT_SLOTS[slot];
    const m = new Monster(unit, slot, s.x, s.z, this.state.unitAtkMult);
    this.units.push(m);
    this.scene.entities.add(m.view);
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

  placeablesState(): { id: string; name: string; element: ElementOrNeutral; placed: boolean; dead: boolean; kind: 'creature' | 'enemy'; species?: string; stage: 1 | 2 | 3; level: number }[] {
    return this.state.roster.map((u) => ({
      id: u.uid,
      name: displayName(u),
      element: u.element,
      placed: this.units.some((m) => m.unit.uid === u.uid),
      dead: false,
      kind: u.kind,
      species: u.species,
      stage: u.stage,
      level: u.level,
    }));
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
    if (this.units.length >= this.state.placementCap) {
      bus.emit('toast', { text: `유닛은 최대 ${this.state.placementCap}마리까지 배치할 수 있습니다.`, kind: 'bad' });
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
    if (this.units.length >= this.state.placementCap) {
      bus.emit('toast', { text: `유닛은 최대 ${this.state.placementCap}마리까지 배치할 수 있습니다.`, kind: 'bad' });
      return false;
    }
    const occupant = this.units.find((m) => m.slot === slot);
    if (occupant) this.removeUnit(occupant.slot);
    return this.placeUnit(unit, slot);
  }

  slotOccupant(slot: number): Monster | undefined {
    return this.units.find((m) => m.slot === slot);
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

  /** 웨이브 보너스 버프 적용 후 배치된 유닛 스탯 즉시 갱신. */
  refreshUnitStats(): void {
    for (const m of this.units) m.refreshStats();
  }

  beginWave(): void {
    if (this.phase !== 'placement') return;
    this.waveDeck = this.state.battleDeck(); // 이번 웨이브 덱 고정 스냅샷
    this.deck.drawHand(this.waveDeck, 5, [CAPTURE_CARD_ID]);
    this.phase = 'wave';
    this.waveClock = 0;
    this.spawnQueue = [];
    const groups = this.stage.waves[this.waveIndex] ?? [];
    for (const g of groups) {
      for (let k = 0; k < g.count; k++) this.spawnQueue.push({ t: k * g.interval, enemy: g.enemy });
    }
    // 야생 크리처 1마리 삽입 (스테이지↑ → 진화형 1→2→3). 웨이브 중반 등장.
    const creStage: 1 | 2 | 3 = this.stage.id <= 3 ? 1 : this.stage.id <= 8 ? 2 : 3;
    // 초반(스테이지 1~3)엔 보유 크리처와 같은 속성의 야생은 제외(본인 캐릭터 중복 회피).
    const owned = new Set(this.state.roster.filter((u) => u.kind === 'creature').map((u) => u.element));
    let pool = ELEMENTS.slice();
    if (this.stage.id <= 3) { const f = pool.filter((el) => !owned.has(el)); if (f.length) pool = f; }
    const creEl = pool[(this.stage.id + this.waveIndex) % pool.length];
    this.spawnQueue.push({ t: 2.5, enemy: creatureEnemyId(creEl, creStage) });
    this.spawnQueue.sort((a, b) => a.t - b.t);
    playSfx('wave');
    bus.emit('wave:start', { stage: this.stage.id, wave: this.waveIndex + 1, total: this.totalWaves });
  }

  private spawn(ev: SpawnEvent): void {
    const def = ENEMIES[ev.enemy] ?? ENEMIES.slime;
    if (!def.creatureStage) unlockEnemy(def.id); // 도감: 조우한 적 해금(야생 크리처 변종 제외)
    const e = new Enemy(def, this.hpScale);
    this.scene.entities.add(e.view);
    this.enemies.push(e);
  }

  update(dt: number): void {
    this.time += dt;
    this.deck.bonusRegen = this.units.filter((m) => m.alive && m.element === 'grass').length * GRASS_MANA_REGEN;
    this.deck.regenMana(dt);
    this.deck.updateCooldowns(dt);
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
    const hasTarget = this.enemies.some((e) => e.alive && ((!e.isBoss && !e.isMini) || e.stunTimer > 0));
    if (!hasTarget) return;
    if (this.deck.ensureInHand(CAPTURE_CARD_ID, this.waveDeck, 5)) {
      bus.emit('toast', { text: '포획구를 회수했습니다.', kind: 'info' });
    }
  }

  private onWaveClear(): void {
    bus.emit('wave:clear', { stage: this.stage.id, wave: this.waveIndex + 1 });
    this.waveIndex++;
    if (this.waveIndex >= this.totalWaves) {
      this.phase = this.stage.boss === 'final' ? 'won' : 'stageClear';
      if (this.stage.boss === 'final') bus.emit('run:win', {});
      else bus.emit('stage:clear', { stage: this.stage.id });
    } else if (this.waveIndex === this.totalWaves - 1 && this.totalWaves >= 3) {
      // 마지막 웨이브 직전(2~3 사이) = 갈림길 보너스(강화 3택1). Game이 처리 후 배치 페이즈로.
      this.phase = 'bonus';
    } else {
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
      if (crit) { this.scene.vfx.floatText(hit.pos.x, hit.pos.z + 0.5, `⚡${dealt}`, '#ff5a3c'); this.scene.vfx.burst(hit.pos.x, hit.pos.z, 0xffcf3c, 10, 2.6, 0.9); }
      this.applyCapturedAttackPassive(m, hit, power, stage);
      this.scene.vfx.burst(hit.pos.x, hit.pos.z, color, 8, 2.2, 1.0);
      this.scene.vfx.ring(hit.pos.x, hit.pos.z, color, 1.1, 0.22);
      if (m.element === 'fire') hit.marks.add('burn', 1, stage);
      else if (m.element === 'water') { hit.marks.add('wet', 1, stage); hit.knockback(0.4); }
      else if (m.element === 'dark') hit.marks.add('curse', 1, stage);
      else if (m.element === 'grass') hit.marks.add('overgrowth', 1, stage);
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
      this.repairBase(power * 0.1, 0xf2ce6b);
      if (Math.random() < 0.18) m.bless(1);
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
      const burn = e.marks.stacks('burn');
      if (burn > 0) this.damageDot(e, burn * BURN_DPS_PER_STACK * dt, 'fire');
      if (e.marks.has('overgrowth') && !e.def.flying) this.damageDot(e, OVERGROWTH_DPS * dt, 'grass');

      e.update(dt, t);
      if (e.reachedBase) {
        this.leak(e);
        if (e.isBoss || e.isMini) {
          e.resetToPathStart();
          bus.emit('toast', { text: `${e.def.name}이 성을 타격하고 다시 진격합니다.`, kind: 'bad' });
          continue;
        }
        this.despawn(i);
        continue;
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
    this.state.gold += e.isBoss ? 100 : e.isMini ? 30 : 3;
    if (this.hasDarkS3) this.state.darkKillStacks = Math.min(DARK_KILL_STACK_MAX, this.state.darkKillStacks + DARK_KILL_STACK);
  }

  private despawn(i: number): void {
    this.enemies[i].dispose(this.scene.entities);
    this.enemies.splice(i, 1);
  }

  hitEnemy(e: Enemy, amount: number, element: ElementOrNeutral, _stage: number, opts: { ignoreDef?: boolean; darkBonus?: number } = {}): number {
    let mult = affinity(element, e.element);
    if (opts.darkBonus && e.element === 'dark') mult *= opts.darkBonus;
    const dealt = e.applyDamage(amount * mult, opts.ignoreDef);
    this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt), mult > 1.1 ? '#ffd84f' : '#ffffff');
    return dealt;
  }

  private damageDot(e: Enemy, amount: number, _element: Element): void {
    e.applyDamage(amount);
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
    if (this.deck.hand.length === 0) this.deck.refillTo(this.waveDeck, 5);
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
          if (fx.mark) e.marks.add(fx.mark, fx.markStacks ?? 1, stage);
          if (fx.knockback) e.knockback(fx.knockback);
        }
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), Math.min(fx.radius, 9), 0.4);
        this.scene.vfx.burst(p.x, p.z, colorOf(fx.element), 14);
        break;
      case 'chain': {
        const d2 = (e: Enemy) => (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
        for (const e of this.enemiesInRadius(p.x, p.z, 8).sort((a, b) => d2(a) - d2(b)).slice(0, fx.targets)) {
          this.hitEnemy(e, fx.amount, fx.element, stage);
          if (fx.mark) e.marks.add(fx.mark, fx.markStacks ?? 1, stage);
          this.scene.vfx.burst(e.pos.x, e.pos.z, colorOf(fx.element), 8);
        }
        break;
      }
      case 'zone':
        this.addZone(fx.zone, fx.element, p.x, p.z, fx.radius, fx.duration, { slow: fx.slow, dps: fx.dps, root: fx.root });
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), fx.radius, 0.4);
        break;
      case 'shieldAll':
        this.repairBase(this.state.baseHpMax * fx.pct, 0x9fd8ff);
        bus.emit('toast', { text: `성 HP +${Math.round(this.state.baseHpMax * fx.pct)}`, kind: 'good' });
        break;
      case 'healAll':
        this.repairBase(fx.amount);
        bus.emit('toast', { text: `성 HP +${fx.amount}`, kind: 'good' });
        break;
      case 'markArea':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) e.marks.add(fx.mark, fx.stacks, stage);
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), Math.min(fx.radius, 9), 0.4);
        break;
      case 'defDown':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          e.defDownPct = fx.pct;
          e.defDownTimer = fx.duration;
          e.marks.add('curse', 1, stage);
        }
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, fx.radius, 0.4);
        break;
      case 'drain': {
        let total = 0;
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          total += this.hitEnemy(e, fx.amount, fx.element, stage);
          e.marks.add('curse', 1, stage);
        }
        this.repairBase(total * fx.drainPct, 0x4a4e9e);
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, Math.min(fx.radius, 9), 0.4);
        break;
      }
      case 'eclipseVerdict':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          const cs = e.marks.stacks('curse');
          if (cs >= 5) { e.applyDamage(cs * 25, true); e.marks.remove('curse'); }
          if (!e.isBoss && !e.isMini && e.hp / e.maxHp <= fx.executePct) e.applyDamage(e.hp + 1, true);
          this.scene.vfx.burst(e.pos.x, e.pos.z, 0x4a4e9e, 12);
        }
        this.scene.vfx.ring(p.x, p.z, 0x4a4e9e, Math.min(fx.radius, 9), 0.6);
        break;
      case 'blessOne': {
        const target = this.units.filter((m) => m.alive).sort((a, b) => b.stats.attack - a.stats.attack)[0];
        if (target) target.bless(fx.stacks);
        break;
      }
      case 'cleanseHeal':
        this.repairBase(fx.amount);
        bus.emit('toast', { text: `성 HP +${fx.amount}`, kind: 'good' });
        break;
      case 'judgment':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) this.hitEnemy(e, fx.amount, 'light', stage, { darkBonus: fx.darkBonus });
        this.scene.vfx.ring(p.x, p.z, 0xf2ce6b, Math.min(fx.radius, 9), 0.5);
        this.scene.vfx.burst(p.x, p.z, 0xf2ce6b, 16);
        break;
      case 'rally':
        this.deck.refillTo(this.waveDeck, 5);
        break;
      case 'baseHeal':
        this.repairBase(fx.amount);
        bus.emit('toast', { text: `성 HP +${fx.amount}`, kind: 'good' });
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
        // 물: 마나 즉시 보충
        this.deck.mana = Math.min(this.deck.manaMax, this.deck.mana + fx.amount);
        bus.emit('mana:change', { mana: this.deck.mana, max: this.deck.manaMax });
        bus.emit('toast', { text: `마나 +${fx.amount}`, kind: 'good' });
        this.scene.vfx.ring(this.castleXZ().x, this.castleXZ().z, ELEMENT_COLOR.water, 2.4, 0.4);
        break;
      case 'fear':
        // 어둠: 공포 — 적이 잠깐 경로를 역주행(뒤로 도망)
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) e.applyFear(fx.duration);
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, fx.radius, 0.5);
        this.scene.vfx.burst(p.x, p.z, 0x2a2050, 14);
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

  captureHint(x: number, z: number): { status: 'catch' | 'bossWait' | 'none'; radius: number; label: string } {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dying) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return { status: 'none', radius: 1.4, label: '대상 없음' };
    const radius = CAPTURE_RADIUS[best.def.tier] ?? 1.4;
    const bossy = best.isBoss || best.isMini;
    if (bd <= radius) {
      if (bossy && !best.stunned) return { status: 'bossWait', radius, label: `${best.def.name}: 기절 필요` };
      return { status: 'catch', radius, label: `${best.def.name}: 포획 가능` };
    }
    return { status: 'none', radius, label: `${best.def.name}: 범위 밖` };
  }

  private resolveCapture(p: Vec2, nominalRadius: number): void {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.dying) continue;
      if ((e.isBoss || e.isMini) && !e.stunned) continue;
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

    // 야생 크리처: 같은 속성 보유 시 흡수 강화(별도 유닛 X), 미보유 시 새 크리처로 합류.
    if (e.def.creatureStage) {
      const el = e.def.element as Element;
      if (this.state.hasElement(el)) {
        const absorbed = this.state.absorbCreatureDuplicate(el);
        if (absorbed) { this.onCaptureAbsorb(absorbed, e, dex); return; }
      }
      const evo = MONSTERS[el].evolveLevels;
      const lvl = e.def.creatureStage >= 3 ? evo[1] : e.def.creatureStage === 2 ? evo[0] : 1;
      const joined = this.state.giveUnit(el, lvl);
      if (joined) bus.emit('toast', { text: `포획 성공! 야생 ${displayName(joined)}이(가) 원정대에 합류했습니다. (${dex})`, kind: 'good' });
      else bus.emit('toast', { text: `원정대가 가득 차 합류하지 못했습니다. (${dex})`, kind: 'bad' });
      this.captureFx(e);
      return;
    }

    const absorbed = this.state.absorbCapturedEnemy(e.def.id);
    if (absorbed) { this.onCaptureAbsorb(absorbed, e, dex); return; }
    const joined = this.state.giveEnemyUnit(e.def.id, this.state.stageIndex + 1);
    if (joined) bus.emit('toast', { text: `포획 성공! ${e.def.name}이 원정대에 합류했습니다. (${dex})`, kind: 'good' });
    else {
      bus.emit('toast', { text: `포획 성공! ${e.def.name}. 원정대가 가득 찼습니다. (${dex})`, kind: 'good' });
      bus.emit('capture:full', { species: e.def.id, name: e.def.name });
    }
    this.captureFx(e);
  }

  /** 흡수 강화 공통 처리(토스트·성장 이벤트·이펙트·디스폰). enemy/야생 크리처 공용. */
  private onCaptureAbsorb(absorbed: NonNullable<ReturnType<GameState['absorbCapturedEnemy']>>, e: Enemy, dex: string): void {
    const placed = this.units.find((m) => m.unit.uid === absorbed.unit.uid);
    placed?.refreshStats();
    const bondPct = Math.round(absorbed.bondGain * 100);
    const evolvedText = absorbed.evolved ? ` ${absorbed.from}이(가) ${absorbed.to}(으)로 진화했습니다.` : '';
    bus.emit('toast', { text: `포획 성공! ${e.def.name}의 힘을 ${displayName(absorbed.unit)}이(가) 흡수했습니다. XP +${absorbed.xp}, 유대 +${bondPct}%. (${dex})${evolvedText}`, kind: 'good' });
    if (absorbed.evolved || absorbed.gains.length) {
      bus.emit('unit:grown', { uid: absorbed.unit.uid, from: absorbed.from, to: unitName(absorbed.unit), element: absorbed.unit.element, evolved: absorbed.evolved, gains: absorbed.gains });
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
