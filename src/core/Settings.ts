/**
 * 게임 설정 (localStorage 영속). 효과음/음량/기본 전투속도.
 * 순수 데이터 — UI(설정 모달)와 Sfx가 참조한다.
 */
export interface GameSettings {
  sfx: boolean;
  music: boolean;
  volume: number; // 0~1
  speed: 1 | 2 | 3;
}

const KEY = 'mk_settings_v1';

const DEFAULTS: GameSettings = { sfx: true, music: true, volume: 0.7, speed: 1 };

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      sfx: typeof p.sfx === 'boolean' ? p.sfx : DEFAULTS.sfx,
      music: typeof p.music === 'boolean' ? p.music : DEFAULTS.music,
      volume: typeof p.volume === 'number' ? Math.max(0, Math.min(1, p.volume)) : DEFAULTS.volume,
      speed: p.speed === 1 || p.speed === 2 || p.speed === 3 ? p.speed : DEFAULTS.speed,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: GameSettings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 저장 실패 무시 */
  }
}
