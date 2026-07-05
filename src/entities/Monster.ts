import * as THREE from 'three';
import type { Element } from '../core/types';
import { type OwnedUnit, type DerivedStats, deriveStats, displayName } from '../core/GameState';
import { makeCreature, makeEnemy, makeLabelSprite, makeTextSprite, disposeCreatureView } from '../render/fallback';
import { ENEMIES } from '../data/enemies';
import { BLESS_BUFF_PER_STACK, CAPTURED_BOSS_SCALE, FLOAT, isFloating, MARK, unitHeight } from '../data/constants';

/** 유닛 머리 위 HP 바 스프라이트 (피격 시 표시). 적 체력바와 동일 방식. */
function makeUnitBar(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 10;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  sp.scale.set(1.3, 0.2, 1);
  (sp.material.map as THREE.Texture).needsUpdate = true;
  return sp;
}

function drawUnitBar(sp: THREE.Sprite, frac: number): void {
  const tex = sp.material.map as THREE.CanvasTexture;
  const c = tex.image as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 64, 10);
  ctx.fillStyle = frac > 0.5 ? '#54e0c8' : frac > 0.25 ? '#d8a93b' : '#c0392b';
  ctx.fillRect(1, 1, 62 * Math.max(0, frac), 8);
  tex.needsUpdate = true;
}

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
  /** 피격 플래시 타이머(>0이면 붉은 번쩍 + 흔들림). */
  hitFlash = 0;
  private hpBar: THREE.Sprite;
  private hitMesh: THREE.Mesh;
  overheatTimer = 0;
  overheatMult = 1;
  hasteMult = 1;
  private hasteTimer = 0;
  private shieldMesh: THREE.Mesh;
  private marker!: THREE.Mesh;
  private blessSprite?: THREE.Sprite;

  constructor(unit: OwnedUnit, slot: number, x: number, z: number, atkMult: number) {
    this.unit = unit;
    this.element = unit.element;
    this.slot = slot;
    this.stats = deriveStats(unit);
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this._atkMult = atkMult;

    // 렌더: creature=팔레트 크리처, enemy=포획한 적의 GLTF(애니메이션 포함).
    let shieldScale: number;
    let labelY: number;
    if (unit.kind === 'enemy') {
      const edef = ENEMIES[unit.species ?? ''] ?? ENEMIES.slime;
      const bossy = edef.tier === 'boss' || edef.tier === 'miniboss';
      // 정규화 높이(진화 시 소폭 성장) · 포획한 보스체는 크게 · 아군은 대기(걷기 회피)
      const h = unitHeight(unit.stage) * (bossy ? CAPTURED_BOSS_SCALE : 1);
      this.view = makeEnemy(edef.element, edef.radius, edef.flying, edef.model, 'idle', h);
      shieldScale = h * 0.5;
      labelY = h + 0.5;
    } else {
      const h = unitHeight(unit.stage);
      const scale = h / 1.85; // makeCreature: attachModel 높이 = 1.85*scale = h
      this.view = makeCreature(unit.element, scale, unit.stage);
      shieldScale = scale;
      labelY = h + 0.3;
    }
    this.pos.set(x, 0, z);
    this.view.position.copy(this.pos);

    // 이름표 (레벨 + 닉네임). 머리 위에 몇 레벨인지 표시.
    const label = makeLabelSprite(`Lv${unit.level} ${displayName(unit)}`, { worldHeight: 0.5 });
    label.position.set(0, labelY, 0);
    this.view.add(label);

    // 보호막 셸 (개체 고유 지오메트리 — dispose 대상 표시)
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1 * shieldScale, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shieldMesh.position.y = 0.9 * shieldScale;
    this.shieldMesh.userData.placeholder = true;
    this.view.add(this.shieldMesh);

    // 아군 표식: 발밑 청록 링 (내가 쓰는 유닛 ↔ 적을 한눈에 구분). 포획체/크리처 공통.
    const mr = Math.max(0.9, shieldScale * 1.25);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(mr * 0.72, mr, 28),
      new THREE.MeshBasicMaterial({ color: 0x54e0c8, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.07;
    this.marker.userData.placeholder = true;
    this.view.add(this.marker);

    // HP 바 (피격 시 표시) — 유닛도 쓰러질 수 있으므로 체력을 시각화한다.
    this.hpBar = makeUnitBar();
    this.hpBar.position.set(0, labelY + 0.42, 0);
    this.hpBar.visible = false;
    this.view.add(this.hpBar);

    // 피격 붉은 셸: 맞는 순간 번쩍이고, 저체력일 땐 은은히 경고 글로우.
    this.hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15 * shieldScale, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.hitMesh.position.y = 0.9 * shieldScale;
    this.hitMesh.userData.placeholder = true;
    this.view.add(this.hitMesh);
  }

  /** 공격 타겟을 바라보게 회전 목표 설정 (모델 +Z 정면 기준). */
  faceTowards(x: number, z: number): void {
    this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
  }
  private targetYaw: number | null = null;

  private _atkMult = 1;

  /** 유효 공격력 (버프/축복/오버히트/글로벌 반영) */
  attackPower(): number {
    // 공격 버프(unitAtkMult)는 deriveStats에서 이미 반영됨(이중 적용 방지).
    let p = this.stats.attack;
    p *= 1 + this.blessStacks * BLESS_BUFF_PER_STACK;
    p *= this.overheatMult;
    return p;
  }

  addShield(amount: number): void {
    this.shield += amount;
  }

  private blessTimer = 0;

  /** 축복 (§4.3): 공/방 강화, 지속시간 만료 시 해제. */
  bless(stacks: number): void {
    this.blessStacks = Math.min(MARK.bless.maxStacks, this.blessStacks + stacks);
    this.blessTimer = MARK.bless.duration;
    if (!this.blessSprite) {
      this.blessSprite = makeTextSprite('✨', 0.5);
      this.blessSprite.position.set(0.6, 1.8, 0);
      this.view.add(this.blessSprite);
    }
  }

  private clearBless(): void {
    this.blessStacks = 0;
    if (this.blessSprite) {
      this.view.remove(this.blessSprite);
      (this.blessSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.blessSprite.material.dispose();
      this.blessSprite = undefined;
    }
  }

  cleanse(): void {
    // 아군 디버프 없음(간소화) — 회복만 상위에서 처리. 축복 유지.
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateHpBar();
  }

  /** 적에게 피격. 보호막 우선 흡수 후 HP 감소, 피격 플래시 트리거. 0이면 쓰러짐(alive=false). 실제 HP 피해 반환. */
  takeDamage(amount: number): number {
    if (!this.alive) return 0;
    let dmg = Math.max(1, Math.round(amount));
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.hitFlash = 0.24;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    this.updateHpBar();
    return dmg;
  }

  /** 다음 웨이브 복귀: HP 완전 회복 + 부활(쓰러진 유닛 전열 복귀). */
  restoreFull(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.hitFlash = 0;
    this.updateHpBar();
  }

  private updateHpBar(): void {
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hpBar.visible = this.alive && frac < 0.999;
    drawUnitBar(this.hpBar, frac);
  }

  refreshStats(): void {
    const beforeMax = this.maxHp;
    this.element = this.unit.element;
    this.stats = deriveStats(this.unit);
    this.maxHp = this.stats.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - beforeMax));
  }

  // (제거됨) takeDamage: 아군 유닛은 불사(방어 포탑) 설계 — 적이 유닛을 공격하는 로직이 없어
  // 호출되지 않던 죽은 코드였다. 유닛 HP/보호막은 넉백·포획 판정 등 내부용으로만 유지.

  /** 공속 버프 (전열 강화 카드). */
  applyHaste(mult: number, duration: number): void {
    this.hasteMult = Math.max(this.hasteMult, mult);
    this.hasteTimer = duration;
  }

  /** 버프 반영 유효 공속. */
  effAttackSpeed(): number {
    const tier = this.capturedTier();
    const tierMult = tier === 'swarm' || tier === 'flyer' ? 1.18 : tier === 'tank' ? 0.9 : 1;
    return this.stats.attackSpeed * this.hasteMult * tierMult;
  }

  capturedTier(): import('../data/enemies').EnemyTier | null {
    if (this.unit.kind !== 'enemy' || !this.unit.species) return null;
    return ENEMIES[this.unit.species]?.tier ?? null;
  }

  capturedTraitLabel(): string {
    const tier = this.capturedTier();
    if (tier === 'swarm') return '무리 본능';
    if (tier === 'flyer') return '공중 추격';
    if (tier === 'tank') return '육중한 타격';
    if (tier === 'healer') return '수호 정령';
    if (tier === 'elite') return '정예 본능';
    if (tier === 'miniboss') return '거대 개체';
    if (tier === 'boss') return '보스의 잔재';
    return '';
  }

  capturedTraitDesc(): string {
    const tier = this.capturedTier();
    if (tier === 'swarm') return '공격 속도가 빠르고, 가끔 같은 대상에게 추가타를 넣습니다.';
    if (tier === 'flyer') return '공격 속도가 빠르고, 명중 시 가까운 적 하나를 함께 추격합니다.';
    if (tier === 'tank') return '공격 속도는 느리지만 명중한 적을 밀어내고 잠시 붙잡습니다.';
    if (tier === 'healer') return '공격할 때마다 성을 조금 수리하고, 가끔 자신에게 축복을 부여합니다.';
    if (tier === 'elite') return '기본 공격력이 높고, 명중 지점 주변에 작은 폭발 피해를 줍니다.';
    if (tier === 'miniboss') return '강한 공격력과 넓은 폭발 피해를 지닌 거대 포획체입니다.';
    if (tier === 'boss') return '매우 강한 공격력과 넓은 폭발 피해를 지닌 특별한 포획체입니다.';
    return '';
  }

  update(dt: number, t: number): void {
    if (this.atkCd > 0) this.atkCd -= dt;
    // GLTF 내장 애니메이션 (대기 등)
    const mixer = this.view.userData.mixer as THREE.AnimationMixer | undefined;
    if (mixer) mixer.update(dt);
    if (this.overheatTimer > 0) {
      this.overheatTimer -= dt;
      if (this.overheatTimer <= 0) this.overheatMult = 1;
    }
    if (this.hasteTimer > 0) {
      this.hasteTimer -= dt;
      if (this.hasteTimer <= 0) this.hasteMult = 1;
    }
    if (this.blessTimer > 0) {
      this.blessTimer -= dt;
      if (this.blessTimer <= 0) this.clearBless();
    }
    // 공격 타겟을 바라보게 부드럽게 회전
    if (this.targetYaw !== null) {
      let d = this.targetYaw - this.view.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.view.rotation.y += d * Math.min(1, dt * 10);
    }
    // 빛/어둠 = 부유(floating) 둥둥 대기 연출. 나머지는 접지.
    this.view.position.y = this.unit.kind === 'creature' || isFloating(this.element)
      ? FLOAT.height + Math.sin(t * FLOAT.speed + this.slot) * FLOAT.amp
      : 0;
    // 아군 링: 지면 고정(부유 유닛이라도 딸려 올라가지 않게) + 은은한 맥동
    this.marker.position.y = 0.07 - this.view.position.y;
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 3 + this.slot) * 0.22;
    // 보호막 셸 표시
    const smat = this.shieldMesh.material as THREE.MeshBasicMaterial;
    smat.opacity = this.shield > 0 ? 0.25 + Math.sin(t * 6) * 0.05 : 0;

    // 피격 반응: 맞는 순간 붉은 플래시 + 흔들림. 평상시엔 저체력이면 은은한 경고 글로우.
    const hm = this.hitMesh.material as THREE.MeshBasicMaterial;
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      hm.opacity = Math.min(0.7, this.hitFlash * 3);
      const shake = this.hitFlash * 0.16;
      this.view.position.x = this.pos.x + (Math.random() * 2 - 1) * shake;
      this.view.position.z = this.pos.z + (Math.random() * 2 - 1) * shake;
    } else {
      this.view.position.x = this.pos.x;
      this.view.position.z = this.pos.z;
      const low = this.alive && this.hp / this.maxHp < 0.3;
      hm.opacity = low ? 0.1 + (Math.sin(t * 8) * 0.5 + 0.5) * 0.14 : 0;
    }
  }

  dispose(parent: THREE.Object3D): void {
    this.hpBar.material.map?.dispose();
    this.hpBar.material.dispose();
    this.hitMesh.geometry.dispose();
    (this.hitMesh.material as THREE.Material).dispose();
    parent.remove(this.view);
    disposeCreatureView(this.view);
  }
}
