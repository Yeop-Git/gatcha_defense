import { CARD_BY_ID, type CardDef } from '../data/cards';
import { HAND_SIZE } from '../data/constants';
import { bus } from '../core/events';

const shuffle = <T>(items: T[]): T[] => {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * 카드 손패, 드로우 더미, 버린 더미, 마나를 관리한다.
 * 전투 로직은 Battle이 담당하고, 이 클래스는 덱 순환 규칙만 책임진다.
 */
export class DeckSystem {
  hand: string[] = [];
  mana: number;
  manaMax: number;
  private regen: number;
  private drawPile: string[] = [];
  private discardPile: string[] = [];
  bonusRegen = 0;
  private cooldowns = new Map<string, { remain: number; max: number }>();

  constructor(manaMax: number, regen: number) {
    this.manaMax = manaMax;
    this.mana = manaMax;
    this.regen = regen;
  }

  setCooldown(id: string, sec: number): void {
    this.cooldowns.set(id, { remain: sec, max: sec });
  }

  cdFrac(id: string): number {
    const cd = this.cooldowns.get(id);
    return cd ? cd.remain / cd.max : 0;
  }

  updateCooldowns(dt: number): void {
    for (const [id, cd] of this.cooldowns) {
      cd.remain -= dt;
      if (cd.remain <= 0) {
        this.cooldowns.delete(id);
        bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
      }
    }
  }

  drawHand(pool: string[], size = HAND_SIZE): void {
    this.hand = [];
    this.discardPile = [];
    this.drawPile = shuffle(this.uniqueDeck(pool));
    this.drawCards(size);
  }

  def(id: string): CardDef {
    return CARD_BY_ID[id];
  }

  get drawCount(): number {
    return this.drawPile.length;
  }

  get discardCount(): number {
    return this.discardPile.length;
  }

  canPlay(id: string): boolean {
    const d = CARD_BY_ID[id];
    return !!d && this.mana >= d.cost && this.hand.includes(id) && this.cdFrac(id) <= 0;
  }

  consume(id: string): boolean {
    if (!this.canPlay(id)) return false;
    const d = CARD_BY_ID[id];
    this.mana -= d.cost;
    const i = this.hand.indexOf(id);
    if (i >= 0) this.hand.splice(i, 1);
    this.discardPile.push(id);
    bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
    return true;
  }

  drawCards(count: number): void {
    for (let k = 0; k < count; k++) {
      const next = this.drawOne();
      if (!next) break;
      if (!this.hand.includes(next)) this.hand.push(next);
    }
    bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
  }

  refillTo(pool: string[], size: number): void {
    this.syncDeck(pool);
    while (this.hand.length < size) {
      const before = this.hand.length;
      this.drawCards(1);
      if (this.hand.length === before) break;
    }
  }

  regenMana(dt: number): void {
    const before = this.mana;
    this.mana = Math.min(this.manaMax, this.mana + (this.regen + this.bonusRegen) * dt);
    if (Math.floor(before) !== Math.floor(this.mana)) {
      bus.emit('mana:change', { mana: this.mana, max: this.manaMax });
    }
  }

  private drawOne(): string | null {
    if (this.drawPile.length === 0) this.reshuffleDiscard();
    return this.drawPile.pop() ?? null;
  }

  private reshuffleDiscard(): void {
    if (this.discardPile.length === 0) return;
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = [];
    bus.emit('toast', { text: '덱을 다시 섞었습니다.', kind: 'info' });
  }

  private syncDeck(pool: string[]): void {
    const allowed = new Set(this.uniqueDeck(pool));
    this.hand = this.hand.filter((id) => allowed.has(id));
    this.drawPile = this.drawPile.filter((id) => allowed.has(id) && !this.hand.includes(id));
    this.discardPile = this.discardPile.filter((id) => allowed.has(id) && !this.hand.includes(id));
    const known = new Set([...this.hand, ...this.drawPile, ...this.discardPile]);
    const missing = [...allowed].filter((id) => !known.has(id));
    this.drawPile.push(...shuffle(missing));
  }

  private uniqueDeck(pool: string[]): string[] {
    return [...new Set(pool)].filter((id) => !!CARD_BY_ID[id]);
  }
}
