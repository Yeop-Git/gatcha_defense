import type { CardTarget, Element, ElementOrNeutral, MarkType } from '../core/types';
import rawCsv from './skills.csv?raw';

export type CardElement = Element | 'normal';
export type DeckCharacter = 'hero' | Element | `e_${Element}`;

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
  | { kind: 'rally' }
  | { kind: 'baseHeal'; amount: number }
  | { kind: 'overheat'; mult: number; duration: number }
  | { kind: 'draw'; n: number }
  | { kind: 'coinflip' }
  | { kind: 'bind'; radius: number; duration: number }
  | { kind: 'haste'; mult: number; duration: number }
  | { kind: 'manaGain'; amount: number }
  | { kind: 'fear'; radius: number; duration: number }
  | { kind: 'block'; radius: number; duration: number; element: Element; slow?: number; dps?: number }
  | { kind: 'capture'; radius: number };

export interface CardDef {
  id: string;
  character: DeckCharacter;
  name: string;
  element: CardElement;
  learnLevel: number;
  cost: number;
  target: CardTarget;
  text: string;
  effect: CardEffect;
  branch?: 'A' | 'B';
}

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
  const realEl = (cardEl === 'normal' ? 'fire' : cardEl) as Element;
  const mark = p.mark as MarkType | undefined;
  switch (kind) {
    case 'damage': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 1), element: el, mark, markStacks: opt(p, 'markStacks'), knockback: opt(p, 'knockback') };
    case 'chain': return { kind, amount: num(p, 'amount'), targets: num(p, 'targets', 3), element: el, mark, markStacks: opt(p, 'markStacks') };
    case 'zone': return { kind, zone: p.zone as 'slow' | 'fire' | 'thorn' | 'overgrowth', radius: num(p, 'radius', 2), duration: num(p, 'duration', 5), element: realEl, slow: opt(p, 'slow'), dps: opt(p, 'dps'), root: opt(p, 'root') };
    case 'shieldAll': return { kind, pct: num(p, 'pct', 0.1) };
    case 'healAll': return { kind, amount: num(p, 'amount') };
    case 'markArea': return { kind, mark: mark ?? 'curse', stacks: num(p, 'stacks', 1), radius: num(p, 'radius', 2), element: realEl };
    case 'defDown': return { kind, pct: num(p, 'pct', 0.3), duration: num(p, 'duration', 6), radius: num(p, 'radius', 2), element: realEl };
    case 'drain': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 2), element: realEl, drainPct: num(p, 'drainPct', 0.5) };
    case 'eclipseVerdict': return { kind, radius: num(p, 'radius', 3), executePct: num(p, 'executePct', 0.2) };
    case 'blessOne': return { kind, stacks: num(p, 'stacks', 2) };
    case 'cleanseHeal': return { kind, amount: num(p, 'amount') };
    case 'judgment': return { kind, amount: num(p, 'amount'), radius: num(p, 'radius', 2), darkBonus: num(p, 'darkBonus', 1.5) };
    case 'rally': return { kind };
    case 'baseHeal': return { kind, amount: num(p, 'amount', 25) };
    case 'overheat': return { kind, mult: num(p, 'mult', 2), duration: num(p, 'duration', 8) };
    case 'draw': return { kind, n: num(p, 'n', 1) };
    case 'coinflip': return { kind };
    case 'bind': return { kind, radius: num(p, 'radius', 2.6), duration: num(p, 'duration', 2.5) };
    case 'haste': return { kind, mult: num(p, 'mult', 1.3), duration: num(p, 'duration', 6) };
    case 'manaGain': return { kind, amount: num(p, 'amount', 4) };
    case 'fear': return { kind, radius: num(p, 'radius', 2.6), duration: num(p, 'duration', 2) };
    case 'block': return { kind, radius: num(p, 'radius', 2.4), duration: num(p, 'duration', 5), element: realEl, slow: opt(p, 'slow'), dps: opt(p, 'dps') };
    case 'capture': return { kind, radius: num(p, 'radius', 1.4) };
    default: return { kind: 'damage', amount: 10, radius: 1, element: el };
  }
}

function parseCsv(csv: string): CardDef[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: CardDef[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map((part) => part.trim());
    const [id, character, name, element, learn, cost, target, kind, params, branch, ...textParts] = c;
    const text = textParts.join(',').trim();
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
      branch: branch === 'A' || branch === 'B' ? branch : undefined,
    });
  }
  return out;
}

export const CARDS: CardDef[] = parseCsv(rawCsv);
export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function cardsOfCharacter(character: DeckCharacter): CardDef[] {
  return CARDS.filter((c) => c.character === character).sort((a, b) => a.learnLevel - b.learnLevel);
}

const ELEMENT_BADGE: Record<CardElement, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  light: '✨',
  dark: '🌙',
  normal: '⚪',
};

export function cardIcon(def: CardDef): string {
  switch (def.effect.kind) {
    case 'cleanseHeal': return '💚';
    case 'healAll':
    case 'baseHeal': return '🩹';
    case 'shieldAll': return '🛡️';
    case 'blessOne': return '🌟';
    case 'judgment': return '☀️';
    case 'rally': return '🔄';
    case 'draw': return '🃏';
    case 'coinflip': return '🪙';
    case 'bind': return '🕸️';
    case 'capture': return '🔮';
    case 'haste': return '💨';
    case 'manaGain': return '🌊';
    case 'fear': return '😱';
    case 'block': return '🧱';
    case 'overheat': return '♨️';
    case 'drain': return '🩸';
    case 'defDown': return '💢';
    case 'markArea': return ELEMENT_BADGE[def.element] ?? '🔖';
    case 'eclipseVerdict': return '🌑';
    case 'zone': return '🌀';
    case 'chain': return '⚡';
    case 'damage': return ELEMENT_BADGE[def.element];
    default: return ELEMENT_BADGE[def.element] ?? '❔';
  }
}

export function cardRole(def: CardDef): string {
  switch (def.effect.kind) {
    case 'damage':
    case 'chain':
    case 'judgment':
    case 'eclipseVerdict': return '공격';
    case 'zone':
    case 'markArea':
    case 'defDown':
    case 'fear':
    case 'block':
    case 'bind': return '제어';
    case 'manaGain': return '운영';
    case 'healAll':
    case 'cleanseHeal':
    case 'shieldAll':
    case 'baseHeal':
    case 'blessOne':
    case 'haste':
    case 'overheat': return '지원';
    case 'draw':
    case 'coinflip':
    case 'rally': return '운영';
    case 'capture': return '포획';
    case 'drain': return '흡수';
    default: return '기술';
  }
}

export function cardTargetLabel(def: CardDef): string {
  switch (def.target) {
    case 'point': return '지점';
    case 'enemy-area': return '범위';
    case 'ally-all': return '전체';
    case 'ally-one': return '단일';
    case 'self': return '자신';
    default: return '대상';
  }
}

export function cardMeta(def: CardDef): string {
  return `${cardRole(def)} · ${cardTargetLabel(def)} · Lv${def.learnLevel}`;
}
