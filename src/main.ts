import { Game } from './core/Game';
import { state } from './core/GameState';
import { initAudioUnlock } from './audio/Sfx';
import { initBgmUnlock } from './audio/Bgm';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

// 브라우저 자동재생 정책: 첫 사용자 입력에서 오디오 컨텍스트 잠금 해제
initAudioUnlock();
initBgmUnlock();

// 앱 부트스트랩
const game = new Game(canvas, uiRoot);

// dev 전용 디버그 훅 — 플레이테스트/검증용 (프로덕션 번들에서는 제외됨)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__mk = { game, state };
}
