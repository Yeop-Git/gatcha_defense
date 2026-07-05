import * as THREE from 'three';
import type { Element, ElementOrNeutral } from '../core/types';
import type { EnemyDef } from '../data/enemies';
import { FIELD, CURSE_DMG_PER_STACK, WET_SLOW, FLOAT, isFloating, CAPTURE, ENEMY_HEIGHT } from '../data/constants';
import { makeCreature, makeEnemy, disposeCreatureView } from '../render/fallback';
import { Marks } from './Marks';

const PATH = FIELD.path;

/** 상태바(HP) 스프라이트 */
function makeBar(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 10;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
  sp.scale.set(1.4, 0.22, 1);
  (sp.material.map as THREE.Texture).needsUpdate = true;
  return sp;
}

function drawBar(sp: THREE.Sprite, frac: number): void {
  const tex = sp.material.map as THREE.CanvasTexture;
  const c = tex.image as HTMLCanvasElement;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 64, 10);
  ctx.fillStyle = frac > 0.5 ? '#6fae4c' : frac > 0.25 ? '#d8a93b' : '#c0392b';
  ctx.fillRect(1, 1, 62 * Math.max(0, frac), 8);
  tex.needsUpdate = true;
}

export class Enemy {
  def: EnemyDef;
  element: ElementOrNeutral;
  hp: number;
  maxHp: number;
  /** 스테이지 난이도 점프로 스케일된 실효 공격력(유닛 타격·공성 공용). */
  attack: number;
  speed: number;
  view: THREE.Group;
  marks: Marks;
  pos = new THREE.Vector3();
  alive = true;
  reachedBase = false;
  /** 성문 공성 중(일반 적): 경로 끝에 도달해 제자리에서 성을 주기 공격한다. Battle이 타격을 구동. */
  atBase = false;
  siegeTimer = 0;
  /** 아군 유닛과 교전 중(일반 적): 사거리 내 아군을 만나 진격을 멈추고 공격한다. Battle이 구동. */
  engaging = false;
  unitAtkCd = 0;
  isBoss: boolean;
  isMini: boolean;

  // 상태
  private seg = 0;
  private segT = 0;
  rootTimer = 0;
  zoneSlow = 0; // 이번 프레임 장판 감속(0~1), Battle이 매 프레임 세팅
  /** 임시 감속 (증기 장막 등 지속형 디버프): slowTimer 동안 slowPct 적용 */
  slowPct = 0;
  slowTimer = 0;
  defDownPct = 0;
  defDownTimer = 0;
  fearTimer = 0; // 공포(어둠): >0이면 경로를 역주행(뒤로 도망)

  private bar: THREE.Sprite;

  /** 사망 애니메이션 재생 중(디스폰 지연). */
  dying = false;
  deathTimer = 0;

  /** 보스/미니보스 기절(HP0) 상태 — 이 창에서만 포획 가능. 1회성. */
  stunned = false;
  stunTimer = 0;
  private stunUsed = false;
  /** 이번 프레임에 기절(포획 창)에 막 진입했는지 — Battle이 읽어 안내/연출 후 클리어. */
  justStunned = false;

  constructor(def: EnemyDef, hpScale: number, atkScale = 1) {
    this.def = def;
    this.element = def.element;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.attack = Math.max(1, Math.round(def.attack * atkScale));
    this.speed = def.speed;
    this.isBoss = def.leak === 'boss';
    this.isMini = def.leak === 'miniboss';

    // 정규화 높이(티어별, 보스는 크게). 바/표식도 이 높이에 맞춘다.
    const V = ENEMY_HEIGHT[def.tier];
    // 야생 크리처 적: 플레이어 크리처 모델을 재사용(걷기 애니메이션 재생).
    this.view = def.creatureStage
      ? makeCreature(def.element as Element, V / 1.85, def.creatureStage, undefined, true)
      : makeEnemy(this.element, def.radius, def.flying, def.model, 'walk', V);
    const start = PATH[0];
    this.pos.set(start.x, 0, start.z);
    this.view.position.copy(this.pos);

    const topY = V + (def.flying ? 1.2 : 0) + 0.4;
    this.marks = new Marks(this.view, topY);
    this.bar = makeBar();
    this.bar.position.y = topY + 0.5;
    if (this.isBoss || this.isMini) this.bar.scale.set(2.6, 0.36, 1);
    this.view.add(this.bar);
    drawBar(this.bar, 1);
  }

  /** 상태이상(CC) 저항 배율 — 보스/미니보스는 넉백·속박·감속 효과 반감. */
  get ccFactor(): number {
    return this.isBoss ? 0.4 : this.isMini ? 0.5 : 1;
  }

  /** 속박 적용 (CC 저항 반영). */
  applyRoot(duration: number): void {
    this.rootTimer = Math.max(this.rootTimer, duration * this.ccFactor);
  }

  /** 공포 적용 (CC 저항 반영) — 지속시간 동안 경로를 역주행. */
  applyFear(duration: number): void {
    this.fearTimer = Math.max(this.fearTimer, duration * this.ccFactor);
  }

  /** 임시 감속 적용 (증기 장막 등, CC 저항 반영). */
  applySlow(pct: number, duration: number): void {
    this.slowPct = Math.max(this.slowPct, pct * this.ccFactor);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  /** 현재 이동속도 배율 (wet + zoneSlow + 임시감속 합성, root면 0). 보스는 감속 반감. */
  private speedMult(): number {
    if (this.rootTimer > 0) return 0;
    const wet = this.marks.has('wet') ? WET_SLOW : 0;
    const temp = this.slowTimer > 0 ? this.slowPct : 0;
    const slow = Math.min(0.85, (wet + this.zoneSlow) * this.ccFactor + temp);
    return 1 - slow;
  }

  /** 피해 적용 (affinity/치명 등은 호출측에서 미리 배율 반영). 실제 입힌 피해 반환. */
  applyDamage(amount: number, ignoreDef = false): number {
    // 기절 중(보스 포획 창)에는 무적 — 3초 창이 평타에 잘려 사라지지 않게.
    if (!this.alive || this.stunned) return 0;
    let dmg = amount;
    // 저주: 받는 피해 +5%/중첩
    dmg *= 1 + this.marks.stacks('curse') * CURSE_DMG_PER_STACK;
    // 방깎: 받는 피해 증가로 근사
    if (!ignoreDef && this.defDownTimer > 0) dmg *= 1 + this.defDownPct;
    dmg = Math.round(dmg);
    this.hp -= dmg;
    if (this.hp <= 0) {
      if ((this.isBoss || this.isMini) && !this.stunUsed) {
        // HP0 → 즉사 대신 3초 기절(포획 창). 놓치면 update가 사망 처리.
        this.stunned = true;
        this.stunUsed = true;
        this.justStunned = true;
        this.stunTimer = CAPTURE.bossStun;
        this.hp = 0;
      } else {
        this.alive = false;
      }
    }
    drawBar(this.bar, this.hp / this.maxHp);
    return dmg;
  }

  update(dt: number, t: number): void {
    if (!this.alive) return;
    if (this.stunned) {
      // 기절(포획 창): 제자리 흔들림, 창 만료 시 사망 처리(Battle이 디스폰).
      this.stunTimer -= dt;
      this.view.rotation.y += dt * 7;
      if (this.stunTimer <= 0) { this.stunned = false; this.alive = false; }
      return;
    }
    if (this.atBase) {
      // 공성: 전진 없이 제자리. 표식(도트)·내장 애니메이션만 갱신. 성 타격 주기는 Battle이 구동.
      this.marks.update(dt, t);
      const mixer = this.view.userData.mixer as THREE.AnimationMixer | undefined;
      if (mixer) mixer.update(dt * 0.6);
      return;
    }
    if (this.engaging) {
      // 아군 유닛과 교전: 전진 정지, 표식·애니메이션만 갱신(유닛 타격은 Battle이 구동).
      this.marks.update(dt, t);
      const mixer = this.view.userData.mixer as THREE.AnimationMixer | undefined;
      if (mixer) mixer.update(dt);
      return;
    }
    if (this.rootTimer > 0) this.rootTimer -= dt;
    if (this.slowTimer > 0) { this.slowTimer -= dt; if (this.slowTimer <= 0) this.slowPct = 0; }
    if (this.defDownTimer > 0) this.defDownTimer -= dt;
    this.marks.update(dt, t);
    // GLTF 내장 애니메이션 (걷기 등) — 감속/속박 시 재생 속도도 함께 줄어 자연스럽게
    const mixer = this.view.userData.mixer as THREE.AnimationMixer | undefined;
    if (mixer) mixer.update(dt * Math.max(0.25, this.speedMult()));

    // 공포(어둠): 경로를 역주행(뒤로 도망). 전진/기지도달 판정 스킵.
    if (this.fearTimer > 0) {
      this.fearTimer -= dt;
      this.knockback(this.speed * dt * 1.2);
      return;
    }

    // 이동 (경로 따라)
    const mult = this.speedMult();
    let dist = this.speed * mult * dt;
    while (dist > 0 && this.seg < PATH.length - 1) {
      const a = PATH[this.seg];
      const b = PATH[this.seg + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const remain = segLen * (1 - this.segT);
      if (dist < remain) {
        this.segT += dist / segLen;
        dist = 0;
      } else {
        dist -= remain;
        this.seg++;
        this.segT = 0;
      }
    }
    if (this.seg >= PATH.length - 1) {
      if (this.isBoss || this.isMini) {
        // 보스/미니보스: 기존 루프백(Battle이 leak + resetToPathStart 처리).
        this.reachedBase = true;
        this.alive = false;
      } else {
        // 일반 적: 소멸하지 않고 성문 공성 상태로 전환(제자리 정지, Battle이 주기 타격 구동).
        this.atBase = true;
        const end = PATH[PATH.length - 1];
        this.pos.set(end.x, 0, end.z);
        this.view.position.copy(this.pos);
      }
      return;
    }
    // (보스 루프백은 Battle이 resetToPathStart로 처리)
    const a = PATH[this.seg];
    const b = PATH[this.seg + 1];
    this.pos.set(a.x + (b.x - a.x) * this.segT, 0, a.z + (b.z - a.z) * this.segT);
    this.view.position.copy(this.pos);

    // 진행 방향 바라보기 (모델 +Z 정면 기준)
    const dx = b.x - a.x, dz = b.z - a.z;
    if (dx || dz) this.view.rotation.y = Math.atan2(dx, dz);

    // 빛/어둠 = 부유(floating). 그 외는 접지. 폴백 도형은 소소한 바운스(애니메이션 모델은 클립이 담당).
    if (isFloating(this.element)) {
      this.view.position.y = FLOAT.height + Math.sin(t * FLOAT.speed + this.seg) * FLOAT.amp;
    } else if (!this.view.userData.mixer) {
      const body = this.view.userData.body as THREE.Mesh | undefined;
      if (body && !this.def.flying) body.position.y = this.def.radius + Math.abs(Math.sin(t * 6 + this.seg)) * 0.15;
    }
  }

  /** 내장 애니메이션 컨트롤러 (모델 로드 성공 시에만 존재). */
  private get anim(): import('../render/ModelLoader').AnimController | undefined {
    return this.view.userData.anim as import('../render/ModelLoader').AnimController | undefined;
  }

  /** 공격 순간 1회성 공격 클립 재생 (Punch/Bite/Headbutt). */
  playAttackAnim(): void {
    this.anim?.playOnce('attack');
  }

  /** 사망 클립 재생 시작. 반환: 클립 길이(초), 없으면 0. */
  beginDeath(): number {
    return this.anim?.playDeath() ?? 0;
  }

  /** 경로 진행 비율 0~1 (선두 판정용) */
  progress(): number {
    return (this.seg + this.segT) / (PATH.length - 1);
  }

  /**
   * 보스 루프백 (§9): 기지를 타격한 보스는 소멸하지 않고 경로 시작점으로 되돌아온다.
   * "보스 통과 = 승리" 버그 방지 + 보스전은 반드시 처치로 끝나게.
   */
  resetToPathStart(): void {
    this.seg = 0;
    this.segT = 0;
    this.reachedBase = false;
    this.alive = true;
    this.atBase = false;
    // 상태 초기화 — 부활 보스가 이전 기절/속박/감속/표식을 안고 되살아나 좀비/스톨/도트순삭되던 버그 방지.
    this.stunned = false;
    this.stunTimer = 0;
    this.rootTimer = 0;
    this.slowTimer = 0;
    this.slowPct = 0;
    this.zoneSlow = 0;
    this.defDownTimer = 0;
    this.marks.clearDebuffs();
    const start = PATH[0];
    this.pos.set(start.x, 0, start.z);
    this.view.position.copy(this.pos);
  }

  /** 넉백: 경로를 따라 뒤로 dist만큼 밀려남. 보스/미니보스는 반감(CC 저항) — 무한 스톨 방지. */
  knockback(dist: number): void {
    // 공성 중 밀려나면 성문에서 이탈 → 다시 진격(공성 재개는 재도달 시).
    this.atBase = false;
    // 마지막 waypoint(기지)에 도달한 상태면 마지막 세그먼트로 클램프 (PATH[seg+1] 안전)
    if (this.seg >= PATH.length - 1) { this.seg = PATH.length - 2; this.segT = 1; }
    let back = dist * this.ccFactor;
    while (back > 0 && (this.seg > 0 || this.segT > 0)) {
      const a = PATH[this.seg];
      const b = PATH[this.seg + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const traveled = segLen * this.segT;
      if (back < traveled) {
        this.segT -= back / segLen;
        back = 0;
      } else {
        back -= traveled;
        this.seg = Math.max(0, this.seg - 1);
        this.segT = this.seg === 0 ? 0 : 1;
      }
    }
    const a = PATH[this.seg];
    const b = PATH[this.seg + 1];
    this.pos.set(a.x + (b.x - a.x) * this.segT, 0, a.z + (b.z - a.z) * this.segT);
    this.view.position.copy(this.pos);
  }

  dispose(parent: THREE.Object3D): void {
    this.marks.dispose();
    parent.remove(this.view);
    disposeCreatureView(this.view);
  }
}
