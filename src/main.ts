import { Game } from './core/Game';
import { state } from './core/GameState';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

// 앱 부트스트랩
const game = new Game(canvas, uiRoot);

// dev 전용 디버그 훅 — 플레이테스트/검증용 (프로덕션 번들에서는 제외됨)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__mk = { game, state };
}
