import * as THREE from 'three';
import type { Scene } from '../render/Scene';
import { type GameState, type OwnedUnit, unitName } from '../core/GameState';
import type { StageDef } from '../data/stages';
import type { Element, ElementOrNeutral, Vec2 } from '../core/types';
import { ENEMIES, WILD_HP } from '../data/enemies';
import { CARD_BY_ID, CAPTURE_CARD_ID, type CardEffect, type CardElement } from '../data/cards';
import { UNIT_SLOTS, BASE_LEAK_NORMAL, BASE_LEAK_MINIBOSS, BASE_LEAK_BOSS, CAPTURE, CAPTURE_CARD, WILD_HP_PER_LEVEL, MAX_MONSTERS, ENEMY, BURN_DPS_PER_STACK, OVERGROWTH_DPS, HERO, DARK_KILL_STACK, DARK_KILL_STACK_MAX, ELEMENT_COLOR, NEUTRAL_COLOR } from '../data/constants';

/** 속성색 (무속성 포함) */
const colorOf = (el: ElementOrNeutral): number => (el === 'neutral' ? NEUTRAL_COLOR : ELEMENT_COLOR[el]);
import { Enemy } from '../entities/Enemy';
import { Monster } from '../entities/Monster';
import { Projectile } from '../entities/Projectile';
import { GroundZone, type ZoneKind } from '../entities/GroundZone';
import { affinity } from './affinity';
import { DeckSystem } from './DeckSystem';
import { SynergySystem, type SynergyCtx } from './SynergySystem';
import { bus } from '../core/events';

type Phase = 'placement' | 'wave' | 'stageClear' | 'lost' | 'won';

interface SpawnEvent { t: number; enemy: string; capture?: Element; captureLevel?: number }

/** 한 스테이지의 전투 시뮬레이션. 모든 시스템을 조율하는 중심. SynergyCtx 구현. */
export class Battle implements SynergyCtx {
  phase: Phase = 'placement';
  units: Monster[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  zones: GroundZone[] = [];
  deck: DeckSystem;
  private synergy = new SynergySystem();

  waveIndex = 0;
  private waveClock = 0;
  private spawnQueue: SpawnEvent[] = [];
  private healTimer = 0;
  private darkKillMult = 1;
  private hasDarkS3 = false;
  private deadUnits: OwnedUnit[] = [];
  private time = 0;

  /** 포획 카드 재사용 쿨다운(초). 마나 0 카드의 스팸 방지. */
  captureCd = 0;

  /** 적 반격 피해 배율 (난이도에 따라 완만히 상승). */
  private enemyAtkScale: number;
  /** 성(거점) 평타 쿨다운. 주인공을 성에 통합 — 성이 근처 적을 공격 + 포획 담당. */
  private castleCd = 0;

  constructor(private scene: Scene, private state: GameState, public stage: StageDef, private hpScale: number) {
    this.enemyAtkScale = 1 + (hpScale - 1) * 0.6;
    scene.setTheme(stage.theme);

    this.deck = new DeckSystem(state.manaMax, state.manaRegen);
    this.deck.drawHand(state.battleDeck(), 5 + state.drawBonus);

    this.autoPlace();
    this.hasDarkS3 = state.roster.some((u) => u.element === 'dark' && u.stage >= 3);
    bus.emit('stage:start', { stage: stage.id });
  }

  // ── 배치 ──────────────────────────────────────────
  /** 성 좌표 (평타/포획 원점). */
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

  /** 기본 자동 배치: 강한 순 유닛을 빈 슬롯에 (주인공은 성에 통합됨). */
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

  /** 배치 UI용: 로스터 유닛의 배치 상태 목록 (주인공은 성에 통합되어 배치 대상 아님) */
  placeablesState(): { id: string; name: string; element: import('../core/types').ElementOrNeutral; placed: boolean }[] {
    const list: { id: string; name: string; element: import('../core/types').ElementOrNeutral; placed: boolean }[] = [];
    for (const u of this.state.roster) {
      list.push({ id: u.uid, name: unitName(u), element: u.element, placed: this.units.some((m) => m.unit.uid === u.uid) });
    }
    return list;
  }

  /** 배치 토글 (배치 페이즈에서만 호출). 배치되어 있으면 회수, 아니면 빈 슬롯에 배치. */
  togglePlace(id: string): void {
    if (this.phase !== 'placement') return;
    const placed = this.units.find((m) => m.unit.uid === id);
    if (placed) { this.removeUnit(placed.slot); return; }
    const unit = this.state.roster.find((u) => u.uid === id);
    if (!unit) return;
    if (this.units.length >= this.state.placementCap) { bus.emit('toast', { text: `유닛은 최대 ${this.state.placementCap}체까지 배치`, kind: 'bad' }); return; }
    const s = this.firstFreeSlot();
    if (s >= 0) this.placeUnit(unit, s);
  }

  slotOccupant(slot: number): Monster | undefined {
    return this.units.find((m) => m.slot === slot);
  }

  // ── 웨이브 ────────────────────────────────────────
  get totalWaves(): number {
    return this.stage.waves.length + (this.stage.captureElements.length > 0 ? 1 : 0);
  }

  /** 다음 웨이브 시작 (UI 버튼) */
  beginWave(): void {
    if (this.phase !== 'placement') return;
    // 웨이브 시작 시 손패 보충 (다중 웨이브 중 카드 고갈 방지)
    this.deck.refillTo(this.state.battleDeck(), 5 + this.state.drawBonus);
    this.phase = 'wave';
    this.waveClock = 0;
    this.spawnQueue = [];
    const captureWave = this.stage.captureElements.length > 0 && this.waveIndex === 0;
    if (captureWave) {
      // 모든 스테이지 웨이브1: 5속성 캐릭터의 1단(첫번째 단계) 야생이 모두 등장 → 포획 가능.
      // 야생 레벨은 스테이지에 따라 상승(진화는 안 됨).
      const wildLevel = 1 + this.state.stageIndex;
      let t = 0.6;
      for (const el of this.stage.captureElements) {
        this.spawnQueue.push({ t, enemy: 'slime', capture: el, captureLevel: wildLevel });
        t += 1.3;
      }
      // 가벼운 잡몹 섞기 (페이싱)
      for (let k = 0; k < 2; k++) this.spawnQueue.push({ t: 1.6 + k * 1.7, enemy: 'slime' });
      // 포획 온보딩 힌트 (초반 스테이지만)
      if (this.state.stageIndex <= 1 && !this.state.monstersFull) {
        bus.emit('toast', { text: '✨ 반짝이는 야생 몬스터! 공격으로 HP를 낮춘 뒤 🎯 포획 카드를 몬스터로 드래그(또는 F)', kind: 'info' });
      }
    } else {
      const waveDefIndex = this.stage.captureElements.length > 0 ? this.waveIndex - 1 : this.waveIndex;
      const groups = this.stage.waves[waveDefIndex] ?? [];
      for (const g of groups) {
        for (let k = 0; k < g.count; k++) {
          this.spawnQueue.push({ t: k * g.interval, enemy: g.enemy });
        }
      }
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    bus.emit('wave:start', { stage: this.stage.id, wave: this.waveIndex + 1, total: this.totalWaves });
  }

  private spawn(ev: SpawnEvent): void {
    const def = ENEMIES[ev.enemy];
    const cap = !!ev.capture;
    const level = ev.captureLevel ?? 1;
    // 야생 HP = 기본 야생 HP × (1 + 레벨 비례). 후반 스테이지일수록 단단(=고레벨).
    const hpScale = cap ? (WILD_HP[ev.capture!] / def.hp) * (1 + (level - 1) * WILD_HP_PER_LEVEL) : this.hpScale;
    const e = new Enemy(def, hpScale, cap, ev.capture ?? null, level);
    this.scene.entities.add(e.view);
    this.enemies.push(e);
  }

  // ── 메인 업데이트 ─────────────────────────────────
  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.deck.regenMana(dt);
    if (this.captureCd > 0) this.captureCd = Math.max(0, this.captureCd - dt);
    this.synergy.update(dt);
    this.updateCastleAttack(dt);
    this.scene.setBaseHp(this.state.baseHp / this.state.baseHpMax);

    if (this.phase === 'wave') {
      this.waveClock += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveClock) {
        this.spawn(this.spawnQueue.shift()!);
      }
    }

    this.updateUnits(dt);
    this.updateEnemies(dt, t);
    this.updateProjectiles(dt);
    this.updateZones(dt, t);
    this.updateHealers(dt);
    this.scene.vfx.update(dt);

    // 웨이브 종료 판정
    if (this.phase === 'wave' && this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.onWaveClear();
    }
    // 패배 판정 (성 HP 0 = 패배; 주인공은 성에 통합)
    if (this.state.baseHp <= 0 && this.phase !== 'lost' && this.phase !== 'won') {
      this.phase = 'lost';
      bus.emit('base:destroyed', {});
      bus.emit('run:lose', {});
    }
  }

  private onWaveClear(): void {
    bus.emit('wave:clear', { stage: this.stage.id, wave: this.waveIndex + 1 });
    this.waveIndex++;
    if (this.waveIndex >= this.totalWaves) {
      this.phase = this.stage.boss === 'chimera' ? 'won' : 'stageClear';
      if (this.stage.boss === 'chimera') bus.emit('run:win', {});
      else bus.emit('stage:clear', { stage: this.stage.id });
    } else {
      this.phase = 'placement';
    }
  }

  // ── 유닛 전투 ─────────────────────────────────────
  private updateUnits(dt: number): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const m = this.units[i];
      if (!m.alive) {
        this.deadUnits.push(m.unit);
        m.dispose(this.scene.entities);
        this.units.splice(i, 1);
        bus.emit('toast', { text: `유닛이 쓰러졌다…`, kind: 'bad' });
        continue;
      }
      m.update(dt, this.time);
      if (m.atkCd > 0) continue;
      const target = this.frontTargetInRange(m.pos.x, m.pos.z, m.stats.range, m.element === 'dark');
      if (!target) continue;
      m.atkCd = 1 / m.stats.attackSpeed;
      this.fireUnitShot(m, target);
    }
  }

  private fireUnitShot(m: Monster, target: Enemy): void {
    const color = ELEMENT_COLOR[m.element];
    let power = m.attackPower();
    if (m.element === 'dark' && this.hasDarkS3) power *= this.darkKillMult;
    // 빛 유닛: 공격 대신 아군 보조 + 약한 피해
    const stage = m.unit.stage;
    // 머즐 플래시 — 유닛이 쏘는 게 보이도록
    this.scene.vfx.burst(m.pos.x, m.pos.z, color, 5, 1.3, 1.3);
    const p = new Projectile(m.view.position, target, color, 15, false, (hit) => {
      if (!hit) return;
      this.hitEnemy(hit, power, m.element, stage);
      // 착탄 이펙트
      this.scene.vfx.burst(hit.pos.x, hit.pos.z, color, 8, 2.2, 1.0);
      this.scene.vfx.ring(hit.pos.x, hit.pos.z, color, 1.1, 0.22);
      // 속성별 표식
      if (m.element === 'fire') hit.marks.add('burn', 1);
      else if (m.element === 'water') { hit.marks.add('wet', 1); hit.knockback(0.4); }
      else if (m.element === 'dark') hit.marks.add('curse', 1);
      else if (m.element === 'grass') hit.marks.add('overgrowth', 1);
      else if (m.element === 'light') this.lightSupport(m);
    });
    this.projectiles.push(p);
    this.scene.entities.add(p.mesh);
  }

  /** 빛 유닛 보조: 최저 HP 아군 소회복 + 확률 축복 */
  private lightSupport(m: Monster): void {
    const lowest = this.units.filter((u) => u.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (lowest) lowest.heal(m.stats.attack * 0.4);
    if (Math.random() < 0.25) m.bless(1);
  }

  // ── 적 ────────────────────────────────────────────
  private updateEnemies(dt: number, t: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // 장판 효과 재계산 (매 프레임)
      e.zoneSlow = 0;
      if (!e.def.flying) {
        for (const z of this.zones) {
          if (z.contains(e.pos.x, e.pos.z)) {
            e.zoneSlow = Math.max(e.zoneSlow, z.slow);
            if (z.root > 0) e.rootTimer = Math.max(e.rootTimer, 0.2);
            if (z.dps > 0) this.damageDot(e, z.dps * dt, z.element);
            // (overgrowth 표식은 풀 '공격'으로만 부여 — 장판 위 상시 스탬프는 협동기 스팸이라 제거)
          }
        }
      }
      // 표식 도트
      const burn = e.marks.stacks('burn');
      if (burn > 0) this.damageDot(e, burn * BURN_DPS_PER_STACK * dt, 'fire');
      if (e.marks.has('overgrowth') && !e.def.flying) this.damageDot(e, OVERGROWTH_DPS * dt, 'grass');

      e.update(dt, t);

      if (e.reachedBase) {
        if (!e.capturable) this.leak(e); // 포획 대상 야생은 기지에 피해 없이 사라짐(위협 아님)
        this.despawn(i);
        continue;
      }
      if (!e.alive) {
        this.onKill(e);
        this.despawn(i);
        continue;
      }
      // 보스 2페이즈: HP 50% 이하에서 빛↔어둠 속성 전환 (양 속성 덱에 창을 열어줌)
      if (e.isBoss && e.bossPhase === 1 && e.hp <= e.maxHp * 0.5) {
        e.bossPhase = 2;
        e.element = e.element === 'light' ? 'dark' : 'light';
        this.scene.vfx.burst(e.pos.x, e.pos.z, e.element === 'dark' ? 0x4a4e9e : 0xf2ce6b, 26, 4, 2);
        this.scene.vfx.ring(e.pos.x, e.pos.z, 0xffffff, 5, 0.7);
        bus.emit('toast', { text: '🌗 키메라 페이즈 2 — 속성 전환!', kind: 'bad' });
      }
      // 적 반격: 근처 방어자(유닛) 타격. 포획 대상 야생은 비적대.
      if (!e.capturable) {
        if (e.atkCd > 0) e.atkCd -= dt;
        else if (this.dealEnemyAttack(e)) e.atkCd = 1 / ENEMY.attackSpeed;
      }
    }
  }

  /** 적이 사거리 내 가장 가까운 방어자를 타격. 명중 시 true. */
  private dealEnemyAttack(e: Enemy): boolean {
    let best: Monster | null = null;
    let bd: number = ENEMY.engageRange;
    for (const m of this.units) {
      if (!m.alive) continue;
      const d = Math.hypot(m.pos.x - e.pos.x, m.pos.z - e.pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return false;
    const dmg = Math.max(1, Math.round(e.def.attack * this.enemyAtkScale));
    best.takeDamage(dmg);
    this.scene.vfx.floatText(best.pos.x, best.pos.z, `-${dmg}`, '#ff6a6a');
    return true;
  }

  private updateHealers(dt: number): void {
    this.healTimer -= dt;
    if (this.healTimer > 0) return;
    this.healTimer = 1;
    const healers = this.enemies.filter((e) => e.def.healer && e.alive);
    if (!healers.length) return;
    // 각 적은 사거리 내 힐러가 있으면 1회만 회복(중첩 방지). 힐러/보스는 회복 대상 제외.
    for (const e of this.enemies) {
      if (!e.alive || e.def.healer || e.isBoss) continue;
      if (healers.some((h) => e.pos.distanceTo(h.pos) < 5)) {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04);
      }
    }
  }

  private leak(e: Enemy): void {
    const amt = e.def.leak === 'boss' ? BASE_LEAK_BOSS : e.def.leak === 'miniboss' ? BASE_LEAK_MINIBOSS : BASE_LEAK_NORMAL;
    this.state.baseHp = Math.max(0, this.state.baseHp - amt);
    bus.emit('base:damage', { amount: amt, hp: this.state.baseHp });
    this.scene.vfx.ring(this.scene.base.position.x, this.scene.base.position.z, 0xc0392b, 4, 0.4);
  }

  private onKill(e: Enemy): void {
    bus.emit('enemy:killed', { element: e.element, x: e.pos.x, z: e.pos.z, isBoss: e.isBoss });
    this.scene.vfx.burst(e.pos.x, e.pos.z, ELEMENT_COLOR[e.element === 'neutral' ? 'light' : e.element] ?? 0xffffff, 10);
    this.state.gold += e.isBoss ? 100 : e.isMini ? 30 : 3;
    if (this.hasDarkS3) this.darkKillMult = Math.min(1 + DARK_KILL_STACK_MAX, this.darkKillMult + DARK_KILL_STACK);
  }

  private despawn(i: number): void {
    this.enemies[i].dispose(this.scene.entities);
    this.enemies.splice(i, 1);
  }

  // ── 데미지 헬퍼 ───────────────────────────────────
  /** 표식/협동기 트리거 O. 유닛·카드 공격용. */
  hitEnemy(e: Enemy, amount: number, element: ElementOrNeutral, stage: number, opts: { ignoreDef?: boolean; darkBonus?: number } = {}): number {
    let mult = affinity(element, e.element);
    if (opts.darkBonus && e.element === 'dark') mult *= opts.darkBonus;
    const dealt = e.applyDamage(amount * mult, opts.ignoreDef);
    this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt), mult > 1.1 ? '#ffd84f' : '#ffffff');
    // 무속성은 협동기 반응 없음
    if (element !== 'neutral') this.synergy.onReaction(e, element, stage, amount, this);
    return dealt;
  }

  /** 표식 도트: 협동기 트리거 X (무한 발동 방지). */
  private damageDot(e: Enemy, amount: number, _element: Element): void {
    e.applyDamage(amount);
  }

  // ── SynergyCtx 구현 ───────────────────────────────
  enemiesInRadius(x: number, z: number, r: number): Enemy[] {
    return this.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - x, e.pos.z - z) <= r);
  }
  allEnemies(): Enemy[] {
    return this.enemies.filter((e) => e.alive);
  }
  zonesNear(x: number, z: number, r: number): GroundZone[] {
    return this.zones.filter((z2) => !z2.dead && Math.hypot(z2.center.x - x, z2.center.z - z) <= r + z2.radius);
  }
  aoeDamage(x: number, z: number, r: number, amount: number, element: Element, ignoreDef = false): void {
    for (const e of this.enemiesInRadius(x, z, r)) {
      const dealt = e.applyDamage(amount * affinity(element, e.element), ignoreDef);
      this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt));
    }
  }
  shieldAllies(pct: number): void {
    for (const m of this.units) m.addShield(m.maxHp * pct);
  }
  vfxRing(x: number, z: number, color: number, r: number, dur: number): void {
    this.scene.vfx.ring(x, z, color, r, dur);
  }
  vfxBurst(x: number, z: number, color: number, n: number): void {
    this.scene.vfx.burst(x, z, color, n);
  }
  banner(name: string, a: Element, b: Element, x: number, z: number): void {
    bus.emit('synergy:fire', { name, x, z, a, b });
  }

  // ── 타겟팅 ────────────────────────────────────────
  private frontTargetInRange(x: number, z: number, range: number, preferCursed = false): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d > range) continue;
      let score = e.progress();
      // 야생(포획 대상)은 후순위: 위협을 먼저 처치하고, 야생은 비살상이라 남는 타격으로만 약화.
      if (e.capturable) score -= 2;
      if (preferCursed && e.marks.has('curse')) score += 1;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // ── 성(거점) 공격/포획 — 주인공 통합 ──────────────
  /** 성이 사거리 내 적 공격 (공용 스킬 반영: 회전베기 광역 / 함성 강화). */
  private updateCastleAttack(dt: number): void {
    if (this.castleCd > 0) { this.castleCd -= dt; return; }
    const base = this.scene.base.position;
    const range = HERO.range + this.state.heroRangeBonus;
    const inRange = this.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - base.x, e.pos.z - base.z) <= range);
    if (inRange.length === 0) return;
    this.castleCd = 1 / HERO.attackSpeed;
    let dmg = HERO.attack;
    if (this.state.flagWarcry) dmg *= 1.1;
    const score = (e: Enemy) => e.progress() - (e.capturable ? 2 : 0);
    const targets = this.state.flagWhirl ? inRange : [inRange.sort((a, b) => score(b) - score(a))[0]];
    for (const e of targets) {
      const dealt = e.applyDamage(dmg);
      this.scene.vfx.floatText(e.pos.x, e.pos.z, String(dealt));
    }
    // 성 평타 탄 (선두 대상) — 잘 보이게
    const primary = targets[0];
    const p = new Projectile(base, primary, 0xffe08a, 16, false, (hit) => {
      if (hit) this.scene.vfx.burst(hit.pos.x, hit.pos.z, 0xffe08a, 6, 2, 1);
    });
    this.projectiles.push(p);
    this.scene.entities.add(p.mesh);
    this.scene.vfx.ring(base.x, base.z, this.state.flagWhirl ? 0xf2ce6b : 0xffe08a, this.state.flagWhirl ? range : 2.4, 0.25);
  }

  // ── 포획 카드 (마나 0, 핀 고정) ────────────────────
  /** 로스터가 가득 차기 전 = 모집, 가득 차면 = 적 속박(§9). */
  captureMode(): 'recruit' | 'bind' {
    return this.state.roster.length >= MAX_MONSTERS ? 'bind' : 'recruit';
  }

  /** 포획 카드 사용 가능 여부 (쿨다운 + 대상 존재). */
  capturePlayable(): boolean {
    if (this.captureCd > 0) return false;
    if (this.captureMode() === 'recruit') return this.enemies.some((e) => e.alive && e.capturable);
    return this.enemies.some((e) => e.alive);
  }

  /** 포획 카드 쿨다운 진행률 0~1 (카드 오버레이 표시용). */
  captureCdFrac(): number {
    const max = this.captureMode() === 'bind' ? CAPTURE_CARD.bindCd : CAPTURE_CARD.recruitCd;
    return this.captureCd > 0 ? this.captureCd / max : 0;
  }

  /** 포획 카드 시전. point = 드롭 지점(정밀), 없으면 스마트 타깃(더블클릭/키). */
  playCapture(point?: Vec2): boolean {
    if (this.captureCd > 0) return false;
    return this.captureMode() === 'bind' ? this.castBind(point) : this.castRecruit(point);
  }

  /** 모집: 드롭 지점에 가장 가까운 야생 포획 대상에게 포획구 투척. HP 낮을수록 성공률↑. */
  private castRecruit(point?: Vec2): boolean {
    const from = point ?? this.castleXZ();
    let target: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !e.capturable) continue;
      const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z);
      if (d < bd) { bd = d; target = e; }
    }
    if (!target) { bus.emit('toast', { text: '포획할 야생 몬스터가 없습니다', kind: 'bad' }); return false; }
    this.captureCd = CAPTURE_CARD.recruitCd;
    const t = target;
    const orb = new Projectile(this.scene.base.position, t, 0x4fd0c0, 16, true, (hit) => {
      if (!hit || !hit.alive) return;
      const chance = hit.captureChance(CAPTURE.base, CAPTURE.hpFactor, CAPTURE.cap, this.state.captureBonus);
      const success = Math.random() < chance;
      bus.emit('capture:attempt', { success, chance, element: hit.captureElement! });
      if (success) {
        this.captureEnemy(hit);
      } else {
        if (this.state.flagThrowBoost) { hit.applyDamage(15); hit.zoneSlow = 0.4; }
        this.scene.vfx.burst(hit.pos.x, hit.pos.z, 0x888888, 8);
      }
    });
    this.projectiles.push(orb);
    this.scene.entities.add(orb.mesh);
    return true;
  }

  /** 속박: 로스터가 가득 찬 뒤의 포획 카드. 지점 주변 적을 짧게 묶는다. */
  private castBind(point?: Vec2): boolean {
    const p = point ?? this.frontEnemyPoint() ?? this.castleXZ();
    const hit = this.enemiesInRadius(p.x, p.z, CAPTURE_CARD.bindRadius);
    if (hit.length === 0) { bus.emit('toast', { text: '속박할 적이 없습니다', kind: 'bad' }); return false; }
    this.captureCd = CAPTURE_CARD.bindCd;
    for (const e of hit) e.rootTimer = Math.max(e.rootTimer, CAPTURE_CARD.bindDuration);
    this.scene.vfx.ring(p.x, p.z, 0x4fd0c0, CAPTURE_CARD.bindRadius, 0.5);
    this.scene.vfx.burst(p.x, p.z, 0x4fd0c0, 12);
    bus.emit('toast', { text: `적 ${hit.length}체 속박!`, kind: 'good' });
    return true;
  }

  /** 가장 앞선(기지 근접) 살아있는 적 위치 — 스마트 타깃용. */
  private frontEnemyPoint(): Vec2 | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!best || e.progress() > best.progress()) best = e;
    }
    return best ? { x: best.pos.x, z: best.pos.z } : null;
  }

  private captureEnemy(e: Enemy): void {
    const el = e.captureElement!;
    const isDup = this.state.hasElement(el);
    const full = this.state.monstersFull && !isDup;
    if (full) {
      // 최대 3종 → 신규 불가. 골드로 보상.
      this.state.gold += 15;
      bus.emit('toast', { text: `몬스터 슬롯 가득 참 (최대 ${this.state.roster.length}종). 골드 획득`, kind: 'bad' });
    } else {
      this.state.giveUnit(el, e.captureLevel); // 중복이면 내부에서 경험치 처리
      bus.emit('toast', { text: isDup ? '중복 포획! 경험치 획득' : `야생 몬스터 포획 성공! (Lv${e.captureLevel})`, kind: 'good' });
    }
    bus.emit('capture:done', { element: el });
    this.scene.vfx.ring(e.pos.x, e.pos.z, 0x4fd0c0, 4, 0.6);
    this.scene.vfx.burst(e.pos.x, e.pos.z, 0x4fd0c0, 24);
    e.alive = false;
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.despawn(i);
  }

  // ── 투사체/장판 ───────────────────────────────────
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

  // ── 카드 사용 ─────────────────────────────────────
  /**
   * 카드 시전. point = 전장 드롭 지점(드래그, 정밀). 없으면 지점형 카드는
   * 최전방 적을 스마트 타깃(더블클릭/숫자키). 포획 카드는 특수 처리.
   */
  playCard(id: string, point?: Vec2): boolean {
    if (id === CAPTURE_CARD_ID) return this.playCapture(point);
    const def = CARD_BY_ID[id];
    if (!def) return false;
    // 부활 카드: 대상이 없으면 마나 소모 전에 차단 (헛시전 방지)
    if (def.effect.kind === 'revive' && (!this.state.reviveAvailable || this.deadUnits.length === 0)) {
      bus.emit('toast', { text: this.state.reviveAvailable ? '부활시킬 쓰러진 유닛이 없습니다' : '부활은 런당 1회만 가능', kind: 'bad' });
      return false;
    }
    let pt = point;
    if ((def.target === 'point' || def.target === 'enemy-area') && !pt) {
      pt = this.frontEnemyPoint() ?? this.castleXZ();
    }
    if (!this.deck.consume(id)) return false;
    this.applyCardEffect(def.effect, def.element, pt);
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
      case 'damage': {
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          this.hitEnemy(e, fx.amount, fx.element, stage, { ignoreDef: false });
          if (fx.mark) e.marks.add(fx.mark, fx.markStacks ?? 1);
          if (fx.knockback) e.knockback(fx.knockback);
        }
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), fx.radius, 0.4);
        this.scene.vfx.burst(p.x, p.z, colorOf(fx.element), 14);
        break;
      }
      case 'chain': {
        const d2 = (e: Enemy) => (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
        const near = this.enemiesInRadius(p.x, p.z, 8).sort((a, b) => d2(a) - d2(b)).slice(0, fx.targets);
        for (const e of near) {
          this.hitEnemy(e, fx.amount, fx.element, stage);
          if (fx.mark) e.marks.add(fx.mark, fx.markStacks ?? 1);
          this.scene.vfx.burst(e.pos.x, e.pos.z, colorOf(fx.element), 8);
        }
        break;
      }
      case 'zone':
        this.addZone(fx.zone, fx.element, p.x, p.z, fx.radius, fx.duration, { slow: fx.slow, dps: fx.dps, root: fx.root });
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), fx.radius, 0.4);
        break;
      case 'shieldAll':
        this.shieldAllies(fx.pct);
        this.units.forEach((m) => this.scene.vfx.burst(m.pos.x, m.pos.z, 0x9fd8ff, 6));
        break;
      case 'healAll':
        this.units.forEach((m) => { m.heal(fx.amount); this.scene.vfx.floatText(m.pos.x, m.pos.z, `+${fx.amount}`, '#6fae4c'); });
        break;
      case 'markArea':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          this.synergy.onReaction(e, fx.element, stage, 10, this);
          e.marks.add(fx.mark, fx.stacks);
        }
        this.scene.vfx.ring(p.x, p.z, colorOf(fx.element), fx.radius, 0.4);
        break;
      case 'defDown':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          e.defDownPct = fx.pct; e.defDownTimer = fx.duration; e.marks.add('curse', 1);
          this.synergy.onReaction(e, fx.element, stage, 10, this);
        }
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, fx.radius, 0.4);
        break;
      case 'drain': {
        let total = 0;
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          total += this.hitEnemy(e, fx.amount, fx.element, stage);
          e.marks.add('curse', 1);
        }
        const heal = total * fx.drainPct;
        this.units.forEach((m) => m.heal(heal / Math.max(1, this.units.length)));
        this.scene.vfx.ring(p.x, p.z, ELEMENT_COLOR.dark, fx.radius, 0.4);
        break;
      }
      case 'eclipseVerdict':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          const cs = e.marks.stacks('curse');
          if (cs >= 5) { e.applyDamage(cs * 25, true); e.marks.remove('curse'); }
          // 즉사 처형은 보스/미니보스 제외 (보스는 실제 피해로만 처치)
          if (!e.isBoss && !e.isMini && e.hp / e.maxHp <= fx.executePct) e.applyDamage(e.hp + 1, true);
          this.scene.vfx.burst(e.pos.x, e.pos.z, 0x4a4e9e, 12);
        }
        this.scene.vfx.ring(p.x, p.z, 0x4a4e9e, fx.radius + 1, 0.6);
        break;
      case 'blessOne': {
        const target = this.units.filter((m) => m.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (target) target.bless(fx.stacks);
        break;
      }
      case 'cleanseHeal':
        this.units.forEach((m) => { m.heal(fx.amount); m.cleanse(); });
        break;
      case 'judgment':
        for (const e of this.enemiesInRadius(p.x, p.z, fx.radius)) {
          this.hitEnemy(e, fx.amount, 'light', stage, { darkBonus: fx.darkBonus });
        }
        this.scene.vfx.ring(p.x, p.z, 0xf2ce6b, fx.radius, 0.5);
        this.scene.vfx.burst(p.x, p.z, 0xf2ce6b, 16);
        break;
      case 'revive':
        if (this.state.reviveAvailable && this.deadUnits.length) {
          const u = this.deadUnits.shift()!;
          const slot = UNIT_SLOTS.findIndex((_, i) => !this.units.some((m) => m.slot === i));
          if (slot >= 0) { this.placeUnit(u, slot); const m = this.slotOccupant(slot); if (m) m.hp = m.maxHp * 0.5; }
          this.state.reviveAvailable = false;
          bus.emit('toast', { text: '유닛 부활!', kind: 'good' });
        }
        break;
      case 'overheat':
        this.units.filter((m) => m.element === 'fire').forEach((m) => { m.overheatMult = fx.mult; m.overheatTimer = fx.duration; });
        bus.emit('toast', { text: '오버히트! 불 유닛 강화', kind: 'good' });
        break;
      case 'draw': {
        const uniq = [...new Set(this.state.battleDeck())].filter((c) => !this.deck.hand.includes(c));
        for (let k = 0; k < fx.n && uniq.length; k++) {
          const pick = uniq.splice(Math.floor(Math.random() * uniq.length), 1)[0];
          this.deck.addToHand(pick);
        }
        break;
      }
      case 'placementUp':
        this.state.placementCap += fx.n;
        bus.emit('toast', { text: `배치 상한 +${fx.n}`, kind: 'good' });
        break;
      case 'coinflip':
        if (Math.random() < 0.5) { this.state.gold += 20; bus.emit('toast', { text: '동전 앞면! 골드 +20', kind: 'good' }); }
        else bus.emit('toast', { text: '동전 뒷면… 꽝', kind: 'bad' });
        break;
    }
  }

  /** 스테이지 종료 시 호출 — 죽은 유닛/hero hp 상태를 GameState에 반영, 정리 */
  finish(): void {
    // 죽은 유닛 추적 (부활 카드용은 스테이지 내 한정이므로 리셋)
    this.deadUnits = [];
    for (const m of [...this.units]) m.dispose(this.scene.entities);
    for (const e of [...this.enemies]) e.dispose(this.scene.entities);
    for (const p of [...this.projectiles]) p.dispose(this.scene.entities);
    for (const z of [...this.zones]) z.dispose(this.scene.zones);
    this.units = []; this.enemies = []; this.projectiles = []; this.zones = [];
  }
}
