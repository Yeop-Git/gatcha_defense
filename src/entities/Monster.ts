import * as THREE from 'three';
import type { Element } from '../core/types';
import { type OwnedUnit, type DerivedStats, deriveStats, unitName } from '../core/GameState';
import { makeCreature, makeLabelSprite, makeTextSprite, disposeCreatureView } from '../render/fallback';
import { BLESS_BUFF_PER_STACK, FLOAT, isFloating } from '../data/constants';

/** 배치된 아군 유닛 (고정 슬롯). OwnedUnit(육성 모델)을 감싼 전투 인스턴스. */
export class Monster {
  unit: OwnedUnit;
  element: Element;
  stats: DerivedStats;
  hp: number;
  maxHp: number;
  shield = 0;
  blessStacks = 0;
  slot: number;
  view: THREE.Group;
  pos = new THREE.Vector3();
  atkCd = 0;
  alive = true;
  overheatTimer = 0;
  overheatMult = 1;
  private shieldMesh: THREE.Mesh;
  private blessSprite?: THREE.Sprite;

  constructor(unit: OwnedUnit, slot: number, x: number, z: number, atkMult: number) {
    this.unit = unit;
    this.element = unit.element;
    this.slot = slot;
    this.stats = deriveStats(unit);
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this._atkMult = atkMult;

    const scale = 0.85 + unit.stage * 0.18;
    this.view = makeCreature(unit.element, scale, unit.stage);
    this.pos.set(x, 0, z);
    this.view.position.copy(this.pos);

    // 이름표 (다글자 한글도 안 깨지는 라벨)
    const label = makeLabelSprite(unitName(unit), { worldHeight: 0.5 });
    label.position.set(0, 2.3 + unit.stage * 0.2, 0);
    this.view.add(label);

    // 보호막 셸
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1 * scale, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shieldMesh.position.y = 0.9 * scale;
    this.view.add(this.shieldMesh);
  }

  private _atkMult = 1;

  /** 유효 공격력 (버프/축복/오버히트/글로벌 반영) */
  attackPower(): number {
    let p = this.stats.attack * this._atkMult;
    p *= 1 + this.blessStacks * BLESS_BUFF_PER_STACK;
    p *= this.overheatMult;
    return p;
  }

  addShield(amount: number): void {
    this.shield += amount;
  }

  bless(stacks: number): void {
    this.blessStacks = Math.min(3, this.blessStacks + stacks);
    if (!this.blessSprite) {
      this.blessSprite = makeTextSprite('✨', 0.5);
      this.blessSprite.position.set(0.6, 1.8, 0);
      this.view.add(this.blessSprite);
    }
  }

  cleanse(): void {
    // 아군 디버프 없음(간소화) — 회복만 상위에서 처리. 축복 유지.
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  takeDamage(amount: number): void {
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
  }

  update(dt: number, t: number): void {
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.overheatTimer > 0) {
      this.overheatTimer -= dt;
      if (this.overheatTimer <= 0) this.overheatMult = 1;
    }
    // 빛/어둠 = 부유(floating) 대기 연출. 나머지는 접지(기본 애니메이션 추후).
    this.view.position.y = isFloating(this.element)
      ? FLOAT.height + Math.sin(t * FLOAT.speed + this.slot) * FLOAT.amp
      : 0;
    // 보호막 셸 표시
    const smat = this.shieldMesh.material as THREE.MeshBasicMaterial;
    smat.opacity = this.shield > 0 ? 0.25 + Math.sin(t * 6) * 0.05 : 0;
  }

  dispose(parent: THREE.Object3D): void {
    parent.remove(this.view);
    disposeCreatureView(this.view);
  }
}
