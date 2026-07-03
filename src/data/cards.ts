import type { CardTarget, Element, ElementOrNeutral, MarkType } from '../core/types';
import rawCsv from './skills.csv?raw';

/** 카드(스킬) 속성: 5속성 + 무속성(주인공) */
export type CardElement = Element | 'normal';
/** 덱을 소유하는 캐릭터 키 */
export type DeckCharacter = 'hero' | Element;

/**
 * 카드 효과 = 선언적 데이터. Battle이 kind를 해석해 실행. 조합별 하드코딩 없음.
 * (skills.csv에서 파싱되어 생성)
 */
export type CardEffect =
  | { kind: 'damage'; amount: number; radius: number; element: ElementOrNeutral; mark?: MarkType; markStacks?: number; knockback?: number }
  | { kind: 'chain'; amount: number; targets: number; element: ElementOrNeutral; mark?: MarkType; markStacks?: number }
  | { kind: 'zone'; zone: 'slow' | 'fire' | 'thorn' | 'overgrowth'; radius: number; duration: number; element: Element; slow?: number; dps?: number; root?: number }
  | { kind: 'shieldAll'; pct: number }
  | { kind: 'healAll'; amount: number }
  | { kind: 'markArea'; mark: MarkType; stacks: number; radius: number; element: Element }
  | { kind: 'defDown'; pct: number; duration: number; radius: number; element: Element }
  | { kind: 'drain'; amount: number; radius: number; element: Element; drainPct: number }
  | { kind: 'eclipseVerdict'; radius: number; executePct: number }
  | { kind: 'blessOne'; stacks: number }
  | { kind: 'cleanseHeal'; amount: number }
  | { kind: 'judgment'; amount: number; radius: number; darkBonus: number }
  | { kind: 'revive' }
  | { kind: 'overheat'; mult: number; duration: number }
  | { kind: 'draw'; n: number }
  | { kind: 'placementUp'; n: number }
  | { kind: 'coinflip' };

export interface CardDef {
  id: string;
  character: DeckCharacter;
  name: string;
  element: CardElement;
  /** 학습 레벨: 이 레벨 이상이면 사용 가능(해금) */
  learnLevel: number;
  cost: number;
  target: CardTarget;
  text: string;
  effect: CardEffect;
}

// ── CSV 파싱 ─────────────────────────────────────────
type Params = Record<string, string>;

function parseParams(s: string): Params {
  const p: Params = {};
  if (!s) return p;
  for (const kv of s.split(';')) {
    const [k, v] = kv.split('=');
    if (k) p[k.trim()] = (v ?? '').trim();
  }
  return p;
}

const num = (p: Params, k: string, d = 0): number => (p[k] !== undefined ? Number(p[k]) : d);
const opt = (p: Params, k: string): number | undefined => (p[k] !== undefined ? Number(p[k]) : undefined);

function buildEffect(kind: string, p: Params, cardEl: CardElement): CardEffect {
  const el: ElementOrNeutral = cardEl === 'normal' ? 'neutral' : cardEl;
  const realEl = (cardEl === 'normal' ? 'fire' : cardEl) as Element; // zone/markArea 등은 실제 속성만 사용
  const mark = p.mark as MarkType | undefined;
  switch (kind) {
    case 'damage': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 1), element: el, mark, markStacks: opt(p, 'markStacks'), knockback: opt(p, 'knockback') };
    case 'chain': return { kind, amount: num(p, 'amount'), targets: num(p, 'targets', 3), element: el, mark, markStacks: opt(p, 'markStacks') };
    case 'zone': return { kind, zone: (p.zone as 'slow' | 'fire' | 'thorn' | 'overgrowth'), radius: num(p, 'radius', 2), duration: num(p, 'duration', 5), element: realEl, slow: opt(p, 'slow'), dps: opt(p, 'dps'), root: opt(p, 'root') };
    case 'shieldAll': return { kind, pct: num(p, 'pct', 0.1) };
    case 'healAll': return { kind, amount: num(p, 'amount') };
    case 'markArea': return { kind, mark: mark ?? 'curse', stacks: num(p, 'stacks', 1), radius: num(p, 'radius', 2), element: realEl };
    case 'defDown': return { kind, pct: num(p, 'pct', 0.3), duration: num(p, 'duration', 6), radius: num(p, 'radius', 2), element: realEl };
    case 'drain': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 2), element: realEl, drainPct: num(p, 'drainPct', 0.5) };
    case 'eclipseVerdict': return { kind, radius: num(p, 'radius', 3), executePct: num(p, 'executePct', 0.2) };
    case 'blessOne': return { kind, stacks: num(p, 'stacks', 2) };
    case 'cleanseHeal': return { kind, amount: num(p, 'amount') };
    case 'judgment': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 2), darkBonus: num(p, 'darkBonus', 1.5) };
    case 'revive': return { kind };
    case 'overheat': return { kind, mult: num(p, 'mult', 2), duration: num(p, 'duration', 8) };
    case 'draw': return { kind, n: num(p, 'n', 1) };
    case 'placementUp': return { kind, n: num(p, 'n', 1) };
    case 'coinflip': return { kind };
    default: return { kind: 'damage', amount: 10, radius: 1, element: el };
  }
}

function parseCsv(csv: string): CardDef[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: CardDef[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const [id, character, name, element, learn, cost, target, kind, params, ...textParts] = c;
    const text = textParts.join(',');
    out.push({
      id,
      character: character as DeckCharacter,
      name,
      element: element as CardElement,
      learnLevel: Number(learn),
      cost: Number(cost),
      target: target as CardTarget,
      text,
      effect: buildEffect(kind, parseParams(params), element as CardElement),
    });
  }
  return out;
}

export const CARDS: CardDef[] = parseCsv(rawCsv);
export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/**
 * 포획 카드 — 손패에 항상 고정(핀)되는 특수 카드. 마나 0, 무속성.
 * 덱 셔플/소모 대상이 아니며 Battle이 모드(모집/속박)에 따라 특수 처리한다.
 * effect는 형식상 값(실제 실행은 Battle.playCapture).
 */
export const CAPTURE_CARD_ID = 'capture';
CARD_BY_ID[CAPTURE_CARD_ID] = {
  id: CAPTURE_CARD_ID,
  character: 'hero',
  name: '포획',
  element: 'normal',
  learnLevel: 1,
  cost: 0,
  target: 'point',
  text: '야생 몬스터 포획 (동료 최대 3)',
  effect: { kind: 'coinflip' },
};

/** 캐릭터의 전체 스킬 (20개) */
export function cardsOfCharacter(character: DeckCharacter): CardDef[] {
  return CARDS.filter((c) => c.character === character).sort((a, b) => a.learnLevel - b.learnLevel);
}

const ELEM_FALLBACK: Record<CardElement, string> = {
  fire: '🔥', water: '💧', grass: '🌿', light: '✨', dark: '🌑', normal: '⚪',
};

/**
 * 카드별 가장 적절한 이모지 아이콘. 우선순위: 상징(전설) → 효과 종류 → 공격 속성/이름 키워드.
 * 데이터 추가 없이 이름/효과에서 유도(모든 카드 커버, 누락 없음).
 */
export function cardIcon(def: CardDef): string {
  const n = def.name;
  if (def.id === CAPTURE_CARD_ID) return '🎯';

  // 1) 상징(전설/궁극) 이름
  if (/구미염|여우/.test(n)) return '🦊';
  if (/수호록|사슴/.test(n)) return '🦌';
  if (/해룡|해신/.test(n)) return '🐉';
  if (/불사조/.test(n)) return '🦅';
  if (/세라핌/.test(n)) return '👼';
  if (/이클립사/.test(n)) return '🌘';

  // 2) 효과 종류 (가장 안정적)
  switch (def.effect.kind) {
    case 'healAll': return '💚';
    case 'shieldAll': return '🛡️';
    case 'cleanseHeal': return '🙏';
    case 'blessOne': return '😇';
    case 'judgment': return '⚖️';
    case 'revive': return '🕊️';
    case 'draw': return '🃏';
    case 'coinflip': return '🪙';
    case 'placementUp': return '🚩';
    case 'overheat': return '♨️';
    case 'drain': return '🩸';
    case 'defDown': return '💢';
    case 'markArea': return def.element === 'dark' ? '💀' : '❄️';
    case 'eclipseVerdict': return '🌘';
  }

  // 3) 공격(damage/chain/zone) — 특수 플레이버 → 속성/이름
  if (/운석|혜성/.test(n)) return '☄️';
  if (/화산|분화구/.test(n)) return '🌋';
  switch (def.element) {
    case 'fire': return '🔥';
    case 'water':
      if (/해일|파도|쓰나미|물결/.test(n)) return '🌊';
      if (/서리|냉기|얼음|심해|소용돌이|늪|웅덩이|장판|지대/.test(n)) return '❄️';
      return '💦';
    case 'grass':
      if (/씨앗|새싹/.test(n)) return '🌱';
      if (/포자/.test(n)) return '🍄';
      if (/가시|덤불|넝쿨/.test(n)) return '🌵';
      if (/숲|원시림|세계수/.test(n)) return '🌳';
      if (/덩굴|뿌리|속박/.test(n)) return '🌿';
      return '🍃';
    case 'dark':
      return /밤|장막/.test(n) ? '🌌' : '🌑';
    case 'light':
      return '✨';
  }

  // 4) 무속성 물리(베기/강타 등)
  if (/베기|참격|일격|가르기|강타|관통|사격/.test(n)) return '⚔️';
  return ELEM_FALLBACK[def.element] ?? '⚪';
}
