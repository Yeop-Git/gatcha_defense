import * as THREE from 'three';
import type { Element, ElementOrNeutral } from '../core/types';
import type { EnemyDef } from '../data/enemies';
import { FIELD, CURSE_DMG_PER_STACK, WET_SLOW, FLOAT, isFloating } from '../data/constants';
import { CORRUPT_TINT, CORRUPT_SKILL } from '../data/corrupted';
import { makeEnemy, makeCreature, makeLabelSprite, disposeCreatureView } from '../render/fallback';
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
  speed: number;
  view: THREE.Group;
  marks: Marks;
  pos = new THREE.Vector3();
  alive = true;
  reachedBase = false;
  isBoss: boolean;
  isMini: boolean;

  /**
   * 타락체 보스 (§9): 버려진 수호 몬스터의 속성. 설정 시 원본 3단 모델 + 어둠 팔레트 스왑으로
   * 렌더되고 Battle이 시그니처 스킬 AI를 돌린다.
   */
  corruptEl: Element | null = null;
  /** 타락체 시그니처 스킬 시전 주기/쿨다운 (P2에서 절반) */
  abilityInterval = 7;
  abilityCd = 3; // 첫 시전은 등장 후 잠깐 뒤

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
  atkCd = 0; // 적 반격 쿨다운 (근처 방어자 타격)

  private bar: THREE.Sprite;
  bossPhase = 1;

  constructor(def: EnemyDef, hpScale: number, corruptEl: Element | null = null) {
    this.def = def;
    this.element = def.element;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.speed = def.speed;
    this.isBoss = def.leak === 'boss';
    this.isMini = def.leak === 'miniboss';
    this.corruptEl = corruptEl;

    if (corruptEl) {
      // 타락체 = 플레이어블 3단 모델의 팔레트 스왑 (새 3D 에셋 0개, §9)
      this.view = makeCreature(corruptEl, def.radius * 1.3, 3, CORRUPT_TINT);
      this.abilityInterval = CORRUPT_SKILL[corruptEl].interval;
    } else {
      this.view = makeEnemy(this.element, def.radius, def.flying, def.model);
    }
    const start = PATH[0];
    this.pos.set(start.x, 0, start.z);
    this.view.position.copy(this.pos);

    // 시각 높이(바/표식 배치 기준): 타락체는 정규화된 크리처 높이, 그 외는 폴백 반경 기준.
    const visH = corruptEl ? 1.6 * def.radius * 1.3 : (def.flying ? def.radius + 1.2 : def.radius) * 2;
    const topY = visH + 0.4;
    this.marks = new Marks(this.view, topY);
    this.bar = makeBar();
    this.bar.position.y = topY + 0.5;
    if (this.isBoss || this.isMini) this.bar.scale.set(2.6, 0.36, 1);
    this.view.add(this.bar);
    drawBar(this.bar, 1);

    if (corruptEl) {
      // 타락체 이름표 — "내가 버린 그 아이"가 보이도록
      const lv = makeLabelSprite(def.name, { color: '#b48ae0', worldHeight: 0.6 });
      lv.position.y = topY + 1.15;
      this.view.add(lv);
    }
  }

  /** 상태이상(CC) 저항 배율 — 보스/미니보스는 넉백·속박·감속 효과 반감. */
  get ccFactor(): number {
    return this.isBoss ? 0.4 : this.isMini ? 0.5 : 1;
  }

  /** 속박 적용 (CC 저항 반영). */
  applyRoot(duration: number): void {
    this.rootTimer = Math.max(this.rootTimer, duration * this.ccFactor);
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
    if (!this.alive) return 0;
    let dmg = amount;
    // 저주: 받는 피해 +5%/중첩
    dmg *= 1 + this.marks.stacks('curse') * CURSE_DMG_PER_STACK;
    // 방깎: 받는 피해 증가로 근사
    if (!ignoreDef && this.defDownTimer > 0) dmg *= 1 + this.defDownPct;
    dmg = Math.round(dmg);
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
    drawBar(this.bar, this.hp / this.maxHp);
    return dmg;
  }

  update(dt: number, t: number): void {
    if (!this.alive) return;
    if (this.rootTimer > 0) this.rootTimer -= dt;
    if (this.slowTimer > 0) { this.slowTimer -= dt; if (this.slowTimer <= 0) this.slowPct = 0; }
    if (this.defDownTimer > 0) this.defDownTimer -= dt;
    this.marks.update(dt, t);
    // GLTF 내장 애니메이션 (걷기 등) — 감속/속박 시 재생 속도도 함께 줄어 자연스럽게
    const mixer = this.view.userData.mixer as THREE.AnimationMixer | undefined;
    if (mixer) mixer.update(dt * Math.max(0.25, this.speedMult()));

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
      this.reachedBase = true;
      this.alive = false;
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
    const start = PATH[0];
    this.pos.set(start.x, 0, start.z);
    this.view.position.copy(this.pos);
  }

  /** 넉백: 경로를 따라 뒤로 dist만큼 밀려남. 보스/미니보스는 반감(CC 저항) — 무한 스톨 방지. */
  knockback(dist: number): void {
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
