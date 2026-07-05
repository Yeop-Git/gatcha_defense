import { settings } from '../core/Settings';

export type BgmTrack = 'lobby' | 'battle';

const SOURCES: Record<BgmTrack, string> = {
  lobby: '/assets/audio/lobby.wav',
  battle: '/assets/audio/battle.wav',
};

const tracks = new Map<BgmTrack, HTMLAudioElement>();
let current: BgmTrack | null = null;

function getAudio(track: BgmTrack): HTMLAudioElement {
  let audio = tracks.get(track);
  if (audio) return audio;
  audio = new Audio(SOURCES[track]);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = bgmVolume();
  tracks.set(track, audio);
  return audio;
}

function bgmVolume(): number {
  return settings.music ? Math.max(0, Math.min(1, settings.volume * 0.55)) : 0;
}

function applyVolume(): void {
  const volume = bgmVolume();
  for (const audio of tracks.values()) audio.volume = volume;
}

function playCurrent(): void {
  if (!current || !settings.music || settings.volume <= 0) return;
  const audio = getAudio(current);
  audio.play().catch(() => {
    /* Browser autoplay policy: retried on first user input. */
  });
}

export function initBgmUnlock(): void {
  const resume = (): void => playCurrent();
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

export function setBgmTrack(track: BgmTrack): void {
  if (current === track) {
    applyVolume();
    playCurrent();
    return;
  }
  if (current) getAudio(current).pause();
  current = track;
  const audio = getAudio(track);
  audio.currentTime = audio.currentTime || 0;
  applyVolume();
  playCurrent();
}

export function updateBgmSettings(): void {
  applyVolume();
  if (!current) return;
  if (!settings.music || settings.volume <= 0) getAudio(current).pause();
  else playCurrent();
}
