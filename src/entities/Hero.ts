import * as THREE from 'three';
import { HERO } from '../data/constants';
import { makeHero } from '../render/fallback';

/**
 * 주인공: 고정 배치형(이동 없음). 슬롯에 배치되어 자동 공격 + 포획 담당. 무속성.
 */
export class Hero {
  view: THREE.Group;
  pos = new THREE.Vector3(0, 0, -6);
  hp: number;
  maxHp: number;
  atkCd = 0;
  slot = -1; // 배치 전 -1

  constructor(hpMax: number) {
    this.maxHp = hpMax;
    this.hp = hpMax;
    this.view = makeHero();
    this.view.visible = false; // 배치 전 숨김
    this.view.position.copy(this.pos);
  }

  get placed(): boolean {
    return this.slot >= 0;
  }

  place(slot: number, x: number, z: number): void {
    this.slot = slot;
    this.pos.set(x, 0, z);
    this.view.position.copy(this.pos);
    this.view.visible = true;
  }

  unplace(): void {
    this.slot = -1;
    this.view.visible = false;
  }

  update(dt: number, t: number): void {
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.view.visible) this.view.position.y = Math.sin(t * 2) * 0.08; // 대기 바운스
  }

  canAttack(): boolean {
    return this.placed && this.atkCd <= 0;
  }

  resetAttackCd(): void {
    this.atkCd = 1 / HERO.attackSpeed;
  }
}
