import * as THREE from 'three';
import type { MarkType } from '../core/types';
import { MARK, MARK_ICON } from '../data/constants';
import { makeTextSprite } from '../render/fallback';

interface MarkInstance {
  stacks: number;
  remaining: number;
}

/**
 * ★표식 컴포넌트 (CLAUDE.md 원칙 5). 모든 속성 효과가 여기에 표식을 남기고,
 * SynergySystem이 이 표식을 읽어 협동기를 판정한다.
 * 머리 위 회전 스프라이트로 표식/중첩을 표시.
 */
export class Marks {
  private map = new Map<MarkType, MarkInstance>();
  private sprites = new Map<MarkType, THREE.Sprite>();
  private container: THREE.Object3D;
  private topY: number;

  constructor(container: THREE.Object3D, topY: number) {
    this.container = container;
    this.topY = topY;
  }

  add(type: MarkType, stacks = 1): void {
    const cfg = MARK[type];
    const cur = this.map.get(type);
    if (cur) {
      cur.stacks = Math.min(cfg.maxStacks, cur.stacks + stacks);
      cur.remaining = cfg.duration; // 갱신
    } else {
      this.map.set(type, { stacks: Math.min(cfg.maxStacks, stacks), remaining: cfg.duration });
    }
    this.refreshSprite(type);
  }

  stacks(type: MarkType): number {
    return this.map.get(type)?.stacks ?? 0;
  }

  has(type: MarkType): boolean {
    return this.map.has(type);
  }

  remove(type: MarkType): void {
    this.map.delete(type);
    const sp = this.sprites.get(type);
    if (sp) {
      this.container.remove(sp);
      (sp.material as THREE.SpriteMaterial).map?.dispose();
      sp.material.dispose();
      this.sprites.delete(type);
    }
    this.layout();
  }

  clearDebuffs(): void {
    // 정화: 아군 축복(bless) 외 디버프 제거. (적에겐 안 쓰이지만 대칭)
    for (const t of [...this.map.keys()]) if (t !== 'bless') this.remove(t);
  }

  private refreshSprite(type: MarkType): void {
    let sp = this.sprites.get(type);
    if (!sp) {
      sp = makeTextSprite(MARK_ICON[type], 0.55);
      this.container.add(sp);
      this.sprites.set(type, sp);
    }
    this.layout();
  }

  private layout(): void {
    let i = 0;
    const n = this.sprites.size;
    for (const [, sp] of this.sprites) {
      sp.position.set((i - (n - 1) / 2) * 0.55, this.topY, 0);
      i++;
    }
  }

  /** dt만큼 표식 지속시간 감소. 만료 제거. burn/overgrowth 도트는 호출측이 stacks로 계산. */
  update(dt: number, t: number): void {
    for (const [type, inst] of [...this.map]) {
      inst.remaining -= dt;
      if (inst.remaining <= 0) {
        this.remove(type);
        continue;
      }
      const sp = this.sprites.get(type);
      if (sp) sp.material.rotation = t * 2; // 회전 연출
    }
  }

  dispose(): void {
    for (const [, sp] of this.sprites) {
      this.container.remove(sp);
      (sp.material as THREE.SpriteMaterial).map?.dispose();
      sp.material.dispose();
    }
    this.sprites.clear();
    this.map.clear();
  }
}
