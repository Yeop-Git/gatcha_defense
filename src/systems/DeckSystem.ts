import { CARD_BY_ID, type CardDef } from '../data/cards';
import { HAND_SIZE } from '../data/constants';
import { bus } from '../core/events';

/** 카드 패 + 마나 관리. 카드 효과 실행은 Battle이 담당(전장 접근 필요). */
export class DeckSystem {
  hand: string[] = [];
  mana: number;
  manaMax: number;
  private regen: number;
  /** 추가 마나 재생 (풀 유닛 마나 펌핑 등) — Battle이 매 프레임 세팅 */
  bonusRegen = 0;
  /** 카드별 재사용 쿨다운 (응급 처치 등) */
  private cooldowns = new Map<string, { remain: number; max: number }>();

  constructor(manaMax: number, regen: number) {
    this.manaMax = manaMax;
    this.mana = manaMax;
    this.regen = regen;
  }

  setCooldown(id: string, sec: number): void {
    this.cooldowns.set(id, { remain: sec, max: sec });
  }

  /** 카드 쿨다운 진행률 0~1 (오버레이 표시용) */
  cdFrac(id: string): number {
    const cd = this.cooldowns.get(id);
    return cd ? cd.remain / cd.max : 0;
  }

  updateCooldowns(dt: number): void {
    for (const [id, cd] of this.cooldowns) {
      cd.remain -= dt;
      if (cd.remain <= 0) {
        this.cooldowns.delete(id);
        bus.emit('mana:change', { mana: this.mana, max: this.manaMax }); // 손패 재렌더
      }
    }
  }

  /** 스테이지 시작: 카드풀에서 랜덤 N장 (중복 허용 안 함, 부족하면 있는 만큼) */
  drawHand(pool: string[], size = HAND_SIZE): void {
    const uniq = [...new Set(pool)];
    // 풀이 손패보다 크면 셔플 후 상위 N, 작으면 전체
    const shuffled = uniq.slice().sort(() => Math.random() - 0.5);
    this.hand = shuffled.slice(0, size);
    bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
  }

  def(id: string): CardDef {
    return CARD_BY_ID[id];
  }

  canPlay(id: string): boolean {
    const d = CARD_BY_ID[id];
    return !!d && this.mana >= d.cost && this.hand.includes(id) && this.cdFrac(id) <= 0;
  }

  /** 사용 성공 시 손패에서 제거 + 마나 차감 */
  consume(id: string): boolean {
    if (!this.canPlay(id)) return false;
    const d = CARD_BY_ID[id];
    this.mana -= d.cost;
    const i = this.hand.indexOf(id);
    if (i >= 0) this.hand.splice(i, 1);
    bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
    return true;
  }

  addToHand(id: string): void {
    this.hand.push(id);
  }

  /** 손패를 size까지 보충 (덱풀에서, 손패에 없는 카드로). 웨이브 사이 카드 고갈 방지. */
  refillTo(pool: string[], size: number): void {
    const uniq = [...new Set(pool)].filter((c) => !this.hand.includes(c));
    while (this.hand.length < size && uniq.length) {
      const pick = uniq.splice(Math.floor(Math.random() * uniq.length), 1)[0];
      this.hand.push(pick);
    }
    bus.emit('mana:change', { mana: this.mana, max: this.manaMax }); // 손패 재렌더 트리거
  }

  regenMana(dt: number): void {
    const before = this.mana;
    this.mana = Math.min(this.manaMax, this.mana + (this.regen + this.bonusRegen) * dt);
    if (Math.floor(before) !== Math.floor(this.mana)) {
      bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
    }
  }
}
