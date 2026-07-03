import type { Element } from '../core/types';
import { SYNERGIES, type SynergyDef } from '../data/synergies';
import { SYNERGY_COOLDOWN, ELEMENT_COLOR, OVERGROWTH_DPS } from '../data/constants';
import type { Enemy } from '../entities/Enemy';
import type { GroundZone } from '../entities/GroundZone';

/** SynergySystem이 효과를 실행할 때 필요한 전장 조작. Battle이 구현. */
export interface SynergyCtx {
  enemiesInRadius(x: number, z: number, r: number): Enemy[];
  allEnemies(): Enemy[];
  zonesNear(x: number, z: number, r: number): GroundZone[];
  aoeDamage(x: number, z: number, r: number, amount: number, element: Element, ignoreDef?: boolean): void;
  shieldAllies(pct: number): void;
  vfxRing(x: number, z: number, color: number, r: number, dur: number): void;
  vfxBurst(x: number, z: number, color: number, n: number): void;
  banner(name: string, a: Element, b: Element, x: number, z: number): void;
}

type EffectHandler = (e: Enemy, def: SynergyDef, x: number, z: number, power: number, mag: number, ctx: SynergyCtx) => void;

/**
 * 협동기 판정 = 표식(트리거) + 반응 속성 공격. 단일 규칙으로 모든 조합 처리 (CLAUDE.md 원칙 5).
 * 조합별 하드코딩 금지 — 아래 detection 루프는 SYNERGIES 데이터만 읽는다.
 * 효과 실행만 effect 키별 핸들러로 분기.
 */
export class SynergySystem {
  private cooldowns = new Map<string, number>();

  update(dt: number): void {
    for (const [k, v] of this.cooldowns) {
      const nv = v - dt;
      if (nv <= 0) this.cooldowns.delete(k);
      else this.cooldowns.set(k, nv);
    }
  }

  /**
   * 반응 속성 공격이 적에게 적중했을 때 호출. 조건 맞는 협동기를 발동.
   * @param reaction 공격 속성
   * @param unitStage 공격 유닛의 진화 단계
   * @param power 공격력(효과 스케일 기준)
   */
  onReaction(e: Enemy, reaction: Element, unitStage: number, power: number, ctx: SynergyCtx): void {
    for (const def of SYNERGIES) {
      if (def.reaction !== reaction) continue;
      if (this.cooldowns.has(def.id)) continue;
      // 트리거 표식 확인
      const need = def.trigger.minStacks ?? 1;
      if (e.marks.stacks(def.trigger.mark) < need) continue;
      // 등급 게이트
      if (unitStage < def.minStage) continue;
      if (unitStage === 1 && !def.weakAtStage1) continue;

      const mag = unitStage === 1 && def.weakAtStage1 ? 0.5 : 1; // 1단끼리 약화판
      this.cooldowns.set(def.id, SYNERGY_COOLDOWN);
      const handler = HANDLERS[def.effect];
      if (handler) {
        handler(e, def, e.pos.x, e.pos.z, power, mag, ctx);
        ctx.banner(def.name, def.a, def.b, e.pos.x, e.pos.z);
      }
      if (def.consumesTrigger) e.marks.remove(def.trigger.mark);
    }
  }
}

const HANDLERS: Record<string, EffectHandler> = {
  // 들불: 풀 장판 → 화염 장판 변환 + 광역 화상 + 폭발 피해 (장판 소모)
  wildfire: (e, _d, x, z, power, mag, ctx) => {
    const zones = ctx.zonesNear(x, z, 4).filter((zn) => zn.kind === 'overgrowth' || zn.kind === 'thorn');
    zones.forEach((zn) => zn.igniteToFire(OVERGROWTH_DPS * 2.5 * mag));
    ctx.aoeDamage(x, z, 3.2, power * 1.5 * mag, 'fire');
    ctx.enemiesInRadius(x, z, 3.2).forEach((en) => en.marks.add('burn', 3));
    ctx.vfxRing(x, z, 0xe8632c, 5, 0.5);
    ctx.vfxBurst(x, z, 0xe8632c, 20);
  },
  // 무성한 성장: 풀 장판 확대 + 강화 (감속↑, 지속 리셋 없음)
  lushGrowth: (_e, _d, x, z, _power, mag, ctx) => {
    const zones = ctx.zonesNear(x, z, 4).filter((zn) => zn.kind === 'overgrowth');
    zones.forEach((zn) => zn.amplify(1.0 * mag, 0.15 * mag));
    ctx.enemiesInRadius(x, z, 3).forEach((en) => en.marks.add('overgrowth', 1));
    ctx.vfxRing(x, z, 0x6fae4c, 4, 0.6);
    ctx.vfxBurst(x, z, 0x6fae4c, 12);
  },
  // 일월식(3단 전용): 저주 5중첩 표식 폭발 + 전체 방깎 + 아군 보호막
  eclipse: (_e, _d, x, z, power, _mag, ctx) => {
    for (const en of ctx.allEnemies()) {
      const cs = en.marks.stacks('curse');
      if (cs > 0) {
        en.applyDamage(power * 2 + cs * 20, true);
        en.defDownPct = 0.4;
        en.defDownTimer = 6;
        en.marks.remove('curse');
        ctx.vfxBurst(en.pos.x, en.pos.z, 0x4a4e9e, 10);
      }
    }
    ctx.shieldAllies(0.1);
    ctx.vfxRing(x, z, 0xf2ce6b, 9, 0.9);
    ctx.vfxRing(x, z, 0x4a4e9e, 7, 0.9);
  },
  // 증기 장막: 젖음 소모 → 안개(감속 장판 근사)
  steamVeil: (_e, _d, x, z, _power, mag, ctx) => {
    ctx.enemiesInRadius(x, z, 3).forEach((en) => {
      en.zoneSlow = Math.min(0.7, en.zoneSlow + 0.4 * mag);
    });
    ctx.vfxBurst(x, z, 0xd7e6ea, 16);
    ctx.vfxRing(x, z, 0xd7e6ea, 4, 0.6);
  },
  // 저주받은 덩굴: 속박 적에 어둠 → 저주 추가
  cursedVine: (e, _d, x, z, _power, mag, ctx) => {
    ctx.enemiesInRadius(x, z, 2.6).forEach((en) => en.marks.add('curse', Math.round(2 * mag)));
    ctx.vfxBurst(x, z, ELEMENT_COLOR.dark, 10);
  },
  // 검은 불꽃: 저주 적에 불 → 방어 무시 추가 피해
  blackFlame: (e, _d, x, z, power, mag, ctx) => {
    e.applyDamage(power * 0.8 * mag, true);
    ctx.vfxBurst(x, z, 0x2a1a3a, 12);
  },
};
