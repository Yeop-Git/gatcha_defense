import type { Element } from './types';

/**
 * 영속 도감(컬렉션) — 런과 무관하게 localStorage에 누적. 엔드컨텐츠(전 종 수집).
 * 크리처: 소유/진화한 (속성,단계) 조합. 적: 조우(스폰)/포획한 species.
 */
interface DexData { creatures: string[]; enemies: string[] }

const KEY = 'mk_dex_v1';

function load(): DexData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { creatures: [], enemies: [] };
    const p = JSON.parse(raw) as Partial<DexData>;
    return { creatures: Array.isArray(p.creatures) ? p.creatures : [], enemies: Array.isArray(p.enemies) ? p.enemies : [] };
  } catch {
    return { creatures: [], enemies: [] };
  }
}

const data = load();
const cSet = new Set(data.creatures);
const eSet = new Set(data.enemies);

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ creatures: [...cSet], enemies: [...eSet] })); } catch { /* 무시 */ }
}

export const creatureKey = (el: Element, stage: number): string => `${el}${stage}`;

export function unlockCreature(el: Element, stage: number): void {
  const k = creatureKey(el, stage);
  if (!cSet.has(k)) { cSet.add(k); save(); }
}
export function unlockEnemy(species: string): void {
  if (!eSet.has(species)) { eSet.add(species); save(); }
}
export function hasCreature(el: Element, stage: number): boolean { return cSet.has(creatureKey(el, stage)); }
export function hasEnemy(species: string): boolean { return eSet.has(species); }
export function dexCounts(): { creatures: number; enemies: number } { return { creatures: cSet.size, enemies: eSet.size }; }
